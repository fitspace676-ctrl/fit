import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

function setup() {
  const client = {
    gymMember: { findFirst: vi.fn().mockResolvedValue({ id: 'member' }) },
    review: {
      findFirst: vi.fn().mockResolvedValue({ memberId: 'someone-else' }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _avg: { rating: null } }),
    },
    reviewReport: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  client.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(client));
  const service = new ReviewsService(
    { client } as unknown as TenantPrismaService,
    { gymId: 'gym', userId: 'user' } as TenantContext,
  );
  return { service, client, controller: new ReviewsController(service) };
}

describe('review reporting', () => {
  it('persists a scoped report and audits it in the transaction', async () => {
    const { service, client } = setup();
    await expect(service.report('review', { reason: 'SPAM', note: 'Ad' })).resolves.toEqual({
      reported: true,
    });
    expect(client.reviewReport.createMany).toHaveBeenCalledWith({
      data: [{ gymId: 'gym', memberId: 'member', reviewId: 'review', reason: 'SPAM', note: 'Ad' }],
      skipDuplicates: true,
    });
    expect(client.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'review.report',
        actorId: 'user',
        targetId: 'review',
        metadata: { reason: 'SPAM' },
      },
    });
  });
  it('returns success for duplicates without auditing twice', async () => {
    const { service, client } = setup();
    client.reviewReport.createMany.mockResolvedValue({ count: 0 });
    await expect(service.report('review', { reason: 'OTHER' })).resolves.toEqual({
      reported: true,
    });
    expect(client.auditLog.create).not.toHaveBeenCalled();
  });
  it('rejects own reviews before inserting', async () => {
    const { service, client } = setup();
    client.review.findFirst.mockResolvedValue({ memberId: 'member' });
    await expect(service.report('review', { reason: 'OTHER' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(client.reviewReport.createMany).not.toHaveBeenCalled();
  });
  it('treats a missing or tenant-filtered review as not found', async () => {
    const { service, client } = setup();
    client.review.findFirst.mockResolvedValue(null);
    await expect(service.report('elsewhere', { reason: 'OTHER' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(client.reviewReport.createMany).not.toHaveBeenCalled();
  });
  it('requires an actual membership', async () => {
    const { service, client } = setup();
    client.gymMember.findFirst.mockResolvedValue(null);
    await expect(service.report('review', { reason: 'OTHER' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it.each([{ reason: 'INVALID' }, { reason: 'SPAM', note: 'a'.repeat(501) }, {}])(
    'rejects invalid body %j',
    async (body) => {
      const { controller, client } = setup();
      await expect(controller.report('review', body)).rejects.toBeInstanceOf(BadRequestException);
      expect(client.reviewReport.createMany).not.toHaveBeenCalled();
    },
  );
  it('trims the optional note', async () => {
    const { controller, client } = setup();
    await controller.report('review', { reason: 'HARASSMENT', note: '  threats  ' });
    expect(client.reviewReport.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ note: 'threats' })],
      }),
    );
  });
  it('excludes reported rows from the list, total and average and marks ownership', async () => {
    const { service, client } = setup();
    client.review.findMany.mockResolvedValue([
      {
        id: 'mine',
        memberId: 'member',
        rating: 4,
        comment: null,
        createdAt: new Date('2026-01-01'),
        member: { user: { name: 'Me' } },
      },
    ]);
    const result = await service.listForMember('trainer', { page: 2, limit: 5 });
    const where = {
      trainerId: 'trainer',
      trainer: { archivedAt: null },
      status: 'VISIBLE',
      reports: { none: { memberId: 'member' } },
    };
    expect(client.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 5, take: 5 }),
    );
    expect(client.review.count).toHaveBeenCalledWith({ where });
    expect(client.review.aggregate).toHaveBeenCalledWith({ where, _avg: { rating: true } });
    expect(result.reviews[0]?.isOwn).toBe(true);
    expect(result.reviews[0]).not.toHaveProperty('memberId');
  });
});
