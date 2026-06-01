// Sentry must be the first import so its instrumentation is installed before
// any other module (Express, Prisma, etc.) is loaded.
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
    ...parseOrigins(process.env.WEB_URL),
    ...parseOrigins(process.env.ADMIN_URL),
    ...parseOrigins(process.env.CORS_ORIGINS),
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

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  app.get(Logger).log(`API listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
