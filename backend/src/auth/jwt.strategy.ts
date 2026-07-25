import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
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

  /**
   * Just-in-time provisioning: the first request bearing a verified token
   * for a given `sub` creates the internal User row; every later request
   * for that `sub` reuses it. See DECISIONS.md #10 for why this maps to
   * "auto-create" rather than "reject unknown users" — the token is
   * already cryptographically verified by the time this runs, so there is
   * no separate registration step to enforce.
   *
   * Access tokens (vs. ID tokens, see DECISIONS.md #9) don't carry an
   * `email` claim, so newly created users get a placeholder email until a
   * profile-sync step exists — tracked as an open item, not silently
   * papered over.
   */
  async validate(payload: Auth0AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.upsert({
      where: { auth0Sub: payload.sub },
      update: {},
      create: {
        auth0Sub: payload.sub,
        email: `${payload.sub.replace(/\|/g, '_')}@placeholder.invalid`,
      },
    });
    return { id: user.id, auth0Sub: user.auth0Sub };
  }
}
