import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env';
import { listCreditPackCatalogue, listMyCreditPacks, purchaseCreditPack } from './credit-packs';

interface Call {
  url: string;
  init: RequestInit;
}

function stubFetch(body: unknown = {}, status = 200): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listMyCreditPacks', () => {
  it('reads the member self-service route, not the staff roster', async () => {
    // `/members/me/credit-packs` is CreditPackManage. Every other `/members/*`
    // route is MemberRead/MemberWrite and 403s for a member.
    const calls = stubFetch({ creditPacks: [] });

    await listMyCreditPacks();

    const call = calls[0] as Call;
    expect(call.init.method).toBe('GET');
    expect(call.url).toBe(`${env.apiUrl}/members/me/credit-packs`);
  });
});

describe('listCreditPackCatalogue', () => {
  it('GETs the packs on sale', async () => {
    const calls = stubFetch({ packs: [] });
    await listCreditPackCatalogue();
    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/credit-packs/catalogue`);
  });
});

describe('purchaseCreditPack', () => {
  it('POSTs the packId, with no member or gym on the wire', async () => {
    const calls = stubFetch({ creditPackId: 'cp_1', orderId: 'ord_1' }, 201);

    await expect(purchaseCreditPack({ packId: 'pack_1' })).resolves.toEqual({
      creditPackId: 'cp_1',
      orderId: 'ord_1',
    });

    const call = calls[0] as Call;
    expect(call.init.method).toBe('POST');
    expect(call.url).toBe(`${env.apiUrl}/credit-packs/purchase`);
    expect(JSON.parse(call.init.body as string)).toEqual({ packId: 'pack_1' });
  });

  it('forwards a promo code so an inapplicable one is refused loudly', async () => {
    const calls = stubFetch({ creditPackId: 'cp_1', orderId: 'ord_1' }, 201);
    await purchaseCreditPack({ packId: 'pack_1', promoCode: 'PACKS20' });
    expect(JSON.parse((calls[0] as Call).init.body as string)).toEqual({
      packId: 'pack_1',
      promoCode: 'PACKS20',
    });
  });
});
