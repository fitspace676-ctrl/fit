// @fit/admin — shared role metadata for the staff screen.
//
// One place for the assignable-role list, display labels, and the per-role badge
// tones/dots from the Planflow "formacore" reference, so the table, the invite
// modal, and the pending-invites list can never drift on how a role is rendered.

import { Permission, type StaffRole } from '@fit/types';
import type { Tone } from '@/components/ui';

/** The roles a staff member can hold, high-to-low privilege, with their labels. */
export const ROLE_OPTIONS: ReadonlyArray<{ value: StaffRole; label: string }> = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'RECEPTIONIST', label: 'Receptionist' },
  { value: 'TRAINER', label: 'Trainer' },
];

/** The display label for a staff role. */
export function roleLabel(role: StaffRole): string {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

/** Badge tone per role (reference: Owner iris, Manager brand, Trainer accent…). */
export const ROLE_TONE: Record<StaffRole, Tone> = {
  OWNER: 'iris',
  MANAGER: 'brand',
  RECEPTIONIST: 'success',
  TRAINER: 'accent',
};

/** The role-picker dot colour per role — static classes so Tailwind can see them. */
export const ROLE_DOT: Record<StaffRole, string> = {
  OWNER: 'bg-iris-400',
  MANAGER: 'bg-brand-400',
  RECEPTIONIST: 'bg-success-400',
  TRAINER: 'bg-accent-400',
};

/** Human-readable copy for each capability, used to explain what a role grants or loses. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.GymManage]: 'Manage gym settings',
  [Permission.StaffManage]: 'Invite & manage staff',
  [Permission.MemberRead]: 'View members',
  [Permission.MemberWrite]: 'Add & edit members',
  [Permission.TrainerRead]: 'View trainers',
  [Permission.TrainerWrite]: 'Add & edit trainers',
  [Permission.LocationRead]: 'View locations',
  [Permission.LocationWrite]: 'Add & edit locations',
  [Permission.ProductRead]: 'View products',
  [Permission.ProductWrite]: 'Add & edit products',
  [Permission.PackageRead]: 'View package plans',
  [Permission.PackageWrite]: 'Add & edit package plans',
  [Permission.ClassRead]: 'View classes',
  [Permission.ClassWrite]: 'Add & edit classes',
  [Permission.ClassBook]: 'Book classes',
  [Permission.ReviewWrite]: 'Write reviews',
  [Permission.ReviewModerate]: 'Moderate reviews',
  [Permission.NotificationManage]: 'Manage push notifications',
  [Permission.BillingRead]: 'View billing',
  [Permission.BillingManage]: 'Manage billing & plans',
  [Permission.SubscriptionManage]: 'Freeze & resume own membership',
  [Permission.CreditPackManage]: 'Buy & view own class credits',
  [Permission.WorkoutRead]: 'View workout plans',
  [Permission.WorkoutWrite]: 'Create & assign workouts',
  [Permission.ReportView]: 'View reports',
  [Permission.AuditRead]: 'View audit log',
  [Permission.ProfileManage]: 'Edit own profile',
};
