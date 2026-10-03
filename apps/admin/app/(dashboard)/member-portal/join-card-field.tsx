'use client';

import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { JOIN_CARD_LIMITS, type JoinCardDefaults } from '@fit/types';
import { Field, SegmentedControl, Switch, TextareaField } from '@fit/ui-kit';
import { Icon, fieldErrorText, useFormContext, useWatch } from '@/components/ui';
import { TextField } from '@/components/ui/form-fields';

/** The two portal languages the card is written in, in display order. */
export const JOIN_CARD_LOCALES = ['ka', 'en'] as const;

/** One of {@link JOIN_CARD_LOCALES}. */
export type JoinCardLocale = (typeof JOIN_CARD_LOCALES)[number];

/**
 * One language's copy as the FORM holds it. Lines are strings, and an empty one
 * is "the built-in text": the API folds `''` into `null` on save, so the form
 * never has to tell the two apart. `benefits` stays nullable, because `null`
 * (the built-in list) and `[]` (no list) are two different choices.
 */
export interface JoinCardCopyValues {
  title: string;
  subtitle: string;
  benefits: string[] | null;
  cta: string;
}

/** The `joinCard` slice of the member portal form. */
export interface JoinCardValues {
  hidden: boolean;
  ka: JoinCardCopyValues;
  en: JoinCardCopyValues;
}

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  // The `hidden` attribute alone loses to the `display` the stack sets.
  paneHidden: { display: 'none' },
  benefits: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  benefitsHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  benefitsLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  benefitRow: { display: 'flex', alignItems: 'flex-start', gap: '0.5rem' },
  benefitInput: { flex: 1, minWidth: 0 },
  removeBtn: {
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    height: '2.5rem',
    width: '2.5rem',
    borderStyle: 'none',
    borderRadius: 'var(--radius-element)',
    cursor: 'pointer',
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-background-muted)' },
  },
  defaultList: {
    margin: 0,
    paddingInlineStart: '1.125rem',
    fontSize: '0.8125rem',
    lineHeight: 1.6,
    color: 'var(--color-text-secondary)',
  },
  hint: {
    margin: 0,
    fontSize: '0.75rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
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
});

/**
 * The sign-in join card's controls: a show/hide switch, then the copy for the
 * language picked in the segmented control above the fields.
 *
 * The language is lifted to the parent form, because the preview beside it shows
 * the card in the same language the gym is editing.
 *
 * Every empty field shows the built-in text as its placeholder, so "leave it
 * empty" visibly means "keep this". The benefit list works like the colour and
 * logo cards: it starts by following the built-in list, one button copies that
 * list into editable rows, and one button goes back.
 */
export function JoinCardField({
  locale,
  onLocaleChange,
  defaults,
}: {
  locale: JoinCardLocale;
  onLocaleChange: (locale: JoinCardLocale) => void;
  /** The built-in copy per language, which every empty field falls back to. */
  defaults: Record<JoinCardLocale, JoinCardDefaults>;
}) {
  const t = useTranslations('admin.memberPortal.joinCard');
  const { control, setValue } = useFormContext<{ joinCard: JoinCardValues }>();
  const hidden = useWatch({ control, name: 'joinCard.hidden' });
  const tooLong = (max: number) => t('tooLong', { max });

  return (
    <div {...stylex.props(styles.stack)}>
      <Switch
        label={t('visibleLabel')}
        description={t('visibleDesc')}
        checked={!hidden}
        onChange={(visible) => setValue('joinCard.hidden', !visible, { shouldDirty: true })}
      />

      <SegmentedControl
        label={t('languageLabel')}
        value={locale}
        onChange={onLocaleChange}
        options={JOIN_CARD_LOCALES.map((value) => ({ value, label: t(`languages.${value}`) }))}
      />

      {/* Both languages stay mounted and the other one is only hidden. Remounting
          the inputs on every switch dropped what had been typed in the tab being
          left, because a freshly registered input starts from its DOM value. */}
      {JOIN_CARD_LOCALES.map((value) => (
        <div
          key={value}
          hidden={value !== locale}
          {...stylex.props(styles.stack, value !== locale && styles.paneHidden)}
        >
          <TextField
            name={`joinCard.${value}.title`}
            label={t('titleLabel')}
            // `{gym}` is the literal token the gym types, so it is passed in as itself.
            hint={t('titleHint', { gym: '{gym}' })}
            placeholder={defaults[value].titleNamed}
            maxLength={JOIN_CARD_LIMITS.title}
            rules={{
              maxLength: {
                value: JOIN_CARD_LIMITS.title,
                message: tooLong(JOIN_CARD_LIMITS.title),
              },
            }}
          />
          <CopyTextarea
            name={`joinCard.${value}.subtitle`}
            label={t('subtitleLabel')}
            placeholder={defaults[value].subtitle}
            max={JOIN_CARD_LIMITS.subtitle}
            tooLong={tooLong(JOIN_CARD_LIMITS.subtitle)}
          />
          <BenefitList locale={value} fallback={defaults[value].benefits} />
          <TextField
            name={`joinCard.${value}.cta`}
            label={t('ctaLabel')}
            placeholder={defaults[value].cta}
            maxLength={JOIN_CARD_LIMITS.cta}
            rules={{
              maxLength: { value: JOIN_CARD_LIMITS.cta, message: tooLong(JOIN_CARD_LIMITS.cta) },
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** A textarea bound to the form, in the kit's field shell. */
function CopyTextarea({
  name,
  label,
  placeholder,
  max,
  tooLong,
}: {
  name: string;
  label: string;
  placeholder: string;
  max: number;
  tooLong: string;
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const error = fieldErrorText(errors, name);
  return (
    <TextareaField
      label={label}
      placeholder={placeholder}
      rows={2}
      maxLength={max}
      hint={error}
      invalid={Boolean(error)}
      {...register(name, { maxLength: { value: max, message: tooLong } })}
    />
  );
}

/**
 * The benefit rows for one language. `null` follows the built-in list and shows
 * it read-only; a list (even an empty one) is the gym's own.
 */
function BenefitList({ locale, fallback }: { locale: JoinCardLocale; fallback: string[] }) {
  const t = useTranslations('admin.memberPortal.joinCard');
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<{ joinCard: JoinCardValues }>();
  const name = `joinCard.${locale}.benefits` as const;
  const benefits = useWatch({ control, name });
  const write = (next: string[] | null) => setValue(name, next, { shouldDirty: true });

  return (
    <div {...stylex.props(styles.benefits)}>
      <div {...stylex.props(styles.benefitsHead)}>
        <span {...stylex.props(styles.benefitsLabel)}>{t('benefitsLabel')}</span>
        {benefits !== null ? (
          <button type="button" onClick={() => write(null)} {...stylex.props(styles.linkBtn)}>
            {t('resetBenefits')}
          </button>
        ) : null}
      </div>

      {benefits === null ? (
        <>
          <ul {...stylex.props(styles.defaultList)}>
            {fallback.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p {...stylex.props(styles.hint)}>{t('benefitsDefault')}</p>
          <button
            type="button"
            onClick={() => write([...fallback])}
            {...stylex.props(styles.linkBtn)}
          >
            {t('customiseBenefits')}
          </button>
        </>
      ) : (
        <>
          {benefits.map((line, index) => {
            const error = fieldErrorText(errors, `${name}.${index}`);
            return (
              <div key={index} {...stylex.props(styles.benefitRow)}>
                <div {...stylex.props(styles.benefitInput)}>
                  <Field
                    label={t('benefitLabel', { number: index + 1 })}
                    labelHidden
                    value={line}
                    maxLength={JOIN_CARD_LIMITS.benefit}
                    hint={error}
                    invalid={Boolean(error)}
                    onChange={(event) =>
                      write(benefits.map((value, i) => (i === index ? event.target.value : value)))
                    }
                  />
                </div>
                <button
                  type="button"
                  aria-label={t('removeBenefit', { number: index + 1 })}
                  onClick={() => write(benefits.filter((_, i) => i !== index))}
                  {...stylex.props(styles.removeBtn)}
                >
                  <Icon name="x" width={16} height={16} />
                </button>
              </div>
            );
          })}
          {benefits.length === 0 ? <p {...stylex.props(styles.hint)}>{t('noBenefits')}</p> : null}
          {benefits.length < JOIN_CARD_LIMITS.benefits ? (
            <button
              type="button"
              onClick={() => write([...benefits, ''])}
              {...stylex.props(styles.linkBtn)}
            >
              {t('addBenefit')}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
