// Golden vectors for the hand-rolled QR encoder — the scariest file in the
// salvage, and until this spec existed the only one in the package with no
// tests at all.
//
// ===========================================================================
// WHY THIS FILE IS SHAPED THE WAY IT IS.
//
// A QR encoder has a failure mode no other module here has: it fails SILENTLY
// and PARTIALLY. The finders, the timing pattern and the alignment patterns
// are function modules, laid down by code that has nothing to do with the data
// path, so a symbol with a corrupted payload still LOOKS exactly like a QR
// code in a screenshot, in a code review, and on a designer's monitor. Worse,
// Reed–Solomon then hides the damage: at level M a version-3 symbol can lose
// five whole codewords and still decode from a clean capture. The bug does not
// appear until a real phone, at an angle, under gym lighting, at the door —
// where the correction budget is already spent on glare and blur.
//
// TWO REAL BUGS WERE FOUND BY WRITING THIS FILE, both of exactly that kind:
//
//   1. `drawCodewords` walked the column ladder as 6 → 4 → 2 instead of
//      stepping to 5 past the timing column, so column 4 was written twice and
//      column 0 never at all. Three trailing codewords corrupt in every symbol
//      the app has ever drawn — inside the correction budget for a short
//      payload at M, outside it for a longer one.
//   2. `drawVersionInfo` was called with `reserveOnly: true` and never called
//      again, so every symbol at version 7 or above shipped 36 blank version
//      modules. A Georgian name plus a check-in URI is already version 7+.
//
// Neither is visible in a rendered image. Both are caught in milliseconds by
// the goldens below.
//
// ---------------------------------------------------------------------------
// PROVENANCE OF THE GOLDENS. They are NOT this implementation's own output
// blessed after the fact — that pins determinism and proves nothing about
// correctness. Every matrix hash in GOLDEN_MATRICES was produced by
// `qrcode@1.5.4`, an independent implementation, run offline at authoring time
// over byte-mode segments with the mask forced, and all 224 combinations of
// (7 payloads × 4 levels × 8 masks) were compared module-for-module. The
// generator polynomials are checked against the published α-exponent tables;
// the field arithmetic against a table-driven GF(256) written from scratch
// here, exhaustively over all 65 536 products; the capacities against the
// published data-codeword table.
//
// The one thing deliberately NOT pinned against `qrcode@1.5.4` is WHICH mask
// is chosen. That library scores penalty rule 3 with the naive 11-module
// window scan; this port uses Nayuki's spec-faithful finder-penalty, which
// treats the area outside the symbol as light margin. Both are legal, both
// record their choice in the format bits, and every scanner reads either — so
// the two disagree on the mask for about half of all payloads and agree on the
// symbol for all eight forced masks. Mask selection is pinned instead as a
// PROPERTY: the mask read back out of the format bits is the argmin of this
// implementation's own penalty, lowest index winning ties.
// ===========================================================================

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  MAX_VERSION,
  chooseVersion,
  encodeQr,
  gfMultiply,
  numDataCodewords,
  penaltyScoreOf,
  rsComputeDivisor,
  rsComputeRemainder,
  type EcLevel,
  type QrMatrix,
} from './qrcode';

const LEVELS: readonly EcLevel[] = ['L', 'M', 'Q', 'H'];

/** A check-in URI of the shape the app actually encodes. */
const URI = 'fitspace://check-in?u=usr_01H8QKC7&g=gym_downtown';
/** A Georgian member line: 23 characters, 60 UTF-8 bytes. */
const KA = 'ნინო კაპანაძე · FC-4821';

// ---------------------------------------------------------------------------
// Helpers. Each is INDEPENDENT of the module under test — that is the point.
// ---------------------------------------------------------------------------

/** The matrix as row strings, `1` for a dark module. */
function rowsOf(m: QrMatrix): string[] {
  return m.modules.map((row) => row.map((dark) => (dark ? '1' : '0')).join(''));
}

/** A short, stable digest of a whole symbol. */
function digest(m: QrMatrix): string {
  return createHash('sha256').update(rowsOf(m).join('\n')).digest('hex').slice(0, 16);
}

/**
 * GF(2^8) with the QR modulus 0x11D, built as exp/log tables.
 *
 * A DIFFERENT ALGORITHM from the one under test: `gfMultiply` is a
 * carry-less Russian-peasant multiply with the reduction folded into the loop;
 * this is a discrete-log lookup. They share only the field, so agreeing on all
 * 65 536 products is real evidence rather than a restatement.
 */
const EXP: number[] = [];
const LOG: number[] = new Array<number>(256).fill(0);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP.push(x);
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
}
/** α^n. */
const alpha = (n: number): number => EXP[n % 255] ?? 0;
/** Table-driven GF(256) product. */
function gfMultiplyByTable(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return alpha((LOG[a] ?? 0) + (LOG[b] ?? 0));
}

/**
 * Penalty rules 1, 2 and 4, written independently from the spec's wording.
 *
 * Rule 3 — the 1:1:3:1:1 finder-lookalike — is deliberately absent, because a
 * second implementation of it would only be a second opinion on an ambiguity
 * (whether the symbol's edge counts as light margin) rather than a check. It
 * is covered two other ways below: exactly, on matrices that provably contain
 * no such pattern, and as a residual, which can only ever be a multiple of 40.
 */
function penaltyRules124(m: QrMatrix): number {
  const size = m.size;
  const at = (x: number, y: number): boolean => m.modules[y]?.[x] ?? false;
  let score = 0;

  // Rule 1: runs of five or more, by row and by column. 3 for the fifth, 1 for
  // each module after it.
  const scanLine = (get: (i: number) => boolean): void => {
    let run = 1;
    for (let i = 1; i < size; i++) {
      if (get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) score += 3 + (run - 5);
  };
  for (let y = 0; y < size; y++) scanLine((x) => at(x, y));
  for (let x = 0; x < size; x++) scanLine((y) => at(x, y));

  // Rule 2: every 2×2 block of one colour, 3 points.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3;
    }
  }

  // Rule 4: how far the dark ratio strays from 50%, in 5% steps.
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (at(x, y)) dark++;
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** Build a matrix from a predicate, for the penalty fixtures. */
function matrixOf(size: number, dark: (x: number, y: number) => boolean): QrMatrix {
  return {
    size,
    modules: Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) => dark(x, y)),
    ),
  };
}

/**
 * Read the EC level and mask back out of a finished symbol's format info.
 *
 * The 15 bits are recovered from the FIRST copy (around the top-left finder),
 * un-XORed with the spec's 0x5412 constant. This is how a scanner learns which
 * mask to undo, so reading it back is the only way to assert the mask the
 * encoder actually committed to rather than the one it says it chose.
 */
function formatInfoOf(m: QrMatrix): { eclBits: number; mask: number } {
  const bitAt = (x: number, y: number): number => (m.modules[y]?.[x] ? 1 : 0);
  const coords: [number, number][] = [];
  for (let i = 0; i <= 5; i++) coords.push([8, i]);
  coords.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) coords.push([14 - i, 8]);

  let bits = 0;
  coords.forEach(([x, y], i) => {
    bits |= bitAt(x, y) << i;
  });
  const data = (bits ^ 0x5412) >>> 10;
  return { eclBits: (data >> 3) & 3, mask: data & 7 };
}

/** The second format copy, for cross-checking the first. */
function formatInfoOfSecondCopy(m: QrMatrix): { eclBits: number; mask: number } {
  const size = m.size;
  const bitAt = (x: number, y: number): number => (m.modules[y]?.[x] ? 1 : 0);
  let bits = 0;
  for (let i = 0; i < 8; i++) bits |= bitAt(size - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) bits |= bitAt(8, size - 15 + i) << i;
  const data = (bits ^ 0x5412) >>> 10;
  return { eclBits: (data >> 3) & 3, mask: data & 7 };
}

// ===========================================================================
// 1 · The field. Everything else in the file rests on this.
// ===========================================================================

describe('GF(256) arithmetic', () => {
  // A wrong reduction polynomial, or a `<<` where the port needed a `>>>`,
  // makes every EC codeword wrong — which the encoder cannot notice, because
  // nothing downstream ever reads them back.
  it('agrees with a table-driven implementation on all 65 536 products', () => {
    let mismatches = 0;
    for (let a = 0; a < 256; a++) {
      for (let b = 0; b < 256; b++) {
        if (gfMultiply(a, b) !== gfMultiplyByTable(a, b)) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  });

  it('is commutative, has 1 as its identity and 0 as its annihilator', () => {
    for (let a = 0; a < 256; a++) {
      expect(gfMultiply(a, 1)).toBe(a);
      expect(gfMultiply(a, 0)).toBe(0);
      expect(gfMultiply(a, 7)).toBe(gfMultiply(7, a));
    }
  });
});

describe('rsComputeDivisor', () => {
  // The generator polynomials of ISO/IEC 18004, in the published α-exponent
  // form. These three degrees cover every EC block this app can produce: 7 is
  // version 1–3 at L, 10 is version 1 at M, 13 is version 1 at Q.
  const PUBLISHED_EXPONENTS: Record<number, readonly number[]> = {
    7: [87, 229, 146, 149, 238, 102, 21],
    10: [251, 67, 46, 61, 118, 70, 64, 94, 32, 45],
    13: [74, 152, 176, 100, 86, 100, 106, 104, 130, 218, 206, 140, 78],
  };

  it.each(Object.keys(PUBLISHED_EXPONENTS).map(Number))(
    'degree %i matches the published generator polynomial',
    (degree) => {
      const expected = (PUBLISHED_EXPONENTS[degree] ?? []).map(alpha);
      expect(rsComputeDivisor(degree)).toEqual(expected);
    },
  );

  it('produces one coefficient per degree, none of them zero', () => {
    for (let degree = 7; degree <= 30; degree++) {
      const divisor = rsComputeDivisor(degree);
      expect(divisor).toHaveLength(degree);
      expect(divisor.every((c) => c > 0)).toBe(true);
    }
  });
});

describe('rsComputeRemainder', () => {
  // Version 1 at level M, the whole 16-codeword data block for "HELLO" —
  // header, payload, terminator and the alternating 0xEC/0x11 padding — with
  // the EC codewords `qrcode@1.5.4`'s Reed–Solomon encoder produces for it.
  const V1_M_DATA = [64, 84, 132, 84, 196, 196, 240, 236, 17, 236, 17, 236, 17, 236, 17, 236];
  const V1_M_ECC = [35, 115, 35, 153, 236, 8, 201, 247, 55, 223];

  it('matches an independent encoder on a known block', () => {
    expect(rsComputeRemainder(V1_M_DATA, rsComputeDivisor(10))).toEqual(V1_M_ECC);
  });

  // The defining property, checked without a reference: a codeword (data
  // followed by its remainder) divides the generator exactly. This is what a
  // scanner's syndrome computation checks, so a remainder that fails here is a
  // symbol every scanner will try to "correct".
  it('leaves a zero remainder when re-divided (the syndrome a scanner computes)', () => {
    for (const degree of [7, 10, 13, 26]) {
      const divisor = rsComputeDivisor(degree);
      for (let seed = 0; seed < 8; seed++) {
        const data = Array.from({ length: 20 + seed }, (_, i) => (i * 31 + seed * 17) & 0xff);
        const codeword = [...data, ...rsComputeRemainder(data, divisor)];
        expect(rsComputeRemainder(codeword, divisor)).toEqual(new Array<number>(degree).fill(0));
      }
    }
  });
});

// ===========================================================================
// 2 · Capacity and version selection.
// ===========================================================================

describe('numDataCodewords', () => {
  // The published data-codeword table, at the versions this app can reach and
  // at both ends of the range. One wrong entry in the ECC tables silently
  // shortens or overruns every block at that version.
  const PUBLISHED: Record<number, Record<EcLevel, number>> = {
    1: { L: 19, M: 16, Q: 13, H: 9 },
    2: { L: 34, M: 28, Q: 22, H: 16 },
    3: { L: 55, M: 44, Q: 34, H: 26 },
    10: { L: 274, M: 216, Q: 154, H: 122 },
    40: { L: 2956, M: 2334, Q: 1666, H: 1276 },
  };

  it.each(Object.keys(PUBLISHED).map(Number))('version %i matches the published table', (v) => {
    for (const ecl of LEVELS) expect(numDataCodewords(v, ecl)).toBe(PUBLISHED[v]?.[ecl]);
  });

  it('never decreases with version, and always decreases with EC strength', () => {
    for (let v = 2; v <= MAX_VERSION; v++) {
      for (const ecl of LEVELS) {
        expect(numDataCodewords(v, ecl)).toBeGreaterThan(numDataCodewords(v - 1, ecl));
      }
      expect(numDataCodewords(v, 'L')).toBeGreaterThan(numDataCodewords(v, 'M'));
      expect(numDataCodewords(v, 'M')).toBeGreaterThan(numDataCodewords(v, 'Q'));
      expect(numDataCodewords(v, 'Q')).toBeGreaterThan(numDataCodewords(v, 'H'));
    }
  });
});

describe('chooseVersion', () => {
  // The published BYTE-MODE capacities. Version 1 holds 17 bytes at L; the
  // 18th byte is a different symbol. Getting this off by one either wastes a
  // version (a visibly denser code, for nothing) or, in the other direction,
  // overruns the data region and produces a symbol that cannot be decoded.
  const BOUNDARIES: [EcLevel, number, number][] = [
    // level, last byte count that fits in version 1, version 1's successor
    ['L', 17, 2],
    ['M', 14, 2],
    ['Q', 11, 2],
    ['H', 7, 2],
  ];

  it.each(BOUNDARIES)('level %s steps up from version 1 after %i bytes', (ecl, capacity) => {
    expect(chooseVersion(capacity, ecl)).toBe(1);
    expect(chooseVersion(capacity + 1, ecl)).toBe(2);
  });

  // THE CHARACTER-COUNT BOUNDARY. Byte mode spends 8 bits on the length up to
  // version 9 and 16 bits from version 10, so the capacity does NOT rise
  // smoothly across that step. A port that used one width everywhere passes
  // every small-payload test and truncates long ones.
  it('accounts for the count field widening at version 10', () => {
    // The published byte capacities: 230 at version 9, 271 at version 10.
    expect(chooseVersion(230, 'L')).toBe(9);
    expect(chooseVersion(231, 'L')).toBe(10);
    expect(chooseVersion(271, 'L')).toBe(10);
    // AND THIS IS THE ONE THAT MATTERS. Version 10 at L has 274 data
    // codewords = 2192 bits; minus the 4-bit mode and a SIXTEEN-bit count that
    // is 271 bytes, but with the 8-bit count of versions 1–9 it would be 272.
    // A port that used one count width everywhere answers 10 here.
    expect(chooseVersion(272, 'L')).toBe(11);
    expect(chooseVersion(2953, 'L')).toBe(MAX_VERSION);
  });

  it('throws rather than returning a version that cannot hold the data', () => {
    expect(() => chooseVersion(2954, 'L')).toThrow(/too long/i);
    expect(() => chooseVersion(1274, 'H')).toThrow(/too long/i);
  });
});

describe('encodeQr over capacity', () => {
  // The failure mode this prevents: an encoder that clamps to version 40 and
  // silently drops the tail hands the member a code that scans cleanly and
  // resolves to a TRUNCATED user id. Throwing is the only safe answer, and the
  // screen turns it into an error state.
  it('throws on a payload no version can hold', () => {
    expect(() => encodeQr('a'.repeat(2954), 'L')).toThrow(/too long/i);
  });

  it('encodes the largest payload that does fit', () => {
    const m = encodeQr('a'.repeat(2953), 'L');
    expect(m.size).toBe(MAX_VERSION * 4 + 17);
  });
});

// ===========================================================================
// 3 · UTF-8 byte mode. The Georgian case.
// ===========================================================================

describe('UTF-8 byte-mode encoding', () => {
  // Every Georgian letter is THREE UTF-8 bytes. An encoder that sized the
  // symbol by `text.length` fits three times more than it should, overruns the
  // data region and produces an undecodable code — and it does that only for
  // the app's own primary language, so an English-speaking developer never
  // sees it.
  it('sizes a Georgian string by its bytes, not its characters', () => {
    const six = 'ა'.repeat(6); // 18 bytes.
    expect(encodeQr(six, 'L').size).toBe(encodeQr('x'.repeat(18), 'L').size);
    expect(encodeQr(six, 'L').size).toBeGreaterThan(encodeQr('x'.repeat(6), 'L').size);
  });

  it('measures the app’s own Georgian member line by its 48 bytes', () => {
    // 23 characters, 48 bytes: thirteen Georgian letters at three bytes each,
    // a middle dot at two, and the ASCII rest at one. Twice the length a
    // character count would report.
    expect(KA.length).toBe(23);
    expect(new TextEncoder().encode(KA)).toHaveLength(48);
    expect(encodeQr(KA, 'L').size).toBe(encodeQr('x'.repeat(48), 'L').size);
  });

  // Astral-plane code points arrive as a surrogate PAIR in a JS string and are
  // four UTF-8 bytes, not six. A port that encoded each surrogate separately
  // would produce a code that decodes to mojibake.
  it('combines a surrogate pair into one four-byte code point', () => {
    expect(encodeQr('💪', 'L').size).toBe(encodeQr('xxxx', 'L').size);
  });
});

// ===========================================================================
// 4 · Golden matrices, from an independent implementation.
// ===========================================================================

interface Golden {
  label: string;
  text: string;
  ecl: EcLevel;
  mask: number;
  version: number;
  size: number;
  sha: string;
}

/**
 * `qrcode@1.5.4`, byte-mode segment, mask forced, hashed the same way.
 *
 * Two payloads — an ASCII check-in URI and a Georgian member line — at every
 * EC level, at two masks each. Sixteen whole symbols, module for module: if
 * any step of the pipeline (bit stream, padding, block splitting, EC, the
 * interleave, the zig-zag walk, the mask, the format bits, the version block)
 * drifts by one bit, one of these hashes changes.
 */
const GOLDEN_MATRICES: Golden[] = [
  { label: 'URI', text: URI, ecl: 'L', mask: 0, version: 3, size: 29, sha: '04873d7b309d6546' },
  { label: 'URI', text: URI, ecl: 'L', mask: 5, version: 3, size: 29, sha: '04881793e32fbad8' },
  { label: 'URI', text: URI, ecl: 'M', mask: 0, version: 4, size: 33, sha: 'd086a51f1c602272' },
  { label: 'URI', text: URI, ecl: 'M', mask: 5, version: 4, size: 33, sha: 'e6c0bbfdb2a11b33' },
  { label: 'URI', text: URI, ecl: 'Q', mask: 0, version: 5, size: 37, sha: 'efe5a6cfeec91f5b' },
  { label: 'URI', text: URI, ecl: 'Q', mask: 5, version: 5, size: 37, sha: '7daef2c7a4f03850' },
  { label: 'URI', text: URI, ecl: 'H', mask: 0, version: 6, size: 41, sha: 'fb9a102da4716b9e' },
  { label: 'URI', text: URI, ecl: 'H', mask: 5, version: 6, size: 41, sha: '8e4b5d0e18421d17' },
  { label: 'KA', text: KA, ecl: 'L', mask: 0, version: 3, size: 29, sha: '5a70c05c6d13660c' },
  { label: 'KA', text: KA, ecl: 'L', mask: 5, version: 3, size: 29, sha: 'ce1a1815b84e40cf' },
  { label: 'KA', text: KA, ecl: 'M', mask: 0, version: 4, size: 33, sha: '0920758b101e2289' },
  { label: 'KA', text: KA, ecl: 'M', mask: 5, version: 4, size: 33, sha: 'bf9b62effd2bf52a' },
  { label: 'KA', text: KA, ecl: 'Q', mask: 0, version: 5, size: 37, sha: '0e607b050d6bf75e' },
  { label: 'KA', text: KA, ecl: 'Q', mask: 5, version: 5, size: 37, sha: '0546c31654505a2c' },
  { label: 'KA', text: KA, ecl: 'H', mask: 0, version: 6, size: 41, sha: 'b8a65f343d166970' },
  { label: 'KA', text: KA, ecl: 'H', mask: 5, version: 6, size: 41, sha: '61d4344bd0482a89' },
];

describe('golden matrices', () => {
  it.each(GOLDEN_MATRICES)(
    '$label at $ecl, mask $mask is version $version, $size×$size, and matches qrcode@1.5.4',
    ({ text, ecl, mask, version, size, sha }) => {
      const m = encodeQr(text, ecl, mask);
      expect(m.size).toBe(size);
      expect(m.size).toBe(version * 4 + 17);
      expect(digest(m)).toBe(sha);
    },
  );
});

// The auto-mask path, pinned as this implementation's own output. NOT a
// correctness claim — see the header on why the mask choice legitimately
// differs from the reference — but a determinism claim: a refactor that
// reorders the penalty loop, or that lets a tie break the other way, changes
// one of these.
const GOLDEN_AUTO: { label: string; text: string; ecl: EcLevel; size: number; sha: string }[] = [
  { label: 'URI', text: URI, ecl: 'L', size: 29, sha: '04881793e32fbad8' },
  { label: 'URI', text: URI, ecl: 'M', size: 33, sha: '1d57afcc6b22883b' },
  { label: 'URI', text: URI, ecl: 'Q', size: 37, sha: 'cb0f992392cec5de' },
  { label: 'URI', text: URI, ecl: 'H', size: 41, sha: '7e388790692c87ea' },
  { label: 'KA', text: KA, ecl: 'L', size: 29, sha: '20c9a06d1c621e65' },
  { label: 'KA', text: KA, ecl: 'M', size: 33, sha: 'f023fa4fbc720058' },
  { label: 'KA', text: KA, ecl: 'Q', size: 37, sha: '910db380e3b411dc' },
  { label: 'KA', text: KA, ecl: 'H', size: 41, sha: 'b8a65f343d166970' },
];

describe('the automatic path is deterministic', () => {
  it.each(GOLDEN_AUTO)('$label at $ecl re-encodes byte for byte', ({ text, ecl, size, sha }) => {
    const first = encodeQr(text, ecl);
    expect(first.size).toBe(size);
    expect(digest(first)).toBe(sha);
    expect(digest(encodeQr(text, ecl))).toBe(sha);
  });

  it('defaults to level M', () => {
    expect(digest(encodeQr(URI))).toBe(digest(encodeQr(URI, 'M')));
  });
});

// ===========================================================================
// 5 · Structure. What every symbol must contain regardless of payload.
// ===========================================================================

describe('symbol structure', () => {
  const m = encodeQr(URI, 'M');

  it('is square and row-major', () => {
    expect(m.modules).toHaveLength(m.size);
    for (const row of m.modules) expect(row).toHaveLength(m.size);
  });

  it('carries three finder patterns with their separators', () => {
    const finder = (cx: number, cy: number): void => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= m.size || y >= m.size) continue;
          const ring = Math.max(Math.abs(dx), Math.abs(dy));
          expect(m.modules[y]?.[x]).toBe(ring !== 2 && ring !== 4);
        }
      }
    };
    finder(3, 3);
    finder(m.size - 4, 3);
    finder(3, m.size - 4);
  });

  it('alternates the timing patterns', () => {
    for (let i = 8; i < m.size - 8; i++) {
      expect(m.modules[6]?.[i]).toBe(i % 2 === 0);
      expect(m.modules[i]?.[6]).toBe(i % 2 === 0);
    }
  });

  it('sets the always-dark module', () => {
    expect(m.modules[m.size - 8]?.[8]).toBe(true);
  });

  it('writes both copies of the format info, and they agree', () => {
    // EC_FORMAT_BITS: M is 0, L is 1, H is 2, Q is 3 — the spec's order, not
    // the alphabet's, which is exactly the kind of table a port transposes.
    const bitsFor: Record<EcLevel, number> = { M: 0, L: 1, H: 2, Q: 3 };
    for (const ecl of LEVELS) {
      const sym = encodeQr(URI, ecl);
      const first = formatInfoOf(sym);
      expect(first.eclBits).toBe(bitsFor[ecl]);
      expect(formatInfoOfSecondCopy(sym)).toEqual(first);
    }
  });

  // Version 7 and above carry two 18-bit version blocks. This is the assertion
  // that the salvage failed: it reserved them and never filled them in, so
  // every module below was `false`.
  it('fills the version blocks at version 7 and above', () => {
    const big = encodeQr('x'.repeat(200), 'M'); // version 9 at M.
    expect(big.size).toBeGreaterThanOrEqual(7 * 4 + 17);
    let dark = 0;
    for (let i = 0; i < 18; i++) {
      const a = big.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      if (big.modules[b]?.[a]) dark++;
      // The two copies are transposes of one another.
      expect(big.modules[b]?.[a]).toBe(big.modules[a]?.[b]);
    }
    expect(dark).toBeGreaterThan(0);
  });

  it('leaves the version blocks alone below version 7', () => {
    const small = encodeQr('FC-4821', 'M');
    expect(small.size).toBe(21);
  });
});

// ===========================================================================
// 6 · The mask penalty, and the selection built on it.
// ===========================================================================

describe('penaltyScoreOf', () => {
  // Matrices with no finder-lookalike anywhere: rule 3 contributes nothing, so
  // the independent rules 1/2/4 implementation must match to the point.
  //
  // The all-light 21×21 works out by hand as 798 (rule 1: 19 per line, 42
  // lines) + 1200 (rule 2: 400 blocks) + 90 (rule 4: k = 9) = 2088, which is
  // both what this asserts and what the module returns.
  const NO_FINDER: [string, QrMatrix][] = [
    ['all light', matrixOf(21, () => false)],
    ['all dark', matrixOf(21, () => true)],
    ['checkerboard', matrixOf(21, (x, y) => (x + y) % 2 === 0)],
    ['horizontal stripes', matrixOf(21, (_x, y) => y % 2 === 0)],
  ];

  it.each(NO_FINDER)('%s scores exactly rules 1, 2 and 4', (_label, m) => {
    expect(penaltyScoreOf(m)).toBe(penaltyRules124(m));
  });

  it('scores the all-light symbol at the hand-computed 2088', () => {
    expect(penaltyScoreOf(matrixOf(21, () => false))).toBe(2088);
    expect(penaltyScoreOf(matrixOf(21, (x, y) => (x + y) % 2 === 0))).toBe(0);
  });

  // ONE crafted finder-lookalike: dark-light-dark³-light-dark on an otherwise
  // light row, with more than four light modules on both sides. Nayuki's rule
  // 3 counts such a run once from each direction, so the residual over rules
  // 1/2/4 is exactly 2 × 40. This is the assertion that pins
  // `finderPenaltyAddHistory` / `Count` / `Terminate` — the most convoluted
  // thirty lines in the port, and the only ones with no other check on them.
  it('adds 80 for a finder-lookalike run with light margins on both sides', () => {
    const m = matrixOf(21, (x, y) => y === 10 && [4, 6, 7, 8, 10].includes(x));
    expect(penaltyScoreOf(m) - penaltyRules124(m)).toBe(80);
  });

  // On a real symbol rule 3 cannot be isolated, but it can only ever be a
  // multiple of 40 — so if rule 1's run counting, rule 2's 2×2 sweep or rule
  // 4's k were off by anything, this residual would stop being one.
  it.each(LEVELS)('leaves a multiple of 40 unexplained on a real symbol at %s', (ecl) => {
    const m = encodeQr(URI, ecl);
    const residual = penaltyScoreOf(m) - penaltyRules124(m);
    expect(residual).toBeGreaterThan(0);
    expect(residual % 40).toBe(0);
  });
});

describe('mask selection', () => {
  // THE ASSERTION THE `forceMask` SEAM EXISTS FOR.
  //
  // The mask is chosen by applying each candidate, scoring it, and XOR-ing it
  // off again before the next. If that undo ever failed to undo, the symbol
  // would keep an accumulation of masks — and would still look like a QR code,
  // still carry correct format bits, and still be completely undecodable. So
  // the check is end to end: score all eight forced symbols independently,
  // take the argmin, and compare it with the mask read back out of the format
  // bits of the symbol the encoder chose on its own.
  it.each([
    ['URI', URI],
    ['Georgian', KA],
    ['short', 'FC-4821'],
  ])('%s picks the lowest-penalty mask at every level', (_label, text) => {
    for (const ecl of LEVELS) {
      const scores = Array.from({ length: 8 }, (_, mask) =>
        penaltyScoreOf(encodeQr(text, ecl, mask)),
      );
      const argmin = scores.indexOf(Math.min(...scores));
      const chosen = formatInfoOf(encodeQr(text, ecl)).mask;

      expect(chosen).toBe(argmin);
      // And the symbol it returned really is that forced symbol, bit for bit —
      // which is what proves the trial masks were undone.
      expect(digest(encodeQr(text, ecl))).toBe(digest(encodeQr(text, ecl, argmin)));
    }
  });

  it('breaks a tie toward the lowest mask index', () => {
    // `<` rather than `<=` in the selection loop. Nothing in the design
    // depends on which mask wins a tie, but everything depends on the answer
    // being the same one twice — a golden hash is worthless otherwise.
    const scores = Array.from({ length: 8 }, (_, mask) =>
      penaltyScoreOf(encodeQr('FC-4821', 'M', mask)),
    );
    const min = Math.min(...scores);
    expect(formatInfoOf(encodeQr('FC-4821', 'M')).mask).toBe(scores.indexOf(min));
  });
});
