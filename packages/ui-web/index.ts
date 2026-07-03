// @fit/ui-web — the web design system.
//
// The formacore "Aurora-glass" core primitives (Button, Badge, Card, Avatar,
// Input, Select, Tabs …) consolidated into one shared library so the admin
// console and member portal build every screen from the SAME source instead of
// per-app copies (T1.3). Consuming apps must include this package in their
// Tailwind `content` globs so its utility classes are generated.

export { Icon, I, type IconName, type IconProps } from './src/icon';
export { Btn, buttonClasses, type BtnProps, type BtnVariant, type BtnSize } from './src/button';
export { Badge, type BadgeProps, type Tone } from './src/badge';
export {
  Card,
  Dot,
  Avatar,
  Progress,
  type CardProps,
  type AvatarProps,
  type ProgressProps,
} from './src/primitives';
export {
  Field,
  Label,
  Input,
  Textarea,
  Select,
  LABEL_CLASS,
  type FieldProps,
  type InputProps,
  type TextareaProps,
  type SelectProps,
} from './src/field';
export { Tabs, type TabItem, type TabsProps } from './src/tabs';
export {
  Overlay,
  Modal,
  ConfirmDialog,
  Drawer,
  modalPanelClasses,
  drawerPanelClasses,
  OVERLAY_ROOT,
  OVERLAY_BACKDROP,
  type OverlayProps,
  type ModalProps,
  type ModalSize,
  type ConfirmDialogProps,
  type DrawerProps,
  type DrawerSide,
} from './src/overlay';
export { ToastProvider, useToast, type ToastContextValue } from './src/toast';
