#!/usr/bin/env tsx
/**
 * One-shot codemod: Astryx's `Card` → `@fit/ui-kit`'s.
 *
 * The single most repeated component in the console — 94 files — and the last
 * Astryx surface with a kit equivalent already sitting unused.
 *
 * SAFER THAN THE EARLIER PASSES BY CONSTRUCTION. It rewrites only the ATTRIBUTE
 * span of each `<Card …>` opening tag and never reads or moves the children.
 * The two codemods before this had to fold children into a `label` prop, which
 * is where the hazard lived; there is no such hazard here, so the transform
 * cannot change what the card contains.
 *
 *   variant="default"  → dropped (the kit's default)
 *   padding={0}        → padding="none"   (the xstyle beside it carries the real padding)
 *   padding={4|5}      → padding="sm"|"card"
 *
 * Run: pnpm tsx scripts/codemod-card.ts [--write] [path…]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const WRITE = process.argv.includes('--write');
const TARGETS = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/**
 * Astryx's `padding` is a spacing STEP, not pixels: 4 → 16px, 5 → 20px. The kit
 * names the steps instead, so a call site says what the panel is rather than how
 * many units of something it has.
 */
const PADDING_STEP: Record<string, string> = {
  '0': 'none',
  '3': 'sm',
  '4': 'sm',
  '5': 'card',
  '6': 'lg',
};

function processFile(file: string): { rewrote: number; skipped: string[] } {
  const source = readFileSync(file, 'utf8');
  if (!source.includes('@astryxdesign/core/Card')) return { rewrote: 0, skipped: [] };

  const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: { start: number; end: number; text: string }[] = [];
  const skipped: string[] = [];
  let rewrote = 0;

  const rewriteAttrs = (el: ts.JsxOpeningElement | ts.JsxSelfClosingElement): void => {
    if (el.tagName.getText(src) !== 'Card') return;
    const line = src.getLineAndCharacterOfPosition(el.getStart(src)).line + 1;
    const kept: string[] = [];
    let touched = false;

    for (const attr of el.attributes.properties) {
      if (ts.isJsxSpreadAttribute(attr)) {
        kept.push(source.slice(attr.getStart(src), attr.getEnd()));
        continue;
      }
      if (!ts.isJsxAttribute(attr)) continue;
      const name = attr.name.getText(src);
      const raw = source.slice(attr.getStart(src), attr.getEnd());

      if (name === 'variant') {
        const init = attr.initializer;
        const v = init && ts.isStringLiteral(init) ? init.text : null;
        // `default` IS the kit's default; `muted` survives as itself.
        if (v === 'default') {
          touched = true;
          continue;
        }
        kept.push(raw);
        continue;
      }

      if (name === 'padding') {
        const init = attr.initializer;
        const n =
          init &&
          ts.isJsxExpression(init) &&
          init.expression &&
          ts.isNumericLiteral(init.expression)
            ? init.expression.text
            : null;
        if (n === null) {
          skipped.push(`Card at line ${line}: computed padding`);
          kept.push(raw);
          continue;
        }
        const step = PADDING_STEP[n];
        if (!step) {
          skipped.push(`Card at line ${line}: unmapped padding step ${n}`);
          kept.push(raw);
          continue;
        }
        kept.push(`padding="${step}"`);
        touched = true;
        continue;
      }

      kept.push(raw);
    }

    if (!touched) return;
    // Replace only the attribute span — the tag name and the children are
    // untouched, which is what makes this transform unable to change behaviour.
    const attrs = el.attributes;
    edits.push({
      start: attrs.getStart(src) === attrs.getEnd() ? el.tagName.getEnd() : attrs.getStart(src),
      end: attrs.getEnd(),
      text: kept.join(' '),
    });
    rewrote += 1;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) rewriteAttrs(node);
    ts.forEachChild(node, visit);
  };
  visit(src);

  let out = source;
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }

  // Point the import at the kit, merging with an existing one.
  out = out.replace(/import \{ Card \} from '@astryxdesign\/core\/Card';\n/, '');
  if (/from '@fit\/ui-kit'/.test(out)) {
    out = out.replace(/import \{ ([^}]*) \} from '@fit\/ui-kit';/, (_m, names: string) => {
      const set = new Set(
        names
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean),
      );
      set.add('Card');
      return `import { ${[...set].sort().join(', ')} } from '@fit/ui-kit';`;
    });
  } else {
    out = out.replace(/^(import .*?;\n)/m, `$1import { Card } from '@fit/ui-kit';\n`);
  }

  if (WRITE && out !== source) writeFileSync(file, out, 'utf8');
  return { rewrote, skipped };
}

let total = 0;
const allSkipped: string[] = [];
for (const t of TARGETS) {
  const f = resolve(ROOT, t);
  const r = processFile(f);
  total += r.rewrote;
  for (const s of r.skipped) allSkipped.push(`${relative(ROOT, f)}: ${s}`);
}
console.log(`${total} <Card> element(s) rewritten across ${TARGETS.length} file(s).`);
for (const s of allSkipped) console.log(`  · ${s}`);
if (!WRITE) console.log('(dry run — pass --write to apply)');
