import { randomId } from '@/utils/randomId';
import { useEffect, useRef, useState } from 'react';
import { PhotoRequestError, photoErrorKey, photoRequest } from './api';
import { defaultEdit, exportPhoto, validateSource, type PhotoEdit } from './imageEditing';

export interface DraftPhoto {
  id: string; file: File; preview: string; edit: PhotoEdit;
  encoded?: File; state: 'ready' | 'processing' | 'uploading' | 'done' | 'error'; error?: string;
}
export function usePhotoDraft(shipId: number, token: string, onUploaded: () => void) {
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [caption, setCaption] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [owned, setOwned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const groupId = useRef<string | undefined>(undefined);
  const requestId = useRef(randomId());
  const urls = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; const activeUrls = urls.current; return () => { alive.current = false; activeUrls.forEach(url => URL.revokeObjectURL(url)); activeUrls.clear(); }; }, []);
  async function addFiles(files: FileList | File[]) {
    if (inFlight.current || locked) return;
    setError('');
    const incoming = Array.from(files);
    if (photos.length + incoming.length > 6) { setError('maxPhotos'); return; }
    if (incoming.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 32 * 1024 * 1024)) { setError('limits'); return; }
    inFlight.current = true; setBusy(true);
    try { for (const file of incoming) await validateSource(file); }
    catch { setError('imageEncoding'); return; }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
    if (!alive.current) return;
    setPhotos(previous => [...previous, ...incoming.map(file => {
      const preview = URL.createObjectURL(file); urls.current.add(preview);
      return { id: randomId(), file, preview, edit: defaultEdit(), state: 'ready' as const };
    })]);
  }
  function remove(id: string) {
    if (inFlight.current) return;
    const photo = photos.find(item => item.id === id);
    if (locked && photo?.error !== 'imageEncoding') return;
    if (photo) { URL.revokeObjectURL(photo.preview); urls.current.delete(photo.preview); }
    setPhotos(items => items.filter(item => item.id !== id));
  }
  async function edit(id: string, value: PhotoEdit) {
    const photo = photos.find(item => item.id === id);
    if (inFlight.current || !photo || (locked && photo.error !== 'imageEncoding')) return false;
    inFlight.current = true; setBusy(true);
    try {
      const encoded = await exportPhoto(photo.file, value);
      if (!alive.current) return false;
      const preview = URL.createObjectURL(encoded); urls.current.add(preview);
      URL.revokeObjectURL(photo.preview); urls.current.delete(photo.preview);
      setPhotos(items => items.map(item => item.id === id ? { ...item, edit: value, preview, encoded, state: 'ready', error: undefined } : item));
      return true;
    } catch { if (alive.current) setError('imageEncoding'); return false; }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  function reset() {
    if (inFlight.current) return;
    urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current.clear();
    setPhotos([]); setCaption(''); setRating(null); setOwned(false); setError(''); setLocked(false);
    groupId.current = undefined; requestId.current = randomId();
  }
  async function submit(targetPhotoId?: string): Promise<boolean> {
    if (inFlight.current || !token || !photos.length || !owned) return false;
    inFlight.current = true; setBusy(true); setLocked(true); setError('');
    const update = (id: string, patch: Partial<DraftPhoto>) => { if (alive.current) setPhotos(items => items.map(item => item.id === id ? { ...item, ...patch } : item)); };
    let succeeded = true;
    try {
      if (!groupId.current) {
        const result = await photoRequest<{ review: { id: string } }>(`/api/ships/${shipId}/photo-reviews`, token, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caption: caption.trim(), rating, ownScreenshot: true, clientRequestId: requestId.current }),
        });
        groupId.current = result.review.id;
      }
      for (const photo of photos.filter(item => item.state !== 'done' && (!targetPhotoId || item.id === targetPhotoId))) {
        if (!alive.current) break;
        try {
          update(photo.id, { state: 'processing', error: undefined });
          let file: File;
          try { file = photo.encoded ?? await exportPhoto(photo.file, photo.edit); update(photo.id, { encoded: file }); } catch { throw new Error('imageEncoding'); }
          if (!alive.current) break;
          update(photo.id, { state: 'uploading' });
          const body = new FormData();
          body.append('file', file); body.append('groupId', groupId.current!); body.append('clientPhotoId', photo.id); body.append('ownScreenshot', 'true');
          await photoRequest(`/api/ships/${shipId}/photos`, token, { method: 'POST', body });
          update(photo.id, { state: 'done' });
          if (alive.current) onUploaded();
        } catch (failure) {
          succeeded = false;
          update(photo.id, { state: 'error', error: failure instanceof Error && failure.message === 'imageEncoding' ? 'imageEncoding' : photoErrorKey(failure) });
        }
      }
    } catch (failure) { succeeded = false; if (alive.current) { setError(photoErrorKey(failure)); if (!groupId.current && failure instanceof PhotoRequestError && [400, 401, 403, 413, 415, 422, 429].includes(failure.status)) setLocked(false); } }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
    return succeeded && alive.current;
  }
  return { photos, caption, setCaption, rating, setRating, owned, setOwned, busy, locked, error, addFiles, remove, edit, reset, submit };
}
