import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';

/**
 * Mail (T8.2) — the shared transactional-email transport.
 *
 * Marked `@Global` and exporting {@link MailerService} so any producer module (the
 * notification email channel, platform lead capture, and future digest/receipt
 * senders) can inject the one Resend transport without re-importing this module or
 * re-implementing the request.
 *
 * {@link EmailTemplatesService} rides along for the same reason: any module that
 * raises an event worth emailing about needs to send the gym's own wording for
 * it, and threading that dependency through every feature module would make the
 * templates harder to use than a hardcoded string.
 */
@Global()
@Module({
  controllers: [EmailTemplatesController],
  providers: [MailerService, EmailTemplatesService],
  exports: [MailerService, EmailTemplatesService],
})
export class MailModule {}
