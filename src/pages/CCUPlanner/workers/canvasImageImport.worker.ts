/// <reference lib="webworker" />

import { extractRobustWatermark } from '../services/RobustImageWatermarkService';
import { readImageBlobPixels } from '@/utils/readImageBitmapPixels';

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
    const decodedImage = await readImageBlobPixels(blob);

    const extractingProgressMessage: WorkerProgressMessage = {
      type: 'progress',
      stage: 'extracting',
      progress: 72
    };
    workerScope.postMessage(extractingProgressMessage);

    const payload = extractRobustWatermark(
      decodedImage.data,
      decodedImage.width,
      decodedImage.height
    );

    const payloadBuffer = payload.buffer.slice(
      payload.byteOffset,
      payload.byteOffset + payload.byteLength
    ) as ArrayBuffer;

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
