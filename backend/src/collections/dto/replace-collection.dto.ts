import { IsString, Length } from 'class-validator';

/** Full replacement body for PUT /collections/:id. */
export class ReplaceCollectionDto {
  @IsString()
  @Length(1, 100)
  name!: string;
}
