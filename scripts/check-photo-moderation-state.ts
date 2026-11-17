import assert from 'node:assert/strict';
import { moderationRefreshInterval, canRetryModeration, moderationLabel } from '../src/components/ShipPhotos/moderationState';
import { mergePhotoPages } from '../src/components/ShipPhotos/photoFeed';
import type { ShipPhoto } from '../src/components/ShipPhotos/api';
const photo = (moderationStatus?: ShipPhoto['moderationStatus'], status: ShipPhoto['status'] = 'pending'): ShipPhoto => ({ id: 'a', shipId: 1, caption: '', createdAt: '2026-11-17', uploaderName: '', version: 2, moderationStatus, status });
for (const state of ['queued', 'processing'] as const) {
  assert.equal(moderationRefreshInterval([{ photos: [photo(state)], total: 1 }]), 15000);
  assert.equal(canRetryModeration(photo(state)), false);
}
for (const state of ['review', 'failed', 'completed', undefined] as const) assert.equal(moderationRefreshInterval([{ photos: [photo(state)], total: 1 }]), 0);
assert.equal(moderationRefreshInterval(), 0);
assert.equal(moderationRefreshInterval([{ photos: [photo('processing', 'approved')], total: 1 }]), 0);
assert.equal(canRetryModeration(photo('failed')), true);
assert.equal(canRetryModeration({ ...photo('failed'), version: undefined }), false);
assert.equal(canRetryModeration(photo('failed', 'rejected')), false);
assert.equal(moderationLabel(photo('failed')), 'moderationFailed');
assert.equal(moderationLabel(photo('review')), 'moderationReview');
assert.equal(moderationLabel(photo('completed', 'approved')), 'approved');
const merged = mergePhotoPages([{ photos: [photo('completed', 'approved')], total: 1 }], [{ photos: [photo('failed')], total: 1 }]);
assert.equal(merged.length, 1);
assert.equal(merged[0].moderationStatus, 'failed');
console.log('Async moderation: active-only polling, stopped terminal/manual states, versioned retry and owner metadata checks passed.');
