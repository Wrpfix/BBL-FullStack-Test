import { generateKeyPairSync } from 'crypto';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

/**
 * Exercises the real passport-jwt verification pipeline (signature, issuer,
 * audience, expiry — everything `jsonwebtoken.verify` checks under the
 * hood) end to end, without touching Auth0's live JWKS endpoint: the
 * strategy's `_secretOrKeyProvider` is swapped for a local RSA public key,
 * and tokens are signed locally with the matching (or deliberately
 * mismatched) private key.
 */
describe('JwtStrategy — token verification', () => {
  const DOMAIN = 'test-tenant.us.auth0.com';
  const ISSUER = `https://${DOMAIN}/`;
  const AUDIENCE = 'https://test-api';

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const { privateKey: otherPrivateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const configService = {
    getOrThrow: (key: string) =>
      ({ AUTH0_DOMAIN: DOMAIN, AUTH0_AUDIENCE: AUDIENCE })[key],
  } as unknown as ConfigService;

  function buildStrategy() {
    const prisma = {
      user: {
        upsert: jest
          .fn()
          .mockResolvedValue({ id: 1, auth0Sub: 'auth0|valid-user' }),
      },
    } as unknown as PrismaService;
    const strategy = new JwtStrategy(configService, prisma);
    // Bypass the real JWKS network call — verify against our local key pair.
    (strategy as any)._secretOrKeyProvider = (
      _req: unknown,
      _token: string,
      done: (err: unknown, key?: string) => void,
    ) => done(null, publicKey.export({ type: 'pkcs1', format: 'pem' }));
    return strategy;
  }

  function signToken(
    overrides: { aud?: string; iss?: string; expiresIn?: number | string } = {},
    key = privateKey,
  ) {
    return jwt.sign({ sub: 'auth0|valid-user' }, key, {
      algorithm: 'RS256',
      audience: overrides.aud ?? AUDIENCE,
      issuer: overrides.iss ?? ISSUER,
      expiresIn: overrides.expiresIn ?? '1h',
    });
  }

  type Outcome =
    | { type: 'success'; user: unknown }
    | { type: 'fail'; info: unknown }
    | { type: 'error'; err: unknown };

  function authenticate(
    strategy: JwtStrategy,
    authorizationHeader?: string,
  ): Promise<Outcome> {
    return new Promise((resolve) => {
      (strategy as any).success = (user: unknown) =>
        resolve({ type: 'success', user });
      (strategy as any).fail = (info: unknown) =>
        resolve({ type: 'fail', info });
      (strategy as any).error = (err: unknown) =>
        resolve({ type: 'error', err });

      const req = {
        headers: authorizationHeader
          ? { authorization: authorizationHeader }
          : {},
      };
      (strategy as any).authenticate(req, {});
    });
  }

  it('accepts a validly signed token with correct issuer/audience/expiry', async () => {
    const strategy = buildStrategy();
    const token = signToken();

    const outcome = await authenticate(strategy, `Bearer ${token}`);

    expect(outcome.type).toBe('success');
    expect((outcome as { user: unknown }).user).toEqual({
      id: 1,
      auth0Sub: 'auth0|valid-user',
    });
  });

  it('rejects an expired token', async () => {
    const strategy = buildStrategy();
    const token = jwt.sign({ sub: 'auth0|valid-user' }, privateKey, {
      algorithm: 'RS256',
      audience: AUDIENCE,
      issuer: ISSUER,
      expiresIn: -10, // already expired
    });

    const outcome = await authenticate(strategy, `Bearer ${token}`);

    expect(outcome.type).toBe('fail');
    expect((outcome as { info: Error }).info).toBeInstanceOf(
      jwt.TokenExpiredError,
    );
  });

  it('rejects a token signed with the wrong private key (bad signature)', async () => {
    const strategy = buildStrategy();
    const token = signToken({}, otherPrivateKey);

    const outcome = await authenticate(strategy, `Bearer ${token}`);

    expect(outcome.type).toBe('fail');
    expect((outcome as { info: Error }).info.message).toMatch(
      /invalid signature/i,
    );
  });

  it('rejects a token with the wrong audience', async () => {
    const strategy = buildStrategy();
    const token = signToken({ aud: 'https://someone-elses-api' });

    const outcome = await authenticate(strategy, `Bearer ${token}`);

    expect(outcome.type).toBe('fail');
    expect((outcome as { info: Error }).info.message).toMatch(/audience/i);
  });

  it('rejects a token with the wrong issuer', async () => {
    const strategy = buildStrategy();
    const token = signToken({ iss: 'https://not-our-tenant.us.auth0.com/' });

    const outcome = await authenticate(strategy, `Bearer ${token}`);

    expect(outcome.type).toBe('fail');
    expect((outcome as { info: Error }).info.message).toMatch(/issuer/i);
  });

  it('rejects when no token is present at all', async () => {
    const strategy = buildStrategy();

    const outcome = await authenticate(strategy, undefined);

    expect(outcome.type).toBe('fail');
    expect((outcome as { info: Error }).info.message).toMatch(/no auth token/i);
  });
});
