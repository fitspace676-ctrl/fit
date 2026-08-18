'use client';

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { focus } from '@/src/components/ui/kit';
import { NAV_ITEMS, isActive } from './nav-items';
import { navCapsule } from './nav-capsule';
import { NotificationBell } from './notification-bell';
import { AccountMenu } from './account-menu';

// The portal's primary navigation: a floating capsule pinned to the foot of the
// screen, at EVERY width.
//
// This is the direction's own instruction rather than a layout preference. The
// moodboard names exactly one permanently elevated element in the product — the
// floating nav — and gives it a capsule silhouette. Everything else sits flat on
// the canvas, which is why `--shadow-high` appears here and almost nowhere else.
//
// It replaced a split arrangement: a centred nav inside the desktop header plus a
// separate full-width tab bar under `lg`. Two navigations meant two sets of
// states to keep in step and two answers to "where am I" depending on how wide
// the window happened to be. One capsule is the same object at 390px and at
// 1400px — only the labels drop away on the narrowest screens, where six
// Georgian words cannot fit and the icons carry recognition on their own.
//
// The capsule is the product's ONE glass surface. The direction bans
// glassmorphism everywhere else, and this is the element that earns the
// exception: it is the only thing that permanently sits over content, and opaque
// it simply deleted a strip of the page. Translucent with a real backdrop blur,
// what is underneath stays readable as context while the capsule keeps a defined
// edge of its own.

const styles = stylex.create({
  // The rail spans the viewport so the capsule can centre in it, but it must not
  // swallow clicks on the content it floats over — only the capsule takes them.
  rail: {
    position: 'fixed',
    insetInline: 0,
    bottom: 0,
    zIndex: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Both shrink on a phone. Seven controls plus the bell is a fixed amount of
    // object; what the rail can give back is the space around and between them.
    gap: { default: '0.5rem', '@media (min-width: 640px)': '0.75rem' },
    pointerEvents: 'none',
    paddingInline: { default: '0.75rem', '@media (min-width: 640px)': '1rem' },
    // Sit above the iOS home indicator rather than under it.
    paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
  },
  capsule: {
    pointerEvents: 'auto',
    display: 'flex',
    maxWidth: '100%',
    minWidth: 0,
    alignItems: 'center',
    gap: { default: '0.125rem', '@media (min-width: 640px)': '0.25rem' },
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-glass-border)',
    backgroundColor: 'var(--fc-glass)',
    // The one glass surface in the product. It earns the exception by being the
    // only element that permanently covers content: opaque, the capsule punched
    // a hole through whatever it floated over. `saturate` keeps the lime blocks
    // underneath from going grey as they pass behind it.
    backdropFilter: 'blur(20px) saturate(1.6)',
    padding: '0.375rem',
    boxShadow: 'var(--shadow-high)',
  },
  bellSlot: {
    pointerEvents: 'auto',
    flexShrink: 0,
  },
});

/** The floating primary navigation, shown at every width. */
export function BottomNav() {
  const t = useTranslations('member.nav');
  const tShell = useTranslations('member.shell');
  const pathname = usePathname();

  return (
    <div {...stylex.props(styles.rail)}>
      {/* The landmark names the WHOLE navigation, not its first item. It was
          labelled `nav.home`, so a screen reader announced a six-item region as
          "Home navigation" — and then read "Home" again as the first link
          inside it. */}
      <nav {...stylex.props(styles.capsule)} aria-label={tShell('primaryNav')}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-label={t(item.key)}
              aria-current={active ? 'page' : undefined}
              {...stylex.props(
                navCapsule.item,
                active ? navCapsule.active : navCapsule.idle,
                focus.ring,
              )}
            >
              <Icon name={item.icon} sw={2.1} {...stylex.props(navCapsule.icon)} />
              <span {...stylex.props(navCapsule.label)}>{t(item.key)}</span>
            </Link>
          );
        })}

        {/* Inside the capsule, drawn as one more control in it: the account is
            not a destination, but it is the member's own entry to the portal's
            chrome, and the thumb looks for it where everything else it can press
            already is. It opens a panel instead of navigating, which is the only
            difference the markup makes — same pill, same states, same label rule
            as the six links beside it. */}
        <AccountMenu />
      </nav>

      {/* Its own capsule, not an item in the nav: the nav answers "where do I
          go", the bell answers "what happened while I was away". Same material,
          deliberately separate objects. */}
      <div {...stylex.props(styles.bellSlot)}>
        <NotificationBell />
      </div>
    </div>
  );
}
