export const EXPORT_HEADER_HEIGHT = 148;
export const EXPORT_HORIZONTAL_PADDING = 112;
export const EXPORT_VERTICAL_PADDING = 104;
export const EXPORT_MIN_WIDTH = 960;
export const EXPORT_MIN_HEIGHT = 640;
export const EXPORT_MAX_DIMENSION = 12288;
export const EXPORT_TARGET_SCALE = 3;

export const EXPORT_NODE_WIDTH = 256;
export const EXPORT_NODE_HEIGHT = 284;
export const EXPORT_NODE_RADIUS = 8;
export const EXPORT_NODE_IMAGE_HEIGHT = 120;
export const EXPORT_NODE_IMAGE_RADIUS = 3;
export const EXPORT_NODE_HANDLE_Y = 158;
export const EXPORT_NODE_HANDLE_RADIUS = 7;
export const EXPORT_MANUFACTURER_WATERMARK_WIDTH = 128;
export const EXPORT_MANUFACTURER_WATERMARK_HEIGHT = 86;
export const EXPORT_MANUFACTURER_WATERMARK_MARGIN = 20;

const FONT_FAMILY = '"Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif';
export const EXPORT_BACKGROUND_DOT_GAP = 48;

export interface PreparedExportNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  imageUrl: string;
  manufacturerLogoUrl?: string;
  shipName: string;
  manufacturerLine: string;
  showWb: boolean;
  statusBadgeText: string | null;
  msrpText: string;
}

export interface PreparedExportEdge {
  id: string;
  path: string;
  strokeColor: string;
  lineDash: number[];
  labelX: number;
  labelY: number;
  labelMainText: string;
  labelMainFill: string;
  labelSavingsText: string | null;
}

export type ExportFooterMediaMode = 'logo' | 'none';

export interface PreparedExportFooterCard {
  x: number;
  y: number;
  width: number;
  height: number;
  mediaSize: number;
  padding: number;
  gap: number;
  titleFontSize: number;
  bodyFontSize: number;
  urlFontSize: number;
  title: string;
  description: string;
  url: string;
  mediaMode: ExportFooterMediaMode;
  mediaUrl: string | null;
}

export interface PreparedExportExcludedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportFooterCardMetrics {
  cardWidth: number;
  cardHeight: number;
  mediaSize: number;
  padding: number;
  gap: number;
  radius: number;
  pageMarginX: number;
  pageMarginY: number;
  contentGap: number;
  titleFontSize: number;
  bodyFontSize: number;
  urlFontSize: number;
}

export interface PreparedExportPayload {
  width: number;
  height: number;
  scale: number;
  title: string;
  subtitle: string;
  exportedAt: string;
  nodes: PreparedExportNode[];
  edges: PreparedExportEdge[];
  footerCard: PreparedExportFooterCard | null;
  watermarkExcludedRects: PreparedExportExcludedRect[];
}

export type RenderableImage = CanvasImageSource & {
  width: number;
  height: number;
};

type ExportCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

type PatternSurface = OffscreenCanvas | HTMLCanvasElement;

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getExportFooterCardMetrics(width: number, height: number): ExportFooterCardMetrics {
  const widthScale = Math.max(1, width / EXPORT_MIN_WIDTH);
  const heightScale = Math.max(1, height / EXPORT_MIN_HEIGHT);
  const pageMarginX = Math.round(clampNumber(24 * Math.pow(widthScale, 0.34), 24, 76));
  const pageMarginY = Math.round(clampNumber(24 * Math.pow(heightScale, 0.34), 24, 76));
  const contentGap = Math.round(clampNumber(20 * Math.pow(heightScale, 0.32), 20, 68));
  const padding = Math.round(clampNumber(16 * Math.pow(widthScale, 0.3), 16, 44));
  const gap = Math.round(clampNumber(18 * Math.pow(widthScale, 0.28), 18, 40));
  const mediaSize = Math.round(clampNumber(Math.min(width * 0.1, height * 0.24), 112, 360));
  const titleFontSize = Math.round(clampNumber(32 * Math.pow(widthScale, 0.5), 32, 72));
  const bodyFontSize = Math.round(clampNumber(12 * Math.pow(widthScale, 0.38), 12, 24));
  const urlFontSize = Math.round(clampNumber(12 * Math.pow(widthScale, 0.34), 12, 22));
  const textColumnWidth = Math.round(clampNumber(width * 0.28, 320, 640));
  const cardWidth = Math.round((padding * 2) + mediaSize + gap + textColumnWidth);
  const titleLineHeight = Math.round(titleFontSize * 1.2);
  const bodyLineHeight = Math.round(bodyFontSize * 1.45);
  const urlLineHeight = Math.round(urlFontSize * 1.3);
  const titleGap = Math.round(Math.max(8, bodyFontSize * 0.45));
  const urlGap = Math.round(Math.max(8, urlFontSize * 0.55));
  const textBlockHeight = titleLineHeight + titleGap + (bodyLineHeight * 3) + urlGap + urlLineHeight;

  return {
    cardWidth,
    cardHeight: Math.round(Math.max(mediaSize + padding * 2, textBlockHeight + padding * 2)),
    mediaSize,
    padding,
    gap,
    radius: 18,
    pageMarginX,
    pageMarginY,
    contentGap,
    titleFontSize,
    bodyFontSize,
    urlFontSize
  };
}

function createPatternSurface(size: number): PatternSurface {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(size, size);
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function getPatternContext(surface: PatternSurface): ExportCanvasContext | null {
  return surface.getContext('2d') as ExportCanvasContext | null;
}

function hashNoise(x: number, y: number) {
  let value = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

function createTexturePattern(ctx: ExportCanvasContext) {
  const textureSurface = createPatternSurface(96);
  const textureCtx = getPatternContext(textureSurface);

  if (!textureCtx) {
    return null;
  }

  textureCtx.clearRect(0, 0, textureSurface.width, textureSurface.height);

  for (let y = 0; y < textureSurface.height; y += 2) {
    for (let x = 0; x < textureSurface.width; x += 2) {
      const noise = hashNoise(x, y);

      if (noise > 0.78) {
        textureCtx.fillStyle = `rgba(15, 23, 42, ${0.03 + ((noise - 0.78) * 0.12)})`;
        textureCtx.fillRect(x, y, 1, 1);
      } else if (noise < 0.04) {
        textureCtx.fillStyle = `rgba(255, 255, 255, ${0.02 + ((0.04 - noise) * 0.18)})`;
        textureCtx.fillRect(x, y, 1, 1);
      }
    }
  }

  textureCtx.strokeStyle = 'rgba(15, 23, 42, 0.018)';
  textureCtx.lineWidth = 1;
  for (let offset = -textureSurface.height; offset < textureSurface.width; offset += 12) {
    textureCtx.beginPath();
    textureCtx.moveTo(offset, 0);
    textureCtx.lineTo(offset + textureSurface.height, textureSurface.height);
    textureCtx.stroke();
  }

  return ctx.createPattern(textureSurface, 'repeat');
}

function createRoundedRectPath(
  ctx: ExportCanvasContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const normalizedRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + normalizedRadius, y);
  ctx.lineTo(x + width - normalizedRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + normalizedRadius);
  ctx.lineTo(x + width, y + height - normalizedRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - normalizedRadius, y + height);
  ctx.lineTo(x + normalizedRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - normalizedRadius);
  ctx.lineTo(x, y + normalizedRadius);
  ctx.quadraticCurveTo(x, y, x + normalizedRadius, y);
  ctx.closePath();
}

function drawRoundedRect(
  ctx: ExportCanvasContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string
) {
  createRoundedRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function fillRectWithPattern(
  ctx: ExportCanvasContext,
  x: number,
  y: number,
  width: number,
  height: number,
  pattern: CanvasPattern | null,
  opacity = 1
) {
  if (!pattern || width <= 0 || height <= 0) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = pattern;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

function drawDotGrid(ctx: ExportCanvasContext, width: number, height: number, gap: number) {
  ctx.save();
  ctx.fillStyle = '#a3a3a3';

  for (let y = gap / 2; y <= height; y += gap) {
    for (let x = gap / 2; x <= width; x += gap) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function splitTextIntoLines(
  ctx: ExportCanvasContext,
  text: string,
  maxWidth: number,
  maxLines: number
) {
  if (!text) {
    return [''];
  }

  const lines: string[] = [];
  let currentLine = '';

  for (const char of text) {
    const nextLine = `${currentLine}${char}`;
    if (ctx.measureText(nextLine).width <= maxWidth || currentLine.length === 0) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = char;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  const consumedLength = lines.reduce((sum, line) => sum + line.length, 0);
  const remainingText = text.slice(consumedLength);
  if (lines.length < maxLines && currentLine) {
    lines.push(currentLine);
  }

  if (remainingText.length > (lines[lines.length - 1]?.length || 0)) {
    let truncated = lines[lines.length - 1] || '';
    while (truncated.length > 0 && ctx.measureText(`${truncated}...`).width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    lines[lines.length - 1] = `${truncated}...`;
  }

  return lines.slice(0, maxLines);
}

function drawTextLines(
  ctx: ExportCanvasContext,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  color: string
) {
  ctx.fillStyle = color;
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

function drawPill(
  ctx: ExportCanvasContext,
  x: number,
  y: number,
  text: string,
  options: {
    fillStyle: string;
    textColor: string;
    font: string;
    horizontalPadding?: number;
    height?: number;
    radius?: number;
  }
) {
  const horizontalPadding = options.horizontalPadding ?? 10;
  const height = options.height ?? 28;
  const radius = options.radius ?? 999;

  ctx.save();
  ctx.font = options.font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const textWidth = ctx.measureText(text).width;
  const width = textWidth + horizontalPadding * 2;

  ctx.shadowColor = 'rgba(15, 23, 42, 0.16)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  drawRoundedRect(ctx, x, y, width, height, radius, options.fillStyle);
  ctx.shadowColor = 'transparent';

  ctx.fillStyle = options.textColor;
  ctx.fillText(text, x + horizontalPadding, y + height / 2 + 0.5);
  ctx.restore();

  return width;
}

function parseBezierPath(path: string) {
  const values = path.match(/-?\d*\.?\d+/g)?.map(Number) || [];
  if (values.length < 8) {
    return null;
  }

  return {
    startX: values[0],
    startY: values[1],
    c1x: values[2],
    c1y: values[3],
    c2x: values[4],
    c2y: values[5],
    endX: values[6],
    endY: values[7]
  };
}

function strokeBezierPath(ctx: ExportCanvasContext, path: string) {
  try {
    ctx.stroke(new Path2D(path));
    return;
  } catch {
    const parsed = parseBezierPath(path);
    if (!parsed) {
      return;
    }

    ctx.beginPath();
    ctx.moveTo(parsed.startX, parsed.startY);
    ctx.bezierCurveTo(parsed.c1x, parsed.c1y, parsed.c2x, parsed.c2y, parsed.endX, parsed.endY);
    ctx.stroke();
  }
}

function drawArrowHead(
  ctx: ExportCanvasContext,
  path: string,
  fillStyle: string
) {
  const parsedPath = parseBezierPath(path);
  if (!parsedPath) {
    return;
  }

  const angle = Math.atan2(parsedPath.endY - parsedPath.c2y, parsedPath.endX - parsedPath.c2x);
  const size = 12;

  ctx.save();
  ctx.translate(parsedPath.endX, parsedPath.endY);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, size / 2);
  ctx.lineTo(-size, -size / 2);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.restore();
}

function drawNodeImage(
  ctx: ExportCanvasContext,
  x: number,
  y: number,
  width: number,
  image: RenderableImage | null,
  shipName: string
) {
  ctx.save();
  createRoundedRectPath(ctx, x, y, width, EXPORT_NODE_IMAGE_HEIGHT, EXPORT_NODE_IMAGE_RADIUS);
  ctx.clip();

  if (image) {
    const imageAspect = image.width / image.height;
    const targetAspect = width / EXPORT_NODE_IMAGE_HEIGHT;

    let drawWidth = width;
    let drawHeight = EXPORT_NODE_IMAGE_HEIGHT;
    let drawX = x;
    let drawY = y;

    if (imageAspect > targetAspect) {
      drawHeight = EXPORT_NODE_IMAGE_HEIGHT;
      drawWidth = EXPORT_NODE_IMAGE_HEIGHT * imageAspect;
      drawX = x - (drawWidth - width) / 2;
    } else {
      drawWidth = width;
      drawHeight = width / imageAspect;
      drawY = y - (drawHeight - EXPORT_NODE_IMAGE_HEIGHT) / 2;
    }

    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  } else {
    const gradient = ctx.createLinearGradient(x, y, x + width, y + EXPORT_NODE_IMAGE_HEIGHT);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, EXPORT_NODE_IMAGE_HEIGHT);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.font = `700 18px ${FONT_FAMILY}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(shipName.slice(0, 22), x + 18, y + EXPORT_NODE_IMAGE_HEIGHT / 2);
  }

  const overlay = ctx.createLinearGradient(x, y + EXPORT_NODE_IMAGE_HEIGHT - 36, x, y + EXPORT_NODE_IMAGE_HEIGHT);
  overlay.addColorStop(0, 'rgba(15, 23, 42, 0)');
  overlay.addColorStop(1, 'rgba(15, 23, 42, 0.45)');
  ctx.fillStyle = overlay;
  ctx.fillRect(x, y, width, EXPORT_NODE_IMAGE_HEIGHT);
  ctx.restore();
}

function drawManufacturerLogoWatermark(
  ctx: ExportCanvasContext,
  x: number,
  y: number,
  width: number,
  height: number,
  image: RenderableImage | null
) {
  if (!image) {
    return;
  }

  ctx.save();
  const imageAspect = image.width / image.height;
  const targetAspect = width / height;

  let drawWidth = width;
  let drawHeight = height;
  let drawX = x;
  let drawY = y;

  if (imageAspect > targetAspect) {
    drawHeight = width / imageAspect;
    drawY += height - drawHeight;
  } else {
    drawWidth = height * imageAspect;
    drawX += width - drawWidth;
  }

  ctx.globalAlpha = 0.18;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  ctx.restore();
}

function drawFooterMedia(
  ctx: ExportCanvasContext,
  x: number,
  y: number,
  size: number,
  image: RenderableImage | null
) {
  if (!image || size <= 0) {
    return;
  }

  const inset = Math.round(size * 0.08);
  const targetX = x + inset;
  const targetY = y + inset;
  const targetWidth = Math.max(1, size - (inset * 2));
  const targetHeight = Math.max(1, size - (inset * 2));
  const imageAspect = image.width / image.height;
  const targetAspect = targetWidth / targetHeight;

  let drawWidth = targetWidth;
  let drawHeight = targetHeight;
  let drawX = targetX;
  let drawY = targetY;

  if (imageAspect > targetAspect) {
    drawHeight = targetWidth / imageAspect;
    drawY += (targetHeight - drawHeight) / 2;
  } else {
    drawWidth = targetHeight * imageAspect;
    drawX += (targetWidth - drawWidth) / 2;
  }

  ctx.save();
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  ctx.restore();
}

interface FooterCardLayout {
  titleFontSize: number;
  bodyFontSize: number;
  urlFontSize: number;
  titleLineHeight: number;
  bodyLineHeight: number;
  urlLineHeight: number;
  titleGap: number;
  urlGap: number;
  mediaSize: number;
  mediaGap: number;
  titleLines: string[];
  bodyLines: string[];
  textBlockWidth: number;
  textBlockHeight: number;
}

function measureFooterCardLayout(
  ctx: ExportCanvasContext,
  footerCard: PreparedExportFooterCard,
  scale: number,
  availableContentWidth: number,
  showMedia: boolean
): FooterCardLayout {
  const bodyFontSize = Math.max(12, Math.round(footerCard.bodyFontSize * scale));
  const urlFontSize = Math.max(12, Math.round(footerCard.urlFontSize * scale));
  const mediaSize = showMedia ? Math.max(48, Math.round(footerCard.mediaSize * scale)) : 0;
  const mediaGap = showMedia ? Math.max(12, Math.round(footerCard.gap * scale)) : 0;
  const maxTextWidth = Math.max(120, availableContentWidth - mediaSize - mediaGap);
  const minimumTitleFontSize = Math.max(bodyFontSize + 8, Math.round(bodyFontSize * 1.45));

  let titleFontSize = Math.max(minimumTitleFontSize, Math.round(footerCard.titleFontSize * scale));
  ctx.font = `800 ${titleFontSize}px ${FONT_FAMILY}`;
  while (titleFontSize > minimumTitleFontSize && ctx.measureText(footerCard.title).width > maxTextWidth) {
    titleFontSize -= 1;
    ctx.font = `800 ${titleFontSize}px ${FONT_FAMILY}`;
  }

  const titleLineHeight = Math.round(titleFontSize * 1.2);
  const titleLines = [footerCard.title];
  const titleWidths = [ctx.measureText(footerCard.title).width];

  ctx.font = `500 ${bodyFontSize}px ${FONT_FAMILY}`;
  const bodyLines = splitTextIntoLines(ctx, footerCard.description, maxTextWidth, 3);
  const bodyWidths = bodyLines.map(line => ctx.measureText(line).width);

  ctx.font = `600 ${urlFontSize}px ${FONT_FAMILY}`;
  const urlWidth = ctx.measureText(footerCard.url).width;
  const textBlockWidth = Math.max(urlWidth, ...titleWidths, ...bodyWidths);
  const titleGap = Math.round(Math.max(8, bodyFontSize * 0.45));
  const bodyLineHeight = Math.round(bodyFontSize * 1.45);
  const urlGap = Math.round(Math.max(8, urlFontSize * 0.55));
  const urlLineHeight = Math.round(urlFontSize * 1.3);
  const textBlockHeight = (titleLines.length * titleLineHeight)
    + titleGap
    + (bodyLines.length * bodyLineHeight)
    + urlGap
    + urlLineHeight;

  return {
    titleFontSize,
    bodyFontSize,
    urlFontSize,
    titleLineHeight,
    bodyLineHeight,
    urlLineHeight,
    titleGap,
    urlGap,
    mediaSize,
    mediaGap,
    titleLines,
    bodyLines,
    textBlockWidth,
    textBlockHeight
  };
}

function drawHeader(ctx: ExportCanvasContext, payload: PreparedExportPayload) {
  const widthScale = Math.max(1, payload.width / EXPORT_MIN_WIDTH);
  const marginX = Math.round(Math.max(56, Math.min(132, 56 * Math.pow(widthScale, 0.72))));
  const titleFontSize = Math.round(Math.max(28, Math.min(56, 28 * Math.pow(widthScale, 0.78))));
  const subtitleFontSize = Math.round(Math.max(14, Math.min(26, 14 * Math.pow(widthScale, 0.72))));
  const exportedAtFontSize = Math.round(Math.max(13, Math.min(22, 13 * Math.pow(widthScale, 0.68))));
  const titleLineHeight = Math.round(titleFontSize * 1.14);
  const subtitleLineHeight = Math.round(subtitleFontSize * 1.35);
  const topPadding = Math.round(clampNumber(38 * Math.pow(widthScale, 0.2), 38, 54));
  const titleGap = Math.round(Math.max(8, titleFontSize * 0.22));
  const availableLeftWidth = Math.max(240, payload.width - (marginX * 2) - Math.max(240, payload.width * 0.26));

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${titleFontSize}px ${FONT_FAMILY}`;
  const titleLines = splitTextIntoLines(ctx, payload.title, availableLeftWidth, 2);
  drawTextLines(ctx, titleLines, marginX, topPadding, titleLineHeight, '#0f172a');

  ctx.fillStyle = '#475569';
  ctx.font = `500 ${subtitleFontSize}px ${FONT_FAMILY}`;
  const subtitleY = topPadding + (titleLines.length * titleLineHeight) + titleGap;
  const subtitleLines = splitTextIntoLines(ctx, payload.subtitle, availableLeftWidth, 2);
  drawTextLines(ctx, subtitleLines, marginX, subtitleY, subtitleLineHeight, '#475569');

  const exportedAtY = topPadding + Math.round(Math.max(2, exportedAtFontSize * 0.12));
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = `500 ${exportedAtFontSize}px ${FONT_FAMILY}`;
  ctx.fillText(payload.exportedAt, payload.width - marginX, exportedAtY);
  ctx.restore();
}

function drawExportFooterCard(
  ctx: ExportCanvasContext,
  footerCard: PreparedExportFooterCard,
  mediaImage: RenderableImage | null
) {
  const availableContentWidth = footerCard.width - (footerCard.padding * 2);
  const contentHeight = footerCard.height - (footerCard.padding * 2);
  const contentTop = footerCard.y + footerCard.padding;
  const showMedia = footerCard.mediaMode === 'logo' && mediaImage !== null;

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  let layoutScale = 1;
  let layout = measureFooterCardLayout(ctx, footerCard, layoutScale, availableContentWidth, showMedia);

  if (showMedia) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const totalWidth = layout.textBlockWidth + layout.mediaGap + layout.mediaSize;
      if (totalWidth <= availableContentWidth) {
        break;
      }

      const nextScale = Math.max(0.64, layoutScale * (availableContentWidth / totalWidth));
      if (nextScale >= layoutScale - 0.01) {
        break;
      }

      layoutScale = nextScale;
      layout = measureFooterCardLayout(ctx, footerCard, layoutScale, availableContentWidth, showMedia);
    }
  }

  const textStartY = contentTop + Math.max(0, (contentHeight - layout.textBlockHeight) / 2);
  const mediaX = footerCard.x + footerCard.width - footerCard.padding - layout.mediaSize;
  const mediaY = contentTop + Math.max(0, (contentHeight - layout.mediaSize) / 2);
  const textRight = showMedia
    ? mediaX - layout.mediaGap
    : footerCard.x + footerCard.width - footerCard.padding;
  const textX = Math.max(footerCard.x + footerCard.padding, textRight - layout.textBlockWidth);

  if (showMedia) {
    drawFooterMedia(ctx, mediaX, mediaY, layout.mediaSize, mediaImage);
  }

  ctx.font = `800 ${layout.titleFontSize}px ${FONT_FAMILY}`;
  drawTextLines(ctx, layout.titleLines, textX, textStartY, layout.titleLineHeight, '#0f172a');

  const bodyY = textStartY + (layout.titleLines.length * layout.titleLineHeight) + layout.titleGap;
  ctx.font = `500 ${layout.bodyFontSize}px ${FONT_FAMILY}`;
  drawTextLines(ctx, layout.bodyLines, textX, bodyY, layout.bodyLineHeight, '#475569');

  const urlY = bodyY + (layout.bodyLines.length * layout.bodyLineHeight) + layout.urlGap;
  ctx.font = `600 ${layout.urlFontSize}px ${FONT_FAMILY}`;
  drawTextLines(ctx, [footerCard.url], textX, urlY, layout.urlLineHeight, '#2563eb');
  ctx.restore();
}

function drawEdgeLabel(
  ctx: ExportCanvasContext,
  edge: PreparedExportEdge
) {
  ctx.save();
  ctx.textAlign = 'center';

  if (edge.labelSavingsText) {
    ctx.font = `700 12px ${FONT_FAMILY}`;
    // const savingsWidth = ctx.measureText(edge.labelSavingsText).width + 24;
    // drawRoundedRect(ctx, edge.labelX - savingsWidth / 2, edge.labelY - 42, savingsWidth, 24, 6, '#fef3c7');
    ctx.fillStyle = '#ffd35c';
    ctx.textBaseline = 'middle';
    ctx.fillText(edge.labelSavingsText, edge.labelX, edge.labelY - 30);
  }

  ctx.font = `700 13px ${FONT_FAMILY}`;
  const mainWidth = ctx.measureText(edge.labelMainText).width + 28;
  ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  drawRoundedRect(ctx, edge.labelX - mainWidth / 2, edge.labelY - 14, mainWidth, 30, 6, edge.labelMainFill);
  ctx.shadowColor = 'transparent';

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(edge.labelMainText, edge.labelX, edge.labelY + 1);
  ctx.restore();
}

function drawNodeCard(
  ctx: ExportCanvasContext,
  node: PreparedExportNode,
  image: RenderableImage | null,
  manufacturerLogo: RenderableImage | null
) {
  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.10)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  drawRoundedRect(ctx, node.x, node.y, node.width, node.height, EXPORT_NODE_RADIUS, '#ffffff');
  ctx.shadowColor = 'transparent';

  ctx.save();
  createRoundedRectPath(ctx, node.x, node.y, node.width, node.height, EXPORT_NODE_RADIUS);
  ctx.clip();
  ctx.fillStyle = '#f9fafb';
  ctx.fillRect(node.x, node.y, node.width, node.height);
  ctx.restore();

  ctx.strokeStyle = '#93c5fd';
  ctx.lineWidth = 2;
  createRoundedRectPath(ctx, node.x, node.y, node.width, node.height, EXPORT_NODE_RADIUS);
  ctx.stroke();

  drawNodeImage(ctx, node.x + 16, node.y + 16, node.width - 32, image, node.shipName);

  let chipX = node.x + node.width - 28;
  const chipY = node.y + 26;

  if (node.showWb) {
    ctx.font = `700 12px ${FONT_FAMILY}`;
    const wbWidth = drawPill(ctx, chipX - ctx.measureText('WB').width - 20, chipY, 'WB', {
      fillStyle: '#fb923c',
      textColor: '#ffffff',
      font: `700 12px ${FONT_FAMILY}`,
      horizontalPadding: 10,
      height: 24,
      radius: 4
    });
    chipX -= wbWidth + 8;
  }

  if (node.statusBadgeText) {
    ctx.font = `700 12px ${FONT_FAMILY}`;
    const statusWidth = ctx.measureText(node.statusBadgeText).width + 20;
    drawPill(ctx, chipX - statusWidth, chipY, node.statusBadgeText, {
      fillStyle: '#38bdf8',
      textColor: '#ffffff',
      font: `700 12px ${FONT_FAMILY}`,
      horizontalPadding: 10,
      height: 24,
      radius: 4
    });
  }

  ctx.fillStyle = '#0f172a';
  ctx.font = `700 22px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const titleLines = splitTextIntoLines(ctx, node.shipName, node.width - 40, 2);
  drawTextLines(ctx, titleLines, node.x + 18, node.y + 154, 26, '#0f172a');

  ctx.font = `500 13px ${FONT_FAMILY}`;
  const metaLines = splitTextIntoLines(ctx, node.manufacturerLine, node.width - 40, 2);
  drawTextLines(ctx, metaLines, node.x + 18, node.y + 204, 18, '#64748b');

  ctx.fillStyle = '#60a5fa';
  ctx.font = `700 18px ${FONT_FAMILY}`;
  ctx.fillText(node.msrpText, node.x + 18, node.y + 244);

  ctx.save();
  createRoundedRectPath(ctx, node.x, node.y, node.width, node.height, EXPORT_NODE_RADIUS);
  ctx.clip();
  drawManufacturerLogoWatermark(
    ctx,
    node.x + node.width - EXPORT_MANUFACTURER_WATERMARK_MARGIN - EXPORT_MANUFACTURER_WATERMARK_WIDTH,
    node.y + node.height - EXPORT_MANUFACTURER_WATERMARK_MARGIN - EXPORT_MANUFACTURER_WATERMARK_HEIGHT,
    EXPORT_MANUFACTURER_WATERMARK_WIDTH,
    EXPORT_MANUFACTURER_WATERMARK_HEIGHT,
    manufacturerLogo
  );
  ctx.restore();

  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.arc(node.x, node.y + EXPORT_NODE_HANDLE_Y, EXPORT_NODE_HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(node.x + node.width, node.y + EXPORT_NODE_HANDLE_Y, EXPORT_NODE_HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function renderPreparedExportBackground(
  ctx: ExportCanvasContext,
  payload: PreparedExportPayload
) {
  const texturePattern = createTexturePattern(ctx);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, payload.width, payload.height);
  fillRectWithPattern(ctx, 0, 0, payload.width, payload.height, texturePattern, 0.5);

  drawDotGrid(ctx, payload.width, payload.height, EXPORT_BACKGROUND_DOT_GAP);
}

export function renderPreparedExportContent(
  ctx: ExportCanvasContext,
  payload: PreparedExportPayload,
  imageMap: Map<string, RenderableImage | null>
) {
  drawHeader(ctx, payload);

  payload.edges.forEach((edge) => {
    ctx.save();
    ctx.strokeStyle = edge.strokeColor;
    ctx.lineWidth = edge.lineDash.length > 0 ? 3 : 2.5;
    ctx.setLineDash(edge.lineDash);
    strokeBezierPath(ctx, edge.path);
    ctx.restore();

    drawArrowHead(ctx, edge.path, edge.strokeColor);
    drawEdgeLabel(ctx, edge);
  });

  payload.nodes.forEach((node) => {
    drawNodeCard(
      ctx,
      node,
      node.imageUrl ? imageMap.get(node.imageUrl) || null : null,
      node.manufacturerLogoUrl ? imageMap.get(node.manufacturerLogoUrl) || null : null
    );
  });

  if (payload.footerCard) {
    drawExportFooterCard(
      ctx,
      payload.footerCard,
      payload.footerCard.mediaUrl ? imageMap.get(payload.footerCard.mediaUrl) || null : null
    );
  }
}

export function renderPreparedExport(
  ctx: ExportCanvasContext,
  payload: PreparedExportPayload,
  imageMap: Map<string, RenderableImage | null>
) {
  renderPreparedExportBackground(ctx, payload);
  renderPreparedExportContent(ctx, payload, imageMap);
}
