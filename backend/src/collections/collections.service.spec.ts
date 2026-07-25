import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsService } from './collections.service';

describe('CollectionsService', () => {
  const buildPrisma = () =>
    ({
      collection: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      bookmark: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    }) as unknown as PrismaService;

  describe('findAll', () => {
    it('always scopes the query by ownerId, never trusting a bare list call', async () => {
      const prisma = buildPrisma();
      (prisma.collection.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.collection.count as jest.Mock).mockResolvedValue(0);
      const service = new CollectionsService(prisma);

      await service.findAll(7, { page: 1, limit: 20 });

      expect(prisma.collection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerId: 7 } }),
      );
      expect(prisma.collection.count).toHaveBeenCalledWith({
        where: { ownerId: 7 },
      });
    });
  });

  describe('findOne', () => {
    it('scopes the lookup by id AND ownerId in a single query', async () => {
      const prisma = buildPrisma();
      const row = { id: 1, ownerId: 7, name: 'Reading' };
      (prisma.collection.findFirst as jest.Mock).mockResolvedValue(row);
      const service = new CollectionsService(prisma);

      const result = await service.findOne(7, 1);

      expect(result).toBe(row);
      expect(prisma.collection.findFirst).toHaveBeenCalledWith({
        where: { id: 1, ownerId: 7 },
      });
    });

    it('throws 404 (not 403) when the collection belongs to someone else', async () => {
      const prisma = buildPrisma();
      (prisma.collection.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new CollectionsService(prisma);

      await expect(service.findOne(7, 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 when the collection id does not exist at all — identical to the cross-owner case', async () => {
      const prisma = buildPrisma();
      (prisma.collection.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new CollectionsService(prisma);

      await expect(service.findOne(7, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('patch/replace', () => {
    it('scopes the update by ownerId via updateMany, and 404s if it touched nothing', async () => {
      const prisma = buildPrisma();
      (prisma.collection.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
      const service = new CollectionsService(prisma);

      await expect(
        service.patch(7, 999, { name: 'Hijacked' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.collection.updateMany).toHaveBeenCalledWith({
        where: { id: 999, ownerId: 7 },
        data: { name: 'Hijacked' },
      });
    });

    it('re-fetches and returns the row after a successful scoped update', async () => {
      const prisma = buildPrisma();
      (prisma.collection.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      const updated = { id: 1, ownerId: 7, name: 'Renamed' };
      (prisma.collection.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        updated,
      );
      const service = new CollectionsService(prisma);

      const result = await service.replace(7, 1, { name: 'Renamed' });

      expect(result).toBe(updated);
    });
  });

  describe('remove', () => {
    it('scopes the delete by ownerId and 404s if nothing matched', async () => {
      const prisma = buildPrisma();
      (prisma.collection.deleteMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
      const service = new CollectionsService(prisma);

      await expect(service.remove(7, 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.collection.deleteMany).toHaveBeenCalledWith({
        where: { id: 999, ownerId: 7 },
      });
    });
  });

  describe('findBookmarks', () => {
    it('404s for a foreign collection id instead of returning an (empty) list', async () => {
      const prisma = buildPrisma();
      (prisma.collection.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new CollectionsService(prisma);

      await expect(
        service.findBookmarks(7, 999, { page: 1, limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.bookmark.findMany).not.toHaveBeenCalled();
    });

    it('scopes the bookmark list by both ownerId and collectionId once ownership is confirmed', async () => {
      const prisma = buildPrisma();
      (prisma.collection.findFirst as jest.Mock).mockResolvedValue({
        id: 1,
        ownerId: 7,
      });
      (prisma.bookmark.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bookmark.count as jest.Mock).mockResolvedValue(0);
      const service = new CollectionsService(prisma);

      await service.findBookmarks(7, 1, { page: 1, limit: 20 });

      expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerId: 7, collectionId: 1 } }),
      );
    });
  });
});
