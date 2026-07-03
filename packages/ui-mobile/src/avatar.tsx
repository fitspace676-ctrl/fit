import { Image, Text, View } from 'react-native';

/** Diameter tokens for {@link Avatar}. */
export type AvatarSize = 'sm' | 'md' | 'lg';

const SIZE: Record<AvatarSize, { box: string; label: string }> = {
  sm: { box: 'h-8 w-8', label: 'text-xs' },
  md: { box: 'h-10 w-10', label: 'text-sm' },
  lg: { box: 'h-14 w-14', label: 'text-lg' },
};

export interface AvatarProps {
  /** Image URL. When absent, the initials fallback is shown. */
  src?: string | null;
  /** Full name — used for the accessibility label and initials fallback. */
  name?: string;
  /** Diameter. Defaults to `md`. */
  size?: AvatarSize;
  /** Add the brand selection ring. */
  ring?: boolean;
  /** Extra classes merged onto the circle. */
  className?: string;
}

/** Derive up-to-two uppercase initials from a name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * A circular avatar — the Expo mirror of web's `Avatar`. Renders the image when
 * `src` is set, otherwise a brand-tinted initials circle.
 */
export function Avatar({ src, name = '', size = 'md', ring = false, className = '' }: AvatarProps) {
  const s = SIZE[size];
  const ringCls = ring ? 'border-2 border-brand-500' : 'border border-ink-200 dark:border-ink-800';
  if (src) {
    return (
      <Image
        accessibilityRole="image"
        accessibilityLabel={name || undefined}
        source={{ uri: src }}
        className={`${s.box} rounded-full ${ringCls} ${className}`}
      />
    );
  }
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name || undefined}
      className={`${s.box} items-center justify-center rounded-full bg-brand-100 dark:bg-brand-500/20 ${ringCls} ${className}`}
    >
      <Text className={`font-semibold text-brand-700 dark:text-brand-200 ${s.label}`}>
        {initials(name)}
      </Text>
    </View>
  );
}
