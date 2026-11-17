import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Skeleton } from '@mui/material';
import { useIntl } from 'react-intl';
import { photoUrl } from './api';

export default function PhotoImage({ id, token, caption, mode = 'admin' }: { id: string; token?: string; caption: string; mode?: 'admin' | 'tile' | 'detail' | 'thumb' }) {
  const intl = useIntl();
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(mode === 'admin' || mode === 'detail');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (visible || !host.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '160px' });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [visible]);
  const [state, setState] = useState<{ id: string; token?: string; src?: string; error?: boolean }>({ id });
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    fetch(photoUrl(`/api/ship-photos/${encodeURIComponent(id)}/image`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal, cache: 'no-store',
    }).then(async response => {
      if (!response.ok) throw new Error('Image unavailable');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setState({ id, token, src: objectUrl });
    }).catch(() => { if (!controller.signal.aborted) setState({ id, token, error: true }); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, token, visible, attempt]);
  const current = state.id === id && state.token === token ? state : undefined;
  return <Box ref={host} sx={{ minHeight: mode === 'admin' ? 100 : 0, aspectRatio: mode === 'tile' || mode === 'thumb' ? '16 / 9' : undefined, width: '100%', minWidth: 0, overflow: 'hidden', display: 'grid', placeItems: 'center', bgcolor: 'action.hover', borderRadius: 1 }}>
    {current?.error ? <Alert severity="warning">{intl.formatMessage({ id: 'shipPhotos.imageError' })}{(mode === 'detail' || mode === 'admin') && <Button onClick={() => { setState({ id, token }); setAttempt(value => value + 1); }}>{intl.formatMessage({ id: 'shipPhotos.retry' })}</Button>}</Alert> : current?.src ? <Box component="img" src={current.src} alt={caption} loading="lazy" sx={{ display: 'block', minWidth: 0, maxWidth: '100%', width: '100%', height: mode === 'admin' || mode === 'detail' ? 'auto' : '100%', maxHeight: mode === 'detail' ? 'min(75svh, 900px)' : mode === 'admin' ? 300 : undefined, objectFit: mode === 'detail' || mode === 'admin' ? 'contain' : 'cover' }} /> : mode === 'tile' || mode === 'thumb' ? <Skeleton variant="rectangular" animation={visible ? 'wave' : false} sx={{ width: '100%', height: '100%' }} /> : visible ? <CircularProgress size={24} /> : null}
  </Box>;
}
