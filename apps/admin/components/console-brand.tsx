import type { ImgHTMLAttributes } from 'react';
import { adminPath } from '@/lib/base-path';

/**
 * The staff console's logo — always FormaCore. The console is FormaCore's
 * product whatever gym it is managing, so no uploaded gym logo or bundled gym
 * skin ever replaces it here (the member portal and apps carry the gym's brand).
 * `mode` picks the ink for the surface: `dark` for dark backgrounds.
 */
export function ConsoleLogo({
  mode,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { mode: 'light' | 'dark' }) {
  return (
    <img
      {...props}
      src={adminPath(mode === 'dark' ? '/logodark.png' : '/logolight.png')}
      alt="FormaCore"
    />
  );
}
