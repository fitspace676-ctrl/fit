import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';

/**
 * A person, as a picture or as their initials.
 *
 * TWO SILHOUETTES, AND THE DIFFERENCE CARRIES MEANING. The artboards draw
 * trainers as CIRCLES and the signed-in member as a SQUIRCLE ringed in lime —
 * that is how a member tells "this is me" from "this is staff" at a glance, in
 * a header where the two can sit inches apart. `shape` is therefore not a
 * styling preference; `member` is the identity mark and `person` is everyone
 * else.
 *
 * The initials fallback is mono, like every other machine-derived string in this
 * product (ids, prices, clock times). It replaced a photographic placeholder:
 * the direction bans photographic decoration, and a grey silhouette portrait was
 * the one image on an otherwise drawn page.
 */

const styles = stylex.create({
  base: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: 'var(--fc-quiet)',
    color: 'var(--fc-on-quiet)',
    fontFamily: 'var(--font-family-code)',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1,
    userSelect: 'none',
  },
  person: {
    borderRadius: 'var(--radius-full)',
  },
  member: {
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  /**
   * The lime ring. Drawn as a shadow rather than a border so it sits OUTSIDE the
   * box — a border would eat into the image, and on the squircle it would follow
   * the outer radius while the photo followed the inner one, leaving a visible
   * seam at each corner.
   */
  ring: {
    boxShadow: '0 0 0 2px var(--color-background-card), 0 0 0 4px var(--color-accent)',
  },
  img: {
    height: '100%',
    width: '100%',
    objectFit: 'cover',
  },
});

export type AvatarShape = 'person' | 'member';

export interface AvatarProps {
  /** Used for the initials fallback and as the image's accessible name. */
  name: string;
  src?: string | null;
  /** Pixel diameter. @default 40 */
  size?: number;
  /** @default 'person' */
  shape?: AvatarShape;
  /** Draws the lime identity ring. */
  ring?: boolean;
  xstyle?: StyleXStyles;
}

/**
 * First letters of the first two words — "Nino Beridze" → "NB", "Nino" → "N".
 * Trimmed and filtered so a double space or a trailing one cannot produce an
 * empty initial.
 */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

export function Avatar({
  name,
  src,
  size = 40,
  shape = 'person',
  ring = false,
  xstyle,
}: AvatarProps) {
  return (
    <span
      {...stylex.props(styles.base, styles[shape], ring && styles.ring, xstyle)}
      // Size is per-instance, so it is the one thing here that cannot be a
      // compiled class. `fontSize` scales the initials with the box.
      style={{ height: size, width: size, fontSize: Math.round(size * 0.38) }}
    >
      {src ? <img src={src} alt={name} {...stylex.props(styles.img)} /> : initialsOf(name)}
    </span>
  );
}
