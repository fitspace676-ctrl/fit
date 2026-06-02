import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Permission } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContext } from '../common/tenant/tenant.context';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { StorageService, type SignedUpload } from './storage.service';

/** Request body for `POST /uploads`. The owning gym is taken from the session. */
interface CreateUploadDto {
  contentType?: unknown;
  contentLength?: unknown;
  entity?: unknown;
  fileName?: unknown;
}

/**
 * `POST /uploads` — issue a presigned R2 upload URL.
 *
 * The client posts the file's `contentType`, exact `contentLength`, and the
 * `entity` (key segment); it receives a short-lived signed `PUT` URL plus the
 * object key, then uploads the bytes straight to R2. Bodies are validated by
 * hand because the API has no global `ValidationPipe`; size and key-segment
 * rules are enforced in the service so they hold for every caller.
 *
 * Authenticated + tenant-scoped: the owning `gymId` is taken from the caller's
 * session (the {@link TenantContext}), never the request body, so a caller can
 * only ever mint URLs under their own gym's prefix. {@link TenantGuard} requires
 * a tenant, and `@RequirePermissions(MemberWrite)` is the Phase-2 policy — the
 * uploaders today are admin/management flows (member, trainer, and product
 * images), all performed by roles that hold `MemberWrite`. (When member
 * self-service uploads arrive, revisit with a dedicated permission.)
 */
@Controller('uploads')
@UseGuards(TenantGuard)
export class StorageController {
  constructor(
    @Inject(StorageService) private readonly storage: StorageService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.MemberWrite)
  async create(@Body() body: CreateUploadDto): Promise<SignedUpload> {
    const contentType = this.requireString(body.contentType, 'contentType');
    const contentLength = this.requireNumber(body.contentLength, 'contentLength');
    const entity = this.requireString(body.entity, 'entity');
    const fileName = this.optionalString(body.fileName, 'fileName');
    // The gym is the caller's own tenant — never trusted from the body.
    const gymId = this.tenant.gymId;

    return this.storage.createSignedUpload({ contentType, contentLength, gymId, entity, fileName });
  }

  private requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BadRequestException(`${field} is required and must be a non-empty string`);
    }
    return value.trim();
  }

  private requireNumber(value: unknown, field: string): number {
    const num = typeof value === 'string' ? Number(value) : value;
    if (typeof num !== 'number' || !Number.isFinite(num)) {
      throw new BadRequestException(`${field} is required and must be a number`);
    }
    return num;
  }

  private optionalString(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string`);
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
}
