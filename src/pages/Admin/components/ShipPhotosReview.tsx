import { useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { UserRole } from '@/types';
import type { RootState } from '@/store';
import { photoErrorKey, photoRequest, usePhotos, type ShipPhoto } from '@/components/ShipPhotos/api';
import RetryModeration from '@/components/ShipPhotos/RetryModeration';
import { moderationLabel } from '@/components/ShipPhotos/moderationState';
import PhotoImage from '@/components/ShipPhotos/PhotoImage';

function ReviewCard({ photo, token, refresh }: { photo: ShipPhoto; token: string; refresh: () => Promise<unknown> }) {
  const intl = useIntl();
  const t = (key: string) => { const messageId = `shipPhotos.${key}`; return intl.formatMessage({ id: messageId }); };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const awaitingModeration = photo.status === 'pending' && ['queued', 'processing'].includes(photo.moderationStatus || '');
  const [lastDecision, setLastDecision] = useState<'approve' | 'reject' | null>(null);
  async function review(decision: 'approve' | 'reject') {
    if (inFlight.current || !Number.isInteger(photo.version)) return;
    inFlight.current = true; setBusy(true); setError(''); setLastDecision(decision);
    try {
      await photoRequest(`/api/admin/ship-photos/${encodeURIComponent(photo.id)}/review`, token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, version: photo.version }),
      });
      await refresh();
    } catch (e) { setError(t(photoErrorKey(e))); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <Card variant="outlined"><CardContent><Stack spacing={1.5}>
    <Typography variant="subtitle1">{photo.uploaderName} · #{photo.shipId}</Typography>
    <Typography variant="caption">{new Date(photo.createdAt).toLocaleString(intl.locale)} · {t(moderationLabel(photo))}</Typography>
    <PhotoImage id={photo.id} token={token} caption={photo.caption || t('title')} />
    <Typography sx={{ overflowWrap: 'anywhere' }}>{photo.caption}</Typography>
    <RetryModeration photo={photo} token={token} onRetried={() => { void refresh(); }} />
    {photo.reason && <Alert severity="info">{photo.reason}</Alert>}
    {error && <Alert severity="error" action={lastDecision && <Button color="inherit" disabled={busy} onClick={() => review(lastDecision)}>{t('retryAction')}</Button>}>{error}</Alert>}
    <Stack direction="row" spacing={1}><Button disabled={busy || awaitingModeration || photo.status === 'approved'} onClick={() => review('approve')} variant="contained" color="success">{t('approve')}</Button><Button disabled={busy || awaitingModeration || photo.status === 'rejected'} onClick={() => review('reject')} variant="outlined" color="error">{t('reject')}</Button></Stack>
  </Stack></CardContent></Card>;
}
export default function ShipPhotosReview() {
  const intl = useIntl();
  const t = (key: string) => { const messageId = `shipPhotos.${key}`; return intl.formatMessage({ id: messageId }); };
  const { user } = useSelector((state: RootState) => state.user);
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const cleanupInFlight = useRef(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupError, setCleanupError] = useState('');
  const [cleanupDone, setCleanupDone] = useState(false);
  async function retryCleanup() {
    if (cleanupInFlight.current || user.role !== UserRole.Admin) return;
    cleanupInFlight.current = true; setCleanupBusy(true); setCleanupError(''); setCleanupDone(false);
    try {
      await photoRequest('/api/admin/ship-photos/retry-cleanup', user.token, { method: 'POST' });
      setCleanupDone(true);
    } catch (e) { const key = photoErrorKey(e); setCleanupError(t(['error401', 'error403'].includes(key) ? key : 'cleanupFailure')); }
    finally { cleanupInFlight.current = false; setCleanupBusy(false); }
  }
  const { data, error, isLoading, mutate } = usePhotos(user.token && user.role === UserRole.Admin ? `/api/admin/ship-photos?status=${status}&page=${page}&pageSize=24` : null, user.token, true);
  if (user.role !== UserRole.Admin) return <Alert severity="error">{t('error403')}</Alert>;
  return <Stack spacing={2}>
    <Typography variant="h5">{t('reviewTitle')}</Typography>
    <Alert severity="info">{t('reviewHint')}</Alert>
    <Card variant="outlined"><CardContent><Stack spacing={1}>
      <Typography variant="subtitle2">{t('cleanupTitle')}</Typography>
      <Typography variant="body2" color="text.secondary">{t('cleanupHint')}</Typography>
      <Box><Button variant="outlined" disabled={cleanupBusy} onClick={retryCleanup}>{t(cleanupBusy ? 'loading' : 'cleanupAction')}</Button></Box>
      {cleanupError && <Alert severity="error">{cleanupError}</Alert>}
      {cleanupDone && <Alert severity="success">{t('cleanupDone')}</Alert>}
    </Stack></CardContent></Card>
    <Stack direction="row" spacing={2}><TextField select size="small" label={t('status')} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>{['pending', 'approved', 'rejected'].map(s => <MenuItem key={s} value={s}>{t(s)}</MenuItem>)}</TextField><Button onClick={() => mutate()} disabled={isLoading}>{t('refresh')}</Button></Stack>
    {error && <Alert severity="error">{t(photoErrorKey(error))}</Alert>}
    {isLoading && <Typography>{t('loading')}</Typography>}
    {data?.photos.length === 0 && <Typography>{t('emptyReview')}</Typography>}
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 2 }}>{data?.photos.map(photo => <ReviewCard key={`${photo.id}-${photo.version}`} photo={photo} token={user.token} refresh={mutate} />)}</Box>
    <Stack direction="row" spacing={2} alignItems="center"><Button disabled={page <= 1 || isLoading} onClick={() => setPage(p => p - 1)}>{t('previous')}</Button><Typography>{page}</Typography><Button disabled={isLoading || !data || page * 24 >= data.total} onClick={() => setPage(p => p + 1)}>{t('next')}</Button></Stack>
  </Stack>;
}
