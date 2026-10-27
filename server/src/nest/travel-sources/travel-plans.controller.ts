import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { travelPlanCreateSchema, travelPlanFocusSchema, travelPoolDecisionSchema } from '@trek/shared';
import { createZodDto } from 'nestjs-zod';
import type { User } from '../../types';
import { CurrentUser } from '../auth/current-user.decorator';
import { TravelPlansService } from './travel-plans.service';

export class TravelPlanCreateDto extends createZodDto(travelPlanCreateSchema) {}
export class TravelPlanFocusDto extends createZodDto(travelPlanFocusSchema) {}
export class TravelPoolDecisionDto extends createZodDto(travelPoolDecisionSchema) {}

/** Online-only prototype surface: plans built from imported guides, and the evidence behind generated places. */
@Controller('api/travel-plans')
export class TravelPlansController {
  constructor(private readonly plans: TravelPlansService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return { plans: this.plans.list(user.id) };
  }

  @Post()
  @HttpCode(200)
  create(@CurrentUser() user: User, @Body() body: TravelPlanCreateDto) {
    return this.plans.create(user.id, body);
  }

  // Static segment before the :planId routes.
  @Get('evidence/:tripId/:placeId')
  evidence(@CurrentUser() user: User, @Param('tripId', ParseIntPipe) tripId: number, @Param('placeId', ParseIntPipe) placeId: number) {
    const evidence = this.plans.evidenceFor(user.id, tripId, placeId);
    if (!evidence) throw new NotFoundException('No guide evidence for this place');
    return evidence;
  }

  @Get(':planId')
  detail(@CurrentUser() user: User, @Param('planId') planId: string) {
    return this.plans.detail(user.id, planId);
  }

  @Patch(':planId/focus')
  focus(@CurrentUser() user: User, @Param('planId') planId: string, @Body() body: TravelPlanFocusDto) {
    return this.plans.setFocus(user.id, planId, body.focus);
  }

  @Post(':planId/decisions')
  @HttpCode(200)
  decide(@CurrentUser() user: User, @Param('planId') planId: string, @Body() body: TravelPoolDecisionDto) {
    return this.plans.decide(user.id, planId, body.pool_key, body.decision);
  }

  @Post(':planId/generate')
  @HttpCode(200)
  generate(@CurrentUser() user: User, @Param('planId') planId: string) {
    return this.plans.generate(user.id, planId);
  }
}
