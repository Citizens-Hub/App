import type { Edge, Node } from 'reactflow';

import type { CcuEdgeData, CcuValidityWindow } from '@/types';
import { CcuSourceType } from '@/types';

import type { FlowData } from './ImportExportService';

const PAYLOAD_MAGIC = 'CHRP';
const PAYLOAD_VERSION_LEGACY = 1;
const PAYLOAD_VERSION_COMPRESSED = 2;
const PAYLOAD_FLAG_COMPRESSED = 1 << 0;
const PRICE_SCALE = 100;

const SOURCE_TYPE_TO_CODE: Record<CcuSourceType, number> = {
  [CcuSourceType.OFFICIAL]: 0,
  [CcuSourceType.AVAILABLE_WB]: 1,
  [CcuSourceType.HANGER]: 2,
  [CcuSourceType.OFFICIAL_WB]: 3,
  [CcuSourceType.THIRD_PARTY]: 4,
  [CcuSourceType.HISTORICAL]: 5,
  [CcuSourceType.EXPECTED_WB]: 6,
  [CcuSourceType.PRICE_INCREASE]: 7,
  [CcuSourceType.SUBSCRIPTION]: 8
};

const CODE_TO_SOURCE_TYPE = Object.entries(SOURCE_TYPE_TO_CODE).reduce<Record<number, CcuSourceType>>((acc, [key, value]) => {
  acc[value] = key as CcuSourceType;
  return acc;
}, {});

interface CompactRouteNode {
  shipId: number;
  x: number;
  y: number;
}

interface CompactRouteEdge {
  sourceNodeIndex: number;
  targetNodeIndex: number;
  sourceType: CcuSourceType;
  officialPriceCents: number;
  customPriceCents?: number;
  selectedTargetPriceCents?: number;
  selectedSourcePriceCents?: number;
}

interface CompactRouteStartPrice {
  nodeIndex: number;
  priceCents: number;
}

interface CompactRoutePayload {
  nodes: CompactRouteNode[];
  edges: CompactRouteEdge[];
  startShipPrices: CompactRouteStartPrice[];
}

class ByteWriter {
  private bytes: number[] = [];

  writeUint8(value: number) {
    this.bytes.push(value & 0xff);
  }

  writeUint32(value: number) {
    const normalized = value >>> 0;
    this.bytes.push(normalized & 0xff);
    this.bytes.push((normalized >>> 8) & 0xff);
    this.bytes.push((normalized >>> 16) & 0xff);
    this.bytes.push((normalized >>> 24) & 0xff);
  }

  writeVarUint(value: number) {
    let remaining = value >>> 0;
    while (remaining >= 0x80) {
      this.writeUint8((remaining & 0x7f) | 0x80);
      remaining >>>= 7;
    }
    this.writeUint8(remaining);
  }

  writeVarInt(value: number) {
    const zigzag = ((value << 1) ^ (value >> 31)) >>> 0;
    this.writeVarUint(zigzag);
  }

  toUint8Array() {
    return Uint8Array.from(this.bytes);
  }
}

class ByteReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  readUint8() {
    if (this.offset >= this.bytes.length) {
      throw new Error('Unexpected end of payload.');
    }
    return this.bytes[this.offset++];
  }

  readUint32() {
    const b0 = this.readUint8();
    const b1 = this.readUint8();
    const b2 = this.readUint8();
    const b3 = this.readUint8();
    return ((b0) | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
  }

  readVarUint() {
    let shift = 0;
    let result = 0;

    while (shift < 35) {
      const byte = this.readUint8();
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        return result >>> 0;
      }
      shift += 7;
    }

    throw new Error('Invalid varuint encoding.');
  }

  readVarInt() {
    const value = this.readVarUint();
    return (value >>> 1) ^ -(value & 1);
  }

  get remaining() {
    return this.bytes.length - this.offset;
  }
}

function normalizePriceToCents(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return undefined;
  }

  return Math.round(numericValue * PRICE_SCALE);
}

function denormalizePriceFromCents(value: number): number {
  return value / PRICE_SCALE;
}

function getSourceTypeCode(sourceType: CcuSourceType | undefined) {
  return SOURCE_TYPE_TO_CODE[sourceType || CcuSourceType.OFFICIAL] ?? SOURCE_TYPE_TO_CODE[CcuSourceType.OFFICIAL];
}

function getSourceTypeFromCode(code: number) {
  const sourceType = CODE_TO_SOURCE_TYPE[code];
  if (!sourceType) {
    throw new Error(`Unsupported route source type code: ${code}`);
  }
  return sourceType;
}

function calculateCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const shouldFlip = crc & 1;
      crc >>>= 1;
      if (shouldFlip) {
        crc ^= 0xedb88320;
      }
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

async function readStreamToUint8Array(stream: ReadableStream<Uint8Array>) {
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function compressPayloadBody(bytes: Uint8Array) {
  if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') {
    return {
      bytes,
      compressed: false
    };
  }

  try {
    const compressionStream = new CompressionStream('deflate');
    const writer = compressionStream.writable.getWriter();
    const compressedBytesPromise = readStreamToUint8Array(compressionStream.readable);
    await writer.write(bytes as BufferSource);
    await writer.close();

    const compressedBytes = await compressedBytesPromise;
    if (compressedBytes.byteLength >= bytes.byteLength) {
      return {
        bytes,
        compressed: false
      };
    }

    return {
      bytes: compressedBytes,
      compressed: true
    };
  } catch {
    return {
      bytes,
      compressed: false
    };
  }
}

async function decompressPayloadBody(bytes: Uint8Array) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Compressed route import is not supported in this browser.');
  }

  try {
    const decompressionStream = new DecompressionStream('deflate');
    const writer = decompressionStream.writable.getWriter();
    const decodedBytesPromise = readStreamToUint8Array(decompressionStream.readable);
    await writer.write(bytes as BufferSource);
    await writer.close();
    return await decodedBytesPromise;
  } catch {
    throw new Error('Route payload decompression failed.');
  }
}

function collectCompactRoutePayload(flowData: FlowData): CompactRoutePayload {
  const compactNodeIndexByOriginalId = new Map<string, number>();
  const nodes: CompactRouteNode[] = flowData.nodes.flatMap((node) => {
    const shipId = node.data?.ship?.id;
    if (typeof shipId !== 'number') {
      return [];
    }

    compactNodeIndexByOriginalId.set(node.id, compactNodeIndexByOriginalId.size);
    return [{
      shipId,
      x: Math.round(node.position?.x ?? 0),
      y: Math.round(node.position?.y ?? 0)
    }];
  });

  const edges: CompactRouteEdge[] = flowData.edges.flatMap((edge) => {
    const sourceIndex = compactNodeIndexByOriginalId.get(edge.source);
    const targetIndex = compactNodeIndexByOriginalId.get(edge.target);
    if (sourceIndex === undefined || targetIndex === undefined) {
      return [];
    }

    const officialPriceCents = Math.round(edge.data?.price ?? 0);

    return [{
      sourceNodeIndex: sourceIndex,
      targetNodeIndex: targetIndex,
      sourceType: edge.data?.sourceType || CcuSourceType.OFFICIAL,
      officialPriceCents,
      customPriceCents: normalizePriceToCents(edge.data?.customPrice),
      selectedTargetPriceCents: edge.data?.selectedTargetPriceCents,
      selectedSourcePriceCents: edge.data?.selectedSourcePriceCents
    }];
  });

  const startShipPrices: CompactRouteStartPrice[] = Object.entries(flowData.startShipPrices).flatMap(([nodeId, value]) => {
    const nodeIndex = compactNodeIndexByOriginalId.get(nodeId);
    const priceCents = normalizePriceToCents(value);
    if (nodeIndex === undefined || priceCents === undefined) {
      return [];
    }

    return [{
      nodeIndex,
      priceCents
    }];
  });

  return {
    nodes,
    edges,
    startShipPrices
  };
}

function encodePayloadBody(payload: CompactRoutePayload) {
  const writer = new ByteWriter();
  writer.writeVarUint(payload.nodes.length);
  writer.writeVarUint(payload.edges.length);
  writer.writeVarUint(payload.startShipPrices.length);

  payload.nodes.forEach((node) => {
    writer.writeVarUint(node.shipId);
    writer.writeVarInt(node.x);
    writer.writeVarInt(node.y);
  });

  payload.edges.forEach((edge) => {
    writer.writeVarUint(edge.sourceNodeIndex);
    writer.writeVarUint(edge.targetNodeIndex);
    writer.writeUint8(getSourceTypeCode(edge.sourceType));

    let flags = 0;
    if (edge.customPriceCents !== undefined) flags |= 1 << 0;
    if (edge.selectedTargetPriceCents !== undefined) flags |= 1 << 1;
    if (edge.selectedSourcePriceCents !== undefined) flags |= 1 << 2;

    writer.writeUint8(flags);
    writer.writeVarInt(edge.officialPriceCents);

    if (edge.customPriceCents !== undefined) {
      writer.writeVarInt(edge.customPriceCents);
    }
    if (edge.selectedTargetPriceCents !== undefined) {
      writer.writeVarInt(edge.selectedTargetPriceCents);
    }
    if (edge.selectedSourcePriceCents !== undefined) {
      writer.writeVarInt(edge.selectedSourcePriceCents);
    }
  });

  payload.startShipPrices.forEach((item) => {
    writer.writeVarUint(item.nodeIndex);
    writer.writeVarInt(item.priceCents);
  });

  return writer.toUint8Array();
}

function decodePayloadBody(bytes: Uint8Array): CompactRoutePayload {
  const reader = new ByteReader(bytes);
  const nodeCount = reader.readVarUint();
  const edgeCount = reader.readVarUint();
  const startPriceCount = reader.readVarUint();

  const nodes: CompactRouteNode[] = [];
  for (let index = 0; index < nodeCount; index += 1) {
    nodes.push({
      shipId: reader.readVarUint(),
      x: reader.readVarInt(),
      y: reader.readVarInt()
    });
  }

  const edges: CompactRouteEdge[] = [];
  for (let index = 0; index < edgeCount; index += 1) {
    const sourceNodeIndex = reader.readVarUint();
    const targetNodeIndex = reader.readVarUint();
    const sourceType = getSourceTypeFromCode(reader.readUint8());
    const flags = reader.readUint8();
    const officialPriceCents = reader.readVarInt();

    const edge: CompactRouteEdge = {
      sourceNodeIndex,
      targetNodeIndex,
      sourceType,
      officialPriceCents
    };

    if (flags & (1 << 0)) {
      edge.customPriceCents = reader.readVarInt();
    }
    if (flags & (1 << 1)) {
      edge.selectedTargetPriceCents = reader.readVarInt();
    }
    if (flags & (1 << 2)) {
      edge.selectedSourcePriceCents = reader.readVarInt();
    }

    edges.push(edge);
  }

  const startShipPrices: CompactRouteStartPrice[] = [];
  for (let index = 0; index < startPriceCount; index += 1) {
    startShipPrices.push({
      nodeIndex: reader.readVarUint(),
      priceCents: reader.readVarInt()
    });
  }

  if (reader.remaining !== 0) {
    throw new Error('Unexpected trailing route payload data.');
  }

  return {
    nodes,
    edges,
    startShipPrices
  };
}

function buildImportableFlowData(payload: CompactRoutePayload): FlowData {
  const nodes: Node[] = payload.nodes.map((node) => ({
    id: `ship-${node.shipId}-image-${Math.random().toString(36).slice(2, 8)}`,
    type: 'ship',
    position: {
      x: node.x,
      y: node.y
    },
    positionAbsolute: {
      x: node.x,
      y: node.y
    },
    data: {
      ship: {
        id: node.shipId
      } as Node['data']
    }
  }));

  const edges: Edge<CcuEdgeData>[] = payload.edges.flatMap((edge) => {
    const sourceNode = nodes[edge.sourceNodeIndex];
    const targetNode = nodes[edge.targetNodeIndex];
    const sourcePayloadNode = payload.nodes[edge.sourceNodeIndex];
    const targetPayloadNode = payload.nodes[edge.targetNodeIndex];
    if (!sourceNode || !targetNode || !sourcePayloadNode || !targetPayloadNode) {
      return [];
    }

    const edgeData: CcuEdgeData = {
      price: edge.officialPriceCents,
      sourceShip: {
        id: sourcePayloadNode.shipId
      } as CcuEdgeData['sourceShip'],
      targetShip: {
        id: targetPayloadNode.shipId
      } as CcuEdgeData['targetShip'],
      sourceType: edge.sourceType
    };

    if (edge.customPriceCents !== undefined) {
      edgeData.customPrice = denormalizePriceFromCents(edge.customPriceCents);
    }

    if (edge.selectedTargetPriceCents !== undefined) {
      edgeData.selectedTargetPriceCents = edge.selectedTargetPriceCents;
    }

    if (edge.selectedSourcePriceCents !== undefined) {
      edgeData.selectedSourcePriceCents = edge.selectedSourcePriceCents;
    }

    return [{
      id: `edge-${sourcePayloadNode.shipId}-${targetPayloadNode.shipId}-${edge.sourceNodeIndex}-${edge.targetNodeIndex}`,
      source: sourceNode.id,
      target: targetNode.id,
      type: 'ccu',
      animated: true,
      data: edgeData
    }];
  });

  const startShipPrices = payload.startShipPrices.reduce<Record<string, number>>((acc, item) => {
    const node = nodes[item.nodeIndex];
    if (!node) {
      return acc;
    }
    acc[node.id] = denormalizePriceFromCents(item.priceCents);
    return acc;
  }, {});

  return {
    nodes,
    edges,
    startShipPrices
  };
}

function hydrateEdgeValidityWindows(edge: Edge<CcuEdgeData>, windows: CcuValidityWindow[] | undefined) {
  if (!edge.data) {
    return edge;
  }

  if (!windows?.length) {
    return edge;
  }

  return {
    ...edge,
    data: {
      ...edge.data,
      validityWindows: windows
    }
  };
}

export class RouteImagePayloadService {
  async encodeFlowData(flowData: FlowData) {
    const compactPayload = collectCompactRoutePayload(flowData);
    const body = encodePayloadBody(compactPayload);
    const crc = calculateCrc32(body);
    const compressedBody = await compressPayloadBody(body);

    const writer = new ByteWriter();
    for (const char of PAYLOAD_MAGIC) {
      writer.writeUint8(char.charCodeAt(0));
    }

    if (compressedBody.compressed) {
      writer.writeUint8(PAYLOAD_VERSION_COMPRESSED);
      writer.writeUint8(PAYLOAD_FLAG_COMPRESSED);
      writer.writeUint32(compressedBody.bytes.length);
      writer.writeUint32(body.length);

      const header = writer.toUint8Array();
      const output = new Uint8Array(header.length + compressedBody.bytes.length + 4);
      output.set(header, 0);
      output.set(compressedBody.bytes, header.length);
      output.set(Uint8Array.of(
        crc & 0xff,
        (crc >>> 8) & 0xff,
        (crc >>> 16) & 0xff,
        (crc >>> 24) & 0xff
      ), header.length + compressedBody.bytes.length);

      return output;
    }

    writer.writeUint8(PAYLOAD_VERSION_LEGACY);
    writer.writeUint32(body.length);

    const header = writer.toUint8Array();
    const output = new Uint8Array(header.length + body.length + 4);
    output.set(header, 0);
    output.set(body, header.length);
    output.set(Uint8Array.of(
      crc & 0xff,
      (crc >>> 8) & 0xff,
      (crc >>> 16) & 0xff,
      (crc >>> 24) & 0xff
    ), header.length + body.length);

    return output;
  }

  async decodeFlowData(bytes: Uint8Array): Promise<FlowData> {
    const reader = new ByteReader(bytes);
    const magic = String.fromCharCode(
      reader.readUint8(),
      reader.readUint8(),
      reader.readUint8(),
      reader.readUint8()
    );

    if (magic !== PAYLOAD_MAGIC) {
      throw new Error('Image payload signature mismatch.');
    }

    const version = reader.readUint8();
    let storedBody: Uint8Array;
    let decodedBody: Uint8Array;
    let bodyEnd: number;

    if (version === PAYLOAD_VERSION_LEGACY) {
      const bodyLength = reader.readUint32();
      if (reader.remaining < bodyLength + 4) {
        throw new Error('Route payload is truncated.');
      }

      const bodyStart = bytes.length - reader.remaining;
      bodyEnd = bodyStart + bodyLength;
      storedBody = bytes.subarray(bodyStart, bodyEnd);
      decodedBody = storedBody;
    } else if (version === PAYLOAD_VERSION_COMPRESSED) {
      const flags = reader.readUint8();
      const storedBodyLength = reader.readUint32();
      const decodedBodyLength = reader.readUint32();

      if (reader.remaining < storedBodyLength + 4) {
        throw new Error('Route payload is truncated.');
      }

      const bodyStart = bytes.length - reader.remaining;
      bodyEnd = bodyStart + storedBodyLength;
      storedBody = bytes.subarray(bodyStart, bodyEnd);

      if (flags & ~PAYLOAD_FLAG_COMPRESSED) {
        throw new Error(`Unsupported route payload flags: ${flags}`);
      }

      decodedBody = (flags & PAYLOAD_FLAG_COMPRESSED)
        ? await decompressPayloadBody(storedBody)
        : storedBody;

      if (decodedBody.byteLength !== decodedBodyLength) {
        throw new Error('Route payload length mismatch.');
      }
    } else {
      throw new Error(`Unsupported route payload version: ${version}`);
    }

    const storedCrc = (
      bytes[bodyEnd]
      | (bytes[bodyEnd + 1] << 8)
      | (bytes[bodyEnd + 2] << 16)
      | (bytes[bodyEnd + 3] << 24)
    ) >>> 0;
    const actualCrc = calculateCrc32(decodedBody);

    if (storedCrc !== actualCrc) {
      throw new Error('Route payload checksum mismatch.');
    }

    const compactPayload = decodePayloadBody(decodedBody);
    return buildImportableFlowData(compactPayload);
  }

  async inspectPayload(bytes: Uint8Array) {
    const flowData = await this.decodeFlowData(bytes);
    return {
      flowData,
      summary: {
        nodeCount: flowData.nodes.length,
        edgeCount: flowData.edges.length,
        startShipPriceCount: Object.keys(flowData.startShipPrices).length
      }
    };
  }

  attachResolvedValidityWindows(
    flowData: FlowData,
    windowsByEdgeKey: Map<string, CcuValidityWindow[] | undefined>
  ): FlowData {
    if (!windowsByEdgeKey.size) {
      return flowData;
    }

    return {
      ...flowData,
      edges: flowData.edges.map(edge => {
        const windows = windowsByEdgeKey.get(`${edge.source}->${edge.target}`);
        return hydrateEdgeValidityWindows(edge, windows);
      })
    };
  }
}

const routeImagePayloadService = new RouteImagePayloadService();

export default routeImagePayloadService;
