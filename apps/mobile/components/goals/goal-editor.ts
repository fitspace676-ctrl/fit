// @fit/mobile — the goal set, as a form.
//
// ===========================================================================
// `PUT /me/goals` IS A REPLACE, NOT A PATCH, AND THAT SHAPES THE WHOLE SCREEN.
//
// The body **is** the new set: a goal missing from the array is deleted, and
// `{ goals: [] }` clears them all. There is no per-goal create, update or
// delete route. So the screen holds the whole set in local state, edits it, and
// writes it back in one request — a "save" model, not a "live" one — and every
// edit below is a pure transform over a draft array.
//
// The server caps the set at **8** (`putMeGoalsSchema`), and `target` must be
// POSITIVE while `current` may be zero. Both are enforced here so the member
// meets a disabled Save rather than a 400.
//
// Pure, and therefore testable without a renderer — the same reason
// `components/classes/schedule.ts` is a module rather than a hook.

import type { MeGoal, PutMeGoalsInput } from '@fit/types';

/** The server's cap on the goal set. `putMeGoalsSchema` rejects a ninth. */
export const MAX_GOALS = 8;

/** One row of the editor. Numbers are strings while being typed. */
export interface GoalDraft {
  /** Stable across edits, so React keys and the row's `testID` do not shuffle. */
  readonly key: string;
  readonly label: string;
  /** As typed. `''` is a legal intermediate state and an illegal payload. */
  readonly current: string;
  readonly target: string;
  readonly unit: string;
}

let seq = 0;

/** A fresh, empty row. */
export function emptyGoal(): GoalDraft {
  seq += 1;
  return { key: `new-${String(seq)}`, label: '', current: '0', target: '', unit: '' };
}

/** The server's goals as editable rows. */
export function toDrafts(goals: readonly MeGoal[] | undefined): GoalDraft[] {
  return (goals ?? []).map((goal) => ({
    key: goal.id,
    label: goal.label,
    current: String(goal.current),
    target: String(goal.target),
    unit: goal.unit,
  }));
}

/**
 * A number as the schema will read it, or `null` when it will not.
 *
 * Deliberately strict: `Number('')` is `0` and `Number(' ')` is `0`, so a blank
 * target would silently post zero and be refused as non-positive — an error the
 * member cannot see the cause of. An empty string is `null` here instead, which
 * is what disables Save.
 */
export function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Is this row something the server will accept? */
export function isValidDraft(draft: GoalDraft): boolean {
  if (draft.label.trim() === '') return false;
  const current = parseAmount(draft.current);
  const target = parseAmount(draft.target);
  if (current === null || target === null) return false;
  // `current` is `nonnegative`, `target` is `positive`.
  return current >= 0 && target > 0;
}

/** Which of a row's three fields the server would refuse. */
export interface GoalDraftErrors {
  /** `label` is required and is trimmed before it is sent. */
  readonly label: boolean;
  /** `current` is `nonnegative`, and a blank is not zero. */
  readonly current: boolean;
  /** `target` is `positive` — the field `emptyGoal()` starts blank. */
  readonly target: boolean;
}

/**
 * WHICH field is wrong, not merely THAT the row is.
 *
 * `isValidDraft` answers the question Save needs; this answers the one the
 * MEMBER needs. `emptyGoal()` starts with `target: ''` and `isValidDraft`
 * requires a positive target, so a freshly added row is invalid the moment it
 * appears — and a disabled `Button` swallows its own press, so it can never
 * say which of the three boxes is the reason. This is what lets the screen
 * point at it.
 */
export function draftErrors(draft: GoalDraft): GoalDraftErrors {
  const current = parseAmount(draft.current);
  const target = parseAmount(draft.target);
  return {
    label: draft.label.trim() === '',
    current: current === null || current < 0,
    target: target === null || target <= 0,
  };
}

/** Is the whole draft set writable? An EMPTY set is valid — it clears them. */
export function isValidSet(drafts: readonly GoalDraft[]): boolean {
  return drafts.length <= MAX_GOALS && drafts.every(isValidDraft);
}

/** The draft set as the `PUT /me/goals` body. Call only when {@link isValidSet}. */
export function toPayload(drafts: readonly GoalDraft[]): PutMeGoalsInput {
  return {
    goals: drafts.map((draft) => ({
      label: draft.label.trim(),
      current: parseAmount(draft.current) ?? 0,
      target: parseAmount(draft.target) ?? 1,
      unit: draft.unit.trim(),
    })),
  };
}

/** `0`–`1`, for the row's progress bar. `0` when the target is unreadable. */
export function goalFraction(draft: GoalDraft): number {
  const current = parseAmount(draft.current) ?? 0;
  const target = parseAmount(draft.target);
  if (target === null || target <= 0) return 0;
  return Math.min(1, Math.max(0, current / target));
}
