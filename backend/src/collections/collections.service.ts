import { randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResult } from '../common/paginated-result.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { ReplaceCollectionDto } from './dto/replace-collection.dto';
import { PatchCollectionDto } from './dto/patch-collection.dto';

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    ownerId: number,
    { page = 1, limit = 20 }: PaginationQueryDto,
  ): Promise<PaginatedResult<import('@prisma/client').Collection>> {
    const [data, total] = await Promise.all([
      this.prisma.collection.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.collection.count({ where: { ownerId } }),
    ]);
    return { data, page, limit, total };
  }

  /** Throws 404 (never 403) if the collection doesn't exist or isn't owned by ownerId. */
  async findOne(ownerId: number, id: number) {
    const collection = await this.prisma.collection.findFirst({
      where: { id, ownerId },
    });
    if (!collection) {
      throw new NotFoundException();
    }
    return collection;
  }

  async create(ownerId: number, dto: CreateCollectionDto) {
    return this.prisma.collection.create({
      data: { ...dto, ownerId },
    });
  }

  async replace(ownerId: number, id: number, dto: ReplaceCollectionDto) {
    return this.update(ownerId, id, dto);
  }

  async patch(ownerId: number, id: number, dto: PatchCollectionDto) {
    return this.update(ownerId, id, dto);
  }

  private async update(
    ownerId: number,
    id: number,
    data: ReplaceCollectionDto | PatchCollectionDto,
  ) {
    const { count } = await this.prisma.collection.updateMany({
      where: { id, ownerId },
      data,
    });
    if (count === 0) {
      throw new NotFoundException();
    }
    return this.prisma.collection.findUniqueOrThrow({ where: { id } });
  }

  async remove(ownerId: number, id: number) {
    // Bookmarks inside are not deleted: Bookmark.collectionId has
    // onDelete: SetNull, so the FK cascade unsets them to "Unsorted".
    const { count } = await this.prisma.collection.deleteMany({
      where: { id, ownerId },
    });
    if (count === 0) {
      throw new NotFoundException();
    }
  }

  async findBookmarks(
    ownerId: number,
    id: number,
    pagination: PaginationQueryDto,
  ) {
    // Confirm ownership first so a foreign collection id 404s exactly like
    // GET /collections/:id, rather than silently returning an empty list.
    await this.findOne(ownerId, id);

    const { page = 1, limit = 20 } = pagination;
    const [data, total] = await Promise.all([
      this.prisma.bookmark.findMany({
        where: { ownerId, collectionId: id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bookmark.count({ where: { ownerId, collectionId: id } }),
    ]);
    return { data, page, limit, total };
  }

  /**
   * (Re)issues a fresh, unguessable share token and turns sharing on.
   * Always generates a brand-new token — even if one already exists — so
   * that re-sharing doubles as an implicit revoke-and-reissue of any
   * previously distributed link, with no separate "rotate" endpoint needed.
   */
  async share(ownerId: number, id: number) {
    const shareToken = randomBytes(32).toString('base64url');
    const { count } = await this.prisma.collection.updateMany({
      where: { id, ownerId },
      data: { shareToken, shareEnabled: true },
    });
    if (count === 0) {
      throw new NotFoundException();
    }
    return { shareToken, shareEnabled: true };
  }

  /**
   * Turns sharing off. Also nulls shareToken rather than just flipping
   * shareEnabled: POST /share always mints a fresh token on next share
   * anyway, so there's no functional reason to retain the disabled one —
   * and not retaining it means a stray bug that skips the shareEnabled
   * check elsewhere can't be exploited by replaying an old token.
   */
  async unshare(ownerId: number, id: number) {
    const { count } = await this.prisma.collection.updateMany({
      where: { id, ownerId },
      data: { shareToken: null, shareEnabled: false },
    });
    if (count === 0) {
      throw new NotFoundException();
    }
  }
}
