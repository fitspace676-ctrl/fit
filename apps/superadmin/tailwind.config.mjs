import preset from '@fit/config/tailwind';

/**
 * SuperAdmin Tailwind config — extends the shared @fit/config theme tokens so
 * brand colors, typography, spacing, and radii stay consistent across surfaces.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  presets: [preset],
  content: ['./app/**/*.{ts,tsx,mdx}', './components/**/*.{ts,tsx,mdx}'],
};
