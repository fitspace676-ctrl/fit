// `/qr` — the scanner's five states, and the two things that are easy to break.
//
// The state machine is a pure function, so most of this file asserts it without
// a renderer. What DOES need one is the pair that only exists at the boundary:
//
//   1. the camera is detached the moment a code is read (`onBarcodeScanned`
//      becomes `undefined`), because the native side fires it per FRAME;
//   2. the close button always has somewhere to go — `back()` when there is a
//      stack, `/home` when the modal was deep-linked into cold.
//
// `expo-camera` is mocked globally in `jest.setup.ts` (default: granted). The
// permission states are driven by overriding that mock per test.

import { act, fireEvent } from '@testing-library/react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import QrScannerScreen, { scannerStateFor } from './qr';
import { renderScreen } from '../test-support/render-screen';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => mockCanGoBack(),
  }),
}));

/** The mocked hook, typed enough to seed a return value. */
const permissions = useCameraPermissions as unknown as jest.Mock;

/**
 * Call the camera's native callback the way the native side would.
 *
 * Wrapped in `act` because it is not a React event: `fireEvent` supplies the
 * act boundary for a touch, and a native module callback has nobody to supply
 * one, so the `setState` inside it never flushes and the assertion below reads
 * the pre-scan tree.
 */
function scan(
  props: { onBarcodeScanned?: (result: { type: string; data: string }) => void },
  data: string,
) {
  const handler = props.onBarcodeScanned;
  if (!handler) throw new Error('the camera is not armed');
  act(() => {
    handler({ type: 'qr', data });
  });
}

/** `useCameraPermissions()`'s tuple, with the two request functions stubbed. */
function permissionTuple(
  value: { granted: boolean; canAskAgain: boolean } | null,
  request = jest.fn(),
) {
  return [value, request, jest.fn()];
}

beforeEach(() => {
  mockBack.mockClear();
  mockReplace.mockClear();
  mockCanGoBack.mockReturnValue(true);
  permissions.mockReturnValue(permissionTuple({ granted: true, canAskAgain: true }));
});

describe('scannerStateFor', () => {
  const GRANTED = { granted: true, canAskAgain: true };

  it('an unsupported platform wins over everything — there is nothing to ask for', () => {
    expect(scannerStateFor({ cameraSupported: false, permission: GRANTED, scanned: 'x' })).toBe(
      'unavailable',
    );
  });

  it('waits while the permissions module has not answered', () => {
    expect(scannerStateFor({ cameraSupported: true, permission: null, scanned: null })).toBe(
      'checking',
    );
  });

  it('separates "can still ask" from "only Settings will help"', () => {
    // The single field that distinguishes them, and the one that makes the
    // difference between an "Allow camera" button that works and one that does
    // nothing at all when pressed.
    expect(
      scannerStateFor({
        cameraSupported: true,
        permission: { granted: false, canAskAgain: true },
        scanned: null,
      }),
    ).toBe('prompt');
    expect(
      scannerStateFor({
        cameraSupported: true,
        permission: { granted: false, canAskAgain: false },
        scanned: null,
      }),
    ).toBe('denied');
  });

  it('a result stops the camera', () => {
    expect(scannerStateFor({ cameraSupported: true, permission: GRANTED, scanned: null })).toBe(
      'scanning',
    );
    expect(
      scannerStateFor({ cameraSupported: true, permission: GRANTED, scanned: 'FC-4821' }),
    ).toBe('result');
  });
});

describe('the permission states', () => {
  it('offers to ask, and asking goes through the module', () => {
    const request = jest.fn();
    permissions.mockReturnValue(permissionTuple({ granted: false, canAskAgain: true }, request));
    const { getByTestId, queryByTestId } = renderScreen(<QrScannerScreen />);

    expect(getByTestId('qr-permission')).toBeTruthy();
    expect(queryByTestId('qr-camera')).toBeNull();
    fireEvent.press(getByTestId('qr-allow'));
    expect(request).toHaveBeenCalled();
  });

  it('does not offer to ask once the system has stopped asking', () => {
    permissions.mockReturnValue(permissionTuple({ granted: false, canAskAgain: false }));
    const { getByTestId, queryByTestId } = renderScreen(<QrScannerScreen />);

    expect(getByTestId('qr-denied')).toBeTruthy();
    // The button that cannot work must not be on screen at all.
    expect(queryByTestId('qr-allow')).toBeNull();
    expect(getByTestId('qr-settings')).toBeTruthy();
  });

  it('shows a spinner while the module has not answered', () => {
    permissions.mockReturnValue(permissionTuple(null));
    const { getByTestId, queryByTestId } = renderScreen(<QrScannerScreen />);
    expect(getByTestId('qr-checking')).toBeTruthy();
    expect(queryByTestId('qr-camera')).toBeNull();
  });
});

describe('scanning', () => {
  it('mounts the camera once permission is granted', () => {
    const { getByTestId } = renderScreen(<QrScannerScreen />);
    expect(getByTestId('qr-camera')).toBeTruthy();
    expect(getByTestId('qr-screen')).toBeTruthy();
  });

  it('reads a code once, shows it, and detaches the handler', () => {
    // THE REGRESSION THIS CATCHES. `onBarcodeScanned` fires per frame, so a
    // code held in view calls it thirty times a second. Leaving the handler
    // attached re-sets the same state on every frame and, once a request goes
    // in here, would send thirty of them.
    //
    // The handler is invoked directly rather than through `fireEvent`: it is a
    // NATIVE callback, not a bubbling touch, and RNTL has no way to raise one.
    const { UNSAFE_getByType, getByTestId, queryByTestId } = renderScreen(<QrScannerScreen />);
    expect(typeof UNSAFE_getByType(CameraView).props.onBarcodeScanned).toBe('function');

    scan(UNSAFE_getByType(CameraView).props, 'FC-4821');

    expect(getByTestId('qr-result')).toBeTruthy();
    expect(UNSAFE_getByType(CameraView).props.onBarcodeScanned).toBeUndefined();
    expect(queryByTestId('qr-rescan')).toBeTruthy();
  });

  it('re-arms the camera on "scan again"', () => {
    const { UNSAFE_getByType, getByTestId, queryByTestId } = renderScreen(<QrScannerScreen />);
    scan(UNSAFE_getByType(CameraView).props, 'FC-4821');
    fireEvent.press(getByTestId('qr-rescan'));

    expect(queryByTestId('qr-result')).toBeNull();
    expect(typeof UNSAFE_getByType(CameraView).props.onBarcodeScanned).toBe('function');
  });

  it('sends nothing anywhere — this screen has no API surface', () => {
    // A guard, not a formality: the whole decision behind this screen is that
    // no member-scoped check-in endpoint exists. `renderScreen`'s client would
    // record a query; there is none to record.
    const { client, UNSAFE_getByType } = renderScreen(<QrScannerScreen />);
    scan(UNSAFE_getByType(CameraView).props, 'FC-4821');
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe('closing', () => {
  it('goes back when there is a stack under the modal', () => {
    const { getByTestId } = renderScreen(<QrScannerScreen />);
    fireEvent.press(getByTestId('qr-close'));
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('falls back to /home when the modal was opened cold by a deep link', () => {
    mockCanGoBack.mockReturnValue(false);
    const { getByTestId } = renderScreen(<QrScannerScreen />);
    fireEvent.press(getByTestId('qr-close'));
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it('is reachable from a permission state too, not just from the camera', () => {
    permissions.mockReturnValue(permissionTuple({ granted: false, canAskAgain: false }));
    const { getByTestId } = renderScreen(<QrScannerScreen />);
    fireEvent.press(getByTestId('qr-close'));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('copy', () => {
  it('labels the close button in the active locale', () => {
    const en = renderScreen(<QrScannerScreen />, { locale: 'en' });
    const ka = renderScreen(<QrScannerScreen />, { locale: 'ka' });
    const enLabel = en.getByTestId('qr-close').props.accessibilityLabel as string;
    const kaLabel = ka.getByTestId('qr-close').props.accessibilityLabel as string;
    expect(enLabel).not.toBe('');
    // Not asserted as a literal: the point is that it CHANGES, not what it is.
    expect(kaLabel).not.toBe(enLabel);
  });
});
