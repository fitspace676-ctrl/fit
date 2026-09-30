// `/onboarding` — the first-run intro. Two slides and a Get started.
//
// ===========================================================================
// THE SCRIPT ALREADY EXISTED. All nine keys of it — `onboarding.skip`,
// `onboarding.next`, `onboarding.getStarted` and a title/body pair for each of
// classes, qr and shop — were written into the catalogues at full ka+en parity
// for a screen that was never built. So the slides below are a transcription,
// not a proposal: the order is the order the keys are in.
//
// ---------------------------------------------------------------------------
// THE MIDDLE SLIDE IS GONE (2026-08-31). It was the QR one, and its subject —
// "check in with the code on your phone" — left the app with the `/qr` screen
// when Q1 closed: there is no scanner integration and no member-scoped
// check-in endpoint. An intro slide for a feature the app does not have is
// worse than one slide fewer, and inventing a third subject to keep the count
// would be writing product copy to fill a hole in a deck.
//
// `onboarding.qr.title` and `onboarding.qr.body` are simply left unread. They
// are authored copy in `packages/i18n`, they cost nothing, and they are the
// script again the day a scanner exists.
//
// ---------------------------------------------------------------------------
// WHY THIS SCREEN OWNS NO REDIRECT LOGIC.
//
// `resolveRedirect` (lib/route-policy.ts) already holds the whole zone table:
// signed in and not onboarded, everything except this route redirects HERE;
// once `complete()` lands, this route redirects to `/home`. So finishing is
// one call — flip the flag — and the guard in the root layout moves the user.
// A `router.replace('/home')` here would be a SECOND authority on the same
// decision, and the deleted app's guard is a lesson in what two of those cost.
// `router.replace('/')` is used only as the nudge that makes the guard
// re-evaluate immediately rather than on the next navigation.
// ===========================================================================

import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Button,
  Heading,
  Icon,
  Pips,
  Screen,
  Surface,
  Text,
  spacing,
  type IconName,
} from '@fit/ui-mobile';

import { BrandMark, NavRow } from '../components/auth/auth-screen';
import { useOnboarding } from '../hooks/useOnboarding';
import { useI18n } from '../providers/I18nProvider';
import type { MessageKey } from '../lib/i18n/keys';

interface Slide {
  readonly key: 'classes' | 'shop';
  readonly icon: IconName;
  readonly title: MessageKey;
  readonly body: MessageKey;
}

/** The slides, in catalogue order. The `qr` pair between them is unread. */
const SLIDES: readonly Slide[] = [
  {
    key: 'classes',
    icon: 'calendar',
    title: 'onboarding.classes.title',
    body: 'onboarding.classes.body',
  },
  { key: 'shop', icon: 'bag', title: 'onboarding.shop.title', body: 'onboarding.shop.body' },
];

/**
 * The round plate the slide's glyph sits in — 128 (`spacing[32]`), with a 56
 * (`spacing[14]`) glyph. It was 80/36 and the slide read as a small mark
 * floating in an empty screen (pre-login audit #14).
 */
const PLATE = spacing[32];
const GLYPH = spacing[14];

/**
 * The two spacers around the slide. 2 : 3 lifts it a little above the true
 * middle of the space between the header and the footer, where the eye reads
 * "centre"; both shrink to nothing on a short screen.
 */
const CENTER_ABOVE = 2;
const CENTER_BELOW = 3;

export default function OnboardingScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { complete } = useOnboarding();
  const [index, setIndex] = useState(0);

  const slide = SLIDES[index] ?? SLIDES[0];
  const isLast = index === SLIDES.length - 1;

  const finish = useCallback(() => {
    void complete().then(() => {
      // Not a decision about WHERE — see the header. `/` re-runs the guard.
      router.replace('/');
    });
  }, [complete, router]);

  const advance = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    setIndex((current) => Math.min(current + 1, SLIDES.length - 1));
  }, [finish, isLast]);

  if (slide === undefined) return null;

  return (
    <Screen
      testID="onboarding-screen"
      // No tab bar behind the intro, so there is nothing to reserve space for.
      reserveTabBar={false}
      // The same top row as the auth screens, with the brand on the LEFT: the
      // right-hand slot is Skip's, and Skip is the one control here that must
      // not move between slides.
      header={
        <NavRow
          leading={<BrandMark testID="onboarding-brand" />}
          trailing={
            <Button
              label={t('onboarding.skip')}
              onPress={finish}
              variant="ghost"
              size="md"
              testID="onboarding-skip"
            />
          }
        />
      }
      footer={
        <View style={{ alignItems: 'center', gap: spacing[6], paddingTop: spacing[4] }}>
          <Pips
            filled={index + 1}
            total={SLIDES.length}
            // The pips are the only thing that says HOW FAR IN this is, and they
            // have no text at all. `Pips` supplies the position itself as
            // `accessibilityValue` ({min, max, now}), so naming it with the
            // slide's own title yields "Find your next class, 1 of 2".
            //
            // TODO(i18n): a dedicated `onboarding.progress` would read better than
            // reusing the title. It does not exist; the nine authored keys cover
            // the script and not the chrome.
            accessibilityLabel={t(slide.title)}
            testID="onboarding-pips"
          />
          <Button
            label={isLast ? t('onboarding.getStarted') : t('onboarding.next')}
            onPress={advance}
            variant="primary"
            size="lg"
            fullWidth
            testID="onboarding-next"
          />
        </View>
      }
    >
      <View style={{ flexGrow: CENTER_ABOVE }} />
      <View style={{ alignItems: 'center', gap: spacing[6] }}>
        <Surface
          tone="quiet"
          side={PLATE}
          radius={PLATE / 2}
          style={{ width: PLATE, height: PLATE, alignItems: 'center', justifyContent: 'center' }}
          // The glyph repeats what the title says; announcing it twice is
          // worse than announcing it once.
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Icon name={slide.icon} size={GLYPH} color="accent" />
        </Surface>

        <View style={{ alignItems: 'center', gap: spacing[3] }}>
          {/* The screen's ONE `role="header"`. Only one slide is mounted at a
              time, so it stays one however many slides there are. */}
          <Heading
            level={1}
            variant="title"
            style={{ textAlign: 'center' }}
            testID="onboarding-title"
          >
            {t(slide.title)}
          </Heading>

          <Text variant="bodyRegular" color="textSecondary" style={{ textAlign: 'center' }}>
            {t(slide.body)}
          </Text>
        </View>
      </View>
      <View style={{ flexGrow: CENTER_BELOW }} />
    </Screen>
  );
}
