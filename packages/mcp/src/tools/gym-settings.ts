import { updateGymSettingsSchema } from '@fit/types';
import { defineTools } from './shared';

/** Tenant-scoped endpoints in apps/api/src/gyms/gym-settings.controller.ts. */
export const gymSettingsTools = defineTools('settings', [
  {
    name: 'get_gym_settings',
    title: 'Get gym settings',
    titleKa: 'დარბაზის პარამეტრები',
    description:
      "Read the gym's settings: name and branding, portal theme, language and locale, opening hours, policies and guest or trial prices. Use before update_gym_settings.",
    method: 'get',
    path: '/gyms/settings',
  },
  {
    name: 'update_gym_settings',
    title: 'Update gym settings',
    titleKa: 'დარბაზის პარამეტრების შეცვლა',
    description:
      "Change the gym's branding, portal theme, language, opening hours or policies, including guest and trial prices, and return the new settings. Read get_gym_settings first.",
    method: 'patch',
    path: '/gyms/settings',
    destructive: true,
    body: updateGymSettingsSchema,
  },
]);
