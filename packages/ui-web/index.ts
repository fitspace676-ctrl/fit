// @fit/ui-web — the web design system.
//
// The shared core primitives (Button, Badge, Card, Avatar, Input, Select,
// Tabs …) consolidated into one library so the admin console and member portal
// build every screen from the SAME source instead of per-app copies (T1.3).
//
// The primitives are being rebuilt on Astryx (@astryxdesign/core) under the Fit
// brand theme (T11): Btn / Badge / Card already render Astryx components
// underneath, while the remaining exports stay brand-token equivalents through
// the Tailwind→Astryx coexistence. Export names and prop contracts are held
// stable so consuming screens don't change. Consuming apps must still include
// this package in their Tailwind `content` globs while any Tailwind-based
// primitive (or the `buttonClasses` link helper) is in use.

export { Icon, I, type IconName, type IconProps } from './src/icon';
export { Btn, buttonClasses, type BtnProps, type BtnVariant, type BtnSize } from './src/button';
export { Badge, type BadgeProps, type Tone } from './src/badge';
export {
  Card,
  Dot,
  Avatar,
  Progress,
  SkipLink,
  type CardProps,
  type AvatarProps,
  type ProgressProps,
  type SkipLinkProps,
} from './src/primitives';
export {
  Field,
  Label,
  Input,
  Textarea,
  Select,
  LABEL_CLASS,
  type FieldProps,
  type FieldControlMeta,
  type InputProps,
  type TextareaProps,
  type SelectProps,
} from './src/field';
export {
  useZodForm,
  Form,
  FormSection,
  FormGrid,
  FormActions,
  FormBanner,
  FormError,
  FormSuccess,
  TextField,
  NumberField,
  TextareaField,
  SelectField,
  CheckboxField,
  SubmitButton,
  fieldErrorText,
  formGridClasses,
  formBannerClasses,
  FORM_LEGEND_CLASS,
  FORM_DESC_CLASS,
  Controller,
  FormProvider,
  useFieldArray,
  useFormContext,
  useWatch,
  type FormProps,
  type FormSectionProps,
  type FormGridProps,
  type FormActionsProps,
  type FormBannerProps,
  type TextFieldProps,
  type TextareaFieldProps,
  type SelectFieldProps,
  type CheckboxFieldProps,
  type FormCols,
  type BannerTone,
  type DefaultValues,
  type FieldErrors,
  type FieldValues,
  type RegisterOptions,
  type SubmitHandler,
  type UseFormReturn,
} from './src/form';
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
export {
  DataTable,
  EmptyState,
  FilterChips,
  FilterBar,
  TableSearch,
  TablePager,
  nextSortDir,
  sortIndicator,
  pageBounds,
  alignClass,
  type Column,
  type SortDir,
  type CellAlign,
  type PageBounds,
  type TableSelection,
  type DataTableProps,
  type EmptyStateProps,
  type FilterChip,
  type FilterChipsProps,
  type TableSearchProps,
  type TablePagerProps,
} from './src/data-table';
