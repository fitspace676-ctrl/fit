// ===========================================================================
// PARKED — 2026-08-31. NO CONSUMER IN THE APP, AND THAT IS DELIBERATE.
//
// `apps/mobile` no longer has a QR screen. Decision Q1 closed the other way:
// there is no scanner integration, and the only check-in surface on the API is
// `@Controller('admin/check-ins')`, behind `MemberRead` / `MemberWrite`, which
// a member cannot call. A screen whose whole purpose is to be scanned had
// nothing to talk to, so it was removed along with `app/qr.tsx`,
// `lib/checkin.ts`, `components/qr/**` and the capsule's centre action.
//
// THIS FILE STAYS, WITH ITS TESTS. An export with no consumer is normally the
// exact rot that killed the previous design package — the exception is earned
// here. The encoder underneath it carried TWO shipping-grade bugs that were
// found and fixed: a zig-zag walk that never wrote column 0 (and wrote column 4
// twice), and a version block that was reserved and never drawn. Both are
// invisible in a screenshot; both were verified module-for-module against an
// independent implementation, and 71 golden vectors pin them. Deleting this and
// re-porting it later would re-introduce both, and the second port would be
// reviewed exactly as carefully as the first one was — which is to say, it was
// called "sound" twice before the vectors found the bugs.
//
// COST OF BRINGING IT BACK: one screen. The components, the encoder and their
// tests are all here and green; what is missing is a scanner on the other side
// and a member-scoped endpoint to check in against.
// ===========================================================================

import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { resolveColor } from '../../primitives/icon/icon';
import type { ColorValue } from '../../primitives/icon/types';
import { useThemeColors } from '../../tokens/theme';
import { encodeQr, type EcLevel } from './qrcode';

/**
 * The encoder's error-correction levels, re-exported so a screen can NAME the
 * value it passes. The encoder itself stays private to this directory.
 */
export type { EcLevel };

// ===========================================================================
// THE ONLY WORKING QR IN THE REPO, PROMOTED FROM THE SALVAGE.
//
// Text in (`./qrcode`), a boolean module matrix out, painted here with plain
// React Native `View`s.
//
// ---------------------------------------------------------------------------
// WHY PLAIN VIEWS, GIVEN THAT `react-native-svg` IS RIGHT THERE.
//
// The salvaged header justified this by saying the app shipped no SVG library
// and that adding one would pull in a native module EAS would have to rebuild.
// THAT REASON HAS EXPIRED: `react-native-svg` is a peer dependency of this
// package, WP-0 put it in the one dev-client build, and both `Icon` and
// `ProgressRing` draw with it.
//
// The renderer stays on `View`s anyway, for the reason that actually matters:
// AN SVG `<Rect>` FILL IS ANTI-ALIASED. A module whose edge lands on a
// half-pixel is drawn as two half-intensity rows of grey, and a scanner
// binarising a photograph of that edge under gym lighting has to guess which
// side it belongs to. That is the classic cause of a code that scans on the
// desk beside the designer and fails at the door — the one place it has a job.
//
// So every module is snapped to a WHOLE PIXEL (`Math.floor`, minimum 1) and
// the symbol's rendered size is derived from that snapped module rather than
// the requested `size`, which means the component is usually a few points
// SMALLER than asked. That is deliberate: `size` is an upper bound, not a
// contract. Centre it in its plate rather than stretching it — a stretched QR
// is a blurred QR.
//
// Each row is then RUN-LENGTH MERGED, so a 29×29 symbol is a few hundred views
// instead of 841. Rows are not merged vertically: a column-merged renderer
// cannot express the pattern, and 29 row containers is nothing.
//
// ---------------------------------------------------------------------------
// THIS COMPONENT DOES NOT KNOW WHAT IT IS ENCODING, AND MUST NOT.
//
// `value` is an opaque string. The check-in URI scheme (`fitspace://`, the
// user id, the gym id) is a backend contract and lives in `apps/mobile`; a
// design component that built the URI would be a design component that has to
// be redeployed when the scheme changes.
//
// `encodeQr` THROWS on a payload no version can hold, and this component lets
// it. Rendering a truncated symbol would be worse than a red screen: it scans
// perfectly and resolves to the wrong member. Payloads here are ~50 bytes
// against a 2 953-byte ceiling, so the throw is a canary, not a case to handle.
// ===========================================================================

/**
 * The QR tab's plate, less its padding: `max-w-[264px]` at `p-4`
 * (`mobile-qr.tsx:210`). The sheet-hosted copy is smaller (`w-60` at `p-5`, so
 * 200) and passes its own `size`.
 */
export const QR_DEFAULT_SIZE = 232;

/** The spec's minimum light border, in modules. */
export const QR_QUIET_ZONE = 4;

export interface QrCodeProps {
  /** The text to encode — UTF-8, byte mode. Opaque to this component. */
  value: string;

  /**
   * REQUIRED. Package rule 1: no component ships copy.
   *
   * The salvage hard-coded the English string "QR code" here, which is both
   * copy and, in a Georgian build, the wrong language on the one element the
   * screen exists for.
   */
  accessibilityLabel: string;

  /**
   * An UPPER BOUND on the side length, in points. Default 232 — the QR tab's
   * `max-w-[264px]` plate less its 16pt padding. The symbol renders at the
   * largest whole-pixel module that fits; see the header.
   */
  size?: number;

  /**
   * Error-correction level. Default `'M'` (~15% recovery), which is what a
   * phone screen wants: `'H'` costs a denser symbol — more modules in the same
   * plate, so smaller ones — to buy redundancy against damage a screen cannot
   * suffer.
   */
  ecLevel?: EcLevel;

  /** Dark-module colour. Default `'onLight'` (ink-950), the artboards' fill. */
  color?: ColorValue;

  /**
   * Light-module colour. Default `'onDark'` (white).
   *
   * It is painted, not left transparent, and it must MATCH THE PLATE BEHIND
   * IT: the light modules are as much a part of the code as the dark ones, and
   * a scanner reading them through a translucent view sees whatever is under
   * the sheet.
   */
  background?: ColorValue;

  /**
   * The mandatory light border, in modules. Default 4, the spec's minimum.
   *
   * Not decoration and not padding a layout can substitute for: a scanner
   * locates a symbol by finding a quiet zone around it, so a code drawn flush
   * to a lime plate is a code many scanners never see. Lower it only if the
   * surrounding plate is the same colour as `background` and at least as wide.
   */
  quietZone?: number;

  /** Forwarded to the root node. */
  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/** One horizontal run of identical modules within a row. */
interface Run {
  dark: boolean;
  length: number;
}

/** Collapse a matrix row into runs of same-coloured modules. */
function toRuns(row: readonly boolean[]): Run[] {
  const runs: Run[] = [];
  for (const dark of row) {
    const last = runs[runs.length - 1];
    if (last && last.dark === dark) last.length++;
    else runs.push({ dark, length: 1 });
  }
  return runs;
}

/**
 * Render `value` as a scannable QR code.
 *
 * The encode and the run computation are memoised on the inputs that change
 * the geometry, so an unrelated re-render (a countdown elsewhere on the
 * screen, a toast) does not re-run the encoder. Exposed to assistive tech as
 * one labelled image; the rows below it are pure paint.
 */
export function QrCode({
  value,
  accessibilityLabel,
  size = QR_DEFAULT_SIZE,
  ecLevel = 'M',
  color = 'onLight',
  background = 'onDark',
  quietZone = QR_QUIET_ZONE,
  testID,
  style,
  className,
}: QrCodeProps) {
  const colors = useThemeColors();

  const { rows, moduleSize, pixelSize } = useMemo(() => {
    const matrix = encodeQr(value, ecLevel);
    const totalModules = matrix.size + quietZone * 2;
    // Snap to a whole-pixel module so every edge is hard. See the header.
    const mod = Math.max(1, Math.floor(size / totalModules));
    return {
      rows: matrix.modules.map(toRuns),
      moduleSize: mod,
      pixelSize: mod * totalModules,
    };
  }, [value, ecLevel, size, quietZone]);

  const pad = quietZone * moduleSize;
  const dark = resolveColor(color, colors);
  const light = resolveColor(background, colors);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: pixelSize,
          height: pixelSize,
          backgroundColor: light,
          padding: pad,
        },
        style,
      ]}
      className={className}
    >
      {rows.map((runs, y) => (
        <View key={y} style={{ flexDirection: 'row', height: moduleSize }}>
          {runs.map((run, i) => (
            <View
              key={i}
              style={{
                width: run.length * moduleSize,
                height: moduleSize,
                backgroundColor: run.dark ? dark : light,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
