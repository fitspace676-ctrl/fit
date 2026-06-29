'use client';

import { useTranslations } from 'next-intl';
import { Icon } from '@/src/components/ui';
import { useTheme } from '@/src/components/theme/theme-provider';

/** The header sun/moon button that flips the portal between light and dark. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const t = useTranslations('member.shell');
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? t('themeToLight') : t('themeToDark')}
      title={isDark ? t('themeToLight') : t('themeToDark')}
      className="grid h-10 w-10 place-items-center rounded-btn text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-white/5 dark:hover:text-white"
    >
      <Icon name={isDark ? 'sun' : 'moon'} className="h-5 w-5" />
    </button>
  );
}
