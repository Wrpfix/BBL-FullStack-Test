import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SharedService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public, unauthenticated lookup by capability token. Throws 404 for a
   * token that doesn't exist AND for one that exists but is currently
   * disabled (shareEnabled: false) — those two cases must be
   * indistinguishable to the caller, or the response itself becomes an
   * oracle for enumerating valid-but-disabled tokens.
   *
   * Returns only read-only, owner-blind fields: never ownerId, and never
   * the Collection/Bookmark rows straight from Prisma (which carry it).
   */
  async findByToken(token: string) {
    const collection = await this.prisma.collection.findFirst({
      where: { shareToken: token, shareEnabled: true },
      include: {
        bookmarks: {
          orderBy: { createdAt: 'desc' },
          select: { title: true, url: true, notes: true },
        },
      },
    });
    if (!collection) {
      throw new NotFoundException();
    }
    return {
      name: collection.name,
      bookmarks: collection.bookmarks,
    };
  }
}
