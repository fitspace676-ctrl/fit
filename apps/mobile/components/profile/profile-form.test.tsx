// The profile editor's transforms.
//
// `profilePatch` is the reason this file exists. Everything else here is a
// guard rail; that one function is the contract with a `.strict()` PATCH whose
// three phone cases are indistinguishable in the response — send the wrong one
// and the member's number is silently wiped, or silently kept, and no error is
// raised either way.
//
// A `.test.tsx` under jest-expo rather than a `.spec.ts` under Vitest, even
// though nothing here renders: `vitest.config.ts` includes only `lib/**` and
// `hooks/**`, so a spec under `components/` would be run by neither. Same
// placement as `components/goals/goal-editor.test.tsx`, for the same reason.

import type { MeProfile } from '@fit/types';

import { ApiError } from '../../lib/http/api-error';
import {
  NAME_MAX,
  PHONE_MAX,
  draftErrors,
  isValidDraft,
  profileErrorKey,
  profilePatch,
  toDraft,
} from './profile-form';

function profile(overrides: Partial<MeProfile> = {}): MeProfile {
  return {
    userId: 'user_1',
    name: 'ანა გელაშვილი',
    email: 'ana@example.com',
    phone: '+995 555 10 20 30',
    ...overrides,
  };
}

describe('toDraft', () => {
  it('renders a null name or phone as an empty box, not as "null"', () => {
    expect(toDraft(profile({ name: null, phone: null }))).toEqual({ name: '', phone: '' });
  });

  it('survives a profile that has not loaded', () => {
    expect(toDraft(undefined)).toEqual({ name: '', phone: '' });
  });
});

// ===========================================================================
// THE PATCH. Only what moved, and `null` when nothing did.
// ===========================================================================
describe('profilePatch', () => {
  it('is null when neither field moved', () => {
    const me = profile();
    expect(profilePatch(toDraft(me), me)).toBeNull();
  });

  it('sends only the field that changed', () => {
    const me = profile();
    expect(profilePatch({ name: 'ანა ბერიძე', phone: me.phone ?? '' }, me)).toEqual({
      name: 'ანა ბერიძე',
    });
    expect(profilePatch({ name: me.name ?? '', phone: '+995 599 00 11 22' }, me)).toEqual({
      phone: '+995 599 00 11 22',
    });
  });

  it('sends both when both changed', () => {
    expect(profilePatch({ name: 'ნინო', phone: '555' }, profile())).toEqual({
      name: 'ნინო',
      phone: '555',
    });
  });

  // ------------------------------------------------------------------------
  // The three phone cases a single `value || null` collapses into one.
  // ------------------------------------------------------------------------
  it('clears a phone with an explicit null', () => {
    expect(profilePatch({ name: 'ანა გელაშვილი', phone: '   ' }, profile())).toEqual({
      phone: null,
    });
  });

  it('omits the phone entirely when there was none to clear', () => {
    // `phone: null` here would be a write that changes nothing — and it is the
    // request the web portal sends on every save.
    expect(profilePatch({ name: 'ანა გელაშვილი', phone: '' }, profile({ phone: null }))).toBeNull();
  });

  it('omits an untouched phone rather than re-sending it', () => {
    const me = profile();
    expect(profilePatch({ name: 'ნინო', phone: me.phone ?? '' }, me)).toEqual({ name: 'ნინო' });
  });

  // ------------------------------------------------------------------------
  // Trimming, on both sides — the schema trims, so a trailing space is not a
  // change and must not produce a request.
  // ------------------------------------------------------------------------
  it('treats surrounding whitespace as no change', () => {
    const me = profile();
    expect(
      profilePatch({ name: `  ${me.name ?? ''} `, phone: ` ${me.phone ?? ''}  ` }, me),
    ).toBeNull();
  });

  it('trims what it does send', () => {
    expect(profilePatch({ name: '  ნინო  ', phone: '  555  ' }, profile())).toEqual({
      name: 'ნინო',
      phone: '555',
    });
  });

  // ------------------------------------------------------------------------
  // A name cannot be cleared — `min(1)`, and not nullable.
  // ------------------------------------------------------------------------
  it('never sends an empty name', () => {
    // The form refuses this case before it gets here (`draftErrors` → 'cleared'),
    // and the patch refuses it again: `name: ''` is a 400.
    expect(profilePatch({ name: '   ', phone: '555' }, profile())).toEqual({ phone: '555' });
  });

  it('lets a member with no name save a phone without inventing one', () => {
    expect(profilePatch({ name: '', phone: '555' }, profile({ name: null, phone: null }))).toEqual({
      phone: '555',
    });
  });

  it('is null before the profile has loaded, so no blind write is possible', () => {
    expect(profilePatch({ name: 'ნინო', phone: '555' }, undefined)).toBeNull();
  });
});

// ===========================================================================
// The errors the member sees, per field.
// ===========================================================================
describe('draftErrors', () => {
  it('is clean for an unchanged profile', () => {
    const me = profile();
    expect(draftErrors(toDraft(me), me)).toEqual({ name: null, phone: null });
    expect(isValidDraft(toDraft(me), me)).toBe(true);
  });

  it('reports a name the member emptied, because no request can clear one', () => {
    expect(draftErrors({ name: '  ', phone: '555' }, profile()).name).toBe('cleared');
    expect(isValidDraft({ name: '', phone: '555' }, profile())).toBe(false);
  });

  it('does NOT report an empty name on a member who never had one', () => {
    const nameless = profile({ name: null });
    expect(draftErrors({ name: '', phone: '555' }, nameless).name).toBeNull();
    expect(isValidDraft({ name: '', phone: '555' }, nameless)).toBe(true);
  });

  it('reports the two length caps the schema enforces', () => {
    const me = profile();
    expect(draftErrors({ name: 'ა'.repeat(NAME_MAX), phone: '' }, me).name).toBeNull();
    expect(draftErrors({ name: 'ა'.repeat(NAME_MAX + 1), phone: '' }, me).name).toBe('tooLong');
    expect(draftErrors({ name: 'ნინო', phone: '5'.repeat(PHONE_MAX) }, me).phone).toBeNull();
    expect(draftErrors({ name: 'ნინო', phone: '5'.repeat(PHONE_MAX + 1) }, me).phone).toBe(
      'tooLong',
    );
  });

  it('measures the caps after trimming, as the schema does', () => {
    expect(
      draftErrors({ name: `  ${'ა'.repeat(NAME_MAX)}  `, phone: '' }, profile()).name,
    ).toBeNull();
  });
});

// ===========================================================================
// Failures are read by `code`, never by status.
// ===========================================================================
describe('profileErrorKey', () => {
  it('points a signed-out save at the sign-in sentence', () => {
    expect(profileErrorKey(new ApiError({ status: 401, code: 'UNAUTHENTICATED' }))).toBe(
      'member.profile.saveAuth',
    );
    expect(profileErrorKey(new ApiError({ status: 403, code: 'SESSION_REQUIRED' }))).toBe(
      'member.profile.saveAuth',
    );
  });

  it('falls back to one sentence for everything else', () => {
    expect(profileErrorKey(new ApiError({ status: 400, code: 'VALIDATION_ERROR' }))).toBe(
      'member.profile.saveError',
    );
    expect(profileErrorKey(new ApiError({ status: 0, code: 'NETWORK_ERROR' }))).toBe(
      'member.profile.saveError',
    );
    expect(profileErrorKey(new Error('boom'))).toBe('member.profile.saveError');
  });
});
