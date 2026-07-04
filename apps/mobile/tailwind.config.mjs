import nativewind from 'nativewind/preset';
import base from '@fit/config/tailwind';
import mobile from '@fit/ui-mobile/tailwind';

/**
 * Mobile Tailwind config — layers the NativeWind preset (so `className` works on
 * React Native primitives) over the shared `@fit/config` base, then the
 * `@fit/ui-mobile` formacore tokens (full palette + field/btn/card/pill radii).
 * `mobile` comes last so its formacore brand + palette win, giving the Expo
 * screens the SAME design tokens as the web console and member portal.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    // Generate the utility classes used by the shared mobile design-system
    // package so its components render fully styled here (T1.10). Scoped to the
    // package's actual sources (`index.ts` + `src/`) rather than a bare `**` so
    // Tailwind doesn't scan its `node_modules` — the broad glob triggered a
    // content-configuration perf warning on every Metro build/export.
    '../../packages/ui-mobile/index.ts',
    '../../packages/ui-mobile/src/**/*.{ts,tsx}',
  ],
  presets: [nativewind, base, mobile],
};
