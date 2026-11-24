'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_TIMEZONE } from '@fit/types';

const GymTimeZoneContext = createContext<string>(DEFAULT_TIMEZONE);

/** Server-seeded gym zone: SSR and hydration always use the same clock. */
export function GymTimeZoneProvider({
  timeZone,
  children,
}: {
  timeZone: string;
  children: ReactNode;
}) {
  return <GymTimeZoneContext.Provider value={timeZone}>{children}</GymTimeZoneContext.Provider>;
}

export function useGymTimeZone(): string {
  return useContext(GymTimeZoneContext);
}
