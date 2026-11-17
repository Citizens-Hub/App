import { useRef, useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import { useIntl } from 'react-intl';
import { photoErrorKey, photoRequest, type ShipPhoto } from './api';
import { canRetryModeration } from './moderationState';

export default function RetryModeration({ photo, token, onRetried }: { photo: ShipPhoto; token: string; onRetried: () => void }) {
  const intl = useIntl();
  const t = (key: string) => { const id = `shipPhotos.${key}`; return intl.formatMessage({ id }); };
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!token || !canRetryModeration(photo)) return null;
  async function retry() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await photoRequest(`/api/ship-photos/${encodeURIComponent(photo.id)}/retry-moderation`, token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: photo.version }),
      });
      onRetried();
    } catch (failure) { setError(photoErrorKey(failure)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <Stack spacing={1}>
    <Button disabled={busy} onClick={retry} sx={{ alignSelf: 'flex-start', minHeight: 44 }}>{t(busy ? 'loading' : 'retryModeration')}</Button>
    {error && <Alert severity="error">{t(error)}</Alert>}
  </Stack>;
}
