// @fit/admin — the Roles & permissions editor (Settings › Roles & permissions).
//
// Three things this screen must never get wrong, pinned here because each of them
// fails silently rather than loudly:
//
//   • OWNER is inert. Every box ticked, every control disabled, and no entry in
//     the values the form submits. An owner who can untick their own `gym:manage`
//     locks the gym out of this screen permanently, and nobody — including them —
//     can undo it.
//   • A single-column resource draws ONE control, not a live checkbox beside a
//     greyed ghost. `staff:manage` grants reading and changing together, so a
//     second cell would read as a Manage the gym is not allowed rather than a
//     Manage that does not exist.
//   • Un-ticking actually removes the capability from the row the form sends, and
//     nothing else moves with it except the coupling the screen states out loud.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { z } from 'zod';
import { EDITABLE_PERMISSIONS, Permission, defaultGymRolePermissions } from '@fit/types';
import { FormProvider, useZodForm, type UseFormReturn } from '@/components/ui';
import {
  RolePermissionsSection,
  permissionsFormDefaults,
  permissionsFormSchema,
  type PermissionsFormValues,
} from './role-permissions-panel';

const schema = z.object({ permissions: permissionsFormSchema });
type HostValues = z.infer<typeof schema>;

/** The settings form, reduced to the one slice this screen writes. */
function Harness({
  onForm,
  counts = { OWNER: 1, MANAGER: 2, RECEPTIONIST: 3, TRAINER: 4 },
}: {
  onForm: (form: UseFormReturn<HostValues>) => void;
  counts?: Parameters<typeof RolePermissionsSection>[0]['staffCountByRole'];
}) {
  const form = useZodForm(schema, {
    defaultValues: { permissions: permissionsFormDefaults(defaultGymRolePermissions()) },
  });
  onForm(form);
  return (
    <FormProvider {...form}>
      {/* The real screen learns it is dirty through the settings form's SaveBar,
          which reads `isDirty` during ITS render — react-hook-form only tracks a
          formState field that something subscribed to, so the flag has to be read
          in a render here too or it never updates. */}
      <p data-testid="dirty">{form.formState.isDirty ? 'dirty' : 'clean'}</p>
      <RolePermissionsSection staffCountByRole={counts} />
    </FormProvider>
  );
}

function renderEditor(counts?: Parameters<typeof RolePermissionsSection>[0]['staffCountByRole']) {
  const held: { form: UseFormReturn<HostValues> | null } = { form: null };
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Harness onForm={(form) => (held.form = form)} counts={counts} />
    </NextIntlClientProvider>,
  );
  return {
    grants: (role: keyof PermissionsFormValues): Permission[] =>
      held.form!.getValues(`permissions.${role}`).grants,
    values: (): PermissionsFormValues => held.form!.getValues('permissions'),
    isDirty: (): boolean => screen.getByTestId('dirty').textContent === 'dirty',
  };
}

/**
 * Pick a role off the rail. Anchored on the role NAME because the panel's reset
 * control is also a button reading "Reset Manager to…" — matching loosely would
 * silently click the wrong one the moment a test selects a role twice.
 */
async function selectRole(name: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: new RegExp('^' + name) }));
}

describe('RolePermissionsSection — OWNER is locked', () => {
  it('opens on OWNER and disables every control on it', () => {
    renderEditor();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box).toBeChecked();
      expect(box).toBeDisabled();
    }
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
  });

  it('draws the padlock and says why the screen is inert', () => {
    renderEditor();
    expect(screen.getAllByLabelText(en.admin.settings.permissions.lockedAria).length).toBe(1);
    expect(screen.getByText(en.admin.settings.permissions.ownerNoticeTitle)).toBeInTheDocument();
  });

  it('offers no reset on OWNER — there is nothing to reset it to but itself', () => {
    renderEditor();
    expect(screen.queryByText(en.admin.settings.permissions.reset)).not.toBeInTheDocument();
  });

  it('keeps OWNER out of the values the form submits entirely', () => {
    const editor = renderEditor();
    expect(Object.keys(editor.values()).sort()).toEqual(['MANAGER', 'RECEPTIONIST', 'TRAINER']);
  });

  it('shows OWNER as holding every editable capability', () => {
    renderEditor();
    const total = en.admin.settings.permissions.granted
      .replace('{granted}', '')
      .replace('{total}', '');
    expect(total).toBeTruthy();
    // 25 editable capabilities today; the label is rendered from the contract, so
    // the assertion is that granted === total rather than a pinned number.
    expect(screen.getByText(/^(\d+)\/\1 granted$/)).toBeInTheDocument();
  });
});

describe('RolePermissionsSection — the matrix', () => {
  it('gives a single-column resource one wide toggle, not a greyed second cell', async () => {
    renderEditor();
    await selectRole('Manager');
    // `staff:manage` grants read and write together — one control, spanning both
    // columns, labelled as full access.
    expect(screen.getByLabelText('Staff — Full access')).toBeInTheDocument();
    expect(screen.queryByLabelText('Staff — View')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Staff — Manage')).not.toBeInTheDocument();
    // …and a two-column resource still has both.
    expect(screen.getByLabelText('Members — View')).toBeInTheDocument();
    expect(screen.getByLabelText('Members — Manage')).toBeInTheDocument();
  });

  it('renders one cell per column and no more', async () => {
    renderEditor();
    await selectRole('Trainer');
    // Ten two-column rows and five single-column ones — which is exactly the
    // editable vocabulary, one control per capability and no control without one.
    expect(screen.getAllByRole('checkbox')).toHaveLength(10 * 2 + 5);
    expect(screen.getAllByRole('checkbox')).toHaveLength(EDITABLE_PERMISSIONS.length);
  });
});

describe('RolePermissionsSection — editing round-trips', () => {
  it('un-ticks a capability out of the row the form will send', async () => {
    const editor = renderEditor();
    expect(editor.isDirty()).toBe(false);
    await selectRole('Manager');
    expect(editor.grants('MANAGER')).toContain(Permission.MemberWrite);

    await userEvent.click(screen.getByLabelText('Members — Manage'));

    expect(editor.grants('MANAGER')).not.toContain(Permission.MemberWrite);
    // View is untouched: the coupling only runs downhill.
    expect(editor.grants('MANAGER')).toContain(Permission.MemberRead);
    expect(editor.isDirty()).toBe(true);
    expect(screen.getByLabelText('Members — Manage')).not.toBeChecked();
  });

  it('takes Manage with it when View goes off — and brings it back with Manage', async () => {
    const editor = renderEditor();
    await selectRole('Manager');

    await userEvent.click(screen.getByLabelText('Members — View'));
    expect(editor.grants('MANAGER')).not.toContain(Permission.MemberRead);
    expect(editor.grants('MANAGER')).not.toContain(Permission.MemberWrite);

    await userEvent.click(screen.getByLabelText('Members — Manage'));
    expect(editor.grants('MANAGER')).toContain(Permission.MemberWrite);
    expect(editor.grants('MANAGER')).toContain(Permission.MemberRead);
  });

  it('toggles a single-column resource through its one control', async () => {
    const editor = renderEditor();
    await selectRole('Manager');
    expect(editor.grants('MANAGER')).toContain(Permission.StaffManage);

    await userEvent.click(screen.getByLabelText('Staff — Full access'));
    expect(editor.grants('MANAGER')).not.toContain(Permission.StaffManage);
  });

  it('edits one role without touching the others', async () => {
    const editor = renderEditor();
    const before = [...editor.grants('TRAINER')];
    await selectRole('Manager');
    await userEvent.click(screen.getByLabelText('Members — Manage'));
    expect(editor.grants('TRAINER')).toEqual(before);
  });

  it('changes the branch scope through the radio group', async () => {
    const editor = renderEditor();
    await selectRole('Manager');
    expect(editor.values().MANAGER.branchScope).toBe('all');

    await userEvent.click(
      screen.getByRole('radio', {
        name: new RegExp(en.admin.settings.permissions.branchScope.assigned.title),
      }),
    );
    expect(editor.values().MANAGER.branchScope).toBe('assigned');
  });

  it('returns a role to the built-in defaults on reset', async () => {
    const editor = renderEditor();
    await selectRole('Receptionist');
    const before = [...editor.grants('RECEPTIONIST')];

    await userEvent.click(screen.getByLabelText('Members — View'));
    expect(editor.grants('RECEPTIONIST')).not.toEqual(before);

    await userEvent.click(screen.getByText(en.admin.settings.permissions.reset));
    expect(editor.grants('RECEPTIONIST')).toEqual(before);
  });
});

describe('RolePermissionsSection — the staff head-count', () => {
  it('renders the roster tally beside each role', () => {
    renderEditor({ OWNER: 1, MANAGER: 2, RECEPTIONIST: 0, TRAINER: 4 });
    expect(screen.getByRole('button', { name: /^Owner .*1 staff member\b/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Manager .*2 staff members/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Receptionist .*0 staff members/ }),
    ).toBeInTheDocument();
  });

  it('draws no count at all when the roster could not be read', () => {
    renderEditor(null);
    expect(screen.queryByText(/staff member/)).not.toBeInTheDocument();
  });
});
