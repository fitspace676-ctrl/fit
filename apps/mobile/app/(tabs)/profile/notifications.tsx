import { PlaceholderScreen } from '../../../components/PlaceholderScreen';
import { useTranslation } from '../../../providers/I18nProvider';

/**
 * Notifications — target of the `fit://notifications/:id` deep link (remapped to
 * this route by `app/+native-intent.ts`). Push handling lands in T6.10.
 */
export default function NotificationsScreen() {
  const t = useTranslation();
  return <PlaceholderScreen title={t('common.nav.profile')} subtitle="Notifications" />;
}
