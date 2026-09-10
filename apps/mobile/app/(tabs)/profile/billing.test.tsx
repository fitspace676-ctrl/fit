// `/profile/billing` — invoices and a PDF that is a byte stream.
//
// Two things here are worth a reader's attention:
//
//   1. **The invoice list has no endpoint.** Its rows ride on
//      `GET /me/subscription`, so the "invoices failed to load" branch is driven
//      by rejecting the MEMBERSHIP call, and its retry invalidates the
//      membership key. A test that mocked a `getInvoices` would be testing a
//      route that does not exist.
//   2. **`expo-file-system` and `expo-sharing` are mocked here**, not stubbed
//      inside the app. The download path is real code — it builds the
//      `Authorization` header, names the file and calls the share sheet — and
//      these two mocks are the device it would otherwise need.
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';

import BillingScreen from './billing';
import { renderApp } from '../../../test-support/render';

jest.setTimeout(30_000);
const WAIT = { timeout: 10_000 };

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
    canGoBack: () => true,
  }),
}));

jest.mock('../../../hooks/useActiveGym', () => ({
  useGymId: () => 'gym_1',
  useActiveGym: () => ({ gymId: 'gym_1', role: 'MEMBER', userId: 'user_1' }),
}));

const mockGetMySubscription = jest.fn();
jest.mock('../../../lib/api/me', () => ({
  getMySubscription: () => mockGetMySubscription() as unknown,
  getMyProfile: () => Promise.resolve({ profile: {} }),
  getMyGoals: () => Promise.resolve({ goals: [] }),
  myInvoicePdfUrl: (id: string) => `https://api.test/me/invoices/${id}/pdf`,
}));

// A box, not a bare `let`: `jest.mock` factories may not close over a binding
// that is not `mock`-prefixed, and this one has to be readable at CALL time so a
// test can take the session away mid-suite.
const mockTokenRef = { current: 'token-abc' as string | null };
jest.mock('../../../lib/auth/token-store', () => ({
  getAccessToken: () => mockTokenRef.current,
}));

const mockDownloadFile = jest.fn();
jest.mock('expo-file-system', () => {
  // A hand-rolled stand-in for the SDK 54+ `File` / `Paths` API. Declared as a
  // plain object rather than a `class` with a static initialiser, because a
  // static arrow that closes over a `jest.fn` is a circular initializer as far
  // as `tsc` is concerned (TS7022).
  const File = function File() {
    /* a path handle; the mocked download resolves its own uri */
  } as unknown as { downloadFileAsync: (...args: unknown[]) => unknown };
  File.downloadFileAsync = (...args: unknown[]) => mockDownloadFile(...args) as unknown;
  return { Paths: { cache: 'file:///cache' }, File };
});

const mockShareAsync = jest.fn();
const mockIsAvailable = jest.fn();
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsAvailable() as unknown,
  shareAsync: (...args: unknown[]) => mockShareAsync(...args) as unknown,
}));

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  for (const fake of [mockGetMySubscription, mockDownloadFile, mockShareAsync, mockIsAvailable]) {
    fake.mockReset();
  }
  mockGetMySubscription.mockResolvedValue({
    subscription: null,
    invoices: [
      {
        id: 'inv_1',
        date: '2026-08-01T00:00:00.000Z',
        amount: 5000,
        currency: 'GEL',
        status: 'PAID',
      },
      {
        id: 'inv_2',
        date: '2026-07-01T00:00:00.000Z',
        amount: 5000,
        currency: 'GEL',
        status: 'FAILED',
      },
    ],
  });
  mockIsAvailable.mockResolvedValue(true);
  mockDownloadFile.mockResolvedValue({ uri: 'file:///cache/invoice-inv_1.pdf' });
  mockTokenRef.current = 'token-abc';
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

function headerTitles(nodes: readonly unknown[]): unknown[] {
  return nodes.map((node) => (node as { props?: { children?: unknown } }).props?.children);
}

describe('invoices', () => {
  it('renders the history that rides on GET /me/subscription', async () => {
    const { findByTestId, getByTestId } = renderApp(<BillingScreen />);
    await findByTestId('billing-invoice-inv_1', {}, WAIT);
    // The status pill is inside the row's one accessibility node, so the word
    // has to be in the label too.
    expect(getByTestId('billing-invoice-inv_1').props.accessibilityLabel).toContain('Paid');
    expect(getByTestId('billing-invoice-inv_2').props.accessibilityLabel).toContain('Failed');
  });

  it('downloads the PDF with a Bearer header and hands it to the OS', async () => {
    const { findByTestId } = renderApp(<BillingScreen />);
    fireEvent.press(await findByTestId('billing-invoice-inv_1', {}, WAIT));

    await waitFor(() => {
      expect(mockDownloadFile).toHaveBeenCalled();
    }, WAIT);
    const [url, , options] = mockDownloadFile.mock.calls[0] as [
      string,
      unknown,
      { headers: Record<string, string>; idempotent: boolean },
    ];
    // The MEMBER-safe route. `GET /invoices/:id/pdf` is `BillingRead` and 403s.
    expect(url).toBe('https://api.test/me/invoices/inv_1/pdf');
    expect(options.headers.Authorization).toBe('Bearer token-abc');
    // Pressing the same row twice must overwrite, not reject with
    // `DestinationAlreadyExists`.
    expect(options.idempotent).toBe(true);

    await waitFor(() => {
      expect(mockShareAsync).toHaveBeenCalled();
    }, WAIT);
  });

  it('says so when the download fails rather than failing silently', async () => {
    mockDownloadFile.mockRejectedValue(new Error('offline'));
    const { findByTestId, findByText } = renderApp(<BillingScreen />);
    fireEvent.press(await findByTestId('billing-invoice-inv_1', {}, WAIT));
    await waitFor(() => {
      expect(mockShareAsync).not.toHaveBeenCalled();
    }, WAIT);
    // `reason: 'failed'` — the request or the write. Retrying can help, so the
    // sentence says so. TODO(i18n) `billing.invoices.downloadError`.
    expect(
      await findByText("We couldn't download that invoice. Please try again.", {}, WAIT),
    ).toBeTruthy();
  });

  it('sends an EXPIRED SESSION to sign in, instead of blaming the invoice list', async () => {
    // `GET /me/invoices/:id/pdf` is `SubscriptionManage`, so with no token the
    // file can never arrive. The screen used to say "Invoices could not be
    // loaded" — untrue, since they are on screen behind the toast — and offer
    // nothing. Signing back in is the only thing that helps.
    mockTokenRef.current = null;
    const { findByTestId, findByText } = renderApp(<BillingScreen />);
    fireEvent.press(await findByTestId('billing-invoice-inv_1', {}, WAIT));

    // TODO(i18n) `billing.invoices.downloadExpired`.
    expect(
      await findByText('Your session has ended. Sign in again to download this invoice.', {}, WAIT),
    ).toBeTruthy();
    expect(mockPush).toHaveBeenCalledWith('/login?next=%2Fprofile%2Fbilling');
    // Nothing was even attempted.
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });

  it('offers NOTHING when the device has no share sheet — "try again" would be dead', async () => {
    mockIsAvailable.mockResolvedValue(false);
    const { findByTestId, findByText } = renderApp(<BillingScreen />);
    fireEvent.press(await findByTestId('billing-invoice-inv_1', {}, WAIT));

    // TODO(i18n) `billing.invoices.downloadNoShare`.
    expect(await findByText('This device has nowhere to send a PDF.', {}, WAIT)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('SPINS THE PRESSED ROW, so the rows it greys out are explained', async () => {
    // One OS share sheet at a time, so the other rows genuinely are dead while
    // one downloads. Without the spinner, ten rows go grey and nothing on
    // screen says which one is working or why.
    let release: ((value: { uri: string }) => void) | undefined;
    mockDownloadFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { findByTestId, getByTestId } = renderApp(<BillingScreen />);
    fireEvent.press(await findByTestId('billing-invoice-inv_1', {}, WAIT));

    // `includeHiddenElements`, because the row collapses to ONE accessibility
    // node and everything inside it is deliberately out of the tree — which is
    // exactly why "Downloading…" also has to be in the row's own label below.
    expect(
      await findByTestId('billing-invoice-inv_1-spinner', { includeHiddenElements: true }, WAIT),
    ).toBeTruthy();
    // TODO(i18n) `billing.invoices.downloading` — it is inside the row's one
    // accessibility node, so it has to be in the label too.
    expect(getByTestId('billing-invoice-inv_1').props.accessibilityLabel).toMatch(/Downloading…$/);

    release?.({ uri: 'file:///cache/invoice-inv_1.pdf' });
    await waitFor(() => {
      expect(mockShareAsync).toHaveBeenCalled();
    }, WAIT);
  });

  it('empties, and errors through the MEMBERSHIP key because that is the source', async () => {
    mockGetMySubscription.mockResolvedValue({ subscription: null, invoices: [] });
    const empty = renderApp(<BillingScreen />);
    await empty.findByTestId('billing-invoices-empty', {}, WAIT);
    empty.unmount();

    mockGetMySubscription.mockRejectedValueOnce(new Error('boom'));
    const errored = renderApp(<BillingScreen />);
    await errored.findByTestId('billing-invoices-error', {}, WAIT);
    mockGetMySubscription.mockResolvedValue({ subscription: null, invoices: [] });
    // Counted relative to this point: the empty render above already made its
    // own call, and an absolute count would silently depend on how many
    // screens this test happens to mount.
    const before = mockGetMySubscription.mock.calls.length;
    fireEvent.press(errored.getByTestId('billing-invoices-retry'));
    await errored.findByTestId('billing-invoices-empty', {}, WAIT);
    expect(mockGetMySubscription.mock.calls.length).toBeGreaterThan(before);
  });
});

describe('the chrome', () => {
  it('renders an offline branch', async () => {
    onlineManager.setOnline(false);
    const { getByTestId } = renderApp(<BillingScreen />);
    await waitFor(() => {
      expect(getByTestId('billing-offline')).toBeTruthy();
    }, WAIT);
  });

  it('announces the title and invoice section', async () => {
    const { findByTestId, getAllByRole } = renderApp(<BillingScreen />);
    await findByTestId('billing-invoice-inv_1', {}, WAIT);
    expect(headerTitles(getAllByRole('header'))).toEqual(['Billing', 'Billing history']);
  });

  it('renders no key paths, in either locale', async () => {
    for (const locale of ['en', 'ka'] as const) {
      const screen = renderApp(<BillingScreen />, { locale });
      await screen.findByTestId('billing-invoice-inv_1', {}, WAIT);
      expect(JSON.stringify(screen.toJSON())).not.toMatch(/"billing\./i);
      screen.unmount();
    }
  });
});
