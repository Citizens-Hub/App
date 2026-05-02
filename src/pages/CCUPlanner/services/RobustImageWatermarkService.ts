import {
  analyzeRobustWatermarkFrequencyV1,
  extractRobustWatermarkV1WithDiagnostics
} from './RobustImageWatermarkV1';
import {
  analyzeRobustWatermarkFrequencyV2,
  calculateRobustWatermarkCapacityV2,
  debugRobustWatermarkV2,
  embedRobustWatermarkV2,
  extractRobustWatermarkV2WithDiagnostics
} from './RobustImageWatermarkV2';
import type {
  RobustWatermarkDebugAttempt,
  RobustWatermarkDebugReport
} from './RobustImageWatermarkTypes';

export {
  ROBUST_WATERMARK_BLOCK_FLAG_ANCHOR,
  ROBUST_WATERMARK_BLOCK_FLAG_HEADER,
  ROBUST_WATERMARK_BLOCK_FLAG_PAYLOAD,
  ROBUST_WATERMARK_BLOCK_FLAG_VALID
} from './RobustImageWatermarkTypes';

export type {
  AnchorLayoutMode,
  Bit,
  RobustWatermarkDebugAttempt,
  RobustWatermarkDebugReport,
  RobustWatermarkGeometryDebug,
  RobustWatermarkHeaderDebug,
  RobustWatermarkPayloadDebug,
  RobustWatermarkDiagnostics,
  RobustWatermarkExtractionResult,
  RobustWatermarkFrequencyAnalysis
} from './RobustImageWatermarkTypes';

function toAttemptError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function debugRobustWatermarkV1(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
): RobustWatermarkDebugAttempt {
  try {
    const extracted = extractRobustWatermarkV1WithDiagnostics(pixelBytes, imageWidth, imageHeight);
    return {
      version: 1,
      ok: true,
      error: null,
      diagnostics: extracted.diagnostics,
      geometry: null,
      header: null,
      invertedHeader: null,
      payload: null
    };
  } catch (error) {
    return {
      version: 1,
      ok: false,
      error: toAttemptError(error),
      diagnostics: null,
      geometry: null,
      header: null,
      invertedHeader: null,
      payload: null
    };
  }
}

export function calculateRobustWatermarkCapacity(imageWidth: number, imageHeight: number) {
  return calculateRobustWatermarkCapacityV2(imageWidth, imageHeight);
}

export function embedRobustWatermark(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  payload: Uint8Array,
  options?: {
    referencePixelBytes?: Uint8ClampedArray;
    backgroundPixelBytes?: Uint8ClampedArray;
    excludedRects?: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  }
) {
  embedRobustWatermarkV2(pixelBytes, imageWidth, imageHeight, payload, options);
}

export function analyzeRobustWatermarkFrequency(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
) {
  try {
    extractRobustWatermarkV2WithDiagnostics(pixelBytes, imageWidth, imageHeight);
    return analyzeRobustWatermarkFrequencyV2(pixelBytes, imageWidth, imageHeight);
  } catch {
    try {
      extractRobustWatermarkV1WithDiagnostics(pixelBytes, imageWidth, imageHeight);
      return analyzeRobustWatermarkFrequencyV1(pixelBytes, imageWidth, imageHeight);
    } catch {
      return analyzeRobustWatermarkFrequencyV2(pixelBytes, imageWidth, imageHeight);
    }
  }
}

export function extractRobustWatermarkWithDiagnostics(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
) {
  try {
    return extractRobustWatermarkV2WithDiagnostics(pixelBytes, imageWidth, imageHeight);
  } catch {
    return extractRobustWatermarkV1WithDiagnostics(pixelBytes, imageWidth, imageHeight);
  }
}

export function extractRobustWatermark(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
) {
  return extractRobustWatermarkWithDiagnostics(pixelBytes, imageWidth, imageHeight).payload;
}

export function debugRobustWatermark(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
): RobustWatermarkDebugReport {
  const attempts = [
    debugRobustWatermarkV2(pixelBytes, imageWidth, imageHeight),
    debugRobustWatermarkV1(pixelBytes, imageWidth, imageHeight)
  ];
  const selectedAttempt = attempts.find((attempt) => attempt.ok) || null;
  const capacityBytes = (() => {
    try {
      return calculateRobustWatermarkCapacityV2(imageWidth, imageHeight, pixelBytes);
    } catch {
      return null;
    }
  })();
  const notes: string[] = [];
  const v2Attempt = attempts.find((attempt) => attempt.version === 2);

  if (v2Attempt?.header && !v2Attempt.ok) {
    if (v2Attempt.header.magicByteMatches > 0 && v2Attempt.header.magicByteMatches < v2Attempt.header.expectedMagic.length) {
      notes.push('V2 header has partial magic matches; carrier signal exists but header voting is corrupted.');
    } else if (v2Attempt.header.magicByteMatches === 0) {
      notes.push('V2 header magic has no byte matches; check write strength, polarity, or whether the image was exported before V2 embedding.');
    }

    if (
      v2Attempt.invertedHeader
      && v2Attempt.invertedHeader.magicByteMatches > v2Attempt.header.magicByteMatches
    ) {
      notes.push('Inverted V2 header has more magic matches than normal header; signal polarity may be reversed.');
    }
  }

  return {
    imageWidth,
    imageHeight,
    imageMegapixels: (imageWidth * imageHeight) / 1_000_000,
    selectedVersion: selectedAttempt?.version ?? null,
    capacityBytes,
    attempts,
    notes
  };
}
