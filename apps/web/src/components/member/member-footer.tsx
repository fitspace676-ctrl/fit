import { getTranslations } from 'next-intl/server';
import { Icon } from '@/src/components/ui';
import { getActiveGymContact } from '@/lib/active-gym';

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
    <footer
      aria-label={t('contactLabel')}
      className="mx-auto mb-24 w-full max-w-[1200px] px-4 sm:px-6 md:mb-10 lg:px-8"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-ink-100 pt-5 text-sm text-ink-500 dark:border-white/10 dark:text-ink-400">
        {address ? (
          <span className="inline-flex items-center gap-1.5">
            <Icon name="pin" className="h-4 w-4" sw={1.8} />
            {address}
          </span>
        ) : null}
        {phone ? (
          <a
            href={`tel:${phone.replace(/\s+/g, '')}`}
            className="inline-flex items-center gap-1.5 hover:text-ink-800 dark:hover:text-white"
          >
            <Icon name="phone" className="h-4 w-4" sw={1.8} />
            {phone}
          </a>
        ) : null}
        {email ? (
          <a
            href={`mailto:${email}`}
            className="inline-flex items-center gap-1.5 hover:text-ink-800 dark:hover:text-white"
          >
            <Icon name="mail" className="h-4 w-4" sw={1.8} />
            {email}
          </a>
        ) : null}
        {website ? (
          <a
            href={withScheme(website)}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 hover:text-ink-800 dark:hover:text-white"
          >
            <Icon name="arrow" className="h-4 w-4" sw={1.8} />
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
