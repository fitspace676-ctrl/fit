// @fit/mobile — the profile editor, as a pure transform.
//
// ===========================================================================
// `PATCH /me/profile` IS A PATCH, AND THAT SHAPES THE WHOLE SCREEN.
//
// `useAccountMutations.ts` states the rule this module exists to keep:
//
//   > Send only the fields that changed — the schema is `.strict()` and the
//   > endpoint writes exactly what it is given. `phone: null` clears the
//   > number; omitting `phone` leaves it. A form must not collapse those two
//   > into one request.
//
// {@link profilePatch} is where that rule lives. It diffs the draft against
// the profile the server last answered with and emits **only** the keys that
// actually moved — so an untouched phone is absent from the body rather than
// re-sent, and a cleared phone is an explicit `null`. Those are two different
// requests and the type system cannot tell them apart; this function can.
//
// The web member portal does the opposite (`apps/web/src/components/member/
// profile/profile-screen.tsx`): it sends `phone` on **every** save, changed or
// not, and `name` whenever the field is non-empty. That is not a divergence
// this app copies — it is the behaviour the mutation hook's doc comment warns
// against, and it is why "nothing changed" is a state this screen can name.
//
// ---------------------------------------------------------------------------
// WHAT A MEMBER MAY CHANGE HERE, AND WHY IT IS ONLY TWO THINGS.
//
// `updateMeProfileSchema` is `{ name?, phone? }` and `.strict()`, so any other
// key is a 400. The web form renders six inputs — first name, last name,
// email, phone, emergency contact, address — and three of them (email,
// emergency, address) are **discarded before the request**: the member types
// into them, gets a success toast, and `router.refresh()` puts the old values
// back. Rebuilding that here would be rebuilding a known bug, so this screen
// shows exactly the two writable fields plus a read-only email that says, in
// words, that it is read-only.
//
// Name is ONE field here, not a first/last pair. The wire has one `name`
// column; the web form splits it on the first space and rejoins it on save,
// which mangles "ანა მარია გელაშვილი" into first "ანა" / last "მარია
// გელაშვილი" and silently normalises any run of spaces. One field cannot.
//
// ---------------------------------------------------------------------------
// A NAME CANNOT BE CLEARED, AND THAT IS THE API'S RULE, NOT A UI PREFERENCE.
//
// `name` is `z.string().trim().min(1).max(200).optional()` — optional, but NOT
// nullable. There is no request that removes a name. So blanking the field on
// a member who HAS a name is a state the server cannot accept, and the form
// says so rather than silently keeping the old value (which is what web does).
// A member who has never had a name — a social sign-in that carried none — may
// still save a phone number with the name field left empty, because in that
// case the empty field asks for nothing and the patch simply omits `name`.
//
// Pure, and therefore testable without a renderer — the same reason
// `components/goals/goal-editor.ts` is a module rather than a hook.

import type { MeProfile, UpdateMeProfileInput } from '@fit/types';
import { ApiError } from '../../lib/http/api-error';
import type { MessageKey } from '../../lib/i18n/keys';

/** `name: z.string().trim().min(1).max(200)`. */
export const NAME_MAX = 200;

/** `phone: z.string().trim().max(40).nullable()`. No format check server-side. */
export const PHONE_MAX = 40;

/** The two editable fields, as typed. */
export interface ProfileDraft {
  readonly name: string;
  readonly phone: string;
}

/** The server's profile as editable text. `null` is an empty box, not "null". */
export function toDraft(profile: MeProfile | undefined): ProfileDraft {
  return { name: profile?.name ?? '', phone: profile?.phone ?? '' };
}

/** Why a field would be refused, or `null` when it would not. */
export interface ProfileDraftErrors {
  /**
   * `'cleared'` — the profile has a name and the box is now empty, which no
   * request can express. `'tooLong'` — over {@link NAME_MAX} after trimming.
   */
  readonly name: 'cleared' | 'tooLong' | null;
  /** `'tooLong'` — over {@link PHONE_MAX} after trimming. Empty is legal: it clears. */
  readonly phone: 'tooLong' | null;
}

/**
 * Which field the server would refuse, and for which reason.
 *
 * Answers the question the MEMBER has, not the one the Save button has — see
 * `goal-editor.ts`'s `draftErrors` for the same split and the same reason: a
 * disabled button swallows its own press and can never say why.
 */
export function draftErrors(
  draft: ProfileDraft,
  profile: MeProfile | undefined,
): ProfileDraftErrors {
  const name = draft.name.trim();
  const phone = draft.phone.trim();
  const had = (profile?.name ?? '').trim() !== '';

  return {
    name: name === '' ? (had ? 'cleared' : null) : name.length > NAME_MAX ? 'tooLong' : null,
    phone: phone.length > PHONE_MAX ? 'tooLong' : null,
  };
}

/** Is the draft something the server would accept? */
export function isValidDraft(draft: ProfileDraft, profile: MeProfile | undefined): boolean {
  const errors = draftErrors(draft, profile);
  return errors.name === null && errors.phone === null;
}

/**
 * The `PATCH /me/profile` body — **only the fields that changed** — or `null`
 * when nothing did.
 *
 * The three cases `phone` has to keep apart, which a single `phone: value ||
 * null` collapses:
 *
 *   * untouched → the key is **absent**, and the stored number is left alone;
 *   * emptied on a member who has one → `phone: null`, which clears it;
 *   * emptied on a member who has none → **absent** again, because there is
 *     nothing to clear and `phone: null` would be a write that changes nothing.
 *
 * `name` is compared against the server's value *after trimming both sides*,
 * because the schema trims: typing a trailing space is not a change, and
 * sending it would be a request whose response equals its input.
 *
 * Returns `null` rather than `{}` for "nothing changed". An empty `.strict()`
 * body is a legal 200 that writes nothing, so the distinction cannot come back
 * from the server — the screen has to make it, and a nullable return is how it
 * is made unmissable.
 */
export function profilePatch(
  draft: ProfileDraft,
  profile: MeProfile | undefined,
): UpdateMeProfileInput | null {
  if (profile === undefined) return null;

  const name = draft.name.trim();
  const phone = draft.phone.trim();
  const currentName = (profile.name ?? '').trim();
  const currentPhone = (profile.phone ?? '').trim();

  const patch: UpdateMeProfileInput = {
    // `name` is never sent empty — `min(1)` refuses it and there is no way to
    // clear a name at all. `draftErrors` reports that as `'cleared'`; here it
    // simply means the key is omitted.
    ...(name !== '' && name !== currentName ? { name } : {}),
    ...(phone === currentPhone
      ? {}
      : phone === ''
        ? // Reachable only when `currentPhone` is non-empty, by the equality
          // above — so this is always a real clear, never a null write on a
          // profile that had no number.
          { phone: null }
        : { phone }),
  };

  return Object.keys(patch).length === 0 ? null : patch;
}

/**
 * The catalogue key for a failed save.
 *
 * By `code`, never by status — `apps/api`'s exception filter decouples the two
 * deliberately, and `message` is server-authored prose. The same argument
 * `components/classes/booking-errors.ts` makes at length.
 *
 * `member.profile.saveAuth` / `saveError` are the web portal's own two
 * sentences, already translated, and this screen reuses them rather than
 * authoring a second pair that would drift.
 */
export function profileErrorKey(error: unknown): MessageKey {
  if (!ApiError.is(error)) return 'member.profile.saveError';

  switch (error.code) {
    case 'UNAUTHENTICATED':
    case 'UNAUTHORIZED':
    case 'SESSION_REQUIRED':
      return 'member.profile.saveAuth';
    default:
      // Covers `VALIDATION_ERROR` (which the form's own rules should have
      // caught first), `PROFILE_NOT_FOUND`, every 5xx and every transport
      // failure. There is no per-field detail to render: the filter answers
      // with `details: string[]` of server-authored English.
      return 'member.profile.saveError';
  }
}
