import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequestPricingModal } from './lead-modals';

/** Stub `fetch` with a JSON response and hand back the spy. */
function stubFetch(status: number, payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Fill both required fields of the pricing form. */
async function fillForm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('Full name'), 'Giorgi');
  await user.type(screen.getByLabelText('Work email'), 'giorgi@gym.ge');
}

describe('RequestPricingModal', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders nothing until it is opened', () => {
    render(<RequestPricingModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks for a name and an email, and nothing else', () => {
    render(<RequestPricingModal open onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toBeRequired();
    expect(screen.getByLabelText('Work email')).toHaveAttribute('type', 'email');
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument();
  });

  it('posts the lead and swaps to the thank-you view', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(201, { id: 'lead-1' });
    render(<RequestPricingModal open onClose={vi.fn()} />);

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Request pricing' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/leads');
    expect(JSON.parse(init.body as string)).toMatchObject({
      type: 'pricing',
      name: 'Giorgi',
      email: 'giorgi@gym.ge',
    });
    expect(await screen.findByText(/get back to you shortly with pricing/i)).toBeVisible();
  });

  it('keeps the form up and shows the reason when the submission fails', async () => {
    const user = userEvent.setup();
    stubFetch(429, { message: 'Too many requests — please slow down.' });
    render(<RequestPricingModal open onClose={vi.fn()} />);

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Request pricing' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    // Still the form, not the thank-you — so the visitor can correct and retry.
    expect(screen.getByLabelText('Work email')).toHaveValue('giorgi@gym.ge');
  });

  it('sends once when the button is clicked twice in a row', async () => {
    const user = userEvent.setup();
    let release: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchMock);
    render(<RequestPricingModal open onClose={vi.fn()} />);

    await fillForm(user);
    const submit = screen.getByRole('button', { name: 'Request pricing' });
    await user.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(new Response(JSON.stringify({ id: 'lead-1' }), { status: 201 }));
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RequestPricingModal open onClose={onClose} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});
