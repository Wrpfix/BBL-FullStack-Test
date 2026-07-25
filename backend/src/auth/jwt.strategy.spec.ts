import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const configService = {
    getOrThrow: (key: string) =>
      ({
        AUTH0_DOMAIN: 'test-tenant.us.auth0.com',
        AUTH0_AUDIENCE: 'https://test-api',
      })[key],
  } as unknown as ConfigService;

  const buildPrisma = () =>
    ({
      user: { upsert: jest.fn() },
    }) as unknown as PrismaService;

  it('throws if AUTH0_DOMAIN or AUTH0_AUDIENCE is missing', () => {
    const missingConfig = {
      getOrThrow: () => {
        throw new Error('missing config');
      },
    } as unknown as ConfigService;

    expect(() => new JwtStrategy(missingConfig, buildPrisma())).toThrow();
  });

  describe('validate (JIT user provisioning)', () => {
    it('upserts on the auth0Sub and maps the internal id/sub onto the request user', async () => {
      const prisma = buildPrisma();
      (prisma.user.upsert as jest.Mock).mockResolvedValue({
        id: 42,
        auth0Sub: 'auth0|abc123',
        email: 'auth0_abc123@placeholder.invalid',
      });
      const strategy = new JwtStrategy(configService, prisma);

      const result = await strategy.validate({
        sub: 'auth0|abc123',
        aud: 'https://test-api',
        iss: 'https://test-tenant.us.auth0.com/',
      });

      expect(result).toEqual({ id: 42, auth0Sub: 'auth0|abc123' });
      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { auth0Sub: 'auth0|abc123' },
        update: {},
        create: {
          auth0Sub: 'auth0|abc123',
          email: 'auth0_abc123@placeholder.invalid',
        },
      });
    });

    it('reuses the existing row for a sub seen before (upsert is idempotent, no duplicate user)', async () => {
      const prisma = buildPrisma();
      (prisma.user.upsert as jest.Mock).mockResolvedValue({
        id: 7,
        auth0Sub: 'auth0|returning-user',
        email: 'someone@example.com',
      });
      const strategy = new JwtStrategy(configService, prisma);

      const first = await strategy.validate({
        sub: 'auth0|returning-user',
        aud: 'https://test-api',
        iss: 'https://test-tenant.us.auth0.com/',
      });
      const second = await strategy.validate({
        sub: 'auth0|returning-user',
        aud: 'https://test-api',
        iss: 'https://test-tenant.us.auth0.com/',
      });

      expect(first).toEqual({ id: 7, auth0Sub: 'auth0|returning-user' });
      expect(second).toEqual(first);
      expect(prisma.user.upsert).toHaveBeenCalledTimes(2);
    });
  });
});
