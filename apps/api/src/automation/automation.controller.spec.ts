import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import type { AutomationService } from './automation.service';

/**
 * Standalone mock fns returned alongside the controller so assertions reference
 * the bound vars, not `service.method` (which would trip the unbound-method rule).
 */
function setup() {
  const catalog = vi.fn(() => ({ triggers: [], actions: [], timings: [] }));
  const listTemplates = vi.fn(() => Promise.resolve({ data: [] }));
  const listRules = vi.fn(() => Promise.resolve({ data: [], total: 0, page: 1, limit: 20 }));
  const getRule = vi.fn(() => Promise.resolve({ id: 'rule-1' }));
  const listRuns = vi.fn(() => Promise.resolve({ data: [] }));
  const createRule = vi.fn(() => Promise.resolve({ id: 'rule-new' }));
  const updateRule = vi.fn(() => Promise.resolve({ id: 'rule-1' }));
  const toggleRule = vi.fn(() => Promise.resolve({ id: 'rule-1' }));
  const saveAsTemplate = vi.fn(() => Promise.resolve({ id: 'tmpl-1' }));
  const deleteRule = vi.fn(() => Promise.resolve());

  const service = {
    catalog,
    listTemplates,
    listRules,
    getRule,
    listRuns,
    createRule,
    updateRule,
    toggleRule,
    saveAsTemplate,
    deleteRule,
  } as unknown as AutomationService;

  return {
    controller: new AutomationController(service),
    catalog,
    listRules,
    createRule,
    toggleRule,
    saveAsTemplate,
    deleteRule,
  };
}

const validRule = {
  name: 'Welcome',
  triggerType: 'member_joined',
  actionType: 'email',
  actionConfig: { body: 'Hi there' },
};

describe('AutomationController', () => {
  afterEach(() => vi.clearAllMocks());

  it('serves the catalog', () => {
    const ctx = setup();
    ctx.controller.catalog();
    expect(ctx.catalog).toHaveBeenCalledOnce();
  });

  it('parses the list query before delegating', async () => {
    const ctx = setup();
    await ctx.controller.listRules({ page: '2', limit: '5', active: 'true' });
    expect(ctx.listRules).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 5, active: true }),
    );
  });

  it('creates a rule from a valid body', async () => {
    const ctx = setup();
    await ctx.controller.createRule(validRule);
    expect(ctx.createRule).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Welcome', triggerType: 'member_joined' }),
    );
  });

  it('400s a create body whose needs-days trigger omits days', async () => {
    const ctx = setup();
    await expect(
      ctx.controller.createRule({
        name: 'Expiry',
        triggerType: 'membership_expiring',
        actionType: 'email',
        actionConfig: { body: 'Renew soon' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.createRule).not.toHaveBeenCalled();
  });

  it('400s a create body with an unknown action type', async () => {
    const ctx = setup();
    await expect(
      ctx.controller.createRule({ ...validRule, actionType: 'carrier_pigeon' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400s a toggle body without an active flag', async () => {
    const ctx = setup();
    await expect(ctx.controller.toggleRule('rule-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(ctx.toggleRule).not.toHaveBeenCalled();
  });

  it('delegates toggle with the parsed flag', async () => {
    const ctx = setup();
    await ctx.controller.toggleRule('rule-1', { active: false });
    expect(ctx.toggleRule).toHaveBeenCalledWith('rule-1', { active: false });
  });

  it('save-as-template tolerates an empty body', async () => {
    const ctx = setup();
    await ctx.controller.saveAsTemplate('rule-1', undefined);
    expect(ctx.saveAsTemplate).toHaveBeenCalledWith('rule-1', {});
  });

  it('deletes a rule', async () => {
    const ctx = setup();
    await ctx.controller.deleteRule('rule-1');
    expect(ctx.deleteRule).toHaveBeenCalledWith('rule-1');
  });
});
