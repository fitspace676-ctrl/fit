// @fit/admin — sidebar collapse persistence.
//
// The cookie name lives here rather than next to the component because the
// console layout (a Server Component) reads it: exports pulled out of a
// `'use client'` module arrive on the server as client-reference stubs, not the
// value, so a constant shared across the boundary has to sit in a plain module.

/** Cookie the sidebar's collapsed/expanded choice is persisted under. */
export const SIDEBAR_COLLAPSED_COOKIE = 'fit-admin-sidebar-collapsed';

/** Value written when the rail is collapsed; anything else reads as expanded. */
export const SIDEBAR_COLLAPSED_VALUE = '1';
