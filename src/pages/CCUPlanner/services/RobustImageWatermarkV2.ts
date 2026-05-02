import {
  BLOCK_SIZE,
  COEFFICIENT_A,
  COEFFICIENT_B,
  COEFFICIENT_C,
  COEFFICIENT_D,
  COEFFICIENT_LOW_A,
  COEFFICIENT_LOW_B,
  COEFFICIENT_LOW_C,
  COEFFICIENT_LOW_D,
  HAMMING_CODE_BITS,
  assertImageSupportsWatermark,
  bitsToBytes,
  buildBitPermutation,
  buildBlockOrder,
  bytesToBits,
  clampUnit,
  crc32,
  decodeBitConfidenceFromCoefficientPair,
  decodeHamming15_11,
  encodeHamming15_11,
  forEachLogicalBlockSubBlock,
  getBlockOrigin,
  getCoefficientPairForBases,
  getLogicalBlockActivity,
  getLogicalBlockAverageLuma,
  getRequiredEncodedBitsForByteLength,
  hasRoutePayloadSignature,
  isBlockFullyInsideImage,
  permuteBits,
  signOrPositive,
  unpermuteBits
} from './RobustImageWatermarkCore';
import {
  ROBUST_WATERMARK_BLOCK_FLAG_HEADER,
  ROBUST_WATERMARK_BLOCK_FLAG_PAYLOAD,
  ROBUST_WATERMARK_BLOCK_FLAG_VALID,
  type Bit,
  type RobustWatermarkDebugAttempt,
  type RobustWatermarkGeometryDebug,
  type RobustWatermarkHeaderDebug,
  type RobustWatermarkPayloadDebug,
  type RobustWatermarkExtractionResult,
  type RobustWatermarkFrequencyAnalysis
} from './RobustImageWatermarkTypes';

const V2_HEADER_MAGIC = 'CHW2';
const V2_HEADER_VERSION = 2;
const V2_PROTOCOL_ID = 0x30;
const V2_HEADER_SIZE = 16;
const V2_HEADER_PLAIN_BITS = V2_HEADER_SIZE * 8;
const V2_HEADER_ENCODED_BIT_LENGTH = Math.ceil(V2_HEADER_PLAIN_BITS / 11) * HAMMING_CODE_BITS;
const V2_LOGICAL_BLOCK_BITS = 2;
const V2_HEADER_SYMBOL_BITS = V2_LOGICAL_BLOCK_BITS;
const V2_PAYLOAD_SYMBOL_BITS = V2_LOGICAL_BLOCK_BITS;
const V2_HEADER_REPETITION_FACTOR = 7;
const V2_MIN_PAYLOAD_REPETITION_FACTOR = 1;
const V2_MAX_PAYLOAD_REPETITION_FACTOR = 64;
const V2_MAX_SELECTED_PAYLOAD_REPETITION_FACTOR = 16;
const V2_PRNG_SEED = 0x43_48_57_32;

const V2_WATERMARK_STRENGTH_MIN = 4.6;
const V2_WATERMARK_STRENGTH_MAX = 8.4;
const V2_WATERMARK_HEADER_STRENGTH_BOOST = 7.2;
const V2_DECODE_CONFIDENCE_CLAMP = 20;
const V2_HEADER_SCORE_EMBED_THRESHOLD = 0.18;
const V2_SCORE_EMBED_THRESHOLD = 0.26;
const V2_PAYLOAD_DECODE_SCORE_THRESHOLD = 0.12;
const V2_PAYLOAD_WRITE_SCORE_THRESHOLD = 0.045;
const V2_PAYLOAD_MACRO_EMBED_THRESHOLD = 0.18;
const V2_PAYLOAD_MACRO_CAPACITY_THRESHOLD = 0.2;
const V2_PAYLOAD_BLOCK_MIN_DECODE_CONFIDENCE = 0.35;
const V2_PAYLOAD_MIN_BLOCKS_PER_MACRO = 2;
const V2_PAYLOAD_SYMBOL_AGREEMENT_THRESHOLD = 0.66;
const V2_ECC_DATA_BYTES_PER_BLOCK = 183;
const V2_ECC_PARITY_BYTES_PER_BLOCK = 24;
const V2_ECC_HEADER_MAGIC = 'CHE2';
const V2_ECC_HEADER_VERSION = 1;
const V2_ECC_HEADER_SIZE = 16;
const V2_HEADER_MIN_BRIGHTNESS = 0.8;
const V2_HEADER_MAX_BRIGHTNESS = 0.992;
const V2_HEADER_MAX_ACTIVITY = 0.2;
const V2_HEADER_FLAT_WHITE_PENALTY_BRIGHTNESS = 0.974;
const V2_HEADER_FLAT_WHITE_PENALTY_ACTIVITY = 0.018;
const V2_MIN_BRIGHTNESS = 0.82;
const V2_MAX_BRIGHTNESS = 0.988;
const V2_TEXTURE_ACTIVITY_FLOOR = 0.012;
const V2_TEXTURE_ACTIVITY_PEAK = 0.045;
const V2_TEXTURE_ACTIVITY_CEILING = 0.12;
const V2_FLAT_WHITE_PENALTY_BRIGHTNESS = 0.968;
const V2_FLAT_WHITE_PENALTY_ACTIVITY = 0.028;

interface CoefficientPairSet {
  basisA: Float32Array;
  basisB: Float32Array;
  strengthBias: number;
}

interface WatermarkV2Layout {
  mode: 'fixed';
  blocksWide: number;
  blocksHigh: number;
  macroWide: number;
  macroHigh: number;
  headerMacros: Uint32Array;
  payloadMacros: Uint32Array;
  blockScores: Float32Array;
  headerMacroScores: Float32Array;
  payloadMacroScores: Float32Array;
}

interface WatermarkV2Geometry {
  blocksWide: number;
  blocksHigh: number;
  macroWide: number;
  macroHigh: number;
  headerMacros: Uint32Array;
  payloadMacros: Uint32Array;
}

interface DecodedBitsDiagnostics {
  bits: Bit[];
  confidences: number[];
  averageConfidence: number;
  minimumConfidence: number;
  payloadDebug?: RobustWatermarkPayloadDebug;
}

interface ParsedV2Header {
  payloadLength: number;
  payloadCrc32: number;
  payloadRepetition: number;
}

interface WatermarkV2Candidate extends RobustWatermarkExtractionResult {
  score: number;
}

interface RobustWatermarkV2EmbedOptions {
  referencePixelBytes?: Uint8ClampedArray;
  backgroundPixelBytes?: Uint8ClampedArray;
  excludedRects?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

interface DecodedPayloadMacroSymbol {
  bits: Bit[];
  confidences: number[];
  averageConfidence: number;
  accepted: boolean;
  skipped: boolean;
  agreement: number;
}

interface DecodedHammingBits {
  bits: Bit[];
  confidences: number[];
  correctedBitCount: number;
}

interface PayloadRecoveryResult {
  payload: Uint8Array;
  transportLength: number;
  eccParityBytes: number;
  erasedByteCount: number;
  correctedByteCount: number;
}

const V2_PAYLOAD_BIT0_COEFFICIENT_PAIRS = [
  { basisA: COEFFICIENT_LOW_A, basisB: COEFFICIENT_LOW_B, strengthBias: 1.1 },
  { basisA: COEFFICIENT_A, basisB: COEFFICIENT_B, strengthBias: 0 }
] as const satisfies readonly CoefficientPairSet[];

const V2_PAYLOAD_BIT1_COEFFICIENT_PAIRS = [
  { basisA: COEFFICIENT_LOW_C, basisB: COEFFICIENT_LOW_D, strengthBias: 1.1 },
  { basisA: COEFFICIENT_C, basisB: COEFFICIENT_D, strengthBias: 0.4 }
] as const satisfies readonly CoefficientPairSet[];

const V2_HEADER_BIT0_COEFFICIENT_PAIRS = [
  { basisA: COEFFICIENT_LOW_A, basisB: COEFFICIENT_LOW_B, strengthBias: 4.7 },
  { basisA: COEFFICIENT_A, basisB: COEFFICIENT_B, strengthBias: 1.4 }
] as const satisfies readonly CoefficientPairSet[];

const V2_HEADER_BIT1_COEFFICIENT_PAIRS = [
  { basisA: COEFFICIENT_LOW_C, basisB: COEFFICIENT_LOW_D, strengthBias: 4.2 },
  { basisA: COEFFICIENT_C, basisB: COEFFICIENT_D, strengthBias: 1.4 }
] as const satisfies readonly CoefficientPairSet[];

const V2_BIT0_SUB_BLOCKS = new Set([0, 3]);
const V2_PAYLOAD_BLOCK_OFFSETS = [0, 1, 2, 3] as const;
const V2_PAYLOAD_BLOCK_MASKS = [0b00, 0b01, 0b11, 0b10] as const;
const V2_PAYLOAD_REQUIRED_BLOCKS_PER_MACRO = V2_PAYLOAD_BLOCK_OFFSETS.length;
function calculateEccTransportLength(payloadByteLength: number) {
  const blockCount = Math.ceil(payloadByteLength / V2_ECC_DATA_BYTES_PER_BLOCK);
  return V2_ECC_HEADER_SIZE
    + payloadByteLength
    + (blockCount * V2_ECC_PARITY_BYTES_PER_BLOCK);
}

function calculateMaxPayloadLengthFromTransportCapacity(transportCapacityBytes: number) {
  let low = 0;
  let high = Math.max(0, transportCapacityBytes);

  while (low < high) {
    const midpoint = Math.ceil((low + high + 1) / 2);
    if (calculateEccTransportLength(midpoint) <= transportCapacityBytes) {
      low = midpoint;
    } else {
      high = midpoint - 1;
    }
  }

  return low;
}

function calculateCapacityFromPayloadMacroCount(payloadMacroCount: number, repetitionFactor: number) {
  const usableEncodedBits = Math.floor(payloadMacroCount / repetitionFactor) * V2_PAYLOAD_SYMBOL_BITS;
  const usableCodewords = Math.floor(usableEncodedBits / HAMMING_CODE_BITS);
  const usablePlainBits = usableCodewords * 11;
  return Math.max(0, Math.floor(usablePlainBits / 8));
}

function countEligiblePayloadMacros(payloadMacros: Uint32Array, payloadMacroScores: Float32Array) {
  let count = 0;

  payloadMacros.forEach((macroIndex) => {
    if (payloadMacroScores[macroIndex] >= V2_PAYLOAD_MACRO_CAPACITY_THRESHOLD) {
      count += 1;
    }
  });

  return count;
}

function getPayloadMacroOrderIndex(
  symbolIndex: number,
  repetitionIndex: number,
  symbolCount: number,
  repetitionFactor: number,
  payloadMacroCount: number
) {
  const requiredMacros = symbolCount * repetitionFactor;
  const sequenceIndex = (repetitionIndex * symbolCount) + symbolIndex;
  return Math.min(
    payloadMacroCount - 1,
    Math.floor(((sequenceIndex + 0.5) * payloadMacroCount) / requiredMacros)
  );
}

// function canUsePayloadMacroForEmbedding(macroIndex: number, payloadMacroScores: Float32Array) {
//   return payloadMacroScores[macroIndex] >= V2_PAYLOAD_MACRO_EMBED_THRESHOLD;
// }

// function getRequiredPayloadSymbolCount(payloadByteLength: number) {
//   return Math.ceil(getRequiredEncodedBitsForByteLength(payloadByteLength) / V2_PAYLOAD_SYMBOL_BITS);
// }

// function getMinimumSymbolEmbeddingVotes(repetitionFactor: number) {
//   return Math.min(3, repetitionFactor);
// }

// function measurePayloadPlacementCoverage(
//   payloadByteLength: number,
//   payloadMacros: Uint32Array,
//   payloadMacroScores: Float32Array,
//   repetitionFactor: number
// ) {
//   const symbolCount = getRequiredPayloadSymbolCount(payloadByteLength);
//   let minimumVotes = Number.POSITIVE_INFINITY;
//   let voteSum = 0;

//   for (let symbolIndex = 0; symbolIndex < symbolCount; symbolIndex += 1) {
//     let votes = 0;

//     for (let repetitionIndex = 0; repetitionIndex < repetitionFactor; repetitionIndex += 1) {
//       const macroIndex = payloadMacros[getPayloadMacroOrderIndex(
//         symbolIndex,
//         repetitionIndex,
//         symbolCount,
//         repetitionFactor,
//         payloadMacros.length
//       )];
//       if (canUsePayloadMacroForEmbedding(macroIndex, payloadMacroScores)) {
//         votes += 1;
//       }
//     }

//     minimumVotes = Math.min(minimumVotes, votes);
//     voteSum += votes;
//   }

//   return {
//     symbolCount,
//     minimumVotes: Number.isFinite(minimumVotes) ? minimumVotes : 0,
//     averageVotes: symbolCount ? voteSum / symbolCount : 0
//   };
// }

function choosePayloadRepetitionFactor(
  payloadByteLength: number,
  payloadMacros: Uint32Array,
  payloadMacroScores: Float32Array
) {
  const maximumSelectedRepetitionFactor = Math.min(
    V2_MAX_PAYLOAD_REPETITION_FACTOR,
    V2_MAX_SELECTED_PAYLOAD_REPETITION_FACTOR
  );
  const eligibleMacroCount = countEligiblePayloadMacros(payloadMacros, payloadMacroScores);

  for (let repetitionFactor = maximumSelectedRepetitionFactor; repetitionFactor >= V2_MIN_PAYLOAD_REPETITION_FACTOR; repetitionFactor -= 1) {
    const physicalCapacityBytes = calculateCapacityFromPayloadMacroCount(
      payloadMacros.length,
      repetitionFactor
    );
    if (physicalCapacityBytes < payloadByteLength) {
      continue;
    }

    const effectiveCapacityBytes = calculateCapacityFromPayloadMacroCount(
      eligibleMacroCount,
      repetitionFactor
    );
    if (effectiveCapacityBytes >= payloadByteLength) {
      return repetitionFactor;
    }
  }

  return null;
}

function getHeaderSymbolCount() {
  return Math.ceil(V2_HEADER_ENCODED_BIT_LENGTH / V2_HEADER_SYMBOL_BITS);
}

function getRequiredHeaderMacroCount() {
  return getHeaderSymbolCount() * V2_HEADER_REPETITION_FACTOR;
}

function bitsToSymbols(bits: Bit[], bitsPerSymbol: number) {
  const symbolCount = Math.ceil(bits.length / bitsPerSymbol);
  const symbols = new Uint8Array(symbolCount);

  for (let symbolIndex = 0; symbolIndex < symbolCount; symbolIndex += 1) {
    let value = 0;

    for (let bitOffset = 0; bitOffset < bitsPerSymbol; bitOffset += 1) {
      const bitIndex = (symbolIndex * bitsPerSymbol) + bitOffset;
      value = (value << 1) | (bits[bitIndex] ?? 0);
    }

    symbols[symbolIndex] = value;
  }

  return symbols;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function bytesToPrintableText(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => (
    byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'
  )).join('');
}

function countMagicByteMatches(bytes: Uint8Array, magic: string) {
  let matches = 0;

  for (let index = 0; index < magic.length; index += 1) {
    if (bytes[index] === magic.charCodeAt(index)) {
      matches += 1;
    }
  }

  return matches;
}

function gf256Multiply(left: number, right: number) {
  let a = left & 0xff;
  let b = right & 0xff;
  let result = 0;

  while (b) {
    if (b & 1) {
      result ^= a;
    }
    const highBit = a & 0x80;
    a = (a << 1) & 0xff;
    if (highBit) {
      a ^= 0x1d;
    }
    b >>>= 1;
  }

  return result;
}

function gf256Pow(base: number, exponent: number) {
  let result = 1;

  for (let index = 0; index < exponent; index += 1) {
    result = gf256Multiply(result, base);
  }

  return result;
}

function gf256Inverse(value: number) {
  if (!value) {
    throw new Error('Cannot invert zero in GF(256).');
  }

  return gf256Pow(value, 254);
}

// function gf256Divide(left: number, right: number) {
//   return gf256Multiply(left, gf256Inverse(right));
// }

function getEccCoefficient(byteIndex: number, parityIndex: number) {
  return gf256Pow(2, ((byteIndex + 1) * (parityIndex + 1)) % 255);
}

function xorRows(target: Uint8Array, source: Uint8Array, startColumn: number) {
  for (let column = startColumn; column < target.length; column += 1) {
    target[column] ^= source[column];
  }
}

function scaleRow(row: Uint8Array, scalar: number, startColumn: number) {
  if (scalar === 1) {
    return;
  }

  for (let column = startColumn; column < row.length; column += 1) {
    row[column] = gf256Multiply(row[column], scalar);
  }
}

function solveGf256LinearSystem(matrix: Uint8Array[], values: Uint8Array) {
  const size = values.length;
  const rows = matrix.map((row, rowIndex) => {
    const augmented = new Uint8Array(size + 1);
    augmented.set(row.slice(0, size), 0);
    augmented[size] = values[rowIndex];
    return augmented;
  });

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    while (pivotRow < size && rows[pivotRow][column] === 0) {
      pivotRow += 1;
    }
    if (pivotRow >= size) {
      return null;
    }

    if (pivotRow !== column) {
      const temp = rows[column];
      rows[column] = rows[pivotRow];
      rows[pivotRow] = temp;
    }

    scaleRow(rows[column], gf256Inverse(rows[column][column]), column);

    for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
      if (rowIndex === column || rows[rowIndex][column] === 0) {
        continue;
      }

      const factor = rows[rowIndex][column];
      const scaledPivot = new Uint8Array(size + 1);
      for (let pivotColumn = column; pivotColumn <= size; pivotColumn += 1) {
        scaledPivot[pivotColumn] = gf256Multiply(rows[column][pivotColumn], factor);
      }
      xorRows(rows[rowIndex], scaledPivot, column);
    }
  }

  const output = new Uint8Array(size);
  for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
    output[rowIndex] = rows[rowIndex][size];
  }
  return output;
}

function calculateEccParity(data: Uint8Array, parityBytes: number) {
  const parity = new Uint8Array(parityBytes);

  for (let byteIndex = 0; byteIndex < data.length; byteIndex += 1) {
    const value = data[byteIndex];
    if (!value) {
      continue;
    }

    for (let parityIndex = 0; parityIndex < parityBytes; parityIndex += 1) {
      parity[parityIndex] ^= gf256Multiply(value, getEccCoefficient(byteIndex, parityIndex));
    }
  }

  return parity;
}

function recoverEccBlock(data: Uint8Array, parity: Uint8Array, erasedByteIndices: number[]) {
  const uniqueErasedByteIndices = Array.from(new Set(erasedByteIndices))
    .filter((byteIndex) => byteIndex >= 0 && byteIndex < data.length);

  if (!uniqueErasedByteIndices.length) {
    const currentParity = calculateEccParity(data, parity.length);
    for (let parityIndex = 0; parityIndex < parity.length; parityIndex += 1) {
      if (currentParity[parityIndex] !== parity[parityIndex]) {
        return null;
      }
    }

    return {
      data,
      correctedByteCount: 0
    };
  }

  if (uniqueErasedByteIndices.length > parity.length) {
    return null;
  }

  const currentParity = calculateEccParity(data, parity.length);
  const matrix: Uint8Array[] = [];
  const values = new Uint8Array(uniqueErasedByteIndices.length);

  for (let parityIndex = 0; parityIndex < uniqueErasedByteIndices.length; parityIndex += 1) {
    const row = new Uint8Array(uniqueErasedByteIndices.length);
    uniqueErasedByteIndices.forEach((byteIndex, columnIndex) => {
      row[columnIndex] = getEccCoefficient(byteIndex, parityIndex);
    });
    matrix.push(row);
    values[parityIndex] = parity[parityIndex] ^ currentParity[parityIndex];
  }

  const recoveredValues = solveGf256LinearSystem(matrix, values);
  if (!recoveredValues) {
    return null;
  }

  const recoveredData = new Uint8Array(data);
  uniqueErasedByteIndices.forEach((byteIndex, valueIndex) => {
    recoveredData[byteIndex] ^= recoveredValues[valueIndex];
  });

  const recoveredParity = calculateEccParity(recoveredData, parity.length);
  for (let parityIndex = 0; parityIndex < parity.length; parityIndex += 1) {
    if (recoveredParity[parityIndex] !== parity[parityIndex]) {
      return null;
    }
  }

  return {
    data: recoveredData,
    correctedByteCount: uniqueErasedByteIndices.length
  };
}

function buildEccTransport(payload: Uint8Array) {
  const blockCount = Math.ceil(payload.byteLength / V2_ECC_DATA_BYTES_PER_BLOCK);
  const transportLength = V2_ECC_HEADER_SIZE
    + payload.byteLength
    + (blockCount * V2_ECC_PARITY_BYTES_PER_BLOCK);
  const transport = new Uint8Array(transportLength);
  let offset = 0;

  transport[offset++] = V2_ECC_HEADER_MAGIC.charCodeAt(0);
  transport[offset++] = V2_ECC_HEADER_MAGIC.charCodeAt(1);
  transport[offset++] = V2_ECC_HEADER_MAGIC.charCodeAt(2);
  transport[offset++] = V2_ECC_HEADER_MAGIC.charCodeAt(3);
  transport[offset++] = V2_ECC_HEADER_VERSION;
  transport[offset++] = V2_ECC_DATA_BYTES_PER_BLOCK;
  transport[offset++] = V2_ECC_PARITY_BYTES_PER_BLOCK;
  transport[offset++] = blockCount;
  transport[offset++] = payload.byteLength & 0xff;
  transport[offset++] = (payload.byteLength >>> 8) & 0xff;
  transport[offset++] = (payload.byteLength >>> 16) & 0xff;
  transport[offset++] = (payload.byteLength >>> 24) & 0xff;
  const payloadChecksum = crc32(payload);
  transport[offset++] = payloadChecksum & 0xff;
  transport[offset++] = (payloadChecksum >>> 8) & 0xff;
  transport[offset++] = (payloadChecksum >>> 16) & 0xff;
  transport[offset++] = (payloadChecksum >>> 24) & 0xff;
  transport.set(payload, offset);
  offset += payload.byteLength;

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const blockStart = blockIndex * V2_ECC_DATA_BYTES_PER_BLOCK;
    const blockEnd = Math.min(payload.byteLength, blockStart + V2_ECC_DATA_BYTES_PER_BLOCK);
    const block = new Uint8Array(V2_ECC_DATA_BYTES_PER_BLOCK);
    block.set(payload.slice(blockStart, blockEnd));
    transport.set(calculateEccParity(block, V2_ECC_PARITY_BYTES_PER_BLOCK), offset);
    offset += V2_ECC_PARITY_BYTES_PER_BLOCK;
  }

  return transport;
}

function parseEccTransportHeader(transport: Uint8Array) {
  if (transport.byteLength < V2_ECC_HEADER_SIZE) {
    return null;
  }

  const magic = String.fromCharCode(transport[0], transport[1], transport[2], transport[3]);
  if (magic !== V2_ECC_HEADER_MAGIC || transport[4] !== V2_ECC_HEADER_VERSION) {
    return null;
  }

  const dataBytesPerBlock = transport[5];
  const parityBytesPerBlock = transport[6];
  const blockCount = transport[7];
  const payloadLength = (
    transport[8]
    | (transport[9] << 8)
    | (transport[10] << 16)
    | (transport[11] << 24)
  ) >>> 0;
  const payloadChecksum = (
    transport[12]
    | (transport[13] << 8)
    | (transport[14] << 16)
    | (transport[15] << 24)
  ) >>> 0;

  if (
    dataBytesPerBlock !== V2_ECC_DATA_BYTES_PER_BLOCK
    || parityBytesPerBlock !== V2_ECC_PARITY_BYTES_PER_BLOCK
    || blockCount !== Math.ceil(payloadLength / V2_ECC_DATA_BYTES_PER_BLOCK)
  ) {
    return null;
  }

  const expectedTransportLength = V2_ECC_HEADER_SIZE
    + payloadLength
    + (blockCount * parityBytesPerBlock);
  if (expectedTransportLength > transport.byteLength) {
    return null;
  }

  return {
    blockCount,
    payloadLength,
    payloadChecksum,
    expectedTransportLength
  };
}

function getLowConfidenceTransportBytes(
  bitConfidences: number[],
  transportLength: number,
  threshold: number
) {
  const erasedByteIndices: number[] = [];

  for (let byteIndex = 0; byteIndex < transportLength; byteIndex += 1) {
    let minimumConfidence = Number.POSITIVE_INFINITY;

    for (let bitOffset = 0; bitOffset < 8; bitOffset += 1) {
      const confidence = bitConfidences[(byteIndex * 8) + bitOffset] ?? 0;
      minimumConfidence = Math.min(minimumConfidence, confidence);
    }

    if (!Number.isFinite(minimumConfidence) || minimumConfidence <= threshold) {
      erasedByteIndices.push(byteIndex);
    }
  }

  return erasedByteIndices;
}

function recoverPayloadFromEccTransport(
  transport: Uint8Array,
  bitConfidences: number[]
): PayloadRecoveryResult | null {
  const header = parseEccTransportHeader(transport);
  if (!header) {
    return null;
  }

  const payloadStart = V2_ECC_HEADER_SIZE;
  const parityStart = payloadStart + header.payloadLength;
  const payload = new Uint8Array(transport.slice(payloadStart, parityStart));
  const lowConfidenceTransportBytes = getLowConfidenceTransportBytes(
    bitConfidences,
    header.expectedTransportLength,
    0.08
  );
  let correctedByteCount = 0;
  let erasedByteCount = 0;

  for (let blockIndex = 0; blockIndex < header.blockCount; blockIndex += 1) {
    const blockPayloadStart = blockIndex * V2_ECC_DATA_BYTES_PER_BLOCK;
    const blockPayloadEnd = Math.min(header.payloadLength, blockPayloadStart + V2_ECC_DATA_BYTES_PER_BLOCK);
    const block = new Uint8Array(V2_ECC_DATA_BYTES_PER_BLOCK);
    block.set(payload.slice(blockPayloadStart, blockPayloadEnd));

    const erasedByteIndices = lowConfidenceTransportBytes
      .filter((byteIndex) => byteIndex >= payloadStart + blockPayloadStart && byteIndex < payloadStart + blockPayloadStart + V2_ECC_DATA_BYTES_PER_BLOCK)
      .map((byteIndex) => byteIndex - payloadStart - blockPayloadStart);
    erasedByteCount += erasedByteIndices.length;

    const parityOffset = parityStart + (blockIndex * V2_ECC_PARITY_BYTES_PER_BLOCK);
    const parity = transport.slice(parityOffset, parityOffset + V2_ECC_PARITY_BYTES_PER_BLOCK);
    const recovered = recoverEccBlock(block, parity, erasedByteIndices);
    if (!recovered) {
      return null;
    }

    payload.set(
      recovered.data.slice(0, blockPayloadEnd - blockPayloadStart),
      blockPayloadStart
    );
    correctedByteCount += recovered.correctedByteCount;
  }

  if (crc32(payload) !== header.payloadChecksum || !hasRoutePayloadSignature(payload)) {
    return null;
  }

  return {
    payload,
    transportLength: header.expectedTransportLength,
    eccParityBytes: header.blockCount * V2_ECC_PARITY_BYTES_PER_BLOCK,
    erasedByteCount,
    correctedByteCount
  };
}

function decodePayloadTransport(
  header: ParsedV2Header,
  payloadDiagnostics: DecodedBitsDiagnostics
): PayloadRecoveryResult {
  const rawPayloadBits = unpermuteBits(payloadDiagnostics.bits, V2_PRNG_SEED ^ header.payloadLength);
  const rawPayloadConfidences = unpermuteConfidences(payloadDiagnostics.confidences, V2_PRNG_SEED ^ header.payloadLength);
  const decodedTransportBits = decodeHamming15_11WithConfidence(
    rawPayloadBits,
    rawPayloadConfidences,
    header.payloadLength * 8
  );
  const transport = bitsToBytes(decodedTransportBits.bits, header.payloadLength);

  const eccRecovered = recoverPayloadFromEccTransport(
    transport,
    decodedTransportBits.confidences
  );
  if (eccRecovered) {
    return eccRecovered;
  }

  if (crc32(transport) !== header.payloadCrc32) {
    throw new Error('Route payload checksum mismatch.');
  }

  if (!hasRoutePayloadSignature(transport)) {
    throw new Error('Route payload signature mismatch.');
  }

  return {
    payload: transport,
    transportLength: transport.byteLength,
    eccParityBytes: 0,
    erasedByteCount: 0,
    correctedByteCount: decodedTransportBits.correctedBitCount ? 0 : 0
  };
}

function decodeHamming15_11WithConfidence(
  encodedBits: Bit[],
  encodedConfidences: number[],
  expectedPlainBitLength: number
): DecodedHammingBits {
  const outputBits: Bit[] = [];
  const outputConfidences: number[] = [];
  const dataPositions = [3, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
  const parityPositions = [1, 2, 4, 8];
  const requiredCodewords = Math.ceil(expectedPlainBitLength / 11);
  let correctedBitCount = 0;

  for (let codewordIndex = 0; codewordIndex < requiredCodewords; codewordIndex += 1) {
    const offset = codewordIndex * HAMMING_CODE_BITS;
    const codeword = new Uint8Array(HAMMING_CODE_BITS + 1);
    const confidences = new Float32Array(HAMMING_CODE_BITS + 1);

    for (let bitIndex = 0; bitIndex < HAMMING_CODE_BITS; bitIndex += 1) {
      codeword[bitIndex + 1] = encodedBits[offset + bitIndex] ?? 0;
      confidences[bitIndex + 1] = encodedConfidences[offset + bitIndex] ?? 0;
    }

    let syndrome = 0;
    parityPositions.forEach((parityPosition) => {
      let parity = 0;
      for (let position = 1; position <= HAMMING_CODE_BITS; position += 1) {
        if (position & parityPosition) {
          parity ^= codeword[position];
        }
      }
      if (parity) {
        syndrome |= parityPosition;
      }
    });

    if (syndrome >= 1 && syndrome <= HAMMING_CODE_BITS) {
      codeword[syndrome] ^= 1;
      confidences[syndrome] = Math.min(confidences[syndrome], 0);
      correctedBitCount += 1;
    }

    dataPositions.forEach((position) => {
      outputBits.push(codeword[position] as Bit);
      outputConfidences.push(confidences[position]);
    });
  }

  return {
    bits: outputBits.slice(0, expectedPlainBitLength),
    confidences: outputConfidences.slice(0, expectedPlainBitLength),
    correctedBitCount
  };
}

function unpermuteConfidences(confidences: number[], seed: number) {
  const permutation = buildBitPermutation(confidences.length, seed);
  const output = new Array<number>(confidences.length);

  for (let index = 0; index < confidences.length; index += 1) {
    output[index] = confidences[permutation[index]] ?? 0;
  }

  return output;
}

function getPayloadMarkerSymbol(macroIndex: number) {
  return ((macroIndex ^ (macroIndex >>> 5) ^ (macroIndex >>> 11) ^ V2_PROTOCOL_ID) & 0b11);
}

function getPayloadBlockCodeword(macroIndex: number, blockOffsetIndex: number, symbol: number) {
  return (symbol ^ getPayloadMarkerSymbol(macroIndex) ^ V2_PAYLOAD_BLOCK_MASKS[blockOffsetIndex]) & 0b11;
}

function getPayloadSymbolFromBlockCodeword(macroIndex: number, blockOffsetIndex: number, codeword: number) {
  return (codeword ^ getPayloadMarkerSymbol(macroIndex) ^ V2_PAYLOAD_BLOCK_MASKS[blockOffsetIndex]) & 0b11;
}

function formatCrc32Hex(value: number) {
  return `0x${(value >>> 0).toString(16).padStart(8, '0')}`;
}

function headerPayloadCrc32FromHex(value: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseInt(value.replace(/^0x/i, ''), 16);
  return Number.isFinite(parsed) ? parsed >>> 0 : 0;
}

function getMacroBlockIndices(macroIndex: number, blocksWide: number, macroWide: number) {
  const macroX = (macroIndex % macroWide) * 2;
  const macroY = Math.floor(macroIndex / macroWide) * 2;
  const topLeft = (macroY * blocksWide) + macroX;

  return [
    topLeft,
    topLeft + 1,
    topLeft + blocksWide,
    topLeft + blocksWide + 1
  ] as const;
}

function selectCandidateOrder(candidates: number[], seed: number) {
  if (candidates.length <= 1) {
    return Uint32Array.from(candidates);
  }

  const shuffled = new Uint32Array(candidates.length);
  const order = buildBlockOrder(candidates.length, seed);

  for (let index = 0; index < order.length; index += 1) {
    shuffled[index] = candidates[order[index]];
  }

  return shuffled;
}

function takeCandidateSubset(
  candidates: number[],
  requiredCount: number,
  seed: number
) {
  if (requiredCount > candidates.length) {
    throw new Error('Image is too small to contain route watermark header.');
  }

  return selectCandidateOrder(candidates, seed).slice(0, requiredCount);
}

function buildHeaderMacroBandCandidates(
  macroWide: number,
  macroHigh: number,
  requiredCount: number
) {
  const rows: number[] = [];
  const minimumBandRows = Math.min(macroHigh, 6);
  let offset = 0;

  while (
    (
      rows.length < minimumBandRows
      || (rows.length * macroWide) < Math.max(requiredCount * 2, requiredCount)
    )
    && offset < macroHigh
  ) {
    rows.push(offset);

    const bottomRow = macroHigh - 1 - offset;
    if (
      bottomRow !== offset
      && (
        rows.length < minimumBandRows
        || (rows.length * macroWide) < (requiredCount * 2)
      )
    ) {
      rows.push(bottomRow);
    }

    offset += 1;
  }

  rows.sort((left, right) => left - right);

  const candidates: number[] = [];
  rows.forEach((row) => {
    for (let macroX = 0; macroX < macroWide; macroX += 1) {
      candidates.push((row * macroWide) + macroX);
    }
  });

  return candidates;
}

function buildPayloadMacroCandidates(
  macroWide: number,
  macroHigh: number,
  headerMacros: Uint32Array
) {
  const totalMacros = macroWide * macroHigh;
  const reservedMacros = new Uint8Array(totalMacros);
  headerMacros.forEach((macroIndex) => {
    reservedMacros[macroIndex] = 1;
  });

  const payloadOrder = buildBlockOrder(totalMacros, V2_PRNG_SEED ^ 0x50_4c_44);
  const payloadMacros: number[] = [];
  const payloadCandidates: Array<{ macroIndex: number; priority: number }> = [];
  const centerX = (macroWide - 1) / 2;
  const centerY = (macroHigh - 1) / 2;

  payloadOrder.forEach((macroIndex) => {
    if (!reservedMacros[macroIndex]) {
      const macroX = macroIndex % macroWide;
      const macroY = Math.floor(macroIndex / macroWide);
      const edgeDistance = Math.min(
        macroX,
        macroY,
        macroWide - 1 - macroX,
        macroHigh - 1 - macroY
      );
      const centerDistance = Math.hypot(macroX - centerX, macroY - centerY);
      payloadCandidates.push({
        macroIndex,
        priority: (edgeDistance * 100_000) - centerDistance
      });
    }
  });

  payloadCandidates.sort((left, right) => left.priority - right.priority);
  payloadCandidates.forEach((candidate) => {
    payloadMacros.push(candidate.macroIndex);
  });

  return Uint32Array.from(payloadMacros);
}

function buildV2Geometry(imageWidth: number, imageHeight: number): WatermarkV2Geometry {
  const blocksWide = Math.floor(imageWidth / BLOCK_SIZE);
  const blocksHigh = Math.floor(imageHeight / BLOCK_SIZE);
  const macroWide = Math.floor(blocksWide / 2);
  const macroHigh = Math.floor(blocksHigh / 2);
  const totalMacros = macroWide * macroHigh;
  const headerMacroCount = getRequiredHeaderMacroCount();

  if (headerMacroCount > totalMacros) {
    throw new Error('Image is too small to contain route watermark header.');
  }

  const headerCandidates = buildHeaderMacroBandCandidates(
    macroWide,
    macroHigh,
    headerMacroCount
  );
  const headerMacros = takeCandidateSubset(
    headerCandidates,
    headerMacroCount,
    V2_PRNG_SEED ^ 0x48_44_52
  );
  const payloadMacros = buildPayloadMacroCandidates(macroWide, macroHigh, headerMacros);

  return {
    blocksWide,
    blocksHigh,
    macroWide,
    macroHigh,
    headerMacros,
    payloadMacros
  };
}

function getCenteredDistanceScale(
  blocksWide: number,
  blocksHigh: number,
  blockX: number,
  blockY: number
) {
  const centerX = (blocksWide - 1) / 2;
  const centerY = (blocksHigh - 1) / 2;
  const distanceX = centerX === 0 ? 0 : Math.abs(blockX - centerX) / Math.max(centerX, 1);
  const distanceY = centerY === 0 ? 0 : Math.abs(blockY - centerY) / Math.max(centerY, 1);
  const radialDistance = Math.hypot(distanceX, distanceY) / Math.SQRT2;
  return 1 - clampUnit(radialDistance);
}

function getHeaderBrightnessSuitability(brightness: number) {
  if (brightness <= V2_HEADER_MIN_BRIGHTNESS || brightness >= V2_HEADER_MAX_BRIGHTNESS) {
    return 0;
  }

  const midpoint = 0.91;
  const normalizedDistance = Math.abs(brightness - midpoint) / Math.max(
    midpoint - V2_HEADER_MIN_BRIGHTNESS,
    V2_HEADER_MAX_BRIGHTNESS - midpoint
  );
  return 1 - clampUnit(normalizedDistance);
}

function getHeaderActivitySuitability(activity: number) {
  if (activity >= V2_HEADER_MAX_ACTIVITY) {
    return 0;
  }

  const normalized = clampUnit(activity / V2_HEADER_MAX_ACTIVITY);
  return 1 - normalized;
}

function getHeaderFlatWhitePenalty(brightness: number, activity: number) {
  if (
    brightness < V2_HEADER_FLAT_WHITE_PENALTY_BRIGHTNESS
    || activity > V2_HEADER_FLAT_WHITE_PENALTY_ACTIVITY
  ) {
    return 1;
  }

  const brightnessPenalty = clampUnit(
    (brightness - V2_HEADER_FLAT_WHITE_PENALTY_BRIGHTNESS) / 0.012
  );
  const activityPenalty = 1 - clampUnit(activity / V2_HEADER_FLAT_WHITE_PENALTY_ACTIVITY);
  return Math.max(0, 1 - (1.18 * brightnessPenalty * activityPenalty));
}

function getBrightnessSuitability(brightness: number) {
  if (brightness <= V2_MIN_BRIGHTNESS || brightness >= V2_MAX_BRIGHTNESS) {
    return 0;
  }

  const midpoint = 0.93;
  const normalizedDistance = Math.abs(brightness - midpoint) / Math.max(
    midpoint - V2_MIN_BRIGHTNESS,
    V2_MAX_BRIGHTNESS - midpoint
  );
  return 1 - clampUnit(normalizedDistance);
}

function getTextureSuitability(activity: number) {
  if (activity <= V2_TEXTURE_ACTIVITY_FLOOR || activity >= V2_TEXTURE_ACTIVITY_CEILING) {
    return 0;
  }

  if (activity <= V2_TEXTURE_ACTIVITY_PEAK) {
    return clampUnit(
      (activity - V2_TEXTURE_ACTIVITY_FLOOR)
      / (V2_TEXTURE_ACTIVITY_PEAK - V2_TEXTURE_ACTIVITY_FLOOR)
    );
  }

  return 1 - clampUnit(
    (activity - V2_TEXTURE_ACTIVITY_PEAK)
    / (V2_TEXTURE_ACTIVITY_CEILING - V2_TEXTURE_ACTIVITY_PEAK)
  );
}

function getFlatWhitePenalty(brightness: number, activity: number) {
  if (brightness >= 0.982 && activity <= 0.015) {
    return 0;
  }

  if (brightness < V2_FLAT_WHITE_PENALTY_BRIGHTNESS || activity > V2_FLAT_WHITE_PENALTY_ACTIVITY) {
    return 1;
  }

  const brightnessPenalty = clampUnit((brightness - V2_FLAT_WHITE_PENALTY_BRIGHTNESS) / 0.02);
  const activityPenalty = 1 - clampUnit(activity / V2_FLAT_WHITE_PENALTY_ACTIVITY);
  return Math.max(0, 1 - (1.28 * brightnessPenalty * activityPenalty));
}

function getLogicalBlockAverageChroma(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number
) {
  let chromaSum = 0;
  let sampleCount = 0;

  for (let localY = 0; localY < BLOCK_SIZE; localY += 2) {
    for (let localX = 0; localX < BLOCK_SIZE; localX += 2) {
      const pixelIndex = ((blockY + localY) * imageWidth + blockX + localX) * 4;
      const r = pixelBytes[pixelIndex];
      const g = pixelBytes[pixelIndex + 1];
      const b = pixelBytes[pixelIndex + 2];
      chromaSum += Math.max(r, g, b) - Math.min(r, g, b);
      sampleCount += 1;
    }
  }

  return sampleCount ? chromaSum / (sampleCount * 255) : 0;
}

function getLogicalBlockForegroundCoverage(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number
) {
  let foregroundSamples = 0;
  let sampleCount = 0;

  for (let localY = 0; localY < BLOCK_SIZE; localY += 2) {
    for (let localX = 0; localX < BLOCK_SIZE; localX += 2) {
      const pixelIndex = ((blockY + localY) * imageWidth + blockX + localX) * 4;
      const r = pixelBytes[pixelIndex];
      const g = pixelBytes[pixelIndex + 1];
      const b = pixelBytes[pixelIndex + 2];
      const luma = (0.299 * r) + (0.587 * g) + (0.114 * b);
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);

      if (luma < 232 || chroma > 22) {
        foregroundSamples += 1;
      }
      sampleCount += 1;
    }
  }

  return sampleCount ? foregroundSamples / sampleCount : 0;
}

function getContentColorPenalty(chroma: number) {
  if (chroma <= 0.018) {
    return 1;
  }

  if (chroma >= 0.07) {
    return 0;
  }

  return 1 - clampUnit((chroma - 0.018) / 0.052);
}

function getForegroundCoveragePenalty(foregroundCoverage: number) {
  if (foregroundCoverage <= 0.018) {
    return 1;
  }

  if (foregroundCoverage >= 0.075) {
    return 0;
  }

  return 1 - clampUnit((foregroundCoverage - 0.018) / 0.057);
}

function buildBlockScores(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
) {
  const blocksWide = Math.floor(imageWidth / BLOCK_SIZE);
  const blocksHigh = Math.floor(imageHeight / BLOCK_SIZE);
  const totalBlocks = blocksWide * blocksHigh;
  const blockScores = new Float32Array(totalBlocks);

  for (let blockIndex = 0; blockIndex < totalBlocks; blockIndex += 1) {
    const { blockX, blockY } = getBlockOrigin(blockIndex, blocksWide);
    const gridX = blockIndex % blocksWide;
    const gridY = Math.floor(blockIndex / blocksWide);
    const activity = getLogicalBlockActivity(pixelBytes, imageWidth, blockX, blockY);
    const brightness = getLogicalBlockAverageLuma(pixelBytes, imageWidth, blockX, blockY) / 255;
    const chroma = getLogicalBlockAverageChroma(pixelBytes, imageWidth, blockX, blockY);
    const foregroundCoverage = getLogicalBlockForegroundCoverage(pixelBytes, imageWidth, blockX, blockY);
    const score = (
      (0.3 * getBrightnessSuitability(brightness))
      + (0.5 * getTextureSuitability(activity))
      + (0.2 * getCenteredDistanceScale(blocksWide, blocksHigh, gridX, gridY))
    )
      * getFlatWhitePenalty(brightness, activity)
      * getContentColorPenalty(chroma)
      * getForegroundCoveragePenalty(foregroundCoverage);

    blockScores[blockIndex] = score >= 0.12 ? score : 0;
  }

  return {
    blocksWide,
    blocksHigh,
    blockScores
  };
}

function buildHeaderMacroScores(
  blocksWide: number,
  macroWide: number,
  macroHigh: number,
  pixelBytes: Uint8ClampedArray,
  imageWidth: number
) {
  const macroScores = new Float32Array(macroWide * macroHigh);

  for (let macroIndex = 0; macroIndex < macroScores.length; macroIndex += 1) {
    const blockIndices = getMacroBlockIndices(macroIndex, blocksWide, macroWide);
    let scoreSum = 0;

    blockIndices.forEach((blockIndex) => {
      const { blockX, blockY } = getBlockOrigin(blockIndex, blocksWide);
      const gridX = blockIndex % blocksWide;
      const gridY = Math.floor(blockIndex / blocksWide);
      const activity = getLogicalBlockActivity(pixelBytes, imageWidth, blockX, blockY);
      const brightness = getLogicalBlockAverageLuma(pixelBytes, imageWidth, blockX, blockY) / 255;
      const score = (
        (0.44 * getHeaderBrightnessSuitability(brightness))
        + (0.34 * getHeaderActivitySuitability(activity))
        + (0.22 * getCenteredDistanceScale(blocksWide, Math.floor(macroHigh * 2), gridX, gridY))
      ) * getHeaderFlatWhitePenalty(brightness, activity);

      scoreSum += score >= 0.08 ? score : 0;
    });

    macroScores[macroIndex] = scoreSum / blockIndices.length;
  }

  return macroScores;
}

function buildPayloadMacroScores(
  blocksWide: number,
  macroWide: number,
  macroHigh: number,
  blockScores: Float32Array
) {
  const payloadMacroScores = new Float32Array(macroWide * macroHigh);

  for (let macroIndex = 0; macroIndex < payloadMacroScores.length; macroIndex += 1) {
    const blockIndices = getMacroBlockIndices(macroIndex, blocksWide, macroWide);
    let scoreSum = 0;
    let eligibleBlocks = 0;

    blockIndices.forEach((blockIndex) => {
      const score = blockScores[blockIndex];
      scoreSum += score;
      if (score >= V2_PAYLOAD_DECODE_SCORE_THRESHOLD) {
        eligibleBlocks += 1;
      }
    });

    // Payload codewords are self-checked across every logical block in the macro.
    payloadMacroScores[macroIndex] = eligibleBlocks >= V2_PAYLOAD_REQUIRED_BLOCKS_PER_MACRO
      ? scoreSum / blockIndices.length
      : 0;
  }

  return payloadMacroScores;
}

function applyContentCoveragePenalty(
  blockScores: Float32Array,
  referencePixelBytes: Uint8ClampedArray,
  backgroundPixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
) {
  if (referencePixelBytes === backgroundPixelBytes) {
    return blockScores;
  }

  const blocksWide = Math.floor(imageWidth / BLOCK_SIZE);
  const adjustedScores = new Float32Array(blockScores);

  for (let blockIndex = 0; blockIndex < adjustedScores.length; blockIndex += 1) {
    if (adjustedScores[blockIndex] <= 0) {
      continue;
    }

    const { blockX, blockY } = getBlockOrigin(blockIndex, blocksWide);
    if (!isBlockFullyInsideImage(imageWidth, imageHeight, blockX, blockY)) {
      adjustedScores[blockIndex] = 0;
      continue;
    }

    let differenceSum = 0;
    let maxDifference = 0;
    let changedSampleCount = 0;
    let sampleCount = 0;

    for (let localY = 0; localY < BLOCK_SIZE; localY += 2) {
      for (let localX = 0; localX < BLOCK_SIZE; localX += 2) {
        const pixelIndex = ((blockY + localY) * imageWidth + blockX + localX) * 4;
        const referenceLuma = (
          (0.299 * referencePixelBytes[pixelIndex])
          + (0.587 * referencePixelBytes[pixelIndex + 1])
          + (0.114 * referencePixelBytes[pixelIndex + 2])
        );
        const backgroundLuma = (
          (0.299 * backgroundPixelBytes[pixelIndex])
          + (0.587 * backgroundPixelBytes[pixelIndex + 1])
          + (0.114 * backgroundPixelBytes[pixelIndex + 2])
        );
        const difference = Math.abs(referenceLuma - backgroundLuma);

        differenceSum += difference;
        maxDifference = Math.max(maxDifference, difference);
        if (difference >= 1.4) {
          changedSampleCount += 1;
        }
        sampleCount += 1;
      }
    }

    const averageDifference = sampleCount ? differenceSum / sampleCount : 0;
    const changedSampleRatio = sampleCount ? changedSampleCount / sampleCount : 0;
    if (averageDifference >= 1.2 || maxDifference >= 16 || changedSampleRatio >= 0.1) {
      adjustedScores[blockIndex] = 0;
    } else if (averageDifference >= 0.35 || changedSampleRatio >= 0.035) {
      const averagePenalty = clampUnit((averageDifference - 0.35) / 0.85);
      const coveragePenalty = clampUnit((changedSampleRatio - 0.035) / 0.065);
      adjustedScores[blockIndex] *= 1 - Math.max(averagePenalty, coveragePenalty);
    }
  }

  return adjustedScores;
}

function applyExcludedRectPenalty(
  blockScores: Float32Array,
  imageWidth: number,
  imageHeight: number,
  excludedRects?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>
) {
  if (!excludedRects?.length) {
    return blockScores;
  }

  const blocksWide = Math.floor(imageWidth / BLOCK_SIZE);
  const adjustedScores = new Float32Array(blockScores);
  const padding = BLOCK_SIZE;

  for (let blockIndex = 0; blockIndex < adjustedScores.length; blockIndex += 1) {
    if (adjustedScores[blockIndex] <= 0) {
      continue;
    }

    const { blockX, blockY } = getBlockOrigin(blockIndex, blocksWide);
    const blockRight = blockX + BLOCK_SIZE;
    const blockBottom = blockY + BLOCK_SIZE;

    for (const rect of excludedRects) {
      const rectLeft = Math.max(0, rect.x - padding);
      const rectTop = Math.max(0, rect.y - padding);
      const rectRight = Math.min(imageWidth, rect.x + rect.width + padding);
      const rectBottom = Math.min(imageHeight, rect.y + rect.height + padding);

      if (
        blockRight > rectLeft
        && blockX < rectRight
        && blockBottom > rectTop
        && blockY < rectBottom
      ) {
        adjustedScores[blockIndex] = 0;
        break;
      }
    }
  }

  return adjustedScores;
}

function buildV2Layout(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  backgroundPixelBytes?: Uint8ClampedArray,
  excludedRects?: RobustWatermarkV2EmbedOptions['excludedRects']
): WatermarkV2Layout {
  const geometry = buildV2Geometry(imageWidth, imageHeight);
  const {
    blocksWide,
    blocksHigh,
    blockScores
  } = buildBlockScores(pixelBytes, imageWidth, imageHeight);
  const diffAdjustedPayloadBlockScores = backgroundPixelBytes
    ? applyContentCoveragePenalty(
      blockScores,
      pixelBytes,
      backgroundPixelBytes,
      imageWidth,
      imageHeight
    )
    : blockScores;
  const payloadBlockScores = applyExcludedRectPenalty(
    diffAdjustedPayloadBlockScores,
    imageWidth,
    imageHeight,
    excludedRects
  );
  const headerMacroScores = buildHeaderMacroScores(
    blocksWide,
    geometry.macroWide,
    geometry.macroHigh,
    pixelBytes,
    imageWidth
  );
  const payloadMacroScores = buildPayloadMacroScores(
    blocksWide,
    geometry.macroWide,
    geometry.macroHigh,
    payloadBlockScores
  );

  return {
    mode: 'fixed',
    blocksWide,
    blocksHigh,
    macroWide: geometry.macroWide,
    macroHigh: geometry.macroHigh,
    headerMacros: geometry.headerMacros,
    payloadMacros: geometry.payloadMacros,
    blockScores: payloadBlockScores,
    headerMacroScores,
    payloadMacroScores
  };
}

function getAdaptiveWatermarkStrength(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  strengthBias = 0
) {
  const logicalActivity = getLogicalBlockActivity(pixelBytes, imageWidth, blockX, blockY);
  const activityScale = clampUnit(logicalActivity / 0.18);
  return V2_WATERMARK_STRENGTH_MIN
    + ((V2_WATERMARK_STRENGTH_MAX - V2_WATERMARK_STRENGTH_MIN) * activityScale)
    + strengthBias;
}

function getCarrierStrengthScale(score: number, header: boolean) {
  const threshold = header ? V2_HEADER_SCORE_EMBED_THRESHOLD : V2_SCORE_EMBED_THRESHOLD;
  if (score <= threshold) {
    return 0;
  }

  const normalized = clampUnit((score - threshold) / 0.55);
  const scale = 0.34 + (0.66 * normalized * normalized);
  return scale * (header ? 1.14 : 1);
}

function getDecodeBlockWeight(score: number, header = false) {
  const threshold = header ? V2_HEADER_SCORE_EMBED_THRESHOLD : V2_PAYLOAD_DECODE_SCORE_THRESHOLD;
  if (score <= threshold) {
    return 0;
  }

  const normalized = clampUnit((score - threshold) / 0.55);
  return normalized * normalized;
}

function getPayloadMacroStrengthScale(score: number) {
  if (score <= V2_PAYLOAD_MACRO_EMBED_THRESHOLD) {
    return 0;
  }

  const normalized = clampUnit((score - V2_PAYLOAD_MACRO_EMBED_THRESHOLD) / 0.55);
  return 0.34 + (0.66 * normalized * normalized);
}

function getDctBlockAverageLuma(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number
) {
  let lumaSum = 0;

  for (let localY = 0; localY < 8; localY += 1) {
    for (let localX = 0; localX < 8; localX += 1) {
      const pixelX = blockX + localX;
      const pixelY = blockY + localY;
      const pixelIndex = (pixelY * imageWidth + pixelX) * 4;
      lumaSum += (0.299 * pixelBytes[pixelIndex]) + (0.587 * pixelBytes[pixelIndex + 1]) + (0.114 * pixelBytes[pixelIndex + 2]);
    }
  }

  return lumaSum / 64;
}

function embedBitIntoCoefficientPairV2(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  bit: Bit,
  basisA: Float32Array,
  basisB: Float32Array,
  targetStrength: number,
  preferredSign: number
) {
  const coefficients = getCoefficientPairForBases(
    pixelBytes,
    imageWidth,
    blockX,
    blockY,
    basisA,
    basisB
  );
  const signA = preferredSign < 0
    ? preferredSign
    : (Math.abs(coefficients.a) > 0.3 ? signOrPositive(coefficients.a) : preferredSign);
  const signB = preferredSign < 0
    ? preferredSign
    : (Math.abs(coefficients.b) > 0.3 ? signOrPositive(coefficients.b) : preferredSign);
  let amplitudeA = Math.abs(coefficients.a);
  let amplitudeB = Math.abs(coefficients.b);
  const difference = amplitudeA - amplitudeB;
  const requiresSwap = bit === 1 ? difference < targetStrength : -difference < targetStrength;

  if (!requiresSwap) {
    return;
  }

  const midpoint = (amplitudeA + amplitudeB) / 2;
  if (bit === 1) {
    amplitudeA = midpoint + (targetStrength / 2);
    amplitudeB = Math.max(0, midpoint - (targetStrength / 2));
  } else {
    amplitudeA = Math.max(0, midpoint - (targetStrength / 2));
    amplitudeB = midpoint + (targetStrength / 2);
  }

  const nextA = signA * amplitudeA;
  const nextB = signB * amplitudeB;
  const deltaA = nextA - coefficients.a;
  const deltaB = nextB - coefficients.b;

  for (let localY = 0; localY < 8; localY += 1) {
    for (let localX = 0; localX < 8; localX += 1) {
      const basisIndex = (localY * 8) + localX;
      const lumaDelta = (deltaA * basisA[basisIndex]) + (deltaB * basisB[basisIndex]);
      if (Math.abs(lumaDelta) < 0.0001) {
        continue;
      }

      const pixelX = blockX + localX;
      const pixelY = blockY + localY;
      const pixelIndex = (pixelY * imageWidth + pixelX) * 4;
      const currentR = pixelBytes[pixelIndex];
      const currentG = pixelBytes[pixelIndex + 1];
      const currentB = pixelBytes[pixelIndex + 2];
      const maxPositiveDelta = Math.min(255 - currentR, 255 - currentG, 255 - currentB);
      const maxNegativeDelta = Math.min(currentR, currentG, currentB);
      const safeDelta = lumaDelta >= 0
        ? Math.min(lumaDelta, maxPositiveDelta)
        : Math.max(lumaDelta, -maxNegativeDelta);
      const nudge = safeDelta >= 0 ? 1 : -1;

      let nextR = Math.round(currentR + safeDelta);
      let nextG = Math.round(currentG + safeDelta);
      let nextB = Math.round(currentB + safeDelta);

      if (nextR === currentR && Math.abs(safeDelta) >= 0.18 && currentR + nudge >= 0 && currentR + nudge <= 255) {
        nextR = currentR + nudge;
      }
      if (nextG === currentG && Math.abs(safeDelta) >= 0.18 && currentG + nudge >= 0 && currentG + nudge <= 255) {
        nextG = currentG + nudge;
      }
      if (nextB === currentB && Math.abs(safeDelta) >= 0.18 && currentB + nudge >= 0 && currentB + nudge <= 255) {
        nextB = currentB + nudge;
      }

      pixelBytes[pixelIndex] = nextR;
      pixelBytes[pixelIndex + 1] = nextG;
      pixelBytes[pixelIndex + 2] = nextB;
    }
  }
}

function embedBitIntoV2DctBlock(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  bit: Bit,
  strengthScale: number,
  strengthBias: number,
  coefficientPairs: readonly CoefficientPairSet[]
) {
  if (strengthScale <= 0.001) {
    return;
  }

  const averageLuma = getDctBlockAverageLuma(pixelBytes, imageWidth, blockX, blockY);
  const preferredSign = averageLuma >= 184 ? -1 : 1;

  coefficientPairs.forEach((pair) => {
    const targetStrength = getAdaptiveWatermarkStrength(
      pixelBytes,
      imageWidth,
      blockX,
      blockY,
      strengthBias + pair.strengthBias
    ) * strengthScale;

    embedBitIntoCoefficientPairV2(
      pixelBytes,
      imageWidth,
      blockX,
      blockY,
      bit,
      pair.basisA,
      pair.basisB,
      targetStrength,
      preferredSign
    );
  });
}

function embedSymbolIntoLogicalBlock(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  symbol: number,
  strengthScale: number,
  header: boolean
) {
  const bit0 = ((symbol >>> 1) & 1) as Bit;
  const bit1 = (symbol & 1) as Bit;
  const strengthBias = header ? V2_WATERMARK_HEADER_STRENGTH_BOOST : 0;

  forEachLogicalBlockSubBlock(blockX, blockY, (subBlockX, subBlockY, subBlockIndex) => {
    if (V2_BIT0_SUB_BLOCKS.has(subBlockIndex)) {
      embedBitIntoV2DctBlock(
        pixelBytes,
        imageWidth,
        subBlockX,
        subBlockY,
        bit0,
        strengthScale,
        strengthBias,
        header ? V2_HEADER_BIT0_COEFFICIENT_PAIRS : V2_PAYLOAD_BIT0_COEFFICIENT_PAIRS
      );
      return;
    }

    embedBitIntoV2DctBlock(
      pixelBytes,
      imageWidth,
      subBlockX,
      subBlockY,
      bit1,
      strengthScale,
      strengthBias,
      header ? V2_HEADER_BIT1_COEFFICIENT_PAIRS : V2_PAYLOAD_BIT1_COEFFICIENT_PAIRS
    );
  });
}

function getPayloadMacroBlockInfo(layout: WatermarkV2Layout, macroIndex: number) {
  const blockIndices = getMacroBlockIndices(macroIndex, layout.blocksWide, layout.macroWide);
  const writableBlocks: Array<{
    blockIndex: number;
    blockX: number;
    blockY: number;
    score: number;
  }> = [];

  blockIndices.forEach((blockIndex) => {
    const score = layout.blockScores[blockIndex];
    if (score < V2_PAYLOAD_WRITE_SCORE_THRESHOLD) {
      return;
    }

    const { blockX, blockY } = getBlockOrigin(blockIndex, layout.blocksWide);
    writableBlocks.push({
      blockIndex,
      blockX,
      blockY,
      score
    });
  });

  return writableBlocks;
}

function embedPayloadSymbolIntoMacro(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  layout: WatermarkV2Layout,
  macroIndex: number,
  symbol: number
) {
  const writableBlocksByIndex = new Map(
    getPayloadMacroBlockInfo(layout, macroIndex).map((block) => [block.blockIndex, block])
  );
  const macroStrengthScale = Math.max(
    0.22,
    getPayloadMacroStrengthScale(layout.payloadMacroScores[macroIndex])
  );
  if (macroStrengthScale <= 0.001 || writableBlocksByIndex.size === 0) {
    return;
  }
  const blockIndices = getMacroBlockIndices(macroIndex, layout.blocksWide, layout.macroWide);

  const embedBlock = (blockOffset: number, targetSymbol: number) => {
    const block = writableBlocksByIndex.get(blockIndices[blockOffset]);
    if (!block) {
      return;
    }

    const localStrengthScale = Math.min(
      1.35,
      macroStrengthScale * (0.84 + (0.52 * getDecodeBlockWeight(block.score, false)))
    );
    embedSymbolIntoLogicalBlock(
      pixelBytes,
      imageWidth,
      block.blockX,
      block.blockY,
      targetSymbol,
      localStrengthScale,
      false
    );
  };

  V2_PAYLOAD_BLOCK_OFFSETS.forEach((blockOffset, blockOffsetIndex) => {
    embedBlock(blockOffset, getPayloadBlockCodeword(macroIndex, blockOffsetIndex, symbol));
  });
}

function embedPayloadSymbolsAcrossMacros(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  layout: WatermarkV2Layout,
  symbols: Uint8Array,
  repetitionFactor: number
) {
  const requiredMacros = symbols.length * repetitionFactor;
  if (layout.payloadMacros.length < requiredMacros) {
    throw new Error('Image watermark payload is truncated.');
  }

  for (let symbolIndex = 0; symbolIndex < symbols.length; symbolIndex += 1) {
    const symbol = symbols[symbolIndex];

    for (let repetitionIndex = 0; repetitionIndex < repetitionFactor; repetitionIndex += 1) {
      const macroIndex = layout.payloadMacros[getPayloadMacroOrderIndex(
        symbolIndex,
        repetitionIndex,
        symbols.length,
        repetitionFactor,
        layout.payloadMacros.length
      )];
      embedPayloadSymbolIntoMacro(
        pixelBytes,
        imageWidth,
        layout,
        macroIndex,
        symbol
      );
    }
  }
}

function getMacroOrigin(macroIndex: number, _blocksWide: number, macroWide: number) {
  const macroX = (macroIndex % macroWide) * 2;
  const macroY = Math.floor(macroIndex / macroWide) * 2;

  return {
    blockX: macroX * BLOCK_SIZE,
    blockY: macroY * BLOCK_SIZE
  };
}

function embedHeaderSymbolsAcrossMacros(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  layout: WatermarkV2Layout,
  symbols: Uint8Array
) {
  const requiredMacros = symbols.length * V2_HEADER_REPETITION_FACTOR;
  if (layout.headerMacros.length < requiredMacros) {
    throw new Error('Image watermark header is truncated.');
  }

  for (let symbolIndex = 0; symbolIndex < symbols.length; symbolIndex += 1) {
    const symbol = symbols[symbolIndex];

    for (let repetitionIndex = 0; repetitionIndex < V2_HEADER_REPETITION_FACTOR; repetitionIndex += 1) {
      const macroIndex = layout.headerMacros[(symbolIndex * V2_HEADER_REPETITION_FACTOR) + repetitionIndex];
      const macroScore = getCarrierStrengthScale(layout.headerMacroScores[macroIndex], true);
      if (macroScore <= 0.001) {
        continue;
      }

      const { blockX, blockY } = getMacroOrigin(macroIndex, layout.blocksWide, layout.macroWide);

      for (let macroRow = 0; macroRow < 2; macroRow += 1) {
        for (let macroColumn = 0; macroColumn < 2; macroColumn += 1) {
          embedSymbolIntoLogicalBlock(
            pixelBytes,
            imageWidth,
            blockX + (macroColumn * BLOCK_SIZE),
            blockY + (macroRow * BLOCK_SIZE),
            symbol,
            macroScore,
            true
          );
        }
      }
    }
  }
}

function decodeBitConfidenceFromV2DctBlock(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  coefficientPairs: readonly CoefficientPairSet[]
) {
  let signedDifference = 0;

  coefficientPairs.forEach((pair) => {
    const coefficients = getCoefficientPairForBases(
      pixelBytes,
      imageWidth,
      blockX,
      blockY,
      pair.basisA,
      pair.basisB
    );
    signedDifference += decodeBitConfidenceFromCoefficientPair(coefficients).signedDifference;
  });

  return {
    bit: (signedDifference >= 0 ? 1 : 0) as Bit,
    confidence: Math.abs(signedDifference),
    signedDifference
  };
}

function decodeSymbolFromLogicalBlock(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  header: boolean
) {
  const bitSignedDifferences = [0, 0] as [number, number];
  const bitConfidenceSums = [0, 0] as [number, number];

  forEachLogicalBlockSubBlock(blockX, blockY, (subBlockX, subBlockY, subBlockIndex) => {
    const useBit0 = V2_BIT0_SUB_BLOCKS.has(subBlockIndex);
    const decoded = decodeBitConfidenceFromV2DctBlock(
      pixelBytes,
      imageWidth,
      subBlockX,
      subBlockY,
      useBit0
        ? (header ? V2_HEADER_BIT0_COEFFICIENT_PAIRS : V2_PAYLOAD_BIT0_COEFFICIENT_PAIRS)
        : (header ? V2_HEADER_BIT1_COEFFICIENT_PAIRS : V2_PAYLOAD_BIT1_COEFFICIENT_PAIRS)
    );
    const targetIndex = useBit0 ? 0 : 1;
    bitSignedDifferences[targetIndex] += decoded.signedDifference;
    bitConfidenceSums[targetIndex] += decoded.confidence;
  });

  const bits = [
    (bitSignedDifferences[0] >= 0 ? 1 : 0) as Bit,
    (bitSignedDifferences[1] >= 0 ? 1 : 0) as Bit
  ] as const;
  const confidences = [
    bitConfidenceSums[0] / 2,
    bitConfidenceSums[1] / 2
  ] as const;

  return {
    bits,
    confidences,
    averageConfidence: (confidences[0] + confidences[1]) / V2_LOGICAL_BLOCK_BITS,
    signedDifference: bitSignedDifferences[0] + bitSignedDifferences[1]
  };
}

function decodePayloadSymbolFromMacro(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  layout: WatermarkV2Layout,
  imageHeight: number,
  macroIndex: number
): DecodedPayloadMacroSymbol {
  const blockIndices = getMacroBlockIndices(macroIndex, layout.blocksWide, layout.macroWide);
  const symbolVotes = [0, 0, 0, 0];
  const symbolConfidenceTotals = [0, 0, 0, 0];
  let validBlockCount = 0;

  V2_PAYLOAD_BLOCK_OFFSETS.forEach((blockOffset, blockOffsetIndex) => {
    const blockIndex = blockIndices[blockOffset];
    const { blockX, blockY } = getBlockOrigin(blockIndex, layout.blocksWide);
    if (!isBlockFullyInsideImage(imageWidth, imageHeight, blockX, blockY)) {
      return;
    }

    const decoded = decodeSymbolFromLogicalBlock(
      pixelBytes,
      imageWidth,
      blockX,
      blockY,
      false
    );
    const blockConfidence = Math.min(
      Math.min(...decoded.confidences),
      V2_DECODE_CONFIDENCE_CLAMP
    );
    if (blockConfidence < V2_PAYLOAD_BLOCK_MIN_DECODE_CONFIDENCE) {
      return;
    }

    const codeword = (decoded.bits[0] << 1) | decoded.bits[1];
    const symbol = getPayloadSymbolFromBlockCodeword(macroIndex, blockOffsetIndex, codeword);
    const confidence = blockConfidence;

    symbolVotes[symbol] += confidence;
    symbolConfidenceTotals[symbol] += confidence;
    validBlockCount += 1;
  });

  if (validBlockCount < V2_PAYLOAD_MIN_BLOCKS_PER_MACRO) {
    return {
      bits: [0, 0] as Bit[],
      confidences: [0, 0],
      averageConfidence: 0,
      accepted: false,
      skipped: true,
      agreement: 0
    };
  }

  let symbol = 0;
  let winningConfidence = symbolVotes[0];
  let totalConfidence = symbolConfidenceTotals[0];

  for (let candidate = 1; candidate < symbolVotes.length; candidate += 1) {
    totalConfidence += symbolConfidenceTotals[candidate];
    if (symbolVotes[candidate] > winningConfidence) {
      symbol = candidate;
      winningConfidence = symbolVotes[candidate];
    }
  }

  const agreement = totalConfidence ? winningConfidence / totalConfidence : 0;
  const accepted = winningConfidence > 0.0001 && agreement >= V2_PAYLOAD_SYMBOL_AGREEMENT_THRESHOLD;
  const bits = [
    ((symbol >>> 1) & 1) as Bit,
    (symbol & 1) as Bit
  ];
  const confidence = accepted
    ? (winningConfidence / validBlockCount) * agreement * agreement
    : 0;
  const confidences = [confidence, confidence];

  return {
    bits,
    confidences,
    averageConfidence: confidences.length
      ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
      : 0,
    accepted,
    skipped: false,
    agreement
  };
}

function decodeEncodedPayloadBitsAcrossMacros(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  layout: WatermarkV2Layout,
  encodedBitLength: number,
  repetitionFactor: number
): DecodedBitsDiagnostics {
  const symbolCount = Math.ceil(encodedBitLength / V2_PAYLOAD_SYMBOL_BITS);
  const requiredMacros = symbolCount * repetitionFactor;
  if (layout.payloadMacros.length < requiredMacros) {
    throw new Error('Image watermark payload is truncated.');
  }

  const outputBits: Bit[] = [];
  const outputConfidences: number[] = [];
  let confidenceSum = 0;
  let minimumConfidence = Number.POSITIVE_INFINITY;
  let acceptedMacroCount = 0;
  let rejectedMacroCount = 0;
  let skippedMacroCount = 0;
  let symbolVoteSum = 0;
  let minimumSymbolVotes = Number.POSITIVE_INFINITY;
  let symbolAgreementSum = 0;
  let minimumSymbolAgreement = Number.POSITIVE_INFINITY;
  let macroAgreementSum = 0;
  let minimumMacroAgreement = Number.POSITIVE_INFINITY;

  for (let symbolIndex = 0; symbolIndex < symbolCount; symbolIndex += 1) {
    const weightedVotes = [0, 0];
    const weightedConfidenceSums = [0, 0];
    const weightSums = [0, 0];
    let acceptedSymbolVotes = 0;
    let symbolAgreement = 0;

    for (let repetitionIndex = 0; repetitionIndex < repetitionFactor; repetitionIndex += 1) {
      const macroIndex = layout.payloadMacros[getPayloadMacroOrderIndex(
        symbolIndex,
        repetitionIndex,
        symbolCount,
        repetitionFactor,
        layout.payloadMacros.length
      )];

      const decoded = decodePayloadSymbolFromMacro(
        pixelBytes,
        imageWidth,
        layout,
        imageHeight,
        macroIndex
      );
      if (!decoded.accepted) {
        if (decoded.skipped) {
          skippedMacroCount += 1;
        } else {
          rejectedMacroCount += 1;
        }
        continue;
      }

      acceptedMacroCount += 1;
      acceptedSymbolVotes += 1;
      symbolAgreement += decoded.agreement;
      macroAgreementSum += decoded.agreement;
      minimumMacroAgreement = Math.min(minimumMacroAgreement, decoded.agreement);

      for (let bitIndex = 0; bitIndex < V2_PAYLOAD_SYMBOL_BITS; bitIndex += 1) {
        const clampedConfidence = Math.min(decoded.confidences[bitIndex], V2_DECODE_CONFIDENCE_CLAMP);
        const weightedConfidence = clampedConfidence;
        weightedVotes[bitIndex] += decoded.bits[bitIndex] ? weightedConfidence : -weightedConfidence;
        weightedConfidenceSums[bitIndex] += weightedConfidence;
        weightSums[bitIndex] += 1;
      }
    }

    symbolVoteSum += acceptedSymbolVotes;
    minimumSymbolVotes = Math.min(minimumSymbolVotes, acceptedSymbolVotes);
    const averageSymbolAgreement = acceptedSymbolVotes ? symbolAgreement / acceptedSymbolVotes : 0;
    symbolAgreementSum += averageSymbolAgreement;
    minimumSymbolAgreement = Math.min(minimumSymbolAgreement, averageSymbolAgreement);

    for (let bitIndex = 0; bitIndex < V2_PAYLOAD_SYMBOL_BITS; bitIndex += 1) {
      if (outputBits.length >= encodedBitLength) {
        break;
      }

      const confidence = weightSums[bitIndex]
        ? weightedConfidenceSums[bitIndex] / weightSums[bitIndex]
        : 0;
      outputBits.push((weightedVotes[bitIndex] >= 0 ? 1 : 0) as Bit);
      outputConfidences.push(confidence);
      confidenceSum += confidence;
      minimumConfidence = Math.min(minimumConfidence, confidence);
    }
  }

  return {
    bits: outputBits,
    confidences: outputConfidences,
    averageConfidence: outputBits.length ? confidenceSum / outputBits.length : 0,
    minimumConfidence: Number.isFinite(minimumConfidence) ? minimumConfidence : 0,
    payloadDebug: {
      encodedBitLength,
      symbolCount,
      repetitionFactor,
      requiredMacroCount: requiredMacros,
      acceptedMacroCount,
      rejectedMacroCount,
      skippedMacroCount,
      averageSymbolVotes: symbolCount ? symbolVoteSum / symbolCount : 0,
      minimumSymbolVotes: Number.isFinite(minimumSymbolVotes) ? minimumSymbolVotes : 0,
      averageSymbolAgreement: symbolCount ? symbolAgreementSum / symbolCount : 0,
      minimumSymbolAgreement: Number.isFinite(minimumSymbolAgreement) ? minimumSymbolAgreement : 0,
      averageMacroAgreement: acceptedMacroCount ? macroAgreementSum / acceptedMacroCount : 0,
      minimumMacroAgreement: Number.isFinite(minimumMacroAgreement) ? minimumMacroAgreement : 0,
      averageConfidence: outputBits.length ? confidenceSum / outputBits.length : 0,
      minimumConfidence: Number.isFinite(minimumConfidence) ? minimumConfidence : 0
    }
  };
}

function decodeEncodedHeaderBitsAcrossMacros(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  layout: WatermarkV2Layout
): DecodedBitsDiagnostics {
  const symbolCount = getHeaderSymbolCount();
  const requiredMacros = symbolCount * V2_HEADER_REPETITION_FACTOR;
  if (layout.headerMacros.length < requiredMacros) {
    throw new Error('Image watermark header is truncated.');
  }

  const outputBits: Bit[] = [];
  const outputConfidences: number[] = [];
  let confidenceSum = 0;
  let minimumConfidence = Number.POSITIVE_INFINITY;

  for (let symbolIndex = 0; symbolIndex < symbolCount; symbolIndex += 1) {
    const weightedVotes = [0, 0];
    const weightedConfidenceSums = [0, 0];
    const weightSums = [0, 0];

    for (let repetitionIndex = 0; repetitionIndex < V2_HEADER_REPETITION_FACTOR; repetitionIndex += 1) {
      const macroIndex = layout.headerMacros[(symbolIndex * V2_HEADER_REPETITION_FACTOR) + repetitionIndex];
      const macroWeight = getDecodeBlockWeight(layout.headerMacroScores[macroIndex], true);
      if (macroWeight <= 0.0001) {
        continue;
      }

      const { blockX, blockY } = getMacroOrigin(macroIndex, layout.blocksWide, layout.macroWide);
      let signedDifferences = [0, 0] as [number, number];
      let confidenceTotals = [0, 0] as [number, number];
      let validLogicalBlocks = 0;

      for (let macroRow = 0; macroRow < 2; macroRow += 1) {
        for (let macroColumn = 0; macroColumn < 2; macroColumn += 1) {
          const logicalBlockX = blockX + (macroColumn * BLOCK_SIZE);
          const logicalBlockY = blockY + (macroRow * BLOCK_SIZE);
          if (!isBlockFullyInsideImage(imageWidth, imageHeight, logicalBlockX, logicalBlockY)) {
            continue;
          }

          const decoded = decodeSymbolFromLogicalBlock(
            pixelBytes,
            imageWidth,
            logicalBlockX,
            logicalBlockY,
            true
          );
          signedDifferences = [
            signedDifferences[0] + (decoded.bits[0] ? decoded.confidences[0] : -decoded.confidences[0]),
            signedDifferences[1] + (decoded.bits[1] ? decoded.confidences[1] : -decoded.confidences[1])
          ];
          confidenceTotals = [
            confidenceTotals[0] + decoded.confidences[0],
            confidenceTotals[1] + decoded.confidences[1]
          ];
          validLogicalBlocks += 1;
        }
      }

      if (validLogicalBlocks === 0) {
        continue;
      }

      for (let bitIndex = 0; bitIndex < V2_LOGICAL_BLOCK_BITS; bitIndex += 1) {
        const confidence = Math.min(
          confidenceTotals[bitIndex] / validLogicalBlocks,
          V2_DECODE_CONFIDENCE_CLAMP
        );
        const weightedConfidence = confidence * macroWeight;
        weightedVotes[bitIndex] += signedDifferences[bitIndex] >= 0 ? weightedConfidence : -weightedConfidence;
        weightedConfidenceSums[bitIndex] += weightedConfidence;
        weightSums[bitIndex] += macroWeight;
      }
    }

    for (let bitIndex = 0; bitIndex < V2_LOGICAL_BLOCK_BITS; bitIndex += 1) {
      if (outputBits.length >= V2_HEADER_ENCODED_BIT_LENGTH) {
        break;
      }

      const confidence = weightSums[bitIndex]
        ? weightedConfidenceSums[bitIndex] / weightSums[bitIndex]
        : 0;
      outputBits.push((weightedVotes[bitIndex] >= 0 ? 1 : 0) as Bit);
      outputConfidences.push(confidence);
      confidenceSum += confidence;
      minimumConfidence = Math.min(minimumConfidence, confidence);
    }
  }

  return {
    bits: outputBits,
    confidences: outputConfidences,
    averageConfidence: outputBits.length ? confidenceSum / outputBits.length : 0,
    minimumConfidence: Number.isFinite(minimumConfidence) ? minimumConfidence : 0
  };
}

function buildAnalysisBlockFlags(layout: WatermarkV2Layout) {
  const totalBlocks = layout.blocksWide * layout.blocksHigh;
  const blockFlags = new Uint8Array(totalBlocks);

  layout.headerMacros.forEach((macroIndex) => {
    getMacroBlockIndices(macroIndex, layout.blocksWide, layout.macroWide).forEach((blockIndex) => {
      blockFlags[blockIndex] |= ROBUST_WATERMARK_BLOCK_FLAG_HEADER;
    });
  });
  layout.payloadMacros.forEach((macroIndex) => {
    getMacroBlockIndices(macroIndex, layout.blocksWide, layout.macroWide).forEach((blockIndex) => {
      blockFlags[blockIndex] |= ROBUST_WATERMARK_BLOCK_FLAG_PAYLOAD;
    });
  });

  return blockFlags;
}

function buildV2Header(payloadLength: number, payloadCrc32: number, payloadRepetition: number) {
  return Uint8Array.of(
    V2_HEADER_MAGIC.charCodeAt(0),
    V2_HEADER_MAGIC.charCodeAt(1),
    V2_HEADER_MAGIC.charCodeAt(2),
    V2_HEADER_MAGIC.charCodeAt(3),
    V2_HEADER_VERSION,
    V2_PROTOCOL_ID,
    payloadRepetition,
    V2_HEADER_REPETITION_FACTOR,
    payloadLength & 0xff,
    (payloadLength >>> 8) & 0xff,
    (payloadLength >>> 16) & 0xff,
    (payloadLength >>> 24) & 0xff,
    payloadCrc32 & 0xff,
    (payloadCrc32 >>> 8) & 0xff,
    (payloadCrc32 >>> 16) & 0xff,
    (payloadCrc32 >>> 24) & 0xff
  );
}

function parseV2Header(
  bytes: Uint8Array,
  payloadMacroCount: number,
  getMaxPayloadLength?: (payloadRepetition: number) => number
): ParsedV2Header {
  if (bytes.length < V2_HEADER_SIZE) {
    throw new Error('Watermark header is truncated.');
  }

  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== V2_HEADER_MAGIC) {
    throw new Error('No embedded route watermark found in image.');
  }

  if (bytes[4] !== V2_HEADER_VERSION) {
    throw new Error(`Unsupported route watermark version: ${bytes[4]}`);
  }

  if (bytes[5] !== V2_PROTOCOL_ID) {
    throw new Error('Unsupported route watermark encoding layout.');
  }

  const payloadRepetition = bytes[6];
  const headerRepetition = bytes[7];
  if (payloadRepetition < V2_MIN_PAYLOAD_REPETITION_FACTOR || payloadRepetition > V2_MAX_PAYLOAD_REPETITION_FACTOR) {
    throw new Error('Unsupported route watermark repetition factor.');
  }
  if (headerRepetition !== V2_HEADER_REPETITION_FACTOR) {
    throw new Error('Unsupported route watermark header repetition factor.');
  }

  const payloadLength = (
    bytes[8]
    | (bytes[9] << 8)
    | (bytes[10] << 16)
    | (bytes[11] << 24)
  ) >>> 0;
  const payloadCrc32 = (
    bytes[12]
    | (bytes[13] << 8)
    | (bytes[14] << 16)
    | (bytes[15] << 24)
  ) >>> 0;

  const maxPayloadLength = getMaxPayloadLength?.(payloadRepetition)
    ?? calculateCapacityFromPayloadMacroCount(payloadMacroCount, payloadRepetition);
  if (payloadLength > maxPayloadLength) {
    throw new Error('Image watermark payload is truncated.');
  }

  return {
    payloadLength,
    payloadCrc32,
    payloadRepetition
  };
}

function calculatePayloadCapacityForLayout(layout: WatermarkV2Layout, repetitionFactor: number) {
  return calculateCapacityFromPayloadMacroCount(
    layout.payloadMacros.length,
    repetitionFactor
  );
}

function calculateEffectiveTransportCapacityForLayout(layout: WatermarkV2Layout, repetitionFactor: number) {
  return calculateCapacityFromPayloadMacroCount(
    Math.max(
      countEligiblePayloadMacros(layout.payloadMacros, layout.payloadMacroScores),
      Math.min(layout.payloadMacros.length, 1)
    ),
    repetitionFactor
  );
}

function buildV2GeometryDebug(
  imageWidth: number,
  imageHeight: number,
  pixelBytes?: Uint8ClampedArray
): RobustWatermarkGeometryDebug {
  const geometry = buildV2Geometry(imageWidth, imageHeight);
  const totalBlocks = geometry.blocksWide * geometry.blocksHigh;
  const capacitiesByRepetition = [];
  let capacitySourceMacroCount = geometry.payloadMacros.length;
  let headerBlockCount = geometry.headerMacros.length * 4;
  let payloadBlockCount = geometry.payloadMacros.length * 4;

  if (pixelBytes) {
    const layout = buildV2Layout(pixelBytes, imageWidth, imageHeight);
    capacitySourceMacroCount = Math.max(
      countEligiblePayloadMacros(layout.payloadMacros, layout.payloadMacroScores),
      Math.min(layout.payloadMacros.length, 1)
    );
    headerBlockCount = layout.headerMacros.length * 4;
    payloadBlockCount = layout.payloadMacros.length * 4;
  }

  for (let repetition = V2_MIN_PAYLOAD_REPETITION_FACTOR; repetition <= V2_MAX_PAYLOAD_REPETITION_FACTOR; repetition += 1) {
    capacitiesByRepetition.push({
      repetition,
      capacityBytes: calculateMaxPayloadLengthFromTransportCapacity(
        calculateCapacityFromPayloadMacroCount(capacitySourceMacroCount, repetition)
      )
    });
  }

  return {
    blocksWide: geometry.blocksWide,
    blocksHigh: geometry.blocksHigh,
    totalBlocks,
    headerBlockCount,
    payloadBlockCount,
    capacityBytes: calculateMaxPayloadLengthFromTransportCapacity(
      calculateCapacityFromPayloadMacroCount(capacitySourceMacroCount, V2_MIN_PAYLOAD_REPETITION_FACTOR)
    ),
    capacitiesByRepetition
  };
}

function buildHeaderDebugFromBytes(
  bytes: Uint8Array,
  averageConfidence: number,
  minimumConfidence: number,
  payloadMacroCount: number,
  getMaxPayloadLength?: (payloadRepetition: number) => number
): RobustWatermarkHeaderDebug {
  const payloadRepetition = bytes.length > 6 ? bytes[6] : null;
  const headerRepetition = bytes.length > 7 ? bytes[7] : null;
  const payloadLength = bytes.length >= 12
    ? (
      bytes[8]
      | (bytes[9] << 8)
      | (bytes[10] << 16)
      | (bytes[11] << 24)
    ) >>> 0
    : null;
  const payloadCrc32 = bytes.length >= 16
    ? (
      bytes[12]
      | (bytes[13] << 8)
      | (bytes[14] << 16)
      | (bytes[15] << 24)
    ) >>> 0
    : null;
  let parseError: string | null = null;

  try {
    parseV2Header(bytes, payloadMacroCount, getMaxPayloadLength);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

  return {
    averageConfidence,
    minimumConfidence,
    recoveredBytesHex: bytesToHex(bytes),
    recoveredText: bytesToPrintableText(bytes),
    magic: String.fromCharCode(...bytes.slice(0, Math.min(4, bytes.length))),
    expectedMagic: V2_HEADER_MAGIC,
    magicByteMatches: countMagicByteMatches(bytes, V2_HEADER_MAGIC),
    version: bytes.length > 4 ? bytes[4] : null,
    protocolId: bytes.length > 5 ? bytes[5] : null,
    payloadRepetition,
    headerRepetition,
    payloadLength,
    payloadCrc32Hex: payloadCrc32 === null ? null : formatCrc32Hex(payloadCrc32),
    maxPayloadLength: payloadRepetition === null
      ? null
      : (getMaxPayloadLength?.(payloadRepetition) ?? calculateCapacityFromPayloadMacroCount(payloadMacroCount, payloadRepetition)),
    parseError
  };
}

function buildV2HeaderDebug(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  invertBits = false
): RobustWatermarkHeaderDebug {
  const layout = buildV2Layout(pixelBytes, imageWidth, imageHeight);
  const headerDiagnostics = decodeEncodedHeaderBitsAcrossMacros(
    pixelBytes,
    imageWidth,
    imageHeight,
    layout
  );
  const headerBits = invertBits
    ? headerDiagnostics.bits.map((bit) => (bit ? 0 : 1) as Bit)
    : headerDiagnostics.bits;
  const rawHeaderBits = unpermuteBits(headerBits, V2_PRNG_SEED ^ 0x01);
  const headerBytes = bitsToBytes(
    decodeHamming15_11(rawHeaderBits, V2_HEADER_PLAIN_BITS),
    V2_HEADER_SIZE
  );

  return buildHeaderDebugFromBytes(
    headerBytes,
    headerDiagnostics.averageConfidence,
    headerDiagnostics.minimumConfidence,
    layout.payloadMacros.length,
    (payloadRepetition) => calculatePayloadCapacityForLayout(layout, payloadRepetition)
  );
}

function buildV2PayloadDebug(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  headerDebug: RobustWatermarkHeaderDebug | null
): RobustWatermarkPayloadDebug | null {
  if (
    !headerDebug
    || headerDebug.parseError
    || typeof headerDebug.payloadLength !== 'number'
    || typeof headerDebug.payloadRepetition !== 'number'
  ) {
    return null;
  }

  const layout = buildV2Layout(pixelBytes, imageWidth, imageHeight);
  const payloadEncodedBitLength = getRequiredEncodedBitsForByteLength(headerDebug.payloadLength);
  const payloadDiagnostics = decodeEncodedPayloadBitsAcrossMacros(
    pixelBytes,
    imageWidth,
    imageHeight,
    layout,
    payloadEncodedBitLength,
    headerDebug.payloadRepetition
  );

  const payloadDebug = payloadDiagnostics.payloadDebug;
  if (!payloadDebug) {
    return null;
  }

  try {
    const recoveredPayload = decodePayloadTransport({
      payloadLength: headerDebug.payloadLength,
      payloadCrc32: headerPayloadCrc32FromHex(headerDebug.payloadCrc32Hex),
      payloadRepetition: headerDebug.payloadRepetition
    }, payloadDiagnostics);
    payloadDebug.transportLength = recoveredPayload.transportLength;
    payloadDebug.eccParityBytes = recoveredPayload.eccParityBytes;
    payloadDebug.eccErasedByteCount = recoveredPayload.erasedByteCount;
    payloadDebug.eccCorrectedByteCount = recoveredPayload.correctedByteCount;
  } catch {
    payloadDebug.transportLength = headerDebug.payloadLength;
    payloadDebug.eccParityBytes = null;
  }

  return payloadDebug;
}

function tryExtractRobustWatermarkV2Candidate(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
): WatermarkV2Candidate {
  const layout = buildV2Layout(pixelBytes, imageWidth, imageHeight);
  const headerDiagnostics = decodeEncodedHeaderBitsAcrossMacros(
    pixelBytes,
    imageWidth,
    imageHeight,
    layout
  );
  const rawHeaderBits = unpermuteBits(headerDiagnostics.bits, V2_PRNG_SEED ^ 0x01);
  const headerBytes = bitsToBytes(
    decodeHamming15_11(rawHeaderBits, V2_HEADER_PLAIN_BITS),
    V2_HEADER_SIZE
  );
  const header = parseV2Header(
    headerBytes,
    layout.payloadMacros.length,
    (payloadRepetition) => calculatePayloadCapacityForLayout(layout, payloadRepetition)
  );
  const payloadEncodedBitLength = getRequiredEncodedBitsForByteLength(header.payloadLength);
  const payloadDiagnostics = decodeEncodedPayloadBitsAcrossMacros(
    pixelBytes,
    imageWidth,
    imageHeight,
    layout,
    payloadEncodedBitLength,
    header.payloadRepetition
  );
  const recoveredPayload = decodePayloadTransport(header, payloadDiagnostics);

  return {
    payload: recoveredPayload.payload,
    score: (headerDiagnostics.averageConfidence * 1.8)
      + payloadDiagnostics.averageConfidence
      + (headerDiagnostics.minimumConfidence * 1.3)
      + (payloadDiagnostics.minimumConfidence * 0.85),
    diagnostics: {
      version: 2,
      layoutMode: 'fixed',
      anchorOffsetX: 0,
      anchorOffsetY: 0,
      anchorStrength: 0,
      headerAverageConfidence: headerDiagnostics.averageConfidence,
      headerMinimumConfidence: headerDiagnostics.minimumConfidence,
      payloadAverageConfidence: payloadDiagnostics.averageConfidence,
      payloadMinimumConfidence: payloadDiagnostics.minimumConfidence,
      payloadLength: recoveredPayload.payload.byteLength,
      payloadAcceptedMacroCount: payloadDiagnostics.payloadDebug?.acceptedMacroCount,
      payloadRejectedMacroCount: payloadDiagnostics.payloadDebug?.rejectedMacroCount,
      payloadSkippedMacroCount: payloadDiagnostics.payloadDebug?.skippedMacroCount,
      payloadAverageSymbolVotes: payloadDiagnostics.payloadDebug?.averageSymbolVotes,
      payloadMinimumSymbolVotes: payloadDiagnostics.payloadDebug?.minimumSymbolVotes,
      payloadAverageSymbolAgreement: payloadDiagnostics.payloadDebug?.averageSymbolAgreement,
      payloadMinimumSymbolAgreement: payloadDiagnostics.payloadDebug?.minimumSymbolAgreement,
      payloadAverageMacroAgreement: payloadDiagnostics.payloadDebug?.averageMacroAgreement,
      payloadMinimumMacroAgreement: payloadDiagnostics.payloadDebug?.minimumMacroAgreement,
      payloadTransportLength: recoveredPayload.transportLength,
      payloadEccParityBytes: recoveredPayload.eccParityBytes,
      payloadEccErasedByteCount: recoveredPayload.erasedByteCount,
      payloadEccCorrectedByteCount: recoveredPayload.correctedByteCount
    }
  };
}

export function calculateRobustWatermarkCapacityV2(
  imageWidth: number,
  imageHeight: number,
  pixelBytes?: Uint8ClampedArray
) {
  assertImageSupportsWatermark(imageWidth, imageHeight);

  if (!pixelBytes) {
    const geometry = buildV2Geometry(imageWidth, imageHeight);
    return calculateMaxPayloadLengthFromTransportCapacity(
      calculateCapacityFromPayloadMacroCount(geometry.payloadMacros.length, V2_MIN_PAYLOAD_REPETITION_FACTOR)
    );
  }

  const layout = buildV2Layout(pixelBytes, imageWidth, imageHeight);
  const eligibleMacroCount = Math.max(
    countEligiblePayloadMacros(layout.payloadMacros, layout.payloadMacroScores),
    Math.min(layout.payloadMacros.length, 1)
  );
  return calculateMaxPayloadLengthFromTransportCapacity(
    calculateCapacityFromPayloadMacroCount(eligibleMacroCount, V2_MIN_PAYLOAD_REPETITION_FACTOR)
  );
}

export function embedRobustWatermarkV2(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  payload: Uint8Array,
  options?: RobustWatermarkV2EmbedOptions
) {
  assertImageSupportsWatermark(imageWidth, imageHeight);

  const analysisPixelBytes = options?.referencePixelBytes ?? pixelBytes;
  const layout = buildV2Layout(
    analysisPixelBytes,
    imageWidth,
    imageHeight,
    options?.backgroundPixelBytes ?? pixelBytes,
    options?.excludedRects
  );
  const transportPayload = buildEccTransport(payload);
  const payloadRepetition = choosePayloadRepetitionFactor(transportPayload.byteLength, layout.payloadMacros, layout.payloadMacroScores);
  if (!payloadRepetition) {
    const theoreticalCapacity = calculatePayloadCapacityForLayout(
      layout,
      V2_MIN_PAYLOAD_REPETITION_FACTOR
    );
    const effectiveTransportCapacity = calculateEffectiveTransportCapacityForLayout(
      layout,
      V2_MIN_PAYLOAD_REPETITION_FACTOR
    );
    const effectivePayloadCapacity = calculateMaxPayloadLengthFromTransportCapacity(effectiveTransportCapacity);

    if (transportPayload.byteLength > theoreticalCapacity) {
      throw new Error(`Export image cannot fit robust route watermark (${transportPayload.byteLength} bytes > ${theoreticalCapacity} bytes).`);
    }

    throw new Error(
      `Export image cannot find enough robust watermark carrier slots for ${payload.byteLength} bytes (usable capacity ${effectivePayloadCapacity} bytes, theoretical transport capacity ${theoreticalCapacity} bytes).`
    );
  }

  const headerBytes = buildV2Header(transportPayload.byteLength, crc32(transportPayload), payloadRepetition);
  const headerBits = permuteBits(
    encodeHamming15_11(bytesToBits(headerBytes)),
    V2_PRNG_SEED ^ 0x01
  );
  const payloadBits = permuteBits(
    encodeHamming15_11(bytesToBits(transportPayload)),
    V2_PRNG_SEED ^ transportPayload.byteLength
  );

  embedHeaderSymbolsAcrossMacros(
    pixelBytes,
    imageWidth,
    layout,
    bitsToSymbols(headerBits, V2_HEADER_SYMBOL_BITS)
  );
  embedPayloadSymbolsAcrossMacros(
    pixelBytes,
    imageWidth,
    layout,
    bitsToSymbols(payloadBits, V2_PAYLOAD_SYMBOL_BITS),
    payloadRepetition
  );
}

export function analyzeRobustWatermarkFrequencyV2(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
): RobustWatermarkFrequencyAnalysis {
  assertImageSupportsWatermark(imageWidth, imageHeight);

  const layout = buildV2Layout(pixelBytes, imageWidth, imageHeight);
  const totalBlocks = layout.blocksWide * layout.blocksHigh;
  const signedDifferences = new Float32Array(totalBlocks);
  const confidences = new Float32Array(totalBlocks);
  const blockFlags = buildAnalysisBlockFlags(layout);
  let maxAbsSignedDifference = 0;
  let maxConfidence = 0;
  let confidenceSum = 0;
  let validBlockCount = 0;

  for (let blockIndex = 0; blockIndex < totalBlocks; blockIndex += 1) {
    const { blockX, blockY } = getBlockOrigin(blockIndex, layout.blocksWide);
    if (!isBlockFullyInsideImage(imageWidth, imageHeight, blockX, blockY)) {
      continue;
    }

    const decoded = decodeSymbolFromLogicalBlock(
      pixelBytes,
      imageWidth,
      blockX,
      blockY,
      (blockFlags[blockIndex] & ROBUST_WATERMARK_BLOCK_FLAG_HEADER) !== 0
    );
    signedDifferences[blockIndex] = decoded.signedDifference;
    confidences[blockIndex] = decoded.averageConfidence;
    blockFlags[blockIndex] |= ROBUST_WATERMARK_BLOCK_FLAG_VALID;
    maxAbsSignedDifference = Math.max(maxAbsSignedDifference, Math.abs(decoded.signedDifference));
    maxConfidence = Math.max(maxConfidence, decoded.averageConfidence);
    confidenceSum += decoded.averageConfidence;
    validBlockCount += 1;
  }

  return {
    version: 2,
    layoutMode: 'fixed',
    blocksWide: layout.blocksWide,
    blocksHigh: layout.blocksHigh,
    anchorOffsetX: 0,
    anchorOffsetY: 0,
    anchorStrength: 0,
    maxAbsSignedDifference,
    maxConfidence,
    averageConfidence: validBlockCount ? confidenceSum / validBlockCount : 0,
    validBlockCount,
    signedDifferences,
    confidences,
    blockFlags
  };
}

export function extractRobustWatermarkV2WithDiagnostics(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
): RobustWatermarkExtractionResult {
  assertImageSupportsWatermark(imageWidth, imageHeight);
  return tryExtractRobustWatermarkV2Candidate(pixelBytes, imageWidth, imageHeight);
}

export function extractRobustWatermarkV2(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
) {
  return extractRobustWatermarkV2WithDiagnostics(pixelBytes, imageWidth, imageHeight).payload;
}

export function debugRobustWatermarkV2(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
): RobustWatermarkDebugAttempt {
  let diagnostics = null;
  let error: string | null = null;
  let ok = false;
  let geometry: RobustWatermarkGeometryDebug | null = null;
  let header: RobustWatermarkHeaderDebug | null = null;
  let invertedHeader: RobustWatermarkHeaderDebug | null = null;
  let payload: RobustWatermarkPayloadDebug | null = null;

  try {
    assertImageSupportsWatermark(imageWidth, imageHeight);
    geometry = buildV2GeometryDebug(imageWidth, imageHeight, pixelBytes);
  } catch (debugError) {
    error = debugError instanceof Error ? debugError.message : String(debugError);
  }

  if (geometry) {
    try {
      header = buildV2HeaderDebug(pixelBytes, imageWidth, imageHeight);
    } catch (debugError) {
      header = {
        averageConfidence: 0,
        minimumConfidence: 0,
        recoveredBytesHex: '',
        recoveredText: '',
        magic: '',
        expectedMagic: V2_HEADER_MAGIC,
        magicByteMatches: 0,
        version: null,
        protocolId: null,
        payloadRepetition: null,
        headerRepetition: null,
        payloadLength: null,
        payloadCrc32Hex: null,
        maxPayloadLength: null,
        parseError: debugError instanceof Error ? debugError.message : String(debugError)
      };
    }

    try {
      invertedHeader = buildV2HeaderDebug(pixelBytes, imageWidth, imageHeight, true);
    } catch (debugError) {
      invertedHeader = {
        averageConfidence: 0,
        minimumConfidence: 0,
        recoveredBytesHex: '',
        recoveredText: '',
        magic: '',
        expectedMagic: V2_HEADER_MAGIC,
        magicByteMatches: 0,
        version: null,
        protocolId: null,
        payloadRepetition: null,
        headerRepetition: null,
        payloadLength: null,
        payloadCrc32Hex: null,
        maxPayloadLength: null,
        parseError: debugError instanceof Error ? debugError.message : String(debugError)
      };
    }

    try {
      payload = buildV2PayloadDebug(pixelBytes, imageWidth, imageHeight, header);
    } catch {
      payload = null;
    }

    try {
      const extracted = extractRobustWatermarkV2WithDiagnostics(pixelBytes, imageWidth, imageHeight);
      diagnostics = extracted.diagnostics;
      ok = true;
    } catch (extractError) {
      error = extractError instanceof Error ? extractError.message : String(extractError);
    }
  }

  return {
    version: 2,
    ok,
    error,
    diagnostics,
    geometry,
    header,
    invertedHeader,
    payload
  };
}
