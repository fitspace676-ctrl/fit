import * as stylex from '@stylexjs/stylex';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/src/components/ui';
import { getActiveGymContact } from '@/lib/active-gym';

// FormaCore redesign (T11.10) — the contact footer in StyleX. The bottom margin
// clears the mobile tab bar, which now hides at `lg` rather than `md` (six
// Georgian nav labels need the extra width), so the gutter breakpoint moved with
// it.

const styles = stylex.create({
  footer: {
    marginInline: 'auto',
    width: '100%',
    maxWidth: '1180px',
    marginBottom: {
      default: '7rem',
      '@media (min-width: 1024px)': '4rem',
    },
    paddingInline: {
      default: '1.5rem',
      '@media (min-width: 1024px)': '2.5rem',
    },
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: '1.5rem',
    rowGap: '0.5rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '1.25rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  entry: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    textDecoration: 'none',
    color: 'inherit',
  },
  link: {
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    transitionProperty: 'color',
    transitionDuration: '150ms',
  },
  icon: {
    height: '1rem',
    width: '1rem',
  },
});

/**
 * The member portal's contact footer — the gym's own address, phone, email and
 * website, exactly as it typed them into the staff console (Settings → Business
 * info).
 *
 * Renders nothing at all when there is no tenant in scope or the gym has filled in
 * none of the four, so a portal with nothing to say does not grow an empty band.
 * Phone and email are dialable / writable links, because the one moment a member
 * looks for this is the moment they want to get in touch.
 */
export async function MemberFooter() {
  const [contact, t] = await Promise.all([getActiveGymContact(), getTranslations('member.shell')]);
  if (!contact) return null;

  const address = contact.address?.trim();
  const phone = contact.phone?.trim();
  const email = contact.email?.trim();
  const website = contact.website?.trim();

  return (
    <footer aria-label={t('contactLabel')} {...stylex.props(styles.footer)}>
      <div {...stylex.props(styles.row)}>
        {address ? (
          <span {...stylex.props(styles.entry)}>
            <Icon name="pin" sw={1.8} {...stylex.props(styles.icon)} />
            {address}
          </span>
        ) : null}
        {phone ? (
          <a href={`tel:${phone.replace(/\s+/g, '')}`} {...stylex.props(styles.entry, styles.link)}>
            <Icon name="phone" sw={1.8} {...stylex.props(styles.icon)} />
            {phone}
          </a>
        ) : null}
        {email ? (
          <a href={`mailto:${email}`} {...stylex.props(styles.entry, styles.link)}>
            <Icon name="mail" sw={1.8} {...stylex.props(styles.icon)} />
            {email}
          </a>
        ) : null}
        {website ? (
          <a
            href={withScheme(website)}
            target="_blank"
            rel="noreferrer noopener"
            {...stylex.props(styles.entry, styles.link)}
          >
            <Icon name="arrow" sw={1.8} {...stylex.props(styles.icon)} />
            {website.replace(/^https?:\/\//, '')}
          </a>
        ) : null}
      </div>
    </footer>
  );
}

/**
 * The website as an absolute URL. Staff type `yourgym.com` as often as they type
 * the scheme, and a bare host in `href` resolves as a *relative path* — which
 * would navigate the member portal to `/member/yourgym.com` instead of the site.
 */
function withScheme(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}
