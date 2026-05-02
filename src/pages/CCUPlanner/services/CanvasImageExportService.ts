import type { Edge, Node } from 'reactflow';
import { getBezierPath, Position } from 'reactflow';
import type { IntlShape } from 'react-intl';

import type {
  Ccu,
  CcuEdgeData,
  HangarItem,
  ImportItem,
  PriceHistoryEntity,
  Ship,
  WbHistoryData
} from '@/types';
import { CcuSourceType } from '@/types';
import { localizeShipStatus, localizeShipType } from '@/data/shipMetadataI18n';
import { getManufacturerLogoPath } from '@/data/rsiManufacturers';
import { getShipDisplayName } from '@/utils/shipDisplay';
import { getShipThumbLarge } from '@/utils/shipImage';

import { CcuSourceTypeStrategyFactory } from './CcuSourceTypeFactory';
import pathFinderService from './PathFinderService';
import {
  EXPORT_HEADER_HEIGHT,
  EXPORT_HORIZONTAL_PADDING,
  EXPORT_MAX_DIMENSION,
  EXPORT_MIN_HEIGHT,
  EXPORT_MIN_WIDTH,
  EXPORT_NODE_HANDLE_Y,
  EXPORT_NODE_HEIGHT,
  EXPORT_NODE_WIDTH,
  EXPORT_TARGET_SCALE,
  EXPORT_VERTICAL_PADDING,
  getExportFooterCardMetrics,
  type PreparedExportEdge,
  type PreparedExportExcludedRect,
  type PreparedExportFooterCard,
  type PreparedExportNode,
  type PreparedExportPayload,
  type RenderableImage,
  renderPreparedExportBackground,
  renderPreparedExportContent
} from './CanvasImageExportRenderer';
import type { FlowData } from './ImportExportService';
import routeImagePayloadService from './RouteImagePayloadService';
import { embedRobustWatermark } from './RobustImageWatermarkService';

const COLOR_CLASS_MAP: Record<string, string> = {
  'bg-blue-700': '#1d4ed8',
  'bg-cyan-500': '#06b6d4',
  'bg-fuchsia-600': '#c026d3',
  'bg-gray-500': '#6b7280',
  'bg-green-600': '#16a34a',
  'bg-indigo-600': '#4f46e5',
  'bg-lime-500': '#84cc16',
  'bg-orange-400': '#fb923c',
  'bg-purple-700': '#7e22ce',
  'stroke-blue-500': '#3b82f6',
  'stroke-cyan-300': '#67e8f9',
  'stroke-fuchsia-500': '#d946ef',
  'stroke-gray-500': '#6b7280',
  'stroke-green-400': '#4ade80',
  'stroke-indigo-500': '#6366f1',
  'stroke-lime-500': '#84cc16',
  'stroke-orange-400': '#fb923c',
  'stroke-purple-500': '#a855f7'
};

const EXPORT_WORKER_SUPPORTED = typeof Worker !== 'undefined'
  && typeof OffscreenCanvas !== 'undefined'
  && typeof createImageBitmap !== 'undefined';
const EXPORT_MIME_TYPE = 'image/jpeg';
const EXPORT_FILE_EXTENSION = 'jpg';
const EXPORT_JPEG_QUALITY = 0.95;
const EXPORT_FOOTER_LOGO_URL = `${import.meta.env.BASE_URL || '/'}logo.png`;
const EXPORT_FOOTER_MEDIA_MODE = 'logo' as "logo" | "none";

type ExportStage =
  | 'preparing'
  | 'loading_images'
  | 'rendering'
  | 'embedding'
  | 'encoding'
  | 'downloading';

interface NodeShipData {
  ship?: Ship;
}

export interface ExportCanvasImageOptions {
  nodes: Node<NodeShipData>[];
  edges: Edge<CcuEdgeData>[];
  startShipPrices: Record<string, number | string>;
  selectedPathEdgeIds: Set<string>;
  intl: IntlShape;
  routeName?: string;
  currency: string;
  exchangeRates: Record<string, number>;
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  hangarItems: HangarItem[];
  importItems: ImportItem[];
  priceHistoryMap: Record<number, PriceHistoryEntity>;
  onProgress?: (progress: CanvasImageExportProgress) => void;
}

export interface CanvasImageExportProgress {
  stage: ExportStage;
  progress: number;
  indeterminate?: boolean;
  message: string;
}

export interface CanvasImageExportResult {
  robustWatermarkEmbedded: boolean;
}

interface NodeRenderMetrics {
  width: number;
  height: number;
}

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

type WorkerResponseMessage = WorkerProgressMessage | WorkerSuccessMessage | WorkerErrorMessage;

interface ExportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ExportCanvasLimits {
  maxDimension: number;
  maxPixels: number;
}

const EXPORT_FALLBACK_MAX_PIXELS = 48_000_000;
const EXPORT_DESKTOP_MAX_DIMENSION = 16_384;
const EXPORT_DESKTOP_MAX_PIXELS = 96_000_000;
const EXPORT_HIGH_END_MAX_DIMENSION = 18_432;
const EXPORT_HIGH_END_MAX_PIXELS = 128_000_000;

let cachedExportCanvasLimits: ExportCanvasLimits | null = null;

function resolveColor(value: string, fallback: string) {
  return COLOR_CLASS_MAP[value] || fallback;
}

function isLikelyMobileDevice() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

function getNavigatorDeviceMemory() {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof memory === 'number' && Number.isFinite(memory) ? memory : undefined;
}

function resolveExportCanvasLimits() {
  if (cachedExportCanvasLimits) {
    return cachedExportCanvasLimits;
  }

  const deviceMemory = getNavigatorDeviceMemory();
  const isMobile = isLikelyMobileDevice();

  if (!isMobile && deviceMemory !== undefined && deviceMemory >= 8) {
    cachedExportCanvasLimits = {
      maxDimension: EXPORT_HIGH_END_MAX_DIMENSION,
      maxPixels: EXPORT_HIGH_END_MAX_PIXELS
    };
    return cachedExportCanvasLimits;
  }

  if (!isMobile && (deviceMemory === undefined || deviceMemory >= 4)) {
    cachedExportCanvasLimits = {
      maxDimension: Math.max(EXPORT_MAX_DIMENSION, EXPORT_DESKTOP_MAX_DIMENSION),
      maxPixels: EXPORT_DESKTOP_MAX_PIXELS
    };
    return cachedExportCanvasLimits;
  }

  cachedExportCanvasLimits = {
    maxDimension: EXPORT_MAX_DIMENSION,
    maxPixels: EXPORT_FALLBACK_MAX_PIXELS
  };
  return cachedExportCanvasLimits;
}

function rectsOverlap(left: ExportRect, right: ExportRect) {
  return !(
    left.x + left.width <= right.x
    || right.x + right.width <= left.x
    || left.y + left.height <= right.y
    || right.y + right.height <= left.y
  );
}

function estimatePreparedEdgeLabelRect(edge: PreparedExportEdge): ExportRect {
  return {
    x: edge.labelX - 92,
    y: edge.labelY - (edge.labelSavingsText ? 50 : 18),
    width: 184,
    height: edge.labelSavingsText ? 70 : 38
  };
}

function scaleExportRect(rect: ExportRect, scale: number): PreparedExportExcludedRect {
  return {
    x: Math.round(rect.x * scale),
    y: Math.round(rect.y * scale),
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale)
  };
}

function buildWatermarkExcludedRects(payload: Omit<PreparedExportPayload, 'watermarkExcludedRects'>): PreparedExportExcludedRect[] {
  const margin = 18;
  const rects: ExportRect[] = [
    {
      x: 0,
      y: 0,
      width: payload.width,
      height: EXPORT_HEADER_HEIGHT
    },
    ...payload.nodes.map((node) => ({
      x: node.x - margin,
      y: node.y - margin,
      width: node.width + margin * 2,
      height: node.height + margin * 2
    })),
    ...payload.edges.map((edge) => {
      const rect = estimatePreparedEdgeLabelRect(edge);
      return {
        x: rect.x - margin,
        y: rect.y - margin,
        width: rect.width + margin * 2,
        height: rect.height + margin * 2
      };
    })
  ];

  if (payload.footerCard) {
    rects.push({
      x: payload.footerCard.x - margin,
      y: payload.footerCard.y - margin,
      width: payload.footerCard.width + margin * 2,
      height: payload.footerCard.height + margin * 2
    });
  }

  return rects.map((rect) => scaleExportRect(rect, payload.scale));
}

function getNodeMetrics(node: Node): NodeRenderMetrics {
  return {
    width: typeof node.width === 'number' && node.width > 0 ? node.width : EXPORT_NODE_WIDTH,
    height: typeof node.height === 'number' && node.height > 0 ? node.height : EXPORT_NODE_HEIGHT
  };
}

function sanitizeFileNameSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'route';
}

function getProgressMessage(intl: IntlShape, stage: ExportStage) {
  switch (stage) {
    case 'preparing':
      return intl.formatMessage({ id: 'ccuPlanner.exportProgress.preparing', defaultMessage: 'Preparing export...' });
    case 'loading_images':
      return intl.formatMessage({ id: 'ccuPlanner.exportProgress.loadingImages', defaultMessage: 'Loading ship images...' });
    case 'rendering':
      return intl.formatMessage({ id: 'ccuPlanner.exportProgress.rendering', defaultMessage: 'Rendering image...' });
    case 'embedding':
      return intl.formatMessage({ id: 'ccuPlanner.exportProgress.embedding', defaultMessage: 'Embedding route data...' });
    case 'encoding':
      return intl.formatMessage({ id: 'ccuPlanner.exportProgress.encoding', defaultMessage: 'Encoding image...' });
    case 'downloading':
      return intl.formatMessage({ id: 'ccuPlanner.exportProgress.downloading', defaultMessage: 'Starting download...' });
  }
}

function reportProgress(
  options: ExportCanvasImageOptions,
  stage: ExportStage,
  progress: number,
  overrides?: Partial<CanvasImageExportProgress>
) {
  options.onProgress?.({
    stage,
    progress,
    indeterminate: false,
    message: getProgressMessage(options.intl, stage),
    ...overrides
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(link);
  }, 100);
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function toBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error('Canvas export returned an empty image.'));
    }, EXPORT_MIME_TYPE, EXPORT_JPEG_QUALITY);
  });
}

function isSvgAsset(url: string) {
  return /\.svg(?:[?#].*)?$/i.test(url);
}

async function loadSvgImageElement(url: string): Promise<HTMLImageElement | null> {
  return await new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function loadRenderableImage(url: string) {
  if (!url) {
    return null;
  }

  if (isSvgAsset(url)) {
    return await loadSvgImageElement(url);
  }

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

async function loadImagesOnMainThread(
  payload: PreparedExportPayload,
  options: ExportCanvasImageOptions
) {
  const imageUrls = Array.from(new Set([
    ...payload.nodes.flatMap((node) => [
      node.imageUrl,
      node.manufacturerLogoUrl || ''
    ]),
    payload.footerCard?.mediaUrl || ''
  ].filter(Boolean)));
  const imageMap = new Map<string, RenderableImage | null>();

  if (!imageUrls.length) {
    return imageMap;
  }

  for (let index = 0; index < imageUrls.length; index += 1) {
    const imageUrl = imageUrls[index];
    const image = await loadRenderableImage(imageUrl);
    imageMap.set(imageUrl, image);

    const progress = 10 + Math.round(((index + 1) / imageUrls.length) * 45);
    reportProgress(options, 'loading_images', progress);

    if (index % 2 === 1) {
      await yieldToBrowser();
    }
  }

  return imageMap;
}

function releaseRenderableImage(image: RenderableImage | null) {
  if (image && 'close' in image && typeof image.close === 'function') {
    image.close();
  }
}

function buildPreparedEdge(
  edge: Edge<CcuEdgeData>,
  options: ExportCanvasImageOptions,
  nodeMap: Map<string, Node<NodeShipData>>,
  strategyFactory: CcuSourceTypeStrategyFactory,
  offsetX: number,
  offsetY: number
): PreparedExportEdge | null {
  const sourceNode = nodeMap.get(edge.source);
  const targetNode = nodeMap.get(edge.target);

  if (!sourceNode || !targetNode || !edge.data?.sourceShip || !edge.data.targetShip) {
    return null;
  }

  const sourceMetrics = getNodeMetrics(sourceNode);
  const sourceType = edge.data.sourceType || CcuSourceType.OFFICIAL;
  const strategy = strategyFactory.getStrategy(sourceType);
  const strategyStyle = strategy.getEdgeStyle();
  const sourceTypeDisplay = strategy.getDisplayName(options.intl);
  const isCompleted = pathFinderService.isSingleEdgeInAnyCompletedPath(edge);
  const isSelected = options.selectedPathEdgeIds.has(edge.id);

  const { price, currency } = strategy.calculatePrice(edge.data.sourceShip, edge.data.targetShip, {
    ccus: options.ccus,
    wbHistory: options.wbHistory,
    hangarItems: options.hangarItems,
    importItems: options.importItems,
    currency: options.currency,
    customPrice: edge.data.customPrice,
    priceHistoryMap: options.priceHistoryMap
  });

  const officialUpgradePriceUsd = edge.data.targetShip.msrp && edge.data.sourceShip.msrp
    ? (edge.data.targetShip.msrp - edge.data.sourceShip.msrp) / 100
    : null;

  const priceForSavingsUsd = (() => {
    if (currency === 'USD') {
      return price;
    }

    const rate = options.exchangeRates[currency.toLowerCase()];
    if (!rate) {
      return null;
    }

    return price / rate;
  })();

  const savingsUsd = officialUpgradePriceUsd !== null && priceForSavingsUsd !== null
    ? officialUpgradePriceUsd - priceForSavingsUsd
    : null;
  const savingsPercent = officialUpgradePriceUsd && savingsUsd !== null && savingsUsd > 0
    ? Math.floor((savingsUsd / officialUpgradePriceUsd) * 100)
    : null;

  const labelSavingsText = savingsUsd !== null && savingsPercent !== null
    ? `Save ${savingsPercent}% (-${savingsUsd.toLocaleString(options.intl.locale, {
      style: 'currency',
      currency: 'USD'
    })})`
    : null;

  const labelMainText = price === 0 && edge.data.targetShip.msrp !== 0
    ? `! ${sourceTypeDisplay}`
    : `${sourceTypeDisplay} +${price.toLocaleString(options.intl.locale, {
      style: 'currency',
      currency
    })}`;

  const strokeColor = (() => {
    if (isCompleted) {
      return isSelected ? '#50fa7e' : '#4caf50';
    }
    if (isSelected) {
      return '#2196f3';
    }
    return resolveColor(strategyStyle.edgeColor, '#3b82f6');
  })();

  const labelMainFill = isCompleted
    ? '#16a34a'
    : price === 0 && edge.data.targetShip.msrp !== 0
      ? '#ef4444'
      : resolveColor(strategyStyle.bgColor, '#1d4ed8');

  const sourceX = sourceNode.position.x + sourceMetrics.width + offsetX;
  const sourceY = sourceNode.position.y + EXPORT_NODE_HANDLE_Y + offsetY;
  const targetX = targetNode.position.x + offsetX;
  const targetY = targetNode.position.y + EXPORT_NODE_HANDLE_Y + offsetY;

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: Position.Right,
    targetX,
    targetY,
    targetPosition: Position.Left
  });

  return {
    id: edge.id,
    path,
    strokeColor,
    lineDash: isCompleted ? [10, 8] : [],
    labelX,
    labelY,
    labelMainText,
    labelMainFill,
    labelSavingsText
  };
}

function buildPreparedPayload(options: ExportCanvasImageOptions): PreparedExportPayload {
  const nodeMap = new Map(options.nodes.map(node => [node.id, node]));
  const strategyFactory = CcuSourceTypeStrategyFactory.getInstance();

  const nodeBounds = options.nodes.reduce((acc, node) => {
    const metrics = getNodeMetrics(node);
    acc.minX = Math.min(acc.minX, node.position.x);
    acc.minY = Math.min(acc.minY, node.position.y);
    acc.maxX = Math.max(acc.maxX, node.position.x + metrics.width);
    acc.maxY = Math.max(acc.maxY, node.position.y + EXPORT_NODE_HEIGHT);
    return acc;
  }, {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  });

  const contentWidth = Math.max(1, nodeBounds.maxX - nodeBounds.minX);
  const contentHeight = Math.max(1, nodeBounds.maxY - nodeBounds.minY);
  const width = Math.max(EXPORT_MIN_WIDTH, Math.ceil(contentWidth + EXPORT_HORIZONTAL_PADDING * 2));
  const footerCardTitle = options.intl.formatMessage({
    id: 'ccuPlanner.exportFooter.title',
    defaultMessage: "Generated by Citizens' Hub"
  });
  const footerCardDescription = options.intl.formatMessage({
    id: 'ccuPlanner.exportFooter.description',
    defaultMessage: 'Import this image in CCU Planner, or open the planner with the link below.'
  });
  const footerCardUrl = options.intl.formatMessage({
    id: 'ccuPlanner.exportFooter.url',
    defaultMessage: 'citizenshub.app/ccu-planner'
  });
  const baseHeight = Math.max(
    EXPORT_MIN_HEIGHT,
    Math.ceil(contentHeight + EXPORT_HEADER_HEIGHT + EXPORT_VERTICAL_PADDING * 2)
  );
  const footerMetrics = getExportFooterCardMetrics(width, baseHeight);

  const offsetX = EXPORT_HORIZONTAL_PADDING - nodeBounds.minX;
  const offsetY = EXPORT_HEADER_HEIGHT + EXPORT_VERTICAL_PADDING - nodeBounds.minY;

  const preparedNodes: PreparedExportNode[] = options.nodes.flatMap((node) => {
    const ship = node.data?.ship;
    if (!ship) {
      return [];
    }

    const metrics = getNodeMetrics(node);
    return [{
      id: node.id,
      x: node.position.x + offsetX,
      y: node.position.y + offsetY,
      width: metrics.width,
      height: EXPORT_NODE_HEIGHT,
      imageUrl: getShipThumbLarge(ship) || '',
      manufacturerLogoUrl: getManufacturerLogoPath(ship.manufacturer) || '',
      shipName: getShipDisplayName(ship) || ship.name,
      manufacturerLine: `${ship.manufacturer.name} / ${localizeShipType(options.intl.locale, ship.type)}`,
      showWb: (ship.skus || []).some((sku) => sku.available && sku.price !== ship.msrp),
      statusBadgeText: ship.flyableStatus !== 'Flyable' ? localizeShipStatus(options.intl.locale, ship) : null,
      msrpText: (ship.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    }];
  });

  const preparedEdges = options.edges
    .map(edge => buildPreparedEdge(edge, options, nodeMap, strategyFactory, offsetX, offsetY))
    .filter((edge): edge is PreparedExportEdge => edge !== null);

  const maxNodeBottom = preparedNodes.reduce((max, node) => Math.max(max, node.y + node.height), 0);
  const maxEdgeBottom = preparedEdges.reduce((max, edge) => Math.max(max, edge.labelY + 20), 0);
  const contentBottom = Math.max(maxNodeBottom, maxEdgeBottom, EXPORT_HEADER_HEIGHT);
  const footerCardX = width - footerMetrics.pageMarginX - footerMetrics.cardWidth;
  const footerCardBaseY = baseHeight - footerMetrics.pageMarginY - footerMetrics.cardHeight;
  const footerCandidateRect: ExportRect = {
    x: footerCardX,
    y: footerCardBaseY,
    width: footerMetrics.cardWidth,
    height: footerMetrics.cardHeight
  };
  const footerIntersectsNode = preparedNodes.some((node) => rectsOverlap(footerCandidateRect, {
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height
  }));
  const footerIntersectsEdge = preparedEdges.some((edge) => rectsOverlap(footerCandidateRect, estimatePreparedEdgeLabelRect(edge)));
  const footerNeedsExtraSpace = footerIntersectsNode || footerIntersectsEdge;
  const footerTop = footerNeedsExtraSpace
    ? contentBottom + footerMetrics.contentGap
    : footerCardBaseY;
  const height = footerNeedsExtraSpace
    ? Math.max(baseHeight, Math.ceil(footerTop + footerMetrics.cardHeight + footerMetrics.pageMarginY))
    : baseHeight;
  const footerCard: PreparedExportFooterCard = {
    x: footerCardX,
    y: footerTop,
    width: footerMetrics.cardWidth,
    height: footerMetrics.cardHeight,
    mediaSize: footerMetrics.mediaSize,
    padding: footerMetrics.padding,
    gap: footerMetrics.gap,
    titleFontSize: footerMetrics.titleFontSize,
    bodyFontSize: footerMetrics.bodyFontSize,
    urlFontSize: footerMetrics.urlFontSize,
    title: footerCardTitle,
    description: footerCardDescription,
    url: footerCardUrl,
    mediaMode: EXPORT_FOOTER_MEDIA_MODE,
    mediaUrl: EXPORT_FOOTER_MEDIA_MODE === 'logo' ? EXPORT_FOOTER_LOGO_URL : null
  };
  const exportLimits = resolveExportCanvasLimits();
  const requiredPixelCount = width * height;
  const maxPixelScale = Math.sqrt(exportLimits.maxPixels / Math.max(requiredPixelCount, 1));
  const scaleLimit = Math.min(
    EXPORT_TARGET_SCALE,
    exportLimits.maxDimension / width,
    exportLimits.maxDimension / height,
    maxPixelScale
  );

  if (scaleLimit < 1) {
    throw new Error('Route export is too large for this device. Reduce the route size or export JSON instead.');
  }

  const preparedPayloadWithoutExclusions: Omit<PreparedExportPayload, 'watermarkExcludedRects'> = {
    width,
    height,
    scale: scaleLimit,
    title: options.routeName?.trim()
      || options.intl.formatMessage({ id: 'toolbar.export', defaultMessage: 'Export' }),
    subtitle: `${preparedNodes.length} ships / ${preparedEdges.length} routes`,
    exportedAt: new Date().toLocaleString(options.intl.locale, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }),
    nodes: preparedNodes,
    edges: preparedEdges,
    footerCard
  };

  return {
    ...preparedPayloadWithoutExclusions,
    watermarkExcludedRects: buildWatermarkExcludedRects(preparedPayloadWithoutExclusions)
  };
}

async function runWorkerExport(
  payload: PreparedExportPayload,
  routePayload: Uint8Array,
  options: ExportCanvasImageOptions
) {
  return await new Promise<{ blob: Blob; robustWatermarkEmbedded: boolean }>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/canvasImageExport.worker.ts', import.meta.url), {
      type: 'module'
    });

    const cleanup = () => {
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
      const message = event.data;

    if (message.type === 'progress') {
        reportProgress(
          options,
          message.stage,
          message.progress,
          message.stage === 'encoding'
            ? {
              indeterminate: true,
              progress: Math.max(90, message.progress)
            }
            : undefined
        );
        return;
      }

      if (message.type === 'error') {
        cleanup();
        reject(new Error(message.error));
        return;
      }

      cleanup();
      resolve({
        blob: message.blob,
        robustWatermarkEmbedded: message.robustWatermarkEmbedded
      });
    };

    worker.onerror = (error) => {
      cleanup();
      reject(new Error(error.message || 'Image export worker crashed.'));
    };

    const request: WorkerRenderRequest = {
      type: 'render',
      payload,
      routePayload: routePayload.buffer.slice(
        routePayload.byteOffset,
        routePayload.byteOffset + routePayload.byteLength
      ) as ArrayBuffer
    };

    worker.postMessage(request, [request.routePayload]);
  });
}

async function runMainThreadExport(
  payload: PreparedExportPayload,
  routePayload: Uint8Array,
  options: ExportCanvasImageOptions
) {
  const imageMap = await loadImagesOnMainThread(payload, options);
  await yieldToBrowser();

  reportProgress(options, 'rendering', 70);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(payload.width * payload.scale);
  canvas.height = Math.round(payload.height * payload.scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to initialize canvas context.');
  }

  ctx.scale(payload.scale, payload.scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  renderPreparedExportBackground(ctx, payload);
  renderPreparedExportContent(ctx, payload, imageMap);
  const referenceImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(payload.scale, payload.scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  renderPreparedExportBackground(ctx, payload);

  await yieldToBrowser();
  reportProgress(options, 'embedding', 82);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  embedRobustWatermark(imageData.data, canvas.width, canvas.height, routePayload, {
    referencePixelBytes: referenceImageData.data,
    backgroundPixelBytes: imageData.data,
    excludedRects: payload.watermarkExcludedRects
  });
  ctx.putImageData(imageData, 0, 0);
  renderPreparedExportContent(ctx, payload, imageMap);

  await yieldToBrowser();
  reportProgress(options, 'encoding', 90, {
    indeterminate: true
  });
  const blob = await toBlob(canvas);
  reportProgress(options, 'encoding', 98, {
    indeterminate: true
  });

  imageMap.forEach((image) => {
    releaseRenderableImage(image);
  });

  return {
    blob,
    robustWatermarkEmbedded: true
  };
}

export async function exportCanvasImage(options: ExportCanvasImageOptions): Promise<CanvasImageExportResult> {
  if (!options.nodes.length) {
    throw new Error('Canvas is empty.');
  }

  reportProgress(options, 'preparing', 5);
  await yieldToBrowser();
  const payload = buildPreparedPayload(options);
  const flowData: FlowData = {
    nodes: options.nodes,
    edges: options.edges,
    startShipPrices: options.startShipPrices
  };
  const routePayload = await routeImagePayloadService.encodeFlowData(flowData);

  reportProgress(options, 'preparing', 12);
  await yieldToBrowser();

  const containsSvgAssets = payload.nodes.some((node) => isSvgAsset(node.manufacturerLogoUrl || ''));
  const result = EXPORT_WORKER_SUPPORTED && !containsSvgAssets
    ? await runWorkerExport(payload, routePayload, options)
    : await runMainThreadExport(payload, routePayload, options);

  reportProgress(options, 'downloading', 100);

  const fileDate = new Date().toISOString().replace(/[:.]/g, '-');
  const routeNameSegment = sanitizeFileNameSegment(options.routeName || 'ccu-planner');
  downloadBlob(result.blob, `ccu-planner-${routeNameSegment}-${fileDate}.${EXPORT_FILE_EXTENSION}`);

  return {
    robustWatermarkEmbedded: result.robustWatermarkEmbedded
  };
}
