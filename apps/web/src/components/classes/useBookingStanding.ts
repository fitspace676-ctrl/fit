'use client';
import { useEffect, useState } from 'react';
import type { MemberBookingStanding } from '@fit/types';
import { bookingStandingAction } from '@/app/actions/bookings';
export function useBookingStanding(refresh?: unknown) {
  const [standing, setStanding] = useState<MemberBookingStanding | null>(null);
  useEffect(() => {
    let live = true;
    const refreshStanding = async () => {
      try { const value = await bookingStandingAction(); if (live) setStanding(value); } catch { /* Optional metadata. */ }
    };
    const onFocus = () => { void refreshStanding(); };
    onFocus();
    window.addEventListener('focus', onFocus);
    return () => { live = false; window.removeEventListener('focus', onFocus); };
  }, [refresh]);
  return standing;
}
