// @fit/web — member portal design-system barrel.
//
// One import surface for the "formacore" Aurora-glass primitives so screens read
// declaratively: `import { Card, Btn, Badge, Icon } from '@/src/components/ui'`.

export { Icon, I, type IconName } from './icon';
export { Btn, buttonClasses, type BtnProps, type BtnVariant, type BtnSize } from './button';
export { Badge, type Tone } from './badge';
export { Card, Dot, Avatar, Progress } from './primitives';
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
export { CountUp, Occupancy, Donut, Switch, AreaChart, type AreaPoint } from './data-viz';
export { QRCode } from './qr-code';
export { AuroraBackground } from './aurora';
export { ToastProvider, useToast } from './toast';
