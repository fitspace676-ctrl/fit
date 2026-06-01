import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Provides the shared {@link RedisService} application-wide. Marked `@Global`
 * so feature modules can inject it without re-importing this module.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
