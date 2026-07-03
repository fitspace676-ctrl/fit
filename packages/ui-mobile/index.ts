// @fit/ui-mobile — the mobile design system.
//
// The formacore design tokens + base React Native components (Button, Card,
// ListRow, Badge, Avatar, tab bar) so the Expo screens can be rebuilt to match
// the web console and member portal from ONE shared source (T1.10). The Tailwind
// side of the tokens is the preset in `./tailwind.preset.mjs` (imported by the
// mobile `tailwind.config.mjs`); the runtime side is `./src/tokens`.

export {
  palette,
  radius,
  lightColors,
  darkColors,
  themeColors,
  type Scale,
  type ThemeColors,
} from './src/tokens';
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './src/button';
export {
  Card,
  PressableCard,
  Divider,
  type CardProps,
  type PressableCardProps,
  type CardPad,
} from './src/card';
export { Badge, type BadgeProps, type Tone } from './src/badge';
export { Avatar, type AvatarProps, type AvatarSize } from './src/avatar';
export { ListRow, type ListRowProps } from './src/list-row';
export { tabBarScreenOptions, TabBarIcon, type TabBarIconProps } from './src/tab-bar';
