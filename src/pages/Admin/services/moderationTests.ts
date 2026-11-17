import { photoRequest } from '@/components/ShipPhotos/api';
export interface ModerationResult {
  decision: 'approve' | 'review' | 'reject'; model: string; model_revision?: string;
  scores: { nsfw?: number }; reason: string;
  semantic?: { model: string; status: string; categories: string[]; reason: string };
  thresholds?: { approve: number; reject: number };
}
export interface ModerationTest {
  id: string; decision?: 'approve' | 'review' | 'reject' | null; inputType: 'image' | 'text'; text: string; imageUrl: string | null;
  status: 'uploading' | 'queued' | 'processing' | 'completed' | 'failed'; attempt: number;
  createdAt: string; updatedAt: string; result: ModerationResult | null; error: string | null;
}
export interface ModerationTestList { tests: ModerationTest[]; page: number; hasMore: boolean }
export const testPath = '/api/admin/moderation-tests';
export const activeTest = (test: ModerationTest) => test.status === 'uploading' || test.status === 'queued' || test.status === 'processing';
export const fetchTests = (path: string, token: string) => photoRequest<ModerationTestList>(path, token);
