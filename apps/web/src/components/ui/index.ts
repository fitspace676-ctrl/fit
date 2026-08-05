// @fit/web — member portal design-system barrel.
//
// One import surface for the "formacore" Aurora-glass primitives so screens read
// declaratively: `import { Card, Btn, Badge, Icon } from '@/src/components/ui'`.

export { Icon, I, type IconName } from './icon';
export { Btn, buttonClasses, type BtnProps, type BtnVariant, type BtnSize } from './button';
export { ButtonLink, type ButtonLinkProps } from './button-link';
export { Badge, type Tone } from './badge';
export { Card, Dot, Avatar, Progress, SkipLink } from './primitives';
export {
  Field,
  Label,
  Input,
  Textarea,
  Select,
  Tabs,
  type FieldProps,
  type InputProps,
  type TextareaProps,
  type SelectProps,
  type TabItem,
  type TabsProps,
} from '@fit/ui-web';
export {
  Overlay,
  Modal,
  ConfirmDialog,
  Drawer,
  modalPanelClasses,
  drawerPanelClasses,
  type ModalProps,
  type ModalSize,
  type ConfirmDialogProps,
  type DrawerProps,
  type DrawerSide,
} from '@fit/ui-web';
export { CountUp, Occupancy, Donut, Switch } from './data-viz';
export { QRCode } from './qr-code';
export { AuroraBackground } from './aurora';
export { ToastProvider, useToast } from './toast';
