'use client';

import { motion } from 'motion/react';

/**
 * Decorative hero artwork for the light-mode landing redesign. Rendered on the
 * right of the hero; after mount it eases in from the left so the element
 * "slides into" place once the page has loaded. Client component because the
 * motion animation runs in the browser. Purely decorative — hidden from
 * assistive tech.
 */
export function HeroElement() {
  return (
    <motion.img
      src="/elementlight.webp"
      alt=""
      aria-hidden
      draggable={false}
      initial={{ opacity: 0, x: -64 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
      className="pointer-events-none mx-auto w-full max-w-md select-none lg:mx-0 lg:ml-auto"
    />
  );
}
