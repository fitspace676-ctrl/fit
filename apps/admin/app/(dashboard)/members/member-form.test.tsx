import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { gymMemberIntakeSettingsSchema, updateMemberSchema } from '@fit/types';
import { MemberForm, type MemberFormInitial } from './member-form';
import { createMemberAction, updateMemberAction } from './actions';

/**
 * The console's active branch, as the top-bar switcher reports it. Hoisted so the
 * `vi.mock` factory below can close over it — vitest lifts `vi.mock` above the
 * imports, and the factory runs while `./member-form` is being imported.
 *
 * Empty by default, which is a gym with no branches on file: the form hides the
 * branch select entirely in that case, so every start-date spec below sees the
 * form exactly as it was before Stage 2.
 */
const activeLocation = vi.hoisted(() => ({
  locationId: undefined as string | undefined,
  locations: [] as { id: string; name: string }[],
}));

vi.mock('@/components/active-location', () => ({
  useActiveLocation: () => ({
    active: activeLocation.locationId ?? 'all',
    locationId: activeLocation.locationId,
    locations: activeLocation.locations,
    setActive: vi.fn(),
  }),
}));

/** Every branch the gym has, for the specs that need the select to render. */
const BRANCHES = [
  { id: 'loc-riverside', name: 'Riverside' },
  { id: 'loc-downtown', name: 'Downtown' },
];

/** Render inside the console's English catalogue, as the dashboard layout does. */
function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

vi.mock('./actions', () => ({
  createMemberAction: vi.fn(() =>
    Promise.resolve({ ok: true, data: { id: 'm-1', name: 'Ana', email: 'a@b.c', phone: null } }),
  ),
  updateMemberAction: vi.fn(() => Promise.resolve({ ok: true, data: { id: 'm-1' } })),
  listActivePlanOptionsAction: vi.fn(() => Promise.resolve([])),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

/** A member already on file, enrolled from the first of the month. */
const existing: MemberFormInitial = {
  name: 'Ana Beridze',
  email: 'ana@example.com',
  phone: '555000111',
  dateOfBirth: '1994-03-02',
  startDate: '2026-07-01',
  personalId: '01001000000',
  gender: 'FEMALE',
  address: 'Rustaveli 1',
  emergencyContactName: 'Nino',
  emergencyContactPhone: '555000222',
  medicalNotes: '',
  locationName: 'Riverside',
};

/** The one start-date input, whose label carries an "· Optional" suffix. */
function startDateInput(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(/Start date/);
}

describe('MemberForm — membership start date', () => {
  afterEach(() => vi.clearAllMocks());

  it('is editable on an existing member, seeded from the record', () => {
    // The field used to be create-only, which meant staff could SEE a mistyped
    // start date on the profile and had no way to correct it.
    renderWithIntl(<MemberForm mode="edit" memberId="m-1" initial={existing} />);

    expect(startDateInput().value).toBe('2026-07-01');
  });

  it('leaves the picker unbounded in edit mode', () => {
    // `startDatePolicy` bounds what a signed-out visitor may pick in the join
    // wizard; the API does not enforce it on the staff endpoints. Bounding this
    // input would re-impose a limit the server dropped and would block the very
    // case the field exists for — fixing a date that has already passed.
    renderWithIntl(<MemberForm mode="edit" memberId="m-1" initial={existing} />);

    const input = startDateInput();
    expect(input.getAttribute('min')).toBeNull();
    expect(input.getAttribute('max')).toBeNull();
    expect(input.required).toBe(false);
  });

  it('clears the recorded date to null when the box is emptied', async () => {
    renderWithIntl(<MemberForm mode="edit" memberId="m-1" initial={existing} />);

    fireEvent.change(startDateInput(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateMemberAction).toHaveBeenCalledTimes(1));
    const [id, input] = vi.mocked(updateMemberAction).mock.calls[0]!;
    expect(id).toBe('m-1');
    // Asserted through the contract the API parses the body with, not just on the
    // wire value: `editableText` is what turns the emptied box into the `null`
    // that actually clears the column, and that is the behaviour under test.
    expect(updateMemberSchema.parse(input).startDate).toBeNull();
  });

  it('sends a corrected date on save', async () => {
    renderWithIntl(<MemberForm mode="edit" memberId="m-1" initial={existing} />);

    fireEvent.change(startDateInput(), { target: { value: '2026-08-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateMemberAction).toHaveBeenCalledTimes(1));
    const [, input] = vi.mocked(updateMemberAction).mock.calls[0]!;
    expect(updateMemberSchema.parse(input).startDate).toBe('2026-08-15');
  });
});

describe('MemberForm — start date on create', () => {
  afterEach(() => vi.clearAllMocks());

  it('is hidden while the gym does not ask for it', () => {
    // Off by default: a gym enrolling people on the spot has no use for the
    // question, and the API defaults the enrolment to today.
    renderWithIntl(<MemberForm mode="create" intake={gymMemberIntakeSettingsSchema.parse({})} />);

    expect(screen.queryByLabelText(/Start date/)).toBeNull();
  });

  it('is bounded by the gym’s window once the gym does ask for it', () => {
    renderWithIntl(
      <MemberForm
        mode="create"
        intake={gymMemberIntakeSettingsSchema.parse({ startDate: true })}
        startDateWindow={{ min: '2026-08-31', max: '2026-09-14' }}
      />,
    );

    const input = startDateInput();
    expect(input.getAttribute('min')).toBe('2026-08-31');
    expect(input.getAttribute('max')).toBe('2026-09-14');
    // A toggle that is on means "ask for this", not "offer a box staff may ignore".
    expect(input.required).toBe(true);
  });

  it('stays outside the enrolment block the till hides', () => {
    // The POS drawer passes `enrolment={false}`. A field the gym has made
    // required but the till's operator cannot see would make registering a
    // walk-in impossible — so this one must survive that block being hidden.
    renderWithIntl(
      <MemberForm
        mode="create"
        enrolment={false}
        intake={gymMemberIntakeSettingsSchema.parse({ startDate: true })}
        startDateWindow={{ min: '2026-08-31', max: '2026-09-14' }}
      />,
    );

    expect(startDateInput()).toBeTruthy();
    expect(screen.queryByLabelText(/Membership plan/)).toBeNull();
  });

  it('sends the chosen day with the create', async () => {
    renderWithIntl(
      <MemberForm
        mode="create"
        enrolment={false}
        intake={gymMemberIntakeSettingsSchema.parse({
          startDate: true,
          phone: false,
          gender: false,
          dateOfBirth: false,
          personalId: false,
          address: false,
          emergencyContact: false,
        })}
        startDateWindow={{ min: '2026-08-31', max: '2026-09-14' }}
      />,
    );

    // The Astryx `TextInput` appends its own "∙ Required" marker to the label,
    // so these match on the label's leading words rather than the whole string.
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ana@example.com' } });
    fireEvent.change(startDateInput(), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create member' }));

    await waitFor(() => expect(createMemberAction).toHaveBeenCalledTimes(1));
    const [input] = vi.mocked(createMemberAction).mock.calls[0]!;
    expect(input.startDate).toBe('2026-09-01');
  });
});

describe('MemberForm — the member’s home branch', () => {
  afterEach(() => {
    vi.clearAllMocks();
    activeLocation.locationId = undefined;
    activeLocation.locations = [];
  });

  /** The branch select, labelled with the same word the top-bar switcher uses. */
  function branchSelect(): HTMLSelectElement {
    return screen.getByLabelText<HTMLSelectElement>(/^Location/);
  }

  it('is hidden for a gym with no branches on file', () => {
    // A select with nothing in it is worse than no select — the same guard the
    // till's "Selling at" control uses.
    renderWithIntl(<MemberForm mode="create" />);

    expect(screen.queryByLabelText(/^Location/)).toBeNull();
  });

  it('pre-fills the branch the console is scoped to, and sends it', async () => {
    // Someone who has switched the whole console to Riverside is enrolling at
    // Riverside; defaulting elsewhere is how a walk-in lands at the wrong branch.
    activeLocation.locations = BRANCHES;
    activeLocation.locationId = 'loc-riverside';
    renderWithIntl(
      <MemberForm
        mode="create"
        enrolment={false}
        intake={gymMemberIntakeSettingsSchema.parse({
          phone: false,
          gender: false,
          dateOfBirth: false,
          personalId: false,
          address: false,
          emergencyContact: false,
        })}
      />,
    );

    expect(branchSelect().value).toBe('loc-riverside');

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ana@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create member' }));

    await waitFor(() => expect(createMemberAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createMemberAction).mock.calls[0]![0].locationId).toBe('loc-riverside');
  });

  it('leaves the branch to the API in "All locations" mode', async () => {
    // Nothing is guessed client-side: the API is the only party that knows which
    // branch is the gym's default (`Location.isDefault`), so the field is simply
    // omitted and that fallback does the work.
    activeLocation.locations = BRANCHES;
    renderWithIntl(
      <MemberForm
        mode="create"
        enrolment={false}
        intake={gymMemberIntakeSettingsSchema.parse({
          phone: false,
          gender: false,
          dateOfBirth: false,
          personalId: false,
          address: false,
          emergencyContact: false,
        })}
      />,
    );

    expect(branchSelect().value).toBe('');

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ana@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create member' }));

    await waitFor(() => expect(createMemberAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createMemberAction).mock.calls[0]![0].locationId).toBeUndefined();
  });

  it('never pre-selects a branch on edit, whatever the switcher is on', async () => {
    // THE DANGEROUS CASE. Opening a Downtown member's profile while the console is
    // scoped to Riverside must not propose a transfer, or a staffer fixing a phone
    // number carries one through with the save.
    activeLocation.locations = BRANCHES;
    activeLocation.locationId = 'loc-riverside';
    renderWithIntl(
      <MemberForm mode="edit" memberId="m-1" initial={{ ...existing, locationName: 'Downtown' }} />,
    );

    expect(branchSelect().value).toBe('');
    // The "no change" option is worded around the branch they are at, rather than
    // repeating its bare name — two identical-looking entries in one select is a
    // list a reader has to guess at.
    // (The wording itself is asserted structurally rather than by string: it is a
    // `form.locationKeep` message that has yet to land in the catalogues.)
    expect(branchSelect().options[0]!.value).toBe('');
    expect(screen.getAllByRole('option', { name: 'Downtown' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateMemberAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateMemberAction).mock.calls[0]![1].locationId).toBeUndefined();
  });

  it('transfers the member when a branch is picked on edit', async () => {
    activeLocation.locations = BRANCHES;
    renderWithIntl(
      <MemberForm mode="edit" memberId="m-1" initial={{ ...existing, locationName: 'Downtown' }} />,
    );

    fireEvent.change(branchSelect(), { target: { value: 'loc-riverside' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateMemberAction).toHaveBeenCalledTimes(1));
    const [, input] = vi.mocked(updateMemberAction).mock.calls[0]!;
    expect(updateMemberSchema.parse(input).locationId).toBe('loc-riverside');
  });
});
