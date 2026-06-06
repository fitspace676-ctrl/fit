import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '../../../../components/PlaceholderScreen';
import { useTranslation } from '../../../../providers/I18nProvider';

/**
 * Order detail — target of the `fit://orders/:orderId` deep link (remapped to
 * this nested route by `app/+native-intent.ts`). Full order view lands in T6.7.
 */
export default function OrderDetailScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const t = useTranslation();
  return (
    <PlaceholderScreen title={t('common.nav.shop')} subtitle={`Order: ${orderId ?? 'unknown'}`} />
  );
}
