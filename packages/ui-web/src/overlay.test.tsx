// @vitest-environment jsdom
//
// Behaviour tests for the overlay kit (T9.6): the portalled scrim mounts only
// while open, closes on Esc and backdrop click (unless disabled), locks body
// scroll, and — the focus trap this task adds — moves focus into the dialog,
// cycles Tab within it, and restores focus to the trigger on close.

import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { Drawer, Modal, Overlay, focusableElements } from './overlay';

/** The aria-hidden scrim button behind the panel. */
function backdrop(): HTMLElement {
  const el = screen.getByRole('dialog').querySelector('[aria-hidden="true"]');
  if (!(el instanceof HTMLElement)) throw new Error('backdrop not found');
  return el;
}

describe('focusableElements', () => {
  it('collects tabbable children and skips tabindex="-1" / aria-hidden nodes', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <button>ok</button>
      <button tabindex="-1" aria-hidden="true">scrim</button>
      <a href="#go">link</a>
      <input disabled />
      <input />
    `;
    const found = focusableElements(root).map((el) => el.tagName.toLowerCase());
    expect(found).toEqual(['button', 'a', 'input']);
  });

  it('returns an empty list for a null root', () => {
    expect(focusableElements(null)).toEqual([]);
  });
});

describe('Overlay — mount & close affordances', () => {
  it('renders nothing when closed and portals the dialog when open', () => {
    const { rerender } = render(
      <Overlay open={false} onClose={vi.fn()} label="Test">
        <p>Panel body</p>
      </Overlay>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(
      <Overlay open onClose={vi.fn()} label="Test">
        <p>Panel body</p>
      </Overlay>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Test');
    // Portalled to document.body, not nested in the caller's tree.
    expect(dialog.parentElement).toBe(document.body);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Overlay open onClose={onClose} label="Test">
        <p>Body</p>
      </Overlay>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on a backdrop click', () => {
    const onClose = vi.fn();
    render(
      <Overlay open onClose={onClose} label="Test">
        <p>Body</p>
      </Overlay>,
    );
    fireEvent.click(backdrop());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close on backdrop click when disableBackdropClose is set', () => {
    const onClose = vi.fn();
    render(
      <Overlay open onClose={onClose} label="Test" disableBackdropClose>
        <p>Body</p>
      </Overlay>,
    );
    fireEvent.click(backdrop());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks body scroll while open and restores it on close', () => {
    const { rerender } = render(
      <Overlay open onClose={vi.fn()} label="Test">
        <p>Body</p>
      </Overlay>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <Overlay open={false} onClose={vi.fn()} label="Test">
        <p>Body</p>
      </Overlay>,
    );
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

describe('Overlay — focus trap', () => {
  it('moves focus into the dialog when it opens', () => {
    render(
      <Modal open onClose={vi.fn()} title="Edit">
        <button>Inside</button>
      </Modal>,
    );
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('cycles Tab from the last control back to the first', () => {
    render(
      <Modal open onClose={vi.fn()} title="Edit" hideClose>
        <button>First</button>
        <button>Last</button>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });

    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('cycles Shift+Tab from the first control to the last', () => {
    render(
      <Modal open onClose={vi.fn()} title="Edit" hideClose>
        <button>First</button>
        <button>Last</button>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });

    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('restores focus to the trigger after the dialog closes', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Edit">
            <button>Inside</button>
          </Modal>
        </>
      );
    }
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    // Focus is now inside the dialog.
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);

    // Close via the built-in close button; focus returns to the trigger.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('Drawer', () => {
  it('renders its title as the dialog label and closes via the close button', () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Class detail">
        <p>Roster</p>
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Class detail' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
