// @fit/types — the admin dashboard's tab list.
//
// This was a widget CATALOGUE: segments whose contents a gym could choose from a
// picker, each widget a named reference to a Reports drill-down section. Every
// segment outgrew that shape within one iteration — each of the six tabs now
// answers questions no report section had — so the indirection, its picker, its
// API and its stored rows have gone.
//
// What is left is the list of tabs and the `?segment=` contract, which is all the
// shell ever needed. Adding a tab now means writing its view, its contract and its
// service: exactly what the last five took, and what the catalogue was supposed to
// save and never did.

import { z } from 'zod';

/** Every dashboard tab, in display order. Each renders its own hand-built view. */
export const DASHBOARD_SEGMENTS = [
  'overview',
  'sales',
  'members',
  'revenue',
  'classes',
  'staff',
] as const;

export const dashboardSegmentSchema = z.enum(DASHBOARD_SEGMENTS);
export type DashboardSegment = z.infer<typeof dashboardSegmentSchema>;

/** The tab shown when `?segment=` is absent or unrecognised. */
export const DEFAULT_DASHBOARD_SEGMENT: DashboardSegment = 'overview';
