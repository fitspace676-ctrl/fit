// Shared vitest setup for @fit/ui-web.
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
