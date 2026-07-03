// The Button primitive now lives in the shared @fit/ui-web design system (T1.3).
// This module is a thin re-export so the many `@/src/components/ui` importers —
// and the local barrel — resolve unchanged while there is a single source of truth.
export { Btn, buttonClasses, type BtnProps, type BtnVariant, type BtnSize } from '@fit/ui-web';
