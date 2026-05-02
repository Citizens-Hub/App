const MAX_DIRECT_CANVAS_PIXELS = 16_000_000;
const MAX_DIRECT_CANVAS_DIMENSION = 4_096;
const TILE_MAX_DIMENSION = 2_048;
const TILE_MAX_PIXELS = 4_000_000;

type CanvasSurface = HTMLCanvasElement | OffscreenCanvas;
type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface DecodedImagePixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function createCanvasSurface(width: number, height: number): CanvasSurface {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  throw new Error('No canvas implementation is available for image decoding.');
}

function getCanvasContext(surface: CanvasSurface): Canvas2DContext {
  const ctx = surface.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to initialize image decoding canvas context.');
  }

  // ctx.imageSmoothingEnabled = false;
  return ctx as Canvas2DContext;
}

function shouldUseTiledRead(width: number, height: number) {
  return (
    width > MAX_DIRECT_CANVAS_DIMENSION
    || height > MAX_DIRECT_CANVAS_DIMENSION
    || (width * height) > MAX_DIRECT_CANVAS_PIXELS
  );
}

function resizeCanvasSurface(surface: CanvasSurface, width: number, height: number) {
  if (surface.width !== width) {
    surface.width = width;
  }
  if (surface.height !== height) {
    surface.height = height;
  }
}

function readPixelsDirectly(imageBitmap: ImageBitmap): DecodedImagePixels {
  const surface = createCanvasSurface(imageBitmap.width, imageBitmap.height);
  const ctx = getCanvasContext(surface);

  ctx.drawImage(imageBitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, imageBitmap.width, imageBitmap.height);

  return {
    width: imageBitmap.width,
    height: imageBitmap.height,
    data: imageData.data
  };
}

function readPixelsByTile(imageBitmap: ImageBitmap): DecodedImagePixels {
  const { width, height } = imageBitmap;
  const output = new Uint8ClampedArray(width * height * 4);
  const tileWidth = Math.min(width, TILE_MAX_DIMENSION);
  const tileHeight = Math.min(
    height,
    TILE_MAX_DIMENSION,
    Math.max(1, Math.floor(TILE_MAX_PIXELS / Math.max(tileWidth, 1)))
  );
  const surface = createCanvasSurface(tileWidth, tileHeight);
  let ctx = getCanvasContext(surface);

  for (let top = 0; top < height; top += tileHeight) {
    const currentTileHeight = Math.min(tileHeight, height - top);

    for (let left = 0; left < width; left += tileWidth) {
      const currentTileWidth = Math.min(tileWidth, width - left);

      resizeCanvasSurface(surface, currentTileWidth, currentTileHeight);
      ctx = getCanvasContext(surface);
      ctx.clearRect(0, 0, currentTileWidth, currentTileHeight);
      ctx.drawImage(
        imageBitmap,
        left,
        top,
        currentTileWidth,
        currentTileHeight,
        0,
        0,
        currentTileWidth,
        currentTileHeight
      );

      const tileData = ctx.getImageData(0, 0, currentTileWidth, currentTileHeight).data;
      const rowWidthBytes = currentTileWidth * 4;

      for (let row = 0; row < currentTileHeight; row += 1) {
        const srcOffset = row * rowWidthBytes;
        const dstOffset = (((top + row) * width) + left) * 4;
        output.set(tileData.subarray(srcOffset, srcOffset + rowWidthBytes), dstOffset);
      }
    }
  }

  return {
    width,
    height,
    data: output
  };
}

export function readImageBitmapPixels(imageBitmap: ImageBitmap): DecodedImagePixels {
  if (shouldUseTiledRead(imageBitmap.width, imageBitmap.height)) {
    return readPixelsByTile(imageBitmap);
  }

  return readPixelsDirectly(imageBitmap);
}

export async function readImageBlobPixels(blob: Blob): Promise<DecodedImagePixels> {
  const imageBitmap = await createImageBitmap(blob);

  try {
    return readImageBitmapPixels(imageBitmap);
  } finally {
    imageBitmap.close();
  }
}
