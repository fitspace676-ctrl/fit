import { useMemo } from 'react';
import { View } from 'react-native';
import { encodeQr, type EcLevel } from '../../lib/qrcode';

// Paints a QR code with plain React Native Views — no SVG, no native module.
// The `lib/qrcode` encoder turns the text into a boolean module matrix; this
// renders it crisply by snapping each module to an integer pixel size and a
// quiet zone (the mandatory light border scanners need to lock on). Each row
// run-length-merges consecutive same-colour modules into one View, so a typical
// ~30×30 symbol is a few hundred nodes rather than ~900 — cheap for a static
// screen.

export interface QrCodeProps {
  /** The text to encode (UTF-8, byte mode). */
  value: string;
  /** Target side length in px; the symbol is snapped to the nearest whole module. */
  size?: number;
  /** Error-correction level. `M` (default) recovers ~15% — good for a phone screen. */
  ecLevel?: EcLevel;
  /** Dark-module colour. */
  color?: string;
  /** Light-module / background colour. */
  background?: string;
  /** Light border width, in modules (4 is the spec minimum). */
  quietZone?: number;
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
 * Render `value` as a scannable QR code. Memoises the (relatively expensive)
 * encode + run computation on the inputs, so re-renders from unrelated state are
 * free. Exposed to assistive tech as a single labelled image.
 */
export function QrCode({
  value,
  size = 240,
  ecLevel = 'M',
  color = '#000000',
  background = '#ffffff',
  quietZone = 4,
}: QrCodeProps) {
  const { rows, moduleSize, pixelSize } = useMemo(() => {
    const matrix = encodeQr(value, ecLevel);
    const totalModules = matrix.size + quietZone * 2;
    // Snap to a whole-pixel module so cells stay sharp (≥1px).
    const mod = Math.max(1, Math.floor(size / totalModules));
    return {
      rows: matrix.modules.map(toRuns),
      moduleSize: mod,
      pixelSize: mod * totalModules,
    };
  }, [value, ecLevel, size, quietZone]);

  const pad = quietZone * moduleSize;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="QR code"
      style={{
        width: pixelSize,
        height: pixelSize,
        backgroundColor: background,
        paddingVertical: pad,
        paddingHorizontal: pad,
      }}
    >
      {rows.map((runs, y) => (
        <View key={y} style={{ flexDirection: 'row', height: moduleSize }}>
          {runs.map((run, i) => (
            <View
              key={i}
              style={{
                width: run.length * moduleSize,
                height: moduleSize,
                backgroundColor: run.dark ? color : background,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
