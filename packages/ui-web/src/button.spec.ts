import { describe, expect, it } from 'vitest';

import { buttonClasses } from './button';
import { I, type IconName } from './icon';

describe('buttonClasses', () => {
  it('defaults to the primary / md recipe', () => {
    const cls = buttonClasses();
    expect(cls).toContain('rounded-btn');
    expect(cls).toContain('h-11'); // md height
    expect(cls).toContain('linear-gradient(135deg,#7C3AED,#EC4899)'); // primary fill
  });

  it('composes the requested variant and size', () => {
    const cls = buttonClasses('danger', 'sm');
    expect(cls).toContain('bg-danger-500');
    expect(cls).toContain('h-9'); // sm height
    expect(cls).not.toContain('h-11');
  });

  it('appends caller classes and trims', () => {
    const cls = buttonClasses('ghost', 'lg', 'w-full');
    expect(cls).toContain('w-full');
    expect(cls.startsWith(' ')).toBe(false);
    expect(cls.endsWith(' ')).toBe(false);
  });

  it('exposes every variant × size combination without collapsing', () => {
    const variants = ['primary', 'white', 'glass', 'outline', 'ghost', 'ink', 'danger'] as const;
    const sizes = ['sm', 'md', 'lg', 'icon'] as const;
    for (const v of variants) {
      for (const s of sizes) {
        expect(buttonClasses(v, s).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('icon set', () => {
  it('is the consolidated union — carries both apps’ once-divergent glyphs', () => {
    // `chart` shipped only in admin, `grid` only in web before consolidation.
    const names = Object.keys(I) as IconName[];
    expect(names).toContain('chart');
    expect(names).toContain('grid');
  });

  it('maps every name to non-empty SVG path data', () => {
    for (const path of Object.values(I)) {
      expect(typeof path).toBe('string');
      expect(path.length).toBeGreaterThan(0);
    }
  });
});
