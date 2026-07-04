// @fit/web — member subscription (membership) API helper.
//
// Server-only read of the signed-in member's current membership. It targets
// `GET /me/subscription` (see the backend TODO in the redesign notes — this is
// the one remaining gap) and is deliberately tolerant: any absent session, 404,
// or non-OK resolves to `null`, so the Membership screen renders its "no active
// plan" state today and lights up automatically once the endpoint ships. Parsing
// is done with plain guards (web has no `zod` dependency).

import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from './auth-session';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export type SubscriptionStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'FROZEN'
  | 'CANCELED'
  | 'PAST_DUE'
  | 'EXPIRED';
export type SubscriptionInterval = 'MONTH' | 'YEAR' | 'WEEK' | 'DAY';
export type InvoiceStatus = 'PAID' | 'PENDING' | 'FAILED' | 'REFUNDED';

/** The membership fields the screen renders. Mirrors the planned API response. */
export interface MemberSubscription {
  id: string;
  status: SubscriptionStatus;
  planName: string | null;
  priceAmount: number;
  currency: string;
  interval: SubscriptionInterval;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  frozenUntil: string | null;
  memberSince: string | null;
}

export interface MemberInvoice {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
}

export interface MembershipData {
  subscription: MemberSubscription | null;
  invoices: MemberInvoice[];
}

const STATUSES: SubscriptionStatus[] = [
  'TRIAL',
  'ACTIVE',
  'FROZEN',
  'CANCELED',
  'PAST_DUE',
  'EXPIRED',
];
const INTERVALS: SubscriptionInterval[] = ['MONTH', 'YEAR', 'WEEK', 'DAY'];
const INVOICE_STATUSES: InvoiceStatus[] = ['PAID', 'PENDING', 'FAILED', 'REFUNDED'];

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const oneOf = <T extends string>(v: unknown, allowed: T[], fallback: T): T =>
  typeof v === 'string' && (allowed as string[]).includes(v) ? (v as T) : fallback;

function parseSubscription(raw: unknown): MemberSubscription | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  if (!id) {
    return null;
  }
  return {
    id,
    status: oneOf(r.status, STATUSES, 'ACTIVE'),
    planName: str(r.planName),
    priceAmount: num(r.priceAmount),
    currency: str(r.currency) ?? 'GEL',
    interval: oneOf(r.interval, INTERVALS, 'MONTH'),
    currentPeriodStart: str(r.currentPeriodStart),
    currentPeriodEnd: str(r.currentPeriodEnd),
    cancelAtPeriodEnd: r.cancelAtPeriodEnd === true,
    frozenUntil: str(r.frozenUntil),
    memberSince: str(r.memberSince),
  };
}

function parseInvoices(raw: unknown): MemberInvoice[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry): MemberInvoice | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const r = entry as Record<string, unknown>;
      const id = str(r.id);
      const date = str(r.date);
      if (!id || !date) {
        return null;
      }
      return {
        id,
        date,
        amount: num(r.amount),
        currency: str(r.currency) ?? 'GEL',
        status: oneOf(r.status, INVOICE_STATUSES, 'PAID'),
      };
    })
    .filter((x): x is MemberInvoice => x !== null);
}

/**
 * Fetch the caller's membership + recent invoices, or `{ subscription: null,
 * invoices: [] }` when there is no session / the endpoint is absent or errors.
 */
export async function fetchMembership({
  signal,
}: { signal?: AbortSignal } = {}): Promise<MembershipData> {
  const empty: MembershipData = { subscription: null, invoices: [] };
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return empty;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/me/subscription`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal,
    });
  } catch {
    return empty;
  }
  if (!response.ok) {
    return empty;
  }

  const body = (await response.json().catch(() => null)) as {
    subscription?: unknown;
    invoices?: unknown;
  } | null;
  if (!body) {
    return empty;
  }

  return {
    subscription: parseSubscription(body.subscription),
    invoices: parseInvoices(body.invoices),
  };
}
