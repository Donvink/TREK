import { Module } from '@nestjs/common';
import { AssignmentsDomainModule } from '../assignments/assignments-domain.module';
import { DayNotesModule } from '../day-notes/day-notes.module';
import { LlmParseModule } from '../llm-parse/llm-parse.module';
import { MapsModule } from '../maps/maps.module';
import { PlacesModule } from '../places/places.module';
import { TransitModule } from '../transit/transit.module';
import { TripsModule } from '../trips/trips.module';
import { TravelLlmService } from './travel-llm.service';
import { TravelOcrService } from './travel-ocr.service';
import { TravelPlanStayService } from './travel-plan-stay.service';
import { TravelPlanWeatherService } from './travel-plan-weather.service';
import { AccommodationsDomainModule } from '../accommodations/accommodations-domain.module';
import { WeatherModule } from '../weather/weather.module';
import { TravelPlacesService } from './travel-places.service';
import { TravelPlansController } from './travel-plans.controller';
import { TravelPlansService } from './travel-plans.service';
import { TravelProfileController } from './travel-profile.controller';
import { TravelProfileService } from './travel-profile.service';
import { TravelSourcesController } from './travel-sources.controller';
import { TravelSourcesService } from './travel-sources.service';

@Module({
  imports: [MapsModule, WeatherModule, AccommodationsDomainModule, LlmParseModule, TransitModule, TripsModule, PlacesModule, AssignmentsDomainModule, DayNotesModule],
  controllers: [TravelPlansController, TravelProfileController, TravelSourcesController],
  providers: [TravelSourcesService, TravelPlacesService, TravelLlmService, TravelOcrService, TravelPlansService, TravelProfileService, TravelPlanWeatherService, TravelPlanStayService],
})
export class TravelSourcesModule {}
