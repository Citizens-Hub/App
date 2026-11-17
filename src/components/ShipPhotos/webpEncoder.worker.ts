import createEncoder from '@jsquash/webp/codec/enc/webp_enc.js';
import { defaultOptions } from '@jsquash/webp/meta.js';
import scalarWasm from '@jsquash/webp/codec/enc/webp_enc.wasm?url';

self.onmessage = async ({ data }: MessageEvent<{ pixels: ImageData }>) => {
  try {
    // Explicit asset URLs allow Vite to fingerprint and serve WASM from this origin.
    const encoder = await createEncoder({ noInitialRun: true, locateFile: () => scalarWasm });
    for (const quality of [86, 76, 64]) {
      const output = encoder.encode(data.pixels.data, data.pixels.width, data.pixels.height, { ...defaultOptions, quality });
      if (!output) throw new Error('imageEncoding');
      const buffer = output.buffer;
      if (buffer.byteLength <= 8 * 1024 * 1024) {
        self.postMessage({ buffer }, { transfer: [buffer] });
        return;
      }
    }
    self.postMessage({ error: 'imageEncoding' });
  } catch { self.postMessage({ error: 'imageEncoding' }); }
};
