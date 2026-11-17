import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useIntl } from 'react-intl';
import { defaultEdit, exportPhoto, rotateEdit, type PhotoEdit } from './imageEditing';
import type { DraftPhoto } from './usePhotoDraft';
import closeIcon from '@/assets/ship-photos/close.svg';
export default function PhotoEditor({ photo, onSave, onClose }: { photo: DraftPhoto; onSave: (edit: PhotoEdit) => void; onClose: () => void }) {
  const intl = useIntl(); const theme = useTheme(); const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const t = (key: string) => { const id = `shipPhotos.${key}`; return intl.formatMessage({ id }); };
  const [edit, setEdit] = useState(photo.edit);
  const [preview, setPreview] = useState('');
  const [ratio, setRatio] = useState(1);
  const [error, setError] = useState(false);
  const [preset, setPreset] = useState('original');
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; crop: PhotoEdit['crop']; resize: boolean } | null>(null);
  useEffect(() => {
    let disposed = false; let url = '';
    setPreview(''); setError(false);
    exportPhoto(photo.file, { ...defaultEdit(), rotation: edit.rotation }).then(file => {
      if (!disposed) { url = URL.createObjectURL(file); setPreview(url); }
    }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; if (url) URL.revokeObjectURL(url); };
  }, [photo.file, edit.rotation]);
  function aspect(value: string) {
    setPreset(value);
    const target = value === 'original' ? ratio : value === 'square' ? 1 : 16 / 9;
    const width = Math.min(1, target / ratio), height = Math.min(1, ratio / target);
    setEdit(previous => ({ ...previous, crop: { x: (1 - width) / 2, y: (1 - height) / 2, width, height } }));
  }
  return <Dialog open fullWidth maxWidth={false} fullScreen={mobile} onClose={onClose} PaperProps={{ sx: { maxWidth: 960, borderRadius: '4px', m: { xs: 0, sm: 3 } } }}>
    <DialogTitle sx={{ px: 3, pt: 3, pb: 2 }}>{t('edit')}<IconButton aria-label={t('cancel')} onClick={onClose} sx={{ position: 'absolute', top: 14, right: 14, minWidth: 44, minHeight: 44 }}><img src={closeIcon} alt="" width={24} height={24} /></IconButton></DialogTitle>
    <DialogContent sx={{ px: 3 }}><Stack spacing={2.5}>
      <Typography variant="body2" color="text.secondary" noWrap>{photo.file.name}</Typography>
      {error && <Alert severity="error">{t('imageEncoding')}</Alert>}
      <Box sx={{ height: { xs: 270, sm: 390 }, display: 'grid', placeItems: 'center', bgcolor: '#18222c', overflow: 'hidden', borderRadius: '4px' }}>
        {preview && <Box ref={frame} sx={{ width: `min(100%, ${(mobile ? 270 : 390) * ratio}px)`, aspectRatio: String(ratio), position: 'relative', touchAction: 'none' }}>
          <Box component="img" src={preview} alt={t('preview')} onLoad={event => setRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} sx={{ display: 'block', width: '100%' }} />
          <Box tabIndex={0} role="group" aria-label={t('cropArea')}
            onKeyDown={event => { const changes: Record<string, [number, number]> = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }; const delta = changes[event.key]; if (delta) { event.preventDefault(); setEdit(current => ({ ...current, crop: { ...current.crop, x: Math.max(0, Math.min(1 - current.crop.width, current.crop.x + delta[0])), y: Math.max(0, Math.min(1 - current.crop.height, current.crop.y + delta[1])) } })); } }}
            onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, crop: { ...edit.crop }, resize: (event.target as HTMLElement).dataset.resize === 'true' }; }}
            onPointerMove={event => { const current = drag.current, bounds = frame.current?.getBoundingClientRect(); if (!current || !bounds) return; const dx = (event.clientX - current.x) / bounds.width, dy = (event.clientY - current.y) / bounds.height; const crop = { ...current.crop }; if (current.resize) { const multiplier = Math.max(0.1, Math.min((1 - crop.x) / crop.width, (1 - crop.y) / crop.height, 1 + Math.max(dx / crop.width, dy / crop.height))); crop.width *= multiplier; crop.height *= multiplier; } else { crop.x = Math.max(0, Math.min(1 - crop.width, crop.x + dx)); crop.y = Math.max(0, Math.min(1 - crop.height, crop.y + dy)); } setEdit(previous => ({ ...previous, crop })); }}
            onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
            sx={{ position: 'absolute', left: `${edit.crop.x * 100}%`, top: `${edit.crop.y * 100}%`, width: `${edit.crop.width * 100}%`, height: `${edit.crop.height * 100}%`, border: '2px solid white', boxShadow: '0 0 0 9999px rgba(0,0,0,.35)', cursor: 'move' }}>
            {[1, 2].map(n => <Box key={n} sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', '&::before': { content: '""', position: 'absolute', left: `${n * 100 / 3}%`, height: '100%', borderLeft: '1px solid #ffffffa6' }, '&::after': { content: '""', position: 'absolute', top: `${n * 100 / 3}%`, width: '100%', borderTop: '1px solid #ffffffa6' } }} />)}
            <Box data-resize="true" sx={{ position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRight: '4px solid white', borderBottom: '4px solid white', cursor: 'nwse-resize' }} />
          </Box>
        </Box>}
      </Box>
      <Stack direction="row" gap={1.5} flexWrap="wrap">{[['original', t('original')], ['wide', '16:9'], ['square', '1:1']].map(([value, label]) => <Button key={value} variant={preset === value ? 'contained' : 'outlined'} onClick={() => aspect(value)} sx={{ minHeight: 44 }}>{label}</Button>)}<Button variant="outlined" onClick={() => { setEdit(rotateEdit(edit)); setPreset('original'); }} sx={{ minHeight: 44 }}>{t('rotate')}</Button><Button variant="outlined" onClick={() => { setEdit(defaultEdit()); setPreset('original'); }} sx={{ minHeight: 44 }}>{t('reset')}</Button></Stack>
    </Stack></DialogContent>
    <DialogActions sx={{ px: 3, pb: 3, gap: 1, '& .MuiButton-root': { minHeight: 44 } }}><Button variant="outlined" onClick={onClose}>{t('cancel')}</Button><Button variant="contained" disabled={!preview || error} onClick={() => onSave(edit)}>{t('saveEdit')}</Button></DialogActions>
  </Dialog>;
}
