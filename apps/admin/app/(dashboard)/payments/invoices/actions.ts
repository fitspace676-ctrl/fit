'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  Permission,
  createInvoiceSchema,
  roleHasPermission,
  type AdminInvoiceRow,
  type CreateInvoiceInput,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, createAdminInvoice, emailAdminInvoice, fetchMembers } from '@/lib/api';

/** Discriminated result returned to the client component — never throws across the boundary. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * One member match the create drawer's picker renders — just enough to identify a
 * person, not the full roster row. Declared here rather than imported from the
 * schedule's own search so the two screens stay independent.
 */
export interface InvoiceMemberMatch {
  id: string;
  name: string;
  email: string | null;
}

/** How many members the create drawer's typeahead offers at once. */
const MEMBER_SEARCH_LIMIT = 8;

/**
 * Re-assert a capability inside the action itself. The middleware gates the
 * `/payments` route, but a Server Action is its own POST endpoint, so re-checking
 * here is defence in depth (the API re-checks again behind its guards).
 */
async function sessionHas(permission: Permission): Promise<boolean> {
  const session = await getServerSession();
  return session !== null && roleHasPermission(session.role, permission);
}

const requireBillingManage = () => sessionHas(Permission.BillingManage);

type ErrorT = Awaited<ReturnType<typeof getTranslations>>;

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown, t: ErrorT): string {
  if (error instanceof ApiError) {
    if (error.message === 'EMAIL_NOT_CONFIGURED') {
      return t('emailNotConfigured');
    }
    if (error.message === 'INVOICE_HAS_NO_RECIPIENT') {
      return t('noRecipient');
    }
    if (error.message === 'INVOICE_NOT_FOUND') {
      return t('invoiceNotFound');
    }
    if (error.message === 'MEMBER_NOT_FOUND') {
      return t('memberNotFound');
    }
    return t('requestFailed', { status: error.status, message: error.message });
  }
  return error instanceof Error ? error.message : t('unexpected');
}

/** Map the first Zod validation issue to a localized message. */
function validationMessage(
  issues: ReadonlyArray<{ path: PropertyKey[]; code: string }>,
  t: ErrorT,
): string {
  const issue = issues[0];
  const field = issue?.path[0];
  if (field === 'memberId') {
    return t('validation.memberRequired');
  }
  if (field === 'description') {
    return issue?.code === 'too_big'
      ? t('validation.descriptionTooLong')
      : t('validation.descriptionRequired');
  }
  if (field === 'amount') {
    if (issue?.code === 'too_small') return t('validation.amountPositive');
    if (issue?.code === 'too_big') return t('validation.amountTooLarge');
    return t('validation.amountInvalid');
  }
  if (field === 'dueDate' || field === 'issuedAt') {
    return t('validation.dateInvalid');
  }
  return t('invalidInvoiceDetails');
}

/**
 * Search the gym's members for the create drawer's picker. Gated on `BillingManage` —
 * the same capability raising the invoice needs — so the search only runs for staff
 * who can act on the result. A blank query returns no matches without a round-trip.
 */
export async function searchMembersForInvoiceAction(
  query: string,
): Promise<ActionResult<InvoiceMemberMatch[]>> {
  const t = await getTranslations('admin.invoicesHub.errors');
  if (!(await requireBillingManage())) {
    return { ok: false, error: t('notAuthorized') };
  }
  const search = query.trim();
  if (!search) {
    return { ok: true, data: [] };
  }
  try {
    const { data } = await fetchMembers({ search, limit: MEMBER_SEARCH_LIMIT });
    return {
      ok: true,
      data: data.map((member) => ({ id: member.id, name: member.name, email: member.email })),
    };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Raise an invoice by hand. Re-validates the body with the same Zod schema the API
 * uses — including the PAID/PENDING due-date rule — enforces `BillingManage`, then
 * refreshes the roster. Returns the new invoice so the drawer can report its number.
 */
export async function createInvoiceAction(
  input: CreateInvoiceInput,
): Promise<ActionResult<AdminInvoiceRow>> {
  const t = await getTranslations('admin.invoicesHub.errors');
  if (!(await requireBillingManage())) {
    return { ok: false, error: t('notAuthorized') };
  }
  const parsed = createInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: validationMessage(parsed.error.issues, t) };
  }
  try {
    const invoice = await createAdminInvoice(parsed.data);
    revalidatePath('/payments/invoices');
    return { ok: true, data: invoice };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}

/**
 * Email an invoice to the member it bills, PDF attached. Enforces `BillingManage`.
 * The two expected failures — mail not configured, and no address to send to — come
 * back as plain sentences rather than status codes, since neither is something the
 * staffer can fix from this screen.
 */
export async function emailInvoiceAction(id: string): Promise<ActionResult<{ to: string }>> {
  const t = await getTranslations('admin.invoicesHub.errors');
  if (!(await requireBillingManage())) {
    return { ok: false, error: t('notAuthorized') };
  }
  try {
    const result = await emailAdminInvoice(id);
    return { ok: true, data: { to: result.to } };
  } catch (error) {
    return { ok: false, error: toMessage(error, t) };
  }
}
