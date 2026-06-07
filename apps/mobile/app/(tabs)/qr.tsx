import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n, useTheme } from '../../providers';
import { useAuth } from '../../hooks/useAuth';
import { useSessionProfile } from '../../hooks/useSessionProfile';
import { buildCheckInPayload } from '../../lib/checkin';
import { QrCode } from '../../components/qr/QrCode';

/**
 * QR check-in (T6.9) — the member's scannable code for the gym's front desk.
 *
 * The code encodes a deterministic check-in URI built from the session identity
 * (`useSessionProfile`): the member id and, when the session is scoped to a gym,
 * that gym id. There is no `GET /me` or backend check-in endpoint yet, so the
 * identity baked into the JWT is exactly what the scanner needs. The QR is
 * rendered with the dependency-free `<QrCode>` (plain Views, no SVG/native), and
 * is always painted dark-on-white — independent of the app's dark mode — so it
 * scans reliably. The member id is shown below as a manual fallback for a desk
 * that types codes in by hand. While the session hydrates we show a spinner; a
 * signed-out session (shouldn't reach here behind the route guard) degrades to a
 * friendly prompt. The surrounding chrome tracks system dark mode via `useTheme`.
 */
export default function QrScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { isLoading } = useAuth();
  const { userId, gymId } = useSessionProfile();

  const payload = useMemo(
    () => (userId ? buildCheckInPayload({ userId, gymId }) : null),
    [userId, gymId],
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: 20,
        paddingTop: insets.top + 20,
        gap: 24,
        alignItems: 'center',
      }}
    >
      <View style={{ gap: 4, alignSelf: 'stretch' }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>{t('qr.title')}</Text>
        <Text style={{ fontSize: 14, color: colors.textMuted }}>{t('qr.subtitle')}</Text>
      </View>

      {isLoading ? (
        <View style={{ paddingVertical: 64, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : payload ? (
        <>
          <View
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 20,
              padding: 24,
              alignItems: 'center',
              gap: 16,
              shadowColor: '#000',
              shadowOpacity: 0.12,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
            }}
          >
            <QrCode value={payload} size={260} />
            <Text style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', maxWidth: 240 }}>
              {t('qr.instruction')}
            </Text>
          </View>

          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                color: colors.textMuted,
              }}
            >
              {t('qr.memberId')}
            </Text>
            <Text style={{ fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] }}>
              {userId}
            </Text>
          </View>

          <Text
            style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', maxWidth: 300 }}
          >
            {t('qr.brightnessHint')}
          </Text>
        </>
      ) : (
        <View style={{ paddingVertical: 56, alignItems: 'center' }}>
          <Text
            style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', maxWidth: 280 }}
          >
            {t('qr.signedOut')}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
