import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env';
import {
  downloadMyInvoicePdf,
  getMyGoals,
  getMyProfile,
  getMySubscription,
  myInvoicePdfUrl,
  replaceMyGoals,
  updateMyProfile,
} from './me';

interface Call {
  url: string;
  init: RequestInit;
}

function stubFetch(body: unknown = {}, status = 200, contentType = 'application/json'): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      const payload = contentType === 'application/json' ? JSON.stringify(body) : (body as string);
      return new Response(payload, { status, headers: { 'Content-Type': contentType } });
    }),
  );
  return calls;
}

function bodyOf(call: Call): unknown {
  return JSON.parse(call.init.body as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the /me reads', () => {
  it.each([
    { name: 'profile', run: () => getMyProfile(), url: '/me/profile' },
    { name: 'goals', run: () => getMyGoals(), url: '/me/goals' },
    { name: 'subscription', run: () => getMySubscription(), url: '/me/subscription' },
  ])('$name is a GET with no member id on the wire', async ({ run, url }) => {
    const calls = stubFetch();

    await run();

    const call = calls[0] as Call;
    expect(call.init.method).toBe('GET');
    expect(call.url).toBe(`${env.apiUrl}${url}`);
  });
});

describe('updateMyProfile', () => {
  it('PATCHes only the fields it is given', async () => {
    const calls = stubFetch({ profile: {} });

    await updateMyProfile({ name: 'Nino' });

    const call = calls[0] as Call;
    expect(call.init.method).toBe('PATCH');
    expect(bodyOf(call)).toEqual({ name: 'Nino' });
  });

  it('sends an explicit null to clear the phone — distinct from omitting it', async () => {
    const calls = stubFetch({ profile: {} });
    await updateMyProfile({ phone: null });
    expect(bodyOf(calls[0] as Call)).toEqual({ phone: null });
  });
});

describe('replaceMyGoals', () => {
  it('PUTs the whole set, because the body *is* the new set', async () => {
    const calls = stubFetch({ goals: [] });

    await replaceMyGoals({ goals: [] });

    const call = calls[0] as Call;
    expect(call.init.method).toBe('PUT');
    expect(call.url).toBe(`${env.apiUrl}/me/goals`);
    expect(bodyOf(call)).toEqual({ goals: [] });
  });
});

describe('the invoice PDF', () => {
  it('builds the member-safe URL, not the BillingRead one', () => {
    // `GET /invoices/:id/pdf` requires BillingRead and 403s for a member.
    expect(myInvoicePdfUrl('inv_1')).toBe(`${env.apiUrl}/me/invoices/inv_1/pdf`);
  });

  it('downloads bytes rather than trying to parse JSON', async () => {
    const calls = stubFetch('%PDF-1.7', 200, 'application/pdf');

    const blob = await downloadMyInvoicePdf({ invoiceId: 'inv_1' });

    expect(await blob.text()).toBe('%PDF-1.7');
    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/me/invoices/inv_1/pdf`);
  });

  it('still throws on a non-2xx', async () => {
    stubFetch({ code: 'NOT_FOUND', message: 'no', details: null }, 404);
    await expect(downloadMyInvoicePdf({ invoiceId: 'inv_1' })).rejects.toMatchObject({
      status: 404,
    });
  });
});
