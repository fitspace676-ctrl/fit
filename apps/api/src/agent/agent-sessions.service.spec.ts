import { describe, expect, it, vi } from 'vitest';
import { AgentSessionsService } from './agent-sessions.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

const row = (
  id: string,
  gymId = 'gym-1',
  userId = 'user-1',
  content = 'სექტემბრის კამპანია: ბიუჯეტი 700 ლარი',
) => ({
  id,
  gymId,
  userId,
  title: `Conversation ${id}`,
  updatedAt: new Date('2026-11-15T12:00:00Z'),
  messages: [
    { role: 'user', content },
    { role: 'assistant', content: 'Agreed.' },
  ],
});
function setup(
  rows = [row('own'), row('other-user', 'gym-1', 'user-2'), row('other-gym', 'gym-2')],
  userId: string | undefined = 'user-1',
) {
  type Where = {
    gymId: string;
    userId: string;
    id?: string | { not: string };
    NOT?: { id: string };
  };
  const matches = (record: ReturnType<typeof row>, where: Where) =>
    record.gymId === where.gymId &&
    record.userId === where.userId &&
    (typeof where.id === 'string' ? record.id === where.id : record.id !== where.id?.not) &&
    record.id !== where.NOT?.id;
  const findMany = vi.fn(({ where, skip, take }: { where: Where; skip: number; take: number }) =>
    Promise.resolve(rows.filter((r) => matches(r, where)).slice(skip, skip + take)),
  );
  const findFirst = vi.fn(({ where }: { where: Where }) =>
    Promise.resolve(rows.find((r) => matches(r, where)) ?? null),
  );
  const prisma = {
    client: { agentChatSession: { findMany, findFirst } },
  } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1', userId } as unknown as TenantContext;
  return { service: new AgentSessionsService(prisma, tenant), findMany, findFirst };
}

describe('AgentSessionsService history', () => {
  it('searches message text and titles, preserving the source date', async () => {
    const { service, findMany } = setup();
    const result = await service.searchHistory({ query: 'სექტემბრის', offset: 0 });
    expect(result.sessions.map((s) => s.id)).toEqual(['own']);
    expect(result.sessions[0]).toMatchObject({
      updatedAt: '2026-11-15T12:00:00.000Z',
      excerpt: expect.stringContaining('700') as unknown,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { gymId: 'gym-1', userId: 'user-1' }, take: 11 }),
    );
    expect(
      (await service.searchHistory({ query: 'CONVERSATION OWN', offset: 0 })).sessions,
    ).toHaveLength(1);
  });

  it.each(['other-user', 'other-gym'])('never lists or reads %s', async (id) => {
    const { service, findFirst } = setup();
    expect((await service.searchHistory({ offset: 0 })).sessions.map((s) => s.id)).toEqual(['own']);
    await expect(service.readHistory(id, { offset: 0 })).rejects.toMatchObject({ status: 404 });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id, gymId: 'gym-1', userId: 'user-1' } }),
    );
  });

  it('excludes the current session from both tools', async () => {
    const { service } = setup();
    expect((await service.searchHistory({ offset: 0, currentSessionId: 'own' })).sessions).toEqual(
      [],
    );
    await expect(
      service.readHistory('own', { offset: 0, currentSessionId: 'own' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('continues scanning after a page with no keyword matches', async () => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      row(String(i), 'gym-1', 'user-1', i === 10 ? 'needle' : 'nothing'),
    );
    const { service } = setup(rows);
    expect(await service.searchHistory({ offset: 0, query: 'needle' })).toEqual({
      sessions: [],
      nextOffset: 10,
    });
    const last = await service.searchHistory({ offset: 10, query: 'needle' });
    expect(last.sessions.map((s) => s.id)).toEqual(['10']);
    expect(last.nextOffset).toBeNull();
  });

  it('caps excerpts and reads while allowing the entire text to be recovered', async () => {
    const { service } = setup([row('long', 'gym-1', 'user-1', 'x'.repeat(25000))]);
    expect(
      (await service.searchHistory({ offset: 0 })).sessions[0]!.excerpt.length,
    ).toBeLessThanOrEqual(500);
    const first = await service.readHistory('long', { offset: 0 });
    const second = await service.readHistory('long', { offset: first.nextOffset! });
    const third = await service.readHistory('long', { offset: second.nextOffset! });
    expect(first.text.length).toBe(12000);
    expect(second.text.length).toBe(12000);
    expect(third.nextOffset).toBeNull();
    expect(first.text + second.text + third.text).toBe(
      `user: ${'x'.repeat(25000)}\n\nassistant: Agreed.`,
    );
  });

  it('ignores malformed turns, attachments and tool outputs', async () => {
    const record = row('old');
    record.messages = [
      null,
      { role: 'system', content: 'secret' },
      { role: 'user', content: 'visible', attachments: ['secret'] },
      { role: 'assistant', content: 42 },
    ] as unknown as typeof record.messages;
    const result = await setup([record]).service.readHistory('old', { offset: 0 });
    expect(result.text).toBe('user: visible');
  });

  it('fails closed without an authenticated user', async () => {
    const { service, findMany, findFirst } = setup([], '');
    await expect(service.searchHistory({ offset: 0 })).rejects.toMatchObject({ status: 401 });
    await expect(service.readHistory('own', { offset: 0 })).rejects.toMatchObject({ status: 401 });
    expect(findMany).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
