import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CollectionsService } from './collections.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { ReplaceCollectionDto } from './dto/replace-collection.dto';
import { PatchCollectionDto } from './dto/patch-collection.dto';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.collectionsService.findAll(user.id, pagination);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.collectionsService.findOne(user.id, id);
  }

  @Get(':id/bookmarks')
  findBookmarks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.collectionsService.findBookmarks(user.id, id, pagination);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCollectionDto,
  ) {
    return this.collectionsService.create(user.id, dto);
  }

  @Put(':id')
  replace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceCollectionDto,
  ) {
    return this.collectionsService.replace(user.id, id, dto);
  }

  @Patch(':id')
  patch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchCollectionDto,
  ) {
    return this.collectionsService.patch(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.collectionsService.remove(user.id, id);
  }
}
