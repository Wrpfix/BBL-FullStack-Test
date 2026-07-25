import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { SharedService } from './shared.service';

/**
 * Public, read-only surface for collections shared via capability token.
 * No PATCH/PUT/DELETE handlers exist here and none may be added — a
 * share token grants read access only, never a write path, no matter what
 * URL is guessed (see CLAUDE.md privacy requirements).
 */
@Controller('shared')
export class SharedController {
  constructor(private readonly sharedService: SharedService) {}

  @Public()
  @Get(':token')
  findByToken(@Param('token') token: string) {
    return this.sharedService.findByToken(token);
  }
}
