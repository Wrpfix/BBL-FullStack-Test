import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResult } from '../common/paginated-result.interface';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';
import { ReplaceBookmarkDto } from './dto/replace-bookmark.dto';
import { PatchBookmarkDto } from './dto/patch-bookmark.dto';
import { ListBookmarksQueryDto } from './dto/list-bookmarks-query.dto';

@Injectable()
export class BookmarksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    ownerId: number,
    { page = 1, limit = 20, collectionId }: ListBookmarksQueryDto,
  ): Promise<PaginatedResult<import('@prisma/client').Bookmark>> {
    const where = {
      ownerId,
      ...(collectionId !== undefined && { collectionId }),
    };
    const [data, total] = await Promise.all([
      this.prisma.bookmark.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bookmark.count({ where }),
    ]);
    return { data, page, limit, total };
  }

  /** Throws 404 (never 403) if the bookmark doesn't exist or isn't owned by ownerId. */
  async findOne(ownerId: number, id: number) {
    const bookmark = await this.prisma.bookmark.findFirst({
      where: { id, ownerId },
    });
    if (!bookmark) {
      throw new NotFoundException();
    }
    return bookmark;
  }

  async create(ownerId: number, dto: CreateBookmarkDto) {
    await this.assertCollectionOwnership(ownerId, dto.collectionId);
    return this.prisma.bookmark.create({
      data: { ...dto, ownerId },
    });
  }

  async replace(ownerId: number, id: number, dto: ReplaceBookmarkDto) {
    // PUT is a full replace: fields the client omits must be cleared, not
    // left untouched (that's PATCH's job) — so default them explicitly
    // rather than passing `dto` straight through like patch() does.
    return this.update(ownerId, id, {
      url: dto.url,
      title: dto.title,
      notes: dto.notes ?? null,
      collectionId: dto.collectionId ?? null,
    });
  }

  async patch(ownerId: number, id: number, dto: PatchBookmarkDto) {
    return this.update(ownerId, id, dto);
  }

  private async update(
    ownerId: number,
    id: number,
    data: ReplaceBookmarkDto | PatchBookmarkDto,
  ) {
    await this.assertCollectionOwnership(ownerId, data.collectionId);
    const { count } = await this.prisma.bookmark.updateMany({
      where: { id, ownerId },
      data,
    });
    if (count === 0) {
      throw new NotFoundException();
    }
    return this.prisma.bookmark.findUniqueOrThrow({ where: { id } });
  }

  async remove(ownerId: number, id: number) {
    const { count } = await this.prisma.bookmark.deleteMany({
      where: { id, ownerId },
    });
    if (count === 0) {
      throw new NotFoundException();
    }
  }

  /**
   * A bookmark's collectionId is a body-supplied reference to a second
   * resource, not the URL-scoped one — so it needs its own ownership check.
   * Reusing an existing collection id (yours) or null (Unsorted) is fine;
   * a missing id and someone else's id must produce the identical error, or
   * the response would leak whether that collection id exists at all.
   */
  private async assertCollectionOwnership(
    ownerId: number,
    collectionId: number | null | undefined,
  ) {
    if (collectionId === undefined || collectionId === null) {
      return;
    }
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, ownerId },
    });
    if (!collection) {
      throw new BadRequestException('Invalid collectionId');
    }
  }
}
