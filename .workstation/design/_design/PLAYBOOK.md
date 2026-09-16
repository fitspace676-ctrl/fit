# Design Playbook
_A senior design engine. Run the process, pick ONE art direction, apply the matching archetype as a STARTING structure, then make it distinct and self-critique. Premium = restraint + precision + detail — never visual excess._

## 1 — Design process (run this EVERY screen — this is how a senior designer works)
1. Brief (2–3 lines to yourself): the screen's ONE job, the audience, the emotional tone.
2. Reference pass: recall or quickly search 2–3 best-in-class products for this screen type + domain; note their layout skeleton, their ONE signature move, and the clichés they avoid.
3. Explore TWO distinct directions: consider two genuinely different art directions (from the library below); pick the one that best fits the brand AND is most distinctive. Commit — never just ship the first, average idea.
4. Build to the matching archetype, expressing the chosen direction.
5. Self-critique, SCORED 1–5: distinctiveness · focal point + hierarchy · on-brand & on-domain · restraint (color/weight) · spacing rhythm · state coverage · real content.
6. Refine pass: for anything below 4, REDESIGN that part (don't just nudge it). Ship only at a senior bar.

## 2 — Operating principles (always)
- Neutral `ink` canvas; brand accent used WITH PURPOSE in 1–2 focal places only.
- Weight discipline: medium for UI chrome, bold reserved for hero moments.
- 4-pt spacing, generous + deliberately uneven whitespace, real section pacing.
- Asymmetry / editorial structure over centered-everything; ONE clear focal point.
- Every interactive element: hover / focus-visible / active / disabled (+ loading / error).
- Real, specific copy in the project's voice + language. Never lorem / placeholders.
- AA contrast, visible focus. Stay 100% on the design-system tokens/components.
- PLATFORM & DIMENSIONS — match the target. A MOBILE app: design each screen inside a phone frame (~390px wide; notch, safe areas, a bottom tab/nav, thumb-reachable actions). A WEB app / site: ~1200px, responsive where it matters. A TABLET: ~768px. Never lay out a mobile app as a wide web page, or a web page as a tall phone. For a dark app, set `surface` in tokens.json so the canvas frame matches.

## 3 — Art-direction library (pick ONE and commit; it shapes composition/type/density, not new colors)
- Editorial / Swiss: strong grid, oversized type, lavish whitespace, very few accents — confident, magazine-like.
- Technical-minimal (Linear / Vercel feel): tight, near-monochrome, mono numerals, crisp hairline borders, restrained motion — dev tools, precise SaaS.
- Refined-confident (Stripe feel): clean, trustworthy, subtle depth, one strong accent — fintech, B2B.
- Warm-organic: softer radii, friendly tone, human imagery, gentle color — consumer, wellness, community.
- Premium-dark: deep ink surfaces, high contrast, glow/accent used sparingly — premium, creative.
- Brutalist-utility: raw, dense, high-information, deliberate alignment — power users, internal tools.

## 4 — Archetype blueprints
Each: Goal · Structure (a strong, non-generic skeleton) · Signature · Pitfalls.

### Marketing / Landing
- Goal: earn trust + convert. Structure: an opinionated hero (asymmetric — bold editorial type OR a real product peek to one side, NOT centered headline + two buttons), tangible proof, a few feature moments told as a STORY (alternating / asymmetric, never a symmetric 3-card row), pricing, a confident CTA band, footer.
- Signature: one bold hero idea — oversized type, a real UI screenshot-style mock, or an editorial image treatment.
- Pitfalls: centered hero formula, symmetric 3 feature cards, stocky imagery, gradient blobs, "trusted by" logo soup.

### App shell / Dashboard
- Goal: at-a-glance status + fast action. Structure: role-aware sidebar + top bar (search, context, ONE primary action); a focused KPI row (real numbers WITH deltas/trend, not four identical cards); a primary work area (a chart or list that gives a real insight); a secondary feed/list.
- Signature: a hero metric or one genuinely well-designed chart.
- Pitfalls: four identical stat cards + a meaningless chart, no clear primary, cramming everything equally.

### Data table / list (members, orders, products…)
- Goal: scan, filter, act. Structure: header (title + primary action + search/filter chips); dense-but-readable rows (identity w/ avatar, status badge, key columns, tabular numbers, row actions revealed on hover); sticky header; pagination; bulk actions; empty / loading / error states.
- Signature: excellent row rhythm + genuinely useful filters.
- Pitfalls: clunky filters, no hover affordances, centered cells, fake data, ignoring empty/loading.

### Form / auth / wizard
- Goal: low-friction completion. Structure: focused single column (or a split with a branded side panel), clear labels, grouped sections, inline validation with helpful errors, ONE obvious primary; wizards get a step indicator + back/next + progress.
- Signature: a calm, confident, uncluttered layout.
- Pitfalls: one long unbroken form, unclear errors, weak/again-centered primary, no field grouping.

### Settings
- Goal: find + change safely. Structure: section nav (or anchored sections) + content; each setting a row (label + helper text + control); destructive actions visually separated (danger zone).
- Pitfalls: a wall of inputs with no grouping or descriptions.

### Detail page (class, product, profile, order…)
- Goal: understand + act. Structure: a strong header (identity, key facts, primary action), a tabbed or sectioned body, related/secondary content, sticky action bar where useful.
- Signature: a confident, information-rich header.
- Pitfalls: weak header, everything the same size, no clear primary action.

### Pricing
- Goal: choose with confidence. Structure: clear tiers with ONE highlighted via asymmetric scale/contrast (not just a badge), honest feature lists, a monthly/annual toggle; B2B → add a comparison table.
- Pitfalls: three identical cards, a fake "most popular", vague feature lists.

### States (design these, don't skip)
- Empty: a small custom inline-SVG mark + one clear primary action + a line of guidance.
- Loading: skeletons that match the real layout (not a spinner).
- Error: calm, specific, recoverable (what happened + a retry).

### Calendar / scheduling (timetables, bookings)
- Goal: see availability + book fast. Structure: a view switch (day / week / list), a real time-grid or time-gutter list grouped by day, color-coded by type, capacity shown (booked / cap), inline book / waitlist; filters (type, trainer/owner, location).
- Signature: a legible, dense-but-calm time grid.
- Pitfalls: a generic month calendar with dots, no capacity, no filters, no list fallback.

### Analytics / reports
- Goal: insight, not decoration. Structure: a focused summary row (KPIs WITH deltas vs a period), 1–2 primary charts that answer a real question, a breakdown table, date-range + segment controls.
- Signature: a chart that tells a story (clear comparison / trend).
- Pitfalls: chartjunk, many meaningless charts, no period comparison.

### Board / kanban
- Goal: move work across stages. Structure: columns with counts, compact cards (title, meta, avatar, labels), clear drag affordances, quick add, gentle WIP cues.
- Pitfalls: oversized cards, no column counts, flat card hierarchy.

### Inbox / chat / activity
- Goal: triage + respond. Structure: a list pane (sender, snippet, time, unread weight) + a detail / thread pane; filters / segments; a composer.
- Signature: a clear unread to read rhythm.
- Pitfalls: equal-weight rows, no thread structure, no states.

### Onboarding wizard
- Goal: reach value fast. Structure: a few focused steps, a step indicator, ONE decision per step, smart defaults, progress + skip, a confident "you're set" finish.
- Pitfalls: a long form per step, no progress, no defaults.

### Checkout / cart / POS
- Goal: complete with zero friction. Structure: clear line items, an honest totals breakdown, payment method, ONE strong CTA; POS adds product search + cart + member lookup + tender (cash / card / account).
- Signature: a calm, trustworthy summary.
- Pitfalls: hidden fees, a weak CTA, clutter, no order summary.

## 5 — Domain adaptation
Adapt density, tone and patterns to the domain: fintech → precise, dense, trustworthy; consumer → warm, spacious, friendly; dev tools → technical, mono accents, keyboard-first; healthcare → calm, legible, reassuring; commerce → product-forward, imagery-led; internal B2B → efficient, information-dense.
