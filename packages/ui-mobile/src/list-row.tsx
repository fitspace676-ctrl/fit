import { type ReactNode } from 'react';
import { Pressable, Text, View, type PressableProps } from 'react-native';

export interface ListRowProps extends Omit<PressableProps, 'style' | 'children'> {
  /** Primary line. String children are wrapped in a `<Text>` automatically. */
  title: ReactNode;
  /** Secondary line under the title. */
  subtitle?: ReactNode;
  /** Element pinned to the leading edge (avatar, icon, colour rail). */
  leading?: ReactNode;
  /** Element pinned to the trailing edge (badge, value, chevron). */
  trailing?: ReactNode;
  /** Draw a hairline separator under the row. */
  divided?: boolean;
  /** Extra classes merged onto the row container. */
  className?: string;
}

/**
 * A tappable list row — leading slot · title/subtitle · trailing slot — the
 * mobile workhorse behind settings lists, member lists, cart lines, and menus.
 * Renders as a `Pressable` only when `onPress` is set, otherwise a static
 * `View`, so non-interactive rows don't advertise a button role.
 */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  divided = false,
  className = '',
  onPress,
  ...rest
}: ListRowProps) {
  const body = (
    <>
      {leading ? <View className="shrink-0">{leading}</View> : null}
      <View className="min-w-0 flex-1">
        {typeof title === 'string' ? (
          <Text
            numberOfLines={1}
            className="text-[15px] font-semibold text-ink-900 dark:text-white"
          >
            {title}
          </Text>
        ) : (
          title
        )}
        {subtitle != null ? (
          typeof subtitle === 'string' ? (
            <Text numberOfLines={1} className="text-[13px] text-ink-500 dark:text-ink-300">
              {subtitle}
            </Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {trailing ? <View className="shrink-0">{trailing}</View> : null}
    </>
  );

  const layout = `flex-row items-center gap-3 py-3 ${
    divided ? 'border-b border-ink-200 dark:border-ink-800' : ''
  } ${className}`;

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        className={`${layout} active:opacity-60`}
        {...rest}
      >
        {body}
      </Pressable>
    );
  }
  return <View className={layout}>{body}</View>;
}
