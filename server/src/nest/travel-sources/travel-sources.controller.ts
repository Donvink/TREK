import type { User } from '../../types';
import { CurrentUser } from '../auth/current-user.decorator';
import { TravelSourcesService } from './travel-sources.service';
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Res, UseInterceptors } from '@nestjs/common';
import { isImageBytes, travelManualNoteSchema, travelSourceBatchSchema, travelSourceImageBytesSchema, travelSourceImageTextSchema } from '@trek/shared';
import { travelPlaceExtractionRequestSchema, travelPlaceConfirmRequestSchema, travelPlaceImageIdentitySchema } from '@trek/shared';
import { TravelPlacesService } from './travel-places.service';
import { TravelMetricsInterceptor } from './travel-metrics.interceptor';

import { createZodDto } from 'nestjs-zod';
import type { Response } from 'express';

export class TravelSourceImportDto extends createZodDto(travelSourceBatchSchema) {}
export class TravelPlaceExtractionDto extends createZodDto(travelPlaceExtractionRequestSchema) {}
export class TravelPlaceConfirmDto extends createZodDto(travelPlaceConfirmRequestSchema) {}
export class TravelPlaceImageIdentityDto extends createZodDto(travelPlaceImageIdentitySchema) {}
export class TravelSourceImageTextDto extends createZodDto(travelSourceImageTextSchema) {}
export class TravelManualNoteDto extends createZodDto(travelManualNoteSchema) {}
export class TravelSourceImageUploadDto extends createZodDto(travelSourceImageBytesSchema) {}

@Controller('api/travel-sources')
@UseInterceptors(TravelMetricsInterceptor)
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

  @Post('manual')
  @HttpCode(200)
  importManual(@CurrentUser() user: User, @Body() body: TravelManualNoteDto) {
    return this.sources.importManual(user.id, body);
  }

  @Post('import')
  @HttpCode(200)
  importBatch(@CurrentUser() user: User, @Body() body: TravelSourceImportDto) {
    return this.sources.importBatch(user.id, body);
  }

  @Post(':sourceId/images/:imageId')
  @HttpCode(200)
  async saveImage(@CurrentUser() user: User, @Param('sourceId') sourceId: string, @Param('imageId') imageId: string, @Body() body: TravelSourceImageUploadDto) {
    // The pipe has already run the refinement; this narrows the type for the service.
    if (!isImageBytes(body)) throw new BadRequestException('Expected image bytes, at most 8 MB');
    const saved = this.sources.saveImage(user.id, sourceId, imageId, Buffer.from(body));
    // Read the text right away when the OCR sidecar runs, so extraction can use it.
    const ocr = await this.places.readImageText(user.id, sourceId, imageId);
    return { ...saved, text_read: ocr.read > 0 };
  }

  @Post(':sourceId/ocr')
  @HttpCode(200)
  readImages(@CurrentUser() user: User, @Param('sourceId') sourceId: string) {
    return this.places.readImageText(user.id, sourceId);
  }

  @Post(':sourceId/images/:imageId/text')
  @HttpCode(200)
  saveImageText(@CurrentUser() user: User, @Param('sourceId') sourceId: string, @Param('imageId') imageId: string, @Body() body: TravelSourceImageTextDto) {
    return this.places.saveImageText(user.id, sourceId, imageId, body.engine, body.text);
  }

  @Delete(':sourceId')
  remove(@CurrentUser() user: User, @Param('sourceId') sourceId: string) {
    return this.sources.remove(user.id, sourceId);
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
