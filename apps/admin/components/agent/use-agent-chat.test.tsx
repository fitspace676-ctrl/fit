import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAgentChat } from './use-agent-chat';
import { messageParts } from './chat-state';

vi.mock('next-intl', () => ({
  useLocale: () => 'ka',
  useTranslations: () => (key: string) => key,
}));
vi.mock('../active-location', () => ({ useActiveLocation: () => ({ locationId: 'branch-1' }) }));
const pending = (id: string) => ({
  t: 'tool',
  id,
  name: 'update',
  kind: 'write',
  status: 'awaiting_approval',
  input: { value: id },
  signature: `signed-${id}`,
});
const response = (...events: unknown[]) =>
  new Response(events.map((event) => JSON.stringify(event)).join('\n'));
afterEach(() => vi.unstubAllGlobals());

describe('useAgentChat', () => {
  it('waits for all decisions, blocks sends, and continues the same turn with identical history', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ t: 'delta', v: 'Before tools. ' }, pending('1'), pending('2'), { t: 'done' }),
      )
      .mockResolvedValueOnce(
        response(
          { t: 'tool', id: '1', name: 'update', status: 'complete' },
          { t: 'tool', id: '2', name: 'update', status: 'rejected' },
          { t: 'delta', v: 'Finished' },
          { t: 'done' },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAgentChat());
    act(() => result.current.send('Change'));
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    const first = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as Record<
      string,
      unknown
    >;
    expect(first).toMatchObject({
      locale: 'ka',
      locationId: 'branch-1',
      messages: [{ role: 'user', content: 'Change' }],
    });
    const assistantId = result.current.messages[1]!.id;
    act(() => result.current.send('Blocked'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => result.current.decide({ '1': 'approve' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => result.current.decide({ '2': 'reject' }));
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    const second = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string) as Record<
      string,
      unknown
    >;
    // The reply so far comes back as the assistant turn the calls belong to.
    expect(second.messages).toEqual([
      ...(first.messages as unknown[]),
      { role: 'assistant', content: 'Before tools. ' },
    ]);
    expect(second.approvals).toEqual([
      {
        call: { id: '1', name: 'update', input: { value: '1' }, signature: 'signed-1' },
        decision: 'approve',
      },
      {
        call: { id: '2', name: 'update', input: { value: '2' }, signature: 'signed-2' },
        decision: 'reject',
      },
    ]);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({
      id: assistantId,
      content: 'Before tools. Finished',
    });
    expect(messageParts(result.current.messages[1]!)).toMatchObject([
      { kind: 'text', text: 'Before tools. ' },
      {
        kind: 'tools',
        calls: [
          { id: '1', status: 'complete' },
          { id: '2', status: 'rejected' },
        ],
      },
      { kind: 'text', text: 'Finished' },
    ]);
    expect(result.current.pendingApprovals).toHaveLength(0);
  });

  it('localizes errors and retries without duplicating partial text or user messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          response(
            { t: 'delta', v: 'Partial' },
            { t: 'error', code: 'rate_limited', message: 'raw provider message' },
          ),
        )
        .mockResolvedValueOnce(response({ t: 'delta', v: 'Complete' }, { t: 'done' })),
    );
    const { result } = renderHook(() => useAgentChat());
    act(() => result.current.send('Hello'));
    await waitFor(() => expect(result.current.error).toBe('errors.rate_limited'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.messages[1]?.content).toBe('Complete'));
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('tells the next approval round which writes already ran', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(pending('1'), { t: 'done' }))
      .mockResolvedValueOnce(
        response(
          { t: 'tool', id: '1', name: 'update', status: 'running' },
          { t: 'tool', id: '1', name: 'update', status: 'complete', target: 'Ana' },
          pending('2'),
          { t: 'done' },
        ),
      )
      .mockResolvedValueOnce(response({ t: 'delta', v: 'Done' }, { t: 'done' }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAgentChat());
    act(() => result.current.send('Two changes'));
    await waitFor(() => expect(result.current.pendingApprovals).toHaveLength(1));
    act(() => result.current.decide({ '1': 'approve' }));
    await waitFor(() => expect(result.current.pendingApprovals[0]?.id).toBe('2'));
    act(() => result.current.decide({ '2': 'approve' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const third = JSON.parse(fetchMock.mock.calls[2]![1]!.body as string) as {
      messages: { role: string; content: string }[];
      approvals: { call: { id: string } }[];
    };
    expect(third.approvals.map((a) => a.call.id)).toEqual(['2']);
    expect(third.messages).toEqual([
      { role: 'user', content: 'Two changes' },
      { role: 'assistant', content: '[Tool calls in this reply]\n- update (Ana): complete' },
    ]);
  });

  it('offers no retry once an approved write has started', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(pending('1'), { t: 'done' }))
      .mockResolvedValueOnce(
        response(
          { t: 'tool', id: '1', name: 'update', status: 'complete' },
          { t: 'error', code: 'provider_error', message: 'raw' },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAgentChat());
    act(() => result.current.send('Change'));
    await waitFor(() => expect(result.current.pendingApprovals).toHaveLength(1));
    act(() => result.current.decide({ '1': 'approve' }));
    await waitFor(() => expect(result.current.error).toBe('errors.provider_error'));
    expect(result.current.canRetry).toBe(false);
    act(() => result.current.retry());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('names the files of a turn sent without text', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response({ t: 'done' }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAgentChat());
    act(() =>
      result.current.send('', undefined, [
        { name: 'list.csv', mimeType: 'text/csv', data: 'YQ==' },
      ]),
    );
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as {
      messages: unknown[];
    };
    expect(body.messages).toEqual([{ role: 'user', content: '[Attached: list.csv]' }]);
  });
});
