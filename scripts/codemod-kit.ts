#!/usr/bin/env tsx
/**
 * One-shot codemod: move the admin console's legacy `@fit/ui-web` components
 * onto `@fit/ui-kit`.
 *
 * WHY THIS PARSES RATHER THAN MATCHES. The first attempt at this was a regex
 * over JSX, and it silently CHANGED WHAT THE CODE DID — it read
 * `onClick={() => setConfirmTrash(true)}` as an attribute boundary and folded
 * the handler into a `label` string. JSX nests braces, arrows and conditionals
 * inside attribute values; nothing short of a parser can tell an attribute from
 * the middle of an expression. So this walks the TypeScript AST and rebuilds
 * each element from its parsed parts, and every element it cannot understand is
 * REPORTED AND LEFT ALONE rather than guessed at.
 *
 * What it rewrites:
 *   <Btn v size icon iconRight>children</Btn>  →  <Button variant size icon endContent label />
 *   <Badge tone>children</Badge>               →  <Badge tone label />
 *   <Dot c="bg-…" />                           →  <Dot tone />
 *   the `@/components/ui` import                →  split across `@fit/ui-kit` + what stays
 *
 * Run: pnpm tsx scripts/codemod-kit.ts [--write] [path…]
 * Without `--write` it only reports, which is how you check a run before it
 * touches anything.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const WRITE = process.argv.includes('--write');
const TARGETS = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/** `Btn`'s `v` → the kit's `variant`. */
const VARIANT: Record<string, string> = {
  primary: 'primary',
  outline: 'secondary',
  white: 'secondary',
  glass: 'secondary',
  ink: 'secondary',
  ghost: 'ghost',
  danger: 'destructive',
};

/** `Btn`'s t-shirt sizes → the kit's job-named ladder. */
const SIZE: Record<string, string> = { sm: 'inline', md: 'card', lg: 'block', icon: 'card' };

/**
 * `@fit/ui-web`'s ten-hue `Tone` → the direction's four signals.
 *
 * The collapse is the point: the theme already flattens every categorical hue
 * onto ink, so `iris` / `info` / `teal` / `flame` were all rendering as the same
 * grey while the source claimed four different colours.
 */
const TONE: Record<string, string> = {
  success: 'positive',
  brand: 'accent',
  accent: 'accent',
  ink: 'neutral',
  info: 'neutral',
  teal: 'neutral',
  iris: 'neutral',
  warning: 'pending',
  flame: 'pending',
  danger: 'danger',
};

/** Tailwind colour classes the old `Dot` took → the kit's tones. */
function dotTone(cls: string): string {
  if (/emerald|green|lime|brand/.test(cls)) return 'positive';
  if (/amber|yellow|orange/.test(cls)) return 'pending';
  if (/red|rose|danger/.test(cls)) return 'danger';
  return 'neutral';
}

/** Names that move to `@fit/ui-kit`, mapped to their kit identifier. */
const TO_KIT: Record<string, string> = {
  Btn: 'Button',
  Badge: 'Badge',
  Card: 'Card',
  Dot: 'Dot',
  Drawer: 'Drawer',
  Modal: 'Dialog',
  ConfirmDialog: 'ConfirmDialog',
  DataTable: 'DataTable',
  FilterChips: 'FilterChips',
  FilterBar: 'FilterBar',
  TableSearch: 'TableSearch',
  EmptyState: 'EmptyState',
  Switch: 'Switch',
  CountUp: 'CountUp',
  Textarea: 'TextareaField',
  nextSortDir: 'nextSortDir',
  'type Column': 'type Column',
  'type FilterChip': 'type FilterChip',
  'type Tone': 'type BadgeTone',
};

interface Edit {
  start: number;
  end: number;
  text: string;
}

interface Report {
  file: string;
  rewrote: number;
  skipped: string[];
}

/** Source text of a node, verbatim. */
function textOf(node: ts.Node, src: ts.SourceFile): string {
  return src.text.slice(node.getStart(src), node.getEnd());
}

/**
 * A `cond ? 'a' : 'b'` attribute whose BOTH branches are string literals, mapped
 * through `table`. Returns null for anything else.
 *
 * This is the one computed form worth automating: the console writes
 * `v={isInactive ? 'primary' : 'outline'}` all over, and both branches are
 * values the table knows. Anything with a computed branch still goes back to a
 * human — a wrong variant is invisible until someone looks at the screen.
 */
function ternaryAttr(
  attr: ts.JsxAttribute,
  src: ts.SourceFile,
  table: Record<string, string>,
): string | null {
  const init = attr.initializer;
  if (!init || !ts.isJsxExpression(init) || !init.expression) return null;
  const expr = init.expression;
  if (!ts.isConditionalExpression(expr)) return null;
  const { condition, whenTrue, whenFalse } = expr;
  if (!ts.isStringLiteral(whenTrue) || !ts.isStringLiteral(whenFalse)) return null;
  const a = table[whenTrue.text];
  const b = table[whenFalse.text];
  if (!a || !b) return null;
  return `{${textOf(condition, src)} ? '${a}' : '${b}'}`;
}

/** The literal string of a `foo="bar"` attribute, or null when it is an expression. */
function stringAttr(attr: ts.JsxAttribute): string | null {
  const init = attr.initializer;
  if (init && ts.isStringLiteral(init)) return init.text;
  if (init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)) {
    return init.expression.text;
  }
  return null;
}

function processFile(file: string): Report {
  const source = readFileSync(file, 'utf8');
  const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: Edit[] = [];
  const skipped: string[] = [];
  const glyphNeeded = { value: false };

  /** Rebuild one `<Btn>`/`<Badge>`/`<Dot>` element. Returns null to leave it be. */
  function rebuild(
    open: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    children: ts.NodeArray<ts.JsxChild> | null,
  ): string | null {
    const tag = open.tagName.getText(src);
    const attrs = open.attributes.properties;

    // A spread (`{...props}`) can carry anything, including the props we are
    // rewriting. Rewriting around one would be a guess.
    if (attrs.some((a) => ts.isJsxSpreadAttribute(a))) {
      skipped.push(
        `${tag} at line ${src.getLineAndCharacterOfPosition(open.getStart(src)).line + 1}: has a spread`,
      );
      return null;
    }

    const named = attrs.filter(ts.isJsxAttribute);
    const get = (n: string) => named.find((a) => a.name.getText(src) === n);
    const kept: string[] = [];

    /** Children → the `label`, verbatim. */
    let label: string | null = null;
    if (children) {
      const meaningful = children.filter((c) => !(ts.isJsxText(c) && c.text.trim() === ''));
      if (meaningful.length === 1) {
        const only = meaningful[0]!;
        if (ts.isJsxText(only)) label = JSON.stringify(only.text.trim());
        else if (ts.isJsxExpression(only) && only.expression)
          label = `{${textOf(only.expression, src)}}`;
        // A single element child (an icon-plus-text `<span>`) is a ReactNode,
        // which is exactly what `Badge`'s label accepts.
        else if (
          ts.isJsxElement(only) ||
          ts.isJsxSelfClosingElement(only) ||
          ts.isJsxFragment(only)
        ) {
          label = tag === 'Badge' ? `{${textOf(only, src)}}` : null;
        }
      } else if (meaningful.length > 1) {
        // Several nodes (an icon beside text, a count after a word). `Badge`'s
        // label is a ReactNode, so a fragment carries them faithfully; a Button's
        // is not, and gets handed back.
        if (tag !== 'Badge') {
          skipped.push(
            `${tag} at line ${src.getLineAndCharacterOfPosition(open.getStart(src)).line + 1}: mixed children`,
          );
          return null;
        }
        const inner = meaningful
          .map((c) => (ts.isJsxText(c) ? c.text.trim() : textOf(c, src)))
          .join(' ');
        label = `{<>${inner}</>}`;
      }
    }

    if (tag === 'Btn') {
      const v = get('v');
      const vLit = v ? stringAttr(v) : 'outline';
      if (v && vLit === null) {
        const tern = ternaryAttr(v, src, VARIANT);
        if (!tern) {
          skipped.push(
            `Btn at line ${src.getLineAndCharacterOfPosition(open.getStart(src)).line + 1}: computed variant`,
          );
          return null;
        }
        kept.push(`variant=${tern}`);
      } else {
        kept.push(`variant="${VARIANT[vLit ?? 'outline'] ?? 'secondary'}"`);
      }

      const sz = get('size');
      const szLit = sz ? stringAttr(sz) : 'md';
      if (sz && szLit === null) {
        const tern = ternaryAttr(sz, src, SIZE);
        if (!tern) {
          skipped.push(
            `Btn at line ${src.getLineAndCharacterOfPosition(open.getStart(src)).line + 1}: computed size`,
          );
          return null;
        }
        kept.push(`size=${tern}`);
      } else {
        kept.push(`size="${SIZE[szLit ?? 'md'] ?? 'card'}"`);
        if (szLit === 'icon') kept.push('iconOnly');
      }

      for (const a of named) {
        const n = a.name.getText(src);
        if (['v', 'size', 'icon', 'iconRight', 'className', 'disabled'].includes(n)) continue;
        kept.push(textOf(a, src));
      }
      // `disabled` survives as-is: the kit keeps the native prop.
      const dis = get('disabled');
      if (dis) kept.push(textOf(dis, src));

      const ic = get('icon');
      const icLit = ic ? stringAttr(ic) : null;
      if (ic && icLit === null) {
        // `icon={someName}` — the value is still an icon name, just computed.
        const expr =
          ic.initializer && ts.isJsxExpression(ic.initializer) && ic.initializer.expression
            ? textOf(ic.initializer.expression, src)
            : null;
        if (!expr) {
          skipped.push(
            `Btn at line ${src.getLineAndCharacterOfPosition(open.getStart(src)).line + 1}: unreadable icon`,
          );
          return null;
        }
        kept.push(`icon={<Icon name={${expr}} {...stylex.props(styles.kitGlyph)} />}`);
        glyphNeeded.value = true;
      }
      if (icLit) {
        kept.push(`icon={<Icon name="${icLit}" {...stylex.props(styles.kitGlyph)} />}`);
        glyphNeeded.value = true;
      }
      const ir = get('iconRight');
      const irLit = ir ? stringAttr(ir) : null;
      if (irLit) {
        kept.push(`endContent={<Icon name="${irLit}" {...stylex.props(styles.kitGlyph)} />}`);
        glyphNeeded.value = true;
      }
      if (label) {
        kept.push(`label=${label}`);
      } else {
        // An icon-only button has no children, and its name lives in
        // `aria-label`. The kit puts both in one place: `label` IS the
        // accessible name once `iconOnly` is set, which is why it stays required
        // there. Move it across rather than leaving the control unnamed.
        const aria = get('aria-label');
        if (!aria) {
          skipped.push(
            `Btn at line ${src.getLineAndCharacterOfPosition(open.getStart(src)).line + 1}: no label`,
          );
          return null;
        }
        const idx = kept.findIndex((k) => k.startsWith('aria-label='));
        if (idx >= 0) kept.splice(idx, 1);
        const init = aria.initializer;
        const val =
          init && ts.isJsxExpression(init) && init.expression
            ? `{${textOf(init.expression, src)}}`
            : init && ts.isStringLiteral(init)
              ? JSON.stringify(init.text)
              : null;
        if (!val) {
          skipped.push(
            `Btn at line ${src.getLineAndCharacterOfPosition(open.getStart(src)).line + 1}: unreadable aria-label`,
          );
          return null;
        }
        kept.push(`label=${val}`);
        if (!kept.includes('iconOnly')) kept.push('iconOnly');
      }
      return `<Button ${kept.join(' ')} />`;
    }

    if (tag === 'Badge') {
      const tone = get('tone');
      const toneLit = tone ? stringAttr(tone) : 'ink';
      if (tone && toneLit === null) {
        // `tone={STATUS_TONES[x]}` — pass the expression through. Swapping the
        // `Tone` import for `BadgeTone` re-types the map it reads from, so the
        // compiler points at any value that is no longer a tone. Guessing here
        // would be worse than letting tsc name the exact line.
        kept.push(textOf(tone, src));
      } else {
        kept.push(`tone="${TONE[toneLit ?? 'ink'] ?? 'neutral'}"`);
      }
      for (const a of named) {
        const n = a.name.getText(src);
        if (['tone', 'className'].includes(n)) continue;
        kept.push(textOf(a, src));
      }
      if (!label) {
        skipped.push(
          `Badge at line ${src.getLineAndCharacterOfPosition(open.getStart(src)).line + 1}: no label`,
        );
        return null;
      }
      kept.push(`label=${label}`);
      return `<Badge ${kept.join(' ')} />`;
    }

    if (tag === 'Dot') {
      const c = get('c');
      const cLit = c ? stringAttr(c) : null;
      if (!cLit) {
        skipped.push(
          `Dot at line ${src.getLineAndCharacterOfPosition(open.getStart(src)).line + 1}: computed colour`,
        );
        return null;
      }
      return `<Dot tone="${dotTone(cLit)}" />`;
    }

    return null;
  }

  let rewrote = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText(src);
      if (['Btn', 'Badge', 'Dot'].includes(tag)) {
        const out = rebuild(node.openingElement, node.children);
        if (out) {
          edits.push({ start: node.getStart(src), end: node.getEnd(), text: out });
          rewrote += 1;
          return;
        }
      }
    } else if (ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(src);
      if (['Btn', 'Badge', 'Dot'].includes(tag)) {
        const out = rebuild(node, null);
        if (out) {
          edits.push({ start: node.getStart(src), end: node.getEnd(), text: out });
          rewrote += 1;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);

  // ---- the import split
  let importEdit: Edit | null = null;
  for (const st of src.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    if (!ts.isStringLiteral(st.moduleSpecifier) || st.moduleSpecifier.text !== '@/components/ui')
      continue;
    const clause = st.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;

    const kit: string[] = [];
    const stay: string[] = [];
    for (const el of clause.namedBindings.elements) {
      const raw = textOf(el, src);
      const key = el.propertyName ? el.propertyName.getText(src) : el.name.getText(src);
      const typed = raw.startsWith('type ') ? `type ${key}` : key;
      const mapped = TO_KIT[typed] ?? TO_KIT[key];
      if (mapped) kit.push(mapped);
      else stay.push(raw);
    }
    if (kit.length === 0) continue;
    const lines: string[] = [];
    lines.push(`import { ${[...new Set(kit)].sort().join(', ')} } from '@fit/ui-kit';`);
    if (stay.length) lines.push(`import { ${stay.join(', ')} } from '@/components/ui';`);
    importEdit = { start: st.getStart(src), end: st.getEnd(), text: lines.join('\n') };
  }
  if (importEdit) edits.push(importEdit);

  if (edits.length === 0) return { file, rewrote: 0, skipped };

  // Apply back-to-front so earlier offsets stay valid.
  let out = source;
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }

  // The rewritten buttons reference a shared glyph size.
  if (glyphNeeded.value && !out.includes('kitGlyph:')) {
    out = out.replace(
      /const styles = stylex\.create\(\{\n/,
      "const styles = stylex.create({\n  /** Icon size inside a kit `Button`. */\n  kitGlyph: { height: '1rem', width: '1rem' },\n",
    );
  }

  if (WRITE) writeFileSync(file, out, 'utf8');
  return { file, rewrote, skipped };
}

const files = TARGETS.map((t) => resolve(ROOT, t));
let totalRewrote = 0;
const allSkipped: string[] = [];
for (const f of files) {
  const r = processFile(f);
  totalRewrote += r.rewrote;
  if (r.rewrote || r.skipped.length) {
    console.log(
      `${relative(ROOT, f)}  —  ${r.rewrote} rewritten${r.skipped.length ? `, ${r.skipped.length} left` : ''}`,
    );
    for (const s of r.skipped) {
      console.log(`    · ${s}`);
      allSkipped.push(`${relative(ROOT, f)}: ${s}`);
    }
  }
}
console.log(`\n${totalRewrote} element(s) rewritten across ${files.length} file(s).`);
if (allSkipped.length) console.log(`${allSkipped.length} left for a human — listed above.`);
if (!WRITE) console.log('\n(dry run — pass --write to apply)');
