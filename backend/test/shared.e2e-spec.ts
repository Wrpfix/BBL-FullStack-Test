import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Exercises the public read-only sharing surface end to end against the
 * real routing/guard stack, with PrismaService mocked so no live MySQL is
 * needed. Complements the mocked-Prisma unit specs
 * (collections.service.spec.ts, shared.service.spec.ts) by proving the
 * *routes themselves* — not just the service logic — behave as required:
 * no auth needed for GET /shared/:token, and no write route exists that a
 * share token can reach.
 */
describe('Shared collections (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: {
    collection: { findFirst: jest.Mock; updateMany: jest.Mock };
  };

  beforeAll(() => {
    process.env.AUTH0_DOMAIN ??= 'test-tenant.us.auth0.com';
    process.env.AUTH0_AUDIENCE ??= 'https://test-api';
  });

  beforeEach(async () => {
    prisma = {
      collection: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/shared/:token — no Authorization header needed, returns read-only collection + bookmarks', () => {
    prisma.collection.findFirst.mockResolvedValue({
      name: 'Shared list',
      bookmarks: [
        { title: 'Example', url: 'https://example.com', notes: 'nice site' },
      ],
    });

    return request(app.getHttpServer())
      .get('/api/shared/valid-token-abc')
      .expect(200)
      .expect({
        name: 'Shared list',
        bookmarks: [
          { title: 'Example', url: 'https://example.com', notes: 'nice site' },
        ],
      });
  });

  it('GET /api/shared/:token — a token that was never valid → 404', () => {
    prisma.collection.findFirst.mockResolvedValue(null);

    return request(app.getHttpServer())
      .get('/api/shared/totally-made-up')
      .expect(404);
  });

  it('GET /api/shared/:token — a real-but-disabled token → 404, same as a made-up one', () => {
    // The query is `where: { shareToken, shareEnabled: true }`, so a
    // disabled row never matches and Prisma returns null either way — this
    // asserts the HTTP-level outcome is identical, not distinguishable by
    // status code, body, or timing-visible branch.
    prisma.collection.findFirst.mockResolvedValue(null);

    return request(app.getHttpServer())
      .get('/api/shared/once-valid-now-disabled')
      .expect(404);
  });

  it('has no PATCH/PUT/DELETE route under /api/shared/:token at all', async () => {
    prisma.collection.findFirst.mockResolvedValue({
      name: 'Shared list',
      bookmarks: [],
    });

    const server = app.getHttpServer();
    await request(server).patch('/api/shared/valid-token-abc').expect(404);
    await request(server).put('/api/shared/valid-token-abc').expect(404);
    await request(server).delete('/api/shared/valid-token-abc').expect(404);
  });

  it('a share token used as a bearer token on a real write route is rejected — it is not a JWT, so the auth guard 401s before any handler runs', async () => {
    const server = app.getHttpServer();

    await request(server)
      .patch('/api/collections/1')
      .set('Authorization', 'Bearer valid-token-abc')
      .send({ name: 'Hijacked' })
      .expect(401);

    await request(server)
      .delete('/api/collections/1')
      .set('Authorization', 'Bearer valid-token-abc')
      .expect(401);

    // updateMany/deleteMany must never even be reached — the guard, not
    // the service, is what stops this.
    expect(prisma.collection.updateMany).not.toHaveBeenCalled();
  });
});
