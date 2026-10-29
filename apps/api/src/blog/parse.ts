import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Parse `data` with `schema`, raising a `400` whose body lists each failing field
 * as `path: message` — mirroring the other controllers (the API has no global
 * `ValidationPipe`), so validation errors read identically across the API.
 */
export function parse<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  data: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }
  return result.data as z.output<TSchema>;
}
