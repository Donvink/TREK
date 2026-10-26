import { TravelSourcesController } from './travel-sources.controller';
import { TravelSourcesService } from './travel-sources.service';
import { Module } from '@nestjs/common';
import { MapsModule } from '../maps/maps.module';
import { TravelPlacesService } from './travel-places.service';

@Module({ imports: [MapsModule], controllers: [TravelSourcesController], providers: [TravelSourcesService, TravelPlacesService] })
export class TravelSourcesModule {}
