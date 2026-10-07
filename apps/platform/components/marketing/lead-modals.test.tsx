import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallModal } from './lead-modals';

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

/** Fill every required field of the call form. */
async function fillForm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('Name'), 'Giorgi');
  await user.type(screen.getByLabelText('Surname'), 'Beridze');
  await user.type(screen.getByLabelText('Phone'), '555 12 34 56');
  await user.type(screen.getByLabelText('Email'), 'giorgi@gym.ge');
}

describe('CallModal', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders nothing until it is opened', () => {
    render(<CallModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('requires name, surname, phone and email; the member count is optional', () => {
    render(<CallModal open onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeRequired();
    expect(screen.getByLabelText('Surname')).toBeRequired();
    expect(screen.getByLabelText('Phone')).toBeRequired();
    expect(screen.getByLabelText('Phone')).toHaveAttribute('type', 'tel');
    expect(screen.getByLabelText('Country code')).toHaveValue('+995');
    expect(screen.getByLabelText('Email')).toBeRequired();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Active members')).not.toBeRequired();
    // name, surname, phone and email; the two pickers are comboboxes
    expect(screen.getAllByRole('textbox')).toHaveLength(4);
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('posts the lead and swaps to the thank-you view', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(201, { id: 'lead-1' });
    render(<CallModal open onClose={vi.fn()} />);

    await fillForm(user);
    await user.selectOptions(screen.getByLabelText('Country code'), '+374');
    await user.selectOptions(screen.getByLabelText('Active members'), '100-300');
    await user.click(screen.getByRole('button', { name: 'Request a call' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/leads');
    expect(JSON.parse(init.body as string)).toMatchObject({
      type: 'call',
      name: 'Giorgi Beridze',
      phone: '+374 555 12 34 56',
      email: 'giorgi@gym.ge',
      message: 'Active members: 100-300',
    });
    expect(await screen.findByText(/will call you back shortly/i)).toBeVisible();
  });

  it('keeps the form up and shows the reason when the submission fails', async () => {
    const user = userEvent.setup();
    stubFetch(429, { message: 'Too many requests — please slow down.' });
    render(<CallModal open onClose={vi.fn()} />);

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Request a call' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    // Still the form, not the thank-you — so the visitor can correct and retry.
    expect(screen.getByLabelText('Email')).toHaveValue('giorgi@gym.ge');
  });

  it('sends once when the button is clicked twice in a row', async () => {
    const user = userEvent.setup();
    let release: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchMock);
    render(<CallModal open onClose={vi.fn()} />);

    await fillForm(user);
    const submit = screen.getByRole('button', { name: 'Request a call' });
    await user.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(new Response(JSON.stringify({ id: 'lead-1' }), { status: 201 }));
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CallModal open onClose={onClose} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});
