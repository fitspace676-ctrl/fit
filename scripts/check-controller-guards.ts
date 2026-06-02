#!/usr/bin/env tsx
/**
 * CI guard: every HTTP handler on a NestJS controller must declare an explicit
 * authorization policy. The global `PermissionsGuard` already denies routes that
 * declare none at runtime — this catches the omission at build time, where the
 * fix is a one-line decorator rather than a production 403.
 *
 * A handler (`@Get/@Post/@Put/@Patch/@Delete/@All`) passes when it, or its
 * controller class, carries one of: `@Public`, `@RequirePermissions`, `@Roles`,
 * or `@AllowCrossTenant`. Exit 1 (listing offenders) otherwise.
 *
 * AST-based (via the TypeScript compiler) rather than textual, so multiline
 * decorators and class-vs-method placement are handled correctly.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const HTTP_METHODS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'All']);
const AUTH_DECORATORS = new Set(['Public', 'RequirePermissions', 'Roles', 'AllowCrossTenant']);

/** Recursively collect `*.controller.ts` files under a directory (skips specs). */
function findControllers(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findControllers(full, out);
    } else if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** The decorator identifier names on a node (`@Foo` and `@Foo(...)`). */
function decoratorNames(node: ts.Node): Set<string> {
  const names = new Set<string>();
  if (!ts.canHaveDecorators(node)) return names;
  for (const dec of ts.getDecorators(node) ?? []) {
    const expr = ts.isCallExpression(dec.expression) ? dec.expression.expression : dec.expression;
    if (ts.isIdentifier(expr)) names.add(expr.text);
  }
  return names;
}

interface Offender {
  file: string;
  line: number;
  method: string;
}

function scan(file: string): Offender[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const offenders: Offender[] = [];

  source.forEachChild((node) => {
    if (!ts.isClassDeclaration(node)) return;
    const classDecorators = decoratorNames(node);
    const classCovered = [...AUTH_DECORATORS].some((d) => classDecorators.has(d));

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const decs = decoratorNames(member);
      const isHandler = [...HTTP_METHODS].some((m) => decs.has(m));
      if (!isHandler) continue;

      const covered = classCovered || [...AUTH_DECORATORS].some((d) => decs.has(d));
      if (!covered) {
        const { line } = source.getLineAndCharacterOfPosition(member.getStart(source));
        const name = ts.isIdentifier(member.name) ? member.name.text : '<computed>';
        offenders.push({ file: relative(ROOT, file), line: line + 1, method: name });
      }
    }
  });

  return offenders;
}

const controllers = findControllers(resolve(ROOT, 'apps'));
const offenders = controllers.flatMap(scan);

if (offenders.length > 0) {
  console.error('Controller handlers missing an authorization policy:\n');
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}  ${o.method}()`);
  }
  console.error(
    '\nAdd one of @Public, @RequirePermissions, @Roles, or @AllowCrossTenant to the handler or its controller.',
  );
  process.exit(1);
}

console.log(
  `✓ All ${controllers.length} controllers declare an authorization policy on every handler.`,
);
