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
  fileName?: unknown;
  prefix?: unknown;
}

/**
 * `POST /uploads` — issue a presigned R2 upload URL.
 *
 * The client posts the file's `contentType` (and optionally a `fileName` /
 * `prefix`), receives a short-lived signed `PUT` URL plus the object key, then
 * uploads the bytes straight to R2. Bodies are validated by hand because the
 * API has no global `ValidationPipe`.
 */
@Controller('uploads')
export class StorageController {
  constructor(@Inject(StorageService) private readonly storage: StorageService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateUploadDto): Promise<SignedUpload> {
    const contentType = this.requireString(body.contentType, 'contentType');
    const fileName = this.optionalString(body.fileName, 'fileName');
    const prefix = this.optionalString(body.prefix, 'prefix');

    return this.storage.createSignedUpload({ contentType, fileName, prefix });
  }

  private requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BadRequestException(`${field} is required and must be a non-empty string`);
    }
    return value.trim();
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
