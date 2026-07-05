import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { env } from './env';

/** Where the interactive UI and the raw document are served. */
export const OPENAPI_UI_PATH = 'docs';
/** SwaggerModule derives the JSON endpoint from the UI path (`<path>-json`). */
export const OPENAPI_JSON_PATH = `${OPENAPI_UI_PATH}-json`;

/**
 * Mount the self-hosted API reference (T10.4).
 *
 * The document is built by **introspecting the live route table** — every
 * controller Nest has registered contributes its paths, methods, and (from the
 * controller class name) a tag — so the reference can never drift from the code
 * the way a hand-maintained spec does. It is deliberately schema-light: the API
 * validates with Zod rather than class-validator decorators, so bodies are not
 * auto-expanded into JSON Schema; the value here is a complete, always-current
 * index of the surface (paths, verbs, auth) plus a live "try it out" console.
 *
 * Served only when {@link env.API_DOCS_ENABLED} (on by default). SwaggerModule
 * registers its routes directly on the HTTP adapter, so they sit outside the
 * global `PermissionsGuard`; the matching `docs*` exclusion in
 * {@link AppModule.configure} keeps `TenantMiddleware` from demanding a session
 * for them.
 *
 * - Interactive UI: `GET /docs`
 * - Raw OpenAPI 3 document: `GET /docs-json`
 */
export function setupOpenApi(app: INestApplication): void {
  if (!env.API_DOCS_ENABLED) return;

  const config = new DocumentBuilder()
    .setTitle('fit API')
    .setDescription(
      'Multi-tenant gym platform API. Requests are tenant-scoped by the session ' +
        'JWT (or a `<slug>.<root-domain>` subdomain for the public discovery ' +
        'routes); authenticate with a bearer token issued by `POST /auth/login` ' +
        'or the `fit token` CLI. See the architecture decision records under ' +
        '`docs/adr/` for the billing, notification, and payment-provider designs.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(OPENAPI_UI_PATH, app, document, {
    customSiteTitle: 'fit API reference',
    swaggerOptions: { persistAuthorization: true },
  });
}
