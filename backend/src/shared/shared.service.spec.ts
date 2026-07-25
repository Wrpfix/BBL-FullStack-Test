import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SharedService } from './shared.service';

describe('SharedService', () => {
  const buildPrisma = () =>
    ({
      collection: {
        findFirst: jest.fn(),
      },
    }) as unknown as PrismaService;

  describe('findByToken', () => {
    it('looks up by shareToken scoped to shareEnabled: true', async () => {
      const prisma = buildPrisma();
      (prisma.collection.findFirst as jest.Mock).mockResolvedValue({
        name: 'Reading list',
        bookmarks: [],
      });
      const service = new SharedService(prisma);

      await service.findByToken('tok123');

      expect(prisma.collection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { shareToken: 'tok123', shareEnabled: true },
        }),
      );
    });

    it('returns only name + bookmark title/url/notes — never ownerId or other fields', async () => {
      const prisma = buildPrisma();
      (prisma.collection.findFirst as jest.Mock).mockResolvedValue({
        id: 1,
        ownerId: 7,
        name: 'Reading list',
        createdAt: new Date(),
        updatedAt: new Date(),
        bookmarks: [
          { title: 'Example', url: 'https://example.com', notes: null },
        ],
      });
      const service = new SharedService(prisma);

      const result = await service.findByToken('tok123');

      expect(result).toEqual({
        name: 'Reading list',
        bookmarks: [
          { title: 'Example', url: 'https://example.com', notes: null },
        ],
      });
      expect(result).not.toHaveProperty('ownerId');
      expect(result).not.toHaveProperty('id');
    });

    it('404s for a token that does not exist', async () => {
      const prisma = buildPrisma();
      (prisma.collection.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new SharedService(prisma);

      await expect(service.findByToken('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404s identically for a token that exists but is disabled — the query itself excludes shareEnabled: false rows, so this is indistinguishable from a wrong token', async () => {
      const prisma = buildPrisma();
      // A disabled collection's row never matches the findFirst filter, so
      // Prisma returns null exactly as it would for a nonexistent token.
      (prisma.collection.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new SharedService(prisma);

      await expect(
        service.findByToken('once-valid-now-disabled'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
