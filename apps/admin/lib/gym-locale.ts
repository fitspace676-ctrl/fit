import { cache } from 'react';
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE, isValidTimeZone } from '@fit/types';
import { fetchGymSettings } from '@/lib/api';

/** One settings read per server render, shared by layout and server pages. */
export const getGymLocale = cache(async () => {
  try {
    const { locale } = await fetchGymSettings();
    return {
      currency: locale.currency,
      timeZone: isValidTimeZone(locale.timezone) ? locale.timezone : DEFAULT_TIMEZONE,
    };
  } catch {
    return { currency: DEFAULT_CURRENCY, timeZone: DEFAULT_TIMEZONE };
  }
});

export async function getGymTimeZone(): Promise<string> {
  return (await getGymLocale()).timeZone;
}
