import { z } from 'zod';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from './auth';
import { HEX_COLOR_PATTERN } from './gym-settings';
import { locationHoursSchema } from './locations-admin';

export const GYM_ONBOARDING_STEPS = [
  'account',
  'business',
  'brand',
  'location',
  'payments',
] as const;
export type GymOnboardingStep = (typeof GYM_ONBOARDING_STEPS)[number];
export const gymOnboardingStepSchema = z.enum(GYM_ONBOARDING_STEPS);
export type GymOnboardingStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';

export const gymOnboardingAccountSchema = z
  .object({
    ownerName: z.string().trim().min(1).max(100),
    password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  })
  .strict();
export const gymOnboardingBusinessSchema = z
  .object({
    gymName: z.string().trim().min(1).max(100),
    address: z.string().max(200).nullable(),
    phone: z.string().max(40).nullable(),
    email: z.string().email().nullable(),
    website: z.string().max(200).nullable(),
  })
  .strict();
export const gymOnboardingBrandSchema = z
  .object({
    primaryColor: z.string().regex(HEX_COLOR_PATTERN),
  })
  .strict();
export const gymOnboardingLocationSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    address: z.string().trim().max(200),
    phone: z.string().max(40).nullable(),
    hours: locationHoursSchema,
  })
  .strict();
export const gymOnboardingPaymentsSchema = z
  .object({
    acceptCash: z.boolean(),
    acceptCard: z.boolean(),
    acceptBankTransfer: z.boolean(),
    acceptPrepaidCredits: z.boolean(),
  })
  .strict();
export const GYM_ONBOARDING_STEP_SCHEMAS: Record<GymOnboardingStep, z.ZodTypeAny> = {
  account: gymOnboardingAccountSchema,
  business: gymOnboardingBusinessSchema,
  brand: gymOnboardingBrandSchema,
  location: gymOnboardingLocationSchema,
  payments: gymOnboardingPaymentsSchema,
};
export type GymOnboardingAccountInput = z.infer<typeof gymOnboardingAccountSchema>;
export type GymOnboardingBusinessInput = z.infer<typeof gymOnboardingBusinessSchema>;
export type GymOnboardingBrandInput = z.infer<typeof gymOnboardingBrandSchema>;
export type GymOnboardingLocationInput = z.infer<typeof gymOnboardingLocationSchema>;
export type GymOnboardingPaymentsInput = z.infer<typeof gymOnboardingPaymentsSchema>;

export interface GymOnboardingState {
  status: GymOnboardingStatus;
  gym: { name: string; subdomainSlug: string };
  owner: { email: string; name: string | null; hasPassword: boolean };
  steps: GymOnboardingStep[];
  completedSteps: GymOnboardingStep[];
  values: {
    business: GymOnboardingBusinessInput;
    brand: GymOnboardingBrandInput;
    location: GymOnboardingLocationInput;
    payments: GymOnboardingPaymentsInput;
  };
  expiresAt: string;
  completedAt: string | null;
}
export interface CompleteGymOnboardingResponse {
  email: string;
}
export interface AdminGymOnboarding {
  status: GymOnboardingStatus;
  token: string | null;
  completedSteps: GymOnboardingStep[];
  totalSteps: number;
  expiresAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}
export const ONBOARDING_LINK_INVALID_CODE = 'ONBOARDING_LINK_INVALID';
export const ONBOARDING_LINK_EXPIRED_CODE = 'ONBOARDING_LINK_EXPIRED';
export const ONBOARDING_COMPLETED_CODE = 'ONBOARDING_COMPLETED';
export const ONBOARDING_ACCOUNT_ALREADY_SET_CODE = 'ONBOARDING_ACCOUNT_ALREADY_SET';
export const ONBOARDING_ACCOUNT_REQUIRED_CODE = 'ONBOARDING_ACCOUNT_REQUIRED';
