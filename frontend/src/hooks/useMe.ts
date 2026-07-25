import { useApi } from '../api/useApi';
import type { Me } from '../api/types';
import { useAsync } from './useAsync';

export function useMe() {
  const api = useApi();
  return useAsync<Me>(() => api<Me>('/me'), [api]);
}
