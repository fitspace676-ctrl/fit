import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { MarketingController } from './marketing.controller';
import type { MarketingService } from './marketing.service';

/**
 * Standalone mock fns returned alongside the controller so assertions reference
 * the bound vars, not `service.method` (which would trip the unbound-method rule).
 */
function setup() {
  const fns = {
    catalog: vi.fn(() => ({ channels: [], mergeFields: [] })),
    listSegments: vi.fn(() => Promise.resolve({ data: [] })),
    previewCriteria: vi.fn(() => Promise.resolve({ count: 0, sample: [] })),
    previewSegment: vi.fn(() => Promise.resolve({ count: 0, sample: [] })),
    createSegment: vi.fn(() => Promise.resolve({ id: 'seg-1' })),
    updateSegment: vi.fn(() => Promise.resolve({ id: 'seg-1' })),
    deleteSegment: vi.fn(() => Promise.resolve()),
    listTemplates: vi.fn(() => Promise.resolve({ data: [] })),
    createTemplate: vi.fn(() => Promise.resolve({ id: 't-1' })),
    updateTemplate: vi.fn(() => Promise.resolve({ id: 't-1' })),
    deleteTemplate: vi.fn(() => Promise.resolve()),
    listPromoCodes: vi.fn(() => Promise.resolve({ data: [] })),
    createPromoCode: vi.fn(() => Promise.resolve({ id: 'p-1' })),
    updatePromoCode: vi.fn(() => Promise.resolve({ id: 'p-1' })),
    togglePromoCode: vi.fn(() => Promise.resolve({ id: 'p-1' })),
    deletePromoCode: vi.fn(() => Promise.resolve()),
    validatePromoCode: vi.fn(() => Promise.resolve({ valid: true })),
    redeemPromoCode: vi.fn(() => Promise.resolve({ promo: {}, discountAmount: 0 })),
    listCampaigns: vi.fn(() => Promise.resolve({ data: [], total: 0, page: 1, limit: 20 })),
    getCampaign: vi.fn(() => Promise.resolve({ id: 'c-1' })),
    createCampaign: vi.fn(() => Promise.resolve({ id: 'c-1' })),
    updateCampaign: vi.fn(() => Promise.resolve({ id: 'c-1' })),
    sendCampaign: vi.fn(() => Promise.resolve({ id: 'c-1' })),
    scheduleCampaign: vi.fn(() => Promise.resolve({ id: 'c-1' })),
    saveCampaignAsTemplate: vi.fn(() => Promise.resolve({ id: 't-2' })),
    deleteCampaign: vi.fn(() => Promise.resolve()),
  };
  return { controller: new MarketingController(fns as unknown as MarketingService), fns };
}

describe('MarketingController', () => {
  afterEach(() => vi.clearAllMocks());

  it('serves the catalog', () => {
    const { controller, fns } = setup();
    controller.catalog();
    expect(fns.catalog).toHaveBeenCalledOnce();
  });

  it('parses a valid promo before creating', async () => {
    const { controller, fns } = setup();
    await controller.createPromoCode({
      code: 'SAVE10',
      discountType: 'fixed',
      discountValue: 1000,
    });
    expect(fns.createPromoCode).toHaveBeenCalledOnce();
  });

  it('rejects an invalid promo (percentage over 100) with 400', async () => {
    const { controller, fns } = setup();
    await expect(
      controller.createPromoCode({ code: 'X', discountType: 'percentage', discountValue: 300 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fns.createPromoCode).not.toHaveBeenCalled();
  });

  it('rejects a campaign naming both a segment and inline criteria', async () => {
    const { controller, fns } = setup();
    await expect(
      controller.createCampaign({
        name: 'Blast',
        channel: 'email',
        audienceSegmentId: 'seg-1',
        inlineCriteria: { status: ['ACTIVE'] },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fns.createCampaign).not.toHaveBeenCalled();
  });

  it('previews ad-hoc criteria (empty body allowed)', async () => {
    const { controller, fns } = setup();
    await controller.previewSegment(undefined);
    expect(fns.previewCriteria).toHaveBeenCalledOnce();
  });

  it('validates then delegates a promo redeem', async () => {
    const { controller, fns } = setup();
    await controller.redeemPromoCode({ code: 'SAVE10', amount: 5000 });
    expect(fns.redeemPromoCode).toHaveBeenCalledWith({ code: 'SAVE10', amount: 5000 });
  });

  it('rejects an invalid campaign list query with 400', async () => {
    const { controller } = setup();
    await expect(controller.listCampaigns({ status: 'bogus' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('delegates send + schedule', async () => {
    const { controller, fns } = setup();
    await controller.sendCampaign('c-1');
    await controller.scheduleCampaign('c-1', { scheduledAt: '2026-08-01T09:00:00.000Z' });
    expect(fns.sendCampaign).toHaveBeenCalledWith('c-1');
    expect(fns.scheduleCampaign).toHaveBeenCalledOnce();
  });
});
