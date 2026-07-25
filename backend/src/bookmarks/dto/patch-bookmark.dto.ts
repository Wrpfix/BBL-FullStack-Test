import { PartialType } from '@nestjs/mapped-types';
import { ReplaceBookmarkDto } from './replace-bookmark.dto';

export class PatchBookmarkDto extends PartialType(ReplaceBookmarkDto) {}
