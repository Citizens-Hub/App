import type { PhotoList, ShipPhoto } from './api';

/** Prefer private owner metadata for duplicate public photos, never duplicate cards. */
export function mergePhotoPages(publicPages: PhotoList[] = [], ownerPages: PhotoList[] = []): ShipPhoto[] {
  const publicPhotos = publicPages.flatMap(page => page.photos).filter(photo => !photo.status || photo.status === 'approved');
  return [...new Map([...publicPhotos, ...ownerPages.flatMap(page => page.photos)].map(photo => [photo.id, photo])).values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
/** Retry the requested page on error; only advance after a full successful page. */
export function hasNextPhotoPage(pages?: PhotoList[]): boolean {
  if (!pages?.length) return false;
  const last = pages[pages.length - 1];
  return last.photos.length > 0 && pages.reduce((count, page) => count + page.photos.length, 0) < last.total;
}
