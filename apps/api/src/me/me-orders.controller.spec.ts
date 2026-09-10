import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Permission } from '@fit/types';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';
import { MeOrdersController } from './me-orders.controller';
import type { MeOrdersService } from './me-orders.service';

const EMPTY = { orders: [], total: 0, page: 1, limit: 20 };

function setup(result: unknown = EMPTY) {
  const list = vi.fn().mockResolvedValue(result);
  return {
    controller: new MeOrdersController({ list } as unknown as MeOrdersService),
    list,
  };
}

describe('MeOrdersController', () => {
  it('defaults the pager on a bare query', async () => {
    const { controller, list } = setup();
    await expect(controller.list({})).resolves.toEqual(EMPTY);
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('coerces the page/limit the URL carries as strings', async () => {
    const { controller, list } = setup();
    await controller.list({ page: '3', limit: '10' });
    expect(list).toHaveBeenCalledWith({ page: 3, limit: 10 });
  });

  it('400s an out-of-range pager rather than clamping it', async () => {
    const { controller, list } = setup();
    await expect(controller.list({ limit: '500' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.list({ page: '0' })).rejects.toBeInstanceOf(BadRequestException);
    expect(list).not.toHaveBeenCalled();
  });

  it('is gated on the self-service capability every gym-scoped role holds', () => {
    // `check-controller-guards` proves *a* policy is declared; this pins *which*
    // one, so the member's own history can never be moved behind a staff-only
    // billing permission the way `GET /orders` is.
    // Read through the descriptor rather than the prototype property so the
    // handler is never treated as an unbound method reference.
    const handler: unknown = Object.getOwnPropertyDescriptor(
      MeOrdersController.prototype,
      'list',
    )?.value;
    const declared = (Reflect.getMetadata(PERMISSIONS_KEY, handler as object) ??
      []) as Permission[];
    expect(declared).toEqual([Permission.ProfileManage]);
  });
});
