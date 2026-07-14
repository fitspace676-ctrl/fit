// Validate the environment first so misconfiguration (e.g. a missing
// DATABASE_URL) fails the boot immediately with a clear error. This only loads
// the env schema — no instrumented modules — so it stays ahead of Sentry.
import { env } from './config/env';

// Sentry must be imported before any other module (Express, Prisma, etc.) is
// loaded so its instrumentation hooks are installed first.
import './instrument';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { isOriginAllowed } from './common/cors/allowed-origin';
import { setupOpenApi } from './config/openapi';

/** Parse a comma-separated origin list, dropping blanks. */
function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Explicitly allowed CORS origins: the web and admin clients (from env) plus the
 * Expo dev server. Extra origins can be supplied via `CORS_ORIGINS`
 * (comma-separated). Tenant subdomains (`<slug>.<root>`) are allowed on top of
 * this list by {@link isOriginAllowed}, which suffix-matches `PLATFORM_ROOT_DOMAIN`
 * so every gym's subdomain works without enumerating them here.
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
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  // Route Nest's own logs through pino.
  app.useLogger(app.get(Logger));

  // Raise the JSON body limit so the AI-agent chat can carry base64 file
  // attachments (spreadsheets, PDFs, images) — the default ~100kb is too small.
  app.useBodyParser('json', { limit: '25mb' });

  const allowList = corsOrigins();
  app.enableCors({
    // A function so each request's Origin is checked against the static list *and*
    // the tenant-subdomain suffix rule — `string[]` alone can't match `*.<root>`.
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) =>
      cb(null, isOriginAllowed(origin, allowList, env.PLATFORM_ROOT_DOMAIN)),
    credentials: true,
  });
  app.enableShutdownHooks();

  // Self-hosted OpenAPI reference at /docs (gated by API_DOCS_ENABLED). Mounted
  // before listen so the route table is fully registered when it introspects.
  setupOpenApi(app);

  const port = env.PORT;
  await app.listen(port);

  app.get(Logger).log(`API listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
