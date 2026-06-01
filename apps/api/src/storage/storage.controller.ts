import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { StorageService, type SignedUpload } from './storage.service';

/** Request body for `POST /uploads`. */
interface CreateUploadDto {
  contentType?: unknown;
  contentLength?: unknown;
  gymId?: unknown;
  entity?: unknown;
  fileName?: unknown;
}

/**
 * `POST /uploads` — issue a presigned R2 upload URL.
 *
 * The client posts the file's `contentType`, exact `contentLength`, and the
 * owning `gymId` + `entity` (which form the tenant-scoped key prefix). It
 * receives a short-lived signed `PUT` URL plus the object key, then uploads the
 * bytes straight to R2. Bodies are validated by hand because the API has no
 * global `ValidationPipe`; size and key-segment rules are enforced in the
 * service so they hold for every caller.
 */
@Controller('uploads')
export class StorageController {
  constructor(@Inject(StorageService) private readonly storage: StorageService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateUploadDto): Promise<SignedUpload> {
    const contentType = this.requireString(body.contentType, 'contentType');
    const contentLength = this.requireNumber(body.contentLength, 'contentLength');
    const gymId = this.requireString(body.gymId, 'gymId');
    const entity = this.requireString(body.entity, 'entity');
    const fileName = this.optionalString(body.fileName, 'fileName');

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
