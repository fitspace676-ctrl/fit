import { PlaceholderScreen } from '../../../components/PlaceholderScreen';
import { useTranslation } from '../../../providers/I18nProvider';

/** Bookings tab — upcoming + history list lands in T6.5. */
export default function BookingsScreen() {
  const t = useTranslation();
  return (
    <PlaceholderScreen
      title={t('account.bookings.title')}
      subtitle={t('account.bookings.subtitle')}
    />
  );
}
