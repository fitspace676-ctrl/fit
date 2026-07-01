'use client';

import { motion } from 'motion/react';
import { Badge, Card, Icon } from '@/src/components/ui';

/**
 * Decorative hero artwork for the formacore landing redesign. Rendered on the
 * right of the hero; after mount it eases in from the left so the element
 * "slides into" place once the page has loaded. Client component because the
 * motion animation runs in the browser.
 *
 * Replaces the old light-only raster with a branded glass preview card built
 * from the shared UI kit (Card / Badge / Icon), so it reads on both the light
 * and dark member skins. Purely decorative — hidden from assistive tech.
 */
export function HeroElement() {
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, x: -64 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
      className="pointer-events-none mx-auto w-full max-w-md select-none lg:mx-0 lg:ml-auto"
    >
      <Card glow className="p-5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white">
              <Icon name="dumbbell" className="h-5 w-5" sw={2.1} />
            </span>
            Fit
          </span>
          <Badge tone="brand" icon="flame">
            Live
          </Badge>
        </div>

        <div className="mt-5 space-y-3">
          {[
            { icon: 'calendar' as const, w: 'w-2/3' },
            { icon: 'clock' as const, w: 'w-1/2' },
            { icon: 'users' as const, w: 'w-3/5' },
          ].map((row) => (
            <div
              key={row.icon}
              className="flex items-center gap-3 rounded-btn bg-ink-50 px-3 py-2.5 dark:bg-white/[0.04]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                <Icon name={row.icon} className="h-4 w-4" sw={2.1} />
              </span>
              <span className={`h-2 rounded-pill bg-ink-200 dark:bg-white/10 ${row.w}`} />
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between rounded-btn bg-[linear-gradient(135deg,#7C3AED,#EC4899)] px-4 py-3 text-white">
          <span className="text-sm font-semibold">Pro</span>
          <span className="font-display text-lg font-extrabold">99₾</span>
        </div>
      </Card>
    </motion.div>
  );
}
