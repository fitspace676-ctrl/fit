import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

/**
 * Mail (T8.2) — the shared transactional-email transport.
 *
 * Marked `@Global` and exporting {@link MailerService} so any producer module (the
 * notification email channel, platform lead capture, and future digest/receipt
 * senders) can inject the one Resend transport without re-importing this module or
 * re-implementing the request.
 */
@Global()
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailModule {}
