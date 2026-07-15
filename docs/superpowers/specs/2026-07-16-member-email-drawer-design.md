# Member Email Drawer — Design

**Date:** 2026-07-16
**Status:** Approved (pending spec review)

## Goal

Let `MemberWrite` staff send a **one-off email to a single gym member** from the
member detail page. The current top-right **"Message"** button is a disabled
placeholder; it becomes an enabled **"Email"** button that opens a drawer to
compose and send. Staff can start from an existing gym email template (subject +
body pre-filled and personalized to this member) or write a custom message from
scratch.

## Non-goals (YAGNI)

Attachments, SMS/push channels, CC/BCC, scheduling/send-later, rich-text editor,
delivery/open tracking, creating or editing templates from the drawer, bulk send.
Just subject + body (plain text), one recipient, sent now.

## Context / reuse

- **Transport:** `MailerService` (`apps/api/src/mail/mailer.service.ts`) — the
  modern shared Resend transport, `@Global`, injectable anywhere. `send({ to,
subject, html, text, from?, replyTo? })`; `isConfigured` is `false` when
  `RESEND_API_KEY` is unset. This is real, working infra (verification/receipt
  mail already ships through Resend).
- **Branded rendering:** `renderBrandedEmail({ senderName, heading, contentHtml,
footerNote? })` + `escapeHtml` (`apps/api/src/mail/branded-email.ts`). Callers
  must escape user-supplied text.
- **Templates:** the Marketing `MessageTemplate` model (gym-scoped: `name`,
  `channel`, `subject`, `body`, `category`), served by `GET /marketing/templates`.
  Merge tokens are catalogued in `MARKETING_MERGE_FIELDS` (`packages/types/src/
marketing.ts`): `{{first_name}}`, `{{last_name}}`, `{{email}}`, `{{phone}}`,
  `{{plan_name}}`, `{{expiry_date}}`, `{{location}}`, `{{business_name}}`, etc.
  Note: marketing's own bulk send + token substitution are **stubbed**. This
  feature implements a real send + interpolation for the single-member case only;
  it does not change marketing's bulk path.
- **Member → email:** identity (`name`, `email`) lives on the cross-tenant `User`
  via `GymMember.user`. `MembersService.requireMember(id)` resolves a live
  `MEMBER`-role membership in the tenant or throws `404 MEMBER_NOT_FOUND`.

## Architecture

Three units, each with one job:

### 1. Shared merge-field interpolation — `@fit/types`

A pure helper so client (live preview) and server (final safety pass) expand
tokens identically.

```ts
// packages/types/src/marketing.ts (or a small merge-fields module)
export type MergeValues = Partial<Record<MarketingMergeFieldKey, string>>;

/** Replace every `{{token}}` in `text`. Tokens present in `values` become their
 *  value; any remaining token from the known catalog is blanked (never leak raw
 *  `{{…}}` to a recipient); unknown tokens are left untouched. */
export function interpolateMergeFields(text: string, values: MergeValues): string;
```

`MarketingMergeFieldKey` derives from `MARKETING_MERGE_FIELDS`. The member's
values map (`first_name`, `last_name`, `email`, `phone`, `plan_name`,
`expiry_date`, `business_name`) is assembled from the member detail on the client
and re-assembled on the server from the DB row.

### 2. Backend — `POST /members/:id/email`

- **Contract (`@fit/types`):** `sendMemberEmailSchema` = `{ subject: string (1–200),
body: string (1–5000) }`. Response: `{ sent: boolean }` (`SendMemberEmailResponse`).
- **Controller** (`members.controller.ts`): mirrors `addNote` —
  ```ts
  @Post(':id/email')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MemberWrite)
  async sendEmail(@Param('id') id: string, @Body() body: unknown): Promise<SendMemberEmailResponse> {
    return this.members.sendMemberEmail(id, parse(sendMemberEmailSchema, body));
  }
  ```
- **Service** `MembersService.sendMemberEmail(id, { subject, body })`:
  1. Resolve the recipient with the same live-member guard as the other writes: a
     tenant-scoped `findFirst({ where: { id, role: MEMBER, deletedAt: null } })`
     selecting `user.email`, `user.name`, the live plan name + next-billing, and
     the gym name for the merge values; `404 MEMBER_NOT_FOUND` if it doesn't match
     (same contract as `requireMember`, but `requireMember`'s fixed `{ id, userId }`
     select stays untouched — this method uses its own select).
  2. Build `MergeValues` from the row; run `interpolateMergeFields` over subject
     and body (safety net — client already interpolated, but staff may have left a
     token, and a custom message is never pre-interpolated).
  3. Render: `text` = interpolated body; `html` = `renderBrandedEmail({ senderName:
gymName, heading: subject, contentHtml: escapeHtml(body)→<br> paragraphs })`.
  4. If `!mailer.isConfigured` → throw a `503`/domain error mapped to a clear
     staff-facing message (do **not** report success when nothing was sent).
  5. `await mailer.send({ to: user.email, subject, html, text })`; if Resend
     returns `sent: false`, surface an error. Return `{ sent: true }`.
- Inject the global `MailerService` into `MembersService` (constructor only; no
  module import needed — `MailModule` is `@Global`).

### 3. Frontend — Email button + drawer

- **Button:** in `members/[id]/page.tsx`, replace the disabled "Message" `Btn`
  with an enabled **Email** button (mail icon), rendered only for `canWrite`
  staff (the same `MemberWrite` gate the page already computes). It opens the
  drawer (client component).
- **`EmailMemberDrawer`** (new client component, following `add-member-drawer.tsx`
  / `ConfirmDialog` patterns):
  - **Recipient:** the member's email, shown read-only.
  - **Template selector:** the gym's `email`-channel templates. Lazy-loaded when
    the drawer opens via a server action `listEmailTemplatesAction()` that calls
    `GET /marketing/templates` and filters `channel === 'email'`. If the fetch
    fails or the list is empty, the selector degrades to "Blank message" only —
    custom compose always works.
  - **Compose:** `subject` input + `body` textarea, both editable. Selecting a
    template fills them with the template's subject/body, `interpolateMergeFields`
    applied for this member; "Blank" clears them.
  - **Send:** calls `sendMemberEmailAction(memberId, { subject, body })` →
    `POST /members/:id/email`; success toast + close, error toast on failure.
    Disabled while sending or when subject/body empty.
- **api client** (`lib/api.ts`): `sendMemberEmail(id, input)`; reuse the existing
  marketing templates fetcher for the list.
- **server actions** (`members/actions.ts`): `sendMemberEmailAction` (MemberWrite
  gate + `sendMemberEmailSchema` validate + map errors), `listEmailTemplatesAction`.

## Data flow

1. Staff clicks **Email** → drawer opens → `listEmailTemplatesAction` loads email
   templates.
2. Staff picks a template → client interpolates its subject/body with this
   member's merge values → fields pre-fill (editable). Or picks **Blank** and types.
3. **Send** → `sendMemberEmailAction` → `POST /members/:id/email`.
4. Server re-validates, resolves the recipient, runs the safety interpolation,
   renders the branded email, sends via Resend, returns `{ sent: true }`.
5. Toast confirms; drawer closes.

## Error handling

- Invalid body → `400` (Zod, per-field detail) → inline/toast error.
- Unknown / cross-tenant / trashed member id → `404 MEMBER_NOT_FOUND`.
- `RESEND_API_KEY` unset (dev/preview) → explicit "email is not configured"
  error surfaced to staff; never a false success.
- Resend non-2xx / `sent: false` → error toast; drawer stays open so staff can retry.
- Templates fetch failure → silent degrade to custom-only (logged, not fatal).

## Testing

- **Unit — `interpolateMergeFields`** (`@fit/types`): provided tokens replaced;
  catalog tokens with no value blanked; unknown tokens left intact; no raw `{{…}}`
  leaks for known tokens.
- **Unit — `MembersService.sendMemberEmail`**: calls the mailer with the resolved
  recipient + rendered subject/body; 404 for unknown member; throws when the
  mailer is not configured; returns `{ sent: true }` on success. (Mailer + Prisma
  mocked, mirroring existing member-service specs.)
- **Schema** — `sendMemberEmailSchema` rejects empty/oversized subject/body.
- **i18n parity** — new `admin.members.email.*` keys added to en + ka.

## i18n

New `admin.members.email.*` block (both locales): button label, drawer title,
recipient label, template-select label + "Blank" option, subject/body labels +
placeholders, send/sending labels, success/error toasts, "not configured" error.

## Files touched

- `packages/types/src/marketing.ts` — `interpolateMergeFields`, `MergeValues`,
  `MarketingMergeFieldKey`.
- `packages/types/src/members.ts` — `sendMemberEmailSchema`, `SendMemberEmailResponse`.
- `apps/api/src/members/members.controller.ts` — `POST :id/email`.
- `apps/api/src/members/members.service.ts` — `sendMemberEmail`, inject `MailerService`.
- `apps/api/src/members/members.service.spec.ts` — tests.
- `apps/admin/lib/api.ts` — `sendMemberEmail` (+ reuse templates fetch).
- `apps/admin/app/(dashboard)/members/actions.ts` — `sendMemberEmailAction`,
  `listEmailTemplatesAction`.
- `apps/admin/app/(dashboard)/members/[id]/email-member-drawer.tsx` — new.
- `apps/admin/app/(dashboard)/members/[id]/page.tsx` — Email button wiring.
- `packages/i18n/locales/{en,ka}.json` — `admin.members.email.*`.
