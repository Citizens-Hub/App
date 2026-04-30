export const EXPORT_HEADER_HEIGHT = 88;
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

const FONT_FAMILY = '"Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif';

export interface PreparedExportNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  imageUrl: string;
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

export interface PreparedExportPayload {
  width: number;
  height: number;
  scale: number;
  title: string;
  subtitle: string;
  exportedAt: string;
  nodes: PreparedExportNode[];
  edges: PreparedExportEdge[];
}

export type RenderableImage = CanvasImageSource & {
  width: number;
  height: number;
};

type ExportCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

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

function drawGrid(ctx: ExportCanvasContext, width: number, height: number, step: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  ctx.lineWidth = 1;

  for (let x = 0; x <= width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
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

function drawHeader(ctx: ExportCanvasContext, payload: PreparedExportPayload) {
  ctx.save();
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 28px ${FONT_FAMILY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(payload.title, 56, 44);

  ctx.fillStyle = '#475569';
  ctx.font = `500 14px ${FONT_FAMILY}`;
  ctx.fillText(payload.subtitle, 56, 68);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = `500 13px ${FONT_FAMILY}`;
  ctx.fillText(payload.exportedAt, payload.width - 56, 52);
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
    const savingsWidth = ctx.measureText(edge.labelSavingsText).width + 24;
    drawRoundedRect(ctx, edge.labelX - savingsWidth / 2, edge.labelY - 42, savingsWidth, 24, 6, '#fef3c7');
    ctx.fillStyle = '#92400e';
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
  image: RenderableImage | null
) {
  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.10)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  drawRoundedRect(ctx, node.x, node.y, node.width, node.height, EXPORT_NODE_RADIUS, '#ffffff');
  ctx.shadowColor = 'transparent';

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

  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.arc(node.x, node.y + EXPORT_NODE_HANDLE_Y, EXPORT_NODE_HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(node.x + node.width, node.y + EXPORT_NODE_HANDLE_Y, EXPORT_NODE_HANDLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function renderPreparedExport(
  ctx: ExportCanvasContext,
  payload: PreparedExportPayload,
  imageMap: Map<string, RenderableImage | null>
) {
  const background = ctx.createLinearGradient(0, 0, payload.width, payload.height);
  background.addColorStop(0, '#f8fbff');
  background.addColorStop(1, '#eef4ff');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, payload.width, payload.height);

  drawGrid(ctx, payload.width, payload.height, 40);
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
    drawNodeCard(ctx, node, node.imageUrl ? imageMap.get(node.imageUrl) || null : null);
  });
}
