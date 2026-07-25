import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without a bearer token — reserved for the
 * documented health-check endpoint (see CLAUDE.md rule 1).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
