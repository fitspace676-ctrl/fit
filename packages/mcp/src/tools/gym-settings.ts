import { updateGymSettingsSchema, updateMobileAppSettingsSchema } from '@fit/types';
import { defineTools } from './shared';

/** Tenant-scoped endpoints in apps/api/src/gyms/gym-settings.controller.ts and
 * apps/api/src/gyms/mobile-app-settings.controller.ts (image uploads stay out). */
export const gymSettingsTools = defineTools('settings', [
  {
    name: 'get_gym_settings',
    title: 'Get gym settings',
    titleKa: 'დარბაზის პარამეტრები',
    description:
      "Read the gym's settings: name and branding, portal theme, language, opening hours, policies and guest or trial prices. Use before update_gym_settings; the member mobile app is get_mobile_app_settings.",
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
  {
    name: 'get_mobile_app_settings',
    title: 'Get mobile app settings',
    titleKa: 'მობილური აპის პარამეტრები',
    description:
      'Read the member mobile app configuration (admin page /app-settings): enabled, feature tabs, accent colour and login image url. Distinct from gym settings and portal theme, which are get_gym_settings.',
    method: 'get',
    path: '/gyms/app-settings',
  },
  {
    name: 'update_mobile_app_settings',
    title: 'Update mobile app settings',
    titleKa: 'მობილური აპის პარამეტრების შეცვლა',
    description:
      "Change the member mobile app's feature tabs or accent colour (null follows the portal colour) and return the new settings. Read get_mobile_app_settings first; images cannot be changed here.",
    method: 'patch',
    path: '/gyms/app-settings',
    destructive: false,
    body: updateMobileAppSettingsSchema,
  },
]);
