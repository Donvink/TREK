import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { travelHotelSchema, travelPriceAnswerSchema, travelPlanCreateSchema, travelPlanFocusSchema, travelPoolDecisionSchema, travelWeatherApplySchema } from '@trek/shared';
import { createZodDto } from 'nestjs-zod';
import type { User } from '../../types';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TravelMetricsInterceptor } from './travel-metrics.interceptor';
import { TravelMetricsService } from './travel-metrics.service';
import { TravelPlanStayService } from './travel-plan-stay.service';
import { TravelPlanWeatherService } from './travel-plan-weather.service';
import { TravelPlansService } from './travel-plans.service';

export class TravelPlanCreateDto extends createZodDto(travelPlanCreateSchema) {}
export class TravelPlanFocusDto extends createZodDto(travelPlanFocusSchema) {}
export class TravelPoolDecisionDto extends createZodDto(travelPoolDecisionSchema) {}
export class TravelWeatherApplyDto extends createZodDto(travelWeatherApplySchema) {}
export class TravelHotelDto extends createZodDto(travelHotelSchema) {}
export class TravelPriceAnswerDto extends createZodDto(travelPriceAnswerSchema) {}

/** Online-only prototype surface: plans built from imported guides, and the evidence behind generated places. */
@Controller('api/travel-plans')
@UseInterceptors(TravelMetricsInterceptor)
export class TravelPlansController {
  constructor(
    private readonly plans: TravelPlansService,
    private readonly weather: TravelPlanWeatherService,
    private readonly stays: TravelPlanStayService,
    private readonly metrics: TravelMetricsService,
  ) {}

  @Get()
  list(@CurrentUser() user: User) {
    return { plans: this.plans.list(user.id) };
  }

  @Post()
  @HttpCode(200)
  create(@CurrentUser() user: User, @Body() body: TravelPlanCreateDto) {
    return this.plans.create(user.id, body);
  }

  // Static segments before the :planId routes.
  @Get('metrics')
  @UseGuards(JwtAuthGuard, AdminGuard)
  metricsSummary() {
    return this.metrics.summary();
  }

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

  @Post(':planId/weather-check')
  @HttpCode(200)
  weatherCheck(@CurrentUser() user: User, @Param('planId') planId: string) {
    return this.weather.check(user.id, planId);
  }

  @Post(':planId/weather-apply')
  @HttpCode(200)
  weatherApply(@CurrentUser() user: User, @Param('planId') planId: string, @Body() body: TravelWeatherApplyDto) {
    return this.weather.apply(user.id, planId, body.day_index, body.swaps);
  }

  @Post(':planId/hotel')
  @HttpCode(200)
  setHotel(@CurrentUser() user: User, @Param('planId') planId: string, @Body() body: TravelHotelDto) {
    return this.stays.setHotel(user.id, planId, body.stay_index, body.query);
  }

  @Post(':planId/price-test')
  @HttpCode(200)
  answerPriceTest(@CurrentUser() user: User, @Param('planId') planId: string, @Body() body: TravelPriceAnswerDto) {
    this.plans.load(user.id, planId);
    this.metrics.answerPriceTest(user.id, planId, body.choice);
    return this.plans.detail(user.id, planId);
  }

  @Post(':planId/generate')
  @HttpCode(200)
  generate(@CurrentUser() user: User, @Param('planId') planId: string) {
    return this.plans.generate(user.id, planId);
  }
}
