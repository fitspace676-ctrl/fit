'use client';

import { useState, type FormEvent } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { connectFlittSchema, type GymIntegration } from '@fit/types';
import { Badge, Button, Card, Switch } from '@fit/ui-kit';
import { ConfirmDialog, Input, Label, useToast } from '@/components/ui';
import { changeFlitt, type IntegrationCommand, type IntegrationError } from './actions';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    maxWidth: '52rem',
    color: 'var(--color-text-primary)',
  },
  stack: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  row: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.875rem',
    fontWeight: 800,
  },
  heading: { margin: 0, fontSize: '1.25rem', fontWeight: 700 },
  text: { margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 },
  error: { color: 'var(--color-error)', fontSize: '0.875rem', margin: 0 },
  field: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  details: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
    gap: '1rem',
    margin: 0,
  },
  value: { margin: 0, marginTop: '0.25rem', overflowWrap: 'anywhere' },
  link: { color: 'var(--color-text-primary)', textDecoration: 'underline' },
});

export function IntegrationsForm({ initial }: { initial: GymIntegration }) {
  const t = useTranslations('admin.integrations');
  const format = useFormatter();
  const { toast } = useToast();
  const [integration, setIntegration] = useState(initial);
  const [editing, setEditing] = useState(!initial.connected);
  const [merchantId, setMerchantId] = useState(initial.merchantId ?? '');
  const [secretKey, setSecretKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<IntegrationError | null>(null);
  const [fields, setFields] = useState<{ merchantId?: boolean; secretKey?: boolean }>({});
  const [tested, setTested] = useState(false);
  const state = !integration.connected ? 'disconnected' : integration.enabled ? 'active' : 'off';

  async function run(command: IntegrationCommand) {
    setBusy(true);
    setError(null);
    setTested(false);
    try {
      const result = await changeFlitt(command);
      if (result.data) {
        setIntegration(result.data);
        setMerchantId(result.data.merchantId ?? '');
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (command.kind === 'connect' || command.kind === 'disconnect') {
        setSecretKey('');
        setEditing(!result.data.connected);
      }
      setTested(result.tested === true);
      setConfirm(false);
      toast(t(result.tested ? 'testSuccess' : 'saved'), { tone: 'success', icon: 'check' });
    } catch {
      setError('unreachable');
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = connectFlittSchema.safeParse({ merchantId, secretKey });
    if (!parsed.success) {
      setFields({
        merchantId: parsed.error.issues.some((i) => i.path[0] === 'merchantId'),
        secretKey: parsed.error.issues.some((i) => i.path[0] === 'secretKey'),
      });
      return;
    }
    setFields({});
    void run({ kind: 'connect', ...parsed.data });
  }
  const lastError = integration.lastError;
  const knownError =
    lastError === 'bad_key' || lastError === 'unknown_merchant' || lastError === 'unreachable';

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.stack)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.text)}>{t('subtitle')}</p>
      </header>
      <Card>
        <div {...stylex.props(styles.stack)}>
          <div {...stylex.props(styles.row)}>
            <h2 {...stylex.props(styles.heading)}>Flitt</h2>
            <Badge tone={integration.enabled ? 'positive' : 'neutral'}>{t(`state.${state}`)}</Badge>
            {integration.testMode && <Badge>{t('testMode')}</Badge>}
          </div>
          <p {...stylex.props(styles.text)}>{t('description')}</p>
          {integration.connected && (
            <dl {...stylex.props(styles.details)}>
              <div>
                <dt>{t('merchantId')}</dt>
                <dd {...stylex.props(styles.value)}>{integration.merchantId}</dd>
              </div>
              <div>
                <dt>{t('secretKey')}</dt>
                <dd {...stylex.props(styles.value)}>••••{integration.secretHint}</dd>
              </div>
              <div>
                <dt>{t('verifiedAt')}</dt>
                <dd {...stylex.props(styles.value)}>
                  {integration.verifiedAt
                    ? format.dateTime(new Date(integration.verifiedAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : t('neverVerified')}
                </dd>
              </div>
            </dl>
          )}
          {lastError && (
            <p {...stylex.props(styles.error)}>
              {t('lastError')}: {t(`errors.${knownError ? lastError : 'unexpected'}`)}
            </p>
          )}
          <Switch
            label={t('enable')}
            description={t(integration.enabled ? 'onConsequence' : 'offConsequence')}
            checked={integration.enabled}
            disabled={busy || !integration.connected}
            onChange={(enabled) => void run({ kind: 'enable', enabled })}
          />
          {error && !confirm && (
            <p role="alert" {...stylex.props(styles.error)}>
              {t(`errors.${error}`)}
            </p>
          )}
          {tested && <p role="status">{t('testSuccess')}</p>}
          {integration.connected && (
            <div {...stylex.props(styles.row)}>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void run({ kind: 'test' })}
              >
                {t('test')}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(true);
                  setSecretKey('');
                  setFields({});
                }}
              >
                {t('replace')}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setConfirm(true)}>
                {t('disconnect')}
              </Button>
            </div>
          )}
          {editing && (
            <form onSubmit={submit} noValidate {...stylex.props(styles.stack)}>
              <div {...stylex.props(styles.field)}>
                <Label htmlFor="flitt-merchant">{t('merchantId')}</Label>
                <Input
                  id="flitt-merchant"
                  inputMode="numeric"
                  autoComplete="off"
                  value={merchantId}
                  disabled={busy}
                  onChange={(e) => setMerchantId(e.target.value.replace(/\D/g, ''))}
                  invalid={fields.merchantId}
                  aria-describedby={fields.merchantId ? 'merchant-error' : undefined}
                />
                {fields.merchantId && (
                  <p id="merchant-error" role="alert" {...stylex.props(styles.error)}>
                    {t('merchantInvalid')}
                  </p>
                )}
              </div>
              <div {...stylex.props(styles.field)}>
                <Label htmlFor="flitt-secret">{t('secretKey')}</Label>
                <Input
                  id="flitt-secret"
                  type="password"
                  autoComplete="new-password"
                  value={secretKey}
                  disabled={busy}
                  onChange={(e) => setSecretKey(e.target.value)}
                  invalid={fields.secretKey}
                  aria-describedby={fields.secretKey ? 'secret-error' : undefined}
                />
                {fields.secretKey && (
                  <p id="secret-error" role="alert" {...stylex.props(styles.error)}>
                    {t('secretInvalid')}
                  </p>
                )}
              </div>
              <div {...stylex.props(styles.row)}>
                <Button type="submit" variant="primary" disabled={busy}>
                  {t(integration.connected ? 'save' : 'connect')}
                </Button>
                {integration.connected && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setEditing(false);
                      setSecretKey('');
                      setMerchantId(integration.merchantId ?? '');
                    }}
                  >
                    {t('cancel')}
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>
      </Card>
      <Card>
        <div {...stylex.props(styles.stack)}>
          <h2 {...stylex.props(styles.heading)}>{t('helpTitle')}</h2>
          <p {...stylex.props(styles.text)}>{t('help')}</p>
          <a
            href="https://portal.flitt.com"
            target="_blank"
            rel="noopener noreferrer"
            {...stylex.props(styles.link)}
          >
            {t('portal')}
          </a>
        </div>
      </Card>
      <ConfirmDialog
        open={confirm}
        onClose={() => {
          if (!busy) setConfirm(false);
        }}
        onConfirm={() => void run({ kind: 'disconnect' })}
        title={t('disconnectTitle')}
        message={
          <>
            <p>{t('disconnectMessage')}</p>
            {error && (
              <p role="alert" {...stylex.props(styles.error)}>
                {t(`errors.${error}`)}
              </p>
            )}
          </>
        }
        confirmLabel={t('disconnect')}
        cancelLabel={t('cancel')}
        danger
        busy={busy}
      />
    </div>
  );
}
