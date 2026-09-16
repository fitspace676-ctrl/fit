// The home carousel — what it draws, what it announces, and where a slide goes.
//
// The interesting unit is `bannerTarget`, and it is tested apart from the
// renderer: `linkUrl` is a free-text field a gym's staff type into the console,
// so the set of strings that reach it is much wider than the three the seed
// carries, and every one of them has to resolve to "push", "open" or "do
// nothing" without ever landing the member on an unmatched route.
//
// The rest is the two rules that are invisible in a screenshot: a slide is ONE
// accessibility node (a picture with a caption over it is two nodes' worth of
// markup and one thing to a reader), and an untitled slide still has to say
// where in the reel it is.

import { fireEvent } from '@testing-library/react-native';
import type { PublicBanner } from '@fit/types';

import { DOT_ACTIVE_WIDTH, DOT_SIZE, HomeBannerSlider, bannerTarget } from './banner-slider';
import { renderScreen } from '../../test-support/render-screen';

/** The width the container reports; `onLayout` never fires under the renderer. */
const WIDTH = 350;

/**
 * Inside a slide's plate, or under the dots.
 *
 * Both are marked decorative — the plate because the slide announces once for
 * all of it, the dots because a member who cannot see them has the slide's own
 * "Promotion 2 of 3" instead — and RNTL's queries skip a hidden subtree by
 * default. Needing this flag is the assertion that the marking is really there.
 */
const HIDDEN = { includeHiddenElements: true } as const;

function banner(overrides: Partial<PublicBanner> = {}): PublicBanner {
  return {
    id: 'b_1',
    title: 'Summer membership',
    imageUrl: 'https://cdn.test/summer.jpg',
    linkUrl: '/shop',
    ...overrides,
  };
}

/** The seed's three shapes: an in-app link, an absolute URL, and no link. */
const REEL: PublicBanner[] = [
  banner(),
  banner({ id: 'b_2', title: 'Reformer pilates', linkUrl: 'https://downtown.fit.ge/classes' }),
  banner({ id: 'b_3', title: null, linkUrl: null }),
];

function mount(banners: readonly PublicBanner[], onPress = jest.fn()) {
  const result = renderScreen(
    <HomeBannerSlider banners={banners} onPressBanner={onPress} testID="banners" />,
  );
  // Pin the slide width, so paging arithmetic is deterministic rather than
  // whatever the test renderer reports as a window.
  if (banners.length > 0) {
    fireEvent(result.getByTestId('banners'), 'layout', {
      nativeEvent: { layout: { width: WIDTH, height: WIDTH / 2 } },
    });
  }
  return { ...result, onPress };
}

describe('bannerTarget', () => {
  it('reads an in-app path as a route, keeping anything under it', () => {
    expect(bannerTarget('/shop')).toEqual({ kind: 'route', path: '/shop' });
    expect(bannerTarget('/shop/product/p_1')).toEqual({ kind: 'route', path: '/shop/product/p_1' });
    expect(bannerTarget('/classes?category=yoga')).toEqual({
      kind: 'route',
      path: '/classes?category=yoga',
    });
  });

  it('reads an absolute http(s) URL as something to hand to the OS', () => {
    expect(bannerTarget('https://downtown.fit.ge/classes')).toEqual({
      kind: 'external',
      url: 'https://downtown.fit.ge/classes',
    });
    expect(bannerTarget('HTTP://example.com')).toEqual({
      kind: 'external',
      url: 'HTTP://example.com',
    });
  });

  it('refuses an in-app path this app does not mount', () => {
    // The dead-route case: `router.push('/promo')` lands the member on Expo
    // Router's unmatched screen with no way back but the tab bar.
    expect(bannerTarget('/promo')).toBeNull();
    expect(bannerTarget('/shopping')).toBeNull();
  });

  it('refuses everything that is neither, rather than guessing a scheme', () => {
    expect(bannerTarget(null)).toBeNull();
    expect(bannerTarget('')).toBeNull();
    expect(bannerTarget('   ')).toBeNull();
    expect(bannerTarget('www.example.com')).toBeNull();
    expect(bannerTarget('mailto:hi@example.com')).toBeNull();
  });
});

describe('the reel', () => {
  it('draws one slide per banner, in the order the API sent them', () => {
    const { getByTestId } = mount(REEL);
    for (const entry of REEL) {
      expect(getByTestId(`banners-slide-${entry.id}`)).toBeTruthy();
    }
  });

  it('renders NOTHING for a gym with no live campaigns', () => {
    const { queryByTestId } = mount([]);
    expect(queryByTestId('banners')).toBeNull();
    expect(queryByTestId('banners-rail')).toBeNull();
  });

  it('draws no dots for a single slide — there is nowhere to page to', () => {
    const { queryByTestId, getByTestId } = mount([banner()]);
    expect(getByTestId('banners-slide-b_1')).toBeTruthy();
    expect(queryByTestId('banners-dots')).toBeNull();
  });

  it('moves the active dot with the swipe, and does not move on its own', () => {
    const { getByTestId } = mount(REEL);
    const width = (style: unknown): unknown => (style as { width?: unknown }).width;

    expect(width(getByTestId('banners-dot-0', HIDDEN).props.style)).toBe(DOT_ACTIVE_WIDTH);
    expect(width(getByTestId('banners-dot-1', HIDDEN).props.style)).toBe(DOT_SIZE);

    fireEvent(getByTestId('banners-rail'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: WIDTH, y: 0 } },
    });

    expect(width(getByTestId('banners-dot-1', HIDDEN).props.style)).toBe(DOT_ACTIVE_WIDTH);
    expect(width(getByTestId('banners-dot-0', HIDDEN).props.style)).toBe(DOT_SIZE);
  });
});

describe('a slide', () => {
  it('is one accessibility node, announced by its title', () => {
    const { getByTestId } = mount(REEL);
    const slide = getByTestId('banners-slide-b_1');
    expect(slide.props.accessible).toBe(true);
    expect(slide.props.accessibilityLabel).toBe('Summer membership');
  });

  it('says where in the reel it is when it carries no title', () => {
    const { getByTestId } = mount(REEL);
    expect(getByTestId('banners-slide-b_3').props.accessibilityLabel).toBe('Promotion 3 of 3');
  });

  it('is a BUTTON when it leads somewhere, and an image when it does not', () => {
    const { getByTestId } = mount(REEL);
    expect(getByTestId('banners-slide-b_1').props.accessibilityRole).toBe('button');
    expect(getByTestId('banners-slide-b_3').props.accessibilityRole).toBe('image');
  });

  it('hands the resolved destination to the screen, which owns routing', () => {
    const { getByTestId, onPress } = mount(REEL);

    fireEvent.press(getByTestId('banners-slide-b_1'));
    expect(onPress).toHaveBeenLastCalledWith(REEL[0], { kind: 'route', path: '/shop' });

    fireEvent.press(getByTestId('banners-slide-b_2'));
    expect(onPress).toHaveBeenLastCalledWith(REEL[1], {
      kind: 'external',
      url: 'https://downtown.fit.ge/classes',
    });
  });

  it('does nothing at all when it has no link', () => {
    const { getByTestId, onPress } = mount(REEL);
    fireEvent.press(getByTestId('banners-slide-b_3'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps the plate and its caption when the artwork fails to load', () => {
    // A dead CDN url must degrade to the slide, not to a broken-image glyph:
    // the caption is the part that still says what the campaign is.
    const { getByTestId, queryByTestId } = mount(REEL);
    fireEvent(getByTestId('banners-image-b_1', HIDDEN), 'error');
    expect(queryByTestId('banners-image-b_1', HIDDEN)).toBeNull();
    expect(getByTestId('banners-slide-b_1')).toBeTruthy();
  });
});
