import { DEFAULT_TIMEZONE, MIDNIGHT_CLOSE, type WeeklyHours } from '@fit/types';
import { fetchGymSettings } from '@/lib/api';

/** Fallback window when a gym is marked closed every day, or settings are unreadable. */
const FALLBACK_OPEN_HOUR = 8;
const FALLBACK_CLOSE_HOUR = 20;

/** What a calendar needs from the gym before it can draw a week. */
export interface GymCalendarContext {
  /** The gym's IANA zone — every clock on the calendar is read on it. */
  timeZone: string;
  /** Earliest opening hour across the week's open days. */
  openHour: number;
  /** Latest closing hour across the week's open days. */
  closeHour: number;
}

/** `"HH:MM"` → whole hours, rounding the way a grid row needs it. */
function toHour(time: string, round: 'floor' | 'ceil'): number | null {
  const [h, m] = time.split(':').map(Number);
  if (h === undefined || m === undefined || !Number.isFinite(h) || !Number.isFinite(m)) return null;
  const minutes = h * 60 + m;
  return round === 'floor' ? Math.floor(minutes / 60) : Math.ceil(minutes / 60);
}

/**
 * The hours a calendar grid should span, taken from Settings → Business hours.
 *
 * The gym already states when it is open; a calendar that invents its own bounds
 * is a second answer to that question. Days marked closed contribute nothing, so
 * a gym that shuts on Sunday does not stretch the grid to cover it. The opening
 * hour rounds down and the closing hour up, so a 09:30–17:30 day still draws
 * whole 09:00 and 17:00 rows.
 */
export function businessHourRange(hours: WeeklyHours): {
  openHour: number;
  closeHour: number;
} {
  let openHour = 24;
  let closeHour = 0;

  for (const day of Object.values(hours)) {
    if (!day || day.closed) continue;
    const open = toHour(day.open, 'floor');
    // `00:00` closes the day at midnight, so the grid has to run to hour 24 — read
    // literally it would be hour 0 and collapse the whole window.
    const close = day.close === MIDNIGHT_CLOSE ? 24 : toHour(day.close, 'ceil');
    if (open === null || close === null) continue;
    if (open < openHour) openHour = open;
    if (close > closeHour) closeHour = close;
  }

  if (openHour >= closeHour) {
    return { openHour: FALLBACK_OPEN_HOUR, closeHour: FALLBACK_CLOSE_HOUR };
  }
  return { openHour, closeHour: Math.min(24, closeHour) };
}

/**
 * The gym's zone and opening window, for the console views that draw a calendar.
 *
 * A gym's schedule is written in its own wall time — a 09:00 class means 09:00 at
 * the gym — while the server renders in UTC and the API stores instants. Any view
 * that turns those instants back into a day column or a time label has to do it
 * on the gym's clock, or a UTC+4 gym reads its 11:00 class as 07:00 and, in the
 * hours after local midnight, sees the whole of last week.
 *
 * Falls back to the platform defaults when the gym has never saved settings, or
 * when the call fails: a calendar drawn on a default window is wrong by an
 * offset, whereas a calendar that throws is not a calendar at all.
 */
export async function gymCalendarContext(): Promise<GymCalendarContext> {
  try {
    const settings = await fetchGymSettings();
    return {
      timeZone: settings.locale.timezone || DEFAULT_TIMEZONE,
      ...businessHourRange(settings.hours),
    };
  } catch {
    return {
      timeZone: DEFAULT_TIMEZONE,
      openHour: FALLBACK_OPEN_HOUR,
      closeHour: FALLBACK_CLOSE_HOUR,
    };
  }
}
