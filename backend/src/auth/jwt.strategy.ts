import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from './current-user.decorator';

/**
 * Claims we rely on from an Auth0 access token (audience =
 * AUTH0_AUDIENCE). Not an ID token — see API_DESIGN.md's
 * "Bearer token choice" section for why.
 */
export interface Auth0AccessTokenPayload {
  sub: string;
  aud: string | string[];
  iss: string;
  scope?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const domain = configService.getOrThrow<string>('AUTH0_DOMAIN');
    const audience = configService.getOrThrow<string>('AUTH0_AUDIENCE');
    const issuer = `https://${domain}/`;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${issuer}.well-known/jwks.json`,
      }),
      audience,
      issuer,
      algorithms: ['RS256'],
    });
  }

  validate(payload: Auth0AccessTokenPayload): AuthenticatedUser {
    return { id: payload.sub };
  }
}
