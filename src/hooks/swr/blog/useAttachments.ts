import { useAuthApi } from '../useApi';

export interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  url: string;
  createdAt: string;
  uploader: {
    id: string;
    name: string;
    email: string;
  };
}

export interface AttachmentsResponse {
  success: boolean;
  attachments: Attachment[];
}

export function useAttachments(page = 1, limit = 20) {
  const path = `/api/blog/attachments?page=${page}&limit=${limit}`;
  
  return useAuthApi<AttachmentsResponse>(path, {
    revalidateOnFocus: false,
    revalidateIfStale: true,
  });
}

