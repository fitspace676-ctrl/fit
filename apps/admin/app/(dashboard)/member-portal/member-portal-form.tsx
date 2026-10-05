'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { z } from 'zod';
import {
  DEFAULT_PORTAL_ACCENT,
  HEX_COLOR_PATTERN,
  JOIN_CARD_LIMITS,
  gymJoinCardSettingsSchema,
  resolveJoinCard,
  type GymJoinCardCopy,
  type GymSettings,
  type JoinCardDefaults,
} from '@fit/types';
import { Button, Card } from '@fit/ui-kit';
import { Form, Icon, useFormContext, useToast, useWatch, useZodForm } from '@/components/ui';
import { AccentColorField } from '@/components/accent-color-field';
import {
  MAX_PHOTO_UPLOAD_BYTES,
  PHOTO_UPLOAD_TYPES,
  useImageUpload as useSharedImageUpload,
} from '@/components/use-image-upload';
import {
  finalizePortalFaviconAction,
  finalizePortalImageAction,
  finalizePortalLogoAction,
  requestPortalImageUploadAction,
  requestPortalLogoUploadAction,
  updateMemberPortalAction,
} from './actions';
import {
  JoinCardField,
  type JoinCardCopyValues,
  type JoinCardLocale,
  type JoinCardValues,
} from './join-card-field';

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
 * thumbnail is a fixed white frame, and on white this is the correct half, the
 * file a member on the light theme actually sees.
 */
const WORDMARK_ON_LIGHT = `${BASE_PATH}/logolight.png`;

/**
 * Accepted photograph MIME types. Wider than the brand logo's JPEG/PNG pair,
 * which is narrow because the logo is also drawn into invoice PDFs by `pdfkit`;
 * this image is only ever rendered by a browser, so WebP — the format the
 * bundled default itself is in — is allowed.
 */
const ACCEPTED_IMAGE_TYPES = PHOTO_UPLOAD_TYPES;

/** Client-side size ceiling (bytes) — a friendly guard before the signed PUT. */
const MAX_PHOTO_BYTES = MAX_PHOTO_UPLOAD_BYTES;

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

/**
 * Accepted tab-icon formats. PNG and ICO are the two every browser shows in a tab
 * and on a bookmark; WebP is left out because Safari does not use it as a favicon.
 */
const ACCEPTED_FAVICON_TYPES = ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon'];

/** Client-side size ceiling (bytes) for the tab icon: a 512px square PNG is well under it. */
const MAX_FAVICON_BYTES = 1024 * 1024;

/** The bundled FormaCore icon the member site shows in the tab when a gym has no mark at all. */
const BUILT_IN_ICON = `${BASE_PATH}/icon.png`;

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
  // "From brand" — the badge that says this colour is not the gym's own choice.
  // The native colour well, stripped of its chrome so it reads as a swatch.
  // The inherited state's stand-in for it: a flat chip, deliberately NOT a
  // control, because the colour it shows is not this screen's to change.
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
   * The logo thumbnail, at card width, on a fixed white frame in both console
   * themes so the file reads the same whichever theme the owner works in. The
   * member portal draws the upload with nothing behind it (see `PortalLogo` in
   * `apps/web`); the live preview beside this card shows it over the actual
   * sign-in photograph.
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

  /* --------------------------------- tab icon -------------------------------- */
  // The icon at the sizes a browser actually draws it, beside the large preview:
  // a mark that reads at 64px can still be a smudge at 16px, and this is where
  // the owner finds out.
  faviconSizes: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '1.25rem',
  },
  faviconSize: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.375rem',
    color: 'var(--color-text-secondary)',
    fontSize: '0.75rem',
  },
  faviconImg: {
    display: 'block',
    objectFit: 'contain',
  },
  favicon64: { width: '4rem', height: '4rem' },
  favicon32: { width: '2rem', height: '2rem' },
  favicon16: { width: '1rem', height: '1rem' },

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
  // The tenant mark as the member door draws it: the uploaded file straight on
  // the photograph, no plate. `relative` to clear the scrim, like every other
  // element on this panel.
  previewLogoMark: {
    position: 'relative',
    alignSelf: 'flex-start',
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
  previewJoinSub: {
    margin: 0,
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    lineHeight: 1.5,
    color: 'rgba(255, 255, 255, 0.72)',
  },
  // Where the card would be, so "hidden" reads as a choice rather than a bug.
  previewJoinHidden: {
    position: 'relative',
    margin: 0,
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.32)',
    padding: '0.875rem',
    fontSize: '0.75rem',
    color: 'rgba(255, 255, 255, 0.8)',
  },
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
  faviconUrl: string | null;
  primaryColor: string | null;
  /** The sign-in join card, as `JoinCardField` edits it. */
  joinCard: JoinCardValues;
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

/** One language's stored copy as the form holds it: `null` lines become empty fields. */
function toCopyValues(copy: GymJoinCardCopy): JoinCardCopyValues {
  return {
    title: copy.title ?? '',
    subtitle: copy.subtitle ?? '',
    benefits: copy.benefits,
    cta: copy.cta ?? '',
  };
}

/** Map the API settings shape onto the form's values. */
function toFormValues(settings: GymSettings): MemberPortalFormValues {
  // Parsed, so settings saved before the card existed still give the form a
  // complete value to bind to.
  const joinCard = gymJoinCardSettingsSchema.parse(settings.memberPortal.joinCard ?? {});
  return {
    loginImageUrl: settings.memberPortal.loginImageUrl,
    logoUrl: settings.memberPortal.logoUrl,
    faviconUrl: settings.memberPortal.faviconUrl ?? null,
    primaryColor: settings.memberPortal.primaryColor,
    joinCard: {
      hidden: joinCard.hidden,
      ka: toCopyValues(joinCard.ka),
      en: toCopyValues(joinCard.en),
    },
  };
}

/** Drop the benefit rows left blank, so an empty row is not saved as a tick. */
function withoutBlankBenefits(copy: JoinCardCopyValues): JoinCardCopyValues {
  return {
    ...copy,
    benefits: copy.benefits?.map((line) => line.trim()).filter(Boolean) ?? null,
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
export function MemberPortalForm({
  initial,
  joinDefaults,
}: {
  initial: GymSettings;
  /** The join card's built-in copy per language, read from the portal's catalogue. */
  joinDefaults: Record<JoinCardLocale, JoinCardDefaults>;
}) {
  const t = useTranslations('admin.memberPortal');
  const router = useRouter();
  const { toast } = useToast();
  // The language being edited on the join card, which the preview also shows.
  const [joinLocale, setJoinLocale] = useState<JoinCardLocale>('ka');

  // The API's own limits, with the message in the console's language. Lines are
  // trimmed first so trailing spaces do not count against the limit.
  const line = (max: number) => z.string().trim().max(max, t('joinCard.tooLong', { max }));
  const joinCopySchema = z.object({
    title: line(JOIN_CARD_LIMITS.title),
    subtitle: line(JOIN_CARD_LIMITS.subtitle),
    benefits: z.array(line(JOIN_CARD_LIMITS.benefit)).max(JOIN_CARD_LIMITS.benefits).nullable(),
    cta: line(JOIN_CARD_LIMITS.cta),
  });

  // Built with a translated message so the inline hex error reads in the active
  // locale; the pattern itself is the contract's, so the form rejects exactly
  // what the API would.
  const schema = z.object({
    loginImageUrl: z.string().url().nullable(),
    logoUrl: z.string().url().nullable(),
    faviconUrl: z.string().url().nullable(),
    primaryColor: z.string().regex(HEX_COLOR_PATTERN, t('colors.invalid')).nullable(),
    joinCard: z.object({ hidden: z.boolean(), ka: joinCopySchema, en: joinCopySchema }),
  });

  const form = useZodForm(schema, { defaultValues: toFormValues(initial) });

  async function handleSubmit(values: MemberPortalFormValues): Promise<void> {
    const result = await updateMemberPortalAction({
      ...values,
      joinCard: {
        hidden: values.joinCard.hidden,
        ka: withoutBlankBenefits(values.joinCard.ka),
        en: withoutBlankBenefits(values.joinCard.en),
      },
    });
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
              <AccentColorField
                name="primaryColor"
                label={t('colors.primaryLabel')}
                description={t('colors.primaryDesc')}
                brand={initial.brand.primaryColor}
                namespace="admin.memberPortal.colors"
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
            <h2 {...stylex.props(styles.cardTitle)}>{t('favicon.title')}</h2>
            <p {...stylex.props(styles.cardDesc)}>{t('favicon.subtitle')}</p>
            <FaviconField brandLogoUrl={initial.brand.logoUrl} />
          </Card>

          <Card padding="none" xstyle={styles.card}>
            <h2 {...stylex.props(styles.cardTitle)}>{t('image.title')}</h2>
            <p {...stylex.props(styles.cardDesc)}>{t('image.subtitle')}</p>
            <PhotoField />
          </Card>

          <Card padding="none" xstyle={styles.card}>
            <h2 {...stylex.props(styles.cardTitle)}>{t('joinCard.title')}</h2>
            <p {...stylex.props(styles.cardDesc)}>{t('joinCard.subtitle')}</p>
            <JoinCardField
              locale={joinLocale}
              onLocaleChange={setJoinLocale}
              defaults={joinDefaults}
            />
          </Card>
        </div>

        <div {...stylex.props(styles.previewColumn)}>
          <Card padding="none" xstyle={styles.card}>
            <h2 {...stylex.props(styles.cardTitle)}>{t('preview.title')}</h2>
            <p {...stylex.props(styles.cardDesc)}>{t('preview.subtitle')}</p>
            <PortalPreview
              gymName={initial.brand.name}
              defaultPrimary={DEFAULT_PORTAL_ACCENT}
              brandLogoUrl={initial.brand.logoUrl}
              joinLocale={joinLocale}
              joinDefaults={joinDefaults[joinLocale]}
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
 * The shared presign → `PUT` → finalise flow (`@/components/use-image-upload`),
 * held while this form is saving. Every upload on this screen resolves to the
 * stored public URL, which is then written into the form.
 */
function useImageUpload(options: Omit<Parameters<typeof useSharedImageUpload<string>>[0], 'busy'>) {
  const { formState } = useFormContext<MemberPortalFormValues>();
  return useSharedImageUpload<string>({ ...options, busy: formState.isSubmitting });
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
 * The thumbnail is a fixed white frame in both console themes (see `logoFrame`).
 * The member portal itself draws the upload as is, with no plate behind it, and
 * the hint says so; the live preview shows the mark over the sign-in photograph,
 * which is where a logo that only reads on white would disappear.
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
 * The member site's browser-tab icon: current icon at the sizes a tab draws it,
 * upload, and the way back to using the logo.
 *
 * `null` means "no icon of its own", and the member site then puts the portal
 * logo in the tab (`memberPortal.logoUrl ?? brand.logoUrl`), and with no logo at
 * all the bundled FormaCore icon. That chain is what is shown while inheriting,
 * badged with where it comes from, the same three-state shape as `LogoField`.
 */
function FaviconField({ brandLogoUrl }: { brandLogoUrl: string | null }) {
  const t = useTranslations('admin.memberPortal.favicon');
  const { control, setValue } = useFormContext<MemberPortalFormValues>();
  const faviconUrl = useWatch({ control, name: 'faviconUrl' });
  const logoUrl = useWatch({ control, name: 'logoUrl' });

  const { uploading, uploadError, dragging, disabled, inputRef, onInputChange, dropHandlers } =
    useImageUpload({
      accept: ACCEPTED_FAVICON_TYPES,
      maxBytes: MAX_FAVICON_BYTES,
      messages: {
        errorType: t('errorType'),
        errorSize: t('errorSize'),
        errorUpload: (status) => t('errorUpload', { status }),
        errorNetwork: t('errorNetwork'),
      },
      // Same `logos` prefix and the same presign as the wordmark.
      presign: requestPortalLogoUploadAction,
      finalize: async (photoKey) => {
        const result = await finalizePortalFaviconAction(photoKey);
        return result.ok ? { ok: true, data: result.data.faviconUrl } : result;
      },
      onUploaded: (url) => setValue('faviconUrl', url, { shouldDirty: true }),
    });

  const inheriting = faviconUrl === null;
  const tenantLogo = logoUrl ?? brandLogoUrl;
  const shown = faviconUrl ?? tenantLogo ?? BUILT_IN_ICON;
  const sizes = [
    { px: 64, xstyle: styles.favicon64 },
    { px: 32, xstyle: styles.favicon32 },
    { px: 16, xstyle: styles.favicon16 },
  ];

  return (
    <div {...stylex.props(styles.stack2)}>
      <div
        {...dropHandlers}
        {...stylex.props(styles.photoRow, dragging && styles.photoRowDragging)}
      >
        <div {...stylex.props(styles.logoFrame, dragging && styles.photoFrameDragging)}>
          <div {...stylex.props(styles.faviconSizes)}>
            {sizes.map(({ px, xstyle }) => (
              <span key={px} {...stylex.props(styles.faviconSize)}>
                <img
                  src={shown}
                  alt={px === 64 ? t('alt') : ''}
                  {...stylex.props(styles.faviconImg, xstyle)}
                />
                {px} px
              </span>
            ))}
          </div>
          {inheriting && !dragging ? (
            <span {...stylex.props(styles.builtInTag)}>
              {tenantLogo ? t('fromLogoBadge') : t('builtInBadge')}
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
                accept={ACCEPTED_FAVICON_TYPES.join(',')}
                aria-label={t('label')}
                onChange={onInputChange}
                disabled={disabled}
                {...stylex.props(styles.srOnly)}
              />
            </label>
            {!inheriting && !uploading ? (
              <button
                type="button"
                onClick={() => setValue('faviconUrl', null, { shouldDirty: true })}
                {...stylex.props(styles.linkBtn)}
              >
                {tenantLogo ? t('resetToLogo') : t('resetToBuiltIn')}
              </button>
            ) : null}
          </div>
          {inheriting ? (
            <p {...stylex.props(styles.photoHint)}>
              {tenantLogo ? t('inheritedLogo') : t('inheritedNone')}
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
  defaultPrimary,
  brandLogoUrl,
  joinLocale,
  joinDefaults,
}: {
  gymName: string;
  /** The brand colours the portal's `null`s fall through to. */
  defaultPrimary: string;
  /** The brand logo the portal's `null` wordmark falls through to. */
  brandLogoUrl: string | null;
  /** The language the join card is being edited in, which the mock shows. */
  joinLocale: JoinCardLocale;
  /** The built-in join copy in that language. */
  joinDefaults: JoinCardDefaults;
}) {
  const t = useTranslations('admin.memberPortal.preview');
  const tJoin = useTranslations('admin.memberPortal.joinCard');
  const { control } = useFormContext<MemberPortalFormValues>();
  const primaryColor = useWatch({ control, name: 'primaryColor' });
  const loginImageUrl = useWatch({ control, name: 'loginImageUrl' });
  const logoUrl = useWatch({ control, name: 'logoUrl' });
  const joinCard = useWatch({ control, name: 'joinCard' });
  // The member site's own resolution, so the mock and the door cannot disagree.
  // In-progress edits go through the schema leniently: a line over its limit
  // shows the built-in text here until it fits, as it would after saving.
  const parsedJoin = gymJoinCardSettingsSchema.safeParse({
    hidden: joinCard.hidden,
    [joinLocale]: withoutBlankBenefits(joinCard[joinLocale]),
  });
  const join = resolveJoinCard(
    parsedJoin.success
      ? parsedJoin.data
      : gymJoinCardSettingsSchema.parse({ hidden: joinCard.hidden }),
    joinLocale,
    joinDefaults,
    gymName,
  );

  // The same resolution `gymPortalTheme` does server-side: a portal colour the
  // gym has not set falls through to the brand's. An in-flight, not-yet-valid hex
  // also falls back, so the mock never paints itself with a broken value.
  const usable = (value: string | null, fallback: string): string =>
    value !== null && HEX_COLOR_PATTERN.test(value) ? value : fallback;
  const primary = usable(primaryColor, defaultPrimary);
  const photo = loginImageUrl ?? FALLBACK_PHOTO;
  // The same `memberPortal.logoUrl ?? brand.logoUrl` the API resolves. `null`
  // past both is the bundled mark, which over this dark panel is the white-inked
  // half of the pair.
  const tenantLogo = logoUrl ?? brandLogoUrl;

  return (
    <div {...stylex.props(styles.previewFrame)}>
      {/* ------------------------------ the gym side ----------------------------- */}
      <div {...stylex.props(styles.previewAside)}>
        <img src={photo} alt="" {...stylex.props(styles.previewPhoto)} />
        <span aria-hidden {...stylex.props(styles.previewScrim)} />
        {tenantLogo ? (
          <img src={tenantLogo} alt="" {...stylex.props(styles.previewLogoMark)} />
        ) : (
          <img src={WORDMARK} alt="" {...stylex.props(styles.previewWordmark)} />
        )}
        {join ? (
          <div {...stylex.props(styles.previewJoin)}>
            <p {...stylex.props(styles.previewJoinTitle)}>{join.title}</p>
            <p {...stylex.props(styles.previewJoinSub)}>{join.subtitle}</p>
            {join.benefits.map((benefit, index) => (
              <p key={index} {...stylex.props(styles.previewBenefit)}>
                {/* The gym's colour: the portal paints its accent type, links and
                    ticks, from the primary too, see `portal-theme.ts` in @fit/web. */}
                <Icon
                  name="check"
                  sw={2.6}
                  {...stylex.props(styles.previewBenefitIcon, styles.tintText(primary))}
                />
                {benefit}
              </p>
            ))}
            <span {...stylex.props(styles.previewJoinCta)}>{join.cta}</span>
          </div>
        ) : (
          <p {...stylex.props(styles.previewJoinHidden)}>{tJoin('hiddenPreview')}</p>
        )}
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
