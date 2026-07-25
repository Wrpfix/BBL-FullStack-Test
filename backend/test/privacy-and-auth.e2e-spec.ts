import { generateKeyPairSync } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Real e2e tests against a real (throwaway) MySQL database — no mocked
 * Prisma. These exist to prove the claims in CLAUDE.md's "Non-negotiable
 * rules" hold at the HTTP layer, not just in the service unit specs:
 *
 *   1. Cross-user access to a collection/bookmark 404s (never 403 — a 403
 *      would leak that the resource exists).
 *   2. Every protected route rejects missing/expired/wrong-audience tokens.
 *   3. GET /me only ever returns the token's own user.
 *   4. GET /collections/:id/bookmarks never returns another user's rows.
 *   5. Pagination / filter query params behave correctly.
 *
 * Point DATABASE_URL (see below) at a disposable test database before
 * running — this suite truncates tables between tests. It does not touch
 * Auth0's live JWKS endpoint: JwtStrategy's key provider is swapped for a
 * locally generated RSA key pair, same technique as
 * src/auth/jwt-verification.spec.ts.
 */
describe('Privacy & auth (e2e, real DB)', () => {
  const DOMAIN = 'test-tenant.us.auth0.com';
  const ISSUER = `https://${DOMAIN}/`;
  const AUDIENCE = 'https://test-api';

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  let app: INestApplication<App>;
  let prisma: PrismaService;

  function signToken(
    sub: string,
    overrides: {
      aud?: string;
      iss?: string;
      expiresIn?: number | string;
    } = {},
  ) {
    return jwt.sign({ sub }, privateKey, {
      algorithm: 'RS256',
      audience: overrides.aud ?? AUDIENCE,
      issuer: overrides.iss ?? ISSUER,
      expiresIn: overrides.expiresIn ?? '1h',
    });
  }

  function authAs(sub: string) {
    return `Bearer ${signToken(sub)}`;
  }

  beforeAll(() => {
    process.env.AUTH0_DOMAIN = DOMAIN;
    process.env.AUTH0_AUDIENCE = AUDIENCE;
    if (!process.env.DATABASE_URL?.includes('bookmarks_test')) {
      throw new Error(
        'Refusing to run: DATABASE_URL must point at the disposable test ' +
          'database (expected it to contain "bookmarks_test"). This suite ' +
          'truncates tables between tests.',
      );
    }
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    // Bypass the real JWKS network call — verify against our local key pair.
    const strategy = app.get(JwtStrategy);
    (strategy as any)._secretOrKeyProvider = (
      _req: unknown,
      _token: string,
      done: (err: unknown, key?: string) => void,
    ) => done(null, publicKey.export({ type: 'spki', format: 'pem' }));

    // Clean slate: children first (FK order).
    await prisma.bookmark.deleteMany();
    await prisma.collection.deleteMany();
    await prisma.user.deleteMany();
  });

  afterEach(async () => {
    await app.close();
  });

  async function seedUser(sub: string, email: string) {
    return prisma.user.create({ data: { auth0Sub: sub, email } });
  }

  // ---------------------------------------------------------------------
  // 1. Cross-user isolation on Collection + Bookmark: must 404, not 403.
  // ---------------------------------------------------------------------
  describe('cross-user isolation', () => {
    it('user A cannot GET/PUT/PATCH/DELETE user B\'s collection — 404, not 403', async () => {
      const userA = await seedUser('auth0|user-a', 'a@example.com');
      const userB = await seedUser('auth0|user-b', 'b@example.com');
      const bCollection = await prisma.collection.create({
        data: { name: "B's private collection", ownerId: userB.id },
      });
      const server = app.getHttpServer();
      const tokenA = authAs(userA.auth0Sub);

      const getRes = await request(server)
        .get(`/api/collections/${bCollection.id}`)
        .set('Authorization', tokenA);
      expect(getRes.status).toBe(404);

      const putRes = await request(server)
        .put(`/api/collections/${bCollection.id}`)
        .set('Authorization', tokenA)
        .send({ name: 'Hijacked' });
      expect(putRes.status).toBe(404);

      const patchRes = await request(server)
        .patch(`/api/collections/${bCollection.id}`)
        .set('Authorization', tokenA)
        .send({ name: 'Hijacked' });
      expect(patchRes.status).toBe(404);

      const deleteRes = await request(server)
        .delete(`/api/collections/${bCollection.id}`)
        .set('Authorization', tokenA);
      expect(deleteRes.status).toBe(404);

      const bookmarksRes = await request(server)
        .get(`/api/collections/${bCollection.id}/bookmarks`)
        .set('Authorization', tokenA);
      expect(bookmarksRes.status).toBe(404);

      const shareRes = await request(server)
        .post(`/api/collections/${bCollection.id}/share`)
        .set('Authorization', tokenA);
      expect(shareRes.status).toBe(404);

      const unshareRes = await request(server)
        .delete(`/api/collections/${bCollection.id}/share`)
        .set('Authorization', tokenA);
      expect(unshareRes.status).toBe(404);

      // Confirm none of this actually mutated B's row.
      const stillThere = await prisma.collection.findUnique({
        where: { id: bCollection.id },
      });
      expect(stillThere?.name).toBe("B's private collection");
    });

    it('user A cannot GET/PUT/PATCH/DELETE user B\'s bookmark — 404, not 403', async () => {
      const userA = await seedUser('auth0|user-a', 'a@example.com');
      const userB = await seedUser('auth0|user-b', 'b@example.com');
      const bBookmark = await prisma.bookmark.create({
        data: {
          url: 'https://example.com/b-private',
          title: "B's private bookmark",
          ownerId: userB.id,
        },
      });
      const server = app.getHttpServer();
      const tokenA = authAs(userA.auth0Sub);

      const getRes = await request(server)
        .get(`/api/bookmarks/${bBookmark.id}`)
        .set('Authorization', tokenA);
      expect(getRes.status).toBe(404);

      const putRes = await request(server)
        .put(`/api/bookmarks/${bBookmark.id}`)
        .set('Authorization', tokenA)
        .send({ url: 'https://evil.example.com', title: 'Hijacked' });
      expect(putRes.status).toBe(404);

      const patchRes = await request(server)
        .patch(`/api/bookmarks/${bBookmark.id}`)
        .set('Authorization', tokenA)
        .send({ title: 'Hijacked' });
      expect(patchRes.status).toBe(404);

      const deleteRes = await request(server)
        .delete(`/api/bookmarks/${bBookmark.id}`)
        .set('Authorization', tokenA);
      expect(deleteRes.status).toBe(404);

      const stillThere = await prisma.bookmark.findUnique({
        where: { id: bBookmark.id },
      });
      expect(stillThere?.title).toBe("B's private bookmark");
    });

    it('a non-existent id and someone else\'s id 404 identically (no existence oracle)', async () => {
      const userA = await seedUser('auth0|user-a', 'a@example.com');
      const userB = await seedUser('auth0|user-b', 'b@example.com');
      const bCollection = await prisma.collection.create({
        data: { name: "B's collection", ownerId: userB.id },
      });
      const server = app.getHttpServer();
      const tokenA = authAs(userA.auth0Sub);

      const foreignRes = await request(server)
        .get(`/api/collections/${bCollection.id}`)
        .set('Authorization', tokenA);
      const madeUpRes = await request(server)
        .get(`/api/collections/999999`)
        .set('Authorization', tokenA);

      expect(foreignRes.status).toBe(404);
      expect(madeUpRes.status).toBe(404);
      expect(foreignRes.body).toEqual(madeUpRes.body);
    });

    it('POST /bookmarks with a collectionId owned by another user is rejected the same way as a made-up collectionId (400, no leak)', async () => {
      const userA = await seedUser('auth0|user-a', 'a@example.com');
      const userB = await seedUser('auth0|user-b', 'b@example.com');
      const bCollection = await prisma.collection.create({
        data: { name: "B's collection", ownerId: userB.id },
      });
      const server = app.getHttpServer();
      const tokenA = authAs(userA.auth0Sub);

      const foreignRes = await request(server)
        .post('/api/bookmarks')
        .set('Authorization', tokenA)
        .send({
          url: 'https://example.com/x',
          title: 'x',
          collectionId: bCollection.id,
        });
      const madeUpRes = await request(server)
        .post('/api/bookmarks')
        .set('Authorization', tokenA)
        .send({
          url: 'https://example.com/x',
          title: 'x',
          collectionId: 999999,
        });

      expect(foreignRes.status).toBe(400);
      expect(madeUpRes.status).toBe(400);

      const created = await prisma.bookmark.findMany({
        where: { ownerId: userA.id },
      });
      expect(created).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------
  // 2. Every protected route rejects missing / expired / wrong-audience
  //    tokens.
  // ---------------------------------------------------------------------
  describe('auth guard on every protected route', () => {
    const protectedRoutes: Array<{
      method: 'get' | 'post' | 'patch' | 'put' | 'delete';
      path: string;
    }> = [
      { method: 'get', path: '/api/me' },
      { method: 'get', path: '/api/collections' },
      { method: 'get', path: '/api/collections/1' },
      { method: 'get', path: '/api/collections/1/bookmarks' },
      { method: 'post', path: '/api/collections' },
      { method: 'put', path: '/api/collections/1' },
      { method: 'patch', path: '/api/collections/1' },
      { method: 'delete', path: '/api/collections/1' },
      { method: 'post', path: '/api/collections/1/share' },
      { method: 'delete', path: '/api/collections/1/share' },
      { method: 'get', path: '/api/bookmarks' },
      { method: 'get', path: '/api/bookmarks/1' },
      { method: 'post', path: '/api/bookmarks' },
      { method: 'put', path: '/api/bookmarks/1' },
      { method: 'patch', path: '/api/bookmarks/1' },
      { method: 'delete', path: '/api/bookmarks/1' },
    ];

    it.each(protectedRoutes)(
      '$method $path — 401 with no Authorization header at all',
      async ({ method, path }) => {
        const res = await request(app.getHttpServer())[method](path);
        expect(res.status).toBe(401);
      },
    );

    it.each(protectedRoutes)(
      '$method $path — 401 with an expired token',
      async ({ method, path }) => {
        const expired = signToken('auth0|user-a', { expiresIn: -10 });
        const res = await request(app.getHttpServer())
          [method](path)
          .set('Authorization', `Bearer ${expired}`);
        expect(res.status).toBe(401);
      },
    );

    it.each(protectedRoutes)(
      '$method $path — 401 with a token issued for the wrong audience',
      async ({ method, path }) => {
        const wrongAud = signToken('auth0|user-a', {
          aud: 'https://someone-elses-api',
        });
        const res = await request(app.getHttpServer())
          [method](path)
          .set('Authorization', `Bearer ${wrongAud}`);
        expect(res.status).toBe(401);
      },
    );

    it.each(protectedRoutes)(
      '$method $path — 401 with a garbage bearer token',
      async ({ method, path }) => {
        const res = await request(app.getHttpServer())
          [method](path)
          .set('Authorization', 'Bearer not-a-real-jwt');
        expect(res.status).toBe(401);
      },
    );

    it('/api/health remains public (sanity check that the guard is opt-out, not broken globally)', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------
  // 3. /me matches the token's own user, never another user's data.
  // ---------------------------------------------------------------------
  describe('GET /me', () => {
    it('returns exactly the user identified by the token — not the first row, not another user', async () => {
      // Seed B first so an ownerId/"first row" bug would surface immediately.
      const userB = await seedUser('auth0|user-b', 'b@example.com');
      const userA = await seedUser('auth0|user-a', 'a@example.com');

      const res = await request(app.getHttpServer())
        .get('/api/me')
        .set('Authorization', authAs(userA.auth0Sub));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(userA.id);
      expect(res.body.auth0Sub).toBe(userA.auth0Sub);
      expect(res.body.email).toBe(userA.email);
      expect(res.body.id).not.toBe(userB.id);
    });

    it('a second, different token returns a different /me payload', async () => {
      const userA = await seedUser('auth0|user-a', 'a@example.com');
      const userB = await seedUser('auth0|user-b', 'b@example.com');
      const server = app.getHttpServer();

      const resA = await request(server)
        .get('/api/me')
        .set('Authorization', authAs(userA.auth0Sub));
      const resB = await request(server)
        .get('/api/me')
        .set('Authorization', authAs(userB.auth0Sub));

      expect(resA.body.id).toBe(userA.id);
      expect(resB.body.id).toBe(userB.id);
      expect(resA.body.id).not.toBe(resB.body.id);
    });
  });

  // ---------------------------------------------------------------------
  // 4. GET /collections/:id/bookmarks only returns that collection
  //    owner's bookmarks.
  // ---------------------------------------------------------------------
  describe('GET /collections/:id/bookmarks', () => {
    it('returns only bookmarks in that collection, owned by that owner — never another user\'s bookmarks, even ones with the same collectionId FK reused after a bug', async () => {
      const userA = await seedUser('auth0|user-a', 'a@example.com');
      const userB = await seedUser('auth0|user-b', 'b@example.com');
      const aCollection = await prisma.collection.create({
        data: { name: "A's collection", ownerId: userA.id },
      });
      const otherACollection = await prisma.collection.create({
        data: { name: "A's other collection", ownerId: userA.id },
      });

      const inTargetCollection = await prisma.bookmark.create({
        data: {
          url: 'https://example.com/1',
          title: 'in target',
          ownerId: userA.id,
          collectionId: aCollection.id,
        },
      });
      await prisma.bookmark.create({
        data: {
          url: 'https://example.com/2',
          title: 'in other A collection',
          ownerId: userA.id,
          collectionId: otherACollection.id,
        },
      });
      // Same collectionId value, but that collection is B's — cannot exist
      // via the API today (FK ownership is enforced on write), but seed it
      // directly to prove the read path also filters by ownerId, not just
      // collectionId.
      await prisma.bookmark.create({
        data: {
          url: 'https://example.com/leak',
          title: 'B bookmark with A collection id',
          ownerId: userB.id,
          collectionId: aCollection.id,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/collections/${aCollection.id}/bookmarks`)
        .set('Authorization', authAs(userA.auth0Sub));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(inTargetCollection.id);
      expect(res.body.total).toBe(1);
    });

    it('user B cannot read user A\'s collection bookmarks via this endpoint — 404', async () => {
      const userA = await seedUser('auth0|user-a', 'a@example.com');
      const userB = await seedUser('auth0|user-b', 'b@example.com');
      const aCollection = await prisma.collection.create({
        data: { name: "A's collection", ownerId: userA.id },
      });
      await prisma.bookmark.create({
        data: {
          url: 'https://example.com/1',
          title: 'secret',
          ownerId: userA.id,
          collectionId: aCollection.id,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/collections/${aCollection.id}/bookmarks`)
        .set('Authorization', authAs(userB.auth0Sub));

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // 5. Pagination / filtering.
  // ---------------------------------------------------------------------
  describe('pagination and filtering', () => {
    it('GET /collections respects page and limit', async () => {
      const userA = await seedUser('auth0|user-a', 'a@example.com');
      for (let i = 1; i <= 5; i++) {
        await prisma.collection.create({
          data: { name: `Collection ${i}`, ownerId: userA.id },
        });
        // createdAt has ms precision and ordering is desc by createdAt;
        // space the writes out so page order is deterministic.
        await new Promise((r) => setTimeout(r, 5));
      }

      const page1 = await request(app.getHttpServer())
        .get('/api/collections?page=1&limit=2')
        .set('Authorization', authAs(userA.auth0Sub));
      const page2 = await request(app.getHttpServer())
        .get('/api/collections?page=2&limit=2')
        .set('Authorization', authAs(userA.auth0Sub));
      const page3 = await request(app.getHttpServer())
        .get('/api/collections?page=3&limit=2')
        .set('Authorization', authAs(userA.auth0Sub));

      expect(page1.status).toBe(200);
      expect(page1.body.data).toHaveLength(2);
      expect(page1.body.total).toBe(5);
      expect(page1.body.page).toBe(1);
      expect(page1.body.limit).toBe(2);

      expect(page2.body.data).toHaveLength(2);
      expect(page3.body.data).toHaveLength(1);

      const idsAcrossPages = [
        ...page1.body.data.map((c: { id: number }) => c.id),
        ...page2.body.data.map((c: { id: number }) => c.id),
        ...page3.body.data.map((c: { id: number }) => c.id),
      ];
      // No duplicate/overlapping rows between pages.
      expect(new Set(idsAcrossPages).size).toBe(5);
    });

    it('rejects an out-of-range limit (>100) with 400', async () => {
      const userA = await seedUser('auth0|user-a', 'a@example.com');
      const res = await request(app.getHttpServer())
        .get('/api/collections?limit=101')
        .set('Authorization', authAs(userA.auth0Sub));
      expect(res.status).toBe(400);
    });

    it('GET /bookmarks?collectionId= filters to that collection only, within the caller\'s own data', async () => {
      const userA = await seedUser('auth0|user-a', 'a@example.com');
      const collectionX = await prisma.collection.create({
        data: { name: 'X', ownerId: userA.id },
      });
      const collectionY = await prisma.collection.create({
        data: { name: 'Y', ownerId: userA.id },
      });
      const inX = await prisma.bookmark.create({
        data: {
          url: 'https://example.com/x',
          title: 'in X',
          ownerId: userA.id,
          collectionId: collectionX.id,
        },
      });
      await prisma.bookmark.create({
        data: {
          url: 'https://example.com/y',
          title: 'in Y',
          ownerId: userA.id,
          collectionId: collectionY.id,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/bookmarks?collectionId=${collectionX.id}`)
        .set('Authorization', authAs(userA.auth0Sub));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(inX.id);
    });

    it('GET /bookmarks?collectionId=<another user\'s collection id> returns an empty page, not that user\'s bookmarks', async () => {
      const userA = await seedUser('auth0|user-a', 'a@example.com');
      const userB = await seedUser('auth0|user-b', 'b@example.com');
      const bCollection = await prisma.collection.create({
        data: { name: "B's collection", ownerId: userB.id },
      });
      await prisma.bookmark.create({
        data: {
          url: 'https://example.com/b',
          title: "B's bookmark",
          ownerId: userB.id,
          collectionId: bCollection.id,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/bookmarks?collectionId=${bCollection.id}`)
        .set('Authorization', authAs(userA.auth0Sub));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });
  });
});
