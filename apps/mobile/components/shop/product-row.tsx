import { Pressable, View } from 'react-native';
import { Icon, Money, Text, spacing, useThemeColors, type ProductRowProps } from '@fit/ui-mobile';
import { ProductImage } from './product-image';

/** App-owned photo row: independent trailing controls never nest inside its button. */
export function ProductRow({
  name,
  price,
  priceAccessibilityLabel,
  imageUrl,
  meta,
  originalPrice,
  originalPriceAccessibilityLabel,
  layout = 'compact',
  onPress,
  trailing,
  disabled,
  accessibilityLabel,
  testID,
  style,
}: ProductRowProps & {
  imageUrl?: string | null;
  originalPrice?: string;
  originalPriceAccessibilityLabel?: string;
}) {
  const colors = useThemeColors();
  const line = layout === 'line';
  const compact = layout === 'compact';
  const content = (
    <>
      <ProductImage imageUrl={imageUrl} name={name} size={compact ? 48 : line ? 56 : 72} />
      <View style={{ flex: 1, minWidth: 0, gap: spacing[1] }}>
        <Text variant="body" numberOfLines={2}>
          {name}
        </Text>
        {meta ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {originalPrice ? (
          <Text
            variant="caption"
            color="textSecondary"
            accessibilityLabel={originalPriceAccessibilityLabel}
            style={{ textDecorationLine: 'line-through' }}
          >
            {originalPrice}
          </Text>
        ) : null}
        <Money
          variant="monoSmall"
          color={line ? 'textSecondary' : 'textAccent'}
          accessibilityLabel={priceAccessibilityLabel}
        >
          {price}
        </Money>
      </View>
      {compact ? <Icon name="chevronRight" size={16} color="textSecondary" /> : null}
    </>
  );
  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing[3],
  };
  return (
    <View
      testID={onPress ? `${testID}-container` : testID}
      style={[
        rowStyle,
        {
          backgroundColor: line ? undefined : colors.backgroundCard,
          borderRadius: 26,
          padding: line ? 0 : spacing[4],
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {onPress ? (
        <Pressable
          testID={testID}
          onPress={onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!disabled }}
          accessibilityLabel={
            accessibilityLabel ??
            [name, meta, originalPriceAccessibilityLabel, priceAccessibilityLabel]
              .filter(Boolean)
              .join(', ')
          }
          style={[rowStyle, { flex: 1, minWidth: 0, minHeight: 44 }]}
        >
          {content}
        </Pressable>
      ) : (
        <View style={[rowStyle, { flex: 1, minWidth: 0 }]}>{content}</View>
      )}
      {trailing}
    </View>
  );
}
