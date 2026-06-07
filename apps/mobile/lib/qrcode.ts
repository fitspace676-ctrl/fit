// @fit/mobile — dependency-free QR Code generator.
//
// The member check-in screen (T6.9) needs to paint a scannable QR code, but the
// app ships no QR / SVG library and adding `react-native-svg` would pull a
// native module EAS has to rebuild — overkill for one static code. So this is a
// small, self-contained encoder: text in, a boolean module matrix out, which the
// `<QrCode>` component renders with plain React Native Views.
//
// It is a faithful TypeScript port of Project Nayuki's QR Code generator
// (MIT-licensed, https://www.nayuki.io/page/qr-code-generator-library) — byte
// mode only, which is all a UTF-8 check-in URI needs. Auto-selects the smallest
// version (1–40) that fits and the mask with the lowest penalty.
//
// The grid is stored as flat `Uint8Array`s reached through small accessors: the
// project's `noUncheckedIndexedAccess` makes raw indexing `T | undefined`, and
// the accessors keep the hot numeric loops readable without scattering
// assertions through the placement and penalty code.

/** Error-correction level, ordered by the share of codewords spent on recovery. */
export type EcLevel = 'L' | 'M' | 'Q' | 'H';

/** A rendered QR symbol: a `size`×`size` grid where `true` is a dark module. */
export interface QrMatrix {
  /** The side length in modules (21 for version 1, +4 per version). */
  size: number;
  /** Row-major grid; `modules[y][x]` is `true` when the module is dark. */
  modules: boolean[][];
}

/** The numeric "format" weight of each EC level used by the format-info bits. */
const EC_FORMAT_BITS: Record<EcLevel, number> = { M: 0, L: 1, H: 2, Q: 3 };

// Number of error-correction codewords per block, indexed [ecl][version]. Index 0
// of each row is unused. Mirrors the published QR spec tables.
const ECC_CODEWORDS_PER_BLOCK: Record<EcLevel, readonly number[]> = {
  // prettier-ignore
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // prettier-ignore
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  // prettier-ignore
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // prettier-ignore
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

// Number of error-correction blocks, indexed [ecl][version].
const NUM_EC_BLOCKS: Record<EcLevel, readonly number[]> = {
  // prettier-ignore
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  // prettier-ignore
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  // prettier-ignore
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  // prettier-ignore
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

const MIN_VERSION = 1;
const MAX_VERSION = 40;

/** Read a numeric array element that the caller knows is in-bounds. */
function n(arr: readonly number[], i: number): number {
  return arr[i] ?? 0;
}

/** EC codewords per block at a version + level. */
function eccLen(version: number, ecl: EcLevel): number {
  return n(ECC_CODEWORDS_PER_BLOCK[ecl], version);
}

/** EC block count at a version + level. */
function ecBlocks(version: number, ecl: EcLevel): number {
  return n(NUM_EC_BLOCKS[ecl], version);
}

/** UTF-8 encode a string to a byte array (Hermes lacks a guaranteed TextEncoder). */
function toUtf8(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    // Combine a surrogate pair into a single code point.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return out;
}

/** Total data-module count (before EC) for a version, per the spec's formula. */
function numRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Number of 8-bit data codewords (excluding EC) available at a version + level. */
function numDataCodewords(version: number, ecl: EcLevel): number {
  return Math.floor(numRawDataModules(version) / 8) - eccLen(version, ecl) * ecBlocks(version, ecl);
}

/** Centre coordinates of the alignment patterns for a version (empty for v1). */
function alignmentPatternPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result: number[] = [6];
  for (let pos = version * 4 + 10; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

// ── Reed–Solomon over GF(2^8) with the QR primitive polynomial 0x11D ──────────

/** Multiply two GF(256) field elements (Russian-peasant with the QR modulus). */
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** The divisor (generator) polynomial coefficients for `degree` EC codewords. */
function rsComputeDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(n(result, j), root);
      if (j + 1 < result.length) result[j] = n(result, j) ^ n(result, j + 1);
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** The EC codewords (remainder) for `data` under generator `divisor`. */
function rsComputeRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() ?? 0);
    result.push(0);
    for (let i = 0; i < result.length; i++) {
      result[i] = n(result, i) ^ gfMultiply(n(divisor, i), factor);
    }
  }
  return result;
}

// ── Bit buffer ────────────────────────────────────────────────────────────────

/** Append the low `len` bits of `val` (MSB first) to a growing bit array. */
function appendBits(bits: number[], val: number, len: number): void {
  for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
}

// ── Symbol assembly ────────────────────────────────────────────────────────────

/** Flat-array QR grid: `dark` holds module colour (0/1), `fn` flags function modules. */
interface Grid {
  size: number;
  dark: Uint8Array;
  fn: Uint8Array;
}

/** Is the module at (x,y) dark? Out-of-range reads as light. */
function isDark(g: Grid, x: number, y: number): boolean {
  return g.dark[y * g.size + x] === 1;
}

/** Is (x,y) a function (non-data) module? */
function isFn(g: Grid, x: number, y: number): boolean {
  return g.fn[y * g.size + x] === 1;
}

/** Set a data module's colour, leaving its function flag untouched. */
function setModule(g: Grid, x: number, y: number, dark: boolean): void {
  g.dark[y * g.size + x] = dark ? 1 : 0;
}

/** Toggle a module's colour (used by masking). */
function flipModule(g: Grid, x: number, y: number): void {
  const i = y * g.size + x;
  g.dark[i] = g.dark[i] === 1 ? 0 : 1;
}

/** Set a module and flag it as a function (non-data) module. */
function setFunction(g: Grid, x: number, y: number, dark: boolean): void {
  const i = y * g.size + x;
  g.dark[i] = dark ? 1 : 0;
  g.fn[i] = 1;
}

/** Lay down a 7×7 finder pattern (with its 1-module light border) centred at (cx,cy). */
function drawFinder(g: Grid, cx: number, cy: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < g.size && y >= 0 && y < g.size) {
        setFunction(g, x, y, dist !== 2 && dist !== 4);
      }
    }
  }
}

/** Lay down a 5×5 alignment pattern centred at (cx,cy). */
function drawAlignment(g: Grid, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFunction(g, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

/** Place all fixed patterns: finders, separators, timing, alignment, dark module. */
function drawFunctionPatterns(g: Grid, version: number): void {
  const size = g.size;
  // Timing patterns.
  for (let i = 0; i < size; i++) {
    setFunction(g, 6, i, i % 2 === 0);
    setFunction(g, i, 6, i % 2 === 0);
  }
  // Three finder patterns (top-left, top-right, bottom-left).
  drawFinder(g, 3, 3);
  drawFinder(g, size - 4, 3);
  drawFinder(g, 3, size - 4);

  // Alignment patterns (skip the three that collide with finders).
  const align = alignmentPatternPositions(version);
  const count = align.length;
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === count - 1) || (i === count - 1 && j === 0)) {
        continue;
      }
      drawAlignment(g, n(align, i), n(align, j));
    }
  }

  // Reserve format + version areas as function modules, then the dark module.
  drawFormatBits(g, 'M', 0, true);
  drawVersionInfo(g, version, true);
  setFunction(g, 8, size - 8, true); // The always-dark module.
}

/** Reserve (reserveOnly) or draw the 15-bit format info for a level + mask. */
function drawFormatBits(g: Grid, ecl: EcLevel, mask: number, reserveOnly: boolean): void {
  const size = g.size;
  const data = (EC_FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;

  const place = (x: number, y: number, on: boolean): void => {
    const i = y * size + x;
    g.dark[i] = reserveOnly ? 0 : on ? 1 : 0;
    g.fn[i] = 1;
  };
  const bit = (i: number): boolean => ((bits >>> i) & 1) !== 0;

  // First copy, around the top-left finder.
  for (let i = 0; i <= 5; i++) place(8, i, bit(i));
  place(8, 7, bit(6));
  place(8, 8, bit(7));
  place(7, 8, bit(8));
  for (let i = 9; i < 15; i++) place(14 - i, 8, bit(i));

  // Second copy, split across the other two finders.
  for (let i = 0; i < 8; i++) place(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) place(8, size - 15 + i, bit(i));
}

/** Draw the 18-bit version info (versions ≥ 7 only). */
function drawVersionInfo(g: Grid, version: number, reserveOnly: boolean): void {
  if (version < 7) return;
  const size = g.size;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;

  for (let i = 0; i < 18; i++) {
    const on = !reserveOnly && ((bits >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunction(g, a, b, on);
    setFunction(g, b, a, on);
  }
}

/** Place the interleaved data+EC codewords into the non-function modules, zig-zag. */
function drawCodewords(g: Grid, data: readonly number[]): void {
  const size = g.size;
  let i = 0; // Bit index into data.
  for (let right = size - 1; right >= 1; right -= 2) {
    const col = right === 6 ? 5 : right; // Skip the vertical timing column.
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = col - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFn(g, x, y) && i < data.length * 8) {
          setModule(g, x, y, ((n(data, i >>> 3) >>> (7 - (i & 7))) & 1) !== 0);
          i++;
        }
      }
    }
  }
}

/** Apply mask pattern `mask` (0–7) to the data modules in place. */
function applyMask(g: Grid, mask: number): void {
  const size = g.size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFn(g, x, y)) continue;
      let invert = false;
      switch (mask) {
        case 0:
          invert = (x + y) % 2 === 0;
          break;
        case 1:
          invert = y % 2 === 0;
          break;
        case 2:
          invert = x % 3 === 0;
          break;
        case 3:
          invert = (x + y) % 3 === 0;
          break;
        case 4:
          invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
          break;
        case 5:
          invert = ((x * y) % 2) + ((x * y) % 3) === 0;
          break;
        case 6:
          invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
          break;
        default:
          invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
          break;
      }
      if (invert) flipModule(g, x, y);
    }
  }
}

/** Penalty score (lower is better) used to pick the least-conspicuous mask. */
function penaltyScore(g: Grid): number {
  const size = g.size;
  let score = 0;

  // Rules 1 & 3: runs and finder-like patterns, scanned by row then by column.
  for (let y = 0; y < size; y++) {
    let runColor = false;
    let runLen = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let x = 0; x < size; x++) {
      if (isDark(g, x, y) === runColor) {
        runLen++;
        if (runLen === 5) score += 3;
        else if (runLen > 5) score++;
      } else {
        finderPenaltyAddHistory(runLen, history);
        if (!runColor) score += finderPenaltyCount(history) * 40;
        runColor = isDark(g, x, y);
        runLen = 1;
      }
    }
    score += finderPenaltyTerminate(runColor, runLen, history, size) * 40;
  }
  for (let x = 0; x < size; x++) {
    let runColor = false;
    let runLen = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let y = 0; y < size; y++) {
      if (isDark(g, x, y) === runColor) {
        runLen++;
        if (runLen === 5) score += 3;
        else if (runLen > 5) score++;
      } else {
        finderPenaltyAddHistory(runLen, history);
        if (!runColor) score += finderPenaltyCount(history) * 40;
        runColor = isDark(g, x, y);
        runLen = 1;
      }
    }
    score += finderPenaltyTerminate(runColor, runLen, history, size) * 40;
  }

  // Rule 2: 2×2 blocks of one color.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = isDark(g, x, y);
      if (c === isDark(g, x + 1, y) && c === isDark(g, x, y + 1) && c === isDark(g, x + 1, y + 1)) {
        score += 3;
      }
    }
  }

  // Rule 4: deviation of the dark-module ratio from 50%.
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (isDark(g, x, y)) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  score += k * 10;
  return score;
}

function finderPenaltyAddHistory(currentRunLength: number, history: number[]): void {
  history.pop();
  history.unshift(currentRunLength);
}

function finderPenaltyCount(history: number[]): number {
  const center = n(history, 1);
  const core =
    center > 0 &&
    n(history, 2) === center &&
    n(history, 3) === center * 3 &&
    n(history, 4) === center &&
    n(history, 5) === center;
  return (
    (core && n(history, 0) >= center * 4 && n(history, 6) >= center ? 1 : 0) +
    (core && n(history, 6) >= center * 4 && n(history, 0) >= center ? 1 : 0)
  );
}

function finderPenaltyTerminate(
  runColor: boolean,
  runLen: number,
  history: number[],
  size: number,
): number {
  if (runColor) {
    finderPenaltyAddHistory(runLen, history);
    runLen = 0;
  }
  runLen += size;
  finderPenaltyAddHistory(runLen, history);
  return finderPenaltyCount(history);
}

/** Smallest version (≥ given level) whose data capacity holds the byte payload. */
function chooseVersion(numBytes: number, ecl: EcLevel): number {
  for (let version = MIN_VERSION; version <= MAX_VERSION; version++) {
    const capacityBits = numDataCodewords(version, ecl) * 8;
    // Byte-mode segment: 4-bit mode + char-count + 8 bits per byte.
    const charCountBits = version <= 9 ? 8 : 16;
    const usedBits = 4 + charCountBits + numBytes * 8;
    if (usedBits <= capacityBits) return version;
  }
  throw new Error('Data too long for a QR code');
}

/** Split the data+EC codewords across blocks and interleave them per the spec. */
function addEccAndInterleave(data: readonly number[], version: number, ecl: EcLevel): number[] {
  const numBlocks = ecBlocks(version, ecl);
  const blockEccLen = eccLen(version, ecl);
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  const divisor = rsComputeDivisor(blockEccLen);
  let k = 0;
  for (let i = 0; i < numBlocks; i++) {
    const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = data.slice(k, k + datLen);
    k += datLen;
    const ecc = rsComputeRemainder(dat, divisor);
    // Short blocks get a padding slot so the interleave columns line up.
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }

  // Interleave: read column-by-column across the blocks.
  const result: number[] = [];
  const maxLen = shortBlockLen + 1;
  for (let i = 0; i < maxLen; i++) {
    for (let j = 0; j < blocks.length; j++) {
      // Skip the padding slot of the short blocks in the data region.
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
        const block = blocks[j];
        if (block) result.push(n(block, i));
      }
    }
  }
  return result;
}

/**
 * Encode `text` (UTF-8, byte mode) into a QR module matrix. Picks the smallest
 * version that fits at error-correction level `ecl` (default `M`) and the mask
 * with the lowest penalty. Throws if the text is too long for version 40.
 */
export function encodeQr(text: string, ecl: EcLevel = 'M'): QrMatrix {
  const bytes = toUtf8(text);
  const version = chooseVersion(bytes.length, ecl);
  const charCountBits = version <= 9 ? 8 : 16;

  // Build the bitstream: byte-mode header, payload, terminator, byte-align, pad.
  const bits: number[] = [];
  appendBits(bits, 0x4, 4); // Byte mode indicator.
  appendBits(bits, bytes.length, charCountBits);
  for (const b of bytes) appendBits(bits, b, 8);

  const capacityBits = numDataCodewords(version, ecl) * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length)); // Terminator.
  if (bits.length % 8 !== 0) appendBits(bits, 0, 8 - (bits.length % 8)); // Byte-align.

  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | n(bits, i + j);
    dataCodewords.push(byte);
  }
  // Alternate the two pad bytes until the data region is full.
  for (let pad = 0xec; dataCodewords.length < capacityBits / 8; pad ^= 0xec ^ 0x11) {
    dataCodewords.push(pad);
  }

  const allCodewords = addEccAndInterleave(dataCodewords, version, ecl);

  const size = version * 4 + 17;
  const grid: Grid = {
    size,
    dark: new Uint8Array(size * size),
    fn: new Uint8Array(size * size),
  };
  drawFunctionPatterns(grid, version);
  drawCodewords(grid, allCodewords);

  // Try all 8 masks; keep the one with the lowest penalty.
  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(grid, mask);
    drawFormatBits(grid, ecl, mask, false);
    const penalty = penaltyScore(grid);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    applyMask(grid, mask); // XOR again to undo before the next trial.
  }
  applyMask(grid, bestMask);
  drawFormatBits(grid, ecl, bestMask, false);

  // Project the flat grid into the row-major boolean matrix the renderer wants.
  const modules: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) row.push(isDark(grid, x, y));
    modules.push(row);
  }
  return { size, modules };
}
