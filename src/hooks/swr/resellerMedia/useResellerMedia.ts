import { useAuthApi } from '../useApi';

export interface ResellerMediaAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  url: string;
  createdAt: string;
}

export interface ResellerMediaResponse {
  success: boolean;
  attachments: ResellerMediaAttachment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function useResellerMedia(page = 1, limit = 30) {
  return useAuthApi<ResellerMediaResponse>(`/api/reseller/media?page=${page}&limit=${limit}`, {
    revalidateOnFocus: false,
  });
}
