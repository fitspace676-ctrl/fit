// Render tests for `QrCode`.
//
// The encoder is tested exhaustively next door, on Vitest, against golden
// vectors from an independent implementation. What is left for this file is
// the RENDERER's two claims, both of which are the difference between a code
// that scans at the gym door and one that only scans on a desk:
//
//   1. EVERY MODULE IS A WHOLE NUMBER OF PIXELS. The symbol is sized DOWN to
//      the largest integer module that fits, never stretched to the requested
//      size. A half-pixel module edge is an anti-aliased grey smear, and a
//      binarising scanner has to guess which side it belongs to.
//
//   2. THE QUIET ZONE IS PART OF THE CODE. Four light modules on every side,
//      painted, not just left as parent padding — a scanner locates a symbol
//      by finding that border.
//
// It also pins the module COUNT, which is what makes those two arithmetic
// claims checkable at all.

import { render, screen } from '@testing-library/react-native';

import { themeColors } from '../../tokens/semantic';
import { brand, ink } from '../../palette';

import { QrCode, QR_DEFAULT_SIZE, QR_QUIET_ZONE } from './qr-code';
import { encodeQr } from './qrcode';

const dark = themeColors(true);
const HIDDEN = { includeHiddenElements: true } as const;

/** The check-in URI shape the app encodes: 48 bytes → version 4 at level M. */
const PAYLOAD = 'fitspace://check-in?u=usr_01H8QKC7&g=gym_downtown';

/**
 * The host component's name.
 *
 * React Native's host names ("View", "Text") are not in React's `ElementType`
 * union — that is the DOM's lowercase tag list — so the comparison has to go
 * through a cast. One helper rather than one cast per call site.
 */
function hostName(node: { type: unknown }): string {
  return typeof node.type === 'string' ? node.type : '';
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

/** Every host `View` under the symbol's root — rows and runs together. */
function hostViews() {
  return screen
    .getByTestId('qr', HIDDEN)
    .findAll((node) => hostName(node) === 'View')
    .map((node) => ({ node, style: flatten(node.props.style) }));
}

/** The row containers: `flexDirection: 'row'`. */
function rowViews() {
  return hostViews().filter((v) => v.style.flexDirection === 'row');
}

/** The runs inside them: sized boxes with a fill. */
function runViews() {
  return hostViews().filter(
    (v) => v.style.flexDirection === undefined && v.style.width !== undefined,
  );
}

describe('QrCode geometry', () => {
  it('renders one row view per module row', () => {
    const matrix = encodeQr(PAYLOAD, 'M');
    render(<QrCode value={PAYLOAD} accessibilityLabel="QR" testID="qr" />);

    // The symbol is 33×33 at this payload and level; the renderer draws one
    // row container per module row, each holding that row's runs.
    expect(matrix.size).toBe(33);
    expect(rowViews().length).toBe(matrix.size);
  });

  it('run-length merges each row instead of drawing a view per module', () => {
    const matrix = encodeQr(PAYLOAD, 'M');
    render(<QrCode value={PAYLOAD} accessibilityLabel="QR" testID="qr" />);

    const drawn = runViews().length;

    // Strictly fewer views than modules — a 33×33 symbol is 1 089 modules and
    // a few hundred runs. The saving is the reason a static screen can afford
    // a plain-View renderer at all.
    expect(drawn).toBeLessThan(matrix.size * matrix.size);
    expect(drawn).toBeGreaterThan(matrix.size); // …and it did draw something.
  });

  // CLAIM 1. `size` is an upper bound, and the rendered side is a whole
  // multiple of (matrix + 2 × quiet zone).
  it('snaps to a whole-pixel module and never exceeds the requested size', () => {
    const matrix = encodeQr(PAYLOAD, 'M');
    const total = matrix.size + QR_QUIET_ZONE * 2;

    for (const size of [200, 232, 240, 137]) {
      const view = render(
        <QrCode value={PAYLOAD} accessibilityLabel="QR" size={size} testID="qr" />,
      );
      const style = flatten(view.getByTestId('qr', HIDDEN).props.style);
      const side = Number(style.width);

      expect(side).toBe(Math.floor(size / total) * total);
      expect(side).toBeLessThanOrEqual(size);
      expect(side % total).toBe(0);
      expect(style.height).toBe(side);
      view.unmount();
    }
  });

  it('never collapses below one pixel per module, however small the bound', () => {
    const matrix = encodeQr(PAYLOAD, 'M');
    const total = matrix.size + QR_QUIET_ZONE * 2;
    render(<QrCode value={PAYLOAD} accessibilityLabel="QR" size={4} testID="qr" />);
    // A 1pt module is unscannable, but a 0pt one is an invisible view and a
    // silent failure. `Math.max(1, …)` keeps it visibly wrong instead.
    expect(flatten(screen.getByTestId('qr', HIDDEN).props.style).width).toBe(total);
  });

  // CLAIM 2. The quiet zone is painted padding on the symbol itself.
  it('pads the mandatory quiet zone in whole modules', () => {
    const matrix = encodeQr(PAYLOAD, 'M');
    const total = matrix.size + QR_QUIET_ZONE * 2;
    const module = Math.floor(QR_DEFAULT_SIZE / total);

    render(<QrCode value={PAYLOAD} accessibilityLabel="QR" testID="qr" />);
    expect(flatten(screen.getByTestId('qr', HIDDEN).props.style).padding).toBe(
      QR_QUIET_ZONE * module,
    );
  });

  it('scales the quiet zone with an explicit quietZone', () => {
    const matrix = encodeQr(PAYLOAD, 'M');
    render(<QrCode value={PAYLOAD} accessibilityLabel="QR" quietZone={2} testID="qr" />);
    const style = flatten(screen.getByTestId('qr', HIDDEN).props.style);
    const module = Math.floor(QR_DEFAULT_SIZE / (matrix.size + 4));
    expect(style.padding).toBe(2 * module);
  });

  it('grows the symbol when the error-correction level does', () => {
    const m = render(<QrCode value={PAYLOAD} accessibilityLabel="QR" testID="qr" />);
    const mSide = Number(flatten(m.getByTestId('qr', HIDDEN).props.style).width);
    m.unmount();

    render(<QrCode value={PAYLOAD} accessibilityLabel="QR" ecLevel="H" testID="qr" />);
    // More modules in the same bound means a SMALLER module, so the rendered
    // side lands on a different multiple. The point is that the level reaches
    // the encoder at all.
    expect(Number(flatten(screen.getByTestId('qr', HIDDEN).props.style).width)).not.toBe(mSide);
  });
});

describe('QrCode colour', () => {
  it('defaults to ink on white', () => {
    render(<QrCode value={PAYLOAD} accessibilityLabel="QR" testID="qr" />);
    expect(flatten(screen.getByTestId('qr', HIDDEN).props.style).backgroundColor).toBe(dark.onDark);
  });

  it('paints the light modules in the plate colour it is given', () => {
    render(<QrCode value={PAYLOAD} accessibilityLabel="QR" background={brand[50]} testID="qr" />);
    expect(flatten(screen.getByTestId('qr', HIDDEN).props.style).backgroundColor).toBe(brand[50]);

    // …and so are the light runs INSIDE the symbol, not left transparent: a
    // scanner reading a light module through a translucent view sees whatever
    // is behind the sheet.
    const fills = new Set(runViews().map((v) => v.style.backgroundColor));
    expect(fills).toEqual(new Set([ink[950], brand[50]]));
  });
});

describe('QrCode accessibility', () => {
  it('is one labelled image, in the caller’s language', () => {
    render(<QrCode value={PAYLOAD} accessibilityLabel="ჩექ-ინის QR კოდი" testID="qr" />);
    const root = screen.getByTestId('qr', HIDDEN);
    expect(root.props.accessible).toBe(true);
    expect(root.props.accessibilityRole).toBe('image');
    // The salvage hard-coded the English "QR code" here.
    expect(root.props.accessibilityLabel).toBe('ჩექ-ინის QR კოდი');
  });
});

describe('QrCode failure', () => {
  // Rendering a truncated symbol would be worse than throwing: it scans
  // perfectly and resolves to the wrong member.
  it('throws rather than truncating a payload no version can hold', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      render(<QrCode value={'a'.repeat(3000)} accessibilityLabel="QR" testID="qr" />),
    ).toThrow(/too long/i);
    spy.mockRestore();
  });
});
