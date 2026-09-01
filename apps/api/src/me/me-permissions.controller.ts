import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Permission, type BranchScope } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { RolePermissionsService } from '../common/rbac/role-permissions.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { TenantGuard } from '../common/tenant/tenant.guard';

/**
 * What this session may do at this gym, already resolved against the gym's
 * runtime overrides.
 *
 * The wire contract is owned by the consumer: `myPermissionsSchema` in
 * `apps/admin/lib/console-permissions.ts`. It is validated there rather than
 * shared as a type because the console's rule is to fail CLOSED on anything it
 * cannot parse — a shared type would make a shape mismatch a compile error here
 * and a silent `undefined` there, which is the wrong way round for the one
 * payload that decides what a person can see.
 *
 * `assignedLocationIds` flattens the resolver's `null` (gym-wide scope, nothing
 * to clamp) to `[]`. The console only consults it when `branchScope` is
 * `assigned`, so the two collapse safely here — but they must NOT be collapsed
 * inside the resolver, where `null` and `[]` are opposite answers.
 */
interface MyPermissionsResponse {
  role: string;
  grants: Permission[];
  branchScope: BranchScope;
  assignedLocationIds: string[];
}

/**
 * `GET /me/permissions` — the console's own view of its session.
 *
 * This endpoint exists because the console cannot work the answer out for
 * itself, and the reason is the whole point: a role's grants live in
 * `Gym.settings`, whose read endpoint requires `GymManage` — an OWNER capability
 * — so a manager's console could never fetch the blob its own sidebar depends
 * on. The branch assignments live in `LocationStaff`, which the console cannot
 * reach at all.
 *
 * **Gated on {@link Permission.ProfileManage}, and that choice is load-bearing.**
 * It is a *self-service* capability, so `role-permissions.ts` excludes it from the
 * editor and no operator can revoke it — which means narrowing a role's grants can
 * never make that role unable to discover its own grants. Gating this on anything
 * editable would let a gym lock its staff out of the answer that explains why they
 * are locked out. Being self-service also means the branch clamp skips this route,
 * so a trainer rostered nowhere can still read their own access.
 */
@Controller('me/permissions')
@UseGuards(TenantGuard, PermissionsGuard)
export class MePermissionsController {
  constructor(
    private readonly access: RolePermissionsService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProfileManage)
  async get(): Promise<MyPermissionsResponse> {
    const state = this.tenant.current;
    if (!state) {
      // Unreachable behind `PermissionsGuard`, which 401s first. Narrowing rather
      // than asserting, so a future guard change surfaces as a 401 and not a crash.
      throw new UnauthorizedException({ message: 'Sign in required', code: 'AUTH_REQUIRED' });
    }

    const resolved = await this.access.resolve(state);
    return {
      role: resolved.role,
      grants: [...resolved.grants],
      branchScope: resolved.branchScope,
      assignedLocationIds: [...(resolved.allowedLocationIds ?? [])],
    };
  }
}
