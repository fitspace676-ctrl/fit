import nativewind from 'nativewind/preset';
import preset from '@fit/config/tailwind';

/**
 * Mobile Tailwind config — layers the NativeWind preset (so `className` works
 * on React Native primitives) over the shared `@fit/config` theme tokens, so
 * brand colors, typography, spacing, and radii match every other Fit surface.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [nativewind, preset],
};
