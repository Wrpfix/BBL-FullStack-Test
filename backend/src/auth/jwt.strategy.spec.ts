import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const configService = {
    getOrThrow: (key: string) =>
      ({
        AUTH0_DOMAIN: 'test-tenant.us.auth0.com',
        AUTH0_AUDIENCE: 'https://test-api',
      })[key],
  } as unknown as ConfigService;

  it('maps the access token `sub` claim to `id` (ownerId)', () => {
    const strategy = new JwtStrategy(configService);

    const result = strategy.validate({
      sub: 'auth0|abc123',
      aud: 'https://test-api',
      iss: 'https://test-tenant.us.auth0.com/',
    });

    expect(result).toEqual({ id: 'auth0|abc123' });
  });

  it('throws if AUTH0_DOMAIN or AUTH0_AUDIENCE is missing', () => {
    const missingConfig = {
      getOrThrow: () => {
        throw new Error('missing config');
      },
    } as unknown as ConfigService;

    expect(() => new JwtStrategy(missingConfig)).toThrow();
  });
});
