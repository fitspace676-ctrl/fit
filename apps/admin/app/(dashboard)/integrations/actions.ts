'use server';

import { revalidatePath } from 'next/cache';
import {
  connectFlittSchema,
  connectSenderSchema,
  sendTestSmsSchema,
  type SendTestSmsResponse,
  setIntegrationEnabledSchema,
  type GymIntegration,
  type TestIntegrationResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchIntegrations, mutateFlitt, mutateSender } from '@/lib/api';

export type IntegrationError =
  | 'bad_key'
  | 'unknown_merchant'
  | 'unreachable'
  | 'notConfigured'
  | 'notVerified'
  | 'forbidden'
  | 'invalid'
  | 'unexpected';
export type IntegrationResult =
  | { ok: true; data: GymIntegration; tested?: boolean }
  | { ok: false; error: IntegrationError; data?: GymIntegration };
export type IntegrationCommand =
  | { kind: 'connect'; merchantId: string; secretKey: string }
  | { kind: 'enable'; enabled: boolean }
  | { kind: 'test' }
  | { kind: 'disconnect' };

export async function changeFlitt(command: IntegrationCommand): Promise<IntegrationResult> {
  if ((await getServerSession())?.role !== 'OWNER') return { ok: false, error: 'forbidden' };
  try {
    let data: GymIntegration;
    switch (command.kind) {
      case 'connect': {
        const parsed = connectFlittSchema.safeParse(command);
        if (!parsed.success) return { ok: false, error: 'invalid' };
        data = await mutateFlitt('PUT', parsed.data);
        break;
      }
      case 'enable': {
        const parsed = setIntegrationEnabledSchema.safeParse(command);
        if (!parsed.success) return { ok: false, error: 'invalid' };
        data = await mutateFlitt('PATCH', parsed.data);
        break;
      }
      case 'disconnect':
        data = await mutateFlitt('DELETE');
        break;
      case 'test': {
        const result = await mutateFlitt<TestIntegrationResponse>('POST');
        // Failed tests also disable payments and clear verification on the API.
        const refreshed = (await fetchIntegrations()).find((item) => item.provider === 'flitt');
        revalidatePath('/integrations');
        if (!refreshed) return { ok: false, error: 'unexpected' };
        return result.ok
          ? { ok: true, data: refreshed, tested: true }
          : { ok: false, error: result.reason ?? 'unreachable', data: refreshed };
      }
      default:
        return { ok: false, error: 'invalid' };
    }
    revalidatePath('/integrations');
    return { ok: true, data };
  } catch (error) {
    // Never return arbitrary provider messages: they may contain credentials.
    if (error instanceof ApiError) {
      if (error.status === 403) return { ok: false, error: 'forbidden' };
      if (error.message === 'INTEGRATIONS_NOT_CONFIGURED')
        return { ok: false, error: 'notConfigured' };
      if (error.message === 'FLITT_NOT_VERIFIED') return { ok: false, error: 'notVerified' };
      const reason = (error.data as { reason?: unknown } | undefined)?.reason;
      if (
        error.message === 'FLITT_VERIFICATION_FAILED' &&
        (reason === 'bad_key' || reason === 'unknown_merchant' || reason === 'unreachable')
      )
        return { ok: false, error: reason };
    }
    return { ok: false, error: 'unreachable' };
  }
}

export type SenderCommand =
  | { kind: 'connect'; apiKey: string }
  | { kind: 'enable'; enabled: boolean }
  | { kind: 'test' }
  | { kind: 'testMessage'; phone: string }
  | { kind: 'disconnect' };
export type SenderError = IntegrationError | 'credentialsChanged' | 'invalid_phone' | 'rejected';
export type SenderResult =
  | { ok: true; data?: GymIntegration; tested?: boolean; balance?: string }
  | { ok: false; error: SenderError; data?: GymIntegration };

export async function changeSender(command: SenderCommand): Promise<SenderResult> {
  if ((await getServerSession())?.role !== 'OWNER') return { ok: false, error: 'forbidden' };
  try {
    let data: GymIntegration;
    switch (command.kind) {
      case 'connect': {
        const parsed = connectSenderSchema.safeParse(command);
        if (!parsed.success) return { ok: false, error: 'invalid' };
        data = await mutateSender('PUT', parsed.data);
        break;
      }
      case 'enable': {
        const parsed = setIntegrationEnabledSchema.safeParse(command);
        if (!parsed.success) return { ok: false, error: 'invalid' };
        data = await mutateSender('PATCH', parsed.data);
        break;
      }
      case 'disconnect':
        data = await mutateSender('DELETE');
        break;
      case 'testMessage': {
        const parsed = sendTestSmsSchema.safeParse(command);
        if (!parsed.success) return { ok: false, error: 'invalid_phone' };
        const result = await mutateSender<SendTestSmsResponse>('POST', parsed.data, 'test-message');
        revalidatePath('/integrations');
        return result.ok ? { ok: true } : { ok: false, error: result.reason ?? 'unreachable' };
      }
      case 'test': {
        const result = await mutateSender<TestIntegrationResponse>('POST');
        const refreshed = (await fetchIntegrations()).find((item) => item.provider === 'sender');
        revalidatePath('/integrations');
        if (!refreshed) return { ok: false, error: 'unexpected' };
        return result.ok
          ? { ok: true, data: refreshed, tested: true, balance: result.balance }
          : { ok: false, error: result.reason ?? 'unreachable', data: refreshed };
      }
      default:
        return { ok: false, error: 'invalid' };
    }
    revalidatePath('/integrations');
    return { ok: true, data };
  } catch (error) {
    // Return only known codes, never provider content or credentials.
    if (error instanceof ApiError) {
      if (error.status === 403) return { ok: false, error: 'forbidden' };
      if (error.message === 'INTEGRATIONS_NOT_CONFIGURED')
        return { ok: false, error: 'notConfigured' };
      if (error.message === 'SENDER_NOT_VERIFIED') return { ok: false, error: 'notVerified' };
      if (error.message === 'SENDER_CREDENTIALS_CHANGED')
        return { ok: false, error: 'credentialsChanged' };
      const reason = (error.data as { reason?: unknown } | undefined)?.reason;
      if (
        error.message === 'SENDER_VERIFICATION_FAILED' &&
        (reason === 'bad_key' || reason === 'unreachable')
      )
        return { ok: false, error: reason };
    }
    return { ok: false, error: 'unreachable' };
  }
}
