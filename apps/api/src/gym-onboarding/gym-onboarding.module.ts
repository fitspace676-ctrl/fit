import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GymOnboardingController } from './gym-onboarding.controller';
import { GymOnboardingService } from './gym-onboarding.service';

@Module({
  imports: [AuthModule],
  controllers: [GymOnboardingController],
  providers: [GymOnboardingService],
  exports: [GymOnboardingService],
})
export class GymOnboardingModule {}
