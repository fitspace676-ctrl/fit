import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Permission } from '@fit/types';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';
import { DashboardSegmentsController } from './dashboard-segments.controller';
import type { DashboardSegmentsService } from './dashboard-segments.service';

function setup() {
  const get = vi.fn().mockResolvedValue({
    segment: 'revenue',
    range: '7d',
    currency: 'GEL',
    widgets: [],
  });
  const setWidgets = vi.fn().mockResolvedValue(undefined);
  const service = { get, setWidgets } as unknown as DashboardSegmentsService;
  return { controller: new DashboardSegmentsController(service), get, setWidgets };
}

describe('DashboardSegmentsController', () => {
  it('reads a segment at the requested range', async () => {
    const { controller, get } = setup();
    await controller.get('revenue', '12w');
    expect(get).toHaveBeenCalledWith('revenue', '12w');
  });

  it('defaults an omitted range rather than erroring', async () => {
    const { controller, get } = setup();
    await controller.get('revenue', undefined);
    expect(get).toHaveBeenCalledWith('revenue', '7d');
  });

  it('defaults a range outside the dashboard vocabulary', async () => {
    const { controller, get } = setup();
    // `12m` is valid for a drill-down but not for the dashboard's range control.
    await controller.get('revenue', '12m');
    expect(get).toHaveBeenCalledWith('revenue', '7d');
  });

  // Overview is server-rendered and has no catalogue. Answering with an empty
  // success would hide the caller's bug.
  it('refuses the overview segment', async () => {
    const { controller, get } = setup();
    await expect(controller.get('overview', '7d')).rejects.toThrow(BadRequestException);
    expect(get).not.toHaveBeenCalled();
  });

  // `sales` and `members` are hand-built views with no catalogue, so asking the
  // segments API for either is a client bug worth surfacing — exactly like
  // `overview`. The console must route them to their own views instead.
  it.each(['sales', 'members'])('rejects the hand-built %s segment', async (segment) => {
    const { controller } = setup();
    await expect(controller.get(segment, '7d')).rejects.toThrow(new RegExp(segment));
  });

  it('refuses an unknown segment', async () => {
    const { controller } = setup();
    await expect(controller.get('leads', '7d')).rejects.toThrow(BadRequestException);
  });

  it('saves a widget selection', async () => {
    const { controller, setWidgets } = setup();
    await controller.setWidgets('revenue', { widgetKeys: ['revenue.by-location'] });
    expect(setWidgets).toHaveBeenCalledWith('revenue', ['revenue.by-location']);
  });

  it('refuses an empty widget selection', async () => {
    const { controller, setWidgets } = setup();
    await expect(controller.setWidgets('revenue', { widgetKeys: [] })).rejects.toThrow(
      BadRequestException,
    );
    expect(setWidgets).not.toHaveBeenCalled();
  });

  it('gates both routes on ReportView', () => {
    // `@SetMetadata` (via `@RequirePermissions`) attaches metadata to the handler
    // *function itself* — Reflect.getMetadata needs that same function reference
    // as its target, not an invocation, so this isn't the unbound-`this` call the
    // rule guards against.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const read = Reflect.getMetadata(PERMISSIONS_KEY, DashboardSegmentsController.prototype.get) as
      | Permission[]
      | undefined;
    const write = Reflect.getMetadata(
      PERMISSIONS_KEY,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      DashboardSegmentsController.prototype.setWidgets,
    ) as Permission[] | undefined;
    expect(read).toContain(Permission.ReportView);
    expect(write).toContain(Permission.ReportView);
  });
});
