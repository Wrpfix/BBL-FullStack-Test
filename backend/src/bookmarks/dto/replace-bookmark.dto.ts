import { IsInt, IsOptional, IsString, IsUrl, Length } from 'class-validator';

/** Full replacement body for PUT /bookmarks/:id. */
export class ReplaceBookmarkDto {
  @IsUrl({ require_protocol: true })
  url!: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string | null;

  // null unsets the collection ("Unsorted"); omit @Type() coercion — see
  // create-bookmark.dto.ts for why.
  @IsOptional()
  @IsInt()
  collectionId?: number | null;
}
