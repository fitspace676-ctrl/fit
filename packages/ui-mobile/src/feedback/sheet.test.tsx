// `Sheet` and `ConfirmSheet` — the six pitfalls, asserted.
//
// Reanimated is mocked centrally in `jest.setup.ts` — see the note there for
// why the upstream `react-native-reanimated/mock` recipe cannot be used on v4.

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Modal, Text as RNText } from 'react-native';

import { darkColors } from '../tokens/semantic';

import { ConfirmSheet } from './confirm-sheet';
import { SHEET_EXIT_MS } from './feedback-metrics';
import { Sheet } from './sheet';

const HIDDEN = { includeHiddenElements: true } as const;

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

const BASE = {
  title: 'ჩექ-ინი',
  closeAccessibilityLabel: 'დახურვა',
  testID: 'sheet',
} as const;

describe('Sheet', () => {
  it('renders nothing at all when closed', () => {
    render(
      <Sheet {...BASE} open={false} onClose={jest.fn()}>
        <RNText>body</RNText>
      </Sheet>,
    );
    expect(screen.queryByTestId('sheet', HIDDEN)).toBeNull();
    expect(screen.queryByText('body', HIDDEN)).toBeNull();
  });

  it('renders the panel when open, and marks it modal to the screen reader', () => {
    render(
      <Sheet {...BASE} open onClose={jest.fn()}>
        <RNText>body</RNText>
      </Sheet>,
    );
    const panel = screen.getByTestId('sheet');
    // PITFALL 5, second half. Without this, iOS lets the swipe gesture wander
    // back onto the screen underneath the sheet.
    expect(panel.props.accessibilityViewIsModal).toBe(true);
    expect(screen.getByText('ჩექ-ინი')).toBeTruthy();
  });

  it('shows the subtitle only when given one', () => {
    const without = render(<Sheet {...BASE} open onClose={jest.fn()} />);
    expect(without.queryByText('აჩვენე ეს კოდი')).toBeNull();
    without.unmount();

    render(<Sheet {...BASE} open onClose={jest.fn()} subtitle="აჩვენე ეს კოდი" />);
    expect(screen.getByText('აჩვენე ეს კოდი')).toBeTruthy();
  });

  // ==========================================================================
  // PITFALL 4. The artboards render the scrim ABOVE the panel and let `z-20`
  // sort it out; React Native has no z-index across siblings that beats tree
  // order, so a scrim rendered last would eat every touch aimed at the panel.
  // The scrim being tappable is only half the assertion — the other half is
  // that the panel's own controls still respond, which the close-button test
  // below covers.
  // ==========================================================================
  it('closes on a scrim press', () => {
    const onClose = jest.fn();
    render(<Sheet {...BASE} open onClose={onClose} />);
    fireEvent.press(screen.getByTestId('sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on the header button, which is reachable through the scrim', () => {
    const onClose = jest.fn();
    render(<Sheet {...BASE} open onClose={onClose} />);
    fireEvent.press(screen.getByTestId('sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('can be told to draw no close button', () => {
    render(<Sheet {...BASE} open onClose={jest.fn()} showClose={false} />);
    expect(screen.queryByTestId('sheet-close')).toBeNull();
  });

  // ==========================================================================
  // ANDROID'S HARDWARE BACK. This is the entire reason the sheet is a `Modal`
  // rather than an absolutely-positioned view: without `onRequestClose`, back
  // pops the ROUTE while the sheet is open and the member ends up on a screen
  // they did not ask for.
  // ==========================================================================
  it('closes on onRequestClose — Android hardware back', () => {
    const onClose = jest.fn();
    render(<Sheet {...BASE} open onClose={onClose} />);
    const modal = screen.UNSAFE_getByType(Modal);
    act(() => {
      (modal.props as { onRequestClose: () => void }).onRequestClose();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reaches under the status bar, which is what inset-0 requires', () => {
    render(<Sheet {...BASE} open onClose={jest.fn()} />);
    const modal = screen.UNSAFE_getByType(Modal);
    expect((modal.props as { statusBarTranslucent?: boolean }).statusBarTranslucent).toBe(true);
    expect((modal.props as { transparent?: boolean }).transparent).toBe(true);
    // RN's own slide would run a second, differently-timed animation over the
    // Reanimated one.
    expect((modal.props as { animationType?: string }).animationType).toBe('none');
  });

  // ==========================================================================
  // PITFALL 3. The cart sheet grows with its contents, and what leaves the
  // screen first is the bottom of the panel — which is the CTA. The footer is
  // therefore a SIBLING of the ScrollView, not a child of it.
  // ==========================================================================
  it('renders the footer OUTSIDE the scrolling body', () => {
    render(
      <Sheet
        {...BASE}
        open
        onClose={jest.fn()}
        footer={<RNText testID="cta">შეკვეთის განთავსება</RNText>}
      >
        <RNText testID="line">Whey Protein</RNText>
      </Sheet>,
    );
    const body = screen.getByTestId('sheet-body');
    // The line IS in the ScrollView...
    expect(within(body).getByTestId('line')).toBeTruthy();
    // ...and the CTA is NOT.
    expect(within(body).queryByTestId('cta')).toBeNull();
    expect(screen.getByTestId('cta')).toBeTruthy();
    expect(screen.getByTestId('sheet-footer')).toBeTruthy();
  });

  it('renders no body container at all when there is nothing to scroll', () => {
    render(<Sheet {...BASE} open onClose={jest.fn()} footer={<RNText>x</RNText>} />);
    expect(screen.queryByTestId('sheet-body')).toBeNull();
  });

  // ==========================================================================
  // PITFALL: THE GRABBER. Drag-to-dismiss is out of scope for v1, so a handle
  // that announces itself as draggable promises something the sheet does not
  // do. It is paint.
  // ==========================================================================
  it('keeps the grabber out of the accessibility tree', () => {
    render(<Sheet {...BASE} open onClose={jest.fn()} />);
    const grabber = screen.getByTestId('sheet-grabber', HIDDEN);
    expect(grabber.props.accessible).toBe(false);
    expect(grabber.props.accessibilityElementsHidden).toBe(true);
    expect(grabber.props.importantForAccessibility).toBe('no-hide-descendants');
    // And it is genuinely unreachable without the hidden-element escape hatch.
    expect(screen.queryByTestId('sheet-grabber')).toBeNull();
  });

  // ==========================================================================
  // PITFALL: `mounted` IS NOT `open`. Bind `Modal.visible` straight to `open`
  // and the native window is destroyed on the frame the close is requested —
  // the panel VANISHES rather than sliding out.
  // ==========================================================================
  it('keeps the panel mounted through the exit animation, then removes it', () => {
    jest.useFakeTimers();
    try {
      const view = render(<Sheet {...BASE} open onClose={jest.fn()} />);
      expect(view.getByTestId('sheet')).toBeTruthy();

      view.rerender(<Sheet {...BASE} open={false} onClose={jest.fn()} />);
      // Still there, mid-exit.
      expect(view.getByTestId('sheet')).toBeTruthy();

      act(() => {
        jest.advanceTimersByTime(SHEET_EXIT_MS + 1);
      });
      expect(view.queryByTestId('sheet', HIDDEN)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('re-opening mid-exit cancels the unmount rather than racing it', () => {
    jest.useFakeTimers();
    try {
      const view = render(<Sheet {...BASE} open onClose={jest.fn()} />);
      view.rerender(<Sheet {...BASE} open={false} onClose={jest.fn()} />);
      view.rerender(<Sheet {...BASE} open onClose={jest.fn()} />);
      act(() => {
        jest.advanceTimersByTime(SHEET_EXIT_MS * 3);
      });
      expect(view.getByTestId('sheet')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('forwards testID, style and className to the panel', () => {
    render(<Sheet {...BASE} open onClose={jest.fn()} style={{ marginTop: 7 }} className="mt-2" />);
    expect(flatten(screen.getByTestId('sheet').props.style).marginTop).toBe(7);
  });

  it('paints the panel on the surface colour at the page rung', () => {
    render(<Sheet {...BASE} open onClose={jest.fn()} />);
    const style = flatten(screen.getByTestId('sheet').props.style);
    expect(style.backgroundColor).toBe(darkColors.backgroundSurface);
    expect(style.borderTopLeftRadius).toBe(32);
    expect(style.borderTopRightRadius).toBe(32);
    // `pb-8` at inset 0. The safe-area arithmetic is asserted on Vitest.
    expect(style.paddingBottom).toBe(32);
  });
});

const CONFIRM = {
  title: 'ჯავშნის გაუქმება?',
  closeAccessibilityLabel: 'დახურვა',
  confirmLabel: 'გაუქმება',
  cancelLabel: 'დახურვა',
  testID: 'confirm',
} as const;

describe('ConfirmSheet', () => {
  it('renders the recap and the note it is given', () => {
    render(
      <ConfirmSheet
        {...CONFIRM}
        open
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        recapTitle="Spin Express"
        recapLines={['ხუთ · 18:00', 'Sandro K. · Main Floor']}
        note="გაუქმების ვადა გაკვეთილამდე 2 საათია."
      />,
    );
    expect(screen.getByText('Spin Express', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Sandro K. · Main Floor', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('confirm-note')).toBeTruthy();
  });

  it('renders no recap card when it has nothing to recap', () => {
    render(<ConfirmSheet {...CONFIRM} open onClose={jest.fn()} onConfirm={jest.fn()} />);
    expect(screen.queryByTestId('confirm-recap')).toBeNull();
  });

  // ==========================================================================
  // THE ONLY RED FILL IN THE MOBILE SET, and it is opt-in. A confirmation that
  // is red by default trains members to ignore red.
  // ==========================================================================
  it('fills the confirm button red only when destructive', () => {
    const plain = render(
      <ConfirmSheet {...CONFIRM} open onClose={jest.fn()} onConfirm={jest.fn()} />,
    );
    expect(flatten(plain.getByTestId('confirm-confirm').props.style).backgroundColor).toBe(
      darkColors.accent,
    );
    plain.unmount();

    render(
      <ConfirmSheet {...CONFIRM} open destructive onClose={jest.fn()} onConfirm={jest.fn()} />,
    );
    const style = flatten(screen.getByTestId('confirm-confirm').props.style);
    expect(style.backgroundColor).toBe(darkColors.error);
    // White on red — the artboard's `text-white`, and never the lime.
    expect(style.backgroundColor).not.toBe(darkColors.accent);
  });

  // WAS `flexBasis: 0` — "an equal half of the row, whatever the labels say".
  // That symmetry is the defect: see `SHARE` in `confirm-sheet.tsx`.
  it('lets both buttons share the row, sized from their own labels', () => {
    render(<ConfirmSheet {...CONFIRM} open onClose={jest.fn()} onConfirm={jest.fn()} />);
    for (const id of ['confirm-cancel', 'confirm-confirm']) {
      const style = flatten(screen.getByTestId(id).props.style);
      expect(style.flexGrow).toBe(1);
      expect(style.flexBasis).toBe('auto');
      // The artboards' `h-[52px]`.
      expect(style.height).toBe(52);
    }
  });

  it('cancel calls onClose, confirm calls onConfirm', () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();
    render(<ConfirmSheet {...CONFIRM} open onClose={onClose} onConfirm={onConfirm} />);
    fireEvent.press(screen.getByTestId('confirm-cancel'));
    fireEvent.press(screen.getByTestId('confirm-confirm'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // A DOUBLE TAP MUST NOT SEND TWO CANCELLATIONS. `busy` keeps the fill —
  // greying out on press reads as a rejection — and swallows the press in the
  // handler, reporting `{busy: true, disabled: false}`.
  // ==========================================================================
  it('busy confirm blocks a second press', () => {
    const onConfirm = jest.fn();
    const view = render(
      <ConfirmSheet {...CONFIRM} open onClose={jest.fn()} onConfirm={onConfirm} />,
    );
    fireEvent.press(view.getByTestId('confirm-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // The screen sets `busy` in response to that first press.
    view.rerender(
      <ConfirmSheet {...CONFIRM} open busy onClose={jest.fn()} onConfirm={onConfirm} />,
    );
    fireEvent.press(view.getByTestId('confirm-confirm'));
    fireEvent.press(view.getByTestId('confirm-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const state = view.getByTestId('confirm-confirm').props.accessibilityState as {
      busy?: boolean;
      disabled?: boolean;
    };
    expect(state.busy).toBe(true);
    // NOT disabled: a busy button says "I am working on it", not "you cannot".
    expect(state.disabled).toBe(false);
  });

  it('inherits the sheet chrome — scrim, hardware back and a modal panel', () => {
    const onClose = jest.fn();
    render(<ConfirmSheet {...CONFIRM} open onClose={onClose} onConfirm={jest.fn()} />);
    expect(screen.getByTestId('confirm').props.accessibilityViewIsModal).toBe(true);
    fireEvent.press(screen.getByTestId('confirm-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// THE FOOTER ROW, AND WHY A NESTED ROW IS A BUG.
//
// `Sheet` lays the footer slot out as a row itself. The classes filter sheet
// nested a second `<View style={{flexDirection:'row'}}>` inside it, which is
// content-width, so its children's `flexBasis: 0` resolved against nothing and
// both buttons collapsed to their padding — "ფილტრების გასუფთავება" shipped as
// an empty 40×44 grey square. The footer slot has to be a fragment.
// ===========================================================================
describe('the footer slot', () => {
  it('is the row itself — children lay out against the panel width', () => {
    render(
      <Sheet {...BASE} open onClose={jest.fn()} footer={<RNText>ok</RNText>}>
        <RNText>body</RNText>
      </Sheet>,
    );
    const row = flatten(screen.getByTestId('sheet-footer').props.style);
    expect(row.flexDirection).toBe('row');
  });

  // A pair of buttons that cannot fit side by side must STACK, not truncate.
  // `flexWrap` is the only way React Native can decide that without a
  // measurement pass, and it is inert for `flexBasis: 0` children.
  it('wraps, so a pair that does not fit takes two rows', () => {
    render(
      <Sheet {...BASE} open onClose={jest.fn()} footer={<RNText>ok</RNText>}>
        <RNText>body</RNText>
      </Sheet>,
    );
    expect(flatten(screen.getByTestId('sheet-footer').props.style).flexWrap).toBe('wrap');
  });
});

describe('ConfirmSheet — the split', () => {
  // THE DEFECT: `flexBasis: 0` gave the two buttons exactly equal halves
  // whatever their labels said, so the booking confirmation asked the member to
  // commit on a truncated "გაკვეთილის…" while "დახურვა" idled in an equally
  // wide half. `'auto'` starts each button at its own label width, which both
  // spends the row proportionally and lets the wrap above stack them.
  it('sizes each button from its own label, never at a fixed half', () => {
    render(
      <ConfirmSheet
        {...CONFIRM}
        open
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        confirmLabel="გაკვეთილის გაუქმება"
        cancelLabel="დახურვა"
      />,
    );
    for (const id of ['confirm-confirm', 'confirm-cancel']) {
      const style = flatten(screen.getByTestId(id).props.style);
      expect(style.flexBasis).toBe('auto');
      expect(style.flexGrow).toBe(1);
    }
  });
});
