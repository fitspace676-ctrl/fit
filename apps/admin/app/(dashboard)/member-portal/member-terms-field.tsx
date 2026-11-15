'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { MEMBER_TERMS_MAX_LENGTH } from '@fit/types';
import { SegmentedControl, TextareaField } from '@fit/ui-kit';
import { fieldErrorText, useFormContext } from '@/components/ui';
import { JOIN_CARD_LOCALES, type JoinCardLocale } from './join-card-field';

/** The `memberTerms` slice of the member portal form. Empty means "none written". */
export interface MemberTermsValues {
  ka: string;
  en: string;
}

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  // The `hidden` attribute alone loses to the `display` the stack sets.
  paneHidden: { display: 'none' },
});

/**
 * The gym's own terms and conditions for members, one text per portal language.
 * The join wizard's "I agree" box links to them, and members can reopen them at
 * `/member/terms`.
 */
export function MemberTermsField() {
  const t = useTranslations('admin.memberPortal.terms');
  const tJoin = useTranslations('admin.memberPortal.joinCard');
  const [locale, setLocale] = useState<JoinCardLocale>('ka');
  const {
    register,
    formState: { errors },
  } = useFormContext<{ memberTerms: MemberTermsValues }>();

  return (
    <div {...stylex.props(styles.stack)}>
      <SegmentedControl
        label={t('languageLabel')}
        value={locale}
        onChange={setLocale}
        options={JOIN_CARD_LOCALES.map((value) => ({
          value,
          label: tJoin(`languages.${value}`),
        }))}
      />
      {/* Both stay mounted so switching language never drops what was typed. */}
      {JOIN_CARD_LOCALES.map((value) => {
        const name = `memberTerms.${value}` as const;
        const error = fieldErrorText(errors, name);
        return (
          <div
            key={value}
            hidden={value !== locale}
            {...stylex.props(styles.stack, value !== locale && styles.paneHidden)}
          >
            <TextareaField
              label={t('label')}
              placeholder={t('placeholder')}
              rows={14}
              maxLength={MEMBER_TERMS_MAX_LENGTH}
              hint={error ?? t('hint')}
              invalid={Boolean(error)}
              {...register(name)}
            />
          </div>
        );
      })}
    </div>
  );
}
