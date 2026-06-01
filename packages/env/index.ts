// @fit/env — shared, framework-agnostic environment validation built on Zod.
//
// Define a schema with the re-exported `z`, then validate at process boot:
//
//   import { validateEnv, z } from '@fit/env';
//
//   const env = validateEnv(
//     z.object({ DATABASE_URL: z.string().url(), PORT: z.coerce.number().default(3000) }),
//   );
//
// Missing or malformed variables throw an `EnvValidationError` listing every
// offender, so a bad deploy fails fast instead of crashing deep in the stack.
export { z } from 'zod';
export { validateEnv, EnvValidationError } from './src/validate';
export { infraEnvSchema, type InfraEnv, SECRET_INFRA_KEYS, isSecretInfraKey } from './src/infra';
