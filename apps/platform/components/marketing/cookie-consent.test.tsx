import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl as render } from '@/test/render-with-intl';
import {
  CONSENT_EVENT,
  CONSENT_KEY,
  hasConsent,
  openConsentSettings,
  readConsent,
} from '@/lib/consent';
import { CookieConsent } from './cookie-consent';

const banner = () => screen.queryByRole('region', { name: 'We use cookies' });

/** A fresh in-memory store: Node's own `localStorage` shadows jsdom's and is inert. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

describe('CookieConsent', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));

  it('asks a visitor on their first visit', () => {
    render(<CookieConsent />);
    expect(banner()).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('comes up only once, even when the visitor does not answer', () => {
    const first = render(<CookieConsent />);
    expect(banner()).toBeInTheDocument();
    first.unmount();

    render(<CookieConsent />);
    expect(banner()).not.toBeInTheDocument();
    expect(readConsent()).toBeNull();
    expect(hasConsent()).toBe(false);
  });

  it('stores an acceptance, announces it and goes away', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    window.addEventListener(CONSENT_EVENT, onChange);
    render(<CookieConsent />);

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(hasConsent()).toBe(true);
    expect((onChange.mock.calls[0]?.[0] as CustomEvent).detail).toBe('accepted');
    expect(banner()).not.toBeInTheDocument();
    window.removeEventListener(CONSENT_EVENT, onChange);
  });

  it('stores a refusal, so nothing optional may load', async () => {
    const user = userEvent.setup();
    render(<CookieConsent />);

    await user.click(screen.getByRole('button', { name: 'Decline' }));

    expect(localStorage.getItem(CONSENT_KEY)).toBe('rejected');
    expect(hasConsent()).toBe(false);
    expect(banner()).not.toBeInTheDocument();
  });

  it('stays away once answered, and comes back from cookie settings', () => {
    localStorage.setItem(CONSENT_KEY, 'rejected');
    render(<CookieConsent />);
    expect(banner()).not.toBeInTheDocument();

    act(() => openConsentSettings());

    expect(banner()).toBeInTheDocument();
  });
});
