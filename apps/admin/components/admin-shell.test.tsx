import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AdminShell } from './admin-shell';

// The shell's three occupants are stubbed: this spec is about WHERE the shell
// puts things, not what they render. Each one otherwise drags in the session
// fetch, the router and the agent transport.
vi.mock('./sidebar', () => ({ Sidebar: () => <nav data-testid="sidebar" /> }));
vi.mock('./top-bar', () => ({ TopBar: () => <div data-testid="top-bar" /> }));
vi.mock('./agent/agent-chat', () => ({ AgentChat: () => <div data-testid="agent-chat" /> }));

const messages = { admin: { common: { skipToContent: 'Skip to content' } } };

function renderShell(banner?: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AdminShell
        gymSlug="iron-gym"
        system={{ online: true, checkInCount: 3 }}
        locations={[]}
        banner={banner}
      >
        <p data-testid="page">Page body</p>
      </AdminShell>
    </NextIntlClientProvider>,
  );
}

/**
 * The shell is pinned to the viewport and only the content column scrolls, so
 * what lands INSIDE `#main-content` is what scrolls and what lands outside it
 * stays put. jsdom has no layout engine and the StyleX shim erases class names,
 * so the CSS itself can't be asserted here — the containment is what can be,
 * and it is the half that regresses when someone moves a node.
 */
describe('AdminShell', () => {
  it('puts the page and the top bar inside the one scrolling column', () => {
    renderShell();
    const column = document.getElementById('main-content');
    expect(column).not.toBeNull();
    expect(column).toContainElement(screen.getByTestId('page'));
    expect(column).toContainElement(screen.getByTestId('top-bar'));
  });

  it('keeps the side nav and the floating copilot out of the scrolling column', () => {
    renderShell();
    const column = document.getElementById('main-content');
    expect(column).not.toContainElement(screen.getByTestId('sidebar'));
    expect(column).not.toContainElement(screen.getByTestId('agent-chat'));
  });

  it('points a skip link at the scrolling column', () => {
    renderShell();
    // Two of them by name: AppShell ships its own, aimed at the `<main>` it
    // renders. Ours is the one that lands past the top bar, on `#main-content`.
    const targets = screen
      .getAllByRole('link', { name: 'Skip to content' })
      .map((link) => link.getAttribute('href'));
    expect(targets).toContain('#main-content');
  });

  it('renders a banner as pinned chrome above the scrolling column, never inside it', () => {
    renderShell(<div data-testid="banner">Impersonating</div>);
    const banner = screen.getByTestId('banner');
    // Above `<main>` entirely: a banner rendered inside the column would scroll
    // away with the page, and one rendered as a sibling ABOVE the shell would
    // make the document taller than the viewport and bring back the page scroll
    // this layout exists to remove.
    expect(document.getElementById('main-content')).not.toContainElement(banner);
    expect(document.getElementById('astryx-app-shell-main')).not.toContainElement(banner);
  });

  it('renders no banner chrome when there is nothing to announce', () => {
    renderShell();
    expect(screen.queryByTestId('banner')).toBeNull();
  });
});
