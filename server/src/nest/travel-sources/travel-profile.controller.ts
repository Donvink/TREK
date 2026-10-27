import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { travelProfileSchema } from '@trek/shared';
import { createZodDto } from 'nestjs-zod';
import type { User } from '../../types';
import { CurrentUser } from '../auth/current-user.decorator';
import { TravelProfileService } from './travel-profile.service';

export class TravelProfileDto extends createZodDto(travelProfileSchema) {}

/** The traveller's own profile: readable, editable and erasable in full. */
@Controller('api/travel-profile')
export class TravelProfileController {
  constructor(private readonly profiles: TravelProfileService) {}

  @Get()
  view(@CurrentUser() user: User) {
    return this.profiles.view(user.id);
  }

  @Put()
  save(@CurrentUser() user: User, @Body() body: TravelProfileDto) {
    return this.profiles.save(user.id, body);
  }

  @Delete()
  forget(@CurrentUser() user: User) {
    return this.profiles.forget(user.id);
  }

  @Post('suggestions/:key/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: User, @Param('key') key: string) {
    return this.profiles.accept(user.id, key);
  }

  @Post('suggestions/:key/dismiss')
  @HttpCode(200)
  dismiss(@CurrentUser() user: User, @Param('key') key: string) {
    return this.profiles.dismiss(user.id, key);
  }

  @Delete('signals/:id')
  deleteSignal(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.profiles.deleteSignal(user.id, id);
  }
}
