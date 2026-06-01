# @fit/env

Shared, framework-agnostic environment + secrets validation for the fit
monorepo, built on [Zod](https://zod.dev/).

Define a schema for the variables a service needs, then validate **once at
process boot**. Missing or malformed values throw an `EnvValidationError` that
lists every offender, so a misconfigured deploy fails fast with an actionable
message instead of crashing deep in the stack later.

## Usage

```ts
import { validateEnv, z } from '@fit/env';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  SENTRY_DSN: z.string().url().optional(),
});

// Throws EnvValidationError if DATABASE_URL is absent/invalid.
export const env = validateEnv(envSchema);
```

`validateEnv(schema, source?)` defaults `source` to `process.env`; pass an
explicit object (e.g. in tests) to validate an arbitrary source. The return
value is fully typed via `z.infer<typeof schema>`.

## API

- `validateEnv(schema, source = process.env)` — parse + coerce, returning the
  typed result; throws `EnvValidationError` on failure.
- `EnvValidationError` — `Error` subclass with an `issues: string[]` field, one
  entry per invalid variable.
- `z` — the Zod instance, re-exported so consumers don't depend on Zod directly.
