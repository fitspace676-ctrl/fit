import type { CSSProperties } from 'react';

/**
 * The cover photo's surface: a teal-to-navy gradient, lit from the top left,
 * under a fine grain. The landing's Built For cards set the look; the hero
 * panels and the Built For hub cards reuse it so every brand card matches.
 */
export const COVER_SURFACE: CSSProperties = {
  backgroundColor: '#1F4A72',
  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.72' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%23fff' filter='url(%23n)' opacity='.65' d='M0 0h160v160H0z'/%3E%3C/svg%3E"), radial-gradient(ellipse at top left, #7FB3C8, transparent 55%), linear-gradient(120deg, #2F7896 15%, #1F4A72 100%)`,
  backgroundSize: '160px 160px, cover, cover',
  backgroundBlendMode: 'soft-light, normal, normal',
};
