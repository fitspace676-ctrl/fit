import { Global, Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

/**
 * Provides the {@link StorageService} (Cloudflare R2 signed uploads)
 * application-wide and serves `POST /uploads`. Marked `@Global` so feature
 * modules can inject the service to mint signed URLs without re-importing.
 */
@Global()
@Module({
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
