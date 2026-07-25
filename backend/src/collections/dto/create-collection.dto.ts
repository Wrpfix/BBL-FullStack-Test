import { IsString, Length } from 'class-validator';

export class CreateCollectionDto {
  @IsString()
  @Length(1, 100)
  name!: string;
}
