import {
  escapeHtml,
  renderBrandedEmail,
  renderEmailButton,
  renderEmailLinkFallback,
  renderEmailParagraphs,
} from './branded-email';
import type { EmailLocale } from './email-locale';

export function buildMemberWelcomeEmail(url: string, gymName: string, locale: EmailLocale) {
  const subject = locale === 'ka' ? `მოგესალმებათ ${gymName}` : `Welcome to ${gymName}`;
  const body =
    locale === 'ka'
      ? 'თქვენი წევრობა დამატებულია. პირად გვერდზე შესასვლელად დაადასტურეთ ელფოსტა და დააყენეთ პაროლი ქვემოთ მოცემული ბმულით.'
      : 'Your membership has been added. Confirm your email and set your password using the link below to access your member account.';
  const button = locale === 'ka' ? 'პაროლის დაყენება' : 'Set your password';
  return {
    subject,
    text: `${subject}\n\n${body}\n\n${button}: ${url}`,
    html: renderBrandedEmail({
      locale,
      senderName: escapeHtml(gymName),
      heading: escapeHtml(subject),
      contentHtml:
        renderEmailParagraphs(body) +
        renderEmailButton(url, escapeHtml(button)) +
        renderEmailLinkFallback(url, locale),
    }),
  };
}
