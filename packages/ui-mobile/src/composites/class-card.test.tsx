// Render tests for `ClassCard`.
//
// The four action states are the whole point of this component, so they are
// tested as a TABLE rather than as four hand-written cases: the table is the
// same one in the component's header and in the work package's brief, and a
// fifth state added to one and not the other fails here.
//
// The other two assertions are things a screenshot cannot show: that a card is
// TWO accessibility nodes rather than eleven, and that a full class says
// "full" rather than "0 left".

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Image } from 'react-native';

import { themeColors } from '../tokens/semantic';

import { ClassCard, type ClassCardStatus } from './class-card';

const dark = themeColors(true);
const HIDDEN = { includeHiddenElements: true } as const;

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

const ACTION = {
  onPress: jest.fn(),
  bookLabel: 'დაჯავშნა',
  joinWaitlistLabel: 'მოლოდინის სია',
  bookedLabel: 'დაჯავშნილია',
  waitlistedLabel: 'მოლოდინი · #2',
  testID: 'class-action',
} as const;

const BASE = {
  category: 'ძალა',
  categoryColor: '#E4F26A',
  title: 'CrossFit WOD',
  time: '18:00',
  meta: 'Sandro K. · Downtown',
  capacity: 20,
  bookedCount: 17,
  spotsLeftLabel: '3 ადგილი დარჩა',
  fullLabel: 'სავსეა',
  accessibilityLabel: 'CrossFit WOD, 18:00, Sandro K., 3 ადგილი დარჩა',
} as const;

// ===========================================================================
// THE FOUR ACTION STATES, from the work package's own table.
//
//   status      spots   fill                        text
//   ─────────────────────────────────────────────────────────────────────────
//   null        left    brand-300                   ink-950  · book
//   null        none    brand-300                   ink-950  · join waitlist
//   'BOOKED'    —       brand-950 + brand-800 ring  brand-200
//   'WAITLIST'  —       ink-800                     ink-200
// ===========================================================================

interface StateRow {
  name: string;
  status: ClassCardStatus;
  bookedCount: number;
  label: string;
  fill: string;
  border?: string;
}

const STATES: StateRow[] = [
  {
    name: 'bookable',
    status: null,
    bookedCount: 17,
    label: ACTION.bookLabel,
    fill: dark.accent,
  },
  {
    name: 'full',
    status: null,
    bookedCount: 20,
    label: ACTION.joinWaitlistLabel,
    fill: dark.accent,
  },
  {
    name: 'booked',
    status: 'BOOKED',
    bookedCount: 17,
    label: ACTION.bookedLabel,
    fill: dark.booked,
    border: dark.bookedBorder,
  },
  {
    name: 'waitlisted',
    status: 'WAITLIST',
    bookedCount: 20,
    label: ACTION.waitlistedLabel,
    fill: dark.quiet,
  },
];

describe('ClassCard action states', () => {
  it.each(STATES)('$name shows its own label', (row) => {
    render(
      <ClassCard {...BASE} bookedCount={row.bookedCount} status={row.status} action={ACTION} />,
    );
    expect(screen.getByText(row.label)).toBeTruthy();

    // And ONLY its own: the other three labels are supplied and must not leak.
    for (const other of STATES) {
      if (other.label !== row.label) expect(screen.queryByText(other.label)).toBeNull();
    }
  });

  it.each(STATES)('$name paints its own fill', (row) => {
    render(
      <ClassCard
        {...BASE}
        bookedCount={row.bookedCount}
        status={row.status}
        action={ACTION}
        testID="card"
      />,
    );
    const style = flatten(screen.getByTestId(ACTION.testID).props.style);
    expect(style.backgroundColor).toBe(row.fill);
    if (row.border) expect(style.borderColor).toBe(row.border);
  });

  it('fires the action, and only the action', () => {
    const onAction = jest.fn();
    const onCard = jest.fn();
    render(
      <ClassCard {...BASE} action={{ ...ACTION, onPress: onAction }} onPress={onCard} testID="c" />,
    );

    fireEvent.press(screen.getByTestId(ACTION.testID));
    expect(onAction).toHaveBeenCalledTimes(1);
    // PITFALL 1. The action is a SIBLING of the pressable content region, not
    // a child of it, so pressing it cannot also open the class.
    expect(onCard).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// THE OCCUPANCY ARITHMETIC, from outside the component.
// ===========================================================================

describe('ClassCard occupancy', () => {
  it('shows the full label when bookedCount equals capacity — not "0 left"', () => {
    render(<ClassCard {...BASE} capacity={20} bookedCount={20} action={ACTION} />);
    expect(screen.getByText('სავსეა', HIDDEN)).toBeTruthy();
    expect(screen.queryByText('3 ადგილი დარჩა', HIDDEN)).toBeNull();
  });

  it('offers the waitlist rather than a booking once full', () => {
    render(<ClassCard {...BASE} bookedCount={20} action={ACTION} />);
    expect(screen.getByText(ACTION.joinWaitlistLabel)).toBeTruthy();
    expect(screen.queryByText(ACTION.bookLabel)).toBeNull();
  });

  it('treats an over-booked class as full', () => {
    render(<ClassCard {...BASE} capacity={20} bookedCount={23} action={ACTION} />);
    expect(screen.getByText('სავსეა', HIDDEN)).toBeTruthy();
  });

  // A BOOKED member sees their own state, not the room's.
  it('keeps the booked label on a full class', () => {
    render(<ClassCard {...BASE} bookedCount={20} status="BOOKED" action={ACTION} />);
    expect(screen.getByText(ACTION.bookedLabel)).toBeTruthy();
  });
});

// ===========================================================================
// TWO ACCESSIBILITY NODES. THE ONE THING NO SCREENSHOT SHOWS.
// ===========================================================================

describe('ClassCard accessibility', () => {
  it('announces the description once, as the caller wrote it', () => {
    render(<ClassCard {...BASE} onPress={jest.fn()} action={ACTION} testID="c" />);
    const node = screen.getByLabelText(BASE.accessibilityLabel);
    expect(node.props.accessibilityRole).toBe('button');
  });

  it('hides every run inside the description, including the spots pill', () => {
    render(<ClassCard {...BASE} onPress={jest.fn()} action={ACTION} testID="c" />);

    // The title, the category, the time and the seat count are all visible…
    expect(screen.getByText('CrossFit WOD', HIDDEN)).toBeTruthy();
    expect(screen.getByText('3 ადგილი დარჩა', HIDDEN)).toBeTruthy();

    // …and all of them are outside the accessibility tree, so the card
    // announces the caller's one sentence and then the action, and nothing
    // else. THE SEAT COUNT THEREFORE HAS TO BE IN `accessibilityLabel` —
    // which is why this test asserts it is.
    expect(screen.queryByText('CrossFit WOD')).toBeNull();
    expect(screen.queryByText('3 ადგილი დარჩა')).toBeNull();
    expect(BASE.accessibilityLabel).toContain('3 ადგილი დარჩა');
  });

  it('is a text node, not a button, when it does not navigate', () => {
    render(<ClassCard {...BASE} testID="c" />);
    expect(screen.getByLabelText(BASE.accessibilityLabel).props.accessibilityRole).toBe('text');
  });

  it('opens the class from the content region', () => {
    const onPress = jest.fn();
    render(<ClassCard {...BASE} onPress={onPress} testID="c" />);
    fireEvent.press(screen.getByLabelText(BASE.accessibilityLabel));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// THE TITLE, AND THE HERO.
// ===========================================================================

describe('ClassCard typography', () => {
  // PITFALL 2. `max-w-[190px]` is a hard pixel against a 390pt artboard; on a
  // 320pt device it clips a Georgian title mid-word. The title flexes and
  // wraps instead.
  it('lets the title flex and wrap to two lines rather than capping its width', () => {
    render(<ClassCard {...BASE} title="ფუნქციური ვარჯიში დამწყებთათვის" testID="c" />);
    const title = screen.getByText('ფუნქციური ვარჯიში დამწყებთათვის', HIDDEN);
    expect(title.props.numberOfLines).toBe(2);
    expect(flatten(title.props.style).maxWidth).toBeUndefined();
  });

  // PITFALL 3. `leading-[1.05]` at 24px is 25, and an implicit lineHeight
  // clips Georgian descenders on Android.
  it('sets an explicit lineHeight on the title', () => {
    render(<ClassCard {...BASE} testID="c" />);
    expect(flatten(screen.getByText('CrossFit WOD', HIDDEN).props.style).lineHeight).toBe(25);
  });

  it('sets the hero title bigger, with its own explicit lineHeight', () => {
    render(<ClassCard {...BASE} variant="hero" testID="c" />);
    const style = flatten(screen.getByText('CrossFit WOD', HIDDEN).props.style);
    expect(style.fontSize).toBe(34);
    expect(style.lineHeight).toBe(34);
  });
});

describe('ClassCard hero variant', () => {
  it('drops the duration disc and the action row, and draws the two pills', () => {
    render(
      <ClassCard
        {...BASE}
        variant="hero"
        meta="ხუთშაბათი, 14 აგვისტო"
        duration={{ value: '45', unit: 'წთ', accessibilityLabel: '45 წუთი' }}
        action={ACTION}
        testID="c"
      />,
    );
    // The time is a pill here, not an inline mono run in the meta line…
    expect(screen.getByText('18:00', HIDDEN)).toBeTruthy();
    // …the length is the second pill…
    expect(screen.getByLabelText('45 წუთი')).toBeTruthy();
    // …and the class-detail screen owns the book button, so there is none.
    expect(screen.queryByText(ACTION.bookLabel)).toBeNull();
    expect(screen.queryByText(BASE.spotsLeftLabel)).toBeNull();
  });

  it('draws the duration disc on the default variant instead', () => {
    render(
      <ClassCard
        {...BASE}
        duration={{ value: '45', unit: 'წთ', accessibilityLabel: '45 წუთი' }}
        testID="c"
      />,
    );
    expect(screen.getByText('45', HIDDEN)).toBeTruthy();
    expect(screen.getByText('წთ', HIDDEN)).toBeTruthy();
  });
});

// ===========================================================================
// THE DOT IS THE COLOUR THE API SHIPS.
// ===========================================================================

describe('ClassCard category dot', () => {
  it('paints the literal it is handed, with no client-side map in between', () => {
    render(<ClassCard {...BASE} categoryColor="#FF00AA" testID="c" />);
    const dot = screen
      .getByTestId('c', HIDDEN)
      .findAll((node) => flatten(node.props.style).backgroundColor === '#FF00AA');
    expect(dot.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// THE COVER.
//
// Three rules, and the first is the one that matters most: NULL IS NOT A
// STATE. Most classes have no photograph — five of the eight seeded templates
// do not — so "no cover" has to be the card as it has always been drawn, with
// no image node in the tree at all. A grey placeholder where a photo might
// have been is a fabrication, and a fabrication is what this rebuild exists to
// stop.
//
// What a render test can and cannot see here is worth stating: there is no
// layout pass, so nothing below measures a point frame. Each assertion pins a
// RULE — a cover exists only for a non-null URL, a scrim exists whenever a
// cover does, the text ladders move with it — and the geometry that follows
// from those rules is the simulator's business.
// ===========================================================================

const COVER = 'https://images.example.com/yoga.jpg';

describe('ClassCard cover', () => {
  it('renders no image node at all without a URL — the card is unchanged', () => {
    render(<ClassCard {...BASE} testID="c" action={ACTION} />);

    expect(screen.queryByTestId('c-cover', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('c-cover-image', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('c-cover-scrim', HIDDEN)).toBeNull();
    // Not "no node with our testID" — NO IMAGE, whatever it might be called.
    expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });

  it('treats an empty string as no cover, not as a URL to fetch', () => {
    render(<ClassCard {...BASE} coverImageUrl="" testID="c" />);
    expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });

  it('draws the photograph, cropped rather than squashed, for a non-null URL', () => {
    render(<ClassCard {...BASE} coverImageUrl={COVER} testID="c" />);

    const image = screen.getByTestId('c-cover-image', HIDDEN);
    expect(image.props.source).toEqual({ uri: COVER });
    expect(image.props.resizeMode).toBe('cover');
  });

  it('scrims every cover it draws — there is no unscrimmed photo state', () => {
    render(<ClassCard {...BASE} coverImageUrl={COVER} testID="c" />);

    const scrim = screen.getByTestId('c-cover-scrim', HIDDEN);
    expect(flatten(scrim.props.style).backgroundColor).toBe(dark.coverScrim);
  });

  it('rounds the cover to the card it fills, and clips it', () => {
    render(<ClassCard {...BASE} coverImageUrl={COVER} testID="c" />);

    // 30 is the default variant's pass-through radius, the artboard's own.
    const layer = flatten(screen.getByTestId('c-cover', HIDDEN).props.style);
    expect(layer.borderRadius).toBe(30);
    expect(layer.overflow).toBe('hidden');
    expect(layer.position).toBe('absolute');
  });

  it('says nothing — the card already announces itself in one sentence', () => {
    render(<ClassCard {...BASE} coverImageUrl={COVER} onPress={jest.fn()} testID="c" />);

    // The cover carries no label of its own, invented or otherwise…
    const layer = screen.getByTestId('c-cover', HIDDEN);
    expect(layer.props.accessibilityLabel).toBeUndefined();
    // …and it is outside the accessibility tree, so the card is still the two
    // nodes its header promises.
    expect(screen.queryByTestId('c-cover')).toBeNull();
  });

  // ------------------------------------------------------------------------
  // A FAILED LOAD DEGRADES TO THE NULL CARD, never to a broken-image plate.
  // ------------------------------------------------------------------------
  it('drops the cover and the scrim when the image fails to load', () => {
    render(<ClassCard {...BASE} coverImageUrl={COVER} testID="c" />);

    fireEvent(screen.getByTestId('c-cover-image', HIDDEN), 'error');

    expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
    expect(screen.queryByTestId('c-cover-scrim', HIDDEN)).toBeNull();
    // …and the text is back on the themed ladder, i.e. this is the card that
    // never had a cover, not a covered card with the photo missing.
    expect(flatten(screen.getByText(BASE.title, HIDDEN).props.style).color).toBe(dark.textPrimary);
  });

  it('keys the failure to the URL, so a recycled row does not inherit it', () => {
    const view = render(<ClassCard {...BASE} coverImageUrl={COVER} testID="c" />);
    fireEvent(screen.getByTestId('c-cover-image', HIDDEN), 'error');
    expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);

    // The list scrolls; this component instance is handed a different class.
    view.rerender(
      <ClassCard {...BASE} coverImageUrl="https://images.example.com/hiit.jpg" testID="c" />,
    );
    expect(screen.getByTestId('c-cover-image', HIDDEN).props.source).toEqual({
      uri: 'https://images.example.com/hiit.jpg',
    });
  });
});

// ===========================================================================
// LEGIBILITY OVER THE COVER — the promotion, and the two stops it moves.
//
// The numbers behind these roles are asserted in `tokens/tokens.spec.ts`,
// which computes the contrast against the scrim over a white photograph. What
// is pinned HERE is that the card actually USES them, and only when there is a
// photograph to use them over.
// ===========================================================================

describe('ClassCard cover legibility', () => {
  it('sets the title on the fixed white stop over a cover', () => {
    render(<ClassCard {...BASE} coverImageUrl={COVER} testID="c" />);
    expect(flatten(screen.getByText(BASE.title, HIDDEN).props.style).color).toBe(dark.onDark);
  });

  it('promotes the muted ladder — category and meta — off textSecondary', () => {
    render(<ClassCard {...BASE} coverImageUrl={COVER} testID="c" />);

    expect(flatten(screen.getByText(BASE.category, HIDDEN).props.style).color).toBe(
      dark.onCoverMuted,
    );
    // The meta line is one `Text` reading "18:00 · Sandro K. · Downtown" — the
    // time is a mono run INSIDE it — so it is matched by what it contains.
    expect(flatten(screen.getByText(/Sandro K\./, HIDDEN).props.style).color).toBe(
      dark.onCoverMuted,
    );
    // The promotion is the whole point: ink-400 over this scrim is 2.30:1.
    expect(dark.onCoverMuted).not.toBe(dark.textSecondary);
  });

  it('leaves both ladders exactly where they are without a cover', () => {
    render(<ClassCard {...BASE} testID="c" />);

    expect(flatten(screen.getByText(BASE.title, HIDDEN).props.style).color).toBe(dark.textPrimary);
    expect(flatten(screen.getByText(BASE.category, HIDDEN).props.style).color).toBe(
      dark.textSecondary,
    );
    expect(flatten(screen.getByText(/Sandro K\./, HIDDEN).props.style).color).toBe(
      dark.textSecondary,
    );
  });

  it('darkens the scrim on press, since the card tint is under the photo', () => {
    render(<ClassCard {...BASE} coverImageUrl={COVER} onPress={jest.fn()} testID="c" />);
    const region = screen.getByLabelText(BASE.accessibilityLabel);

    fireEvent(region, 'pressIn');
    expect(flatten(screen.getByTestId('c-cover-scrim', HIDDEN).props.style).backgroundColor).toBe(
      dark.scrim,
    );

    fireEvent(region, 'pressOut');
    expect(flatten(screen.getByTestId('c-cover-scrim', HIDDEN).props.style).backgroundColor).toBe(
      dark.coverScrim,
    );
  });
});

// ===========================================================================
// THE PADDING MOVES INWARDS UNDER A COVER — and nowhere else.
// ===========================================================================

describe('ClassCard cover geometry', () => {
  it('keeps the padding on the card itself when there is no cover', () => {
    render(<ClassCard {...BASE} testID="c" />);
    expect(flatten(screen.getByTestId('c', HIDDEN).props.style).padding).toBe(20);
  });

  it('moves the padding inside the cover, so the photo is full-bleed', () => {
    render(<ClassCard {...BASE} coverImageUrl={COVER} testID="c" />);

    // The card root pads nothing — an absolute layer measured from a padding
    // box would be inset on every edge.
    const root = flatten(screen.getByTestId('c', HIDDEN).props.style);
    expect(root.padding).toBeUndefined();
    expect(root.overflow).toBe('hidden');

    // …and a layer inside it pads by exactly what the card used to pad by.
    // (`findAll` walks composite instances as well as hosts, so this counts
    // the wrapper more than once — the assertion is that it EXISTS.)
    const padded = screen
      .getByTestId('c', HIDDEN)
      .findAll((node) => flatten(node.props.style).padding === 20);
    expect(padded.length).toBeGreaterThan(0);
  });

  it('gives a hero with a cover room to be a photo hero, bottom-aligned', () => {
    render(<ClassCard {...BASE} variant="hero" coverImageUrl={COVER} testID="c" />);
    expect(flatten(screen.getByTestId('c', HIDDEN).props.style).minHeight).toBe(240);
  });

  it('leaves a hero WITHOUT a cover at its content height', () => {
    render(<ClassCard {...BASE} variant="hero" testID="c" />);
    expect(flatten(screen.getByTestId('c', HIDDEN).props.style).minHeight).toBeUndefined();
  });

  it('never gives the list card a minimum height, cover or not', () => {
    render(<ClassCard {...BASE} coverImageUrl={COVER} testID="c" />);
    expect(flatten(screen.getByTestId('c', HIDDEN).props.style).minHeight).toBeUndefined();
  });
});
