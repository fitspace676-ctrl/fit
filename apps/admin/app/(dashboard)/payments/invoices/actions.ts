'use server';

import { revalidatePath } from 'next/cache';
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

/** Map a thrown API error to a short, staff-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.message === 'EMAIL_NOT_CONFIGURED') {
      return 'Outbound email is not set up for this gym yet, so the invoice could not be sent.';
    }
    if (error.message === 'INVOICE_HAS_NO_RECIPIENT') {
      return 'This invoice has no member with an email address, so there is nobody to send it to.';
    }
    if (error.message === 'INVOICE_NOT_FOUND') {
      return 'That invoice no longer exists.';
    }
    if (error.message === 'MEMBER_NOT_FOUND') {
      return 'That member no longer exists.';
    }
    return `Request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

/**
 * Search the gym's members for the create drawer's picker. Gated on `BillingManage` —
 * the same capability raising the invoice needs — so the search only runs for staff
 * who can act on the result. A blank query returns no matches without a round-trip.
 */
export async function searchMembersForInvoiceAction(
  query: string,
): Promise<ActionResult<InvoiceMemberMatch[]>> {
  if (!(await requireBillingManage())) {
    return { ok: false, error: 'Not authorized' };
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
    return { ok: false, error: toMessage(error) };
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
  if (!(await requireBillingManage())) {
    return { ok: false, error: 'Not authorized' };
  }
  const parsed = createInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid invoice details' };
  }
  try {
    const invoice = await createAdminInvoice(parsed.data);
    revalidatePath('/payments/invoices');
    return { ok: true, data: invoice };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * Email an invoice to the member it bills, PDF attached. Enforces `BillingManage`.
 * The two expected failures — mail not configured, and no address to send to — come
 * back as plain sentences rather than status codes, since neither is something the
 * staffer can fix from this screen.
 */
export async function emailInvoiceAction(id: string): Promise<ActionResult<{ to: string }>> {
  if (!(await requireBillingManage())) {
    return { ok: false, error: 'Not authorized' };
  }
  try {
    const result = await emailAdminInvoice(id);
    return { ok: true, data: { to: result.to } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
