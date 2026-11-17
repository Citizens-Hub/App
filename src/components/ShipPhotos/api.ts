import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import { moderationRefreshInterval } from './moderationState';

export interface ShipPhoto {
  id: string; shipId: number; caption: string; createdAt: string;
  uploaderName: string; imageUrl?: string; status?: 'pending' | 'approved' | 'rejected';
  moderationStatus?: 'queued' | 'processing' | 'review' | 'failed' | 'completed';
  reason?: string | null; version?: number; isOwn?: boolean; groupId?: string | null; rating?: number | null; position?: number;
}
export interface PhotoList { photos: ShipPhoto[]; total: number; page?: number }
const base = (import.meta.env.VITE_PUBLIC_API_ENDPOINT || '').replace(/\/$/, '');
export function photoUrl(path: string) { return `${base}${path}`; }
export class PhotoRequestError extends Error {
  status: number;
  constructor(status: number) { super(`HTTP ${status}`); this.name = 'PhotoRequestError'; this.status = status; }
}
export function photoErrorKey(error: unknown): string {
  return error instanceof PhotoRequestError ? ([400, 401, 403, 409, 413, 415, 422, 429, 503].includes(error.status) ? `error${error.status}` : 'errorUpload') : 'errorNetwork';
}
export async function photoRequest<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(photoUrl(path), { ...options, headers, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new PhotoRequestError(response.status);
  return body as T;
}
export function usePhotos(path: string | null, token?: string, watchModeration = false) {
  return useSWR<PhotoList>(path ? [path, token || 'public'] : null,
    ([url, auth]: [string, string]) => photoRequest(url, auth === 'public' ? undefined : auth),
    { shouldRetryOnError: false, revalidateOnFocus: true, refreshWhenHidden: false, refreshWhenOffline: false,
      refreshInterval: data => watchModeration ? moderationRefreshInterval(data ? [data] : []) : 0 });
}

export function usePhotoFeed(path: string | null, token?: string, watchModeration = false) {
  return useSWRInfinite<PhotoList>((index, previous: PhotoList | null) => {
    if (!path || (previous && (!previous.photos.length || index * 24 >= previous.total))) return null;
    return [`${path}${path.includes('?') ? '&' : '?'}page=${index + 1}`, token || 'public'];
  }, ([url, auth]: [string, string]) => photoRequest(url, auth === 'public' ? undefined : auth),
  { shouldRetryOnError: false, revalidateOnFocus: true, refreshWhenHidden: false, refreshWhenOffline: false,
    refreshInterval: data => watchModeration ? moderationRefreshInterval(data) : 0 });
}
