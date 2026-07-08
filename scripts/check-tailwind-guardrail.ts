#!/usr/bin/env tsx
/**
 * CI guard: no Tailwind utility classes on migrated Astryx screens (T11.6).
 *
 * apps/web and apps/admin still ship Tailwind 3.4 for the screens that haven't
 * been rebuilt on Astryx + StyleX yet. That coexistence is deliberate — but once
 * a screen is migrated it must stay migrated: a stray `className="flex gap-4"`
 * added later would silently re-introduce a Tailwind dependency and block the
 * eventual decommission (removing tailwind.config / postcss / the `content`
 * globs). This guard freezes each migrated surface Tailwind-free.
 *
 * The set of guarded paths is the {@link MIGRATED_PATHS} manifest below. It is
 * OPT-IN: a path is only enforced once its screen-migration task lands and adds
 * it here. Every entry in `docs/tailwind-decommission.md`'s "Migrated" table must
 * have a matching manifest entry, and vice-versa.
 *
 * Scanning is AST-based (via the TypeScript compiler, like
 * check-controller-guards.ts): only string tokens that reach a JSX `className` /
 * `class` attribute — directly, through a template literal, or as a string
 * argument to a class-composer call (`clsx` / `cn` / `cva` / `classNames` /
 * `twMerge` / `buttonClasses`) — are tested against the Tailwind-utility
 * heuristic. That keeps unrelated strings (ids, URLs, aria text) from tripping
 * it. A single token can be exempted with a same-line `tw-guardrail-allow`
 * comment when a genuine non-Tailwind class collides with the heuristic.
 *
 * Exit 1 (listing offenders) when any guarded file authors a Tailwind utility.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();

/**
 * Migrated, Astryx-owned surfaces that must stay Tailwind-free. Paths are
 * repo-relative; a directory guards every `.ts`/`.tsx` under it (specs skipped).
 *
 * ADD A PATH HERE when its screen-migration task (T11.7 … T11.24) lands, and
 * tick the matching row in docs/tailwind-decommission.md. Do NOT list demo /
 * showcase harnesses (e.g. `astryx-primitives`) — those intentionally use
 * Tailwind to scaffold the primitives they exhibit.
 */
const MIGRATED_PATHS: readonly string[] = [
  // T11.1 / T11.2 — Astryx foundation smoke routes (pure StyleX).
  'apps/web/app/[locale]/astryx-smoke',
  'apps/admin/app/astryx-smoke',
  // T11.1 — brand Theme providers wiring Astryx into each app shell.
  'apps/web/src/components/theme/astryx-provider.tsx',
  'apps/admin/components/theme/astryx-provider.tsx',
  // T11.7 — auth shell + login screen (credentials + Google + Apple). With the
  // forgot/reset screens migrated (T11.9) the whole `_components/auth` dir is now
  // Astryx-only — the legacy `form-controls.tsx` is gone — so it is guarded as a
  // directory rather than file-by-file.
  'apps/web/app/[locale]/login',
  'apps/web/app/[locale]/_components/auth',
  // T11.8 — register + post-signup email-verification screen. Rebuilt inline on
  // Astryx form primitives (no longer routed through `form-controls.tsx`).
  'apps/web/app/[locale]/register',
  // T11.9 — forgot-password (request link) + reset-password (set new password).
  // Rebuilt on the shared Astryx auth shell + Astryx form primitives (StyleX).
  'apps/web/app/[locale]/forgot-password',
  'apps/web/app/[locale]/reset-password',
  // T11.11 — member dashboard: rebuilt on Astryx Card/Button/Badge/Avatar +
  // StyleX. Guarded file-by-file (not the whole `(member)` group) so the
  // not-yet-migrated member screens the shell hosts keep their Tailwind during
  // coexistence.
  'apps/web/app/[locale]/(member)/home/page.tsx',
  'apps/web/src/components/member/home/membership-hero.tsx',
  // T11.12 — member classes list (week/list calendar + filter strip) + class
  // detail + booking CTA. Both route files and the whole classes component dir
  // are rebuilt on Astryx Card/Button/Badge + StyleX (the shared side-sheet
  // shell stays in @fit/ui-web, out of scope). Guarded as directories since the
  // classes route group and component dir are now Astryx-only.
  'apps/web/app/[locale]/(member)/classes',
  'apps/web/src/components/classes',
  // T11.13 — member trainers browse (roster + filter card) + trainer detail
  // (profile + schedule + reviews). Both route files and the whole trainers
  // component dir are rebuilt on Astryx Card/Avatar/Badge/Button + StyleX.
  // Guarded as directories since the trainers route group and component dir are
  // now Astryx-only.
  'apps/web/app/[locale]/(member)/trainers',
  'apps/web/src/components/trainers',
  // T11.14 — member "My bookings" board (upcoming/past segmented control + cancel
  // confirm dialog). The bookings route file is guarded file-by-file (the sibling
  // account screens — profile, membership — keep their Tailwind until T11.16),
  // while the whole `src/components/account` dir is Astryx-only and guarded as a
  // directory.
  'apps/web/app/[locale]/(member)/account/bookings',
  'apps/web/src/components/account',
  // T11.15 — member commerce: shop listing + product card, cart + checkout, and
  // the four-step purchase wizard (+ success). Rebuilt on Astryx
  // Card/Button/IconButton/Badge/Selector/TextInput/CheckboxInput + StyleX.
  // Guarded as directories since the shop / cart / checkout route groups and
  // component dirs are now Astryx-only.
  'apps/web/app/[locale]/(member)/shop',
  'apps/web/src/components/shop',
  'apps/web/app/[locale]/(member)/cart',
  'apps/web/src/components/member/cart',
  'apps/web/app/[locale]/(member)/checkout',
  'apps/web/src/components/checkout',
  // T11.16 — member account: profile (identity + tabbed personal/preferences/
  // notifications/security), membership (plan/status/freeze/credits/invoices)
  // and the notification bell + inbox dropdown. Rebuilt on Astryx
  // Card/Badge/Button/ProgressBar/TabList/TextInput/SegmentedControl/Switch/
  // NumberInput/Popover + StyleX. The account route group is now fully migrated
  // (bookings T11.14 + profile + membership), and the notification bell is
  // guarded file-by-file (the member shell/header stays Tailwind for now).
  'apps/web/app/[locale]/(member)/account/profile',
  'apps/web/app/[locale]/(member)/account/membership',
  'apps/web/src/components/member/profile',
  'apps/web/src/components/member/notification-bell.tsx',
  // T11.17 — admin console shell: the AppShell frame, collapsible SideNav, the
  // TopNav (search + quick-sale + theme toggle + notifications + session menu),
  // the language SegmentedControl and the inline nav icons. Rebuilt on Astryx
  // AppShell/SideNav/TopNav/Button/IconButton/TextInput/DropdownMenu/Badge/
  // StatusDot/Avatar/SegmentedControl + StyleX. This shell hosts every admin
  // screen; the screens it wraps stay Tailwind until T11.18–T11.23 migrate them.
  'apps/admin/components/admin-shell.tsx',
  'apps/admin/components/sidebar.tsx',
  'apps/admin/components/top-bar.tsx',
  'apps/admin/components/nav-icon.tsx',
  'apps/admin/components/locale-switcher.tsx',
  // T11.18 — admin dashboard + analytics: the control-room landing (KPI stat
  // tiles, live occupancy, revenue area chart, plan-mix, schedule, alerts, recent
  // check-ins) and the analytics report (KPIs, revenue chart, channel-mix donut,
  // plan-mix, top classes). Rebuilt on Astryx Card/Badge/SegmentedControl + a
  // brand-tokened StyleX chart kit (`charts.tsx`) — no Tailwind, no Recharts. The
  // dashboard landing is guarded file-by-file (the sibling `kpi-card.tsx` is a
  // dead FormaCore leftover the T11.24 sweep removes, so it stays out of the
  // manifest); the analytics route group is Astryx-only and guarded as a directory.
  'apps/admin/app/(dashboard)/page.tsx',
  'apps/admin/app/(dashboard)/dashboard-view.tsx',
  'apps/admin/app/(dashboard)/charts.tsx',
  'apps/admin/app/(dashboard)/analytics',
  // T11.19 — admin members + trainers (list + detail + create/edit): rosters
  // rebuilt on the Astryx DataTable + FilterChips + TableSearch kit, plan-mix and
  // profile/schedule cards on Astryx Card/Badge/Avatar, and the create/edit forms
  // on the Astryx Form kit — all layout in brand-tokened StyleX, no Tailwind. Both
  // route groups (list, `[id]` detail + tabs, `new`, `[id]/edit`) are now
  // Astryx-only, so each is guarded as a directory.
  'apps/admin/app/(dashboard)/members',
  'apps/admin/app/(dashboard)/trainers',
  // T11.20 — admin check-in board (scanner viewport + debounced member lookup +
  // eligibility card + live arrivals feed), the schedule week-calendar (day-column
  // occurrence cards + occupancy bars + the class-instance Drawer with roster /
  // capacity / quick-actions) and the class-templates surfaces (list on the Astryx
  // DataTable kit, detail, create/edit form + recurrence editor). Rebuilt on Astryx
  // Card/DataTable/Drawer/Badge/Button + brand-tokened StyleX, no Tailwind. Each
  // route group is now Astryx-only, so each is guarded as a directory.
  'apps/admin/app/(dashboard)/check-in',
  'apps/admin/app/(dashboard)/schedule',
  'apps/admin/app/(dashboard)/classes',
  // T11.21 — admin operational screens: the activity feed + audit-log (filterable
  // event stream with type icons / relative times, tabbed with the audit trail),
  // staff management (roster KPIs, staff + pending-invite tables, invite modal,
  // role changes / removal), locations CRUD (board + detail + create/edit form
  // with weekly-hours and amenities editors) and gym settings (brand / locale /
  // business-hours / notification sender). Rebuilt on Astryx
  // Card/DataTable/FilterChips/Badge/Form-kit + brand-tokened StyleX, no Tailwind.
  // Each route group is now Astryx-only, so each is guarded as a directory.
  'apps/admin/app/(dashboard)/activity',
  'apps/admin/app/(dashboard)/audit-log',
  'apps/admin/app/(dashboard)/staff',
  'apps/admin/app/(dashboard)/locations',
  'apps/admin/app/(dashboard)/settings',
  // T11.22 — admin commerce screens: orders list + detail (status timeline +
  // refund form), the POS workspace (product grid + cart pane + member lookup +
  // cash/card/member-account payment modal) with end-of-day reconciliation, the
  // product catalog (grid + filters + editor + low-stock adjuster) and the
  // reports hub (report cards, date presets, CSV/XLSX export). Rebuilt on Astryx
  // Card/DataTable/Badge/Modal/Form-kit + brand-tokened StyleX, no Tailwind.
  // Each route group (and the POS component dir) is now Astryx-only, so each is
  // guarded as a directory.
  'apps/admin/app/(dashboard)/orders',
  'apps/admin/app/(dashboard)/pos',
  'apps/admin/app/(dashboard)/products',
  'apps/admin/app/(dashboard)/reports',
  'apps/admin/components/pos',
  // T12.3 — the CRM workspace (Leads | Opportunities | Forecast shell): the
  // leads roster on the Astryx DataTable/FilterChips/TableSearch kit, the
  // add/edit lead form + won/lost close dialogs on the Modal kit, and the lead
  // detail (info/KPI cards + overview/activity/notes/tasks tabs). Born on
  // Astryx + brand-tokened StyleX — never had Tailwind — and guarded as a
  // directory so it stays that way.
  'apps/admin/app/(dashboard)/crm',
];

/** Class composers whose string arguments end up as `className`. */
const CLASS_COMPOSERS = new Set([
  'clsx',
  'cn',
  'cva',
  'classNames',
  'twMerge',
  'twJoin',
  'buttonClasses',
]);

/** Same-line escape hatch for a false positive. */
const ALLOW_MARKER = 'tw-guardrail-allow';

/**
 * Whole-token test for a Tailwind utility class. Variant prefixes
 * (`sm:` `dark:` `hover:` `group-hover:` …), a leading `!` (important) and a
 * leading `-` (negative) are stripped first, then the base is matched against
 * the utility families Tailwind ships. Arbitrary-value utilities (`w-[3px]`,
 * `bg-[#fff]`) match through their family prefix.
 */
const TAILWIND_BASE = new RegExp(
  '^(' +
    // display / box
    'block|inline-block|inline|flex|inline-flex|grid|inline-grid|table|table-[a-z-]+|' +
    'flow-root|contents|hidden|isolate|isolation-[a-z]+|' +
    // flex / grid
    'flex-(row|row-reverse|col|col-reverse|wrap|wrap-reverse|nowrap|1|auto|initial|none|grow|shrink)|' +
    'grow(-0)?|shrink(-0)?|order-.+|' +
    'grid-cols-.+|grid-rows-.+|col-.+|row-.+|auto-cols-.+|auto-rows-.+|grid-flow-.+|' +
    'gap-.+|gap-x-.+|gap-y-.+|' +
    'items-.+|justify-.+|justify-items-.+|justify-self-.+|content-.+|self-.+|place-.+|' +
    // spacing
    'p[trblxyse]?-.+|m[trblxyse]?-.+|-?m[trblxyse]?-.+|space-[xy]-.+|' +
    // sizing
    'w-.+|h-.+|size-.+|min-w-.+|min-h-.+|max-w-.+|max-h-.+|' +
    // typography
    'text-.+|font-.+|leading-.+|tracking-.+|align-.+|whitespace-.+|break-.+|' +
    'uppercase|lowercase|capitalize|normal-case|italic|not-italic|' +
    'underline|overline|line-through|no-underline|truncate|antialiased|subpixel-antialiased|' +
    'tabular-nums|proportional-nums|list-.+|indent-.+|' +
    // backgrounds / borders / effects
    'bg-.+|from-.+|via-.+|to-.+|' +
    'border|border-.+|divide-.+|rounded|rounded-.+|' +
    'ring|ring-.+|outline|outline-.+|shadow|shadow-.+|' +
    'opacity-.+|mix-blend-.+|' +
    'fill-.+|stroke-.+|' +
    // filters / transforms / transitions
    'blur|blur-.+|backdrop-.+|brightness-.+|contrast-.+|grayscale.*|saturate-.+|' +
    'transform|transform-.+|scale-.+|-?scale-.+|rotate-.+|-?rotate-.+|translate-.+|-?translate-.+|skew-.+|-?skew-.+|origin-.+|' +
    'transition|transition-.+|duration-.+|ease-.+|delay-.+|animate-.+|' +
    // position / layout
    'absolute|relative|fixed|sticky|static|' +
    'top-.+|-?top-.+|right-.+|-?right-.+|bottom-.+|-?bottom-.+|left-.+|-?left-.+|inset-.+|-?inset-.+|z-.+|' +
    'float-.+|clear-.+|overflow-.+|overscroll-.+|object-.+|aspect-.+|' +
    // interactivity / misc
    'cursor-.+|select-.+|pointer-events-.+|resize.*|scroll-.+|snap-.+|touch-.+|will-change-.+|' +
    'container|sr-only|not-sr-only|appearance-.+|columns-.+|' +
    ')$',
);

/** Strip variant chain (`sm:hover:`), leading `!`, and one leading `-`. */
function tailwindBase(token: string): string {
  let base = token;
  // Peel variant prefixes: any run of `word:` (incl. arbitrary `[...]:`).
  while (true) {
    const m = base.match(/^(?:[a-z][a-z0-9-]*|\[[^\]]*\]|group|peer)[:]/);
    if (!m) break;
    base = base.slice(m[0].length);
  }
  if (base.startsWith('!')) base = base.slice(1);
  return base;
}

/** Does a whitespace-separated class token look like a Tailwind utility? */
function isTailwindToken(token: string): boolean {
  const base = tailwindBase(token);
  if (!base) return false;
  return TAILWIND_BASE.test(base);
}

interface Offender {
  file: string;
  line: number;
  token: string;
}

/** Collect `*.ts`/`*.tsx` under a path (skips specs, node_modules, build dirs). */
function collectFiles(target: string, out: string[]): void {
  if (!existsSync(target)) return;
  const stat = statSync(target);
  if (stat.isFile()) {
    if (/\.tsx?$/.test(target) && !/\.(spec|test)\.tsx?$/.test(target)) out.push(target);
    return;
  }
  for (const entry of readdirSync(target)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.next') continue;
    collectFiles(join(target, entry), out);
  }
}

/** Every string literal reachable inside a className/class attribute value. */
function classStringLiterals(init: ts.Node): string[] {
  const strings: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      strings.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      strings.push(node.head.text, ...node.templateSpans.map((s) => s.literal.text));
    } else if (ts.isCallExpression(node)) {
      // clsx('a', cond && 'b', { c: x }) — only enforce the string parts.
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : '';
      if (CLASS_COMPOSERS.has(name)) node.arguments.forEach(visit);
      else ts.forEachChild(node, visit);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(init);
  return strings;
}

function scan(file: string, sourceLines: string[]): Offender[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const offenders: Offender[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      (node.name.text === 'className' || node.name.text === 'class') &&
      node.initializer
    ) {
      const init = ts.isJsxExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      if (init) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        const rawLine = sourceLines[line] ?? '';
        if (!rawLine.includes(ALLOW_MARKER)) {
          for (const literal of classStringLiterals(init)) {
            for (const token of literal.split(/\s+/)) {
              if (token && isTailwindToken(token)) {
                offenders.push({ file: relative(ROOT, file), line: line + 1, token });
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return offenders;
}

const files: string[] = [];
for (const p of MIGRATED_PATHS) collectFiles(resolve(ROOT, p), files);

const missing = MIGRATED_PATHS.filter((p) => !existsSync(resolve(ROOT, p)));
if (missing.length > 0) {
  console.error('Tailwind guardrail: manifest lists paths that no longer exist:\n');
  for (const p of missing) console.error(`  ${p}`);
  console.error('\nUpdate MIGRATED_PATHS in scripts/check-tailwind-guardrail.ts.');
  process.exit(1);
}

const offenders = files.flatMap((f) => scan(f, readFileSync(f, 'utf8').split('\n')));

if (offenders.length > 0) {
  console.error('Tailwind utility classes found on migrated Astryx screens:\n');
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}  "${o.token}"`);
  }
  console.error(
    '\nMigrated screens must style with Astryx components + StyleX (`xstyle` / ' +
      '`stylex.props`), not Tailwind utilities. Replace the class above, or — if it ' +
      `is a genuine non-Tailwind class — add a same-line \`${ALLOW_MARKER}\` comment.`,
  );
  process.exit(1);
}

console.log(
  `✓ ${files.length} migrated file(s) across ${MIGRATED_PATHS.length} guarded path(s) are Tailwind-free.`,
);
