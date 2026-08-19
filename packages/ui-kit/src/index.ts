/**
 * @fit/ui-kit — the FormaCore control vocabulary, shared by both web surfaces.
 *
 * One import surface, so a screen reads declaratively:
 * `import { Button, Card, Field } from '@fit/ui-kit'`.
 *
 * It began as the member portal's kit, itself the sign-in and checkout screens'
 * private vocabulary promoted to every member screen. It lives in a package now
 * because the staff console is moving onto the same silhouettes: one radius
 * ladder, one control ladder, one field, one focus ring across both apps.
 *
 * Everything here is authored against the theme's own custom properties, so the
 * COLOUR is not fixed here — an app picks that by which Astryx theme it mounts,
 * and the console's palette playground can override it live. What the kit fixes
 * is the FORM.
 *
 * `ButtonLink` is deliberately absent: the two apps route differently, so each
 * builds its own from `buttonSurfaceProps` + `ButtonContent`. See `button.tsx`.
 */

export { control, controlSquare, focus, spacing, stretch, surface, text } from './tokens';

export {
  Button,
  ButtonContent,
  Spinner,
  buttonSurfaceProps,
  type ButtonProps,
  type ButtonLinkProps,
  type ButtonSize,
  type ButtonVariant,
} from './button';
export { Card, type CardPadding, type CardProps, type CardVariant } from './card';
export { Badge, type BadgeProps, type BadgeTone } from './badge';
export { Banner, type BannerProps, type BannerTone } from './banner';
export { Avatar, type AvatarProps, type AvatarShape } from './avatar';
export { EmptyState, Meter, type EmptyStateProps, type MeterProps } from './feedback';
export { CountUp, type CountUpProps } from './count-up';

export {
  Field,
  FieldGroup,
  Form,
  SelectField,
  TextareaField,
  type FieldGroupProps,
  type FieldProps,
  type FieldSize,
  type FormProps,
  type SelectFieldProps,
  type SelectOption,
  type SelectOptionGroup,
  type TextareaFieldProps,
} from './field';
export { DateField, type DateFieldLabels, type DateFieldProps } from './date-field';
export { Stepper, NumberField, type StepperProps, type NumberFieldProps } from './stepper';
export { Switch, type SwitchProps } from './switch';
export { Checkbox, type CheckboxProps } from './checkbox';
export { Dot, type DotProps, type DotTone } from './dot';

export {
  DataTable,
  FilterBar,
  FilterChips,
  TablePager,
  TableSearch,
  nextSortDir,
  pageBounds,
  type CellAlign,
  type Column,
  type DataTableProps,
  type FilterChip,
  type FilterChipsProps,
  type PageBounds,
  type SortDir,
  type TablePagerProps,
  type TableSearchProps,
  type TableSelection,
} from './data-table';
export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from './segmented';
export { Tabs, type TabItem, type TabsProps } from './tabs';

export { Popover, type PopoverProps } from './popover';
export { Dialog, ConfirmDialog, type DialogProps, type ConfirmDialogProps } from './dialog';
export { Drawer, type DrawerProps } from './drawer';
export { useDismissable, type DismissableOptions } from './use-dismissable';
