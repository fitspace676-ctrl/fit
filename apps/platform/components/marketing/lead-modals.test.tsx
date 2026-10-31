import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl as render } from '@/test/render-with-intl';
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

/** A field's label, with or without the asterisk a required field carries. */
const label = (text: string): RegExp => new RegExp(`^${text}\\*?$`);

/** Fill every required field of the call form. */
async function fillForm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText(label('Name')), 'Giorgi');
  await user.type(screen.getByLabelText(label('Surname')), 'Beridze');
  await user.type(screen.getByLabelText(label('Phone')), '555 12 34 56');
  await user.type(screen.getByLabelText(label('Email')), 'giorgi@gym.ge');
  await user.type(screen.getByLabelText(label('Company name')), 'Gym One');
  await user.selectOptions(screen.getByLabelText(label('Category')), 'Yoga studio');
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

  it('requires everything but the member count, and stars only the required labels', () => {
    render(<CallModal open onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(label('Name'))).toBeRequired();
    expect(screen.getByLabelText(label('Surname'))).toBeRequired();
    expect(screen.getByLabelText(label('Phone'))).toBeRequired();
    expect(screen.getByLabelText(label('Phone'))).toHaveAttribute('type', 'tel');
    expect(screen.getByLabelText(label('Country code'))).toHaveValue('+995');
    expect(screen.getByLabelText(label('Email'))).toBeRequired();
    expect(screen.getByLabelText(label('Email'))).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText(label('Company name'))).toBeRequired();
    expect(screen.getByLabelText(label('Category'))).toBeRequired();
    expect(screen.getByLabelText(label('Active members'))).not.toBeRequired();
    expect(screen.getByRole('option', { name: 'Other' })).toBeInTheDocument();
    // name, surname, phone, email and company; three pickers are comboboxes
    expect(screen.getAllByRole('textbox')).toHaveLength(5);
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    // six required labels carry an asterisk; the optional member count does not
    expect(screen.getAllByText('*')).toHaveLength(6);
    expect(screen.queryByText(/optional/i)).not.toBeInTheDocument();
  });

  it('posts the lead and swaps to the thank-you view', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(201, { id: 'lead-1' });
    render(<CallModal open onClose={vi.fn()} />);

    await fillForm(user);
    await user.selectOptions(screen.getByLabelText(label('Country code')), '+374');
    await user.selectOptions(screen.getByLabelText(label('Active members')), '100-300');
    await user.click(screen.getByRole('button', { name: 'Request a call' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/leads');
    expect(JSON.parse(init.body as string)).toMatchObject({
      type: 'call',
      name: 'Giorgi Beridze',
      phone: '+374 555 12 34 56',
      email: 'giorgi@gym.ge',
      business: 'Gym One',
      message: 'Category: Yoga studio\nActive members: 100-300',
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
    expect(screen.getByLabelText(label('Email'))).toHaveValue('giorgi@gym.ge');
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
