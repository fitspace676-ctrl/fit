import { PlaceholderScreen } from '../../../components/PlaceholderScreen';
import { useTranslation } from '../../../providers/I18nProvider';

/** Shop tab — browse + cart + checkout land in T6.7. */
export default function ShopScreen() {
  const t = useTranslation();
  return <PlaceholderScreen title={t('common.nav.shop')} />;
}
