import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListBookmarksQueryDto extends PaginationQueryDto {
  // Query strings arrive as strings, so coercion here is safe (no null case
  // like the JSON-body DTOs have).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  collectionId?: number;
}
