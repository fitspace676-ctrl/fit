import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AdminServicesController } from './admin-services.controller';
import type { AdminServicesService } from './admin-services.service';

function setup() {
  const services = {
    listServices: vi.fn(() =>
      Promise.resolve({ data: [], total: 0, page: 1, limit: 20, summary: {} }),
    ),
    listStaffOptions: vi.fn(() => Promise.resolve({ data: [] })),
    createService: vi.fn((input: unknown) => Promise.resolve({ id: 's-1', input })),
    updateService: vi.fn(() => Promise.resolve({ id: 's-1' })),
    archiveService: vi.fn(() => Promise.resolve({ id: 's-1' })),
    restoreService: vi.fn(() => Promise.resolve({ id: 's-1' })),
    getService: vi.fn(() => Promise.resolve({ id: 's-1' })),
  };
  return {
    controller: new AdminServicesController(services as unknown as AdminServicesService),
    services,
  };
}

describe('AdminServicesController', () => {
  it('parses the list query with defaults', async () => {
    const { controller, services } = setup();
    await controller.list({ page: '2' });
    expect(services.listServices).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 20, status: 'ACTIVE' }),
    );
  });

  it('rejects an invalid create body with a 400 listing the field', async () => {
    const { controller } = setup();
    await expect(controller.create({ type: 'CUSTOM', staffId: 'gm-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('passes a valid PT body through', async () => {
    const { controller, services } = setup();
    await controller.create({ type: 'PERSONAL_TRAINING', staffId: 'gm-1', priceMinor: 100 });
    expect(services.createService).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PERSONAL_TRAINING', durationMinutes: 60 }),
    );
  });
});
