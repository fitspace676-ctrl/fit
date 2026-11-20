import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/env', () => ({ env: { SENDER_API_URL: 'https://sender.ge/api/' } }));
import { SenderClient } from './sender-client';

const fetchMock = vi.fn<typeof fetch>();
const client = new SenderClient();
const input = { destination: '599123456', content: 'გამარჯობა & test', smsno: 1 as const };
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('SenderClient', () => {
  it('posts encoded fields and reads the balance', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { balance: '12.34' } })));
    expect(await client.getBalance('private&key')).toEqual({ ok: true, balance: '12.34' });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://sender.ge/api/getBalance.php');
    expect(options?.method).toBe('POST');
    expect(options?.headers).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(
      new URLSearchParams(typeof options?.body === 'string' ? options.body : '').get('apikey'),
    ).toBe('private&key');
  });
  it('sends a single encoded request and reads only its message id', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ messageId: 'm1', statusId: 1 }] })),
    );
    expect(await client.send('key', input)).toEqual({ ok: true, messageId: 'm1' });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://sender.ge/api/send.php');
    expect(
      Object.fromEntries(
        new URLSearchParams(typeof options?.body === 'string' ? options.body : ''),
      ),
    ).toEqual({
      apikey: 'key',
      ...input,
      smsno: '1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([400, 401, 403, 429, 500, 503])('maps HTTP %s safely', async (status) => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status })));
    expect(await client.getBalance('key')).toEqual({
      ok: false,
      reason: status >= 500 ? 'unreachable' : 'bad_key',
    });
    expect(await client.send('key', input)).toEqual({
      ok: false,
      reason: status >= 500 ? 'unreachable' : 'rejected',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([{}, { data: {} }, { data: [] }, null])(
    'rejects JSON missing success fields: %o',
    async (body) => {
      fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body))));
      expect(await client.getBalance('key')).toEqual({ ok: false, reason: 'bad_key' });
      expect(await client.send('key', input)).toEqual({ ok: false, reason: 'rejected' });
    },
  );
  it('does not expose or retry a transport failure', async () => {
    fetchMock.mockRejectedValue(new Error('private key and phone from upstream'));
    expect(await client.send('key', input)).toEqual({ ok: false, reason: 'unreachable' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('aborts after 15 seconds without retrying', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('abort')));
        }),
    );
    const sending = client.send('key', input);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await sending).toEqual({ ok: false, reason: 'unreachable' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
