import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TOUR_SCENES } from '@/data/product-tour';
import { ProductTour } from './product-tour';

/**
 * The tour's contract: one tab per scene, the chosen tab decides which scene and
 * copy show, the keyboard moves between tabs, and only the visible scene ever
 * holds a video (jsdom has no IntersectionObserver, so the card counts as on
 * screen from the start).
 */
describe('ProductTour', () => {
  // jsdom has no matchMedia; answer "no reduced-motion preference".
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    // jsdom has no media playback.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  it('lists every scene as a tab, the first one selected', () => {
    render(<ProductTour />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(TOUR_SCENES.map((s) => s.label));
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: TOUR_SCENES[0]!.title })).toBeInTheDocument();
  });

  it('switches the scene, its copy and its panel when a tab is clicked', async () => {
    const user = userEvent.setup();
    render(<ProductTour />);
    const portal = TOUR_SCENES.at(-1)!;

    await user.click(screen.getByRole('tab', { name: portal.label }));

    expect(screen.getByRole('tab', { name: portal.label })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('heading', { name: portal.title })).toBeInTheDocument();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('moves between tabs with the arrow keys, wrapping round', async () => {
    const user = userEvent.setup();
    render(<ProductTour />);

    screen.getAllByRole('tab')[0]!.focus();
    await user.keyboard('{ArrowLeft}');

    const last = screen.getByRole('tab', { name: TOUR_SCENES.at(-1)!.label });
    expect(last).toHaveAttribute('aria-selected', 'true');
    expect(last).toHaveFocus();
  });

  it('gives only the visible scene a video', () => {
    const { container } = render(<ProductTour />);

    const videos = container.querySelectorAll('video');
    expect(videos).toHaveLength(1);
    expect(screen.getByRole('tabpanel')).toContainElement(videos[0]!);
    expect(videos[0]!.querySelector('source')?.getAttribute('src')).toContain(
      `/tour/${TOUR_SCENES[0]!.clip}-`,
    );
  });
});
