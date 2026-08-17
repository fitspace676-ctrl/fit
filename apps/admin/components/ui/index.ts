// @fit/web — member portal design-system barrel.
//
// One import surface for the "formacore" Aurora-glass primitives so screens read
// declaratively: `import { Card, Btn, Badge, Icon } from '@/src/components/ui'`.

export { Icon, I, type IconName } from './icon';
export { Btn, buttonClasses, type BtnProps, type BtnVariant, type BtnSize } from './button';
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
  type DrawerSize,
} from '@fit/ui-web';
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
  Controller,
  FormProvider,
  useFieldArray,
  useFormContext,
  useWatch,
  type FormProps,
  type FormSectionProps,
  type TextFieldProps,
  type SelectFieldProps,
  type FormCols,
  type BannerTone,
  type DefaultValues,
  type FieldErrors,
  type RegisterOptions,
  type SubmitHandler,
  type UseFormReturn,
} from '@fit/ui-web';
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
} from '@fit/ui-web';
export { ToastProvider, useToast } from './toast';
