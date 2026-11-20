import type { RequestOptions } from 'node:https';
import type * as UrlModule from './zkbio-url';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:http', () => ({ request: vi.fn() }));
vi.mock('node:https', () => ({ request: vi.fn() }));
vi.mock('./zkbio-url', async (importOriginal) => ({
  ...(await importOriginal<typeof UrlModule>()),
  assertPublicHost: vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
}));
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { ZkbioClient } from './zkbio-client';

const conn = { baseUrl: 'https://gym.example', apiToken: 'secret' };
beforeEach(() => {
  vi.mocked(httpRequest).mockReset();
  vi.mocked(httpsRequest).mockReset();
});

describe('default pinned transport', () => {
  it('pins DNS including all:true while keeping the original TLS hostname and forbidding socket reuse', async () => {
    let options: RequestOptions = {};
    vi.mocked(httpsRequest).mockImplementation((...args: unknown[]) => {
      expect(args[0]).toBeInstanceOf(URL);
      expect((args[0] as URL).hostname).toBe('gym.example');
      options = args[1] as typeof options;
      const onResponse = args[2] as (response: EventEmitter & { statusCode: number }) => void;
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () => {
        const response = Object.assign(new EventEmitter(), { statusCode: 200 });
        onResponse(response);
        response.emit(
          'data',
          Buffer.from(JSON.stringify({ code: 0, message: 'success', data: [] })),
        );
        response.emit('end');
      };
      return req as unknown as ReturnType<typeof httpsRequest>;
    });
    await expect(new ZkbioClient().checkConnection(conn)).resolves.toEqual({ ok: true });
    const opts = options;
    expect(opts.agent).toBe(false);
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    const callback = vi.fn();
    opts.lookup!('gym.example', {}, callback);
    expect(callback).toHaveBeenLastCalledWith(null, '8.8.8.8', 4);
    opts.lookup!('gym.example', { all: true }, callback);
    expect(callback).toHaveBeenLastCalledWith(null, [{ address: '8.8.8.8', family: 4 }]);
    expect(httpRequest).not.toHaveBeenCalled();
  });
});
