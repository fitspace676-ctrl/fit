// Per-gym app variants.
//
// `app.json` is the FormaCore app. A gym that ships under its own name and icon is
// the same code built with `APP_VARIANT=<key>`: the variant swaps the store
// identity (name, bundle id / package), the icon, the adaptive icon and the splash
// mark. Which gym the build signs in to is separate — `EXPO_PUBLIC_GYM_SLUG` — and
// the in-app logo follows `EXPO_PUBLIC_APP_VARIANT` (see components/auth/auth-screen.tsx).
// Both are set next to `APP_VARIANT` in the variant's `eas.json` profile.

/** @type {Record<string, { name: string; id: string; assets: string; iconBackground: string }>} */
const VARIANTS = {
  synergy: {
    name: 'Synergy',
    id: 'io.formacore.synergy',
    assets: './assets/brands/synergy',
    iconBackground: '#000000',
  },
};

/** @param {{ config: import('expo/config').ExpoConfig }} context */
module.exports = ({ config }) => {
  const key = process.env.APP_VARIANT;
  if (!key) return config;
  const variant = VARIANTS[key];
  if (!variant)
    throw new Error(`Unknown APP_VARIANT "${key}". Known: ${Object.keys(VARIANTS).join(', ')}`);

  return {
    ...config,
    name: variant.name,
    icon: `${variant.assets}/icon.png`,
    ios: { ...config.ios, bundleIdentifier: variant.id },
    android: {
      ...config.android,
      package: variant.id,
      adaptiveIcon: {
        foregroundImage: `${variant.assets}/adaptive-icon.png`,
        backgroundColor: variant.iconBackground,
      },
    },
    plugins: (config.plugins ?? []).map((plugin) => {
      if (!Array.isArray(plugin)) return plugin;
      const [name, options] = plugin;
      if (name === 'expo-splash-screen') {
        return [name, { ...options, image: `${variant.assets}/splash.png` }];
      }
      if (name === 'expo-camera') {
        return [
          name,
          {
            ...options,
            cameraPermission: String(options.cameraPermission).replace('FormaCore', variant.name),
          },
        ];
      }
      return plugin;
    }),
  };
};
