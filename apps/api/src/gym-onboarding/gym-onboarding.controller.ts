import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { gymOnboardingStepSchema } from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { RateLimit, RATE_LIMITS } from '../common/rate-limit/rate-limit.decorator';
import { GymOnboardingService } from './gym-onboarding.service';

@Public()
@RateLimit(RATE_LIMITS.gymOnboarding)
@Controller('gym-onboarding')
export class GymOnboardingController {
  constructor(private readonly onboarding: GymOnboardingService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.onboarding.getState(token);
  }

  @Put(':token/steps/:step')
  save(@Param('token') token: string, @Param('step') step: string, @Body() body: unknown) {
    const parsed = gymOnboardingStepSchema.safeParse(step);
    if (!parsed.success) throw new BadRequestException('Unknown onboarding step');
    return this.onboarding.saveStep(token, parsed.data, body);
  }

  @Post(':token/complete')
  @HttpCode(200)
  complete(@Param('token') token: string) {
    return this.onboarding.complete(token);
  }
}
