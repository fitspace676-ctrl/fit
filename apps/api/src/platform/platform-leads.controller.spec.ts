import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CreatePlatformLeadInput } from '@fit/types';
import {
  RATE_LIMIT_KEY,
  RATE_LIMITS,
  type RateLimitOptions,
} from '../common/rate-limit/rate-limit.decorator';
import { PlatformLeadsController } from './platform-leads.controller';
import type { PlatformLeadsService } from './platform-leads.service';

function setup() {
  const create = vi.fn().mockResolvedValue({ id: 'lead-1' });
  const service = { create } as unknown as PlatformLeadsService;
  const controller = new PlatformLeadsController(service);
  return { controller, create };
}

describe('PlatformLeadsController.create', () => {
  it('validates the body and delegates the parsed lead to the service', async () => {
    const { controller, create } = setup();

    const result = await controller.create({
      type: 'trial',
      name: '  David  ',
      email: 'DAVID@Gym.GE',
      business: 'IronWorks',
    });

    expect(result).toEqual({ id: 'lead-1' });
    // The controller hands the service the *parsed* lead: trimmed name, lowercased email.
    const parsed = create.mock.calls[0]![0] as CreatePlatformLeadInput;
    expect(parsed.name).toBe('David');
    expect(parsed.email).toBe('david@gym.ge');
    expect(parsed.business).toBe('IronWorks');
  });

  it('normalises a blank optional field to undefined', async () => {
    const { controller, create } = setup();

    await controller.create({ type: 'demo', name: 'Nino', email: 'nino@gym.ge', message: '   ' });

    const parsed = create.mock.calls[0]![0] as CreatePlatformLeadInput;
    expect(parsed.message).toBeUndefined();
  });

  it('accepts a pricing request carrying only a name and email', async () => {
    const { controller, create } = setup();

    await controller.create({ type: 'pricing', name: 'Giorgi', email: 'giorgi@gym.ge' });

    const parsed = create.mock.calls[0]![0] as CreatePlatformLeadInput;
    expect(parsed.type).toBe('pricing');
    expect(parsed.business).toBeUndefined();
    expect(parsed.phone).toBeUndefined();
  });

  it('rejects a pricing request with no email', async () => {
    const { controller, create } = setup();

    await expect(controller.create({ type: 'pricing', name: 'Giorgi' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a malformed body with a 400 and never calls the service', async () => {
    const { controller, create } = setup();

    await expect(
      controller.create({ type: 'trial', name: '', email: 'not-an-email' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an unknown lead type', async () => {
    const { controller } = setup();
    await expect(
      controller.create({ type: 'partnership', name: 'X', email: 'x@gym.ge' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PlatformLeadsController rate limit', () => {
  it('carries the shared leads policy, so the public write is throttled per IP', () => {
    const policy = new Reflector().get<RateLimitOptions>(RATE_LIMIT_KEY, PlatformLeadsController);
    expect(policy).toEqual(RATE_LIMITS.leads);
  });
});
