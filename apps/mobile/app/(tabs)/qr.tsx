import { PlaceholderScreen } from '../../components/PlaceholderScreen';
import { useTranslation } from '../../providers/I18nProvider';

/** QR check-in — the scannable member code lands in T6.9. */
export default function QrScreen() {
  const t = useTranslation();
  return (
    <PlaceholderScreen
      title={t('common.nav.qr')}
      subtitle="Show this screen at the gym to check in."
    />
  );
}
