import { z } from 'zod';

export const LEGACY_TIMING_OFFSETS = {
  '7_days_before': '-7d',
  '4_days_before': '-4d',
  '2_days_before': '-2d',
  day_of: '0d',
  '1_day_after': '1d',
  '3_days_after': '3d',
} as const;

export type AutomationTimingOffset = string;
const canonical = (value: string): string =>
  Object.prototype.hasOwnProperty.call(LEGACY_TIMING_OFFSETS, value)
    ? LEGACY_TIMING_OFFSETS[value as keyof typeof LEGACY_TIMING_OFFSETS]
    : value;

export const automationTimingOffsetSchema = z.string().refine((value) => {
  const normalized = canonical(value);
  if (!/^-?\d{1,4}[dh]$/.test(normalized)) return false;
  const amount = Math.abs(Number(normalized.slice(0, -1)));
  return amount <= (normalized.endsWith('d') ? 365 : 8760);
}, 'Invalid automation timing offset');

export function parseTimingOffset(value: string): { amount: number; unit: 'd' | 'h'; ms: number } {
  const normalized = canonical(automationTimingOffsetSchema.parse(value));
  const amount = Number(normalized.slice(0, -1));
  const unit = normalized.slice(-1) as 'd' | 'h';
  return { amount, unit, ms: amount * (unit === 'd' ? 86400000 : 3600000) };
}

export function formatTimingOffset(amount: number, unit: 'd' | 'h'): string {
  return automationTimingOffsetSchema.parse(`${amount}${unit}`);
}

export function normalizeTimingOffset(value: string): string {
  const { amount, unit } = parseTimingOffset(value);
  return formatTimingOffset(amount, unit);
}

export function timingOffsetDays(value: string): number {
  return Math.floor(parseTimingOffset(value).ms / 86400000);
}

export interface AutomationTimingMeta {
  value: AutomationTimingOffset;
  label: string;
  days: number;
}

export const AUTOMATION_TIMING_PRESETS: readonly AutomationTimingMeta[] = [
  { value: '-7d', label: '7 days before', days: -7 },
  { value: '-4d', label: '4 days before', days: -4 },
  { value: '-2d', label: '2 days before', days: -2 },
  { value: '0d', label: 'Day of', days: 0 },
  { value: '1d', label: '1 day after', days: 1 },
  { value: '3d', label: '3 days after', days: 3 },
];

/** @deprecated Use AUTOMATION_TIMING_PRESETS. Retained for existing builder consumers. */
export const AUTOMATION_TIMING_CATALOG = AUTOMATION_TIMING_PRESETS;
