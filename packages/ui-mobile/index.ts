// @fit/ui-mobile — the mobile design system: NativeWind-aligned tokens and the
// base components (Button, Card, ListRow, Badge, AppText, tab-bar pieces) the
// Expo app is rebuilt from. Colors, spacing, radii and typography live in
// `./src/tokens`; the components read the active palette off the OS appearance
// via `useThemeColors`, so everything repaints together with system dark mode.

export * from './src/tokens';
export * from './src/theme';

export * from './src/components/AppText';
export * from './src/components/Badge';
export * from './src/components/Button';
export * from './src/components/Card';
export * from './src/components/ListRow';
export * from './src/components/TabBar';
