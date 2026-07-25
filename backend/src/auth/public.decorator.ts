import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without a bearer token. Reserved for
 * documented public endpoints only (see CLAUDE.md rule 1): the health
 * check, and the read-only GET /shared/:token capability-token lookup.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
