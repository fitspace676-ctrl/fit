import { Module } from '@nestjs/common';
import { CheckInModule } from '../../check-in/check-in.module';
import { SecretBox } from '../../common/crypto/secret-box';
import { ZkbioClient } from '../zkbio/zkbio-client';
import { ZkDeviceClient } from '../zkdevice/zkdevice-client';
import { ZktecoController } from './zkteco.controller';
import { ZktecoEventImport } from './zkteco-event-import.service';
import { ZktecoGateway } from './zkteco-gateway';
import { ZktecoIntegrationService } from './zkteco-integration.service';
import { ZktecoJobs } from './zkteco-jobs.service';
import { ZktecoMemberSync } from './zkteco-member-sync.service';
import { ZktecoPhotoLoader } from './zkteco-photo-loader';
import { ZktecoTargets } from './zkteco-targets.service';

/**
 * ZKTeco turnstiles and doors: the owner's card, membership sync, passage import
 * and the reception's "open door". The two transport clients are plain classes
 * (no Nest decorators), so they are built here with their defaults.
 */
@Module({
  imports: [CheckInModule],
  controllers: [ZktecoController],
  providers: [
    { provide: ZkbioClient, useFactory: () => new ZkbioClient() },
    { provide: ZkDeviceClient, useFactory: () => new ZkDeviceClient() },
    { provide: ZktecoPhotoLoader, useFactory: () => new ZktecoPhotoLoader() },
    SecretBox,
    ZktecoGateway,
    ZktecoTargets,
    ZktecoMemberSync,
    ZktecoEventImport,
    ZktecoJobs,
    ZktecoIntegrationService,
  ],
  exports: [ZktecoIntegrationService],
})
export class ZktecoModule {}
