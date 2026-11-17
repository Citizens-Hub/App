/** Editing is non-destructive: every export starts from the user's original file. */
export interface PhotoEdit {
  rotation: 0 | 90 | 180 | 270;
  /** Crop coordinates are fractions of the rotated image, not screen pixels. */
  crop: { x: number; y: number; width: number; height: number };
}
export const defaultEdit = (): PhotoEdit => ({ rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } });
export function rotateEdit(edit: PhotoEdit): PhotoEdit {
  return { rotation: ((edit.rotation + 90) % 360) as PhotoEdit['rotation'], crop: { x: 0, y: 0, width: 1, height: 1 } };
}
export function cropPixels(width: number, height: number, edit: PhotoEdit) {
  const rotatedWidth = edit.rotation % 180 ? height : width;
  const rotatedHeight = edit.rotation % 180 ? width : height;
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  const x = Math.floor(clamp(edit.crop.x, 0, 0.99) * rotatedWidth);
  const y = Math.floor(clamp(edit.crop.y, 0, 0.99) * rotatedHeight);
  return { x, y, width: Math.max(1, Math.min(rotatedWidth - x, Math.round(clamp(edit.crop.width, 0.01, 1) * rotatedWidth))), height: Math.max(1, Math.min(rotatedHeight - y, Math.round(clamp(edit.crop.height, 0.01, 1) * rotatedHeight))), rotatedWidth, rotatedHeight };
}
/** Read dimensions before decoding to reject decompression-sized images. */
export function imageDimensions(buffer: ArrayBuffer): { width: number; height: number } {
  const bytes = new Uint8Array(buffer); const view = new DataView(buffer);
  const ascii = (offset: number, count: number) => String.fromCharCode(...bytes.slice(offset, offset + count));
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && ascii(12, 4) === 'IHDR') return { width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8X') return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
    if (chunk === 'VP8L' && bytes[20] === 0x2f) return { width: 1 + ((bytes[22] & 0x3f) << 8 | bytes[21]), height: 1 + ((bytes[24] & 0xf) << 10 | bytes[23] << 2 | bytes[22] >> 6) };
    if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      offset += length;
    }
  }
  throw new Error('imageEncoding');
}
export async function validateSource(file: File) {
  if (!file.size || file.size > 32 * 1024 * 1024) throw new Error('limits');
  const dimensions = imageDimensions(await file.arrayBuffer());
  if (!dimensions.width || !dimensions.height || dimensions.width * dimensions.height > 40_000_000 || Math.max(dimensions.width, dimensions.height) > 16384) throw new Error('imageDimensions');
  return dimensions;
}
/** Safari may decode WebP but cannot encode it with canvas. Use a worker only
 * when native WebP encoding is unavailable, keeping the codec off the main bundle. */
async function encodeWebP(canvas: HTMLCanvasElement): Promise<Blob> {
  const native = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.86));
  if (native?.type === 'image/webp') {
    if (native.size <= 8 * 1024 * 1024) return native;
    for (const quality of [0.76, 0.64]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      if (blob?.type === 'image/webp' && blob.size <= 8 * 1024 * 1024) return blob;
    }
    throw new Error('imageEncoding');
  }
  const context = canvas.getContext('2d');
  if (!context) throw new Error('imageEncoding');
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const worker = new Worker(new URL('./webpEncoder.worker.ts', import.meta.url), { type: 'module' });
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('imageEncoding')), 60_000);
      worker.onmessage = ({ data }: MessageEvent<{ buffer?: ArrayBuffer; error?: string }>) => {
        clearTimeout(timer);
        if (data.buffer) resolve(new Blob([data.buffer], { type: 'image/webp' }));
        else reject(new Error('imageEncoding'));
      };
      worker.onerror = () => { clearTimeout(timer); reject(new Error('imageEncoding')); };
      worker.postMessage({ pixels }, [pixels.data.buffer]);
    });
  } finally { worker.terminate(); }
}

async function decodePhoto(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch { /* Older WebKit has incomplete bitmap decoding; Image is the fallback. */ }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve(); image.onerror = () => reject(new Error('imageEncoding')); image.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => { image.src = ''; URL.revokeObjectURL(url); } };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}

export async function exportPhoto(file: File, edit: PhotoEdit): Promise<File> {
  await validateSource(file);
  const bitmap = await decodePhoto(file);
  const canvas = document.createElement('canvas');
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) throw new Error('imageDimensions');
    const rect = cropPixels(bitmap.width, bitmap.height, edit);
    // Render the cropped viewport directly. Avoid allocating a full-resolution rotated canvas.
    const scale = Math.min(1, 2560 / Math.max(rect.width, rect.height));
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('imageEncoding');
    context.scale(scale, scale);
    context.translate(-rect.x, -rect.y);
    context.translate(rect.rotatedWidth / 2, rect.rotatedHeight / 2);
    context.rotate(edit.rotation * Math.PI / 180);
    context.drawImage(bitmap.source, -bitmap.width / 2, -bitmap.height / 2);
    const blob = await encodeWebP(canvas);
    if (!blob.size || blob.size > 8 * 1024 * 1024) throw new Error('imageEncoding');
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'screenshot'}.webp`, { type: 'image/webp' });
  } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
}
