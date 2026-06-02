import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/** Reflector metadata key flagging a handler (or controller) as public. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a controller method (or whole controller) as **public** — reachable
 * without an authenticated session and exempt from the global deny-by-default
 * authorization gate ({@link PermissionsGuard}).
 *
 * The global guard rejects any handler that declares *no* authorization intent
 * (no `@RequirePermissions`, `@Roles`, or `@AllowCrossTenant`). `@Public()` is
 * the explicit opt-out for routes that are genuinely open — registration,
 * login, the health probe — so "open" is always a deliberate, auditable choice
 * rather than an accidental omission.
 *
 * @example
 *   @Public()
 *   @Controller('auth')
 *   export class AuthController { ... }
 */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);
