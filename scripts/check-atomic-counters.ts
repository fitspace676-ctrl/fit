#!/usr/bin/env tsx
/**
 * CI guard: a mutable counter or balance is never written as an absolute value.
 *
 * A counter claimed by reading it, computing `read + delta`, and writing the
 * result back loses one of two concurrent writers under Postgres' default
 * READ COMMITTED isolation — both read the same figure and both write it. The
 * safe form is to let the database do the arithmetic (`{ increment }` /
 * `{ decrement }`), guarded by a `WHERE` predicate on `updateMany` when the
 * counter has a bound, so the claim either lands or reports `count === 0`.
 *
 * The registry lives beside the columns it governs: a field marked `/// @counter`
 * in `schema.prisma` is one, so adding a counter and forgetting to register it
 * is not possible in one step. Two rules are enforced:
 *
 *   1. A registered counter may only be written via `{ increment }` /
 *      `{ decrement }` in an `update` / `updateMany` / `upsert.update`. Two writes
 *      are exempt because neither depends on a prior read: a `create` (the row
 *      does not exist yet) and a literal reset (`bookedCount: 0`,
 *      `waitlistPosition: null`) — a constant is the same constant however many
 *      writers race it.
 *   2. Any field written with `{ increment }` / `{ decrement }` must carry the
 *      marker. Incrementing a field atomically *is* the admission that it is a
 *      counter; without the marker its other write sites go unchecked.
 *
 * A deliberate exception is declared with `// atomic-counter-exempt: <reason>`
 * on the line above the property (or trailing it), so the waiver is reviewable
 * and `git blame` names its author.
 *
 * AST-based (via the TypeScript compiler) rather than textual, so the shape of
 * the write — not the spelling of the line — is what decides.
 *
 * Scope note: the rule binds a write to a model through the Prisma accessor it
 * is called on (`tx.payment.update(...)`). A conditional patch spread
 * (`...(x !== undefined ? { field: x } : {})`) is expanded and checked like any
 * other assignment. What cannot be resolved statically — an opaque spread, a
 * nested relation write, a counter living inside a JSON column — is listed under
 * REVIEW rather than failed. Those are the cases the concurrency integration
 * specs cover instead (see `docs/adr/atomic-counters.md`).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SCHEMA = resolve(ROOT, 'packages/db/prisma/schema.prisma');
const SCAN_ROOTS = ['apps', 'packages'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'generated', '.turbo', 'build']);
/** Seeds write fixtures into an empty database with no concurrent writer to race. */
const SKIP_FILES = /(^|[/\\])seed[-.a-z]*\.ts$/;
/** Prisma writes that mutate an existing row — the only ones a counter can race in. */
const MUTATIONS = new Set(['update', 'updateMany', 'upsert']);
/** The atomic arithmetic operators Prisma resolves inside the database. */
const ATOMIC_OPS = new Set(['increment', 'decrement']);
const EXEMPT = 'atomic-counter-exempt:';

/** `Payment` → `payment`: the accessor Prisma exposes a model under. */
function accessorOf(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

interface Registry {
  /** Every model in the schema, keyed by its Prisma accessor. */
  modelOf: Map<string, string>;
  /** The `/// @counter` fields of each model. */
  counters: Map<string, Set<string>>;
}

/**
 * Read the counter registry out of `schema.prisma`. A field is registered when
 * the `///` doc block immediately above it carries `@counter`.
 */
function readRegistry(): Registry {
  const modelOf = new Map<string, string>();
  const counters = new Map<string, Set<string>>();
  let model: string | null = null;
  let marked = false;

  for (const raw of readFileSync(SCHEMA, 'utf8').split('\n')) {
    const line = raw.trim();
    const opening = /^model\s+(\w+)\s*\{/.exec(line);
    if (opening) {
      model = opening[1]!;
      modelOf.set(accessorOf(model), model);
      marked = false;
      continue;
    }
    if (line === '}') {
      model = null;
      marked = false;
      continue;
    }
    if (line.startsWith('///')) {
      marked ||= line.includes('@counter');
      continue;
    }
    const field = /^(\w+)\s+\S/.exec(line);
    if (model && field && marked) {
      const set = counters.get(model) ?? new Set<string>();
      set.add(field[1]!);
      counters.set(model, set);
    }
    marked = false;
  }

  return { modelOf, counters };
}

/** Recursively collect the `.ts` sources a rule applies to (skips specs). */
function findSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findSources(full, out);
    } else if (
      entry.endsWith('.ts') &&
      !/\.(spec|int-spec)\.ts$/.test(entry) &&
      !SKIP_FILES.test(full)
    ) {
      out.push(full);
    }
  }
  return out;
}

/** The literal name of an object-literal property, or `null` when computed. */
function propertyName(prop: ts.ObjectLiteralElementLike): string | null {
  const name = prop.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

/** Find a named property on an object literal, when its value is itself one. */
function nestedObject(
  object: ts.ObjectLiteralExpression,
  key: string,
): ts.ObjectLiteralExpression | null {
  for (const prop of object.properties) {
    if (!ts.isPropertyAssignment(prop) || propertyName(prop) !== key) continue;
    return ts.isObjectLiteralExpression(prop.initializer) ? prop.initializer : null;
  }
  return null;
}

/**
 * True when a value is a constant — `0`, `-1`, `null`, `undefined`. A constant is
 * not derived from a read, so every racing writer stores the same figure and there
 * is nothing to lose. Resets (`bookedCount: 0`) and clears (`waitlistPosition:
 * null`) are the shapes this admits.
 */
function isConstant(value: ts.Expression): boolean {
  if (ts.isNumericLiteral(value)) return true;
  if (value.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isIdentifier(value) && value.text === 'undefined') return true;
  if (ts.isPrefixUnaryExpression(value) && ts.isNumericLiteral(value.operand)) return true;
  return false;
}

/** Unwrap parentheses so `(cond ? {…} : {})` is seen as the conditional it is. */
function unwrap(node: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
}

/**
 * Flatten a `data` object into the assignments it actually performs, expanding the
 * conditional patch spread the update services are written with
 * (`...(input.x !== undefined ? { x: input.x } : {})`). A spread this cannot see
 * through is returned as opaque, for the REVIEW list.
 */
function flatten(
  object: ts.ObjectLiteralExpression,
  assignments: ts.PropertyAssignment[] = [],
  opaque: ts.SpreadAssignment[] = [],
): { assignments: ts.PropertyAssignment[]; opaque: ts.SpreadAssignment[] } {
  for (const prop of object.properties) {
    if (ts.isPropertyAssignment(prop)) {
      assignments.push(prop);
      continue;
    }
    if (!ts.isSpreadAssignment(prop)) continue;

    const spread = unwrap(prop.expression);
    const branches = ts.isConditionalExpression(spread)
      ? [unwrap(spread.whenTrue), unwrap(spread.whenFalse)]
      : [spread];
    if (branches.every(ts.isObjectLiteralExpression)) {
      for (const branch of branches) {
        flatten(branch, assignments, opaque);
      }
    } else {
      opaque.push(prop);
    }
  }
  return { assignments, opaque };
}

/** True when a value is `{ increment: … }` / `{ decrement: … }`. */
function isAtomic(value: ts.Expression): boolean {
  if (!ts.isObjectLiteralExpression(value)) return false;
  return value.properties.some((p) => {
    const name = propertyName(p);
    return name !== null && ATOMIC_OPS.has(name);
  });
}

/**
 * True when the property carries an `// atomic-counter-exempt:` waiver, written
 * either on the line above it or trailing it. Both are checked because
 * TypeScript classifies a same-line comment as trailing trivia of the previous
 * token, so only accepting leading ranges would silently ignore the form most
 * people reach for first.
 */
function isExempt(prop: ts.Node, text: string): boolean {
  // Step over the separating comma so `field: x, // waiver` is seen; the scanner
  // wants the position trivia actually begins at.
  let end = prop.getEnd();
  while (text[end] === ',' || text[end] === ' ') end += 1;

  const ranges = [
    ...(ts.getLeadingCommentRanges(text, prop.getFullStart()) ?? []),
    ...(ts.getTrailingCommentRanges(text, end) ?? []),
  ];
  return ranges.some((r) => text.slice(r.pos, r.end).includes(EXEMPT));
}

interface Finding {
  file: string;
  line: number;
  detail: string;
}

interface Scan {
  /** Rule 1 — an absolute write to a registered counter. */
  absolute: Finding[];
  /** Rule 2 — an atomic write to a field carrying no marker. */
  unregistered: Finding[];
  /** Writes whose model cannot be resolved statically. */
  review: Finding[];
}

function scan(file: string, registry: Registry, found: Scan): void {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const at = (node: ts.Node): Omit<Finding, 'detail'> => ({
    file: relative(ROOT, file),
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
  });

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      inspectCall(node);
    }
    ts.forEachChild(node, visit);
  };

  function inspectCall(call: ts.CallExpression): void {
    const callee = call.expression;
    if (!ts.isPropertyAccessExpression(callee)) return;
    const operation = callee.name.text;
    if (!MUTATIONS.has(operation)) return;

    // Require `<something>.<model>.<op>(…)` so a bare `foo.update()` on a plain
    // object is never mistaken for a Prisma write.
    const receiver = callee.expression;
    if (!ts.isPropertyAccessExpression(receiver)) return;
    const model = registry.modelOf.get(receiver.name.text);
    if (!model) return;

    const [args] = call.arguments;
    if (!args || !ts.isObjectLiteralExpression(args)) return;

    // `update`/`updateMany` carry the write under `data`; `upsert` under `update`
    // (its `create` branch writes a row that does not exist yet, so it is exempt).
    const write = nestedObject(args, operation === 'upsert' ? 'update' : 'data');
    if (!write) return;

    const fields = registry.counters.get(model) ?? new Set<string>();
    const { assignments, opaque } = flatten(write);

    if (fields.size > 0) {
      for (const prop of opaque) {
        found.review.push({
          ...at(prop),
          detail: `${model}: opaque spread into \`data\` — counter fields cannot be checked here`,
        });
      }
    }

    for (const prop of assignments) {
      const field = propertyName(prop);
      if (field === null) continue;

      const atomic = isAtomic(prop.initializer);

      if (fields.has(field) && !atomic && !isConstant(prop.initializer) && !isExempt(prop, text)) {
        found.absolute.push({
          ...at(prop),
          detail: `${model}.${field} written as an absolute value`,
        });
      }

      if (atomic && !fields.has(field)) {
        found.unregistered.push({
          ...at(prop),
          detail: `${model}.${field} is incremented atomically but carries no /// @counter`,
        });
      }
    }
  }

  visit(source);
}

const registry = readRegistry();
const registered = [...registry.counters].flatMap(([model, fields]) =>
  [...fields].map((f) => `${model}.${f}`),
);

if (registered.length === 0) {
  console.error(`No /// @counter fields found in ${relative(ROOT, SCHEMA)} — is the marker gone?`);
  process.exit(1);
}

const found: Scan = { absolute: [], unregistered: [], review: [] };
const sources = SCAN_ROOTS.flatMap((dir) => findSources(resolve(ROOT, dir)));
for (const file of sources) {
  scan(file, registry, found);
}

const report = (heading: string, findings: Finding[]): void => {
  if (findings.length === 0) return;
  console.error(`${heading}\n`);
  for (const f of findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    console.error(`  ${f.file}:${f.line}  ${f.detail}`);
  }
  console.error('');
};

report('Counters written as an absolute value (lost update under concurrency):', found.absolute);
report(
  'Fields incremented atomically but missing /// @counter in schema.prisma:',
  found.unregistered,
);

if (found.review.length > 0) {
  console.log('Not statically checkable — covered by the concurrency int-specs instead:\n');
  for (const f of found.review.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    console.log(`  ${f.file}:${f.line}  ${f.detail}`);
  }
  console.log('');
}

if (found.absolute.length > 0 || found.unregistered.length > 0) {
  console.error(
    'Claim the counter instead: `updateMany({ where: { id, <field>: { gte: n } }, ' +
      'data: { <field>: { decrement: n } } })`, and treat `count === 0` as the lost race.\n' +
      'See docs/adr/atomic-counters.md. A deliberate exception needs ' +
      '`// atomic-counter-exempt: <reason>` on the property.',
  );
  process.exit(1);
}

console.log(
  `✓ All ${registered.length} registered counters are written atomically across ${sources.length} sources.`,
);
