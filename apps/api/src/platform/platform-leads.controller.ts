import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { z } from 'zod';
import { createPlatformLeadSchema, type CreatePlatformLeadResponse } from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { PlatformLeadsService } from './platform-leads.service';

/**
 * Platform sales-lead capture (`POST /platform/leads`, T8.2).
 *
 * `@Public()` — the marketing site posts here before any account or tenant exists,
 * so it carries no session and is excluded from the tenant middleware in
 * `AppModule`. The single handler validates the body and hands it to the service,
 * which persists the lead and best-effort notifies the sales inbox.
 */
@Public()
@Controller('platform/leads')
export class PlatformLeadsController {
  constructor(private readonly leads: PlatformLeadsService) {}

  /**
   * `POST /platform/leads` — capture a trial or demo lead. `201 Created` with the
   * stored lead id; `400` on a malformed body (bad email, missing name, unknown
   * `type`). Delivery of the team notification never affects the response.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown): Promise<CreatePlatformLeadResponse> {
    return this.leads.create(parse(createPlatformLeadSchema, body));
  }
}

/**
 * Parse `data` with `schema`, raising a `400` whose body lists each failing field
 * as `path: message` — mirroring the other controllers so validation errors read
 * identically across the API.
 */
function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }
  return result.data as z.infer<TSchema>;
}
