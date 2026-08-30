'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { z } from 'zod';
import { HEX_COLOR_PATTERN, type GymSettings } from '@fit/types';
import { Button, Card } from '@fit/ui-kit';
import {
  Controller,
  Form,
  Icon,
  fieldErrorText,
  useFormContext,
  useToast,
  useWatch,
  useZodForm,
} from '@/components/ui';
import type { SignedUploadResponse } from '@/lib/api';
import {
  finalizePortalImageAction,
  finalizePortalLogoAction,
  requestPortalImageUploadAction,
  requestPortalLogoUploadAction,
  updateMemberPortalAction,
  type ActionResult,
} from './actions';

/**
 * This app's basePath behind the tenant proxy. Next prefixes navigation and
 * `_next` assets with it, but not plain `<img>` src attributes, and its image
 * optimiser rejects public-folder URLs under a basePath — which is why the two
 * bundled images below are plain `<img>` tags on prefixed paths, exactly as the
 * console's own sign-in screen does it.
 */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '';

/**
 * The photograph the member door falls back to when the gym has set none — the
 * same file the member site bundles at `/gym-hero.webp`. The preview shows this
 * one whenever `loginImageUrl` is `null`, so "no photo" is a picture of what
 * members will actually see rather than an empty box.
 */
const FALLBACK_PHOTO = `${BASE_PATH}/gym-hero.webp`;

/** The white-inked wordmark the member door carries over its photo panel. */
const WORDMARK = `${BASE_PATH}/logodark.png`;

/**
 * The DARK-inked half of that same bundled pair.
 *
 * The member site swaps between the two off the light/dark theme; the logo card's
 * thumbnail cannot, because it draws every mark on the one white plate the portal
 * gives a tenant logo (see `PortalLogo` in `apps/web`). On white, this is the
 * correct half — and it is the file a member on the light theme actually sees.
 */
const WORDMARK_ON_LIGHT = `${BASE_PATH}/logolight.png`;

/**
 * Accepted photograph MIME types. Wider than the brand logo's JPEG/PNG pair,
 * which is narrow because the logo is also drawn into invoice PDFs by `pdfkit`;
 * this image is only ever rendered by a browser, so WebP — the format the
 * bundled default itself is in — is allowed.
 */
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Client-side size ceiling (bytes) — a friendly guard before the signed PUT. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Accepted wordmark MIME types — the photograph's list, and for the same reason:
 * the portal's chrome is painted by a browser and never embedded in a PDF.
 *
 * This IS the whole argument for `memberPortal.logoUrl` existing alongside
 * `brand.logoUrl`. That one is gated to JPEG/PNG because `pdfkit` draws it onto
 * every invoice, and a WebP accepted there would render on screen and silently
 * vanish from the paperwork. Widening it was never an option; giving the portal
 * its own field was.
 */
const ACCEPTED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Client-side size ceiling (bytes) for the wordmark — the brand logo's, not the
 * photograph's. A logo is line art at header size; a 5 MB one is a mistake, and
 * refusing it here says so before the upload rather than after.
 */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const styles = stylex.create({
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    paddingBottom: '6rem',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  breadcrumbCurrent: { color: 'var(--color-text-primary)' },
  crumbIcon: { width: '0.875rem', height: '0.875rem' },
  header: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  // Controls on the left, preview on the right, and the preview sticks while the
  // controls scroll — the whole point of the screen is watching the mock change
  // as a colour changes, which it cannot do from off-screen.
  layout: {
    display: 'grid',
    alignItems: 'start',
    gap: '1.25rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1200px)': 'minmax(0, 26rem) minmax(0, 1fr)',
    },
  },
  column: { display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 },
  previewColumn: {
    minWidth: 0,
    position: { default: 'static', '@media (min-width: 1200px)': 'sticky' },
    top: { default: 'auto', '@media (min-width: 1200px)': '88px' },
  },
  card: {
    padding: { default: '1.25rem', '@media (min-width: 640px)': '1.5rem' },
  },
  cardTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  cardDesc: {
    marginTop: '0.125rem',
    marginBottom: '1.25rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  stack4: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  stack2: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },

  /* ------------------------------ colour control ----------------------------- */
  colorBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '1rem',
    boxShadow: 'inset 0 0 0 1px var(--color-border)',
  },
  colorHead: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  colorLabel: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  colorDesc: {
    margin: 0,
    fontSize: '0.75rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  // "From brand" — the badge that says this colour is not the gym's own choice.
  inheritBadge: {
    marginLeft: 'auto',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-accent)',
  },
  colorRow: { display: 'flex', alignItems: 'center', gap: '0.625rem' },
  // The native colour well, stripped of its chrome so it reads as a swatch.
  swatchInput: {
    height: '2.5rem',
    width: '2.75rem',
    flexShrink: 0,
    padding: '0.1875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    cursor: 'pointer',
  },
  // The inherited state's stand-in for it: a flat chip, deliberately NOT a
  // control, because the colour it shows is not this screen's to change.
  swatchStatic: {
    height: '2.5rem',
    width: '2.75rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-element)',
    boxShadow: 'inset 0 0 0 1px var(--color-border)',
  },
  hexInput: {
    height: '2.5rem',
    flex: 1,
    minWidth: 0,
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':disabled': 'var(--color-background-muted)',
    },
    paddingInline: '0.625rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    color: {
      default: 'var(--color-text-primary)',
      ':disabled': 'var(--color-text-secondary)',
    },
    outline: 'none',
  },
  hexInvalid: { borderColor: 'var(--color-error)' },
  linkBtn: {
    alignSelf: 'flex-start',
    borderStyle: 'none',
    background: 'none',
    padding: 0,
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: 600,
    textDecorationLine: { default: 'none', ':hover': 'underline' },
    color: 'var(--color-text-accent)',
  },
  fieldError: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-error)',
  },

  /* -------------------------------- photograph ------------------------------- */
  // Stacked, not side by side: the photograph is the thing being decided here, and
  // at card width a 10rem thumbnail beside a hugging button left most of the row
  // empty while showing the picture smaller than it deserved.
  photoRow: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  // The thumbnail is a FRAME, not a bare `<img>`, so the "built-in" badge can sit
  // on the picture it describes instead of floating in the column beside it —
  // where it read as a heading for the upload control under it.
  photoFrame: {
    position: 'relative',
    width: '100%',
    // Ratio rather than a height, so the preview grows with the card and still
    // frames the shot the way the member door's photo panel does.
    aspectRatio: '8 / 5',
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
  },
  photoThumb: { height: '100%', width: '100%', objectFit: 'cover', display: 'block' },
  // While a file hovers: the whole block answers, so the pointer is never asking
  // a picture whether the button beside it will take the drop.
  photoRowDragging: {
    borderRadius: 'var(--radius-container)',
    outlineWidth: '2px',
    outlineStyle: 'dashed',
    outlineColor: 'var(--color-accent)',
    // Tight to the block: at full card width a wider offset runs into the card's
    // own padding and reads as a second, broken border.
    outlineOffset: '0.25rem',
  },
  photoFrameDragging: { borderColor: 'var(--color-accent)' },
  dropOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    paddingInline: '0.5rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    fontWeight: 700,
    lineHeight: 1.3,
    color: '#FFFFFF',
  },
  photoControls: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  // The upload spans the card; "remove" sits under it as a quiet text action
  // rather than competing for the same line.
  photoActions: { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' },
  /**
   * The upload control.
   *
   * A `<label>` wrapping a visually-hidden `<input type="file">`, NOT a styled
   * input. `::file-selector-button` reaches the button and nothing else: the
   * "no file selected" text beside it is the browser's, renders in the BROWSER's
   * language rather than the console's — English sitting in a Georgian form —
   * and carries a native tooltip that dropped over the hint below it. A label is
   * the one way to own the whole control, and it keeps the input's own keyboard
   * behaviour rather than simulating a click, so the ring lands via
   * `:focus-within` on the real focused element.
   */
  uploadLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: 'var(--color-border)', ':hover': 'var(--color-border-strong)' },
    backgroundColor: {
      default: 'var(--color-background)',
      ':hover': 'var(--fc-ghost)',
    },
    paddingInline: '0.75rem',
    paddingBlock: '0.4375rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    outlineWidth: { default: '0', ':focus-within': '2px' },
    outlineStyle: 'solid',
    outlineColor: 'var(--color-accent)',
    outlineOffset: '2px',
  },
  uploadLabelBusy: { opacity: 0.55, cursor: 'progress' },
  // Present to the pointer and to assistive tech, absent from the layout.
  srOnly: {
    position: 'absolute',
    height: '1px',
    width: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
  photoHint: {
    margin: 0,
    fontSize: '0.75rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  // Over the photograph's bottom edge, carrying its own dark fill: the tag names
  // what the picture IS, and a photo can be any colour underneath it.
  builtInTag: {
    position: 'absolute',
    insetBlockEnd: '0.375rem',
    insetInlineStart: '0.375rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingInline: '0.5rem',
    paddingBlock: '0.1875rem',
    fontSize: '0.625rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#FFFFFF',
  },
  uploadError: {
    margin: 0,
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-warning-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-warning)',
  },

  /* --------------------------------- wordmark -------------------------------- */
  /**
   * The logo thumbnail — the plate itself, at card width.
   *
   * WHITE, in both console themes, because the member portal draws a tenant mark
   * on a fixed white plate in all three of its headers (see `PortalLogo` in
   * `apps/web` for why one uploaded file cannot use the two-file theme swap the
   * bundled wordmark does). A preview that followed the CONSOLE's theme would be
   * showing a ground members never see, and would hide exactly the mistake this
   * card exists to catch: a white-inked logo, invisible where it will actually be
   * rendered. So the thumbnail is the contract, drawn.
   *
   * `contain` and generous padding rather than the photograph's `cover` crop: a
   * logo cropped to fill a frame is not a preview of anything.
   */
  logoFrame: {
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
    width: '100%',
    minHeight: '7rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: '#FFFFFF',
    padding: '1.25rem',
  },
  // Bounded on both axes: a gym's mark may be a wide wordmark or a square badge,
  // and neither may stretch the card.
  logoMark: {
    display: 'block',
    width: 'auto',
    height: 'auto',
    maxHeight: '3.5rem',
    maxWidth: '100%',
    objectFit: 'contain',
  },

  /* --------------------------------- preview --------------------------------- */
  // The frame. `overflow: hidden` + a rounded border makes the mock read as a
  // screenshot of another product rather than as more of this page.
  previewFrame: {
    display: 'grid',
    overflow: 'hidden',
    minHeight: '30rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    gridTemplateColumns: { default: '1fr', '@media (min-width: 720px)': '0.92fr 1.08fr' },
  },
  // The gym side, mirroring `AuthPhotoShell`'s `aside`: photo, scrim, wordmark,
  // join strip — and its charcoal fill, so a still-loading photo degrades to the
  // flat surface it replaces rather than to a white hole.
  previewAside: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: '1.5rem',
    overflow: 'hidden',
    minHeight: '13rem',
    backgroundColor: '#131312',
    padding: '1.25rem',
    order: { default: 2, '@media (min-width: 720px)': 1 },
  },
  previewPhoto: {
    position: 'absolute',
    inset: 0,
    height: '100%',
    width: '100%',
    objectFit: 'cover',
    objectPosition: 'center',
  },
  previewScrim: {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'linear-gradient(180deg, rgba(19,19,18,0.74) 0%, rgba(19,19,18,0.26) 40%, rgba(19,19,18,0.34) 64%, rgba(19,19,18,0.68) 100%)',
  },
  previewWordmark: { position: 'relative', width: '6.5rem', height: 'auto', objectFit: 'contain' },
  // The tenant mark's plate, as the member door actually draws it: a fixed white
  // ground that does not follow the theme, so the one uploaded file has one
  // background to be designed against. `relative` to clear the scrim, like every
  // other element on this panel.
  previewLogoPlate: {
    position: 'relative',
    alignSelf: 'flex-start',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: '#FFFFFF',
    boxShadow: 'inset 0 0 0 1px rgba(19, 19, 18, 0.10)',
    paddingInline: '0.5rem',
    paddingBlock: '0.3125rem',
  },
  previewLogoMark: {
    display: 'block',
    width: 'auto',
    height: 'auto',
    maxHeight: '1.375rem',
    maxWidth: '6.5rem',
    objectFit: 'contain',
  },
  previewJoin: {
    position: 'relative',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(19, 19, 18, 0.64)',
    backdropFilter: 'blur(14px)',
    padding: '0.875rem',
  },
  previewJoinTitle: { margin: 0, fontSize: '0.8125rem', fontWeight: 700, color: '#FFFFFF' },
  previewBenefit: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.375rem',
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    lineHeight: 1.5,
    color: 'rgba(255, 255, 255, 0.88)',
  },
  previewBenefitIcon: { marginTop: '0.125rem', flexShrink: 0, height: '0.75rem', width: '0.75rem' },
  // The portal's accent-as-type token, which the gym does not configure — the
  // mock reads it from the theme so it cannot drift from what the portal paints.
  previewBenefitIconAccent: { color: 'var(--color-text-accent)' },
  previewJoinCta: {
    display: 'inline-flex',
    marginTop: '0.75rem',
    alignItems: 'center',
    height: '2rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: '#FFFFFF',
    paddingInline: '0.875rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#131312',
  },
  // The form side.
  previewForm: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '0.75rem',
    backgroundColor: 'var(--color-background-surface)',
    padding: '1.75rem',
    order: { default: 1, '@media (min-width: 720px)': 2 },
  },
  previewFormBody: { marginInline: 'auto', width: '100%', maxWidth: '20rem' },
  previewTitle: {
    margin: 0,
    marginBottom: '1.25rem',
    textAlign: 'center',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.03em',
    color: 'var(--color-text-primary)',
  },
  previewFieldLabel: {
    display: 'block',
    marginBottom: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  previewFieldRow: { marginBottom: '0.75rem' },
  previewFieldBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '2.5rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-body)',
    paddingInline: '0.625rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  previewSubmit: {
    display: 'flex',
    height: '2.75rem',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-element)',
    fontSize: '0.875rem',
    fontWeight: 700,
  },
  previewForgot: { fontSize: '0.75rem', fontWeight: 600 },
  previewNote: {
    margin: 0,
    marginTop: '0.875rem',
    fontSize: '0.75rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },

  /* --------------------------- dynamic (themed) bits ------------------------- */
  // StyleX's dynamic-style form, which is how a value that is only known at
  // runtime — the gym's own colours — reaches CSS without an inline `style`
  // attribute fighting the class it is spread beside.
  tintBackground: (color: string) => ({ backgroundColor: color }),
  tintText: (color: string) => ({ color }),
  tintInk: (background: string, ink: string) => ({ backgroundColor: background, color: ink }),
  tintBorder: (color: string) => ({ borderColor: color, boxShadow: `0 0 0 2px ${color}22` }),

  /* --------------------------------- save bar -------------------------------- */
  saveBar: {
    position: 'fixed',
    bottom: '1.25rem',
    left: '50%',
    zIndex: 40,
    transitionProperty: 'transform, opacity',
    transitionDuration: '300ms',
  },
  saveBarVisible: { transform: 'translateX(-50%) translateY(0)', opacity: 1 },
  saveBarHidden: {
    transform: 'translateX(-50%) translateY(1rem)',
    opacity: 0,
    pointerEvents: 'none',
  },
  saveBarInner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-popover)',
    paddingBlock: '0.625rem',
    paddingLeft: '1rem',
    paddingRight: '0.625rem',
    color: 'var(--color-text-primary)',
    boxShadow: '0 24px 60px -16px var(--color-shadow)',
  },
  saveBarText: { fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)' },
  saveBarDivider: {
    marginInline: '0.125rem',
    height: '1.25rem',
    width: '1px',
    backgroundColor: 'var(--color-border)',
  },
  discardBtn: {
    height: '2.25rem',
    borderStyle: 'none',
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.75rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-background-muted)' },
    opacity: { default: 1, ':disabled': 0.4 },
  },
});

/** The two colours this screen edits — the keys `ColorControl` may bind to. */
type ColorField = 'primaryColor';

/**
 * The form's value shape — the `memberPortal` section verbatim.
 *
 * `null` is a REAL value here, not "unset". It means "follow the brand colour",
 * which is a state the gym can be in deliberately and must be able to return to,
 * so it travels through the form and is PATCHed as `null` rather than being
 * dropped from the payload.
 */
interface MemberPortalFormValues {
  loginImageUrl: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
}

/**
 * Legible ink for text drawn ON `hex` — near-black over a light fill, white over
 * a dark one, by WCAG relative luminance.
 *
 * The preview's sign-in button is painted in the gym's own primary colour, and a
 * gym that picks a pale yellow must not be shown white-on-yellow and conclude the
 * portal is broken. The member site does the same resolution; the preview only
 * has to agree with it closely enough that nobody is surprised at the door.
 */
function readableInk(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number): number => {
    const srgb = ((value >> shift) & 255) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luminance > 0.4 ? '#131312' : '#FFFFFF';
}

/** Map the API settings shape onto the form's values. */
function toFormValues(settings: GymSettings): MemberPortalFormValues {
  return {
    loginImageUrl: settings.memberPortal.loginImageUrl,
    logoUrl: settings.memberPortal.logoUrl,
    primaryColor: settings.memberPortal.primaryColor,
  };
}

/**
 * The member portal's look — two colours, the sign-in photograph, and a live mock
 * of the door they paint.
 *
 * WHY A PREVIEW AND NOT TWO COLOUR FIELDS. The values here are meaningless as
 * numbers: nobody knows what `#63701D` does to a sign-in screen until they see it
 * on one. The mock beside the controls is therefore not decoration — it is the
 * only way the screen answers the question it is opened to ask, which is why it
 * gets the wider column and stays in view while the controls scroll.
 *
 * THE NULL COLOURS. A portal colour left `null` means "follow the brand", and the
 * controls express that as a state rather than as an empty box: the swatch shows
 * the brand colour that is standing in, a badge says where it came from, the hex
 * box is filled-but-inert, and one button each way moves between inheriting and
 * choosing. An empty text field would have said "no colour", which is not a thing
 * this contract can store.
 *
 * THE PHOTOGRAPH takes the brand logo's exact path — presign (`POST /uploads`),
 * `PUT` the bytes straight to R2 from the browser, then finalise the object key
 * (`POST /gyms/settings/portal-image`), which is the only step that needs a
 * server: it checks the key belongs to this gym and turns it into a public URL.
 * That URL is written into the form marked dirty, so the preview repaints at once
 * and the next Save keeps it. Removing sets the value back to `null` and persists
 * on Save, which is what makes the bundled `/gym-hero.webp` come back.
 */
export function MemberPortalForm({ initial }: { initial: GymSettings }) {
  const t = useTranslations('admin.memberPortal');
  const router = useRouter();
  const { toast } = useToast();

  // Built with a translated message so the inline hex error reads in the active
  // locale; the pattern itself is the contract's, so the form rejects exactly
  // what the API would.
  const schema = z.object({
    loginImageUrl: z.string().url().nullable(),
    logoUrl: z.string().url().nullable(),
    primaryColor: z.string().regex(HEX_COLOR_PATTERN, t('colors.invalid')).nullable(),
  });

  const form = useZodForm(schema, { defaultValues: toFormValues(initial) });

  async function handleSubmit(values: MemberPortalFormValues): Promise<void> {
    const result = await updateMemberPortalAction(values);
    if (result.ok) {
      // Resync to the server's normalised truth, which also clears the dirty state.
      form.reset(toFormValues(result.data));
      toast(t('toast.saved'), { tone: 'success', icon: 'check' });
      router.refresh();
    } else {
      toast(result.error || t('toast.saveFailed'), { tone: 'danger', icon: 'info' });
    }
  }

  return (
    <Form
      form={form}
      onSubmit={(values) => void handleSubmit(values)}
      {...stylex.props(styles.form)}
    >
      <nav aria-label={t('breadcrumb.label')} {...stylex.props(styles.breadcrumb)}>
        <span>{t('breadcrumb.home')}</span>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <span {...stylex.props(styles.breadcrumbCurrent)}>{t('breadcrumb.current')}</span>
      </nav>

      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
      </header>

      <div {...stylex.props(styles.layout)}>
        <div {...stylex.props(styles.column)}>
          <Card padding="none" xstyle={styles.card}>
            <h2 {...stylex.props(styles.cardTitle)}>{t('colors.title')}</h2>
            <p {...stylex.props(styles.cardDesc)}>{t('colors.subtitle')}</p>
            <div {...stylex.props(styles.stack4)}>
              <ColorControl
                name="primaryColor"
                label={t('colors.primaryLabel')}
                description={t('colors.primaryDesc')}
                inherited={initial.brand.primaryColor}
              />
            </div>
          </Card>

          {/* Before the photograph, because the mark is on every screen of the
              portal while the photograph is on one. */}
          <Card padding="none" xstyle={styles.card}>
            <h2 {...stylex.props(styles.cardTitle)}>{t('logo.title')}</h2>
            <p {...stylex.props(styles.cardDesc)}>{t('logo.subtitle')}</p>
            <LogoField brandLogoUrl={initial.brand.logoUrl} />
          </Card>

          <Card padding="none" xstyle={styles.card}>
            <h2 {...stylex.props(styles.cardTitle)}>{t('image.title')}</h2>
            <p {...stylex.props(styles.cardDesc)}>{t('image.subtitle')}</p>
            <PhotoField />
          </Card>
        </div>

        <div {...stylex.props(styles.previewColumn)}>
          <Card padding="none" xstyle={styles.card}>
            <h2 {...stylex.props(styles.cardTitle)}>{t('preview.title')}</h2>
            <p {...stylex.props(styles.cardDesc)}>{t('preview.subtitle')}</p>
            <PortalPreview
              gymName={initial.brand.name}
              brandPrimary={initial.brand.primaryColor}
              brandLogoUrl={initial.brand.logoUrl}
            />
            <p {...stylex.props(styles.previewNote)}>{t('preview.note')}</p>
          </Card>
        </div>
      </div>

      <SaveBar />
    </Form>
  );
}

/**
 * One colour, in either of its two states.
 *
 * INHERITED (`null`): the swatch and the hex box show the brand colour that is
 * standing in, the box is inert, a badge names where the value came from, and the
 * one action offered is to start choosing. Nothing here can be edited, because
 * the value being shown belongs to Settings → General, not to this screen.
 *
 * CHOSEN (a hex): the native colour well and the hex box are two views of the same
 * form value and stay in step through it — typing `#e4f26a` moves the well, and
 * dragging the well fills the box. The well is fed a *sanitised* value because a
 * half-typed `#e4f` is a perfectly reasonable intermediate state for the text box
 * and not a colour; the schema is what refuses it on submit, with the message
 * under the row.
 *
 * The way BACK to inherited is a plain button rather than a "clear" affordance on
 * the field: emptying a text box is how you express "no value", and `null` here is
 * not no value — it is a different, named source for one.
 */
function ColorControl({
  name,
  label,
  description,
  inherited,
}: {
  name: ColorField;
  label: string;
  description: string;
  /** The brand colour this field falls back to while it is `null`. */
  inherited: string;
}) {
  const t = useTranslations('admin.memberPortal.colors');
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<MemberPortalFormValues>();
  const error = fieldErrorText(errors, name);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const inheriting = field.value === null;
        const shown = field.value ?? inherited;
        // The colour well rejects anything that is not `#rrggbb`, so an in-flight
        // edit falls back to the inherited colour rather than blanking the well.
        const swatch = HEX_COLOR_PATTERN.test(shown) ? shown : inherited;
        return (
          <div {...stylex.props(styles.colorBlock)}>
            <div {...stylex.props(styles.colorHead)}>
              <span {...stylex.props(styles.colorLabel)}>{label}</span>
              {inheriting ? (
                <span {...stylex.props(styles.inheritBadge)}>{t('inheritedBadge')}</span>
              ) : null}
            </div>
            <p {...stylex.props(styles.colorDesc)}>{description}</p>

            <div {...stylex.props(styles.colorRow)}>
              {inheriting ? (
                <span
                  aria-hidden
                  {...stylex.props(styles.swatchStatic, styles.tintBackground(swatch))}
                />
              ) : (
                <input
                  type="color"
                  aria-label={t('pickerLabel', { label })}
                  value={swatch}
                  onChange={(event) => field.onChange(event.target.value)}
                  {...stylex.props(styles.swatchInput)}
                />
              )}
              <input
                type="text"
                aria-label={t('hexLabel', { label })}
                value={shown}
                disabled={inheriting}
                spellCheck={false}
                maxLength={7}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
                {...stylex.props(styles.hexInput, Boolean(error) && styles.hexInvalid)}
              />
            </div>

            {error ? <p {...stylex.props(styles.fieldError)}>{error}</p> : null}

            {inheriting ? (
              <>
                <p {...stylex.props(styles.colorDesc)}>{t('inherited', { color: inherited })}</p>
                <button
                  type="button"
                  // Seeded with the inherited colour rather than a platform
                  // default: "use a different colour" starts from the one the
                  // gym is looking at, so the first nudge is an adjustment.
                  onClick={() => setValue(name, inherited, { shouldDirty: true })}
                  {...stylex.props(styles.linkBtn)}
                >
                  {t('customise')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setValue(name, null, { shouldDirty: true })}
                {...stylex.props(styles.linkBtn)}
              >
                {t('reset')}
              </button>
            )}
          </div>
        );
      }}
    />
  );
}

/** The translated strings {@link useImageUpload} needs to report a rejected file. */
interface ImageUploadMessages {
  /** The file is not one of the accepted MIME types. */
  errorType: string;
  /** The file is over the ceiling. */
  errorSize: string;
  /** The signed `PUT` came back non-2xx — takes the HTTP status. */
  errorUpload: (status: number) => string;
  /** Anything threw: offline, DNS, a blocked request. */
  errorNetwork: string;
}

/**
 * The presign → `PUT` → finalise flow, plus the drag-and-drop that feeds it.
 *
 * SHARED BY BOTH UPLOADS ON THIS SCREEN, not duplicated per control. The two are
 * the same machine pointed at different settings fields: same three steps, same
 * two gates, same drop behaviour, same error surface — and the parts that are
 * genuinely fiddly (the `relatedTarget` containment below, resetting the input so
 * re-picking the same file re-fires `change`) are exactly the parts that rot when
 * they exist twice. What differs is the accepted formats, the ceiling and which
 * field the resulting URL lands in, so those are the arguments.
 *
 * The three steps are unchanged from the brand logo's: mint a presigned R2 URL
 * (`POST /uploads`), `PUT` the bytes straight there from the browser, then hand
 * the object key to a server action that checks it belongs to this gym and turns
 * it into a public URL (`POST /gyms/settings/portal-image` or `.../portal-logo`).
 * Only that last step needs a server, which is why it is the only one that is an
 * action rather than a `fetch`.
 */
function useImageUpload({
  accept,
  maxBytes,
  messages,
  presign,
  finalize,
  onUploaded,
}: {
  /** Accepted MIME types — both the `accept` attribute and the client-side gate. */
  accept: readonly string[];
  /** Client-side size ceiling in bytes, checked before anything is signed. */
  maxBytes: number;
  messages: ImageUploadMessages;
  presign: (input: {
    contentType: string;
    contentLength: number;
    fileName?: string;
  }) => Promise<ActionResult<SignedUploadResponse>>;
  /** Finalise the uploaded key, resolving to the stored public URL. */
  finalize: (photoKey: string) => Promise<ActionResult<string>>;
  /** Write the finalised URL into the form. */
  onUploaded: (url: string) => void;
}) {
  const { formState } = useFormContext<MemberPortalFormValues>();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const disabled = uploading || formState.isSubmitting;

  // Clearing the input is what lets the same file be picked twice: without it the
  // second pick sets an identical value and `change` never fires.
  function resetFileInput(): void {
    if (inputRef.current) inputRef.current.value = '';
  }

  /**
   * Validate one file and put it on R2. Shared by the picker and the drop zone so
   * a dropped file cannot take a shorter route than a chosen one — same type and
   * size gates, same presign/PUT/finalise, same error surface.
   */
  async function upload(file: File): Promise<void> {
    setUploadError(null);

    if (!accept.includes(file.type)) {
      setUploadError(messages.errorType);
      resetFileInput();
      return;
    }
    if (file.size > maxBytes) {
      setUploadError(messages.errorSize);
      resetFileInput();
      return;
    }

    setUploading(true);
    try {
      const signed = await presign({
        contentType: file.type,
        contentLength: file.size,
        fileName: file.name,
      });
      if (!signed.ok) {
        setUploadError(signed.error);
        return;
      }
      const put = await fetch(signed.data.url, {
        method: 'PUT',
        headers: { 'content-type': signed.data.contentType },
        body: file,
      });
      if (!put.ok) {
        setUploadError(messages.errorUpload(put.status));
        return;
      }
      const finalized = await finalize(signed.data.key);
      if (!finalized.ok) {
        setUploadError(finalized.error);
        return;
      }
      onUploaded(finalized.data);
    } catch {
      setUploadError(messages.errorNetwork);
    } finally {
      setUploading(false);
      resetFileInput();
    }
  }

  function onInputChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) void upload(file);
  }

  /** Spread onto the block that answers a drop — the whole control, not the thumbnail. */
  const dropHandlers = {
    onDragEnter(event: React.DragEvent<HTMLDivElement>): void {
      if (disabled || !event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragOver(event: React.DragEvent<HTMLDivElement>): void {
      if (disabled || !event.dataTransfer.types.includes('Files')) return;
      // Without this the browser navigates to the dropped file and the drop event
      // never reaches React at all.
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    /**
     * `dragleave` also fires each time the pointer crosses onto a CHILD of the
     * zone — the thumbnail, the button, the hint — so it cannot be taken at face
     * value or the highlight flickers off while the file is still over the block.
     *
     * `relatedTarget` is what it is entering. Inside the zone → ignore; outside,
     * or `null` because the drag left the window entirely, → clear. Counting
     * enter/leave pairs instead would be one dropped event away from a highlight
     * that never goes out.
     */
    onDragLeave(event: React.DragEvent<HTMLDivElement>): void {
      const entering = event.relatedTarget;
      if (entering instanceof Node && event.currentTarget.contains(entering)) return;
      setDragging(false);
    },
    onDrop(event: React.DragEvent<HTMLDivElement>): void {
      event.preventDefault();
      setDragging(false);
      if (disabled) return;
      // Only the first file: this is one image, and silently uploading the last
      // of five dropped ones would be a coin toss the user did not call.
      const file = event.dataTransfer.files?.[0];
      if (file) void upload(file);
    },
  };

  return { uploading, uploadError, dragging, disabled, inputRef, onInputChange, dropHandlers };
}

/**
 * The sign-in photograph: current image, upload, and remove.
 *
 * The upload path is the brand logo's, step for step — presign, `PUT` to R2 from
 * the browser, finalise the key server-side — so the ownership check, the orphan
 * sweep and the storage config are shared rather than reimplemented. Only the
 * accepted formats differ, and only because this image is never drawn into a PDF.
 *
 * There is no "no photo" state to render: `null` means the member site shows its
 * bundled photograph, so the thumbnail shows that file and the tag says so.
 */
function PhotoField() {
  const t = useTranslations('admin.memberPortal.image');
  const { control, setValue } = useFormContext<MemberPortalFormValues>();
  const loginImageUrl = useWatch({ control, name: 'loginImageUrl' });

  const { uploading, uploadError, dragging, disabled, inputRef, onInputChange, dropHandlers } =
    useImageUpload({
      accept: ACCEPTED_IMAGE_TYPES,
      maxBytes: MAX_PHOTO_BYTES,
      messages: {
        errorType: t('errorType'),
        errorSize: t('errorSize'),
        errorUpload: (status) => t('errorUpload', { status }),
        errorNetwork: t('errorNetwork'),
      },
      presign: requestPortalImageUploadAction,
      finalize: async (photoKey) => {
        const result = await finalizePortalImageAction(photoKey);
        return result.ok ? { ok: true, data: result.data.loginImageUrl } : result;
      },
      onUploaded: (url) => setValue('loginImageUrl', url, { shouldDirty: true }),
    });

  return (
    <div {...stylex.props(styles.stack2)}>
      {/* The whole row is the drop target, not just the thumbnail: a file aimed at
          a 10rem picture is easy to miss, and the block reads as one control. */}
      <div
        {...dropHandlers}
        {...stylex.props(styles.photoRow, dragging && styles.photoRowDragging)}
      >
        <div {...stylex.props(styles.photoFrame, dragging && styles.photoFrameDragging)}>
          <img
            src={loginImageUrl ?? FALLBACK_PHOTO}
            alt={t('alt')}
            {...stylex.props(styles.photoThumb)}
          />
          {/* On the picture, because it describes the picture. Beside the upload
              control it read as that control's heading. */}
          {loginImageUrl === null && !dragging ? (
            <span {...stylex.props(styles.builtInTag)}>{t('none')}</span>
          ) : null}
          {/* Over the picture while a file is in flight above it — the answer to
              "will it land here?" belongs on the target, not beside it. */}
          {dragging ? (
            <span aria-hidden {...stylex.props(styles.dropOverlay)}>
              {t('drop')}
            </span>
          ) : null}
        </div>
        <div {...stylex.props(styles.photoControls)}>
          <div {...stylex.props(styles.photoActions)}>
            {/* The label IS the button; the input inside it is hidden from the
                layout but still the focused, clicked, keyboard-operable control. */}
            <label {...stylex.props(styles.uploadLabel, disabled && styles.uploadLabelBusy)}>
              <Icon name="camera" sw={2.2} width={14} height={14} />
              {uploading ? t('uploading') : loginImageUrl ? t('replace') : t('choose')}
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                aria-label={t('label')}
                onChange={onInputChange}
                disabled={disabled}
                {...stylex.props(styles.srOnly)}
              />
            </label>
            {loginImageUrl && !uploading ? (
              <button
                type="button"
                onClick={() => setValue('loginImageUrl', null, { shouldDirty: true })}
                {...stylex.props(styles.linkBtn)}
              >
                {t('remove')}
              </button>
            ) : null}
          </div>
          <p {...stylex.props(styles.photoHint)}>{t('hint')}</p>
        </div>
      </div>
      {uploadError ? (
        <p role="alert" {...stylex.props(styles.uploadError)}>
          {uploadError}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The portal's wordmark: current mark, upload, and the way back to inheriting one.
 *
 * WHY THIS IS NOT JUST `brand.logoUrl`. It is, until a gym says otherwise —
 * `null` means "inherit", the API resolves `memberPortal.logoUrl ?? brand.logoUrl`
 * before the value reaches the member site, and a gym with one logo needs to do
 * nothing here at all. The field exists so a gym CAN differ, and the reason it
 * would is format: the brand logo is embedded in invoice PDFs and gated to
 * JPEG/PNG for it, while this one is only painted by a browser and may be a WebP.
 *
 * THREE STATES, EXPRESSED AS STATES — the shape {@link ColorControl} uses, because
 * "inherit" is a real, returnable value here too and an empty box would have said
 * "no logo", which this contract cannot store:
 *
 *   inheriting, with a brand logo  → that logo, badged "From brand"
 *   inheriting, with none          → the bundled FormaCore mark, badged "Built-in"
 *   chosen                         → the gym's own upload, and a way back
 *
 * THE THUMBNAIL IS WHITE ON PURPOSE, in both console themes — see `logoFrame`. A
 * gym uploads ONE file where the bundled wordmark is a light/dark PAIR, so the
 * member portal gives a tenant mark a fixed white plate rather than a swap it
 * cannot participate in (`PortalLogo` in `apps/web` argues that out in full). The
 * hint states that contract in words; this frame states it in pixels, which is
 * what makes a white-inked upload fail here — visibly, next to the sentence
 * explaining it — instead of on a member's phone.
 */
function LogoField({ brandLogoUrl }: { brandLogoUrl: string | null }) {
  const t = useTranslations('admin.memberPortal.logo');
  const { control, setValue } = useFormContext<MemberPortalFormValues>();
  const logoUrl = useWatch({ control, name: 'logoUrl' });

  const { uploading, uploadError, dragging, disabled, inputRef, onInputChange, dropHandlers } =
    useImageUpload({
      accept: ACCEPTED_LOGO_TYPES,
      maxBytes: MAX_LOGO_BYTES,
      messages: {
        errorType: t('errorType'),
        errorSize: t('errorSize'),
        errorUpload: (status) => t('errorUpload', { status }),
        errorNetwork: t('errorNetwork'),
      },
      presign: requestPortalLogoUploadAction,
      finalize: async (photoKey) => {
        const result = await finalizePortalLogoAction(photoKey);
        return result.ok ? { ok: true, data: result.data.logoUrl } : result;
      },
      onUploaded: (url) => setValue('logoUrl', url, { shouldDirty: true }),
    });

  const inheriting = logoUrl === null;
  // The same chain the API resolves, one link longer: the portal's own mark, then
  // the brand's, then the bundled file — which is where the contract's `null`
  // stops and the member app's own asset takes over.
  const shown = logoUrl ?? brandLogoUrl ?? WORDMARK_ON_LIGHT;

  return (
    <div {...stylex.props(styles.stack2)}>
      <div
        {...dropHandlers}
        {...stylex.props(styles.photoRow, dragging && styles.photoRowDragging)}
      >
        <div {...stylex.props(styles.logoFrame, dragging && styles.photoFrameDragging)}>
          <img src={shown} alt={t('alt')} {...stylex.props(styles.logoMark)} />
          {/* Names what the mark IS while it is not the gym's own choice — the
              badge half of the same two-part statement `ColorControl` makes. */}
          {inheriting && !dragging ? (
            <span {...stylex.props(styles.builtInTag)}>
              {brandLogoUrl ? t('fromBrandBadge') : t('builtInBadge')}
            </span>
          ) : null}
          {dragging ? (
            <span aria-hidden {...stylex.props(styles.dropOverlay)}>
              {t('drop')}
            </span>
          ) : null}
        </div>
        <div {...stylex.props(styles.photoControls)}>
          <div {...stylex.props(styles.photoActions)}>
            <label {...stylex.props(styles.uploadLabel, disabled && styles.uploadLabelBusy)}>
              <Icon name="camera" sw={2.2} width={14} height={14} />
              {uploading ? t('uploading') : inheriting ? t('choose') : t('replace')}
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_LOGO_TYPES.join(',')}
                aria-label={t('label')}
                onChange={onInputChange}
                disabled={disabled}
                {...stylex.props(styles.srOnly)}
              />
            </label>
            {/* Uploading IS the way out of inheriting, so there is no second
                "customise" button here — only the way back, which mirrors the
                colour cards' `reset` and reads the same in both directions. */}
            {!inheriting && !uploading ? (
              <button
                type="button"
                onClick={() => setValue('logoUrl', null, { shouldDirty: true })}
                {...stylex.props(styles.linkBtn)}
              >
                {brandLogoUrl ? t('resetToBrand') : t('resetToBuiltIn')}
              </button>
            ) : null}
          </div>
          {inheriting ? (
            <p {...stylex.props(styles.photoHint)}>
              {brandLogoUrl ? t('inheritedBrand') : t('inheritedNone')}
            </p>
          ) : null}
          <p {...stylex.props(styles.photoHint)}>{t('hint')}</p>
        </div>
      </div>
      {uploadError ? (
        <p role="alert" {...stylex.props(styles.uploadError)}>
          {uploadError}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A mock of the member sign-in screen, painted in the values currently in the form.
 *
 * WHAT IT COVERS: the two-column frame `AuthPhotoShell` renders — the photograph
 * panel with its legibility scrim, the wordmark and the join strip on one side,
 * the sign-in form on the other — plus the four places the gym's own colours
 * actually land: the submit button's fill (and legible ink over it), the
 * focused field's border, the "forgot?" link, and the join strip's benefit tick.
 * It also reproduces the real shell's stacking order below `lg`, where the form
 * leads and the photo band follows.
 *
 * WHAT IT DELIBERATELY DOES NOT: it is not the member app. The language and
 * light/dark switches, the real sign-in copy, the social buttons, every screen
 * behind the door and the portal's own typography are all absent, and the panel
 * is drawn against the CONSOLE's surface tokens rather than the member site's — a
 * pixel-exact clone would be a second implementation of a screen this app does not
 * own, and it would drift the first time the real one changed. The mock answers
 * "what will my colours and my photograph look like at the door", and stops.
 */
function PortalPreview({
  gymName,
  brandPrimary,
  brandLogoUrl,
}: {
  gymName: string;
  /** The brand colours the portal's `null`s fall through to. */
  brandPrimary: string;
  /** The brand logo the portal's `null` wordmark falls through to. */
  brandLogoUrl: string | null;
}) {
  const t = useTranslations('admin.memberPortal.preview');
  const { control } = useFormContext<MemberPortalFormValues>();
  const primaryColor = useWatch({ control, name: 'primaryColor' });
  const loginImageUrl = useWatch({ control, name: 'loginImageUrl' });
  const logoUrl = useWatch({ control, name: 'logoUrl' });

  // The same resolution `gymPortalTheme` does server-side: a portal colour the
  // gym has not set falls through to the brand's. An in-flight, not-yet-valid hex
  // also falls back, so the mock never paints itself with a broken value.
  const usable = (value: string | null, fallback: string): string =>
    value !== null && HEX_COLOR_PATTERN.test(value) ? value : fallback;
  const primary = usable(primaryColor, brandPrimary);
  const photo = loginImageUrl ?? FALLBACK_PHOTO;
  // The same `memberPortal.logoUrl ?? brand.logoUrl` the API resolves. `null`
  // past both is the bundled mark, which over this dark panel is the white-inked
  // half of the pair and needs no plate — the tenant case is what needs one.
  const tenantLogo = logoUrl ?? brandLogoUrl;

  return (
    <div {...stylex.props(styles.previewFrame)}>
      {/* ------------------------------ the gym side ----------------------------- */}
      <div {...stylex.props(styles.previewAside)}>
        <img src={photo} alt="" {...stylex.props(styles.previewPhoto)} />
        <span aria-hidden {...stylex.props(styles.previewScrim)} />
        {tenantLogo ? (
          <span {...stylex.props(styles.previewLogoPlate)}>
            <img src={tenantLogo} alt="" {...stylex.props(styles.previewLogoMark)} />
          </span>
        ) : (
          <img src={WORDMARK} alt="" {...stylex.props(styles.previewWordmark)} />
        )}
        <div {...stylex.props(styles.previewJoin)}>
          <p {...stylex.props(styles.previewJoinTitle)}>{t('joinTitle', { gym: gymName })}</p>
          <p {...stylex.props(styles.previewBenefit)}>
            {/* The lime, not the gym's colour: the accent as TYPE is not a brand
                slot in the portal either, so the mock must not imply it is — see
                `portal-theme.ts` in @fit/web. */}
            <Icon
              name="check"
              sw={2.6}
              {...stylex.props(styles.previewBenefitIcon, styles.previewBenefitIconAccent)}
            />
            {t('joinBenefit')}
          </p>
          <span {...stylex.props(styles.previewJoinCta)}>{t('joinCta')}</span>
        </div>
      </div>

      {/* ----------------------------- the form side ----------------------------- */}
      <div {...stylex.props(styles.previewForm)}>
        <div {...stylex.props(styles.previewFormBody)}>
          <p {...stylex.props(styles.previewTitle)}>{t('signInTitle')}</p>

          <div {...stylex.props(styles.previewFieldRow)}>
            <span {...stylex.props(styles.previewFieldLabel)}>{t('emailLabel')}</span>
            {/* Drawn focused on purpose: the focus ring is one of the places the
                primary colour actually shows up at the door, and a preview of
                resting fields would never show it. */}
            <span {...stylex.props(styles.previewFieldBox, styles.tintBorder(primary))}>
              {t('emailSample')}
            </span>
          </div>

          <div {...stylex.props(styles.previewFieldRow)}>
            <span {...stylex.props(styles.previewFieldLabel)}>{t('passwordLabel')}</span>
            <span {...stylex.props(styles.previewFieldBox)}>
              <span aria-hidden>••••••••</span>
              <span {...stylex.props(styles.previewForgot, styles.tintText(primary))}>
                {t('forgot')}
              </span>
            </span>
          </div>

          <span
            {...stylex.props(styles.previewSubmit, styles.tintInk(primary, readableInk(primary)))}
          >
            {t('submit')}
          </span>
        </div>
      </div>
    </div>
  );
}

/** The sticky "unsaved changes" bar — appears on any edit, gone once saved/reset. */
function SaveBar() {
  const t = useTranslations('admin.memberPortal.saveBar');
  const {
    reset,
    formState: { isDirty, isSubmitting },
  } = useFormContext<MemberPortalFormValues>();
  return (
    <div
      // Kept mounted for the fade transition; `inert` while hidden so its
      // controls are neither focusable nor announced until there are changes.
      inert={!isDirty}
      aria-hidden={!isDirty}
      {...stylex.props(styles.saveBar, isDirty ? styles.saveBarVisible : styles.saveBarHidden)}
    >
      <div {...stylex.props(styles.saveBarInner)}>
        <span {...stylex.props(styles.saveBarText)}>{t('unsaved')}</span>
        <div {...stylex.props(styles.saveBarDivider)} />
        <button
          type="button"
          onClick={() => reset()}
          disabled={isSubmitting}
          {...stylex.props(styles.discardBtn)}
        >
          {t('discard')}
        </button>
        <Button
          variant="primary"
          size="inline"
          type="submit"
          disabled={isSubmitting}
          icon={<Icon name="check" {...stylex.props(styles.kitGlyph)} />}
          label={isSubmitting ? t('saving') : t('save')}
        />
      </div>
    </div>
  );
}
