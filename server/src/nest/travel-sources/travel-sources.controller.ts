import type { User } from '../../types';
import { CurrentUser } from '../auth/current-user.decorator';
import { TravelSourcesService } from './travel-sources.service';
import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { travelSourceBatchSchema, travelSourceImageBytesSchema } from '@trek/shared';
import { travelPlaceExtractionRequestSchema, travelPlaceConfirmRequestSchema, travelPlaceImageIdentitySchema } from '@trek/shared';
import { TravelPlacesService } from './travel-places.service';

import { createZodDto } from 'nestjs-zod';
import type { Response } from 'express';

export class TravelSourceImportDto extends createZodDto(travelSourceBatchSchema) {}
export class TravelSourceImageUploadDto extends createZodDto(travelSourceImageBytesSchema) {}
export class TravelPlaceExtractionDto extends createZodDto(travelPlaceExtractionRequestSchema) {}
export class TravelPlaceConfirmDto extends createZodDto(travelPlaceConfirmRequestSchema) {}
export class TravelPlaceImageIdentityDto extends createZodDto(travelPlaceImageIdentitySchema) {}

@Controller('api/travel-sources')
export class TravelSourcesController {
  constructor(private readonly sources: TravelSourcesService, private readonly places: TravelPlacesService) {}

  @Post(':sourceId/places/extract')
  @HttpCode(200)
  extract(@CurrentUser() user: User, @Param('sourceId') sourceId: string, @Body() body: TravelPlaceExtractionDto) {
    return this.places.extract(user.id, sourceId, body.city, body.refresh_map);
  }

  @Post(':sourceId/places/:placeId/confirm')
  @HttpCode(200)
  confirm(@CurrentUser() user: User, @Param('sourceId') sourceId: string, @Param('placeId') placeId: string, @Body() body: TravelPlaceConfirmDto) {
    return this.places.confirm(user.id, sourceId, placeId, body.candidate_id);
  }

  @Post(':sourceId/places/:placeId/image-identity')
  @HttpCode(200)
  correctImageIdentity(@CurrentUser() user: User, @Param('sourceId') sourceId: string, @Param('placeId') placeId: string, @Body() body: TravelPlaceImageIdentityDto) {
    return this.places.correctIdentityFromImage(user.id, sourceId, placeId, body);
  }

  @Get()
  list(@CurrentUser() user: User) {
    return { notes: this.sources.list(user.id) };
  }

  @Post('import')
  @HttpCode(200)
  importBatch(@CurrentUser() user: User, @Body() body: TravelSourceImportDto) {
    return this.sources.importBatch(user.id, body);
  }

  @Post(':sourceId/images/:imageId')
  @HttpCode(200)
  saveImage(@CurrentUser() user: User, @Param('sourceId') sourceId: string, @Param('imageId') imageId: string, @Body() body: TravelSourceImageUploadDto) {
    return this.sources.saveImage(user.id, sourceId, imageId, Buffer.from(body));
  }

  @Get(':sourceId/images/:imageId')
  getImage(@CurrentUser() user: User, @Param('sourceId') sourceId: string, @Param('imageId') imageId: string, @Res() res: Response) {
    const image = this.sources.getImage(user.id, sourceId, imageId);
    res.setHeader('Content-Type', image.content_type);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(image.data);
  }
}
