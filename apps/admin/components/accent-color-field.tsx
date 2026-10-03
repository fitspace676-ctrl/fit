'use client';

import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { DEFAULT_PORTAL_ACCENT, HEX_COLOR_PATTERN } from '@fit/types';
import { Controller, fieldErrorText, useFormContext } from '@/components/ui';

const styles = stylex.create({
  block: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '1rem',
    boxShadow: 'inset 0 0 0 1px var(--color-border)',
  },
  head: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  label: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  badge: {
    marginLeft: 'auto',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-accent)',
  },
  desc: {
    margin: 0,
    fontSize: '0.75rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  row: { display: 'flex', alignItems: 'center', gap: '0.625rem' },
  swatchStatic: {
    height: '2.5rem',
    width: '2.75rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-element)',
    boxShadow: 'inset 0 0 0 1px var(--color-border)',
  },
  swatchInput: {
    height: '2.5rem',
    width: '2.75rem',
    flexShrink: 0,
    padding: '0.1875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    cursor: 'pointer',
  },
  hexInput: {
    height: '2.5rem',
    flex: 1,
    minWidth: 0,
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':disabled': 'var(--color-background-muted)',
    },
    paddingInline: '0.625rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    color: {
      default: 'var(--color-text-primary)',
      ':disabled': 'var(--color-text-secondary)',
    },
    outline: 'none',
  },
  hexInvalid: { borderColor: 'var(--color-error)' },
  error: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-error)',
  },
  linkBtn: {
    alignSelf: 'flex-start',
    borderStyle: 'none',
    background: 'none',
    padding: 0,
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: 600,
    textDecorationLine: { default: 'none', ':hover': 'underline' },
    color: 'var(--color-text-accent)',
  },
  tint: (color: string) => ({ backgroundColor: color }),
});

/**
 * One accent colour bound to a form field, in either of its two states. Shared by
 * the member portal colour (Member portal) and the console colour (Settings), so
 * the two read and behave the same.
 *
 * DEFAULT (`null`): the app wears the shipped sky blue, so the swatch and the hex
 * box show it, inert, with a badge. NOT the brand colour: that one is set for
 * invoices and neither app follows it until the gym says so. The ways out are the
 * brand colour in one click, or a custom colour seeded with the default.
 *
 * CHOSEN (a hex): the native colour well and the hex box are two views of the
 * same form value, and one button goes back to the default.
 *
 * `namespace` names the translation block holding this field's copy (`badge`,
 * `inherited`, `useBrand`, `customise`, `reset`, `hexLabel`, `pickerLabel`), so
 * each screen keeps its own wording.
 */
export function AccentColorField({
  name,
  label,
  description,
  brand,
  namespace,
}: {
  /** Dot path of the colour in the form, e.g. `console.primaryColor`. */
  name: string;
  label: string;
  description: string;
  /** The gym's brand colour, offered as a one-click choice. */
  brand: string;
  namespace: string;
}) {
  const t = useTranslations(namespace);
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext();
  const error = fieldErrorText(errors, name);
  const fallback = DEFAULT_PORTAL_ACCENT;
  const brandIsUsable =
    HEX_COLOR_PATTERN.test(brand) && brand.toLowerCase() !== fallback.toLowerCase();
  const choose = (value: string | null) => setValue(name, value, { shouldDirty: true });

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const value = field.value as string | null;
        const inheriting = value === null;
        const shown = value ?? fallback;
        // The colour well rejects anything that is not `#rrggbb`, so an in-flight
        // edit falls back to the default rather than blanking the well.
        const swatch = HEX_COLOR_PATTERN.test(shown) ? shown : fallback;
        return (
          <div {...stylex.props(styles.block)}>
            <div {...stylex.props(styles.head)}>
              <span {...stylex.props(styles.label)}>{label}</span>
              {inheriting ? (
                <span {...stylex.props(styles.badge)}>{t('inheritedBadge')}</span>
              ) : null}
            </div>
            <p {...stylex.props(styles.desc)}>{description}</p>

            <div {...stylex.props(styles.row)}>
              {inheriting ? (
                <span aria-hidden {...stylex.props(styles.swatchStatic, styles.tint(swatch))} />
              ) : (
                <input
                  type="color"
                  aria-label={t('pickerLabel', { label })}
                  value={swatch}
                  onChange={(event) => field.onChange(event.target.value)}
                  {...stylex.props(styles.swatchInput)}
                />
              )}
              <input
                type="text"
                aria-label={t('hexLabel', { label })}
                value={shown}
                disabled={inheriting}
                spellCheck={false}
                maxLength={7}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
                {...stylex.props(styles.hexInput, Boolean(error) && styles.hexInvalid)}
              />
            </div>

            {error ? <p {...stylex.props(styles.error)}>{error}</p> : null}

            {inheriting ? (
              <>
                <p {...stylex.props(styles.desc)}>{t('inherited', { color: fallback })}</p>
                {brandIsUsable ? (
                  <button
                    type="button"
                    onClick={() => choose(brand)}
                    {...stylex.props(styles.linkBtn)}
                  >
                    {t('useBrand', { color: brand })}
                  </button>
                ) : null}
                <button
                  type="button"
                  // Seeded with the colour on screen, so the first nudge is an
                  // adjustment of what the gym is looking at.
                  onClick={() => choose(fallback)}
                  {...stylex.props(styles.linkBtn)}
                >
                  {t('customise')}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => choose(null)} {...stylex.props(styles.linkBtn)}>
                {t('reset')}
              </button>
            )}
          </div>
        );
      }}
    />
  );
}
