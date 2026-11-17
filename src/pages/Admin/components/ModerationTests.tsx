import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Collapse, Divider, Stack, TextField, Typography } from '@mui/material';
import { useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import { UserRole } from '@/types';
import { randomId } from '@/utils/randomId';
import { photoErrorKey, photoRequest, photoUrl } from '@/components/ShipPhotos/api';
import { activeTest, fetchTests, testPath, type ModerationTest, type ModerationResult } from '../services/moderationTests';

const maxImageBytes = 8 * 1024 * 1024;
function useMessages() {
  const intl = useIntl();
  return (key: string) => intl.formatMessage({ id: `moderationTests.${key}` });
}
function TestImage({ id, token }: { id: string; token: string }) {
  const t = useMessages();
  const [state, setState] = useState<{ src?: string; error?: boolean }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let url: string | undefined;
    fetch(photoUrl(`${testPath}/${encodeURIComponent(id)}/image`), { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Image unavailable');
        const blob = await response.blob(); if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob); setState({ src: url });
      }).catch(() => { if (!controller.signal.aborted) setState({ error: true }); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [id, token, attempt]);
  if (state.error) return <Alert severity="warning" action={<Button color="inherit" onClick={() => { setState({}); setAttempt(value => value + 1); }}>{t('retry')}</Button>}>{t('imageError')}</Alert>;
  return state.src ? <Box component="img" src={state.src} alt={t('image')} sx={{ display: 'block', maxWidth: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 1 }} /> : <CircularProgress size={24} />;
}
function Result({ result }: { result: ModerationResult }) {
  const t = useMessages();
  return <Stack spacing={1.5}>
    <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center"><Typography variant="subtitle2">{t('decision')}</Typography><Chip size="small" color={result.decision === 'approve' ? 'success' : result.decision === 'reject' ? 'error' : 'warning'} label={t(result.decision)} /></Stack>
    <Typography variant="subtitle2">{t('categories')}</Typography>
    <Stack direction="row" gap={1} flexWrap="wrap">{result.semantic?.categories?.length ? result.semantic.categories.map((category, index) => <Chip key={`${category}-${index}`} size="small" label={category} sx={{ maxWidth: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', overflowWrap: 'anywhere', py: .5 } }} />) : <Typography variant="body2" color="text.secondary">{t(result.semantic ? 'noCategories' : 'notReturned')}</Typography>}</Stack>
    <Typography variant="subtitle2">{t('factors')}</Typography>
    {result.reason && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{result.reason}</Typography>}
    {result.semantic?.reason && result.semantic.reason !== result.reason && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{result.semantic.reason}</Typography>}
    {!result.reason && !result.semantic?.reason && <Typography variant="body2" color="text.secondary">{t('notReturned')}</Typography>}
    {typeof result.scores?.nsfw === 'number' && <Typography variant="body2">NSFW: {result.scores.nsfw.toFixed(4)}</Typography>}
    {typeof result.scores?.nsfw === 'number' && result.thresholds && <Typography variant="body2" color="text.secondary">{t('thresholds')}: {result.thresholds.approve} / {result.thresholds.reject}</Typography>}
    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{t('model')}: {result.model}{result.model_revision ? ` (${result.model_revision})` : ''}</Typography>
    {result.semantic && <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{t('semantic')}: {result.semantic.model} · {result.semantic.status}</Typography>}
    <Box component="details"><Box component="summary" sx={{ cursor: 'pointer', typography: 'body2' }}>{t('output')}</Box><Box component="pre" sx={{ fontSize: 12, bgcolor: 'action.hover', p: 1.5, borderRadius: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 420, overflowY: 'auto' }}>{JSON.stringify(result, null, 2)}</Box></Box>
  </Stack>;
}
function TestCard({ test, token, refresh }: { test: ModerationTest; token: string; refresh: () => Promise<unknown> }) {
  const t = useMessages(); const intl = useIntl();
  const [expanded, setExpanded] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const inFlight = useRef(false);
  const { data, error: detailError, isLoading, mutate } = useSWR(expanded ? [`${testPath}/${encodeURIComponent(test.id)}`, token] : null,
    ([path, auth]: [string, string]) => photoRequest<{ test: ModerationTest }>(path, auth),
    { shouldRetryOnError: false, refreshWhenHidden: false, refreshWhenOffline: false, refreshInterval: data => data && activeTest(data.test) ? 15000 : 0 });
  // A refreshed list invalidates a previously opened detail without fetching closed records.
  useEffect(() => { if (expanded) void mutate(); }, [test.updatedAt, expanded, mutate]);
  async function retry() {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError('');
    try { await photoRequest(`${testPath}/${encodeURIComponent(test.id)}/retry`, token, { method: 'POST' }); await Promise.all([refresh(), mutate()]); }
    catch { setError(t('retryError')); } finally { inFlight.current = false; setBusy(false); }
  }
  const current = data?.test || test;
  return <Card variant="outlined"><CardContent><Stack spacing={1.5}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}><Box sx={{ minWidth: 0 }}><Typography variant="subtitle2">{t(test.inputType === 'text' ? 'textType' : 'image')}</Typography><Typography variant="caption" color="text.secondary">{new Date(test.createdAt).toLocaleString(intl.locale)}</Typography></Box><Chip size="small" label={t(current.status)} color={current.status === 'failed' ? 'error' : 'default'} /></Stack>
    {test.decision && <Typography variant="body2">{t('decision')}: {t(test.decision)}</Typography>}
    <Typography variant="body2" sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{test.text?.length > 100 ? `${test.text.slice(0, 100)}…` : test.text}</Typography>
    <Stack direction="row" justifyContent="space-between" gap={1}><Button size="small" aria-expanded={expanded} aria-controls={`test-${test.id}`} onClick={() => setExpanded(value => !value)}>{t(expanded ? 'collapse' : 'details')}</Button>{current.status === 'failed' && <Button disabled={busy} size="small" onClick={retry}>{t('retry')}</Button>}</Stack>
    {error && <Alert severity="error">{error}</Alert>}
    <Collapse in={expanded} unmountOnExit><Stack spacing={2} id={`test-${test.id}`}>
      <Divider />
      {isLoading && <CircularProgress size={24} />}
      {detailError && <Alert severity="error" action={<Button color="inherit" onClick={() => mutate()}>{t('retry')}</Button>}>{t('loadError')}</Alert>}
      {data && <>
        {current.imageUrl && <TestImage key={`${current.id}-${token}`} id={current.id} token={token} />}
        {current.text && <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{current.text}</Typography>}
        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>ID: {current.id} · {t('attempt')}: {current.attempt}</Typography>
        {activeTest(current) && <Typography role="status" color="text.secondary">{t('waiting')}</Typography>}
        {current.error && <Alert severity="error" sx={{ overflowWrap: 'anywhere' }}>{current.error}</Alert>}
        {current.result && <Result result={current.result} />}
      </>}
    </Stack></Collapse>
  </Stack></CardContent></Card>;
}
export default function ModerationTests() {
  const t = useMessages(); const intl = useIntl();
  const { user } = useSelector((state: RootState) => state.user);
  const [text, setText] = useState(''); const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState('');
  const [error, setError] = useState(''); const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false); const [page, setPage] = useState(1);
  const input = useRef<HTMLInputElement>(null); const inFlight = useRef(false); const requestId = useRef<string | null>(null);
  const admin = user.role === UserRole.Admin;
  const { data, error: listError, isLoading, mutate } = useSWR(admin && user.token ? [`${testPath}?page=${page}`, user.token] : null,
    ([path, token]: [string, string]) => fetchTests(path, token),
    { shouldRetryOnError: false, refreshWhenHidden: false, refreshWhenOffline: false, refreshInterval: data => data?.tests.some(activeTest) ? 15000 : 0 });
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  async function submit() {
    if (inFlight.current || !admin || (!file && !text.trim())) return;
    inFlight.current = true; setBusy(true); setError(''); setSent(false);
    try {
      // Keep the id on a network error so a repeat cannot create duplicate jobs.
      requestId.current ||= randomId();
      const form = new FormData(); form.set('clientRequestId', requestId.current); form.set('text', text.trim()); if (file) form.set('file', file);
      await photoRequest(`${testPath}`, user.token, { method: 'POST', body: form });
      setText(''); setFile(null); requestId.current = null; if (input.current) input.current.value = ''; setSent(true); setPage(1); void mutate();
    } catch (e) { setError(intl.formatMessage({ id: `shipPhotos.${photoErrorKey(e)}` })); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (!admin) return <Alert severity="error">{intl.formatMessage({ id: 'shipPhotos.error403' })}</Alert>;
  return <Stack spacing={2} sx={{ maxWidth: 1000, minWidth: 0 }}>
    <Box><Typography variant="h5">{t('title')}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{t('description')}</Typography></Box>
    <Card variant="outlined"><CardContent><Stack spacing={2}>
      <TextField label={t('text')} multiline minRows={3} fullWidth value={text} disabled={busy} onChange={e => { setText(e.target.value); requestId.current = null; setSent(false); }} slotProps={{ htmlInput: { maxLength: 500 } }} helperText={`${text.length}/500`} />
      <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center"><Button component="label" variant="outlined" disabled={busy}>{t(file ? 'replaceImage' : 'chooseImage')}<input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e => {
        const selected = e.target.files?.[0]; if (!selected) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || !selected.size || selected.size > maxImageBytes) { setError(t('imageLimit')); e.target.value = ''; return; }
        setFile(selected); requestId.current = null; setError(''); setSent(false);
      }} /></Button>{file && <Button disabled={busy} onClick={() => { setFile(null); requestId.current = null; if (input.current) input.current.value = ''; }}>{t('remove')}</Button>}</Stack>
      <Typography variant="caption" color="text.secondary">{t('imageLimit')}</Typography>
      {file && <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography>}
      {preview && <Box component="img" src={preview} alt={t('image')} sx={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', alignSelf: 'flex-start', borderRadius: 1 }} />}
      {error && <Alert severity="error">{error}</Alert>}
      {sent && <Alert severity="success">{t('submitted')}</Alert>}
      <Box><Button variant="contained" disabled={busy || (!file && !text.trim())} onClick={submit} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>{t(busy ? 'submitting' : 'submit')}</Button></Box>
    </Stack></CardContent></Card>
    <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6">{t('history')}</Typography><Button onClick={() => mutate()} disabled={isLoading}>{t('refresh')}</Button></Stack>
    {listError && <Alert severity="error">{t('loadError')}</Alert>}
    {isLoading && <CircularProgress size={24} />}
    {data?.tests.length === 0 && <Typography color="text.secondary">{t('empty')}</Typography>}
    {data?.tests.map(test => <TestCard key={test.id} test={test} token={user.token} refresh={mutate} />)}
    <Stack direction="row" alignItems="center" justifyContent="space-between"><Button disabled={isLoading || page === 1} onClick={() => setPage(value => value - 1)}>{t('previous')}</Button><Typography>{page}</Typography><Button disabled={isLoading || !data?.hasMore} onClick={() => setPage(value => value + 1)}>{t('next')}</Button></Stack>
  </Stack>;
}
