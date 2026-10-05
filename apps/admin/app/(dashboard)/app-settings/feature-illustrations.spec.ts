import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MOBILE_APP_FEATURES } from '@fit/types';

describe('feature illustrations', () => {
  it.each(MOBILE_APP_FEATURES)('%s has a WebP illustration within the asset budget', (feature) => {
    const path = fileURLToPath(
      new URL(`../../../public/app-settings/${feature}.webp`, import.meta.url),
    );
    const bytes = readFileSync(path);
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
    expect(statSync(path).size).toBeLessThanOrEqual(80_000);
  });
});
