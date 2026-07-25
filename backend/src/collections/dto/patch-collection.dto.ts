import { PartialType } from '@nestjs/mapped-types';
import { ReplaceCollectionDto } from './replace-collection.dto';

export class PatchCollectionDto extends PartialType(ReplaceCollectionDto) {}
