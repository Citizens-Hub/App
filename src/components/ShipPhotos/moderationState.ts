import type { PhotoList, ShipPhoto } from './api';

/** Only active background work needs polling. Manual review must not poll forever. */
export function moderationRefreshInterval(pages: PhotoList[] = []): number {
  return pages.some(page => page.photos.some(photo => photo.status === 'pending' &&
    (photo.moderationStatus === 'queued' || photo.moderationStatus === 'processing'))) ? 15000 : 0;
}
export function canRetryModeration(photo: ShipPhoto): boolean {
  return photo.status === 'pending' && photo.moderationStatus === 'failed' && Number.isInteger(photo.version);
}
export function moderationLabel(photo: ShipPhoto): string {
  if (photo.status === 'pending' && photo.moderationStatus) {
    if (photo.moderationStatus === 'failed') return 'moderationFailed';
    if (photo.moderationStatus === 'review') return 'moderationReview';
  }
  return photo.status || 'approved';
}
