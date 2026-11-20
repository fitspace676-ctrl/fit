'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Badge, Button, Card, Switch } from '@fit/ui-kit';
import { ConfirmDialog, Input, Label, useToast } from '@/components/ui';
import {
  connectZktecoSchema,
  type ZktecoIntegration,
  type ZktecoSettings,
  type ZktecoResources,
  type ZktecoSyncStatus,
  type ZktecoTestResponse,
  type ZktecoInsideResponse,
} from '@fit/types';
import { changeZkteco, type ZktecoCommand } from './zkteco-actions';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
    gap: '1rem',
  },
  field: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  text: { color: 'var(--color-text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 },
  error: { color: 'var(--color-error)' },
  select: {
    padding: '0.75rem',
    borderRadius: 'var(--radius-element)',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-text-primary)',
    width: '100%',
  },
  heading: { margin: 0, fontSize: '1.25rem' },
  value: { margin: 0, overflowWrap: 'anywhere' },
});

export function ZktecoCard() {
  const t = useTranslations('admin.integrations');
  const z = useTranslations('admin.integrations.zkteco');
  const format = useFormatter();
  const { toast } = useToast();
  const [integration, setIntegration] = useState<ZktecoIntegration>();
  const [settings, setSettings] = useState<ZktecoSettings>();
  const [resources, setResources] = useState<ZktecoResources>();
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = useState<ZktecoSyncStatus>();
  const [device, setDevice] = useState<ZktecoTestResponse['device']>();
  const [inside, setInside] = useState<ZktecoInsideResponse>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [connectionType, setConnectionType] = useState<'zkbio' | 'device'>('zkbio');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('4370');
  const [deviceNumber, setDeviceNumber] = useState('1');
  const [commKey, setCommKey] = useState('');
  const [recordSize, setRecordSize] = useState('');
  const safeMessage = (code: string) =>
    z.has(`errors.${code}`) ? z(`errors.${code}`) : z('errors.unexpected');
  const date = (value: string | null) =>
    value
      ? format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' })
      : z('none');

  function apply(data: ZktecoIntegration) {
    setIntegration(data);
    setSettings(data.settings);
    if (data.connection) {
      setConnectionType(data.connection.connectionType);
      setBaseUrl(data.connection.baseUrl ?? '');
      setHost(data.connection.host ?? '');
      setPort(String(data.connection.port ?? 4370));
      setDeviceNumber(String(data.connection.deviceNumber ?? 1));
      setRecordSize(data.connection.recordSize ? String(data.connection.recordSize) : '');
    }
  }
  useEffect(() => {
    let active = true;
    void changeZkteco({ kind: 'load' })
      .then((result) => {
        if (!active) return;
        if (result.data) {
          apply(result.data);
          setEditing(!result.data.connected);
        }
        if (!result.ok) setError(result.error ?? 'unreachable');
      })
      .catch(() => {
        if (active) setError('unreachable');
      });
    return () => {
      active = false;
    };
  }, []);

  // Read-only polling stops on unmount/disconnect. Door operations are never retried.
  useEffect(() => {
    if (!integration?.connected) return;
    let active = true;
    const refresh = () => {
      void changeZkteco({ kind: 'status' })
        .then((r) => {
          if (!active) return;
          if (r.status) setStatus(r.status);
          if (!r.ok) setError(r.error ?? 'unreachable');
        })
        .catch(() => {
          if (active) setError('unreachable');
        });
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    void changeZkteco({ kind: 'resources' })
      .then((r) => {
        if (!active) return;
        if (r.resources) {
          setResources(r.resources);
          setLocations(r.locations ?? []);
        }
        if (!r.ok) setError(r.error ?? 'unreachable');
      })
      .catch(() => {
        if (active) setError('unreachable');
      });
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [integration?.connected, integration?.connection?.connectionType, integration?.verifiedAt]);

  async function run(command: ZktecoCommand) {
    setBusy(true);
    setError(undefined);
    if (command.kind === 'connect') {
      setApiToken('');
      setCommKey('');
    }
    if (command.kind === 'test') setDevice(undefined);
    try {
      const result = await changeZkteco(command);
      if (result.data) apply(result.data);
      if (result.device) setDevice(result.device);
      if (result.resources) {
        setResources(result.resources);
        setLocations(result.locations ?? []);
      }
      if (result.status) setStatus(result.status);
      if (result.inside) setInside(result.inside);
      if (!result.ok) {
        setError(result.error ?? 'unreachable');
        return;
      }
      if (command.kind === 'connect' || command.kind === 'disconnect') {
        setEditing(command.kind === 'disconnect');
        setResources(undefined);
        setStatus(undefined);
        setDevice(undefined);
        setInside(undefined);
      }
      setConfirm(false);
      if (command.kind === 'load' && result.data) setEditing(!result.data.connected);
      if (!['load', 'resources', 'status', 'inside'].includes(command.kind))
        toast(
          command.kind === 'test'
            ? t('testSuccess')
            : command.kind === 'sync'
              ? z('syncAccepted')
              : command.kind === 'open'
                ? z('opened')
                : t('saved'),
          { tone: 'success', icon: 'check' },
        );
    } catch {
      setError('unreachable');
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = connectZktecoSchema.safeParse(
      connectionType === 'zkbio'
        ? { connectionType, baseUrl, apiToken }
        : {
            connectionType,
            host,
            port: Number(port),
            deviceNumber: Number(deviceNumber),
            commKey: Number(commKey),
            ...(recordSize ? { recordSize: Number(recordSize) } : {}),
          },
    );
    if (!parsed.success) {
      setError('invalid');
      return;
    }
    void run({ kind: 'connect', input: parsed.data });
  }
  function patch<K extends keyof ZktecoSettings>(key: K, value: ZktecoSettings[K]) {
    setSettings((previous) => (previous ? { ...previous, [key]: value } : previous));
  }
  const field = (key: string, children: ReactNode) => (
    <div key={key} {...stylex.props(styles.field)}>
      <Label htmlFor={`zkt-${key}`}>{z(key)}</Label>
      {children}
    </div>
  );
  const input = (key: string, value: string, change: (value: string) => void, type = 'text') =>
    field(
      key,
      <Input
        id={`zkt-${key}`}
        type={type}
        value={value}
        disabled={busy}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        onChange={(e) => change(e.target.value)}
      />,
    );
  const select = (
    key: string,
    value: string,
    change: (value: string) => void,
    options: { value: string; label: string }[],
    disabled = false,
  ) =>
    field(
      key,
      <select
        id={`zkt-${key}`}
        value={value}
        disabled={busy || disabled}
        onChange={(e) => change(e.target.value)}
        {...stylex.props(styles.select)}
      >
        {value &&
          ['checkInDoor', 'insideZoneCode'].includes(key) &&
          !options.some((o) => o.value === value) && (
            <option value={value}>
              {z('missingResource', {
                id: key === 'checkInDoor' ? (settings?.checkInDoor?.id ?? value) : value,
              })}
            </option>
          )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>,
    );
  const c = integration?.capabilities;
  const unavailable = (key: ZktecoResources['unavailable'][number]) =>
    !resources || resources.unavailable.includes(key);
  const levels = (
    key: 'accessLevelIds' | 'entranceLevelIds',
    resource: 'accessLevels' | 'entranceLevels',
  ) =>
    field(
      key,
      <select
        id={`zkt-${key}`}
        multiple
        value={settings?.[key] ?? []}
        disabled={busy || unavailable(resource)}
        onChange={(e) =>
          patch(
            key,
            Array.from(e.target.selectedOptions, (o) => o.value),
          )
        }
        {...stylex.props(styles.select)}
      >
        {(resources?.[resource] ?? []).map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
        {(settings?.[key] ?? [])
          .filter((id) => !resources?.[resource].some((item) => item.id === id))
          .map((id) => (
            <option key={id} value={id}>
              {z('missingResource', { id })}
            </option>
          ))}
      </select>,
    );

  return (
    <section aria-label={z('title')}>
      <Card>
        <div {...stylex.props(styles.stack)}>
          <div {...stylex.props(styles.row)}>
            <h2 {...stylex.props(styles.heading)}>{z('title')}</h2>
            {integration && (
              <Badge
                tone={integration.enabled ? 'positive' : 'neutral'}
                label={t(
                  `state.${!integration.connected ? 'disconnected' : integration.enabled ? 'active' : 'off'}`,
                )}
              />
            )}
          </div>
          <p {...stylex.props(styles.text)}>{z('description')}</p>
          {error && !confirm && (
            <p role="alert" {...stylex.props(styles.error)}>
              {safeMessage(error)}
            </p>
          )}
          {!integration && (
            <Button
              variant="secondary"
              disabled={busy}
              label={z('reload')}
              onClick={() => void run({ kind: 'load' })}
            />
          )}
          {integration?.lastError && (
            <p {...stylex.props(styles.error)}>
              {t('lastError')}: {safeMessage(integration.lastError)}
            </p>
          )}
          {integration?.connected && (
            <>
              <dl {...stylex.props(styles.grid)}>
                <div>
                  <dt>{z('connectionType')}</dt>
                  <dd {...stylex.props(styles.value)}>
                    {z(integration.connection?.connectionType ?? 'zkbio')}
                  </dd>
                </div>
                <div>
                  <dt>{z('address')}</dt>
                  <dd {...stylex.props(styles.value)}>
                    {integration.connection?.baseUrl ??
                      `${integration.connection?.host}:${integration.connection?.port}`}
                  </dd>
                </div>
                {integration.secretHint && (
                  <div>
                    <dt>{z('apiToken')}</dt>
                    <dd>••••{integration.secretHint}</dd>
                  </div>
                )}
                <div>
                  <dt>{t('verifiedAt')}</dt>
                  <dd>{date(integration.verifiedAt)}</dd>
                </div>
              </dl>
              {integration.connection?.connectionType === 'device' && (
                <p {...stylex.props(styles.text)}>{z('deviceWarning')}</p>
              )}
              <Switch
                label={z('enable')}
                description={z(integration.enabled ? 'enabledHint' : 'disabledHint')}
                checked={integration.enabled}
                disabled={busy}
                onChange={(enabled) => void run({ kind: 'enable', enabled })}
              />
              <div {...stylex.props(styles.row)}>
                <Button
                  variant="secondary"
                  disabled={busy}
                  label={t('test')}
                  onClick={() => void run({ kind: 'test' })}
                />
                <Button
                  variant="secondary"
                  disabled={busy}
                  label={t('replace')}
                  onClick={() => {
                    setEditing(true);
                    setApiToken('');
                    setCommKey('');
                  }}
                />
                <Button
                  variant="secondary"
                  disabled={busy}
                  label={t('disconnect')}
                  onClick={() => setConfirm(true)}
                />
              </div>
            </>
          )}
          {device && (
            <dl {...stylex.props(styles.grid)}>
              {(Object.keys(device) as (keyof typeof device)[]).map((key) => (
                <div key={key}>
                  <dt>{z(key)}</dt>
                  <dd>{device[key] ?? z('none')}</dd>
                </div>
              ))}
            </dl>
          )}
          {editing && (
            <form onSubmit={submit} {...stylex.props(styles.stack)}>
              {select(
                'connectionType',
                connectionType,
                (value) => {
                  setConnectionType(value as 'zkbio' | 'device');
                  setApiToken('');
                  setCommKey('');
                },
                ['zkbio', 'device'].map((value) => ({ value, label: z(value) })),
              )}
              <p {...stylex.props(styles.text)}>{z('publicAddress')}</p>
              {integration?.connected && (
                <p {...stylex.props(styles.text)}>{z('replaceWarning')}</p>
              )}
              {connectionType === 'zkbio' ? (
                <>
                  {input('baseUrl', baseUrl, setBaseUrl, 'url')}
                  {input('apiToken', apiToken, setApiToken, 'password')}
                </>
              ) : (
                <>
                  <p {...stylex.props(styles.text)}>{z('deviceWarning')}</p>
                  {input('host', host, setHost)}
                  {input('port', port, setPort, 'number')}
                  {input('deviceNumber', deviceNumber, setDeviceNumber, 'number')}
                  {input('commKey', commKey, setCommKey, 'password')}
                  {select('recordSize', recordSize, setRecordSize, [
                    { value: '', label: z('automatic') },
                    { value: '28', label: '28' },
                    { value: '72', label: '72' },
                  ])}
                  <p {...stylex.props(styles.text)}>{z('recordSizeHint')}</p>
                </>
              )}
              <div {...stylex.props(styles.row)}>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={busy}
                  label={t(integration?.connected ? 'save' : 'connect')}
                />
                {integration?.connected && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    label={t('cancel')}
                    onClick={() => {
                      setEditing(false);
                      setApiToken('');
                      setCommKey('');
                    }}
                  />
                )}
              </div>
            </form>
          )}
          {integration?.connected && settings && c && (
            <>
              <h3>{z('settings')}</h3>
              <Button
                variant="secondary"
                disabled={busy}
                label={z('resources')}
                onClick={() => void run({ kind: 'resources' })}
              />
              {resources?.unavailable.map((name) => (
                <p key={name} role="status">
                  {z('unavailable', { name: z(`resourceNames.${name}`) })}
                </p>
              ))}
              {!resources && <p>{z('resourcesNeeded')}</p>}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run({ kind: 'settings', input: settings });
                }}
                {...stylex.props(styles.stack)}
              >
                {(
                  ['syncMembers', 'syncCard', 'syncPhoto', 'blockOnFreeze', 'importEvents'] as const
                )
                  .filter((key) => key === 'syncMembers' || key === 'blockOnFreeze' || c[key])
                  .map((key) => (
                    <Switch
                      key={key}
                      label={z(key)}
                      checked={settings[key]}
                      disabled={busy}
                      onChange={(value) => patch(key, value)}
                    />
                  ))}
                {c.accessLevels && levels('accessLevelIds', 'accessLevels')}
                {c.entranceLevels && levels('entranceLevelIds', 'entranceLevels')}
                {select(
                  'onExpiry',
                  settings.onExpiry,
                  (value) => patch('onExpiry', value as ZktecoSettings['onExpiry']),
                  c.onExpiry.map((value) => ({ value, label: z(`expiry.${value}`) })),
                )}
                {settings.onExpiry === 'remove_access' && (
                  <p {...stylex.props(styles.text)}>{z('removeAccessHint')}</p>
                )}
                {c.chooseDoor &&
                  select(
                    'checkInDoor',
                    settings.checkInDoor ? JSON.stringify(settings.checkInDoor) : '',
                    (value) =>
                      patch(
                        'checkInDoor',
                        value ? (JSON.parse(value) as ZktecoSettings['checkInDoor']) : null,
                      ),
                    [
                      { value: '', label: z('none') },
                      ...(resources?.doors ?? [])
                        .filter(() => !unavailable('doors'))
                        .map((item) => ({
                          value: JSON.stringify({ kind: 'door', id: item.id }),
                          label: `${z('door')}: ${item.name}`,
                        })),
                      ...(resources?.gates ?? [])
                        .filter(() => !unavailable('gates'))
                        .map((item) => ({
                          value: JSON.stringify({ kind: 'gate', id: item.id }),
                          label: `${z('gate')}: ${item.name}`,
                        })),
                    ],
                    unavailable('doors') && unavailable('gates'),
                  )}
                {c.remoteOpen &&
                  input(
                    'openSeconds',
                    String(settings.openSeconds),
                    (value) => patch('openSeconds', Number(value)),
                    'number',
                  )}
                {c.whoIsInside &&
                  select(
                    'insideZoneCode',
                    settings.insideZoneCode ?? '',
                    (value) => patch('insideZoneCode', value || null),
                    [
                      { value: '', label: z('none') },
                      ...(resources?.areas ?? []).map((area) => ({
                        value: area.code,
                        label: area.name,
                      })),
                    ],
                    unavailable('areas'),
                  )}
                {input('timeZone', settings.timeZone, (value) => patch('timeZone', value))}
                {c.deviceLocations && (
                  <fieldset disabled={busy || unavailable('devices')}>
                    <legend>{z('deviceLocations')}</legend>
                    {[
                      ...(resources?.devices ?? []),
                      ...Object.keys(settings.deviceLocations)
                        .filter((sn) => !resources?.devices.some((item) => item.sn === sn))
                        .map((sn) => ({
                          sn,
                          name: z('missingResource', { id: sn }),
                          online: null,
                        })),
                    ].map((item) => (
                      <div key={item.sn} {...stylex.props(styles.field)}>
                        <Label htmlFor={`zkt-device-${item.sn}`}>
                          {item.name} ({item.sn}) ·{' '}
                          {z(item.online === null ? 'unknown' : item.online ? 'online' : 'offline')}
                        </Label>
                        <select
                          id={`zkt-device-${item.sn}`}
                          value={settings.deviceLocations[item.sn] ?? ''}
                          {...stylex.props(styles.select)}
                          onChange={(e) => {
                            const map = { ...settings.deviceLocations };
                            if (e.target.value) map[item.sn] = e.target.value;
                            else delete map[item.sn];
                            patch('deviceLocations', map);
                          }}
                        >
                          <option value="">{z('defaultLocation')}</option>
                          {settings.deviceLocations[item.sn] &&
                            !locations.some(
                              (location) => location.id === settings.deviceLocations[item.sn],
                            ) && (
                              <option value={settings.deviceLocations[item.sn]}>
                                {z('missingResource', { id: settings.deviceLocations[item.sn]! })}
                              </option>
                            )}
                          {locations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </fieldset>
                )}
                <Button type="submit" variant="primary" disabled={busy} label={z('saveSettings')} />
              </form>
              <div {...stylex.props(styles.row)}>
                <Button
                  variant="secondary"
                  disabled={busy || !integration.enabled}
                  label={z('sync')}
                  onClick={() => void run({ kind: 'sync' })}
                />
                <Button
                  variant="secondary"
                  disabled={busy}
                  label={z('refreshStatus')}
                  onClick={() => void run({ kind: 'status' })}
                />
                {c.remoteOpen && (
                  <Button
                    variant="secondary"
                    disabled={busy || !integration.enabled}
                    label={z('open')}
                    onClick={() => void run({ kind: 'open' })}
                  />
                )}
                {c.whoIsInside && (
                  <Button
                    variant="secondary"
                    disabled={busy || !integration.enabled}
                    label={z('inside')}
                    onClick={() => {
                      setInside(undefined);
                      void run({ kind: 'inside' });
                    }}
                  />
                )}
              </div>
              <p {...stylex.props(styles.text)}>{z('openHint')}</p>
              {status && (
                <section aria-label={z('status')}>
                  <h3>{z('status')}</h3>
                  <p role="status">{z(status.running ? 'running' : 'idle')}</p>
                  <dl {...stylex.props(styles.grid)}>
                    {(
                      [
                        'lastSyncAt',
                        'lastReconcileAt',
                        'lastImportAt',
                        'lastEventAt',
                        'lastErrorAt',
                      ] as const
                    ).map((key) => (
                      <div key={key}>
                        <dt>{z(key)}</dt>
                        <dd>{date(status[key])}</dd>
                      </div>
                    ))}
                    {(['synced', 'pending', 'failed'] as const).map((key) => (
                      <div key={key}>
                        <dt>{z(key)}</dt>
                        <dd>{status.members[key]}</dd>
                      </div>
                    ))}
                    {(['imported', 'ignoredUnknown'] as const).map((key) => (
                      <div key={key}>
                        <dt>{z(key)}</dt>
                        <dd>{status.events[key]}</dd>
                      </div>
                    ))}
                  </dl>
                  {status.lastError && (
                    <p role="alert">
                      {t('lastError')}: {safeMessage(status.lastError)}
                    </p>
                  )}
                </section>
              )}
              {inside && (
                <section aria-label={z('inside')}>
                  <h3>
                    {z('inside')} ({inside.zoneCode})
                  </h3>
                  {inside.people.length === 0 ? (
                    <p>{z('emptyInside')}</p>
                  ) : (
                    <ul>
                      {inside.people.map((person) => (
                        <li key={person.pin}>
                          {person.name ?? z('unknownPerson')} · {person.pin}
                          {!person.gymMemberId && ` (${z('externalPerson')})`}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
          <ConfirmDialog
            open={confirm}
            onClose={() => {
              if (!busy) setConfirm(false);
            }}
            onConfirm={() => void run({ kind: 'disconnect' })}
            title={z('disconnectTitle')}
            message={
              <>
                {z('disconnectWarning')}
                {error && <span role="alert">{safeMessage(error)}</span>}
              </>
            }
            confirmLabel={t('disconnect')}
            cancelLabel={t('cancel')}
            danger
            busy={busy}
          />
        </div>
      </Card>
    </section>
  );
}
