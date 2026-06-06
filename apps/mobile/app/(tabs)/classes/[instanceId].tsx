import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '../../../components/PlaceholderScreen';
import { useTranslation } from '../../../providers/I18nProvider';

/**
 * Class detail — target of the `fit://classes/:instanceId` deep link. Full
 * Book / Waitlist UI lands in T6.4; for now it confirms the route receives the
 * `instanceId` param.
 */
export default function ClassDetailScreen() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();
  const t = useTranslation();
  return (
    <PlaceholderScreen
      title={t('classes.title')}
      subtitle={`Instance: ${instanceId ?? 'unknown'}`}
    />
  );
}
