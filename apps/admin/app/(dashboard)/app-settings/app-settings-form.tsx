'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Button, Card } from '@fit/ui-kit';
import { MOBILE_APP_FEATURES, type MobileAppSettings } from '@fit/types';
import { updateAppSettingsAction } from './actions';
import { AppColorField } from './app-color-field';
import { FeatureCard } from './feature-card';
import { LoginImageField } from './login-image-field';

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '56rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.875rem',
    fontWeight: 800,
    color: 'var(--color-text-primary)',
  },
  subtitle: { margin: '0.5rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  card: { display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem' },
  features: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  // auto-fill keeps one column on a phone, two on a tablet and three at the
  // page's full width without a breakpoint per layout.
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 16rem), 1fr))',
    gap: '1rem',
  },
  actions: { display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' },
  message: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
});
export function AppSettingsForm({ initial }: { initial: MobileAppSettings }) {
  const t = useTranslations('admin.appSettings');
  const [saved, setSaved] = useState(initial.features);
  const [features, setFeatures] = useState(initial.features);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const dirty = MOBILE_APP_FEATURES.some((key) => features[key] !== saved[key]);
  return (
    <div {...stylex.props(styles.page)}>
      <header>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
      </header>
      {!initial.enabled ? (
        <Card padding="none" xstyle={styles.card}>
          <p {...stylex.props(styles.message)}>{t('noApp')}</p>
          <Button
            variant="primary"
            size="inline"
            label={t('request')}
            onClick={() => {
              setError(false);
              setMessage(t('requestConfirmation'));
            }}
          />
        </Card>
      ) : (
        <>
          <AppColorField initial={initial} />
          <LoginImageField initial={initial} />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void (async () => {
                setPending(true);
                setMessage('');
                try {
                  const result = await updateAppSettingsAction({ features });
                  setError(!result.ok);
                  if (result.ok) {
                    setSaved(result.data.features);
                    setFeatures(result.data.features);
                    setMessage(t('saved'));
                  } else setMessage(result.error);
                } catch {
                  setError(true);
                  setMessage(t('saveError'));
                } finally {
                  setPending(false);
                }
              })();
            }}
          >
            <section {...stylex.props(styles.features)}>
              <p {...stylex.props(styles.message)}>{t('alwaysVisible')}</p>
              <div {...stylex.props(styles.grid)}>
                {MOBILE_APP_FEATURES.map((key) => (
                  <FeatureCard
                    key={key}
                    feature={key}
                    title={t(`features.${key}`)}
                    description={t(`hints.${key}`)}
                    illustrationAlt={t(`illustrations.${key}`)}
                    checked={features[key]}
                    disabled={pending}
                    onChange={(checked) => {
                      setFeatures((current) => ({ ...current, [key]: checked }));
                      setMessage('');
                    }}
                  />
                ))}
              </div>
              <div {...stylex.props(styles.actions)}>
                <Button
                  type="submit"
                  variant="primary"
                  size="inline"
                  label={pending ? t('saving') : t('save')}
                  disabled={!dirty || pending}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="inline"
                  label={t('discard')}
                  disabled={!dirty || pending}
                  onClick={() => {
                    setFeatures(saved);
                    setMessage('');
                  }}
                />
              </div>
            </section>
          </form>
        </>
      )}
      {message && (
        <p role={error ? 'alert' : 'status'} {...stylex.props(styles.message)}>
          {message}
        </p>
      )}
    </div>
  );
}
