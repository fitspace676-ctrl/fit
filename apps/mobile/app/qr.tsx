// `/qr` — the scanner. A TEST SURFACE, and it says so on screen.
//
// ===========================================================================
// WHAT THIS IS NOT. The route name is recycled: until 2026-08-31 `/qr` showed
// the member's OWN code (`CheckInPass` + `QrCode`, both still exported from
// `@fit/ui-mobile` and both still parked) and it was removed because Q1 closed
// the other way — there is no scanner side, and the only check-in surface on
// the API is `@Controller('admin/check-ins')` behind `MemberRead`/`MemberWrite`.
//
// None of that has changed. This screen reads a code with the phone's camera
// and SHOWS IT. It issues no request, invents no endpoint, and claims no
// check-in — `qr.scanner.note` says as much to the member, in both locales, so
// nobody mistakes a decoded string for a door that opened. When a member-scoped
// check-in endpoint exists, the POST goes in `onScan` and that note comes out.
//
// ---------------------------------------------------------------------------
// FIVE STATES, ONE PURE FUNCTION ({@link scannerStateFor}).
//
//   unavailable  no camera on this platform — the web preview, a simulator
//   checking     `useCameraPermissions()` has not answered yet
//   prompt       never asked, or asked and dismissed — offer to ask
//   denied       asked and refused, `canAskAgain: false` — only Settings helps
//   scanning     granted, camera live, nothing read yet
//   result       a code has been read; the camera stops until "scan again"
//
// The derivation is a pure function rather than a chain of ternaries in the
// body because `denied` and `prompt` differ by ONE field (`canAskAgain`) and
// get the wrong copy silently when they are confused: "Allow camera" on a
// button that can no longer ask anything is a button that does nothing when
// pressed, which is the one failure a permissions screen must not have.
//
// ---------------------------------------------------------------------------
// WHY WEB IS `unavailable` BY PLATFORM RATHER THAN BY FEATURE DETECTION.
//
// `expo-camera` does render on web (`getUserMedia`), but barcode decoding there
// depends on `BarcodeDetector`, which Safari does not ship and which is behind a
// flag elsewhere. A camera that turns on and never reads anything is worse than
// an honest "not here": the member holds the phone up until they give up. The
// preview this repo develops against runs on web, so this is the state that is
// actually seen in the browser panel — deliberately, and it is the state a
// screenshot of the panel shows.
//
// ---------------------------------------------------------------------------
// SCANNED ONCE. `onBarcodeScanned` fires per FRAME, not per code — a QR held in
// view fires it thirty times a second. The handler is detached (`undefined`)
// the moment there is a result, which is the form the module's own docs use and
// the only one that also stops the native side calling in.
// ===========================================================================

import { useCallback, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  AppBar,
  Button,
  EmptyState,
  Eyebrow,
  Heading,
  IconButton,
  Mono,
  Screen,
  Spinner,
  Surface,
  Text,
  radii,
  spacing,
  useSafeInsets,
  useThemeColors,
} from '@fit/ui-mobile';

import { useI18n } from '../providers/I18nProvider';

/** The six states the screen can be in. See this file's header. */
export type ScannerState = 'unavailable' | 'checking' | 'prompt' | 'denied' | 'scanning' | 'result';

/** Everything {@link scannerStateFor} needs, and nothing from a native module. */
export interface ScannerStateInput {
  /** False on a platform with no usable barcode camera — see the header. */
  cameraSupported: boolean;
  /** `useCameraPermissions()`'s first element; `null` until it has answered. */
  permission: { granted: boolean; canAskAgain: boolean } | null;
  /** The code read so far, or `null`. */
  scanned: string | null;
}

/**
 * Which state the screen is in.
 *
 * Order matters: an unsupported platform wins over everything (there is nothing
 * to ask permission FOR), and a result wins over `scanning` so the camera stops.
 */
export function scannerStateFor({
  cameraSupported,
  permission,
  scanned,
}: ScannerStateInput): ScannerState {
  if (!cameraSupported) return 'unavailable';
  if (permission === null) return 'checking';
  if (!permission.granted) return permission.canAskAgain ? 'prompt' : 'denied';
  return scanned === null ? 'scanning' : 'result';
}

/** True where a camera can actually decode a QR. See the header on web. */
export const CAMERA_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

/** The reticle's edge, in points — a square the member aims with. */
const RETICLE_SIZE = 240;

export default function QrScannerScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeInsets();

  // CALLED UNCONDITIONALLY — it is a hook, so it cannot be skipped on web — and
  // its answer is then DISCARDED there. A browser that happens to grant camera
  // access would otherwise put this screen in `scanning`, with a live preview
  // that decodes nothing (see the header). `unavailable` is not allowed to
  // depend on what the permissions module says.
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<string | null>(null);

  const state = scannerStateFor({
    cameraSupported: CAMERA_SUPPORTED,
    permission: CAMERA_SUPPORTED ? permission : null,
    scanned,
  });

  const close = useCallback(() => {
    // `/qr` is a modal pushed from the tab bar, so there is almost always a
    // stack under it — but a deep link opens it cold, and `back()` with nothing
    // to go back to is a dead end on Android's system gesture.
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }, [router]);

  const closeButton = (
    <IconButton
      icon="x"
      accessibilityLabel={t('qr.scanner.close')}
      onPress={close}
      testID="qr-close"
    />
  );

  // ── The camera states ────────────────────────────────────────────────────
  // Full-bleed, outside `Screen`: the preview must reach the edges, and
  // `Screen`'s gutter, scroll view and tab-bar reserve all work against that.
  if (state === 'scanning' || state === 'result') {
    return (
      <View testID="qr-screen" style={{ flex: 1, backgroundColor: colors.backgroundBody }}>
        <CameraView
          testID="qr-camera"
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          // Detached once there is a result — see the header. `active` alone
          // would keep the frame callbacks coming.
          onBarcodeScanned={
            scanned === null
              ? ({ data }) => {
                  setScanned(data);
                }
              : undefined
          }
        />

        <View
          style={{
            position: 'absolute',
            top: insets.top + spacing[3],
            left: spacing[5],
            right: spacing[5],
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[3],
          }}
        >
          {closeButton}
          {/* The screen's ONE header. `AppBar` is not used here because it
              assumes a page under it; the a11y contract is the same. */}
          <Heading level={1} variant="section" numberOfLines={1} style={{ flex: 1 }}>
            {t('qr.scanner.title')}
          </Heading>
        </View>

        {state === 'scanning' ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: RETICLE_SIZE,
                height: RETICLE_SIZE,
                marginTop: -RETICLE_SIZE / 2,
                marginLeft: -RETICLE_SIZE / 2,
                borderRadius: radii.container,
                borderWidth: 2,
                borderColor: colors.accent,
              }}
            />
          </View>
        ) : null}

        <View
          style={{
            position: 'absolute',
            left: spacing[5],
            right: spacing[5],
            bottom: Math.max(insets.bottom, spacing[5]) + spacing[3],
            gap: spacing[3],
          }}
        >
          {state === 'result' ? (
            <Surface
              tone="card"
              testID="qr-result"
              style={{ padding: spacing[5], gap: spacing[2] }}
            >
              <Eyebrow>{t('qr.scanner.result')}</Eyebrow>
              {/* The decoded string, verbatim and selectable-looking: a member
                  reading it out to the front desk is the whole flow today. */}
              <Mono numberOfLines={4}>{scanned}</Mono>
              <Button
                label={t('qr.scanner.rescan')}
                variant="primary"
                fullWidth
                onPress={() => {
                  setScanned(null);
                }}
                testID="qr-rescan"
              />
            </Surface>
          ) : (
            <Surface tone="card" style={{ padding: spacing[4], gap: spacing[1] }}>
              <Text variant="body">{t('qr.scanner.hint')}</Text>
              <Text variant="caption" color="textMuted">
                {t('qr.scanner.note')}
              </Text>
            </Surface>
          )}
        </View>
      </View>
    );
  }

  // ── Everything else: a plain page, because there is nothing to see through.
  const header = (
    <AppBar title={t('qr.scanner.title')} subtitle={t('qr.scanner.note')} leading={closeButton} />
  );

  return (
    <Screen testID="qr-screen" header={header} reserveTabBar={false}>
      {state === 'checking' ? (
        <View testID="qr-checking" style={{ paddingVertical: spacing[10], alignItems: 'center' }}>
          <Spinner accessibilityLabel={t('qr.scanner.title')} />
        </View>
      ) : null}

      {state === 'prompt' ? (
        <EmptyState
          testID="qr-permission"
          icon="camera"
          title={t('qr.scanner.permissionTitle')}
          body={t('qr.scanner.permissionBody')}
          action={{
            label: t('qr.scanner.permissionAction'),
            testID: 'qr-allow',
            onPress: () => {
              void requestPermission();
            },
          }}
        />
      ) : null}

      {state === 'denied' ? (
        <EmptyState
          testID="qr-denied"
          icon="lock"
          title={t('qr.scanner.deniedTitle')}
          body={t('qr.scanner.deniedBody')}
          action={{
            label: t('qr.scanner.deniedAction'),
            testID: 'qr-settings',
            onPress: () => {
              // The only way back from `canAskAgain: false`. It rejects on a
              // platform with no settings app to open, which is not worth
              // taking the screen down for.
              void Linking.openSettings().catch(() => undefined);
            },
          }}
        />
      ) : null}

      {state === 'unavailable' ? (
        <EmptyState
          testID="qr-unavailable"
          icon="info"
          title={t('qr.scanner.unavailableTitle')}
          body={t('qr.scanner.unavailable')}
        />
      ) : null}
    </Screen>
  );
}
