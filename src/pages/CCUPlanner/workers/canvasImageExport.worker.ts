/// <reference lib="webworker" />

import type { PreparedExportPayload } from '../services/CanvasImageExportRenderer';
import {
  renderPreparedExportBackground,
  renderPreparedExportContent
} from '../services/CanvasImageExportRenderer';
import { embedRobustWatermark } from '../services/RobustImageWatermarkService';
const EXPORT_MIME_TYPE = 'image/jpeg';
const EXPORT_JPEG_QUALITY = 0.96;

type ExportStage =
  | 'loading_images'
  | 'rendering'
  | 'embedding'
  | 'encoding';

interface WorkerRenderRequest {
  type: 'render';
  payload: PreparedExportPayload;
  routePayload: ArrayBuffer;
}

interface WorkerProgressMessage {
  type: 'progress';
  stage: ExportStage;
  progress: number;
}

interface WorkerSuccessMessage {
  type: 'success';
  blob: Blob;
  robustWatermarkEmbedded: boolean;
}

interface WorkerErrorMessage {
  type: 'error';
  error: string;
}

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

async function loadImageBitmap(url: string) {
  try {
    const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

workerScope.onmessage = async (event: MessageEvent<WorkerRenderRequest>) => {
  const message = event.data;

  if (message.type !== 'render') {
    const errorResponse: WorkerErrorMessage = {
      type: 'error',
      error: `Unsupported worker request type: ${String((message as { type?: unknown }).type)}`
    };
    workerScope.postMessage(errorResponse);
    return;
  }

  try {
    const payload = message.payload;
    const routePayload = new Uint8Array(message.routePayload);
    const canvas = new OffscreenCanvas(
      Math.round(payload.width * payload.scale),
      Math.round(payload.height * payload.scale)
    );
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Unable to initialize OffscreenCanvas context.');
    }

    ctx.scale(payload.scale, payload.scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const imageUrls = Array.from(new Set([
      ...payload.nodes.flatMap((node) => [
        node.imageUrl,
        node.manufacturerLogoUrl || ''
      ]),
      payload.footerCard?.mediaUrl || ''
    ].filter(Boolean)));
    const imageMap = new Map<string, ImageBitmap | null>();

    for (let index = 0; index < imageUrls.length; index += 1) {
      const imageUrl = imageUrls[index];
      const image = await loadImageBitmap(imageUrl);
      imageMap.set(imageUrl, image);

      const progressMessage: WorkerProgressMessage = {
        type: 'progress',
        stage: 'loading_images',
        progress: 10 + Math.round(((index + 1) / Math.max(imageUrls.length, 1)) * 45)
      };
      workerScope.postMessage(progressMessage);
    }

    const renderProgressMessage: WorkerProgressMessage = {
      type: 'progress',
      stage: 'rendering',
      progress: 72
    };
    workerScope.postMessage(renderProgressMessage);

    const embeddingProgressMessage: WorkerProgressMessage = {
      type: 'progress',
      stage: 'embedding',
      progress: 84
    };
    workerScope.postMessage(embeddingProgressMessage);

    renderPreparedExportBackground(ctx, payload);
    renderPreparedExportContent(ctx, payload, imageMap);
    const referenceImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(payload.scale, payload.scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    renderPreparedExportBackground(ctx, payload);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    embedRobustWatermark(imageData.data, canvas.width, canvas.height, routePayload, {
      referencePixelBytes: referenceImageData.data,
      backgroundPixelBytes: imageData.data,
      excludedRects: payload.watermarkExcludedRects
    });
    ctx.putImageData(imageData, 0, 0);
    renderPreparedExportContent(ctx, payload, imageMap);

    const encodingProgressMessage: WorkerProgressMessage = {
      type: 'progress',
      stage: 'encoding',
      progress: 92
    };
    workerScope.postMessage(encodingProgressMessage);

    const blob = await canvas.convertToBlob({ type: EXPORT_MIME_TYPE, quality: EXPORT_JPEG_QUALITY });

    const encodedProgressMessage: WorkerProgressMessage = {
      type: 'progress',
      stage: 'encoding',
      progress: 98
    };
    workerScope.postMessage(encodedProgressMessage);

    imageMap.forEach((image) => {
      image?.close();
    });

    const successResponse: WorkerSuccessMessage = {
      type: 'success',
      blob,
      robustWatermarkEmbedded: true
    };

    workerScope.postMessage(successResponse);
  } catch (error) {
    const errorResponse: WorkerErrorMessage = {
      type: 'error',
      error: error instanceof Error ? error.message : 'Image export worker failed.'
    };
    workerScope.postMessage(errorResponse);
  }
};

export {};
