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
import { gymOnboardingStepSchema, verifyGymOnboardingCodeSchema } from '@fit/types';
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
    if (!parsed.success)
      throw new BadRequestException({
        message: 'Unknown onboarding step',
        code: 'ONBOARDING_STEP_INVALID',
      });
    return this.onboarding.saveStep(token, parsed.data, body);
  }

  @Post(':token/submit')
  @HttpCode(200)
  @RateLimit(RATE_LIMITS.gymOnboardingCode)
  submit(@Param('token') token: string) {
    return this.onboarding.submit(token);
  }

  @Post(':token/verify')
  @HttpCode(200)
  @RateLimit(RATE_LIMITS.gymOnboardingCode)
  verify(@Param('token') token: string, @Body() body: unknown) {
    const parsed = verifyGymOnboardingCodeSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: 'Enter a six-digit code',
        code: 'ONBOARDING_CODE_INVALID',
      });
    return this.onboarding.verify(token, parsed.data.code);
  }
}
