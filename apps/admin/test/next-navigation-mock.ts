// Shared `next/navigation` double for component tests.
//
// The App Router hooks throw outside a Next request scope, so any client
// component that reads the URL — the dashboard shell, the dashboard header —
// needs them replaced. Vitest hoists `vi.mock` above imports, so a test file
// registers the mock itself and imports these handles to drive and assert it.
import { vi } from 'vitest';

const replace = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

/** The query string `useSearchParams()` will report. Set it before rendering. */
let search = '';

/** The path `usePathname()` will report. Set it before rendering. */
let pathname = '/';

export const navigationMock = {
  replace,
  push,
  refresh,
  /** Set the query string the next render observes, e.g. `setSearch('segment=sales')`. */
  setSearch(next: string): void {
    search = next;
  },
  /** Set the path the next render observes, e.g. `setPathname('/settings')`. */
  setPathname(next: string): void {
    pathname = next;
  },
  /** Clear call history and the query string. Call in `beforeEach`. */
  reset(): void {
    replace.mockReset();
    push.mockReset();
    refresh.mockReset();
    search = '';
    pathname = '/';
  },
  /** The module factory to hand `vi.mock('next/navigation', …)`. */
  factory() {
    return {
      useRouter: () => ({ replace, push, refresh }),
      usePathname: () => pathname,
      useSearchParams: () => new URLSearchParams(search),
    };
  },
};
