// Test-only stand-in for `@stylexjs/stylex`.
//
// The real `stylex.create()` throws at runtime unless its call sites were
// rewritten by the StyleX compiler first — in this repo that's the SWC
// transform in `@stylexjs/nextjs-plugin`, wired into the Next.js build (see
// `apps/admin/next.config.mjs`). Vitest never runs that build pipeline, so any
// component authored with `stylex.create` throws the moment its module loads
// under a plain `vitest run`.
//
// Component tests here assert DOM structure, ARIA attributes and keyboard/click
// behaviour — never the computed class names or CSS — so a pass-through shim is
// enough: `create` returns its input untouched, `props` ignores the (possibly
// falsy) style values it's given and returns a stable, harmless class name to
// spread onto the element. `apps/admin/vitest.config.ts` aliases
// `@stylexjs/stylex` to this file for the test run only; production code is
// unaffected.
export function create<T extends Record<string, unknown>>(styles: T): T {
  return styles;
}

export function props(..._styles: unknown[]): { className: string } {
  return { className: 'stylex-mock' };
}
