import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signFlittParams, verifyFlittSignature } from './flitt-signature';

const sample = {
  server_callback_url: 'http://myshop/callback/',
  order_id: 'TestOrder2',
  currency: 'GEL',
  merchant_id: 1549901,
  order_desc: 'Test payment',
  amount: 1000,
};

describe('Flitt signatures', () => {
  it('signs the string the docs publish for the test merchant sample', () => {
    // The docs give this exact string-to-sign for the sample request. The digest
    // printed beside it (91ea7da4…) is stale — it is not the SHA-1 of that string —
    // while Flitt's live test merchant accepts signatures built this way (checked
    // 2026-11-20 against /api/checkout/url and /api/status/order_id).
    const documented = 'test|1000|GEL|1549901|Test payment|TestOrder2|http://myshop/callback/';
    expect(signFlittParams('test', sample)).toBe(
      createHash('sha1').update(documented).digest('hex'),
    );
    expect(signFlittParams('test', sample)).toBe('cd0edb710cbbdb6c2a4d965cdb91fdfabc343215');
  });
  it('sorts parameter names, ignores null/undefined/empty, but preserves zero', () => {
    const expected = createHash('sha1').update('key|0|GEL').digest('hex');
    expect(
      signFlittParams('key', { z: null, currency: 'GEL', amount: 0, a: '', b: undefined }),
    ).toBe(expected);
    expect(signFlittParams('key', { amount: '0', currency: 'GEL' })).toBe(expected);
    expect(signFlittParams('key', { currency: 'GEL' })).not.toBe(expected);
  });
  it('uses UTF-8 without trimming meaningful whitespace', () => {
    const params = { order_desc: 'ქართული აბონემენტი ', amount: 100 };
    expect(signFlittParams('test', params)).toBe(
      createHash('sha1').update('test|100|ქართული აბონემენტი ', 'utf8').digest('hex'),
    );
  });
  it('strips both signature fields without mutating the callback', () => {
    const payload = {
      ...sample,
      signature: signFlittParams('test', sample),
      response_signature_string: 'debug',
    };
    const copy = { ...payload };
    expect(verifyFlittSignature('test', payload)).toBe(true);
    expect(payload).toEqual(copy);
    expect(verifyFlittSignature('wrong', payload)).toBe(false);
    expect(verifyFlittSignature('test', { ...payload, amount: 1001 })).toBe(false);
  });
  it.each([undefined, null, '', 'a'.repeat(39), 'a'.repeat(41), 'z'.repeat(40), 123])(
    'rejects malformed signature %s',
    (signature) => {
      expect(verifyFlittSignature('test', { ...sample, signature })).toBe(false);
    },
  );
});
