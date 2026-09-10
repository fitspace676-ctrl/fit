// @fit/mobile — typing a calendar day on a phone, with no native picker.
//
// ===========================================================================
// WHY A MASKED TEXT FIELD AND NOT A DATE PICKER.
//
// `apps/web` renders its own `<DateField>` with a month grid — 40-odd keys of
// calendar copy behind it (`checkout.details.calendar.*`). Mobile has no
// equivalent, and the two obvious ways to get one are both wrong here:
//
//   * `@react-native-community/datetimepicker` is not in the dependency set,
//     and adding a NATIVE module means a new EAS dev-client build for every
//     developer on the project — WP-0 deliberately took every native dep in one
//     build, and this is not on that list.
//   * `<input type="date">` has no React Native equivalent at all.
//
// So the two dates this form can ask for — a birthday and a membership start —
// are typed. The catalogue already has the copy for exactly that:
// `checkout.details.fields.datePlaceholder` is `"dd.mm.yyyy"`, which is a
// TYPING format, not a calendar's. It was authored for a form that types.
//
// The mask exists because the wire format and the reading format differ.
// `memberSignupSchema` wants `YYYY-MM-DD`; a Georgian (or British) buyer reads
// and types day-first. Asking them to type ISO would be asking them to think in
// the server's units. So: digits in, `dd.mm.yyyy` on screen, ISO in the state.
//
// All of it is pure, and pinned by `date-mask.test.tsx`, because an off-by-one
// in a slice here is a birthday silently shifted by a month.
// ===========================================================================

/** How many digits a complete `ddmmyyyy` entry has. */
const DIGITS = 8;

/**
 * Keep the digits, drop everything else, and re-insert the separators.
 *
 * Called on every keystroke, so it must be idempotent over its own output:
 * `maskDayInput(maskDayInput(x)) === maskDayInput(x)`. It is, because the dots
 * are stripped before they are re-added — which is also what makes BACKSPACE
 * work. Deleting the dot in `01.0` leaves `010`, which re-masks to `01.0`; the
 * caret would stick. Deleting a DIGIT leaves `01.` → `010`… no: stripping
 * non-digits from `01.` gives `01`, which masks back to `01`. The separator is
 * therefore never re-added ahead of the digit that earns it.
 */
export function maskDayInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, DIGITS);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

/**
 * The `YYYY-MM-DD` a complete `dd.mm.yyyy` entry means, or `''`.
 *
 * `''` for anything short of eight digits — an incomplete entry is UNANSWERED,
 * not invalid, and the difference matters: `signupBodyFor` omits an empty
 * optional field, while a half-typed one would be sent and rejected as a 400.
 *
 * It does NOT range-check. `31.02.2026` comes back as `2026-02-31`, which is a
 * well-formed string the API's own validator refuses. That split is deliberate:
 * this function is about the two notations, and the calendar is the server's
 * (and `isStartDateWithinPolicy`'s) business.
 */
export function isoFromDayInput(display: string): string {
  const digits = display.replace(/\D/g, '');
  if (digits.length !== DIGITS) return '';
  return `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}

/** The `dd.mm.yyyy` an ISO day reads as, or `''` for anything else. */
export function dayInputFromIso(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (match === null) return '';
  return `${match[3]}.${match[2]}.${match[1]}`;
}
