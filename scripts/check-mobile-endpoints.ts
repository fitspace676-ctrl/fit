#!/usr/bin/env tsx
/**
 * CI guard: every request the mobile app makes hits a route that EXISTS and
 * that a MEMBER may actually CALL (WP-17).
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS FOR
 *
 * The deleted mobile app's shop checkout called `POST /orders` — a route the API
 * has never exposed — and then polled `GET /orders/:id`, which is behind
 * `BillingRead`, a permission the `MEMBER` role does not hold. So a purchase
 * could never complete: 404 then 403, every time, for every user.
 *
 * It shipped anyway. Both controllers carry docblocks warning about exactly
 * this; nobody read them. Worse, the Maestro E2E flow for checkout was GREEN,
 * because it asserted that the UI moved to a confirmation screen rather than
 * that an order existed. A prose warning does not fail a build and a UI
 * assertion does not test a contract.
 *
 * This check is the contract test. It needs no server, no database and no
 * emulator: it reads the API's routes out of the TypeScript AST
 * (`build-route-manifest.ts`) and the mobile app's requests out of
 * `apps/mobile/lib/api/endpoints.ts`, and compares them.
 *
 * ---------------------------------------------------------------------------
 * THE ASSERTIONS
 *
 *   1. Every `ENDPOINTS` entry matches a real route — method AND path pattern.
 *      `POST /orders` fails here.
 *   2. Every entry is callable by a MEMBER — the route is `@Public()`, or every
 *      permission it requires is one MEMBER holds. `GET /orders/:id` fails here.
 *      The MEMBER set is READ from `ROLE_PERMISSIONS` in
 *      `packages/types/src/permissions.ts`, not hard-coded, so the check stays
 *      true as the permission matrix changes rather than freezing today's answer.
 *   2b. An entry that declares its own required permission must agree with the
 *      API. The manifest is authoritative; a disagreement means the table's
 *      documentation has drifted from the route it describes.
 *   3. INFORMATIONAL, never a failure: member-callable routes with no mobile
 *      consumer are listed, so API surface the app has not adopted is visible
 *      without turning every new backend route into a red build.
 *
 * A parse failure is a real failure: if `ENDPOINTS` is renamed or restructured
 * into something this cannot read, the check says so loudly instead of passing
 * an empty table.
 *
 * ---------------------------------------------------------------------------
 * WHY AN AST WALK RATHER THAN AN IMPORT
 *
 * Importing `apps/mobile/lib/api/endpoints.ts` would drag React Native into a
 * Node script, and `scripts/tsconfig.json` sets no `jsx`, so the import would be
 * error-typed and the type-aware lint rules would refuse it. WP-5 hit exactly
 * this and AST-walked `packages/ui-web/src/icon.tsx` instead; assertion 5 of
 * `scripts/check-design-tokens.ts` is the same technique. This walker is
 * deliberately shape-tolerant — flat or grouped object, array, `as const`,
 * `satisfies`, and path builders written as template literals all read the same.
 */
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import {
  buildRouteManifest,
  isCallableBy,
  memberPermissions,
  permissionValueMap,
  type RouteEntry,
} from './build-route-manifest';

const ROOT = process.cwd();
const DEFAULT_ENDPOINTS_FILE = 'apps/mobile/lib/api/endpoints.ts';
const ENDPOINTS_CONST = 'ENDPOINTS';
const ROLE = 'MEMBER';

/**
 * `--file <path>` points the check at a different table. Only for exercising the
 * guard against fixtures: a guard nobody has watched fail is a guard nobody
 * trusts, and injecting a bad entry into the real table to see the failure would
 * mean editing a file another work package owns. CI passes no argument.
 */
function endpointsFile(): string {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--file');
  const override = i >= 0 ? argv[i + 1] : undefined;
  return resolve(ROOT, override ?? DEFAULT_ENDPOINTS_FILE);
}

/** Property names an entry may use for each field; first match wins. */
const METHOD_KEYS = ['method', 'verb', 'httpMethod'];
const PATH_KEYS = ['path', 'pattern', 'route', 'url', 'pathPattern'];
const PERMISSION_KEYS = ['permission', 'permissions', 'auth', 'requires', 'requiredPermission'];

interface MobileEndpoint {
  /** Dotted key path within `ENDPOINTS`, e.g. `shop.checkout`, or `[3]` for arrays. */
  name: string;
  method: string;
  path: string;
  /**
   * What the entry itself claims it needs: permission names/values, or `public`.
   * `undefined` when the entry declares nothing, which is allowed — assertion 2
   * reads the API, not the table.
   */
  declared?: string[];
  line: number;
}

/* --------------------------------------------------------------- AST reading */

function literalText(expr: ts.Expression): string | undefined {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  return undefined;
}

function unwrap(expr: ts.Expression): ts.Expression {
  let out = expr;
  while (
    ts.isAsExpression(out) ||
    ts.isSatisfiesExpression(out) ||
    ts.isParenthesizedExpression(out) ||
    ts.isTypeAssertionExpression(out)
  ) {
    out = out.expression;
  }
  return out;
}

/**
 * A path expression as a pattern string.
 *
 * Handles a plain literal, a template literal (`` `/classes/${id}/book` `` →
 * `/classes/:id/book`), and a path builder written as an arrow function
 * returning either — all three are natural ways to write a parameterised path,
 * and refusing two of them would just push the author to a shape this cannot
 * see.
 */
function pathPattern(expr: ts.Expression): string | undefined {
  const node = unwrap(expr);

  const direct = literalText(node);
  if (direct !== undefined) return direct;

  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) {
      const e = unwrap(span.expression);
      const name = ts.isIdentifier(e)
        ? e.text
        : ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.name)
          ? e.name.text
          : 'param';
      out += `:${name}${span.literal.text}`;
    }
    return out;
  }

  if (ts.isArrowFunction(node)) {
    if (!ts.isBlock(node.body)) return pathPattern(node.body);
    for (const stmt of node.body.statements) {
      if (ts.isReturnStatement(stmt) && stmt.expression) return pathPattern(stmt.expression);
    }
  }

  return undefined;
}

/** Permission field → a list of names/values, tolerating a scalar, an array or `null`. */
function permissionList(expr: ts.Expression): string[] | undefined {
  const node = unwrap(expr);
  if (node.kind === ts.SyntaxKind.NullKeyword) return [];
  if (ts.isIdentifier(node) && node.text === 'undefined') return undefined;

  if (ts.isArrayLiteralExpression(node)) {
    const out: string[] = [];
    for (const el of node.elements) {
      const one = permissionList(el);
      if (one === undefined) return undefined;
      out.push(...one);
    }
    return out;
  }

  const text = literalText(node);
  if (text !== undefined) return text.length === 0 ? [] : [text];

  // `Permission.ClassBook` / a bare `ClassBook`.
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) return [node.name.text];
  if (ts.isIdentifier(node)) return [node.text];

  return undefined;
}

function propertyName(prop: ts.ObjectLiteralElementLike): string | undefined {
  if (!prop.name) return undefined;
  if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) return prop.name.text;
  return undefined;
}

function findProperty(obj: ts.ObjectLiteralExpression, keys: string[]): ts.Expression | undefined {
  for (const key of keys) {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      if (propertyName(prop) === key) return prop.initializer;
    }
  }
  return undefined;
}

/** `'POST /cart/checkout'` written as a single string. */
function parseCompactForm(text: string): { method: string; path: string } | undefined {
  const match = /^([A-Za-z]+)\s+(\/\S*)$/.exec(text.trim());
  if (!match?.[1] || !match[2]) return undefined;
  return { method: match[1].toUpperCase(), path: match[2] };
}

interface ParseResult {
  entries: MobileEndpoint[];
  /** Values that looked like entries but could not be read — never silently dropped. */
  unreadable: { name: string; line: number; detail: string }[];
}

/**
 * Walk an `ENDPOINTS` value into a flat list of entries.
 *
 * An object literal carrying both a method-ish and a path-ish property is an
 * entry; any other object is treated as a group and recursed into. That reads a
 * flat table, a table grouped by feature, and an array, without the table's
 * author having to know this walker exists.
 */
function collect(
  expr: ts.Expression,
  prefix: string,
  source: ts.SourceFile,
  result: ParseResult,
): void {
  const node = unwrap(expr);
  const lineOf = (n: ts.Node): number =>
    source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1;

  const compactText = literalText(node);
  if (compactText !== undefined) {
    const compact = parseCompactForm(compactText);
    if (compact && prefix) {
      result.entries.push({ name: prefix, ...compact, line: lineOf(node) });
    }
    return;
  }

  if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((el, i) => collect(el, `${prefix}[${i}]`, source, result));
    return;
  }

  if (!ts.isObjectLiteralExpression(node)) return;

  const methodExpr = findProperty(node, METHOD_KEYS);
  const pathExpr = findProperty(node, PATH_KEYS);

  if (methodExpr && pathExpr) {
    const method = literalText(unwrap(methodExpr));
    const path = pathPattern(pathExpr);
    if (method === undefined || path === undefined) {
      result.unreadable.push({
        name: prefix || '<root>',
        line: lineOf(node),
        detail:
          method === undefined
            ? 'method is not a string literal'
            : 'path is not a literal, template literal, or arrow function returning one',
      });
      return;
    }
    const permExpr = findProperty(node, PERMISSION_KEYS);
    result.entries.push({
      name: prefix || '<root>',
      method: method.toUpperCase(),
      path,
      declared: permExpr ? permissionList(permExpr) : undefined,
      line: lineOf(node),
    });
    return;
  }

  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = propertyName(prop);
    if (key === undefined) continue;
    collect(prop.initializer, prefix ? `${prefix}.${key}` : key, source, result);
  }
}

/** Read `export const ENDPOINTS = …` out of the mobile endpoint table. */
function readEndpointTable(file: string): ParseResult | null {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  let declaration: ts.Expression | undefined;
  const visit = (node: ts.Node): void => {
    if (declaration) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === ENDPOINTS_CONST &&
      node.initializer
    ) {
      declaration = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!declaration) return null;

  const result: ParseResult = { entries: [], unreadable: [] };
  collect(declaration, '', source, result);
  return result;
}

/* ------------------------------------------------------------------ matching */

/**
 * A path reduced to its shape, so `/me/service-sessions/:id/book` and
 * `/me/service-sessions/:sessionId/book` compare equal. The API and the app pick
 * their own parameter names; only the segment structure is the contract.
 */
function patternKey(path: string): string {
  const clean = path.split('?')[0]?.split('#')[0] ?? '';
  const segments = clean.split('/').filter((s) => s.length > 0);
  return `/${segments.map((s) => (s.startsWith(':') || s.startsWith('*') ? ':*' : s)).join('/')}`;
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${patternKey(path)}`;
}

function describe(route: RouteEntry): string {
  switch (route.auth.kind) {
    case 'public':
      return 'public';
    case 'permissions':
      return `requires ${(route.auth.permissions ?? []).join(' + ')}`;
    case 'roles':
      return `@Roles(${(route.auth.roles ?? []).join(', ')})`;
    case 'cross-tenant':
      return '@AllowCrossTenant (SUPER_ADMIN)';
    case 'undeclared':
      return 'declares NO authorization policy — 403 ENDPOINT_NOT_AUTHORIZED for every caller';
  }
}

/** Routes worth suggesting when an entry matched nothing: same path, or same first segment. */
function suggestions(entry: MobileEndpoint, routes: RouteEntry[]): string[] {
  const key = patternKey(entry.path);
  const head = key.split('/')[1] ?? '';

  const sameShape = routes.filter((r) => patternKey(r.path) === key);
  if (sameShape.length > 0) {
    return sameShape.map((r) => `${r.method} ${r.path}  (${describe(r)})`);
  }
  return routes
    .filter((r) => (patternKey(r.path).split('/')[1] ?? '') === head)
    .slice(0, 6)
    .map((r) => `${r.method} ${r.path}  (${describe(r)})`);
}

/* ---------------------------------------------------------------------- main */

function main(): void {
  const file = endpointsFile();
  const rel = relative(ROOT, file);
  // A `--file` fixture can live outside the repo; show its real path rather than
  // a wall of `../`.
  const relFile = rel.startsWith('..') ? file : rel;

  if (!existsSync(file)) {
    console.log(`• No mobile endpoint table yet — ${relFile} does not exist. Skipping.`);
    console.log(
      '  This check starts enforcing as soon as that file lands (WP-7); it is a no-op until then.',
    );
    return;
  }

  const manifest = buildRouteManifest();
  const member = memberPermissions();
  const valueOf = permissionValueMap();
  const byKey = new Map<string, RouteEntry>();
  const wildcardMethods = new Map<string, RouteEntry>();
  for (const route of manifest.routes) {
    byKey.set(routeKey(route.method, route.path), route);
    if (route.method === 'ALL') wildcardMethods.set(patternKey(route.path), route);
  }

  const table = readEndpointTable(file);
  if (!table) {
    console.error(`✗ ${relFile} exports no \`${ENDPOINTS_CONST}\` declaration.`);
    console.error(
      `\n  This check reads that table to verify the mobile app only calls routes that exist\n` +
        `  and that a ${ROLE} may call. Export it as \`export const ${ENDPOINTS_CONST} = { … } as const;\`\n` +
        `  with each entry carrying a \`method\` and a \`path\`.`,
    );
    process.exit(1);
  }

  if (table.unreadable.length > 0) {
    console.error(`✗ ${table.unreadable.length} entr(ies) in ${relFile} could not be read:\n`);
    for (const u of table.unreadable) {
      console.error(`  ${relFile}:${u.line}  ${u.name} — ${u.detail}`);
    }
    console.error(
      '\n  Fix: keep method and path as literals. This table is a contract read from outside the\n' +
        '  module; a computed value cannot be checked and so cannot be trusted.\n',
    );
    process.exit(1);
  }

  if (table.entries.length === 0) {
    console.error(`✗ \`${ENDPOINTS_CONST}\` in ${relFile} yielded no readable entries.`);
    console.error(
      '\n  Each entry needs a literal `method` and a `path` (a string, a template literal, or an\n' +
        '  arrow function returning one). An unreadable table must not pass silently — that is\n' +
        '  how a check stops checking.',
    );
    process.exit(1);
  }

  const missing: { entry: MobileEndpoint; hints: string[] }[] = [];
  const forbidden: { entry: MobileEndpoint; route: RouteEntry; lacking: string[] }[] = [];
  const mismatched: { entry: MobileEndpoint; route: RouteEntry; declared: string[] }[] = [];
  const used = new Set<string>();

  for (const entry of table.entries) {
    const key = routeKey(entry.method, entry.path);
    const route = byKey.get(key) ?? wildcardMethods.get(patternKey(entry.path));

    // ---- Assertion 1: the route exists.
    if (!route) {
      missing.push({ entry, hints: suggestions(entry, manifest.routes) });
      continue;
    }
    used.add(routeKey(route.method, route.path));

    // ---- Assertion 2: a MEMBER can actually call it.
    if (!isCallableBy(route, member)) {
      const lacking =
        route.auth.kind === 'permissions'
          ? (route.auth.permissions ?? []).filter((p) => !member.has(p))
          : [];
      forbidden.push({ entry, route, lacking });
      continue;
    }

    // ---- Assertion 2b: the entry's own claim agrees with the API.
    if (entry.declared !== undefined) {
      const declared = entry.declared.filter((d) => d !== 'public' && d !== 'none');
      const declaredValues = new Set(declared.map((d) => valueOf.get(d) ?? d));
      const actualValues = new Set(
        route.auth.kind === 'permissions' ? (route.auth.permissionValues ?? []) : [],
      );
      const same =
        declaredValues.size === actualValues.size &&
        [...declaredValues].every((v) => actualValues.has(v));
      if (!same) mismatched.push({ entry, route, declared });
    }
  }

  const failed = missing.length > 0 || forbidden.length > 0 || mismatched.length > 0;

  if (missing.length > 0) {
    console.error(`✗ ${missing.length} mobile endpoint(s) call a route the API does not expose:\n`);
    for (const { entry, hints } of missing) {
      console.error(`  ${relFile}:${entry.line}  ${entry.name}`);
      console.error(`    calls   ${entry.method} ${entry.path}`);
      console.error(
        hints.length > 0
          ? `    the API has: ${hints.join('\n                 ')}`
          : '    the API has nothing under that path at all.',
      );
      console.error('');
    }
    console.error(
      '  Fix: point the entry at a route in the manifest (`pnpm build:route-manifest --json`),\n' +
        '  or add the route to the API. Do NOT delete the entry to make this pass — the app\n' +
        '  would still make the call, it just would not be checked.\n',
    );
  }

  if (forbidden.length > 0) {
    console.error(`✗ ${forbidden.length} mobile endpoint(s) a ${ROLE} cannot call:\n`);
    for (const { entry, route, lacking } of forbidden) {
      console.error(`  ${relFile}:${entry.line}  ${entry.name}`);
      console.error(`    calls   ${entry.method} ${entry.path}`);
      console.error(
        `    route   ${route.file}:${route.line}  ${route.controller}.${route.handler}`,
      );
      console.error(`    policy  ${describe(route)}`);
      console.error(
        lacking.length > 0
          ? `    ${ROLE} does not hold: ${lacking.join(', ')} → 403 INSUFFICIENT_PERMISSION at runtime.`
          : `    ${ROLE} cannot satisfy this policy → 403 at runtime.`,
      );
      console.error('');
    }
    console.error(
      `  Fix: use a member-scoped route instead, or grant the permission to ${ROLE} in\n` +
        '  packages/types/src/permissions.ts if a member genuinely should hold it. This is the\n' +
        '  exact failure that `POST /orders` + `GET /orders/:id` should have produced.\n',
    );
  }

  if (mismatched.length > 0) {
    console.error(
      `✗ ${mismatched.length} mobile endpoint(s) declare a permission the API does not require:\n`,
    );
    for (const { entry, route, declared } of mismatched) {
      console.error(`  ${relFile}:${entry.line}  ${entry.name}`);
      console.error(`    calls    ${entry.method} ${entry.path}`);
      console.error(`    declares ${declared.length > 0 ? declared.join(', ') : '(public)'}`);
      console.error(`    API says ${describe(route)}   (${route.file}:${route.line})`);
      console.error('');
    }
    console.error('  Fix: the API is authoritative — correct the entry to match its route.\n');
  }

  if (failed) process.exit(1);

  // ---- Assertion 3: reverse direction, information only.
  const unconsumed = manifest.routes.filter(
    (r) => isCallableBy(r, member) && !used.has(routeKey(r.method, r.path)),
  );

  console.log(
    `✓ All ${table.entries.length} mobile endpoints exist in the API and are callable by ${ROLE}.`,
  );
  console.log(
    `  Manifest: ${manifest.routes.length} routes / ${manifest.controllerFiles} controllers · ` +
      `${manifest.routes.filter((r) => isCallableBy(r, member)).length} ${ROLE}-callable.`,
  );

  if (unconsumed.length > 0) {
    console.log(
      `\n  ${unconsumed.length} ${ROLE}-callable route(s) have no mobile consumer (informational):`,
    );
    for (const route of unconsumed) {
      console.log(`    ${route.method.padEnd(6)} ${route.path}`);
    }
    console.log('\n  Not a failure — drift the app has not adopted yet, kept visible on purpose.');
  }

  if (manifest.warnings.length > 0) {
    console.log('\n  Routes the manifest walker could not resolve:');
    for (const w of manifest.warnings) console.log(`    ${w.file}:${w.line}  ${w.detail}`);
  }
}

main();
