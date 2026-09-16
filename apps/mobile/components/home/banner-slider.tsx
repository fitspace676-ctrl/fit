// @fit/mobile — Home's promotional carousel (T1.16).
//
// ===========================================================================
// MARKETING NEVER BLOCKS THE PAGE, AND THAT IS THIS FILE'S ONE RULE.
//
// Every other block on Home is a `HomeSection`: it skeletons while it loads and
// draws an error box with a retry when it fails, because a member who cannot see
// their own plan needs to be told so. A banner reel is the opposite kind of
// thing. Nobody opened the app to look at it, so a slow request must not reserve
// a screen-wide hole above the membership card, and a failed one must not put a
// "we couldn't load this · Try again" box on the screen for an advertisement.
// The screen therefore renders this component only once the request has
// ANSWERED with at least one slide — see `app/(tabs)/home.tsx` — and the
// component returns `null` for an empty reel rather than drawing an empty state.
//
// ---------------------------------------------------------------------------
// WHY THE SLIDE IS THE SCROLL VIEW'S OWN WIDTH.
//
// `pagingEnabled` pages by the scroll view's width and nothing else. A slide any
// other width settles mid-picture on every swipe, which reads as a broken
// carousel rather than as a design choice. So the width is measured from this
// component's own `onLayout` — it sits inside the screen gutter, so it is the
// window minus two gutters — and the window arithmetic is only the value used
// for the first frame, before layout has run.
//
// ---------------------------------------------------------------------------
// NO AUTO-ADVANCE. A reel that moves on its own steals the scroll position out
// from under a member reading the slide, is unreachable for anyone who needs
// longer than the interval, and WCAG 2.2.2 would require a pause control that no
// artboard draws. The member swipes.
//
// ---------------------------------------------------------------------------
// ONE SLIDE IS ONE ACCESSIBILITY NODE. A picture with a caption over it is two
// nodes' worth of markup and one thing to a reader, so the whole slide announces
// once — as a button when it has somewhere to go, as an image when it does not.
// `member.home.banners.slide` ("Promotion 2 of 3") is what an untitled slide
// announces, because "image" alone tells a member nothing about where they are
// in the reel.

import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { PublicBanner } from '@fit/types';
import { SCREEN_GUTTER, Text, radii, spacing, useThemeColors } from '@fit/ui-mobile';

import { useI18n } from '../../providers/I18nProvider';

/** A slide's proportions — 2:1, the shape the console crops artwork to. */
export const BANNER_ASPECT = 2;

/** The pager dots. The active one is a stadium, not a bigger circle. */
export const DOT_SIZE = 6;
export const DOT_ACTIVE_WIDTH = 18;

/** Nothing inside a slide or under it announces on its own. */
const DECORATIVE = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** Where a slide leads, if anywhere. */
export type BannerTarget =
  | { readonly kind: 'route'; readonly path: string }
  | { readonly kind: 'external'; readonly url: string };

/**
 * The in-app destinations a banner is allowed to name, by first segment.
 *
 * Small and explicit for the reason `routeForHref` in
 * `app/(tabs)/profile/notifications.tsx` is: `linkUrl` is a free-text field a
 * gym's staff type into the console, and `router.push` on a path this app does
 * not mount lands the member on Expo Router's unmatched-route screen with no way
 * back but the tab bar. A deeper path under one of these is kept whole, so
 * `/shop/product/p_1` still works.
 */
const IN_APP_ROOTS = [
  '/home',
  '/classes',
  '/shop',
  '/trainers',
  '/services',
  '/membership',
  '/profile',
] as const;

/**
 * Read a banner's `linkUrl` as a destination.
 *
 * Three shapes reach the app and all three are in the seed, which is the reason
 * this is a function rather than an `if` at the call site:
 *
 *   `/shop`                    an in-app route      → `router.push`
 *   `https://gym.example/x`    somewhere else       → `Linking.openURL`
 *   `null`                     an image-only slide  → not tappable
 *
 * ANYTHING ELSE IS ALSO NOT TAPPABLE, deliberately. A console user can type
 * `www.example.com`, `mailto:…` or `/promo` into that field; `Linking.openURL`
 * on the first is a no-op on iOS and a rejected promise on Android, the second
 * is not a scheme this app has decided to open, and the third is the dead-route
 * case {@link IN_APP_ROOTS} exists for. A slide that does nothing is a better
 * answer than a slide that strands the member when pressed.
 */
export function bannerTarget(linkUrl: string | null): BannerTarget | null {
  const link = (linkUrl ?? '').trim();
  if (link === '') return null;
  if (link.startsWith('/')) {
    const known = IN_APP_ROOTS.some(
      (root) => link === root || link.startsWith(`${root}/`) || link.startsWith(`${root}?`),
    );
    return known ? { kind: 'route', path: link } : null;
  }
  if (/^https?:\/\//i.test(link)) return { kind: 'external', url: link };
  return null;
}

export interface HomeBannerSliderProps {
  /** The reel, in the order the API sent it. Empty renders nothing. */
  banners: readonly PublicBanner[];
  /**
   * A tappable slide was pressed. The screen owns routing — every `push` on
   * Home is made in `home.tsx` — so the resolved destination is handed over
   * rather than re-derived there.
   */
  onPressBanner: (banner: PublicBanner, target: BannerTarget) => void;
  /** Root `testID`. Slides and dots derive theirs from it. */
  testID: string;
}

/** The gym's campaigns, one screen-wide slide at a time. */
export function HomeBannerSlider({ banners, onPressBanner, testID }: HomeBannerSliderProps) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const window = useWindowDimensions();

  const [measured, setMeasured] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  // A dead R2 / CDN url degrades to the plate and its caption rather than to a
  // broken-image glyph. Keyed by url, like `class-card.tsx`'s `failedCover`, so
  // a later working image is retried instead of permanently suppressed.
  const [failed, setFailed] = useState<readonly string[]>([]);

  const width = measured ?? Math.max(0, window.width - 2 * SCREEN_GUTTER);
  // The reel can shrink under a background refetch while the member sits on the
  // last slide; clamping here keeps the dots from pointing at a slide that is
  // no longer there.
  const active = Math.min(index, Math.max(banners.length - 1, 0));

  if (banners.length === 0) {
    return null;
  }

  const onLayout = (event: LayoutChangeEvent): void => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== measured) setMeasured(next);
  };

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    if (width <= 0) return;
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    setIndex(Math.min(Math.max(page, 0), banners.length - 1));
  };

  return (
    <View testID={testID} onLayout={onLayout}>
      <ScrollView
        testID={`${testID}-rail`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumScrollEnd}
      >
        {banners.map((banner, position) => {
          const target = bannerTarget(banner.linkUrl);
          const title = banner.title === null ? '' : banner.title.trim();
          const label =
            title === ''
              ? t('member.home.banners.slide', { index: position + 1, count: banners.length })
              : title;
          const showImage = banner.imageUrl !== '' && !failed.includes(banner.imageUrl);

          const plate = (
            <View
              {...DECORATIVE}
              style={{
                width,
                aspectRatio: BANNER_ASPECT,
                borderRadius: radii.container,
                overflow: 'hidden',
                backgroundColor: colors.quiet,
                justifyContent: 'flex-end',
              }}
            >
              {showImage ? (
                <Image
                  testID={`${testID}-image-${banner.id}`}
                  source={{ uri: banner.imageUrl }}
                  resizeMode="cover"
                  onError={() => {
                    setFailed((urls) => [...urls, banner.imageUrl]);
                  }}
                  // The radius on the image as well as on its clipping parent is
                  // the Android belt-and-braces the kit's own covers use.
                  style={[StyleSheet.absoluteFill, { borderRadius: radii.container }]}
                />
              ) : null}

              {title === '' ? null : (
                <View
                  style={{
                    backgroundColor: colors.coverScrim,
                    paddingHorizontal: spacing[4],
                    paddingVertical: spacing[3],
                  }}
                >
                  {/* `onDark` rather than `textPrimary`: the caption is read
                      against the scrim, not against the theme. */}
                  <Text variant="bodyLarge" color="onDark" numberOfLines={2}>
                    {title}
                  </Text>
                </View>
              )}
            </View>
          );

          const slideTestID = `${testID}-slide-${banner.id}`;

          return target === null ? (
            <View
              key={banner.id}
              testID={slideTestID}
              accessible
              accessibilityRole="image"
              accessibilityLabel={label}
            >
              {plate}
            </View>
          ) : (
            <Pressable
              key={banner.id}
              testID={slideTestID}
              accessible
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => {
                onPressBanner(banner, target);
              }}
            >
              {plate}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* One slide has nowhere to page to, so a single dot would be a control
          that cannot be operated and a position that cannot change. */}
      {banners.length <= 1 ? null : (
        <View
          {...DECORATIVE}
          testID={`${testID}-dots`}
          style={{
            flexDirection: 'row',
            alignSelf: 'center',
            alignItems: 'center',
            gap: spacing[1.5],
            marginTop: spacing[3],
          }}
        >
          {banners.map((banner, position) => (
            <View
              key={banner.id}
              testID={`${testID}-dot-${position}`}
              style={{
                width: position === active ? DOT_ACTIVE_WIDTH : DOT_SIZE,
                height: DOT_SIZE,
                borderRadius: radii.full,
                backgroundColor: position === active ? colors.accent : colors.borderEmphasized,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
