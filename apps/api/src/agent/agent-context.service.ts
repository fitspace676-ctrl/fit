import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE, gymSettingsStoredSchema } from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { RolePermissionsService } from '../common/rbac/role-permissions.service';
import { TenantContext } from '../common/tenant/tenant.context';

/**
 * The agent's view of who is asking — structurally `@fit/agent`'s
 * `AgentContext`, restated here because the runtime is loaded through the
 * controller's hand-typed `require` boundary.
 */
export interface AgentChatContext {
  gym: { name: string; slug: string; timezone?: string; currency?: string };
  locations: Array<{ id: string; name: string; status: string }>;
  activeLocationId?: string;
  operator: { name?: string; role: string; permissions: string[] };
  locale?: 'ka' | 'en';
  today: string;
}

/**
 * Builds the system-prompt context for one `POST /agent/chat` turn.
 *
 * Every fact comes from the verified session, never the request: the gym is
 * {@link TenantContext.gymId}, the branches are that gym's own (narrowed to the
 * caller's roster under `assigned` branch scope), and the grants are the ones
 * {@link RolePermissionsService} resolves for the guard. The console's
 * `locationId` is only a hint — it is kept when it names one of those branches
 * and silently dropped otherwise, so a branch id from another gym never reaches
 * the prompt.
 */
@Injectable()
export class AgentContextService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly access: RolePermissionsService,
  ) {}

  async build(input: { locationId?: string; locale?: 'ka' | 'en' }): Promise<AgentChatContext> {
    const state = this.tenant.current;
    if (!state) {
      // Unreachable behind the guards, which 401 first.
      throw new UnauthorizedException({ message: 'Sign in required', code: 'AUTH_REQUIRED' });
    }
    const gymId = this.tenant.gymId;

    const [gym, locations, resolved, user] = await Promise.all([
      // `Gym` is the tenant root, outside the scoped models — pin the id.
      this.prisma.client.gym.findUnique({
        where: { id: gymId },
        select: { name: true, slug: true, settings: true },
      }),
      this.prisma.client.location.findMany({
        where: { gymId },
        select: { id: true, name: true, status: true },
        orderBy: { name: 'asc' },
      }),
      this.access.resolve(state),
      state.userId
        ? this.prisma.client.user.findUnique({
            where: { id: state.userId },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);
    if (!gym) throw new Error(`Cannot build agent context: gym ${gymId} does not exist`);

    const locale = gymSettingsStoredSchema.safeParse(gym.settings ?? {});
    const timezone = locale.success ? locale.data.locale.timezone : DEFAULT_TIMEZONE;
    const currency = locale.success ? locale.data.locale.currency : DEFAULT_CURRENCY;

    const allowed = resolved.allowedLocationIds;
    const visible = locations.filter((l) => allowed === null || allowed.includes(l.id));
    const active = visible.some((l) => l.id === input.locationId) ? input.locationId : undefined;
    const name = user?.name?.trim();

    return {
      gym: { name: gym.name, slug: gym.slug, timezone, currency },
      locations: visible.map((l) => ({ id: l.id, name: l.name, status: l.status })),
      ...(active ? { activeLocationId: active } : {}),
      operator: {
        ...(name ? { name } : {}),
        role: resolved.role,
        permissions: [...resolved.grants],
      },
      ...(input.locale ? { locale: input.locale } : {}),
      today: isoDateIn(timezone),
    };
  }
}

/** Today's date as `YYYY-MM-DD` in `timeZone`, falling back to UTC on a bad zone. */
export function isoDateIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
