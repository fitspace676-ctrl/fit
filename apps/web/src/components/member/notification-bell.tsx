'use client';

import { useCallback, useEffect, useState } from 'react';
import { Popover, focus } from '@/src/components/ui/kit';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';
import { Icon, type IconName } from '@/src/components/ui';

// The bell + inbox, on the portal's own `Popover`.
//
// The panel's surface — radius, hairline, popover background, elevation, and the
// clipping that keeps the first and last rows inside the corners — belongs to
// the Popover now; this file had been restating all of it on an inner wrapper,
// which meant two nested rounded boxes with two borders once the kit's own panel
// arrived. The width is the Popover's `width` prop.
//
// The `/api/notifications` fetch and the mark-read behaviour are unchanged.

/** One inbox row as the `/api/notifications` proxy returns it (mirrors the API's
 * `NotificationDto`). */
interface InboxItem {
  id: string;
  category: 'BOOKING' | 'BILLING' | 'SYSTEM';
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

interface InboxResponse {
  data: InboxItem[];
  unread: number;
}

/** The icon rendered per notification category. */
const CATEGORY_ICON: Record<InboxItem['category'], IconName> = {
  BOOKING: 'calendar',
  BILLING: 'card',
  SYSTEM: 'info',
};

const styles = stylex.create({
  // FormaCore redesign: matched to the other header controls — a 40px bordered
  // button on the `--fc-control` surface at the `inner` radius, so bell, cart,
  // theme track and avatar read as one row of hardware rather than four
  // differently-shaped things.
  // The bell is its own floating capsule beside the nav, so it carries the same
  // glass material — same surface, same hairline, same blur. Two capsules that
  // look like one system, kept apart because they answer different questions:
  // "where do I go" and "what happened while I was away".
  bell: {
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
    height: '3.625rem',
    width: '3.625rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-glass-border)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--fc-glass)',
    backdropFilter: 'blur(20px) saturate(1.6)',
    boxShadow: 'var(--shadow-high)',
    color: {
      default: 'var(--color-icon-secondary)',
      ':hover': 'var(--color-icon-primary)',
    },
    cursor: 'pointer',
    transitionProperty: 'color',
    transitionDuration: '150ms',
  },
  bellIcon: {
    height: '1.25rem',
    width: '1.25rem',
  },
  unread: {
    position: 'absolute',
    right: '-0.125rem',
    top: '-0.125rem',
    display: 'grid',
    placeItems: 'center',
    height: '18px',
    minWidth: '18px',
    paddingInline: '0.25rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    fontSize: '10px',
    fontWeight: 700,
    lineHeight: 1,
    boxShadow: '0 0 0 2px var(--color-background-surface)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
  },
  headerTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  markAll: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: {
      default: 'var(--color-text-accent)',
      ':hover': 'var(--color-accent)',
    },
    cursor: 'pointer',
  },
  empty: {
    display: 'grid',
    placeItems: 'center',
    gap: '0.5rem',
    paddingInline: '1rem',
    paddingBlock: '2.5rem',
    textAlign: 'center',
  },
  emptyIcon: {
    height: '1.5rem',
    width: '1.5rem',
    color: 'var(--color-text-disabled)',
  },
  emptyText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  list: {
    maxHeight: '22rem',
    overflowY: 'auto',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  item: {
    display: 'flex',
    width: '100%',
    alignItems: 'flex-start',
    gap: '0.75rem',
    borderWidth: 0,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    textAlign: 'left',
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  itemFirst: {
    borderTopWidth: 0,
  },
  itemRead: {
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
    },
  },
  itemUnread: {
    backgroundColor: {
      default: 'var(--color-accent-muted)',
      ':hover': 'var(--color-accent-muted)',
    },
  },
  itemIcon: {
    marginTop: '0.125rem',
    display: 'grid',
    placeItems: 'center',
    height: '2rem',
    width: '2rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  itemIconRead: {
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
  },
  itemIconUnread: {
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  glyph: {
    height: '1rem',
    width: '1rem',
  },
  body: {
    minWidth: 0,
    flex: 1,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  title: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  dot: {
    height: '0.375rem',
    width: '0.375rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
  },
  text: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    marginTop: '0.125rem',
    marginBottom: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  time: {
    display: 'block',
    marginTop: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 500,
    color: 'var(--color-text-disabled)',
  },
});

/**
 * Member notification bell + inbox dropdown (T6.10), on the portal kit.
 *
 * Loads the caller's recent notifications + unread count from the same-origin
 * `/api/notifications` proxy (which forwards the httpOnly session token to the
 * inbox API, T8.4). The bell shows an unread badge; opening the kit's `Popover`
 * lists the items, tapping one marks it read and follows its deep-link, and a
 * header action marks everything read. All reads/writes are best-effort — a
 * failure leaves the bell quietly empty rather than breaking the header.
 */
export function NotificationBell() {
  const t = useTranslations('member.shell');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { credentials: 'same-origin' });
      if (!res.ok) return;
      const body = (await res.json()) as InboxResponse;
      setItems(Array.isArray(body.data) ? body.data : []);
      setUnread(typeof body.unread === 'number' ? body.unread : 0);
    } catch {
      /* best-effort: leave the bell as-is on a transient failure */
    }
  }, []);

  // Populate the badge on mount, and refresh the list each time the panel opens.
  useEffect(() => {
    void load();
  }, [load]);

  const markRead = useCallback(async (ids?: string[]) => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids ? { ids } : {}),
      });
      if (!res.ok) return;
      const body = (await res.json()) as { unread?: number };
      const now = new Date().toISOString();
      setItems((prev) =>
        prev.map((n) =>
          (ids ? ids.includes(n.id) : true) && !n.readAt ? { ...n, readAt: now } : n,
        ),
      );
      if (typeof body.unread === 'number') setUnread(body.unread);
    } catch {
      /* best-effort */
    }
  }, []);

  const onItemClick = (item: InboxItem): void => {
    if (!item.readAt) void markRead([item.id]);
    if (item.href) {
      setOpen(false);
      router.push(item.href);
    }
  };

  const panel = (
    <>
      <div {...stylex.props(styles.header)}>
        <p {...stylex.props(styles.headerTitle)}>{t('notifications')}</p>
        {unread > 0 && (
          <button type="button" onClick={() => void markRead()} {...stylex.props(styles.markAll)}>
            {t('markAllRead')}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div {...stylex.props(styles.empty)}>
          <Icon name="check" {...stylex.props(styles.emptyIcon)} />
          <p {...stylex.props(styles.emptyText)}>{t('noNotifications')}</p>
        </div>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {items.map((item, index) => {
            const read = Boolean(item.readAt);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onItemClick(item)}
                  {...stylex.props(
                    styles.item,
                    index === 0 && styles.itemFirst,
                    read ? styles.itemRead : styles.itemUnread,
                  )}
                >
                  <span
                    {...stylex.props(
                      styles.itemIcon,
                      read ? styles.itemIconRead : styles.itemIconUnread,
                    )}
                  >
                    <Icon
                      name={CATEGORY_ICON[item.category]}
                      {...stylex.props(styles.glyph)}
                      sw={2.1}
                    />
                  </span>
                  <span {...stylex.props(styles.body)}>
                    <span {...stylex.props(styles.titleRow)}>
                      <span {...stylex.props(styles.title)}>{item.title}</span>
                      {!read && <span aria-hidden {...stylex.props(styles.dot)} />}
                    </span>
                    <span {...stylex.props(styles.text)}>{item.body}</span>
                    <span {...stylex.props(styles.time)}>{formatRelative(item.createdAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      placement="above"
      align="end"
      label={t('notifications')}
      width={420}
      trigger={
        <button
          type="button"
          onClick={() => {
            // Load on the way OPEN only. The inbox is a snapshot the panel shows;
            // refetching as it closes would spend a request on a panel nobody is
            // looking at, and could repaint the list under the closing animation.
            const next = !open;
            setOpen(next);
            if (next) void load();
          }}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t('notifications')}
          {...stylex.props(styles.bell, focus.ring)}
        >
          <Icon name="bell" {...stylex.props(styles.bellIcon)} />
          {unread > 0 && (
            <span aria-hidden {...stylex.props(styles.unread)}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      }
    >
      {panel}
    </Popover>
  );
}

/** Compact relative age of an ISO timestamp: `now`, `5m`, `3h`, `2d`, else a
 * short date. Locale-agnostic (numeric), so no message catalog is needed. */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(then).toISOString().slice(0, 10);
}
