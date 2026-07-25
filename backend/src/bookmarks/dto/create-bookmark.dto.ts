import { IsInt, IsOptional, IsString, IsUrl, Length } from 'class-validator';

export class CreateBookmarkDto {
  @IsUrl({ require_protocol: true })
  url!: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;

  // Comes from the JSON body, already a number — no @Type() coercion here
  // (unlike query-string DTOs), since Number(null) would silently become 0.
  @IsOptional()
  @IsInt()
  collectionId?: number | null;
}
