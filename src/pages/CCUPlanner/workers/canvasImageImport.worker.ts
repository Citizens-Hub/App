/// <reference lib="webworker" />

import { extractRobustWatermark } from '../services/RobustImageWatermarkService';

type ImportStage =
  | 'decoding'
  | 'extracting';

interface WorkerDecodeRequest {
  type: 'decode';
  imageBuffer: ArrayBuffer;
  mimeType: string;
}

interface WorkerProgressMessage {
  type: 'progress';
  stage: ImportStage;
  progress: number;
}

interface WorkerSuccessMessage {
  type: 'success';
  payloadBuffer: ArrayBuffer;
  decodeMethod: 'robust';
}

interface WorkerErrorMessage {
  type: 'error';
  error: string;
}

type WorkerRequestMessage = WorkerDecodeRequest;

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<WorkerRequestMessage>) => {
  const message = event.data;

  if (message.type !== 'decode') {
    const errorResponse: WorkerErrorMessage = {
      type: 'error',
      error: `Unsupported worker request type: ${String((message as { type?: unknown }).type)}`
    };
    workerScope.postMessage(errorResponse);
    return;
  }

  try {
    const decodingProgressMessage: WorkerProgressMessage = {
      type: 'progress',
      stage: 'decoding',
      progress: 30
    };
    workerScope.postMessage(decodingProgressMessage);

    const blob = new Blob([message.imageBuffer], { type: message.mimeType || 'image/png' });
    const imageBitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      imageBitmap.close();
      throw new Error('Unable to initialize image import canvas context.');
    }

    ctx.drawImage(imageBitmap, 0, 0);
    imageBitmap.close();

    const extractingProgressMessage: WorkerProgressMessage = {
      type: 'progress',
      stage: 'extracting',
      progress: 72
    };
    workerScope.postMessage(extractingProgressMessage);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const payload = extractRobustWatermark(imageData.data, canvas.width, canvas.height);

    const payloadBuffer = payload.buffer.slice(
      payload.byteOffset,
      payload.byteOffset + payload.byteLength
    );

    const successResponse: WorkerSuccessMessage = {
      type: 'success',
      payloadBuffer,
      decodeMethod: 'robust'
    };
    workerScope.postMessage(successResponse, [payloadBuffer]);
  } catch (error) {
    const errorResponse: WorkerErrorMessage = {
      type: 'error',
      error: error instanceof Error ? error.message : 'Image import worker failed.'
    };
    workerScope.postMessage(errorResponse);
  }
};

export {};
