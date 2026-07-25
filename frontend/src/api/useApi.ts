import { useAuth0 } from '@auth0/auth0-react';
import { useCallback } from 'react';
import { config } from '../config';
import { ApiError } from './ApiError';
import type { ApiErrorBody } from './types';

export function useApi() {
  const { getAccessTokenSilently } = useAuth0();

  return useCallback(
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      const token = await getAccessTokenSilently();
      const res = await fetch(`${config.apiBaseUrl}${path}`, {
        ...init,
        headers: {
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          Authorization: `Bearer ${token}`,
          ...init?.headers,
        },
      });

      if (res.status === 204) {
        return undefined as T;
      }

      const body = await res.json();
      if (!res.ok) {
        throw new ApiError(body as ApiErrorBody, res.status);
      }
      return body as T;
    },
    [getAccessTokenSilently],
  );
}
