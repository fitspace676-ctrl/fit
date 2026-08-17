#!/usr/bin/env tsx
/**
 * One-shot codemod: the console's `@fit/ui-web` form wrappers onto `@fit/ui-kit`.
 *
 * The old kit split a form control in two — a `<Field>` that drew the label and
 * an `<Input>` / `<Select>` / `<Textarea>` inside it, bound by an `htmlFor`/`id`
 * pair the caller had to remember to write. Half the console's fields were bound
 * and half were labels floating over an unnamed control. `@fit/ui-kit` merges
 * them: `Field` IS the input, and the binding is internal.
 *
 *   <Field label hint><Input …/></Field>          →  <Field label hint …/>
 *   <Field label><Textarea …/></Field>            →  <TextareaField label …/>
 *   <Field label><Select …>{options}</Select></Field> → <SelectField label … options={…}/>
 *   <Field label error>{anything else}</Field>    →  <FieldGroup label error>…</FieldGroup>
 *
 * AST-based, like `codemod-kit.ts`, and for the same reason: the first attempt
 * at this was a regex and it truncated `onChange={(e) => …}` at the `=`, turning
 * working handlers into syntax errors. Anything this cannot read is reported and
 * left alone.
 *
 * Run: pnpm tsx scripts/codemod-fields.ts [--write] [path…]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const WRITE = process.argv.includes('--write');
const TARGETS = process.argv.slice(2).filter((a) => !a.startsWith('--'));

function textOf(node: ts.Node, src: ts.SourceFile): string {
  return src.text.slice(node.getStart(src), node.getEnd());
}

/** Every named attribute of an element, as `name` → source text of the whole attribute. */
function attrMap(
  el: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  src: ts.SourceFile,
): { named: Map<string, ts.JsxAttribute>; spreads: string[] } {
  const named = new Map<string, ts.JsxAttribute>();
  const spreads: string[] = [];
  for (const a of el.attributes.properties) {
    if (ts.isJsxSpreadAttribute(a)) spreads.push(textOf(a, src));
    else if (ts.isJsxAttribute(a)) named.set(a.name.getText(src), a);
  }
  return { named, spreads };
}

/** `<option>` children → the kit's `options` array source. */
function optionsFrom(children: ts.NodeArray<ts.JsxChild>, src: ts.SourceFile): string | null {
  const parts: string[] = [];
  for (const child of children) {
    if (ts.isJsxText(child)) {
      if (child.text.trim() !== '') return null;
      continue;
    }
    // A literal <option value="x">Label</option>
    if (ts.isJsxElement(child) && child.openingElement.tagName.getText(src) === 'option') {
      const { named } = attrMap(child.openingElement, src);
      const value = named.get('value');
      if (!value?.initializer) return null;
      const v = ts.isStringLiteral(value.initializer)
        ? JSON.stringify(value.initializer.text)
        : ts.isJsxExpression(value.initializer) && value.initializer.expression
          ? textOf(value.initializer.expression, src)
          : null;
      if (v === null) return null;
      const kids = child.children.filter((c) => !(ts.isJsxText(c) && c.text.trim() === ''));
      if (kids.length !== 1) return null;
      const only = kids[0]!;
      const label = ts.isJsxText(only)
        ? JSON.stringify(only.text.trim())
        : ts.isJsxExpression(only) && only.expression
          ? textOf(only.expression, src)
          : null;
      if (label === null) return null;
      parts.push(`{ value: ${v}, label: ${label} }`);
      continue;
    }
    // A `{list.map(… => <option …/>)}` expression — spread its result.
    if (ts.isJsxExpression(child) && child.expression) {
      const expr = child.expression;
      if (!ts.isCallExpression(expr)) return null;
      const inner = expr.arguments[0];
      if (!inner || !(ts.isArrowFunction(inner) || ts.isFunctionExpression(inner))) return null;
      const body = inner.body;
      const opt = ts.isParenthesizedExpression(body) ? body.expression : body;
      if (!ts.isJsxElement(opt) || opt.openingElement.tagName.getText(src) !== 'option')
        return null;
      const { named } = attrMap(opt.openingElement, src);
      const value = named.get('value');
      if (
        !value?.initializer ||
        !ts.isJsxExpression(value.initializer) ||
        !value.initializer.expression
      )
        return null;
      const kids = opt.children.filter((c) => !(ts.isJsxText(c) && c.text.trim() === ''));
      if (kids.length !== 1) return null;
      const only = kids[0]!;
      const label = ts.isJsxText(only)
        ? JSON.stringify(only.text.trim())
        : ts.isJsxExpression(only) && only.expression
          ? textOf(only.expression, src)
          : null;
      if (label === null) return null;
      const arr = ts.isPropertyAccessExpression(expr.expression)
        ? textOf(expr.expression.expression, src)
        : null;
      if (!arr) return null;
      const param = inner.parameters[0]?.name.getText(src) ?? 'item';
      parts.push(
        `...${arr}.map((${param}) => ({ value: ${textOf(value.initializer.expression, src)}, label: ${label} }))`,
      );
      continue;
    }
    return null;
  }
  return parts.length ? `[${parts.join(', ')}]` : null;
}

function processFile(file: string): { rewrote: number; skipped: string[] } {
  const source = readFileSync(file, 'utf8');
  const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: { start: number; end: number; text: string }[] = [];
  const skipped: string[] = [];
  let rewrote = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(src) === 'Field') {
      const line = src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1;
      const { named: outer, spreads } = attrMap(node.openingElement, src);
      if (spreads.length) {
        skipped.push(`Field at line ${line}: spread on the wrapper`);
      } else {
        const kids = node.children.filter((c) => !(ts.isJsxText(c) && c.text.trim() === ''));
        const outerText = [...outer.values()]
          .filter((a) => a.name.getText(src) !== 'htmlFor' && a.name.getText(src) !== 'className')
          .map((a) => textOf(a, src));
        // `error` is the kit's `hint` + `invalid`.
        const err = outer.get('error');
        const carried = outerText.filter((t) => !t.startsWith('error='));
        if (err?.initializer && ts.isJsxExpression(err.initializer) && err.initializer.expression) {
          const e = textOf(err.initializer.expression, src);
          carried.push(`hint={${e}}`, `invalid={Boolean(${e})}`);
        }

        const single = kids.length === 1 ? kids[0]! : null;
        const inner =
          single && (ts.isJsxElement(single) || ts.isJsxSelfClosingElement(single)) ? single : null;
        const innerOpen = inner ? (ts.isJsxElement(inner) ? inner.openingElement : inner) : null;
        const innerTag = innerOpen ? innerOpen.tagName.getText(src) : null;

        if (innerOpen && (innerTag === 'Input' || innerTag === 'Textarea')) {
          const { named, spreads: innerSpreads } = attrMap(innerOpen, src);
          const props = [...named.values()]
            .filter((a) => a.name.getText(src) !== 'id')
            .map((a) => textOf(a, src));
          const tag = innerTag === 'Input' ? 'Field' : 'TextareaField';
          const out = `<${tag} ${[...carried, ...props, ...innerSpreads].join(' ')} />`;
          edits.push({ start: node.getStart(src), end: node.getEnd(), text: out });
          rewrote += 1;
          return;
        }

        if (innerTag === 'Select' && inner && ts.isJsxElement(inner)) {
          const { named, spreads: innerSpreads } = attrMap(inner.openingElement, src);
          const opts = optionsFrom(inner.children, src);
          if (!opts) {
            skipped.push(`Field at line ${line}: unreadable <option> list`);
          } else {
            const props = [...named.values()]
              .filter((a) => a.name.getText(src) !== 'id')
              .map((a) => textOf(a, src));
            const out = `<SelectField ${[...carried, ...props, ...innerSpreads].join(' ')} options={${opts}} />`;
            edits.push({ start: node.getStart(src), end: node.getEnd(), text: out });
            rewrote += 1;
            return;
          }
        }

        // Anything else the wrapper held is a GROUP of controls, not one control.
        if (!innerTag || !['Input', 'Textarea', 'Select'].includes(innerTag)) {
          const inner2 = src.text.slice(
            node.openingElement.getEnd(),
            node.closingElement.getStart(src),
          );
          const groupAttrs = [...outer.values()]
            .filter((a) => !['htmlFor', 'className'].includes(a.name.getText(src)))
            .map((a) => textOf(a, src));
          const out = `<FieldGroup ${groupAttrs.join(' ')}>${inner2}</FieldGroup>`;
          edits.push({ start: node.getStart(src), end: node.getEnd(), text: out });
          rewrote += 1;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);

  if (!edits.length) return { rewrote, skipped };
  let out = source;
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  if (WRITE) writeFileSync(file, out, 'utf8');
  return { rewrote, skipped };
}

let total = 0;
for (const t of TARGETS) {
  const f = resolve(ROOT, t);
  const r = processFile(f);
  total += r.rewrote;
  if (r.rewrote || r.skipped.length) {
    console.log(
      `${relative(ROOT, f)}  —  ${r.rewrote} rewritten${r.skipped.length ? `, ${r.skipped.length} left` : ''}`,
    );
    for (const s of r.skipped) console.log(`    · ${s}`);
  }
}
console.log(`\n${total} field(s) rewritten.`);
if (!WRITE) console.log('(dry run — pass --write to apply)');
