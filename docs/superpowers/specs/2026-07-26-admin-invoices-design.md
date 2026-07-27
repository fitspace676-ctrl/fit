# Admin-created invoices — design

**Date:** 2026-07-26
**Status:** approved

## Problem

The Payments hub's Invoices tab is a placeholder. Our billing backend issues numbered
invoices automatically (subscription enrolment, each renewal, POS orders) and can
render any of them as a PDF, but staff cannot:

- raise an invoice by hand,
- see the gym's invoices in one place, or
- get an invoice to a member.

Staff need all three: create an invoice against a member with a description, a price
and a type, then either download it or email it.

## What already exists

| Piece                                                                                                                               | Where                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Invoice` model — `memberId`, `description`, `amount`, `currency`, `status`, `issuedAt`, `pdfUrl`, per-gym-year sequential `number` | `packages/db/prisma/schema.prisma`                                                                                     |
| `InvoiceService.issue()` — allocates the number and inserts the row inside the caller's transaction                                 | `apps/api/src/billing/invoice.service.ts`                                                                              |
| PDF rendering, cached to R2                                                                                                         | `apps/api/src/billing/invoice-document.service.ts`, `invoice-pdf.service.ts`                                           |
| `GET /invoices/:id/pdf` (`BillingRead`) + an admin proxy route                                                                      | `apps/api/src/billing/invoices.controller.ts`, `apps/admin/app/(dashboard)/payments/invoices/[invoiceId]/pdf/route.ts` |
| `MailerService` (Resend), and `POST /members/:id/email` as a precedent                                                              | `apps/api/src/mail/mailer.service.ts`                                                                                  |

## What's missing

A gym-wide list endpoint, a manual-create endpoint, an `invoice type` column, a
`dueDate` column, an email-the-invoice endpoint, and the entire UI.

## Design

### 1. Data model — one migration

New enum:

```prisma
enum InvoiceType {
  MEMBERSHIP
  PERSONAL_TRAINING
  CLASS
  PRODUCT
  SERVICE
  OTHER
}
```

`Invoice` gains:

- `type InvoiceType @default(OTHER)` — what the invoice is raised _for_. The migration
  backfills existing rows: `subscriptionId IS NOT NULL` → `MEMBERSHIP`,
  `orderId IS NOT NULL` → `PRODUCT`, otherwise `OTHER`.
- `dueDate DateTime?` — when payment is expected. Set only on a `PENDING` invoice.

`InvoiceService.issue()` gains a `type` argument so automatic invoices classify
themselves at the source (subscription billing passes `MEMBERSHIP`, POS passes
`PRODUCT`). Numbering stays in one place.

A manual invoice is an ordinary `Invoice` row with `subscriptionId` and `orderId`
null — already permitted by the schema. No second model, no parallel numbering.

### 2. API — `apps/api/src/billing/`

| Endpoint                         | Permission      | Purpose                                                                                                 |
| -------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `GET /admin/invoices`            | `BillingRead`   | Paginated gym-wide list. Filters: `search` (number or member name), `status`, `issuedFrom`, `issuedTo`. |
| `POST /admin/invoices`           | `BillingManage` | Raise an invoice by hand; delegates to `InvoiceService.issue()` in a transaction.                       |
| `POST /admin/invoices/:id/email` | `BillingManage` | Fetch the PDF via `InvoiceDocumentService.getPdf()` and mail it as an attachment.                       |
| `GET /invoices/:id/pdf`          | `BillingRead`   | Already exists, unchanged.                                                                              |

`MailerService.MailMessage` gains an optional `attachments: { filename, content }[]`
(Resend supports these natively).

Failure modes:

- Resend unconfigured → `503 EMAIL_NOT_CONFIGURED`, mirroring `POST /members/:id/email`.
- Invoice has no member, or the member has no email → `422`.
- Unknown or cross-tenant invoice id → `404`.

### 3. Types — `packages/types/src/invoices-admin.ts`

`invoiceTypeSchema`, `createInvoiceSchema`, `listAdminInvoicesQuerySchema`, plus the
row and response interfaces.

`createInvoiceSchema.superRefine`: a `PENDING` invoice requires `dueDate`; a `PAID`
one forbids it. The admin server action and the API validate with the same schema, so
the form and the controller cannot drift.

### 4. Admin UI — `apps/admin/app/(dashboard)/payments/invoices/`

The placeholder becomes a real board, following the patterns already used by the plans
board and the New-plan drawer:

- `page.tsx` — server-fetches a page of invoices; filters live in the URL.
- `invoices-table.tsx` — Invoice # · Member · Type · Issue date · Due date · Amount ·
  Status · Actions.
- `invoice-filters.tsx` — search, status, issue-date range.
- `create-invoice-drawer.tsx` — `useSlideDrawer` + Astryx `Dialog`, the console's
  standard slide-in.
- `invoice-form.tsx` — member typeahead (following `searchMembersForBookingAction`),
  type, description, price in GEL, status, and a due date shown only for `PENDING`.
- Row actions: **Download PDF** (the existing proxy route) and **Send email**.

### Decisions

- The email goes to the linked member's address. No free-text recipient.
- New invoices are priced in GEL, matching the plans form.
- The reference screenshot is a guide to _content_, not a pixel target; the board uses
  our own design system.

### Out of scope (YAGNI)

Excel export · editing or deleting an invoice · recurring invoices · multi-line items
(one description and one amount, as requested).
