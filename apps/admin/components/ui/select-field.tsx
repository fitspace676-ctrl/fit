'use client';

import { useTranslations } from 'next-intl';
import { ComboboxField, type ComboboxFieldProps } from '@fit/ui-kit';

export function SelectField(props: Omit<ComboboxFieldProps, 'labels'>) {
  const t = useTranslations('admin.common.select');
  return (
    <ComboboxField labels={{ search: t('searchPlaceholder'), empty: t('empty') }} {...props} />
  );
}

export type { SelectOption, SelectOptionGroup } from '@fit/ui-kit';
