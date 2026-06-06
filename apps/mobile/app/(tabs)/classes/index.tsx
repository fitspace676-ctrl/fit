import { Link } from 'expo-router';
import { PlaceholderScreen } from '../../../components/PlaceholderScreen';
import { useTranslation } from '../../../providers/I18nProvider';
import { useTheme } from '../../../providers/ThemeProvider';

/** Classes tab landing — the week/list calendar lands in T6.3. */
export default function ClassesScreen() {
  const t = useTranslation();
  const { colors } = useTheme();
  return (
    <PlaceholderScreen title={t('classes.title')} subtitle={t('classes.subtitle')}>
      <Link href="/classes/example" style={{ marginTop: 8, fontSize: 16, color: colors.primary }}>
        Open sample class detail →
      </Link>
    </PlaceholderScreen>
  );
}
