import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en, ka } from '@fit/i18n';
import {
  DEFAULT_ZKTECO_SETTINGS,
  DEFAULT_ZKTECO_DEVICE_SETTINGS,
  ZKTECO_CAPABILITIES,
  type ZktecoIntegration,
  type ZktecoResources,
  type ZktecoSyncStatus,
} from '@fit/types';
import { ToastProvider } from '@/components/ui';
import { ZktecoCard } from './zkteco-card';
import { changeZkteco } from './zkteco-actions';

vi.mock('./zkteco-actions', () => ({ changeZkteco: vi.fn() }));
const t = en.admin.integrations;
const z = t.zkteco;
const disconnected: ZktecoIntegration = {
  provider: 'zkteco',
  connected: false,
  enabled: false,
  connection: null,
  secretHint: null,
  verifiedAt: null,
  lastError: null,
  settings: DEFAULT_ZKTECO_SETTINGS,
  capabilities: null,
};
const connected: ZktecoIntegration = {
  ...disconnected,
  connected: true,
  enabled: true,
  connection: {
    connectionType: 'zkbio',
    baseUrl: 'https://bio.example.ge',
    host: null,
    port: null,
    deviceNumber: null,
    recordSize: null,
  },
  secretHint: 'ab',
  verifiedAt: '2026-11-20T12:00:00Z',
  capabilities: ZKTECO_CAPABILITIES.zkbio,
};
const device: ZktecoIntegration = {
  ...connected,
  connection: {
    connectionType: 'device',
    baseUrl: null,
    host: 'device.example.ge',
    port: 4370,
    deviceNumber: 1,
    recordSize: 72,
  },
  secretHint: null,
  settings: DEFAULT_ZKTECO_DEVICE_SETTINGS,
  capabilities: ZKTECO_CAPABILITIES.device,
};
const resources: ZktecoResources = {
  devices: [{ sn: 'SN1', name: 'Front device', module: 'access', online: true }],
  doors: [{ id: 'd1', name: 'Front door', deviceId: 'SN1' }],
  gates: [{ id: 'g1', name: 'Gate one', deviceId: 'SN1' }],
  readers: [],
  accessLevels: [{ id: 'a1', name: 'Members' }],
  entranceLevels: [],
  areas: [{ code: 'zone1', name: 'Main hall' }],
  unavailable: [],
};
const status: ZktecoSyncStatus = {
  running: false,
  lastSyncAt: null,
  lastReconcileAt: null,
  lastImportAt: null,
  lastEventAt: null,
  lastErrorAt: null,
  lastError: null,
  members: { synced: 12, pending: 2, failed: 1 },
  events: { imported: 44, ignoredUnknown: 3 },
};
function mock(initial = disconnected, available = resources) {
  vi.mocked(changeZkteco).mockImplementation(async (command) => {
    await Promise.resolve();
    if (command.kind === 'load') return { ok: true, data: initial };
    if (command.kind === 'resources')
      return { ok: true, resources: available, locations: [{ id: 'loc1', name: 'Gym branch' }] };
    if (command.kind === 'status') return { ok: true, status };
    return { ok: true };
  });
}
function show(locale: 'en' | 'ka' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'ka' ? ka : en} timeZone="UTC">
      <ToastProvider>
        <ZktecoCard />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mock();
});
afterEach(cleanup);
describe('ZKTeco card', () => {
  it('connects ZKBio and clears the secret after a rejected verification', async () => {
    show();
    fireEvent.change(await screen.findByLabelText(z.baseUrl), {
      target: { value: 'https://bio.example.ge' },
    });
    fireEvent.change(screen.getByLabelText(z.apiToken), { target: { value: 'private-token' } });
    vi.mocked(changeZkteco).mockResolvedValueOnce({ ok: false, error: 'unauthorized' });
    fireEvent.click(screen.getByRole('button', { name: t.connect }));
    await screen.findByText(z.errors.unauthorized);
    expect(changeZkteco).toHaveBeenCalledWith({
      kind: 'connect',
      input: {
        connectionType: 'zkbio',
        baseUrl: 'https://bio.example.ge',
        apiToken: 'private-token',
      },
    });
    expect(screen.getByLabelText(z.apiToken)).toHaveValue('');
  });
  it('connects a standalone device with defaults and explicit record size', async () => {
    show();
    fireEvent.change(await screen.findByLabelText(z.connectionType), {
      target: { value: 'device' },
    });
    expect(screen.getByText(z.deviceWarning)).toBeInTheDocument();
    expect(screen.getByText(z.publicAddress)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(z.host), { target: { value: 'device.example.ge' } });
    fireEvent.change(screen.getByLabelText(z.recordSize), { target: { value: '72' } });
    fireEvent.click(screen.getByRole('button', { name: t.connect }));
    await waitFor(() =>
      expect(changeZkteco).toHaveBeenCalledWith({
        kind: 'connect',
        input: {
          connectionType: 'device',
          host: 'device.example.ge',
          port: 4370,
          deviceNumber: 1,
          commKey: 0,
          recordSize: 72,
        },
      }),
    );
  });
  it('offers only supported standalone settings and operations', async () => {
    mock(device);
    show();
    await screen.findByLabelText(z.onExpiry);
    expect(screen.queryByLabelText(z.syncPhoto)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(z.accessLevelIds)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(z.entranceLevelIds)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(z.checkInDoor)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(z.insideZoneCode)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: z.inside })).not.toBeInTheDocument();
    expect(within(screen.getByLabelText(z.onExpiry)).getAllByRole('option')).toHaveLength(1);
    expect(screen.getByLabelText(z.onExpiry)).toHaveValue('delete');
  });
  it('loads resource choices, saves a gate target and location mapping', async () => {
    mock(connected);
    show();
    await screen.findByRole('option', { name: 'Gate: Gate one' });
    fireEvent.change(screen.getByLabelText(z.checkInDoor), {
      target: { value: JSON.stringify({ kind: 'gate', id: 'g1' }) },
    });
    fireEvent.change(screen.getByLabelText(/Front device/), { target: { value: 'loc1' } });
    fireEvent.click(screen.getByRole('button', { name: z.saveSettings }));
    await waitFor(() =>
      expect(changeZkteco).toHaveBeenCalledWith({
        kind: 'settings',
        input: {
          ...DEFAULT_ZKTECO_SETTINGS,
          checkInDoor: { kind: 'gate', id: 'g1' },
          deviceLocations: { SN1: 'loc1' },
        },
      }),
    );
  });
  it('marks unavailable option lists and disables their selectors', async () => {
    mock(connected, { ...resources, unavailable: ['accessLevels', 'areas'] });
    show();
    await screen.findByText('Unavailable on this server: Access levels');
    expect(screen.getByLabelText(z.accessLevelIds)).toBeDisabled();
    expect(screen.getByLabelText(z.insideZoneCode)).toBeDisabled();
  });
  it('warns about retained people and advises disabling before disconnect', async () => {
    mock(connected);
    show();
    fireEvent.click(await screen.findByRole('button', { name: t.disconnect }));
    expect(screen.getByText(z.disconnectWarning)).toBeInTheDocument();
    expect(screen.getByText(z.disconnectTitle)).toBeInTheDocument();
    expect(screen.queryByText(t.disconnectTitle)).not.toBeInTheDocument();
    expect(changeZkteco).not.toHaveBeenCalledWith({ kind: 'disconnect' });
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.disconnect }));
    await waitFor(() => expect(changeZkteco).toHaveBeenCalledWith({ kind: 'disconnect' }));
  });
  it.each([
    'unauthorized',
    'unreachable',
    'timeout',
    'not_zkbio',
    'blocked_host',
    'invalid_connection',
    'protocol',
    'notVerified',
    'credentialsChanged',
    'forbidden',
    'unsupported',
    'zoneRequired',
    'locationMissing',
    'already_running',
    'not_enabled',
    'no_door_selected',
    'rejected',
  ] as const)('shows safe reason %s', async (error) => {
    mock(connected);
    show();
    await screen.findByLabelText(/Front device/);
    vi.mocked(changeZkteco).mockResolvedValueOnce({ ok: false, error });
    fireEvent.click(screen.getByRole('button', { name: t.test }));
    expect(await screen.findByRole('alert')).toHaveTextContent(z.errors[error]);
  });
  it('shows device information and disables controls from refreshed test state', async () => {
    mock(device);
    show();
    await screen.findByLabelText(/Front device/);
    vi.mocked(changeZkteco).mockResolvedValueOnce({
      ok: true,
      data: { ...device, enabled: false },
      device: {
        serialNumber: 'ZK-123',
        deviceName: 'Reader',
        firmwareVersion: '1.0',
        userCount: 5,
        userCapacity: 100,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: t.test }));
    expect(await screen.findByText('ZK-123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: z.open })).toBeDisabled();
    expect(screen.getByRole('button', { name: z.sync })).toBeDisabled();
  });
  it('shows sync counters and inside results', async () => {
    mock(connected);
    show();
    await screen.findByText(z.idle);
    expect(screen.getByText('44')).toBeInTheDocument();
    await screen.findByLabelText(/Front device/);
    vi.mocked(changeZkteco).mockResolvedValueOnce({
      ok: true,
      inside: { zoneCode: 'zone1', people: [{ pin: '20001', gymMemberId: null, name: null }] },
    });
    fireEvent.click(screen.getByRole('button', { name: z.inside }));
    expect(await screen.findByText(/Unknown person/)).toHaveTextContent(z.externalPerson);
  });
  it('renders Georgian copy including disconnect warning', async () => {
    mock(device);
    show('ka');
    await screen.findByText(ka.admin.integrations.zkteco.deviceWarning);
    fireEvent.click(screen.getByRole('button', { name: ka.admin.integrations.disconnect }));
    expect(screen.getByText(ka.admin.integrations.zkteco.disconnectWarning)).toBeInTheDocument();
    expect(JSON.stringify(ka.admin.integrations.zkteco)).not.toMatch(/[\u1c90-\u1cbf\u2013\u2014]/);
  });
});
