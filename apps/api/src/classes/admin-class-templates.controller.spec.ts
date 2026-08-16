import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type {
  CreateClassTemplateResponse,
  GetAdminClassTemplateResponse,
  ListAdminClassTemplatesResponse,
} from '@fit/types';
import { AdminClassTemplatesController } from './admin-class-templates.controller';
import type { AdminClassTemplatesService } from './admin-class-templates.service';

const detail = (over?: Partial<GetAdminClassTemplateResponse>): GetAdminClassTemplateResponse => ({
  id: 'ct-1',
  title: 'Morning HIIT',
  category: 'Cardio',
  capacity: 20,
  durationMinutes: 45,
  startTime: '09:00',
  recurrence: 'Every week on Mon, Wed, Fri',
  color: '#2563eb',
  trainerName: null,
  locationName: null,
  status: 'ACTIVE',
  pricingRule: 'FREE',
  priceMinor: null,
  includedPlanIds: [],
  minAttendance: null,
  pt30Minor: null,
  pt45Minor: null,
  pt60Minor: null,
  validFrom: '2026-06-01',
  validUntil: null,
  createdAt: '2026-03-01T00:00:00.000Z',
  description: '',
  rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
  trainerId: null,
  locationId: null,
  room: null,
  updatedAt: '2026-03-01T00:00:00.000Z',
  ...over,
});

function setup() {
  const listClassTemplates = vi.fn<() => Promise<ListAdminClassTemplatesResponse>>(() =>
    Promise.resolve({ data: [], total: 0, page: 1, limit: 20 }),
  );
  const getClassTemplate = vi.fn<() => Promise<GetAdminClassTemplateResponse>>(() =>
    Promise.resolve(detail()),
  );
  const createClassTemplate = vi.fn<() => Promise<CreateClassTemplateResponse>>(() =>
    Promise.resolve(detail()),
  );
  const updateClassTemplate = vi.fn<() => Promise<CreateClassTemplateResponse>>(() =>
    Promise.resolve(detail()),
  );
  const service = {
    listClassTemplates,
    getClassTemplate,
    createClassTemplate,
    updateClassTemplate,
  } as unknown as AdminClassTemplatesService;
  return {
    controller: new AdminClassTemplatesController(service),
    listClassTemplates,
    getClassTemplate,
    createClassTemplate,
    updateClassTemplate,
  };
}

/** A minimal valid create body the controller's Zod schema accepts. */
const validBody = (over?: Record<string, unknown>) => ({
  title: 'Morning HIIT',
  capacity: 20,
  durationMinutes: 45,
  startTime: '09:00',
  locationId: 'loc-1',
  rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
  validFrom: '2026-06-01',
  ...over,
});

describe('AdminClassTemplatesController', () => {
  let ctx: ReturnType<typeof setup>;
  afterEach(() => vi.clearAllMocks());

  describe('GET /admin/classes', () => {
    it('parses + defaults the query and delegates to the service', async () => {
      ctx = setup();
      await ctx.controller.list({ search: 'hiit' });

      expect(ctx.listClassTemplates).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'hiit', page: 1, limit: 20, sort: 'title', dir: 'asc' }),
      );
    });

    it('rejects a non-numeric page with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller.list({ page: 'abc' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listClassTemplates).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/classes', () => {
    it('validates + transforms the body before delegating', async () => {
      ctx = setup();
      await ctx.controller.create(
        validBody({ title: '  Morning HIIT  ', capacity: '20', durationMinutes: '45' }),
      );

      // Title trimmed, numbers coerced, defaults applied.
      expect(ctx.createClassTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Morning HIIT',
          capacity: 20,
          durationMinutes: 45,
          startTime: '09:00',
          color: '#2563eb',
          status: 'ACTIVE',
          description: '',
          category: '',
          trainerId: null,
          locationId: 'loc-1',
          room: null,
          validUntil: null,
        }),
      );
    });

    it('rejects a missing title with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create(validBody({ title: undefined }))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createClassTemplate).not.toHaveBeenCalled();
    });

    it('rejects an unparseable rrule with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create(validBody({ rrule: 'FREQ=HOURLY' }))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createClassTemplate).not.toHaveBeenCalled();
    });

    it('accepts the one-off rrule the console stores for a "One time" class', async () => {
      ctx = setup();
      await ctx.controller.create(validBody({ rrule: 'FREQ=DAILY;COUNT=1', validUntil: null }));

      expect(ctx.createClassTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ rrule: 'FREQ=DAILY;COUNT=1', validUntil: null }),
      );
    });

    it('rejects a zero capacity with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create(validBody({ capacity: 0 }))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createClassTemplate).not.toHaveBeenCalled();
    });

    it('rejects an end date before the start date with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create(validBody({ validFrom: '2026-06-01', validUntil: '2026-05-01' }))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createClassTemplate).not.toHaveBeenCalled();
    });

    it('rejects an invalid hex color with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create(validBody({ color: 'blue' }))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createClassTemplate).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /admin/classes/:id', () => {
    it('validates the body and forwards the id', async () => {
      ctx = setup();
      await ctx.controller.update('ct-1', validBody({ title: 'Renamed' }));

      expect(ctx.updateClassTemplate).toHaveBeenCalledWith(
        'ct-1',
        expect.objectContaining({ title: 'Renamed' }),
      );
    });
  });
});
