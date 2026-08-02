// @fit/types — the wall-clock time primitive shared across scheduling contracts.
//
// A leaf module on purpose. Both the staff schedule (`ShiftSlot`) and a class
// template's start time are naive `HH:mm` clock readings interpreted in the
// gym's own timezone, and both are compared as strings — so they must validate
// identically. Importing one domain module from the other to share it created a
// require cycle that type-checked cleanly and then threw
// `ReferenceError: timeOfDaySchema is not defined` at boot, so the primitive
// lives here where neither side owns it.

import { z } from 'zod';

/** A wall-clock time as `HH:mm` (24-hour), e.g. `09:00` / `18:30`. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm (24-hour)');
