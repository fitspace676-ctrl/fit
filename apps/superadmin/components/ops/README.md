# Operator UI foundation

Import from `@/components/ops`. The only client boundaries are controls and nav;
primitives and logo can render on the server. A server page must pass table cell
callbacks through its own client table component (the same rule as DataTable).

Exports from `index.tsx`:

- `PageHead({ title, description?, subtitle?, eyebrow?, actions?, children? })`:
  all props are ReactNode; description wins over subtitle, actions over children.
- `BackLink({ href: string, label: string })`.
- `Cap({ children: ReactNode, className?: string })`.
- `Mono({ children: ReactNode, className?: string })`.
- `SectionTitle({ children: ReactNode, aside?: ReactNode })`.
- `Fact({ label: string, value: ReactNode, numeric?: boolean })`.
- `StatCard({ label: string, value: ReactNode, sub?: ReactNode })`.
- `OpsCard`: exact `@fit/ui-kit` Card export/props. Default white, 26px,
  no shadow; `padding="none"` for edge-to-edge sections, `padding="card"` otherwise.
- `OpsLogo({ sub?: string, size?: number })`: defaults Operator, 36.
- `OpsMark({ size?: number })`: defaults 36.
- `SurfaceButton`: `Omit<ButtonProps, 'variant'>` from @fit/ui-kit.
- `FilterPills<T extends string>`: `SegmentedControlProps<T>` from @fit/ui-kit:
  `label`, `value`, `onChange`, `options`, optional `xstyle`.
- `OpsTable<T>`: exact `DataTableProps<T>` from @fit/ui-kit; `columns`, `rows`,
  `rowKey` required; sorting, selection, loading, caption and empty state unchanged.
- `SearchField`: required `label: string` plus native InputHTMLAttributes except
  `type`, `className`, `style`. Native onChange event, not a string callback.

Direct modules: `logo.tsx` exports OpsLogo/OpsMark; `controls.tsx` exports
SurfaceButton/FilterPills/OpsTable; `search-field.tsx` exports SearchField;
`nav.tsx` exports `OpsNav()` (no props).

Examples:

```tsx
<PageHead title="Gyms" description="Every gym on FormaCore."
  actions={<ButtonLink href="/gyms/new" label="New gym" />} />
<OpsTable columns={columns} rows={rows} rowKey={(row) => row.id} caption="Gyms" />
<SurfaceButton label="Refresh" onClick={refresh} />
<ButtonLink href="/" label="Back" variant="surface" />
<FilterPills label="Status" value={status} onChange={setStatus}
  options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }]} />
```

The existing `@/components/button-link` now accepts `variant="surface"` in
addition to the original variants. Pager buttons on the canvas should use
SurfaceButton. OpsTable keeps the kit's contained horizontal scroll and adds
mono header adjustments and 40rem minimum table width.

App globals override theme roots with unlayered declarations: these win over
`@layer astryx-theme` irrespective of its scope proximity. Both the html root
and Theme's nested root receive the overrides. The shared package is untouched.
New palette properties: `--ops-forma-{50,100,200,300,400,500,600,700,800,900,950}`,
`--ops-ink-{50,100,200,300,400,500,600,700,800,900,950}`, `--ops-white`.
The app also defines `--color-text-tertiary` and disables optional brand
background images through `--brand-fill-image` / `--brand-fill-image-hover`.
Existing color, fc, and radius tokens are mapped in app/globals.css.

Known differences: session exposes userId and role only, so the user card uses a
person icon, Operator label and actual ID; it does not invent initials/name/email.
No gym count: obtaining it requires another API request. Host line omitted.
Mobile retains Sign out as a small control for access to the existing behavior.
The fatal root error uses literal fallback colors and a font-family fallback:
it must work when the root theme/font loader itself has failed.

Not built, tested, or verified in a running app by this worker. Owner should run
superadmin type-check, lint and build, then inspect 1200/768/390 widths, login
errors/submit, denied sign-out, active nav on detail routes, table horizontal
scroll, filter keyboard interactions and root/route error retry reporting.
