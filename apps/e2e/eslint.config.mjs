import globals from 'globals';
import config from '@fit/config/eslint';

/**
 * Playwright specs run in TWO runtimes at once.
 *
 * The file itself is Node — the shared config's `globals.node` is right for it.
 * But the callbacks handed to `page.evaluate()` / `locator.evaluate()` are
 * serialised and executed IN THE BROWSER, where `document`, `getComputedStyle`
 * and `localStorage` are real globals. ESLint resolves globals per file, not per
 * callback, so under the shared config every one of those reads is reported as
 * `no-undef` even though it is the only correct way to write the assertion.
 *
 * Adding the browser globals for this package is the standard resolution. The
 * cost is that a genuine typo in the NODE half of a spec (`documnet`) would no
 * longer be caught by `no-undef` — acceptable here, because these files are
 * type-checked too, and because browser-context callbacks are the normal shape
 * of an end-to-end test rather than an exception.
 */
export default [
  ...config,
  {
    files: ['**/*.{ts,mts,js,mjs}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
