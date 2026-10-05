'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { z } from 'zod';
import { Button, Card } from '@fit/ui-kit';
import {
  DEFAULT_PORTAL_ACCENT,
  HEX_COLOR_PATTERN,
  mobileAccentPalette,
  type MobileAccentRoles,
  type MobileAppSettings,
} from '@fit/types';
import { Form, useWatch, useZodForm } from '@/components/ui';
import { AccentColorField } from '@/components/accent-color-field';
import { updateAppSettingsAction } from './actions';

type AppColor = Pick<
  MobileAppSettings,
  | 'primaryColor'
  | 'primaryColorSource'
  | 'inheritedPrimaryColor'
  | 'inheritedPrimaryColorSource'
  | 'onPrimaryColor'
>;

/**
 * The app's built-in accent (`packages/ui-mobile/src/tokens/semantic.ts`), so the
 * preview of a gym that has chosen nothing shows what its members actually see.
 */
const BUILT_IN: Record<
  'light' | 'dark',
  Pick<MobileAccentRoles, 'accent' | 'onAccent' | 'textAccent'>
> = {
  light: { accent: '#1A7FD6', onAccent: '#FFFFFF', textAccent: '#0B67A8' },
  dark: { accent: '#1A7FD6', onAccent: '#FFFFFF', textAccent: '#7CC4FF' },
};

/** The app's own two canvases, from the same token file. */
const CANVAS = {
  light: { page: '#EEEEED', card: '#FFFFFF', text: '#131312', muted: '#6B6B66' },
  dark: { page: '#131312', card: '#1E1E1C', text: '#FFFFFF', muted: '#A3A39E' },
} as const;

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' },
  title: { margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' },
  desc: { margin: '0.125rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  previews: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' },
  phone: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
    width: '13rem',
    padding: '0.875rem',
    borderRadius: '1.25rem',
    boxShadow: 'inset 0 0 0 1px var(--color-border)',
  },
  caption: { margin: 0, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em' },
  tabs: { display: 'flex', gap: '0.375rem' },
  tab: {
    borderRadius: '999px',
    paddingInline: '0.625rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  sample: {
    borderRadius: '0.75rem',
    padding: '0.625rem',
    fontSize: '0.8125rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  link: { fontWeight: 600 },
  button: {
    borderRadius: '999px',
    paddingBlock: '0.5rem',
    textAlign: 'center',
    fontSize: '0.8125rem',
    fontWeight: 700,
  },
  actions: { display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' },
  message: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  paint: (background: string, color: string) => ({ backgroundColor: background, color }),
  ink: (color: string) => ({ color }),
});

function PhonePreview({ mode, color }: { mode: 'light' | 'dark'; color: string | null }) {
  const t = useTranslations('admin.appSettings.color');
  const canvas = CANVAS[mode];
  const roles = mobileAccentPalette(color)?.[mode] ?? BUILT_IN[mode];
  return (
    <div {...stylex.props(styles.phone, styles.paint(canvas.page, canvas.text))}>
      <p {...stylex.props(styles.caption, styles.ink(canvas.muted))}>
        {mode === 'light' ? t('previewLight') : t('previewDark')}
      </p>
      <div {...stylex.props(styles.tabs)}>
        <span {...stylex.props(styles.tab, styles.paint(roles.accent, roles.onAccent))}>
          {t('previewTabActive')}
        </span>
        <span {...stylex.props(styles.tab, styles.paint(canvas.card, canvas.muted))}>
          {t('previewTab')}
        </span>
      </div>
      <div {...stylex.props(styles.sample, styles.paint(canvas.card, canvas.text))}>
        <span>
          {t('previewText')}{' '}
          <span {...stylex.props(styles.link, styles.ink(roles.textAccent))}>
            {t('previewLink')}
          </span>
        </span>
        <span {...stylex.props(styles.button, styles.paint(roles.accent, roles.onAccent))}>
          {t('previewButton')}
        </span>
      </div>
    </div>
  );
}

function Previews() {
  const value = useWatch({ name: 'primaryColor' }) as string | null;
  const inherited = useWatch({ name: 'inherited' }) as string | null;
  const shown = value !== null && HEX_COLOR_PATTERN.test(value) ? value : inherited;
  return (
    <div {...stylex.props(styles.previews)}>
      <PhonePreview mode="light" color={shown} />
      <PhonePreview mode="dark" color={shown} />
    </div>
  );
}

/**
 * The app's accent: one colour for buttons, active tabs and highlights. Left
 * unset, the app follows the member portal's colour, then the brand's, then its
 * own built-in blue — the badge and the hint say which. Saved on its own, like
 * the photo above it; the app picks it up the next time it reads its settings.
 */
export function AppColorField({ initial }: { initial: AppColor }) {
  const t = useTranslations('admin.appSettings.color');
  const [saved, setSaved] = useState<AppColor>(initial);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  const schema = z.object({
    primaryColor: z.string().regex(HEX_COLOR_PATTERN, t('invalid')).nullable(),
    inherited: z.string().nullable(),
  });
  const toValues = (color: AppColor) => ({
    primaryColor: color.primaryColorSource === 'app' ? color.primaryColor : null,
    inherited: color.inheritedPrimaryColor,
  });
  const form = useZodForm(schema, { defaultValues: toValues(initial) });
  const { isDirty, isSubmitting } = form.formState;

  const inheritedHint =
    saved.inheritedPrimaryColor === null
      ? t('inheritedBuiltIn', { color: DEFAULT_PORTAL_ACCENT })
      : saved.inheritedPrimaryColorSource === 'brand'
        ? t('inheritedBrand', { color: saved.inheritedPrimaryColor })
        : t('inheritedPortal', { color: saved.inheritedPrimaryColor });

  async function submit(values: z.infer<typeof schema>): Promise<void> {
    setMessage('');
    const result = await updateAppSettingsAction({ primaryColor: values.primaryColor });
    setError(!result.ok);
    if (result.ok) {
      setSaved(result.data);
      form.reset(toValues(result.data));
      setMessage(t('saved'));
    } else {
      setMessage(result.error);
    }
  }

  return (
    <Form form={form} onSubmit={(values) => void submit(values)}>
      <Card padding="none" xstyle={styles.card}>
        <div>
          <h2 {...stylex.props(styles.title)}>{t('title')}</h2>
          <p {...stylex.props(styles.desc)}>{t('subtitle')}</p>
        </div>
        <AccentColorField
          name="primaryColor"
          label={t('label')}
          description={t('description')}
          namespace="admin.appSettings.color"
          fallback={saved.inheritedPrimaryColor ?? DEFAULT_PORTAL_ACCENT}
          inheritedHint={inheritedHint}
        />
        <Previews />
        <div {...stylex.props(styles.actions)}>
          <Button
            type="submit"
            variant="primary"
            size="inline"
            label={isSubmitting ? t('saving') : t('save')}
            disabled={!isDirty || isSubmitting}
          />
          <Button
            type="button"
            variant="secondary"
            size="inline"
            label={t('discard')}
            disabled={!isDirty || isSubmitting}
            onClick={() => {
              form.reset(toValues(saved));
              setMessage('');
            }}
          />
          {message ? (
            <p role={error ? 'alert' : 'status'} {...stylex.props(styles.message)}>
              {message}
            </p>
          ) : null}
        </div>
      </Card>
    </Form>
  );
}
