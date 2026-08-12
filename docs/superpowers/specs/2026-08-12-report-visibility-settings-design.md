# Settings → Reports: which reports the hub offers

## Problem

Every gym sees all 27 reports. `reports.controller.ts:54` returns the shared
`REPORT_CATALOG` constant verbatim:

```ts
catalog(): ReportCatalogResponse {
  return { reports: REPORT_CATALOG };
}
```

A studio that runs no classes still gets a Classes & training tab with six
reports under it. A single-site gym still gets Revenue by location. Nothing in
the product can trim the list.

Settings already solves this exact shape of problem three times over —
`staffDirectory` (which columns the roster shows), `automationFields` and
`marketingFields` (which merge-field chips each composer offers). This is the
fourth instance of the same pattern, applied to the report catalogue.

## Semantics

**A toggle is a display preference, not a permission.** On means the report is
offered in the hub; off means it is not listed. Off does **not** revoke access:
`GET /admin/reports/:report` and `/admin/reports/:report/export` keep serving a
disabled report to anyone holding `Permission.ReportView`, so a bookmarked
preview link and a scheduled export both keep working.

That boundary is deliberate and needs to survive future edits, so it is stated
in the controller rather than left to be inferred. A gym that wants a report
genuinely withheld needs role permissions; hiding a card is housekeeping, not
access control, and a toggle that half-enforced access would be worse than one
that clearly does not.

All 27 default **on**, so a gym that never opens Settings sees exactly today's
hub.

## Scope

**In scope:** a per-report on/off toggle, the hub honouring it, and the three
consequences of an empty or partial catalogue described below.

**Out of scope:**

- The `/reports/[metric]` drill-down routes. They still exist and still render;
  the hub has not linked them since T11.22, so a hub-visibility toggle has
  nothing to say about them.
- Export permissions and role changes, per the semantics above.
- Per-report access control of any kind.

## Design

### The settings section

New `gymReportsSettingsSchema` in `packages/types/src/gym-settings.ts`: one
boolean per entry of `REPORT_KEYS`, every one `.default(true)`. Keys use the
report's own catalogue key, so the two lists can be compared directly by a test.

Wired in as `reports` at the three places `marketingFields` already appears —
`gymSettingsStoredSchema`, the `GymSettings` interface, and the patch schema as
`.partial().strict().optional()`.

There is no read/write split here. The marketing section needed one because its
reserved-token rule was time-varying — a value legal when saved could later
become illegal and make the stored parse throw. This section is 27 booleans with
defaults; nothing about a saved value can become invalid later, so a single
schema is correct.

### The API

`ReportsController.catalog()` becomes gym-aware: read the gym's settings, filter
`REPORT_CATALOG` to the keys toggled on. `ReportCatalogResponse` is unchanged.

The preview and export routes are untouched, per the semantics above.

### The hub

`groupReportsBySegment` already drops a segment with no reports, so a fully
disabled segment loses its tab with no further work. Three consequences do need
handling:

**The default report can be disabled.** `page.tsx` falls back to
`DEFAULT_REPORT_KEY`, which is `REPORT_KEYS[0]` — `sales-summary`. A gym that
switches that off would land on a report the hub is not offering. The fallback
becomes the first report in the _filtered_ catalogue.

**A URL can name a disabled report.** `?report=members-at-risk` with that report
off must fall back the same way an unrecognised key already does. The existing
comment in `page.tsx` says a bad key "is corrected rather than 404'd: the value is
a view preference"; a disabled key is the same class of thing.

**A gym can switch all 27 off.** `reports-view.tsx` currently renders the
"no matches for `<query>`" empty state whenever it has no groups. With an empty
catalogue that copy is simply false — nothing was searched. The empty state
distinguishes the two causes: no matches for a query, versus no reports switched
on, the latter pointing at Settings → Reports.

### The Settings screen

A `reports` section beside the existing `marketing` one: five `SectionCard`s, one
per `REPORT_SEGMENTS` entry, titled from `REPORT_SEGMENT_LABEL`, each holding a
`SwitchRow` per report in that segment.

Each row is labelled with the report's `name` and described by its `description`
— both from `REPORT_DEFINITIONS`, not from i18n. This matches the rule the
marketing section follows: a name that appears in two places, translated in one
of them, is a name that can disagree with itself. New i18n keys cover the section
name and the five group headings only.

## Error handling

- **A gym switches every report off** — allowed. The hub shows the "no reports
  switched on" state pointing at Settings. Not an error.
- **A URL names a disabled report** — falls back to the first enabled report. No
  404, consistent with how an unrecognised key is already handled.
- **A URL names a disabled report and none are enabled** — the empty state above;
  no report is fetched.
- **Stored settings from before this change** — absent `reports` defaults to all
  true, which reproduces today's hub exactly. No migration.

## Testing

- Every `REPORT_KEYS` entry has a settings key and vice versa — the two lists
  cannot drift. This is the test that catches a report added to the catalogue
  without a toggle.
- Defaults: all 27 true.
- `catalog()` omits a disabled report and keeps the rest.
- `catalog()` with everything disabled returns an empty list rather than throwing.
- The default-report fallback picks the first _enabled_ report when
  `DEFAULT_REPORT_KEY` is disabled.
- A disabled `?report=` falls back rather than 404ing.
- The preview and export routes still serve a disabled report — the test that
  pins the display-preference boundary, and the one most likely to be broken by a
  future contributor who assumes hidden means forbidden.

## Migration

None. `reports` defaults to all-on.
