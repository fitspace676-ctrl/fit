// Shared vitest setup for @fit/admin.
//
// Registers the jest-dom matchers on vitest's `expect` and unmounts any React
// tree rendered by a test after it finishes. `globals: false` means the
// automatic testing-library cleanup hook isn't installed, so we register it
// explicitly. Both are no-ops for the Node-environment `*.spec.ts` files (which
// never render), so a single setup file serves every test.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom doesn't implement the native <dialog> element's modal behavior —
// `HTMLDialogElement.prototype.showModal`/`close` are simply absent — which the
// console's Astryx `Dialog` primitive (`@astryxdesign/core/Dialog`) relies on to
// open and close. Polyfill the minimum it touches: toggling the `open` attribute,
// which jsdom already reflects correctly as the `.open` property. This is test-only
// infrastructure — no production code calls these directly — so any component built
// on Astryx `Dialog` can render under vitest, not just this one.
if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement): void {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement): void {
      this.removeAttribute('open');
    };
  }
}

// jsdom also doesn't implement `window.scrollTo` (it logs "Not implemented") —
// Astryx `Dialog`'s scroll-lock hook calls it to restore the page's scroll
// position when the dialog unmounts. A no-op is all a test needs.
if (typeof window !== 'undefined') {
  window.scrollTo = () => {};
}
