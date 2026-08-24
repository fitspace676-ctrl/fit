// Shared vitest setup for @fit/web.
//
// Registers the jest-dom matchers on vitest's `expect` and unmounts any React
// tree a test rendered after it finishes. `globals: false` means testing-library's
// automatic cleanup hook isn't installed, so it is registered explicitly here.
// Both are no-ops for the Node-environment `*.spec.ts` files (which never
// render), so one setup file serves every test in the project.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
