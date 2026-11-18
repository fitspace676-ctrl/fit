'use client';

import { createContext, useContext, type ReactNode, type ImgHTMLAttributes } from 'react';
import { consoleBrandAssets } from '@/lib/brand-skins';
import { adminPath } from '@/lib/base-path';

interface ConsoleBrand {
  slug: string | null;
  name?: string;
  logoUrl?: string | null;
}
const Context = createContext<ConsoleBrand>({ slug: null });

export function ConsoleBrandProvider({ brand, children }: { brand: ConsoleBrand; children: ReactNode }) {
  return <Context.Provider value={brand}>{children}</Context.Provider>;
}

/** Uploaded logos win; the sign-in photograph always needs the white-ink pair. */
export function ConsoleLogo({ mode, slug, ...props }: ImgHTMLAttributes<HTMLImageElement> & {
  mode: 'light' | 'dark'; slug?: string | null;
}) {
  const brand = useContext(Context);
  const skin = consoleBrandAssets(slug ?? brand.slug);
  const src = brand.logoUrl ?? (mode === 'dark' ? skin?.onDark : skin?.onLight)
    ?? adminPath(mode === 'dark' ? '/logodark.png' : '/logolight.png');
  return <img {...props} src={src} alt={brand.name ?? skin?.name ?? props.alt ?? 'FormaCore'} />;
}
