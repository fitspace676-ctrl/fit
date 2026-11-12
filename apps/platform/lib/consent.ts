/**
 * Cookie consent for the marketing site.
 *
 * The banner comes up once per browser: the first time it is shown is
 * remembered, and so is the visitor's answer, both in `localStorage` with no
 * expiry. A visitor who never answers is treated as not consenting. Anything
 * that is not strictly necessary (analytics, advertising pixels) must check
 * {@link hasConsent} before it loads, and listen for {@link CONSENT_EVENT} to
 * start once the visitor accepts. Privacy Policy §9 promises exactly this.
 */
export type Consent = 'accepted' | 'rejected';

export const CONSENT_KEY = 'fc-consent';
/** Set the first time the banner is shown, so it does not come back. */
export const CONSENT_SEEN_KEY = 'fc-consent-seen';

/** Fired on `window` when the answer changes; `detail` is the new {@link Consent}. */
export const CONSENT_EVENT = 'fc-consent-change';
/** Fired on `window` to bring the banner back, from the footer's cookie settings link. */
export const CONSENT_OPEN_EVENT = 'fc-consent-open';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // storage blocked by the browser
  }
}

/** The stored answer, or `null` when the visitor has not chosen. */
export function readConsent(): Consent | null {
  const value = storage()?.getItem(CONSENT_KEY);
  return value === 'accepted' || value === 'rejected' ? value : null;
}

/** Store the answer and tell whatever is listening. */
export function writeConsent(consent: Consent): void {
  storage()?.setItem(CONSENT_KEY, consent);
  window.dispatchEvent(new CustomEvent<Consent>(CONSENT_EVENT, { detail: consent }));
}

/** Whether non-essential cookies may be set. */
export function hasConsent(): boolean {
  return readConsent() === 'accepted';
}

/**
 * Whether the banner should come up on its own: only the first time, and only
 * if the visitor has not answered. Marks it as shown when it says yes.
 */
export function claimFirstShow(): boolean {
  const store = storage();
  if (!store) return readConsent() === null;
  if (readConsent() !== null || store.getItem(CONSENT_SEEN_KEY)) return false;
  store.setItem(CONSENT_SEEN_KEY, '1');
  return true;
}

/** Show the banner again so the visitor can change their answer. */
export function openConsentSettings(): void {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
