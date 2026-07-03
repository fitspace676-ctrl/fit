// The Icon set now lives in the shared @fit/ui-web design system (T1.3), where
// the admin + web icon dictionaries were merged into one union. Re-exported here
// so existing `./icon` importers (button, badge, toast, data-viz, the barrel)
// resolve unchanged.
export { Icon, I, type IconName, type IconProps } from '@fit/ui-web';
