'use server';

import { revalidatePath } from 'next/cache';
import {
  connectZktecoSchema,
  updateZktecoSettingsSchema,
  setIntegrationEnabledSchema,
  setMemberAccessCardSchema,
  zktecoFailureReasonSchema,
  Permission,
  roleHasPermission,
  type ConnectZktecoInput,
  type UpdateZktecoSettingsInput,
  type ZktecoIntegration,
  type ZktecoTestResponse,
  type ZktecoResources,
  type ZktecoSyncStatus,
  type ZktecoSyncStartResponse,
  type ZktecoOpenDoorResponse,
  type ZktecoInsideResponse,
} from '@fit/types';
import { ApiError, requestZkteco, fetchLocations } from '@/lib/api';
import { getServerSession } from '@/lib/session';

export type ZktecoCommand =
  | { kind: 'connect'; input: ConnectZktecoInput }
  | { kind: 'settings'; input: UpdateZktecoSettingsInput }
  | { kind: 'enable'; enabled: boolean }
  | { kind: 'load' | 'test' | 'disconnect' | 'resources' | 'status' | 'sync' | 'open' | 'inside' };
export type ZktecoResult = {
  ok: boolean;
  error?: string;
  data?: ZktecoIntegration;
  device?: ZktecoTestResponse['device'];
  resources?: ZktecoResources;
  locations?: { id: string; name: string }[];
  status?: ZktecoSyncStatus;
  inside?: ZktecoInsideResponse;
};

function safeError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'unreachable';
  if (error.status === 403) return 'forbidden';
  const codes: Record<string, string> = {
    ZKTECO_NOT_VERIFIED: 'notVerified',
    ZKTECO_CREDENTIALS_CHANGED: 'credentialsChanged',
    ZKTECO_SETTING_UNSUPPORTED: 'unsupported',
    ZKTECO_UNSUPPORTED: 'unsupported',
    ZKTECO_ZONE_REQUIRED: 'zoneRequired',
    LOCATION_NOT_FOUND: 'locationMissing',
    ACCESS_CARD_IN_USE: 'cardInUse',
    INTEGRATIONS_NOT_CONFIGURED: 'notConfigured',
  };
  if (codes[error.message]) return codes[error.message]!;
  if (['ZKTECO_VERIFICATION_FAILED', 'ZKTECO_UNREACHABLE'].includes(error.message)) {
    const reason = zktecoFailureReasonSchema.safeParse(
      (error.data as { reason?: unknown })?.reason,
    );
    if (reason.success) return reason.data;
  }
  return error.status === 400 ? 'invalid' : 'unreachable';
}

export async function changeZkteco(command: ZktecoCommand): Promise<ZktecoResult> {
  if ((await getServerSession())?.role !== 'OWNER') return { ok: false, error: 'forbidden' };
  try {
    let data: ZktecoIntegration;
    switch (command.kind) {
      case 'load':
        return { ok: true, data: await requestZkteco('GET') };
      case 'connect': {
        const parsed = connectZktecoSchema.safeParse(command.input);
        if (!parsed.success) return { ok: false, error: 'invalid' };
        data = await requestZkteco('PUT', '', parsed.data);
        break;
      }
      case 'settings': {
        const parsed = updateZktecoSettingsSchema.safeParse(command.input);
        if (!parsed.success) return { ok: false, error: 'invalid' };
        data = await requestZkteco('PATCH', '/settings', parsed.data);
        break;
      }
      case 'enable': {
        const parsed = setIntegrationEnabledSchema.safeParse(command);
        if (!parsed.success) return { ok: false, error: 'invalid' };
        data = await requestZkteco('PATCH', '', parsed.data);
        break;
      }
      case 'disconnect':
        data = await requestZkteco('DELETE');
        break;
      case 'test': {
        const result = await requestZkteco<ZktecoTestResponse>('POST', '/test');
        data = await requestZkteco('GET');
        revalidatePath('/integrations');
        return {
          ok: result.ok,
          error: result.ok ? undefined : (result.reason ?? 'unreachable'),
          data,
          device: result.device,
        };
      }
      case 'resources': {
        const resources = await requestZkteco<ZktecoResources>('GET', '/resources');
        const locations: { id: string; name: string }[] = [];
        let page = 1;
        // Fetch every page, so a branch beyond the first page remains selectable.
        for (;;) {
          const result = await fetchLocations({ page, limit: 100 });
          locations.push(...result.data.map(({ id, name }) => ({ id, name })));
          if (locations.length >= result.total || result.data.length === 0) break;
          page++;
        }
        return { ok: true, resources, locations };
      }
      case 'status':
        return { ok: true, status: await requestZkteco<ZktecoSyncStatus>('GET', '/status') };
      case 'sync': {
        const result = await requestZkteco<ZktecoSyncStartResponse>('POST', '/sync');
        return {
          ok: result.accepted,
          error: result.accepted ? undefined : (result.reason ?? 'unreachable'),
        };
      }
      case 'open': {
        const result = await requestZkteco<ZktecoOpenDoorResponse>('POST', '/open-door', {});
        return { ok: result.ok, error: result.ok ? undefined : (result.reason ?? 'rejected') };
      }
      case 'inside':
        return { ok: true, inside: await requestZkteco<ZktecoInsideResponse>('GET', '/inside') };
      default:
        return { ok: false, error: 'invalid' };
    }
    revalidatePath('/integrations');
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

export async function setZktecoMemberCard(memberId: string, cardNumber: string | null) {
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.MemberWrite))
    return { ok: false, error: 'forbidden' };
  const parsed = setMemberAccessCardSchema.safeParse({ cardNumber });
  if (!parsed.success || !memberId || memberId.length > 64)
    return { ok: false, error: 'invalidCard' };
  try {
    await requestZkteco('PUT', `/members/${encodeURIComponent(memberId)}/card`, parsed.data);
    revalidatePath(`/members/${memberId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}
