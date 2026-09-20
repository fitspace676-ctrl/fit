import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiBaseUrl, POST } from './route';

/** Build a `POST /api/leads` request with the given JSON body. */
function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://formacore.io/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const LEAD = { type: 'pricing', name: 'Giorgi', email: 'giorgi@gym.ge' };

/** Stub `fetch` with a JSON response and hand back the spy. */
function stubFetch(status: number, payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('POST /api/leads', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards a valid lead to the API and relays its response', async () => {
    const fetchMock = stubFetch(201, { id: 'lead-1' });

    const response = await POST(post(LEAD));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: 'lead-1' });
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`${apiBaseUrl()}/platform/leads`);
    expect(JSON.parse(init.body as string)).toMatchObject({ type: 'pricing', name: 'Giorgi' });
  });

  it('strips the honeypot and drops a bot submission without calling the API', async () => {
    const fetchMock = stubFetch(201, { id: 'lead-1' });

    const response = await POST(post({ ...LEAD, website: 'http://spam.example' }));

    expect(response.status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never forwards the honeypot field when it is left empty', async () => {
    const fetchMock = stubFetch(201, { id: 'lead-1' });

    await POST(post({ ...LEAD, website: '' }));

    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('website');
  });

  it("forwards the visitor's address so the API throttles the client, not the proxy", async () => {
    const fetchMock = stubFetch(201, { id: 'lead-1' });

    await POST(post(LEAD, { 'x-forwarded-for': '203.0.113.7, 70.41.3.18' }));

    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Forwarded-For']).toBe('203.0.113.7');
  });

  it('rejects a malformed lead with a 400 and never calls the API', async () => {
    const fetchMock = stubFetch(201, { id: 'lead-1' });

    const response = await POST(post({ type: 'pricing', name: '', email: 'nope' }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const response = await POST(post('not json'));
    expect(response.status).toBe(400);
  });

  it('relays the API error message so the form can show it', async () => {
    stubFetch(429, { message: 'Too many requests — please slow down and try again shortly.' });

    const response = await POST(post(LEAD));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      message: 'Too many requests — please slow down and try again shortly.',
    });
  });

  it("flattens the API's array of validation messages to the first one", async () => {
    stubFetch(400, { message: ['email: A valid email is required'] });

    const response = await POST(post(LEAD));

    await expect(response.json()).resolves.toEqual({
      message: 'email: A valid email is required',
    });
  });

  it('answers 502 when the API is unreachable, rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const response = await POST(post(LEAD));

    expect(response.status).toBe(502);
    const body = (await response.json()) as { message?: string };
    expect(body.message).toContain('try again');
  });
});

describe('apiBaseUrl', () => {
  it('trims a trailing slash off the configured URL', () => {
    expect(apiBaseUrl().endsWith('/')).toBe(false);
  });
});
