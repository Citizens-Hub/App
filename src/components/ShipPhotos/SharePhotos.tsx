import { useEffect, useState } from 'react';
import { Alert, Box, Button, ButtonBase, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useIntl } from 'react-intl';
import { usePhotoDraft } from './usePhotoDraft';
import PhotoRating from './PhotoRating';
import PhotoEditor from './PhotoEditor';
import addIcon from '@/assets/ship-photos/add.svg';
import closeIcon from '@/assets/ship-photos/close.svg';
export default function SharePhotos({ shipId, shipName, token, verified, onClose, onUploaded }: { shipId: number; shipName?: string; token: string; verified: boolean; onClose: () => void; onUploaded: () => void }) {
  const intl = useIntl(); const theme = useTheme(); const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const t = (key: string) => { const id = `shipPhotos.${key}`; return intl.formatMessage({ id }); };
  const draft = usePhotoDraft(shipId, token, onUploaded);
  const [viewport, setViewport] = useState({ height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 });
  useEffect(() => { const view = window.visualViewport; const sync = () => setViewport({ height: view?.height ?? window.innerHeight, top: view?.offsetTop ?? 0 }); view?.addEventListener('resize', sync); view?.addEventListener('scroll', sync); return () => { view?.removeEventListener('resize', sync); view?.removeEventListener('scroll', sync); }; }, []);
  const [editing, setEditing] = useState<string | null>(null);
  const [progress, setProgress] = useState(false);
  const [discard, setDiscard] = useState(false);
  const editorPhoto = draft.photos.find(photo => photo.id === editing);
  const close = () => { if (!draft.busy) { if (draft.photos.some(photo => photo.state !== 'done')) setDiscard(true); else onClose(); } };
  const submit = async (id?: string) => { setProgress(true); await draft.submit(id); };
  const completed = draft.photos.filter(photo => photo.state === 'done').length;
  const failed = draft.photos.filter(photo => photo.state === 'error').length;
  return <>
    <Dialog open fullWidth maxWidth={false} fullScreen={mobile} onClose={close} PaperProps={{ sx: { height: mobile ? viewport.height : undefined, position: mobile ? 'fixed' : undefined, top: mobile ? viewport.top : undefined, maxHeight: mobile ? 'none' : undefined, maxWidth: 960, borderRadius: '4px', m: { xs: 0, sm: 3 } } }}>
      <DialogTitle sx={{ px: { xs: 2, sm: 3 }, pt: 3, pb: 2, minHeight: { xs: 84, sm: 'auto' }, flexShrink: 0 }}>{t(progress ? 'progress' : 'upload')}<IconButton disabled={draft.busy} aria-label={t('cancel')} onClick={close} sx={{ position: 'absolute', top: 14, right: 14, minWidth: 44, minHeight: 44 }}><img src={closeIcon} alt="" width={24} height={24} /></IconButton></DialogTitle>
      <DialogContent sx={{ px: 3 }}><Stack spacing={2.5}>
        {!token ? <Typography>{t('login')}</Typography> : !verified ? <Typography>{t('verifyEmail')}</Typography> : <>
          {progress ? <>
            <Typography variant="body2" aria-live="polite">{intl.formatMessage({ id: 'shipPhotos.progressSummary' }, { completed, failed })}</Typography>
            {draft.photos.map((photo, index) => <Stack key={photo.id} direction="row" gap={2} alignItems="center" sx={{ bgcolor: 'action.hover', p: 1.5, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
              <Box component="img" src={photo.preview} alt={t('preview')} sx={{ width: 112, aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: '4px' }} />
              <Stack spacing={0.5} sx={{ flex: 1, minWidth: 100 }}><Typography variant="body2" fontWeight={600}>{intl.formatMessage({ id: 'shipPhotos.photoNumber' }, { number: index + 1 })}</Typography><Typography variant="body2" color={photo.state === 'error' ? 'warning.main' : 'text.secondary'}>{t(photo.error || photo.state)}</Typography></Stack>
              {(photo.state === 'error') && <Button disabled={draft.busy} variant="outlined" sx={{ ml: 'auto' }} onClick={() => submit(photo.id)}>{t('retry')}</Button>}
              {photo.error === 'imageEncoding' && <><Button disabled={draft.busy} onClick={() => setEditing(photo.id)}>{t('edit')}</Button><Button disabled={draft.busy} onClick={() => draft.remove(photo.id)}>{t('remove')}</Button></>}
            </Stack>)}
          </> : <>
            {shipName && <Typography variant="body2" color="text.secondary">{shipName}</Typography>}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', md: 'repeat(4,minmax(0,1fr))' }, gap: 2 }}>
              {draft.photos.map(photo => <Stack key={photo.id} spacing={1}><Box component="img" src={photo.preview} alt={t('preview')} sx={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: '4px' }} /><Stack direction="row" spacing={1.5}><Button disabled={draft.busy || draft.locked} onClick={() => setEditing(photo.id)} sx={{ minWidth: 0, px: 0, minHeight: 44, flex: { xs: 1, sm: 'none' } }}>{t('edit')}</Button><Button disabled={draft.busy || draft.locked} onClick={() => draft.remove(photo.id)} sx={{ minWidth: 0, px: 0, flex: { xs: 1, sm: 'none' }, color: 'text.secondary', minHeight: 44 }}>{t('remove')}</Button></Stack></Stack>)}
              {draft.photos.length < 6 && <ButtonBase component="label" disabled={draft.busy || draft.locked} sx={{ aspectRatio: '16 / 9', border: '1px dashed #8cb6d8', borderRadius: '4px', bgcolor: theme.palette.mode === 'dark' ? 'rgba(51,122,183,.12)' : '#f6faff', color: 'primary.main', flexDirection: 'column', gap: '7px', p: 2 }}><img src={addIcon} alt="" width={26} height={26} /><Typography variant="body2">{t(draft.photos.length ? 'addMore' : 'choose')}</Typography><input type="file" hidden multiple accept="image/jpeg,image/png,image/webp" disabled={draft.busy || draft.locked} onChange={event => { if (event.target.files) void draft.addFiles(event.target.files); event.target.value = ''; }} /></ButtonBase>}
            </Box>
            <Typography variant="caption" color="text.secondary">{t('limits')}</Typography>
            <Stack spacing={1}><Typography variant="body2">{t('rating')}</Typography><PhotoRating value={draft.rating} onChange={draft.setRating} disabled={draft.busy || draft.locked} /></Stack>
            <TextField label={t('caption')} value={draft.caption} onChange={event => draft.setCaption(event.target.value)} disabled={draft.busy || draft.locked} multiline minRows={4} inputProps={{ maxLength: 500 }} helperText={`${draft.caption.length}/500`} />
            <FormControlLabel control={<Checkbox checked={draft.owned} onChange={event => draft.setOwned(event.target.checked)} disabled={draft.busy || draft.locked} />} label={<Typography variant="body2">{t('ownership')}</Typography>} />
            <Typography variant="body2" color="text.secondary">{t('intro')}</Typography>
          </>}
          {draft.error && <Alert severity="error">{t(draft.error)}{progress && !draft.locked && <Button onClick={() => setProgress(false)}>{t('backToEdit')}</Button>}</Alert>}
        </>}
      </Stack></DialogContent>
      <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: { xs: 2, sm: 3 }, minHeight: { xs: 88, sm: 'auto' }, flexShrink: 0, gap: 1, '& .MuiButton-root': { minHeight: 44 }, '& > .MuiButton-contained': { flex: { xs: 1, sm: 'none' } } }}>
        <Button sx={{ display: mobile && !progress && token && verified ? 'none' : undefined, flex: mobile && progress ? 1 : undefined }} variant="outlined" disabled={draft.busy} onClick={close}>{t(progress ? 'backToPhotos' : 'cancel')}</Button>
        {token && verified && (!progress || (draft.error && draft.locked)) && <Button disabled={draft.busy || !draft.photos.length || !draft.owned} variant="contained" onClick={() => submit()}>{draft.busy ? t('uploading') : progress ? t('retry') : intl.formatMessage({ id: 'shipPhotos.publish' }, { count: draft.photos.length })}</Button>}
      </DialogActions>
    </Dialog>
    {editorPhoto && <PhotoEditor photo={editorPhoto} onClose={() => setEditing(null)} onSave={async edit => { if (await draft.edit(editorPhoto.id, edit)) setEditing(null); }} />}
    <Dialog open={discard} onClose={() => setDiscard(false)}><DialogTitle>{t('discardTitle')}</DialogTitle><DialogContent><Typography>{t('discardBody')}</Typography></DialogContent><DialogActions><Button onClick={() => setDiscard(false)}>{t('keepEditing')}</Button><Button onClick={() => { draft.reset(); onClose(); }}>{t('discard')}</Button></DialogActions></Dialog>
  </>;
}
