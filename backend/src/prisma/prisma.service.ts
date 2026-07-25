import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // shareToken is a secret capability, not just another Collection
    // field — omitting it globally means every owner-facing query (list,
    // findOne, patch/replace's re-fetch, etc.) can't leak it by accident
    // just because nobody remembered to add a `select`. The only place
    // that needs the value is CollectionsService.share(), which returns it
    // from the literal object it just wrote, not from a query result — so
    // it never needs to reach through this omit.
    super({ omit: { collection: { shareToken: true } } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
