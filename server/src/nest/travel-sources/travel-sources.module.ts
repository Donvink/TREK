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
import { TravelPlacesService } from './travel-places.service';
import { TravelPlansController } from './travel-plans.controller';
import { TravelPlansService } from './travel-plans.service';
import { TravelSourcesController } from './travel-sources.controller';
import { TravelSourcesService } from './travel-sources.service';

@Module({
  imports: [MapsModule, LlmParseModule, TransitModule, TripsModule, PlacesModule, AssignmentsDomainModule, DayNotesModule],
  controllers: [TravelPlansController, TravelSourcesController],
  providers: [TravelSourcesService, TravelPlacesService, TravelLlmService, TravelOcrService, TravelPlansService],
})
export class TravelSourcesModule {}
