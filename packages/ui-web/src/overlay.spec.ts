import { describe, expect, it } from 'vitest';

import { modalPanelClasses, drawerPanelClasses, OVERLAY_ROOT, OVERLAY_BACKDROP } from './overlay';

describe('modalPanelClasses', () => {
  it('defaults to the md width and the shared card surface', () => {
    const cls = modalPanelClasses();
    expect(cls).toContain('rounded-card');
    expect(cls).toContain('max-w-md');
    expect(cls).toContain('bg-white');
    expect(cls).toContain('dark:bg-ink-950');
  });

  it('maps each size to its width token', () => {
    expect(modalPanelClasses('sm')).toContain('max-w-sm');
    expect(modalPanelClasses('lg')).toContain('max-w-lg');
    expect(modalPanelClasses('sm')).not.toContain('max-w-md');
  });

  it('appends caller classes and trims', () => {
    const cls = modalPanelClasses('md', 'w-full');
    expect(cls).toContain('w-full');
    expect(cls.startsWith(' ')).toBe(false);
    expect(cls.endsWith(' ')).toBe(false);
  });
});

describe('drawerPanelClasses', () => {
  it('anchors to the right edge by default with a left border', () => {
    const cls = drawerPanelClasses();
    expect(cls).toContain('right-0');
    expect(cls).toContain('border-l');
    expect(cls).toContain('max-w-md');
    expect(cls).toContain('inset-y-0');
  });

  it('flips to the left edge with a right border', () => {
    const cls = drawerPanelClasses('left');
    expect(cls).toContain('left-0');
    expect(cls).toContain('border-r');
    expect(cls).not.toContain('right-0');
  });

  it('appends caller classes and trims', () => {
    const cls = drawerPanelClasses('right', 'max-w-lg');
    expect(cls).toContain('max-w-lg');
    expect(cls.endsWith(' ')).toBe(false);
  });
});

describe('overlay scrim recipes', () => {
  it('roots the scrim above the app chrome and fills the viewport', () => {
    expect(OVERLAY_ROOT).toContain('fixed');
    expect(OVERLAY_ROOT).toContain('inset-0');
    expect(OVERLAY_ROOT).toContain('z-50');
  });

  it('dims and blurs the backdrop', () => {
    expect(OVERLAY_BACKDROP).toContain('bg-ink-950/50');
    expect(OVERLAY_BACKDROP).toContain('backdrop-blur-sm');
  });
});
