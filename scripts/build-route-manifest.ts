#!/usr/bin/env tsx
/**
 * Builds a manifest of every HTTP route `apps/api` exposes, as
 * `{ method, path, auth }`, by walking the TypeScript AST of every
 * `*.controller.ts`.
 *
 * WHY THIS EXISTS. The deleted mobile app called `POST /orders` — a route the
 * API has never had — and `GET /orders/:id`, which is behind `BillingRead`, a
 * permission `MEMBER` does not hold. Shop checkout could therefore never
 * succeed, and it shipped, because nothing on either side of the wire knew what
 * the other side offered. This module is the machine-readable answer to "what
 * does the API actually expose, and who may call it"; `check-mobile-endpoints.ts`
 * is the consumer that turns it into a failing build.
 *
 * It is a generalisation of `scripts/check-controller-guards.ts`, which already
 * walks the same files for the same decorators but only asks the yes/no question
 * "is *some* policy declared". Here we resolve the whole thing: the full path
 * (controller prefix + handler segment, `:id` params kept as patterns) and the
 * actual authorization state.
 *
 * ---------------------------------------------------------------------------
 * THE FIVE AUTH STATES, AND WHY "UNDECLARED" IS NOT "PUBLIC"
 *
 * `PermissionsGuard` is registered as a global `APP_GUARD` in `AppModule` and is
 * **deny-by-default** (verified in `apps/api/src/common/rbac/permissions.guard.ts`).
 * Its resolution order — which this file mirrors exactly — is:
 *
 *   1. `@Public()`          → `public`.       Admitted with no session.
 *   2. `@RequirePermissions(…)` → `permissions`. Caller must hold EVERY listed
 *      permission (AND semantics), so a route is member-callable only if MEMBER
 *      holds all of them.
 *   3. `@Roles(…)`          → `roles`.        Delegated to `RolesGuard`.
 *   4. `@AllowCrossTenant()` → `cross-tenant`. Delegated to `TenantGuard`
 *      (SUPER_ADMIN-only in practice).
 *   5. nothing              → `undeclared`.   A `403 ENDPOINT_NOT_AUTHORIZED`
 *      for EVERY caller, super-admin included. This state is neither public nor
 *      callable and must be represented distinctly: treating it as "no
 *      permissions required" would mark the single most broken kind of route as
 *      the most freely available one.
 *
 * Each key resolves handler-first, class-second — Nest's
 * `Reflector.getAllAndOverride([handler, class])` — so a controller that is
 * `@Public()` at the class level (e.g. `auth.controller.ts`) makes every handler
 * public unless that handler declares its own policy, and a handler's
 * `@RequirePermissions` overrides the controller's.
 *
 * The API sets no global prefix (there is no `setGlobalPrefix` call in
 * `main.ts`), so a controller prefix is the first path segment as written.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 *
 *   pnpm build:route-manifest              # human summary + statistics
 *   pnpm build:route-manifest --json       # the manifest as JSON on stdout
 *   pnpm build:route-manifest --out f.json # …written to a file
 *
 * Or as a library — which is how the checker consumes it:
 *
 *   import { buildRouteManifest, memberPermissions } from './build-route-manifest';
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();

/**
 * Nest's route decorators. `@All` maps to every method, so it is its own entry.
 *
 * `@Sse` is here and it matters: it is a route decorator like any other and
 * registers a **GET**, it just answers `text/event-stream`. Omitting it made this
 * manifest miss `GET /class-instances/occupancy/stream` and report a correct
 * mobile entry as calling a route that does not exist — the false positive that
 * gets a guard deleted rather than obeyed. Anything Nest routes belongs in this
 * map; check here first if the check accuses a working call.
 */
const HTTP_DECORATORS: Record<string, string> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
  Head: 'HEAD',
  Options: 'OPTIONS',
  Sse: 'GET',
  All: 'ALL',
};

/** How a route declares who may call it. See the header for why `undeclared` is separate. */
export type AuthKind = 'public' | 'permissions' | 'roles' | 'cross-tenant' | 'undeclared';

export interface RouteAuth {
  kind: AuthKind;
  /**
   * For `kind: 'permissions'` — the `Permission` enum MEMBER NAMES the route
   * requires (e.g. `['BillingRead']`), all of which the caller must hold.
   */
  permissions?: string[];
  /** For `kind: 'permissions'` — the same list as wire values (`['billing:read']`). */
  permissionValues?: string[];
  /** For `kind: 'roles'` — the role names named by `@Roles(...)`. */
  roles?: string[];
}

export interface RouteEntry {
  /** `GET`, `POST`, … or `ALL`. */
  method: string;
  /** Full path with a leading slash and `:param` segments intact, e.g. `/cart/items/:id`. */
  path: string;
  auth: RouteAuth;
  controller: string;
  handler: string;
  /** Repo-relative source file. */
  file: string;
  line: number;
}

/** A decorator argument this walker could not read as a literal path. */
export interface ManifestWarning {
  file: string;
  line: number;
  detail: string;
}

export interface RouteManifest {
  routes: RouteEntry[];
  /** Number of `*.controller.ts` files walked. */
  controllerFiles: number;
  /** Non-literal decorator arguments — surfaced so a silent miss is impossible. */
  warnings: ManifestWarning[];
}

/* ------------------------------------------------------------------ AST bits */

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

interface DecoratorCall {
  name: string;
  args: readonly ts.Expression[];
  node: ts.Decorator;
}

/** Every decorator on a node, as `{ name, args }` — handles both `@Foo` and `@Foo(...)`. */
function decorators(node: ts.Node): DecoratorCall[] {
  if (!ts.canHaveDecorators(node)) return [];
  const out: DecoratorCall[] = [];
  for (const dec of ts.getDecorators(node) ?? []) {
    const call = ts.isCallExpression(dec.expression) ? dec.expression : undefined;
    const expr = call ? call.expression : dec.expression;
    if (ts.isIdentifier(expr)) {
      out.push({ name: expr.text, args: call?.arguments ?? [], node: dec });
    }
  }
  return out;
}

/** A string literal's text, or `undefined` if the expression is not a literal. */
function literalText(expr: ts.Expression): string | undefined {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  return undefined;
}

/**
 * The trailing identifier of `Permission.BillingRead` / `Role.OWNER` / a bare
 * `BillingRead`. Enum members are what both `@RequirePermissions` and
 * `ROLE_PERMISSIONS` are written in, so comparing member names keeps the two
 * sides in the same vocabulary without evaluating any TypeScript.
 */
function enumMemberName(expr: ts.Expression): string | undefined {
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) return expr.name.text;
  if (ts.isIdentifier(expr)) return expr.text;
  return literalText(expr);
}

/* -------------------------------------------------------------- path joining */

/** `/a` + `b/:id` → `/a/b/:id`; empty segments collapse; a trailing slash never survives. */
function joinPath(prefix: string, segment: string): string {
  const parts = [prefix, segment]
    .flatMap((p) => p.split('/'))
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return `/${parts.join('/')}`;
}

/**
 * The path arguments of `@Controller(...)` / `@Get(...)`.
 *
 * Nest accepts a bare string, an array of strings, or (on `@Controller`) an
 * options object with a `path`. Anything else — a computed value, a constant
 * reference — is reported as a warning rather than silently dropped: a route
 * missing from the manifest reads to the checker as "the mobile app is calling
 * something that does not exist", which is exactly the false positive that
 * would get this guard deleted.
 */
function pathArguments(
  dec: DecoratorCall,
  source: ts.SourceFile,
  file: string,
  warnings: ManifestWarning[],
): string[] {
  const first = dec.args[0];
  if (!first) return [''];

  const direct = literalText(first);
  if (direct !== undefined) return [direct];

  if (ts.isArrayLiteralExpression(first)) {
    const values = first.elements.map(literalText).filter((v): v is string => v !== undefined);
    if (values.length === first.elements.length) return values;
  }

  if (ts.isObjectLiteralExpression(first)) {
    for (const prop of first.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : '';
      if (key !== 'path') continue;
      const value = literalText(prop.initializer);
      if (value !== undefined) return [value];
    }
    // `@Controller({ version: '2' })` with no path is a legitimate root mount.
    return [''];
  }

  const { line } = source.getLineAndCharacterOfPosition(dec.node.getStart(source));
  warnings.push({
    file,
    line: line + 1,
    detail: `@${dec.name}(...) has a non-literal path argument; its route(s) are missing from the manifest`,
  });
  return [];
}

/* ------------------------------------------------------------ auth resolution */

interface AuthDeclaration {
  isPublic: boolean;
  permissions?: string[];
  roles?: string[];
  crossTenant: boolean;
}

/** Read the four authorization decorators off one node (class or method). */
function readAuth(node: ts.Node): AuthDeclaration {
  const out: AuthDeclaration = { isPublic: false, crossTenant: false };
  for (const dec of decorators(node)) {
    switch (dec.name) {
      case 'Public':
        out.isPublic = true;
        break;
      case 'RequirePermissions':
        out.permissions = dec.args.map(enumMemberName).filter((n): n is string => n !== undefined);
        break;
      case 'Roles':
        out.roles = dec.args.map(enumMemberName).filter((n): n is string => n !== undefined);
        break;
      case 'AllowCrossTenant':
        out.crossTenant = true;
        break;
    }
  }
  return out;
}

/**
 * Collapse a handler's and its class's declarations the way `PermissionsGuard`
 * does: each key resolves handler-first (`Reflector.getAllAndOverride`), and the
 * kinds are checked in the guard's own order — public, then permissions, then
 * the delegating gates, then deny-by-default.
 */
function resolveAuth(
  handler: AuthDeclaration,
  klass: AuthDeclaration,
  permissionValues: Map<string, string>,
): RouteAuth {
  if (handler.isPublic || klass.isPublic) return { kind: 'public' };

  const permissions = handler.permissions ?? klass.permissions;
  if (permissions && permissions.length > 0) {
    return {
      kind: 'permissions',
      permissions,
      permissionValues: permissions.map((p) => permissionValues.get(p) ?? p),
    };
  }

  const roles = handler.roles ?? klass.roles;
  if (roles && roles.length > 0) return { kind: 'roles', roles };

  if (handler.crossTenant || klass.crossTenant) return { kind: 'cross-tenant' };

  return { kind: 'undeclared' };
}

/* --------------------------------------------------------- permissions.ts read */

/**
 * `Permission` enum member name → wire value, read out of
 * `packages/types/src/permissions.ts` without importing it (the scripts
 * tsconfig does not resolve workspace packages, and the same AST approach is
 * used by `check-design-tokens.ts` for `ui-web`'s icon dictionary).
 */
export function permissionValueMap(root = ROOT): Map<string, string> {
  const file = resolve(root, 'packages/types/src/permissions.ts');
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const out = new Map<string, string>();

  const visit = (node: ts.Node): void => {
    if (ts.isEnumDeclaration(node) && node.name.text === 'Permission') {
      for (const member of node.members) {
        const name = ts.isIdentifier(member.name) ? member.name.text : undefined;
        const value = member.initializer ? literalText(member.initializer) : undefined;
        if (name && value) out.set(name, value);
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (out.size === 0) {
    throw new Error(`Could not read the Permission enum from ${relative(root, file)}`);
  }
  return out;
}

/**
 * The permissions one role holds, read from `ROLE_PERMISSIONS` in
 * `packages/types/src/permissions.ts` — the shared source of truth the API guard
 * itself resolves against. Read rather than hard-coded so the mobile check stays
 * true as the matrix changes: widen MEMBER tomorrow and the check widens with it.
 *
 * Returns enum member names (`ClassBook`), matching what `@RequirePermissions`
 * is written in.
 */
export function rolePermissions(role: string, root = ROOT): Set<string> {
  const file = resolve(root, 'packages/types/src/permissions.ts');
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  let found: Set<string> | undefined;

  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'ROLE_PERMISSIONS'
    ) {
      let init = node.initializer;
      while (init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init))) {
        init = init.expression;
      }
      if (!init || !ts.isObjectLiteralExpression(init)) return;
      for (const prop of init.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key =
          ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : '';
        if (key !== role) continue;
        let value = prop.initializer;
        while (ts.isAsExpression(value) || ts.isSatisfiesExpression(value))
          value = value.expression;
        if (!ts.isArrayLiteralExpression(value)) continue;
        found = new Set(
          value.elements.map(enumMemberName).filter((n): n is string => n !== undefined),
        );
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (!found) {
    throw new Error(
      `ROLE_PERMISSIONS.${role} not found in ${relative(root, file)} — has the role been renamed?`,
    );
  }
  return found;
}

/** Shorthand for the role the mobile app signs in as. */
export function memberPermissions(root = ROOT): Set<string> {
  return rolePermissions('MEMBER', root);
}

/* --------------------------------------------------------------- the manifest */

function scanController(
  file: string,
  permissionValues: Map<string, string>,
  root: string,
  warnings: ManifestWarning[],
): RouteEntry[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const rel = relative(root, file);
  const routes: RouteEntry[] = [];

  source.forEachChild((node) => {
    if (!ts.isClassDeclaration(node)) return;
    const controllerDec = decorators(node).find((d) => d.name === 'Controller');
    if (!controllerDec) return;

    const prefixes = pathArguments(controllerDec, source, rel, warnings);
    const classAuth = readAuth(node);
    const controller = node.name?.text ?? '<anonymous>';

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const memberDecorators = decorators(member);
      const handlerAuth = readAuth(member);

      for (const dec of memberDecorators) {
        const method = HTTP_DECORATORS[dec.name];
        if (!method) continue;

        const segments = pathArguments(dec, source, rel, warnings);
        const { line } = source.getLineAndCharacterOfPosition(member.getStart(source));
        const handler = ts.isIdentifier(member.name) ? member.name.text : '<computed>';
        const auth = resolveAuth(handlerAuth, classAuth, permissionValues);

        for (const prefix of prefixes) {
          for (const segment of segments) {
            routes.push({
              method,
              path: joinPath(prefix, segment),
              auth,
              controller,
              handler,
              file: rel,
              line: line + 1,
            });
          }
        }
      }
    }
  });

  return routes;
}

/** Walk every controller under `apps/` and return the full route manifest. */
export function buildRouteManifest(root = ROOT): RouteManifest {
  const permissionValues = permissionValueMap(root);
  const warnings: ManifestWarning[] = [];
  const files = findControllers(resolve(root, 'apps'));
  const routes = files.flatMap((file) => scanController(file, permissionValues, root, warnings));

  routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  return { routes, controllerFiles: files.length, warnings };
}

/**
 * Whether `role`'s permission set is enough to call `route`.
 *
 * `public` yes; `permissions` only when the role holds EVERY listed one (the
 * guard's AND semantics); `undeclared` never — it 403s for everybody; `roles`
 * and `cross-tenant` never for a member, as both delegate to gates that admit
 * staff/platform callers only.
 */
export function isCallableBy(route: RouteEntry, held: Set<string>): boolean {
  if (route.auth.kind === 'public') return true;
  if (route.auth.kind !== 'permissions') return false;
  return (route.auth.permissions ?? []).every((p) => held.has(p));
}

/* -------------------------------------------------------------------- the CLI */

function main(): void {
  const argv = process.argv.slice(2);
  const manifest = buildRouteManifest();
  const outIndex = argv.indexOf('--out');
  const outFile = outIndex >= 0 ? argv[outIndex + 1] : undefined;

  if (argv.includes('--json') && !outFile) {
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }

  if (outFile) {
    writeFileSync(resolve(ROOT, outFile), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  const member = memberPermissions();
  const byKind = new Map<AuthKind, number>();
  for (const r of manifest.routes) byKind.set(r.auth.kind, (byKind.get(r.auth.kind) ?? 0) + 1);
  const callable = manifest.routes.filter((r) => isCallableBy(r, member)).length;

  console.log(
    `✓ Route manifest: ${manifest.routes.length} routes across ${manifest.controllerFiles} controllers.`,
  );
  console.log(`  public          ${byKind.get('public') ?? 0}`);
  console.log(`  permissions     ${byKind.get('permissions') ?? 0}`);
  console.log(`  roles           ${byKind.get('roles') ?? 0}`);
  console.log(`  cross-tenant    ${byKind.get('cross-tenant') ?? 0}`);
  console.log(`  undeclared      ${byKind.get('undeclared') ?? 0}   (403 ENDPOINT_NOT_AUTHORIZED)`);
  console.log(`  MEMBER-callable ${callable}`);

  if (manifest.warnings.length > 0) {
    console.warn('\nRoutes this walker could not resolve:');
    for (const w of manifest.warnings) console.warn(`  ${w.file}:${w.line}  ${w.detail}`);
  }
  if (outFile) console.log(`\nWritten to ${outFile}`);
}

// `tsx` runs this file directly; importing it must not run the CLI.
const invokedDirectly = process.argv[1]?.endsWith('build-route-manifest.ts') ?? false;
if (invokedDirectly) main();
