import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import routeImagePayloadService from '../src/pages/CCUPlanner/services/RouteImagePayloadService';
import {
  calculateRobustWatermarkCapacity,
  extractRobustWatermarkWithDiagnostics,
  embedRobustWatermark
} from '../src/pages/CCUPlanner/services/RobustImageWatermarkService';
import {
  EXPORT_HEADER_HEIGHT,
  EXPORT_HORIZONTAL_PADDING,
  EXPORT_MAX_DIMENSION,
  EXPORT_MIN_HEIGHT,
  EXPORT_MIN_WIDTH,
  EXPORT_NODE_HEIGHT,
  EXPORT_NODE_WIDTH,
  EXPORT_TARGET_SCALE,
  EXPORT_VERTICAL_PADDING
} from '../src/pages/CCUPlanner/services/CanvasImageExportRenderer';
import type { FlowData } from '../src/pages/CCUPlanner/services/ImportExportService';

const execFileAsync = promisify(execFile);

function getNodeBounds(flowData: FlowData) {
  return flowData.nodes.reduce((acc, node) => {
    const width = typeof node.width === 'number' && node.width > 0 ? node.width : EXPORT_NODE_WIDTH;
    const height = typeof node.height === 'number' && node.height > 0 ? node.height : EXPORT_NODE_HEIGHT;

    acc.minX = Math.min(acc.minX, node.position.x);
    acc.minY = Math.min(acc.minY, node.position.y);
    acc.maxX = Math.max(acc.maxX, node.position.x + width);
    acc.maxY = Math.max(acc.maxY, node.position.y + height);
    return acc;
  }, {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  });
}

function getPreparedCanvasSize(flowData: FlowData, maxDimension = EXPORT_MAX_DIMENSION) {
  const bounds = getNodeBounds(flowData);
  const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
  const width = Math.max(EXPORT_MIN_WIDTH, Math.ceil(contentWidth + EXPORT_HORIZONTAL_PADDING * 2));
  const baseHeight = Math.max(
    EXPORT_MIN_HEIGHT,
    Math.ceil(contentHeight + EXPORT_HEADER_HEIGHT + EXPORT_VERTICAL_PADDING * 2)
  );
  const scale = Math.max(
    Math.min(
      EXPORT_TARGET_SCALE,
      maxDimension / width,
      maxDimension / baseHeight
    ),
    1
  );

  return {
    width,
    height: baseHeight,
    scale,
    scaledWidth: Math.round(width * scale),
    scaledHeight: Math.round(baseHeight * scale)
  };
}

function fillSyntheticPlannerLikeBackground(pixelBytes: Uint8ClampedArray, width: number, height: number) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = (y * width + x) * 4;
      let value = 245;

      if (x % 96 === 48 && y % 96 === 48) {
        value = 56;
      } else if ((x + y) % 61 === 0) {
        value = 236;
      }

      pixelBytes[pixelIndex] = value;
      pixelBytes[pixelIndex + 1] = value;
      pixelBytes[pixelIndex + 2] = value;
      pixelBytes[pixelIndex + 3] = 255;
    }
  }
}

async function runJpegRoundTrip(pixelBytes: Uint8ClampedArray, width: number, height: number, quality: number) {
  const tempPrefix = path.join(os.tmpdir(), `route-watermark-${process.pid}-${Date.now()}`);
  const inputRawPath = `${tempPrefix}.input.rgba`;
  const jpegPath = `${tempPrefix}.jpg`;
  const outputRawPath = `${tempPrefix}.output.rgba`;

  await fs.writeFile(inputRawPath, Buffer.from(pixelBytes.buffer, pixelBytes.byteOffset, pixelBytes.byteLength));

  try {
    await execFileAsync('convert', [
      '-size',
      `${width}x${height}`,
      '-depth',
      '8',
      `rgba:${inputRawPath}`,
      '-quality',
      String(quality),
      jpegPath
    ]);
    await execFileAsync('convert', [
      jpegPath,
      '-depth',
      '8',
      `rgba:${outputRawPath}`
    ]);

    const outputBytes = await fs.readFile(outputRawPath);
    return new Uint8ClampedArray(outputBytes.buffer, outputBytes.byteOffset, outputBytes.byteLength);
  } finally {
    await Promise.allSettled([
      fs.rm(inputRawPath, { force: true }),
      fs.rm(jpegPath, { force: true }),
      fs.rm(outputRawPath, { force: true })
    ]);
  }
}

async function decodeWatermark(pixelBytes: Uint8ClampedArray, width: number, height: number) {
  try {
    const extracted = extractRobustWatermarkWithDiagnostics(pixelBytes, width, height);
    const inspection = await routeImagePayloadService.inspectPayload(extracted.payload);
    return {
      ok: true,
      extractedPayloadLength: extracted.payload.byteLength,
      diagnostics: extracted.diagnostics,
      routeSummary: inspection.summary
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main() {
  const raw = JSON.parse(await fs.readFile('../route.json', 'utf8')) as {
    tabs?: Array<{ flowData?: FlowData }>;
  };
  const flowData = raw.tabs?.[0]?.flowData;

  if (!flowData) {
    throw new Error('No flowData found in ../route.json');
  }

  const payload = await routeImagePayloadService.encodeFlowData(flowData);
  const cases = [];

  for (const maxDimension of [12_288, 16_384, 18_432]) {
    const canvasSize = getPreparedCanvasSize(flowData, maxDimension);
    const capacity = calculateRobustWatermarkCapacity(canvasSize.scaledWidth, canvasSize.scaledHeight);
    const pixels = new Uint8ClampedArray(canvasSize.scaledWidth * canvasSize.scaledHeight * 4);
    fillSyntheticPlannerLikeBackground(pixels, canvasSize.scaledWidth, canvasSize.scaledHeight);
    embedRobustWatermark(pixels, canvasSize.scaledWidth, canvasSize.scaledHeight, payload);

    const memoryDecodeSummary = await decodeWatermark(pixels, canvasSize.scaledWidth, canvasSize.scaledHeight);
    let jpegDecodeSummary: Record<string, unknown>;

    try {
      const jpegPixels = await runJpegRoundTrip(pixels, canvasSize.scaledWidth, canvasSize.scaledHeight, 96);
      jpegDecodeSummary = await decodeWatermark(jpegPixels, canvasSize.scaledWidth, canvasSize.scaledHeight);
    } catch (error) {
      jpegDecodeSummary = {
        ok: false,
        skipped: true,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    cases.push({
      maxDimension,
      canvasSize,
      capacity,
      capacityMargin: capacity - payload.byteLength,
      memoryDecodeSummary,
      jpegDecodeSummary
    });
  }

  console.log(JSON.stringify({
    nodeCount: flowData.nodes.length,
    edgeCount: flowData.edges.length,
    startShipPriceCount: Object.keys(flowData.startShipPrices).length,
    payloadLength: payload.byteLength,
    cases
  }, null, 2));
}

void main();
