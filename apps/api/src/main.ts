// Validate the environment first so misconfiguration (e.g. a missing
// DATABASE_URL) fails the boot immediately with a clear error. This only loads
// the env schema — no instrumented modules — so it stays ahead of Sentry.
import { env } from './config/env';

// Sentry must be imported before any other module (Express, Prisma, etc.) is
// loaded so its instrumentation hooks are installed first.
import './instrument';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

/** Parse a comma-separated origin list, dropping blanks. */
function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Allowed CORS origins: the web and admin clients (from env) plus the Expo dev
 * server. Extra origins can be supplied via `CORS_ORIGINS` (comma-separated).
 */
function corsOrigins(): string[] {
  const origins = new Set<string>([
    ...parseOrigins(env.WEB_URL),
    ...parseOrigins(env.ADMIN_URL),
    ...parseOrigins(env.CORS_ORIGINS),
    'http://localhost:8081', // Expo / Metro dev server
  ]);
  return [...origins];
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Route Nest's own logs through pino.
  app.useLogger(app.get(Logger));

  app.enableCors({
    origin: corsOrigins(),
    credentials: true,
  });
  app.enableShutdownHooks();

  const port = env.PORT;
  await app.listen(port);

  app.get(Logger).log(`API listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
