// Test-only stand-in for `@stylexjs/stylex`.
//
// The real `stylex.create()` (and friends) throw at runtime unless their call
// sites were rewritten by the StyleX compiler first — in this repo that's the
// SWC transform in `@stylexjs/nextjs-plugin`, wired into the Next.js build
// (see `apps/admin/next.config.mjs`). Vitest never runs that build pipeline,
// so any component authored with `stylex.create` throws the moment its module
// loads under a plain `vitest run`.
//
// Component tests here assert DOM structure, ARIA attributes and
// keyboard/click behaviour — never the computed class names, animation names
// or CSS — so pass-through shims are enough: `create` returns its input
// untouched, `keyframes` returns a stable string standing in for the
// generated animation name, `props` ignores the (possibly falsy) style values
// it's given and returns a stable, harmless class name to spread onto the
// element.
//
// `apps/admin/vitest.config.ts` aliases `@stylexjs/stylex` to this file for
// the WHOLE @fit/admin test project, not just one test's imports — any test
// that imports, directly or transitively, ANY component under `apps/admin/`
// goes through this shim, whether or not that component is what the test is
// about. Production code is unaffected; the alias is test-only.
//
// KEEP THIS FILE'S EXPORT SURFACE IN SYNC WITH WHAT THE APP ACTUALLY CALLS.
// `stylex.<name>` call forms in use today: `create`, `keyframes`, `props`
// (grep `apps/admin/` for `stylex\.[a-zA-Z]+` to recheck). Type-only imports
// (e.g. `stylex.StyleXStyles`) need no runtime export — they erase at compile
// time. A component that starts calling a new one (e.g. `stylex.firstThatWorks`,
// `stylex.positionTry`) will throw "X is not a function" the moment any test
// touches it, however indirectly — add the export here when that happens,
// don't just patch around the one failing test.
export function create<T extends Record<string, unknown>>(styles: T): T {
  return styles;
}

export function keyframes(_frames: Record<string, unknown>): string {
  return 'stylex-mock-keyframes';
}

export function props(..._styles: unknown[]): { className: string } {
  return { className: 'stylex-mock' };
}
