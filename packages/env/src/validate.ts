import type { z } from 'zod';

/**
 * Thrown when environment variables fail schema validation. The message lists
 * every offending variable so a misconfigured deploy fails fast with a clear,
 * actionable error instead of an opaque runtime crash deep in the stack.
 */
export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid environment variables:\n${issues.map((issue) => `  • ${issue}`).join('\n')}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/**
 * Validate (and coerce) a source of environment variables against a Zod schema.
 *
 * Returns the parsed, typed result on success. On failure it throws an
 * {@link EnvValidationError} enumerating each invalid or missing variable —
 * call this once at process boot so misconfiguration surfaces immediately.
 *
 * @param schema Zod schema describing the expected variables.
 * @param source Raw variables to validate. Defaults to `process.env`.
 */
export function validateEnv<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  source: Record<string, unknown> = process.env,
): z.infer<TSchema> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return `${path || '(root)'}: ${issue.message}`;
    });
    throw new EnvValidationError(issues);
  }

  // `safeParse` widens `data` to `any` through the generic; the schema
  // guarantees it matches the inferred output type.
  return result.data as z.infer<TSchema>;
}
