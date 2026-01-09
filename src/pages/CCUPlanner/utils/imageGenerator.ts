import { Node, Edge, ReactFlowInstance, getBezierPath, Position, getRectOfNodes } from 'reactflow';
import { CcuEdgeData, Ship } from '@/types';

interface GenerateImageOptions {
  nodes: Node[];
  edges: Edge<CcuEdgeData>[];
  reactFlowInstance: ReactFlowInstance;
  padding?: number;
  backgroundColor?: string;
  gridColor?: string;
  gridGap?: number;
}

/**
 * Draw grid pattern on canvas
 */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  gridGap: number,
  gridColor: string
) {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;

  // Calculate starting positions
  const startX = Math.floor(offsetX / gridGap) * gridGap - offsetX;
  const startY = Math.floor(offsetY / gridGap) * gridGap - offsetY;

  // Draw vertical lines
  for (let x = startX; x <= width; x += gridGap) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Draw horizontal lines
  for (let y = startY; y <= height; y += gridGap) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

/**
 * Load image from URL
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Draw ship node on canvas
 */
async function drawNode(
  ctx: CanvasRenderingContext2D,
  node: Node,
  offsetX: number,
  offsetY: number,
  scale: number
) {
  const ship = node.data?.ship as Ship;
  if (!ship) return;

  const nodeWidth = 256; // w-64 = 256px
  const nodeHeight = 400; // Approximate height
  const x = (node.position.x - offsetX) * scale;
  const y = (node.position.y - offsetY) * scale;

  // Draw node background
  ctx.fillStyle = '#f9fafb'; // bg-gray-50
  ctx.strokeStyle = '#60a5fa'; // border-blue-400
  ctx.lineWidth = 2;
  const radius = 8 * scale;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + nodeWidth * scale - radius, y);
  ctx.quadraticCurveTo(x + nodeWidth * scale, y, x + nodeWidth * scale, y + radius);
  ctx.lineTo(x + nodeWidth * scale, y + nodeHeight * scale - radius);
  ctx.quadraticCurveTo(x + nodeWidth * scale, y + nodeHeight * scale, x + nodeWidth * scale - radius, y + nodeHeight * scale);
  ctx.lineTo(x + radius, y + nodeHeight * scale);
  ctx.quadraticCurveTo(x, y + nodeHeight * scale, x, y + nodeHeight * scale - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Draw ship image
  try {
    const imageUrl = ship.medias.productThumbMediumAndSmall.replace('medium_and_small', 'large');
    const img = await loadImage(imageUrl);
    const imgHeight = 120 * scale; // h-30 = 120px
    ctx.drawImage(img, x, y + 8 * scale, nodeWidth * scale, imgHeight);
  } catch (error) {
    console.error('Failed to load ship image:', error);
  }

  // Draw ship name
  ctx.fillStyle = '#1f2937'; // text-gray-800
  ctx.font = `${20 * scale}px Quantico, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const nameY = y + 140 * scale;
  ctx.fillText(ship.name, x + (nodeWidth * scale) / 2, nameY);

  // Draw manufacturer and type
  ctx.fillStyle = '#4b5563'; // text-gray-600
  ctx.font = `${14 * scale}px Quantico, sans-serif`;
  const infoText = `${ship.manufacturer.name} · ${ship.type}`;
  ctx.fillText(infoText, x + (nodeWidth * scale) / 2, nameY + 30 * scale);

  // Draw price
  ctx.fillStyle = '#60a5fa'; // text-blue-400
  ctx.font = `bold ${18 * scale}px Quantico, sans-serif`;
  const priceText = `$${(ship.msrp / 100).toLocaleString('en-US')}`;
  ctx.fillText(priceText, x + (nodeWidth * scale) / 2, nameY + 60 * scale);

  // Draw badges (WB, FlyableStatus)
  // Note: WB badge detection is simplified - you may need to pass ccus data if needed
  if (ship.flyableStatus && ship.flyableStatus !== 'Flyable') {
    ctx.fillStyle = '#38bdf8'; // bg-sky-400
    ctx.fillRect(x + nodeWidth * scale - 60 * scale, y + 8 * scale, 40 * scale, 20 * scale);
    ctx.fillStyle = '#ffffff';
    ctx.font = `${12 * scale}px Quantico, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(ship.flyableStatus, x + nodeWidth * scale - 40 * scale, y + 12 * scale);
  }
}

/**
 * Draw edge on canvas
 */
function drawEdge(
  ctx: CanvasRenderingContext2D,
  edge: Edge<CcuEdgeData>,
  sourceNode: Node,
  targetNode: Node,
  offsetX: number,
  offsetY: number
) {
  if (!edge.data) return;

  const nodeWidth = 256;
  const nodeHeight = 400;
  const nodeCenterY = nodeHeight / 2;

  const sourceX = sourceNode.position.x - offsetX + nodeWidth;
  const sourceY = sourceNode.position.y - offsetY + nodeCenterY;
  const targetX = targetNode.position.x - offsetX;
  const targetY = targetNode.position.y - offsetY + nodeCenterY;

  // Calculate Bezier path
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: Position.Right,
    targetX,
    targetY,
    targetPosition: Position.Left,
  });

  // Draw edge path
  const isCompleted = false; // You may need to check this from pathFinderService
  ctx.strokeStyle = isCompleted ? '#4caf50' : '#b0b0b0';
  ctx.lineWidth = isCompleted ? 3 : 2;
  if (isCompleted) {
    ctx.setLineDash([5, 5]);
  } else {
    ctx.setLineDash([]);
  }

  const path2d = new Path2D(path);
  ctx.stroke(path2d);

  // Draw edge label
  const sourceType = edge.data.sourceType || 'Official';
  const price = edge.data.price || 0;
  const currency = edge.data.currency || 'USD';
  const labelText = `${sourceType} +$${price.toLocaleString('en-US')}`;

  ctx.fillStyle = '#3b82f6'; // bg-blue-500
  ctx.font = `12px Quantico, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const labelWidth = ctx.measureText(labelText).width + 16;
  const labelHeight = 24;
  const labelXPos = sourceX + labelX;
  const labelYPos = sourceY + labelY;

  // Draw label background with rounded corners
  const labelRadius = 4;
  ctx.beginPath();
  ctx.moveTo(labelXPos - labelWidth / 2 + labelRadius, labelYPos - labelHeight / 2);
  ctx.lineTo(labelXPos + labelWidth / 2 - labelRadius, labelYPos - labelHeight / 2);
  ctx.quadraticCurveTo(labelXPos + labelWidth / 2, labelYPos - labelHeight / 2, labelXPos + labelWidth / 2, labelYPos - labelHeight / 2 + labelRadius);
  ctx.lineTo(labelXPos + labelWidth / 2, labelYPos + labelHeight / 2 - labelRadius);
  ctx.quadraticCurveTo(labelXPos + labelWidth / 2, labelYPos + labelHeight / 2, labelXPos + labelWidth / 2 - labelRadius, labelYPos + labelHeight / 2);
  ctx.lineTo(labelXPos - labelWidth / 2 + labelRadius, labelYPos + labelHeight / 2);
  ctx.quadraticCurveTo(labelXPos - labelWidth / 2, labelYPos + labelHeight / 2, labelXPos - labelWidth / 2, labelYPos + labelHeight / 2 - labelRadius);
  ctx.lineTo(labelXPos - labelWidth / 2, labelYPos - labelHeight / 2 + labelRadius);
  ctx.quadraticCurveTo(labelXPos - labelWidth / 2, labelYPos - labelHeight / 2, labelXPos - labelWidth / 2 + labelRadius, labelYPos - labelHeight / 2);
  ctx.closePath();
  ctx.fill();

  // Draw label text
  ctx.fillStyle = '#ffffff';
  ctx.fillText(labelText, labelXPos, labelYPos);
}

/**
 * Generate shareable image from ReactFlow canvas
 */
export async function generateShareImage(options: GenerateImageOptions): Promise<string> {
  const {
    nodes,
    edges,
    reactFlowInstance,
    padding = 50,
    backgroundColor = '#ffffff',
    gridColor = '#333333',
    gridGap = 32,
  } = options;

  if (!nodes.length) {
    throw new Error('No nodes to render');
  }

  // Get bounding box of all nodes using ReactFlow utility
  const rect = getRectOfNodes(nodes);
  
  // Add padding
  const offsetX = rect.x - padding;
  const offsetY = rect.y - padding;
  const width = rect.width + padding * 2;
  const height = rect.height + padding * 2;

  // Create canvas
  const scale = 2; // For better quality
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Scale context
  ctx.scale(scale, scale);

  // Fill background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Draw grid
  drawGrid(ctx, width, height, offsetX, offsetY, gridGap, gridColor);

  // Draw edges first (so they appear behind nodes)
  edges.forEach((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    if (sourceNode && targetNode) {
      drawEdge(ctx, edge, sourceNode, targetNode, offsetX, offsetY);
    }
  });

  // Draw nodes
  for (const node of nodes) {
    await drawNode(ctx, node, offsetX, offsetY, 1);
  }

  // Reset line dash
  ctx.setLineDash([]);

  // Convert to data URL
  return canvas.toDataURL('image/png');
}

