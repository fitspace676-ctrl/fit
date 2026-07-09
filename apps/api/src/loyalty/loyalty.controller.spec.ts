import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { LoyaltyController } from './loyalty.controller';
import type { LoyaltyService } from './loyalty.service';

function setup() {
  const fns = {
    catalog: vi.fn(() => ({ rewardTypes: [], reasons: [] })),
    getProgram: vi.fn(() => Promise.resolve({})),
    updateProgram: vi.fn(() => Promise.resolve({})),
    listRewards: vi.fn(() => Promise.resolve({ data: [] })),
    createReward: vi.fn(() => Promise.resolve({ id: 'reward-1' })),
    updateReward: vi.fn(() => Promise.resolve({ id: 'reward-1' })),
    deleteReward: vi.fn(() => Promise.resolve()),
    listRedemptions: vi.fn(() => Promise.resolve({ data: [], total: 0, page: 1, limit: 20 })),
    redeem: vi.fn(() => Promise.resolve({ redemption: {}, balance: 0 })),
    cancelRedemption: vi.fn(() => Promise.resolve({ redemption: {}, balance: 0 })),
    getMemberLoyalty: vi.fn(() => Promise.resolve({ memberId: 'mem-1', balance: 0, entries: [] })),
    getMemberBalance: vi.fn(() => Promise.resolve({ memberId: 'mem-1', balance: 0 })),
    adjustPoints: vi.fn(() => Promise.resolve({ memberId: 'mem-1', balance: 0 })),
    summary: vi.fn(() => Promise.resolve({})),
    pointsTimeseries: vi.fn(() => Promise.resolve({ data: [] })),
    redemptionsByType: vi.fn(() => Promise.resolve({ data: [] })),
    topEarners: vi.fn(() => Promise.resolve({ data: [] })),
  };
  return { controller: new LoyaltyController(fns as unknown as LoyaltyService), fns };
}

describe('LoyaltyController', () => {
  afterEach(() => vi.clearAllMocks());

  it('serves the catalog', () => {
    const { controller, fns } = setup();
    controller.catalog();
    expect(fns.catalog).toHaveBeenCalledOnce();
  });

  it('parses a valid program update before delegating', async () => {
    const { controller, fns } = setup();
    await controller.updateProgram({ enabled: true, pointsPerCheckIn: 5 });
    expect(fns.updateProgram).toHaveBeenCalledOnce();
  });

  it('rejects an empty program update (no fields) with 400', async () => {
    const { controller, fns } = setup();
    await expect(controller.updateProgram({})).rejects.toBeInstanceOf(BadRequestException);
    expect(fns.updateProgram).not.toHaveBeenCalled();
  });

  it('parses a valid reward before creating', async () => {
    const { controller, fns } = setup();
    await controller.createReward({ name: 'Day pass', pointsCost: 200, type: 'day_pass' });
    expect(fns.createReward).toHaveBeenCalledOnce();
  });

  it('rejects a reward with a non-positive points cost with 400', async () => {
    const { controller, fns } = setup();
    await expect(controller.createReward({ name: 'Broken', pointsCost: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fns.createReward).not.toHaveBeenCalled();
  });

  it('rejects a redeem missing the reward id with 400', async () => {
    const { controller, fns } = setup();
    await expect(controller.redeem({ memberId: 'mem-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fns.redeem).not.toHaveBeenCalled();
  });

  it('validates then delegates a redeem', async () => {
    const { controller, fns } = setup();
    await controller.redeem({ memberId: 'mem-1', rewardId: 'reward-1' });
    expect(fns.redeem).toHaveBeenCalledWith({ memberId: 'mem-1', rewardId: 'reward-1' });
  });

  it('rejects a zero-delta manual adjustment with 400', async () => {
    const { controller, fns } = setup();
    await expect(controller.adjustPoints('mem-1', { delta: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fns.adjustPoints).not.toHaveBeenCalled();
  });

  it('coerces the top-earners limit from the query and delegates', async () => {
    const { controller, fns } = setup();
    await controller.topEarners({ limit: '5' });
    expect(fns.topEarners).toHaveBeenCalledWith(5);
  });

  it('defaults the timeseries window when the query omits months', async () => {
    const { controller, fns } = setup();
    await controller.pointsTimeseries({});
    expect(fns.pointsTimeseries).toHaveBeenCalledWith(6);
  });
});
