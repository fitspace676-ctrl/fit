import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const color = vi.hoisted(() => ({ value: null as string | null }));
const getGymConsoleColor = vi.hoisted(() => vi.fn(() => Promise.resolve(color.value)));
vi.mock('@/lib/active-gym', () => ({ getGymConsoleColor }));

const { ConsoleThemeStyle } = await import('./console-theme-style');

/** Render the async server component the way the layout does. */
async function renderStyle(slug: string | null) {
  return render(await ConsoleThemeStyle({ slug }));
}

beforeEach(() => {
  color.value = null;
  getGymConsoleColor.mockClear();
});

describe('ConsoleThemeStyle', () => {
  // The sign-in page has no session, so the gym comes from the host: the
  // owner's console colour then paints the sign-in screen too.
  it("writes the gym's console colour for the host's gym", async () => {
    color.value = '#7d07f2';
    const { container } = await renderStyle('downtown');
    expect(getGymConsoleColor).toHaveBeenCalledWith('downtown');
    expect(container.querySelector('style')?.innerHTML).toContain('--color-accent:#7D07F2;');
  });

  it('writes nothing when the gym chose no colour, so the default stays', async () => {
    const { container } = await renderStyle('downtown');
    expect(container.querySelector('style')).toBeNull();
  });

  it('writes nothing, without a lookup, when no gym is in scope', async () => {
    const { container } = await renderStyle(null);
    expect(getGymConsoleColor).toHaveBeenCalledWith(null);
    expect(container.querySelector('style')).toBeNull();
  });
});
