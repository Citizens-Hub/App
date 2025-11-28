import { useAuthApi } from '../useApi';

export interface CatchedError {
  id: number
  createdAt: string
  errorType: string
  errorMessage: string
  callStack?: string
}

export interface CatchedErrorsResponse {
  success: boolean
  page: number
  limit: number
  total: number
  list: CatchedError[]
}

export function useCatchedErrors(page = 1, limit = 20) {
  const path = `/api/bi/error?page=${page}&limit=${limit}`;
  
  return useAuthApi<CatchedErrorsResponse>(path, {
    revalidateOnFocus: false,
    revalidateIfStale: true,
  });
}

