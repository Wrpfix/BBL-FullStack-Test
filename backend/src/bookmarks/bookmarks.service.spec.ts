import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookmarksService } from './bookmarks.service';

describe('BookmarksService', () => {
  const buildPrisma = () =>
    ({
      bookmark: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      collection: {
        findFirst: jest.fn(),
      },
    }) as unknown as PrismaService;

  describe('findAll', () => {
    it('always scopes by ownerId, and adds collectionId only when a filter is given', async () => {
      const prisma = buildPrisma();
      (prisma.bookmark.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bookmark.count as jest.Mock).mockResolvedValue(0);
      const service = new BookmarksService(prisma);

      await service.findAll(7, { page: 1, limit: 20 });

      expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerId: 7 } }),
      );
    });

    it('filters by collectionId in addition to ownerId when provided', async () => {
      const prisma = buildPrisma();
      (prisma.bookmark.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bookmark.count as jest.Mock).mockResolvedValue(0);
      const service = new BookmarksService(prisma);

      await service.findAll(7, { page: 1, limit: 20, collectionId: 3 });

      expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerId: 7, collectionId: 3 } }),
      );
    });
  });

  describe('findOne', () => {
    it('throws 404 (not 403) for a bookmark owned by another user', async () => {
      const prisma = buildPrisma();
      (prisma.bookmark.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new BookmarksService(prisma);

      await expect(service.findOne(7, 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.bookmark.findFirst).toHaveBeenCalledWith({
        where: { id: 999, ownerId: 7 },
      });
    });
  });

  describe('create', () => {
    it('rejects a collectionId belonging to another user with the same error as a nonexistent one', async () => {
      const prisma = buildPrisma();
      (prisma.collection.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new BookmarksService(prisma);

      await expect(
        service.create(7, {
          url: 'https://example.com',
          title: 'Example',
          collectionId: 999,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.collection.findFirst).toHaveBeenCalledWith({
        where: { id: 999, ownerId: 7 },
      });
      expect(prisma.bookmark.create).not.toHaveBeenCalled();
    });

    it('creates with ownerId attached when collectionId is omitted', async () => {
      const prisma = buildPrisma();
      const created = { id: 1, ownerId: 7, url: 'https://example.com' };
      (prisma.bookmark.create as jest.Mock).mockResolvedValue(created);
      const service = new BookmarksService(prisma);

      const result = await service.create(7, {
        url: 'https://example.com',
        title: 'Example',
      });

      expect(result).toBe(created);
      expect(prisma.bookmark.create).toHaveBeenCalledWith({
        data: { url: 'https://example.com', title: 'Example', ownerId: 7 },
      });
    });

    it('allows a null collectionId without a lookup ("Unsorted")', async () => {
      const prisma = buildPrisma();
      (prisma.bookmark.create as jest.Mock).mockResolvedValue({});
      const service = new BookmarksService(prisma);

      await service.create(7, {
        url: 'https://example.com',
        title: 'Example',
        collectionId: null,
      });

      expect(prisma.collection.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('patch/replace', () => {
    it('scopes the update by ownerId via updateMany, and 404s if it touched nothing', async () => {
      const prisma = buildPrisma();
      (prisma.bookmark.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
      const service = new BookmarksService(prisma);

      await expect(
        service.patch(7, 999, { title: 'Hijacked' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.bookmark.updateMany).toHaveBeenCalledWith({
        where: { id: 999, ownerId: 7 },
        data: { title: 'Hijacked' },
      });
    });

    it('replace (PUT) clears notes/collectionId when the client omits them, unlike patch', async () => {
      const prisma = buildPrisma();
      (prisma.bookmark.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (prisma.bookmark.findUniqueOrThrow as jest.Mock).mockResolvedValue({});
      const service = new BookmarksService(prisma);

      await service.replace(7, 1, {
        url: 'https://example.com',
        title: 'Example',
      });

      expect(prisma.bookmark.updateMany).toHaveBeenCalledWith({
        where: { id: 1, ownerId: 7 },
        data: {
          url: 'https://example.com',
          title: 'Example',
          notes: null,
          collectionId: null,
        },
      });
    });

    it('rejects moving a bookmark into a collection owned by someone else', async () => {
      const prisma = buildPrisma();
      (prisma.collection.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new BookmarksService(prisma);

      await expect(
        service.patch(7, 1, { collectionId: 999 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.bookmark.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('scopes the delete by ownerId and 404s if nothing matched', async () => {
      const prisma = buildPrisma();
      (prisma.bookmark.deleteMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
      const service = new BookmarksService(prisma);

      await expect(service.remove(7, 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.bookmark.deleteMany).toHaveBeenCalledWith({
        where: { id: 999, ownerId: 7 },
      });
    });
  });
});
