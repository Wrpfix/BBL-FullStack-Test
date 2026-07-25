import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  /** Internal User.id — this is the value used as `ownerId` on every scoped query. */
  id: number;
  /** Auth0 `sub` claim from the verified access token, kept for reference/logging. */
  auth0Sub: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthenticatedUser;
  },
);
