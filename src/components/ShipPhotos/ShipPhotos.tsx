import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, ButtonBase, Skeleton, IconButton, Stack, Typography } from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import { mergePhotoPages, hasNextPhotoPage } from './photoFeed';
import { useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import { usePhotoFeed, usePhotos } from './api';
import PhotoImage from './PhotoImage';
import PhotoRating from './PhotoRating';
import SharePhotos from './SharePhotos';
import addIcon from '@/assets/ship-photos/add.svg';

export default function ShipPhotos({ shipId, shipName }: { shipId: number; shipName?: string }) {
  const intl = useIntl();
  const { user } = useSelector((state: RootState) => state.user);
  const token = user.token;
  const endpoint = `/api/ships/${shipId}/photos`;
  const [sharing, setSharing] = useState(false);
  const [activeGroup, setActiveGroup] = useState<{ id: string; own: boolean } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const publicPhotos = usePhotoFeed(endpoint, token);
  const mine = usePhotoFeed(token ? `${endpoint}/mine` : null, token);
  const own = token ? mine.data?.flatMap(batch => batch.photos) ?? [] : [];
  const ownIds = new Set([...own.map(photo => photo.id), ...(publicPhotos.data?.flatMap(batch => batch.photos).filter(photo => photo.isOwn).map(photo => photo.id) ?? [])]);
  const photos = useMemo(() => mergePhotoPages(publicPhotos.data, token ? mine.data : []), [publicPhotos.data, mine.data, token]);
  const rail = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const loadingMore = useRef(false);
  const anchor = useRef<{ id: string; left: number; signature: string } | null>(null);
  const [edges, setEdges] = useState({ left: true, right: true, groupSize: 1 });
  const morePublic = hasNextPhotoPage(publicPhotos.data);
  const moreMine = Boolean(token && hasNextPhotoPage(mine.data));
  const hasMore = morePublic || moreMine;
  const busy = publicPhotos.isValidating || Boolean(token && mine.isValidating);
  const pageLoading = busy && (publicPhotos.isLoading || publicPhotos.size > (publicPhotos.data?.length ?? 0) || Boolean(token && (mine.isLoading || mine.size > (mine.data?.length ?? 0))));
  const feedError = publicPhotos.error || (token && mine.error);
  const signature = photos.map(photo => photo.id).join('|');
  const measureEdges = useCallback(() => {
    const node = rail.current;
    if (node) {
      const width = node.querySelector<HTMLElement>('[data-card]')?.getBoundingClientRect().width ?? 276;
      const gap = parseFloat(getComputedStyle(node).columnGap) || 0;
      setEdges({ left: node.scrollLeft < 2, right: node.scrollWidth - node.clientWidth - node.scrollLeft < 2, groupSize: node.clientWidth >= width * 4 + gap * 3 - 1 ? 4 : 1 });
    }
  }, []);
  useEffect(() => {
    const node = rail.current; if (!node) return;
    const observer = new ResizeObserver(measureEdges); observer.observe(node); measureEdges();
    return () => observer.disconnect();
  }, [measureEdges]);
  useLayoutEffect(() => {
    const saved = anchor.current;
    if (saved && saved.signature !== signature && rail.current) {
      const item = Array.from(rail.current.querySelectorAll<HTMLElement>('[data-photo-id]')).find(node => node.dataset.photoId === saved.id);
      if (item) rail.current.scrollLeft += item.getBoundingClientRect().left - saved.left;
      anchor.current = null;
    }
    measureEdges();
  }, [signature, busy, measureEdges]);
  const loadMore = useCallback(async () => {
    if (loadingMore.current || busy || feedError || !hasMore) return;
    loadingMore.current = true;
    const node = rail.current;
    const visible = node && Array.from(node.querySelectorAll<HTMLElement>('[data-photo-id]')).find(item => item.getBoundingClientRect().right > node.getBoundingClientRect().left);
    if (visible) anchor.current = { id: visible.dataset.photoId!, left: visible.getBoundingClientRect().left, signature };
    try {
      await Promise.allSettled([
        ...(morePublic ? [publicPhotos.setSize((publicPhotos.data?.length ?? 0) + 1)] : []),
        ...(moreMine ? [mine.setSize((mine.data?.length ?? 0) + 1)] : []),
      ]);
    } finally { loadingMore.current = false; }
  }, [busy, feedError, hasMore, morePublic, moreMine, publicPhotos, mine, signature]);
  useEffect(() => {
    if (!rail.current || !tail.current || !hasMore || busy || feedError) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void loadMore(); }, { root: rail.current, rootMargin: '0px 320px', threshold: 0 });
    observer.observe(tail.current);
    return () => observer.disconnect();
  }, [hasMore, busy, feedError, loadMore]);
  function scroll(direction: number) {
    const node = rail.current; if (!node) return;
    const width = node.querySelector<HTMLElement>('[data-card]')?.getBoundingClientRect().width ?? 165;
    const step = edges.groupSize * (width + (parseFloat(getComputedStyle(node).columnGap) || 0));
    node.scrollTo({ left: (Math.round(node.scrollLeft / step) + direction) * step, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    if (direction > 0 && edges.right) void loadMore();
  }
  const selected = photos.find(photo => photo.id === selectedId);
  const group = usePhotos(activeGroup ? `/api/ships/${shipId}/photo-reviews/${encodeURIComponent(activeGroup.id)}` : null, activeGroup?.own ? token : undefined);
  const related = group.data?.photos ?? photos.filter(photo => selected && (selected.groupId ? photo.groupId === selected.groupId : photo.id === selected.id));
  const selectedPhoto = related.find(photo => photo.id === selectedId) ?? selected;
  const selectedIndex = related.findIndex(photo => photo.id === selectedId);
  const detailPhotoId = selectedPhoto?.id;
  useEffect(() => {
    if (!selectedId || !detailPhotoId) return;
    // Wait until the expanded panel is laid out; don't scroll again when its
    // image or group data finishes loading. New selections cancel old frames.
    const frame = requestAnimationFrame(() => detail.current?.scrollIntoView({
      block: 'start', inline: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    }));
    return () => cancelAnimationFrame(frame);
  }, [selectedId, detailPhotoId]);
  const t = (key: string) => { const id = `shipPhotos.${key}`; return intl.formatMessage({ id }); };
  const refresh = () => { void publicPhotos.mutate(); if (token) void mine.mutate(); };
  const date = (value: string) => new Date(value).toLocaleDateString(intl.locale, { month: 'short', day: 'numeric' });
  return <section className="flex flex-col gap-3" aria-label={t('title')}>
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">{t('title')}</div>
      <Stack direction="row" spacing={1}><IconButton aria-label={t('scrollLeft')} disabled={edges.left} onClick={() => scroll(-1)} sx={{ width: 44, height: 44 }}><ChevronLeft /></IconButton><IconButton aria-label={t('scrollRight')} disabled={edges.right && !hasMore} onClick={() => scroll(1)} sx={{ width: 44, height: 44 }}><ChevronRight /></IconButton></Stack>
    </Stack>
    {feedError && !busy && photos.length === 0 && <Alert severity="error">{t('error')} <Button onClick={refresh}>{t('retry')}</Button></Alert>}
    <Box ref={rail} role="region" aria-label={t('gallery')} tabIndex={0} onScroll={measureEdges}
      onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); scroll(event.key === 'ArrowLeft' ? -1 : 1); } }}
      sx={{ display: 'flex', gap: { xs: 1.5, sm: 2 }, alignItems: 'start', overflowX: 'auto', overscrollBehaviorX: 'contain', pb: 1, pt: '2px', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, scrollSnapType: 'x mandatory', '& > [data-card]': { width: { xs: 165, sm: 276 }, flex: '0 0 auto', scrollSnapAlign: edges.groupSize === 4 ? 'none' : 'start' }, '& > [data-card]:nth-of-type(4n + 1)': { scrollSnapAlign: 'start' } }}>

      <ButtonBase component="div" role="button" tabIndex={0} data-card onClick={() => setSharing(true)} sx={{ aspectRatio: '16 / 9', border: '1px dashed #8cb6d8', borderRadius: '4px', bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(51,122,183,.12)' : '#f6faff', color: 'primary.main', flexDirection: 'column', gap: '7px', p: 2 }}>
        <img src={addIcon} alt="" width={26} height={26} /><Typography variant="body2">{t('upload')}</Typography>
      </ButtonBase>
      {photos.map(photo => <Stack data-card data-photo-id={photo.id} key={photo.id} spacing={1} sx={{ minWidth: 0 }}>
        <ButtonBase aria-label={photo.caption || t('details')} aria-expanded={selectedId === photo.id} onClick={() => { setSelectedId(selectedId === photo.id ? null : photo.id); setActiveGroup(photo.groupId ? { id: photo.groupId, own: ownIds.has(photo.id) } : null); }} sx={{ display: 'block', width: '100%', position: 'relative', borderRadius: '4px', outline: selectedId === photo.id ? '2px solid' : undefined, outlineColor: 'primary.main', overflow: 'hidden' }}>
          <PhotoImage id={photo.id} token={ownIds.has(photo.id) ? token : undefined} caption={photo.caption || t('title')} mode="tile" />
          {ownIds.has(photo.id) && <Box sx={{ position: 'absolute', top: 8, left: 8, bgcolor: 'background.paper', color: 'text.primary', borderRadius: '4px', px: '6px', py: '4px', fontSize: 11 }}>{t('yours')}{photo.status && photo.status !== 'approved' && ` · ${t(photo.status)}`}</Box>}
        </ButtonBase>
        <PhotoRating value={photo.rating} />
        {photo.caption && <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{photo.caption}</Typography>}
        <Typography variant="caption" color="text.secondary">{ownIds.has(photo.id) && photo.status === 'pending' ? t('onlyYou') : `${photo.uploaderName} · ${date(photo.createdAt)}`}</Typography>
      </Stack>)}
      <Box ref={tail} role="status" aria-live="polite" sx={{ flex: '0 0 auto', width: pageLoading || feedError ? { xs: 165, sm: 276 } : 1, display: !hasMore && !pageLoading && !feedError ? 'none' : 'block', minHeight: 1 }}>
        {feedError && !pageLoading ? <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ aspectRatio: '16 / 9', p: 1, color: 'text.secondary', textAlign: 'center' }}><Typography variant="body2">{t('loadMoreError')}</Typography><Button onClick={refresh} sx={{ minHeight: 44 }}>{t('retry')}</Button></Stack> : pageLoading ? <Stack data-pagination-skeleton spacing={1} aria-label={t('loading')}>
          <Skeleton variant="rectangular" animation="wave" sx={{ width: '100%', aspectRatio: '16 / 9', height: 'auto', borderRadius: '4px' }} />
          <Skeleton variant="rectangular" width="58%" height={20} />
          <Skeleton variant="rectangular" width="84%" height={21} />
          <Skeleton variant="rectangular" width="64%" sx={{ height: { xs: 16, sm: 18 } }} />
        </Stack> : null}
      </Box>
    </Box>
    {!hasMore && !busy && !feedError && photos.length > 0 && <Typography variant="caption" color="text.secondary">{t('endOfPhotos')}</Typography>}
    {selectedId && selectedPhoto && <Stack ref={detail} data-photo-detail role="region" aria-label={t('details')} spacing={1.5} sx={{ scrollMarginTop: '80px', minWidth: 0, bgcolor: theme => theme.palette.mode === 'dark' ? 'action.hover' : '#fafafa', border: '1px solid', borderColor: 'divider', borderRadius: '4px', p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }}>
        <Typography variant="body2" fontWeight={600}>{t('details')} · {Math.max(0, selectedIndex) + 1} / {related.length}</Typography>
        <Stack direction="row" sx={{ '& .MuiButton-root': { minHeight: 44 } }}><Button disabled={selectedIndex <= 0} onClick={() => setSelectedId(related[selectedIndex - 1].id)}>{t('previousPhoto')}</Button><Button disabled={selectedIndex >= related.length - 1} onClick={() => setSelectedId(related[selectedIndex + 1].id)}>{t('nextPhoto')}</Button><Button onClick={() => setSelectedId(null)}>{t('collapse')}</Button></Stack>
      </Stack>
      {group.error && <Alert severity="error">{t('error')} <Button onClick={() => group.mutate()}>{t('retry')}</Button></Alert>}
      <PhotoImage id={selectedPhoto.id} token={ownIds.has(selectedPhoto.id) || activeGroup?.own ? token : undefined} caption={selectedPhoto.caption || t('title')} mode="detail" />
      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap"><Typography variant="body2" fontWeight={600}>{selectedPhoto.uploaderName} · {date(selectedPhoto.createdAt)}</Typography>{(activeGroup?.own || (selected && ownIds.has(selected.id))) && <Typography variant="caption" color="text.secondary">{t('yours')}</Typography>}<PhotoRating value={selectedPhoto.rating} /></Stack>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{selectedPhoto.caption}</Typography>
      <Stack direction="row" gap={1} sx={{ overflowX: 'auto', py: '2px' }}>{related.map(photo => <ButtonBase key={photo.id} aria-label={photo.caption || t('details')} onClick={() => setSelectedId(photo.id)} sx={{ width: 96, flexShrink: 0, borderRadius: '4px', overflow: 'hidden', border: '2px solid', borderColor: photo.id === selectedId ? 'primary.main' : 'transparent' }}><PhotoImage id={photo.id} token={activeGroup?.own || (selected && ownIds.has(selected.id)) ? token : undefined} caption={photo.caption || t('title')} mode="thumb" /></ButtonBase>)}</Stack>
    </Stack>}
    {sharing && <SharePhotos key={token || 'guest'} shipId={shipId} shipName={shipName} token={token} verified={user.emailVerified} onClose={() => setSharing(false)} onUploaded={refresh} />}
  </section>;
}
