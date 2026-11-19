'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { BrandSkin } from '@/lib/brand-skins';

const BrandLogoContext = createContext<BrandSkin['logo'] | null>(null);

/** Only the asset pair crosses the client boundary; theme vars remain server-rendered. */
export function BrandSkinProvider({
  logo,
  children,
}: {
  logo: BrandSkin['logo'];
  children: ReactNode;
}) {
  return <BrandLogoContext.Provider value={logo}>{children}</BrandLogoContext.Provider>;
}

export function useBrandLogo() {
  return useContext(BrandLogoContext);
}
