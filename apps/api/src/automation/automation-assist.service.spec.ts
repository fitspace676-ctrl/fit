import { describe, expect, it, vi } from 'vitest';
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { automationAssistRequestSchema, type AutomationAssistResponse } from '@fit/types';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import { AutomationAssistService, type AutomationAssistRuntime } from './automation-assist.service';
import type { AutomationService } from './automation.service';

const MODEL = { id: 'gemini-flash-lite', label: 'Flash-Lite', provider: 'google', modelId: 'm' };

const TENANT_OPTIONS = {
  locations: [{ id: 'loc-1', name: 'საბურთალო' }],
  plans: [{ id: 'plan-1', name: 'Gold' }],
  tags: ['vip'],
};

const RESPONSE: AutomationAssistResponse = {
  kind: 'draft',
  draft: { triggerType: 'member_joined' },
  explanation: 'მისალმება.',
  complete: false,
  model: 'gemini-flash-lite',
};

function setup(overrides: Partial<AutomationAssistRuntime> = {}) {
  const draftAutomationRule = vi.fn<AutomationAssistRuntime['draftAutomationRule']>(() =>
    Promise.resolve(RESPONSE),
  );
  const resolveModel = vi.fn<AutomationAssistRuntime['resolveModel']>(() => MODEL);
  const runtime: AutomationAssistRuntime = { draftAutomationRule, resolveModel, ...overrides };

  const catalog = vi.fn(() =>
    Promise.resolve({
      triggers: [],
      actions: [],
      timings: [],
      conditionFields: [],
      conditionOptions: TENANT_OPTIONS,
    }),
  );
  const gymFind = vi.fn(() =>
    Promise.resolve({
      name: 'Downtown',
      slug: 'downtown',
      settings: { locale: { timezone: 'Asia/Tbilisi' } },
    }),
  );
  const prisma = { client: { gym: { findUnique: gymFind } } } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  const automation = { catalog } as unknown as AutomationService;

  class TestService extends AutomationAssistService {
    protected override runtime(): AutomationAssistRuntime {
      return runtime;
    }
  }
  return {
    service: new TestService(automation, prisma, tenant),
    draftAutomationRule,
    resolveModel,
    catalog,
    gymFind,
  };
}

describe('AutomationAssistService', () => {
  it("drafts only against the tenant catalog's options", async () => {
    const ctx = setup();
    const request = automationAssistRequestSchema.parse({
      message: 'ახალ წევრს მისალმება',
      model: 'gemini-flash-lite',
      gymId: 'other-gym',
      catalog: { locations: [{ id: 'foreign', name: 'სხვა' }] },
      locations: [{ id: 'foreign', name: 'სხვა' }],
    });
    await ctx.service.assist(request);

    expect(ctx.resolveModel).toHaveBeenCalledWith('gemini-flash-lite');
    expect(ctx.catalog).toHaveBeenCalledOnce();
    expect(ctx.gymFind).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'gym-1' } }));
    const [passedRequest, options, context, model] = ctx.draftAutomationRule.mock.calls[0]!;
    expect(options).toBe(TENANT_OPTIONS);
    expect(passedRequest).not.toHaveProperty('gymId');
    expect(passedRequest).not.toHaveProperty('catalog');
    expect(passedRequest).not.toHaveProperty('locations');
    expect(context.gym).toEqual({ name: 'Downtown', slug: 'downtown' });
    expect(context.locale).toBe('ka');
    expect(context.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(model).toBe(MODEL);
  });

  it('is a 503 AUTOMATION_ASSIST_NOT_CONFIGURED without a model', async () => {
    const ctx = setup({ resolveModel: () => undefined });
    const error = await ctx.service
      .assist(automationAssistRequestSchema.parse({ message: 'hi' }))
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
      code: 'AUTOMATION_ASSIST_NOT_CONFIGURED',
    });
    expect(ctx.draftAutomationRule).not.toHaveBeenCalled();
  });

  it('is a 502 AUTOMATION_ASSIST_FAILED when the runtime throws', async () => {
    const ctx = setup({
      draftAutomationRule: () => Promise.reject(new Error('provider exploded')),
    });
    const error = await ctx.service
      .assist(automationAssistRequestSchema.parse({ message: 'hi' }))
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as BadGatewayException).getResponse()).toMatchObject({
      message: 'AUTOMATION_ASSIST_FAILED',
      code: 'AUTOMATION_ASSIST_FAILED',
    });
  });

  it('returns the runtime response unchanged', async () => {
    const ctx = setup();
    await expect(
      ctx.service.assist(automationAssistRequestSchema.parse({ message: 'hi', locale: 'en' })),
    ).resolves.toBe(RESPONSE);
  });
});
