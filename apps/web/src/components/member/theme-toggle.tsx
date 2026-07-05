'use client';

import { useTranslations } from 'next-intl';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@/src/components/ui';
import { useTheme } from '@/src/components/theme/theme-provider';

/**
 * The header sun/moon button that flips the portal between light and dark.
 *
 * Astryx migration (T11.10): rebuilt on the Astryx `IconButton` (ghost variant)
 * so it matches the rest of the member-shell action row. The sun/moon glyph is
 * still the shared formacore `Icon`; only the button chrome moved off Tailwind
 * onto the Astryx theme tokens.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const t = useTranslations('member.shell');
  const isDark = theme === 'dark';
  const label = isDark ? t('themeToLight') : t('themeToDark');

  return (
    <IconButton
      variant="ghost"
      label={label}
      tooltip={label}
      icon={<Icon name={isDark ? 'sun' : 'moon'} />}
      onClick={toggle}
    />
  );
}
