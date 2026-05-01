// Keep the DCT kernel aligned to JPEG's native 8x8 blocks, but group them into
// larger logical watermark cells so each encoded bit survives recompression better.
const DCT_BLOCK_SIZE = 8;
const LOGICAL_BLOCK_REPEAT = 2;
const BLOCK_SIZE = DCT_BLOCK_SIZE * LOGICAL_BLOCK_REPEAT;
const HEADER_MAGIC = 'CHWM';
const HEADER_SIZE = 8;
const HEADER_PLAIN_BITS = HEADER_SIZE * 8;
const HAMMING_DATA_BITS = 11;
const HAMMING_CODE_BITS = 15;
const HEADER_ENCODED_BIT_LENGTH = Math.ceil(HEADER_PLAIN_BITS / HAMMING_DATA_BITS) * HAMMING_CODE_BITS;
const MIN_PAYLOAD_REPETITION_FACTOR = 1;
const HEADER_MIN_REPETITION_FACTOR = 4;
const HEADER_BLOCK_FRACTION = 0.02;
const ANCHOR_SCAN_RANGE = BLOCK_SIZE - 1;
const ANCHOR_PATTERN = [1, 0, 1, 1, 0, 0, 1, 0] as const;
const WATERMARK_STRENGTH_MIN = 5;
const WATERMARK_STRENGTH_MAX = 10;
const WATERMARK_HEADER_STRENGTH_BOOST = 1;
const WATERMARK_ANCHOR_STRENGTH = 12;
const BLOCK_ACTIVITY_DIVISOR = 6;
const INTERNAL_ANCHOR_FRACTION = 0.004;
const INTERNAL_ANCHOR_MIN_COUNT = 24;
const INTERNAL_ANCHOR_MAX_COUNT = 512;
const MAX_ANCHOR_OFFSET_CANDIDATES = 8;
const PRNG_SEED = 0x43_48_57_4d;
const COEFFICIENT_A = createDctBasis(1, 2);
const COEFFICIENT_B = createDctBasis(2, 1);

type Bit = 0 | 1;
type AnchorLayoutMode = 'legacy' | 'enhanced';

interface WatermarkLayout {
  mode: AnchorLayoutMode;
  blocksWide: number;
  blocksHigh: number;
  anchorBlocks: Uint32Array;
  headerBlocks: Uint32Array;
  payloadBlocks: Uint32Array;
}

interface DecodedBitsDiagnostics {
  bits: Bit[];
  averageConfidence: number;
  minimumConfidence: number;
}

export interface RobustWatermarkDiagnostics {
  layoutMode?: AnchorLayoutMode;
  anchorOffsetX: number;
  anchorOffsetY: number;
  anchorStrength: number;
  headerAverageConfidence: number;
  headerMinimumConfidence: number;
  payloadAverageConfidence: number;
  payloadMinimumConfidence: number;
  payloadLength: number;
}

export interface RobustWatermarkExtractionResult {
  payload: Uint8Array;
  diagnostics: RobustWatermarkDiagnostics;
}

export const ROBUST_WATERMARK_BLOCK_FLAG_ANCHOR = 1 << 0;
export const ROBUST_WATERMARK_BLOCK_FLAG_HEADER = 1 << 1;
export const ROBUST_WATERMARK_BLOCK_FLAG_PAYLOAD = 1 << 2;
export const ROBUST_WATERMARK_BLOCK_FLAG_VALID = 1 << 3;

export interface RobustWatermarkFrequencyAnalysis {
  layoutMode: AnchorLayoutMode;
  blocksWide: number;
  blocksHigh: number;
  anchorOffsetX: number;
  anchorOffsetY: number;
  anchorStrength: number;
  maxAbsSignedDifference: number;
  maxConfidence: number;
  averageConfidence: number;
  validBlockCount: number;
  signedDifferences: Float32Array;
  confidences: Float32Array;
  blockFlags: Uint8Array;
}

interface AnchorOffsetCandidate {
  offsetX: number;
  offsetY: number;
  score: number;
  confidence: number;
}

interface WatermarkExtractionCandidate extends RobustWatermarkExtractionResult {
  layoutMode: AnchorLayoutMode;
  anchorScore: number;
}

function createDctBasis(u: number, v: number) {
  const basis = new Float32Array(DCT_BLOCK_SIZE * DCT_BLOCK_SIZE);
  const alphaU = u === 0 ? 1 / Math.sqrt(2) : 1;
  const alphaV = v === 0 ? 1 / Math.sqrt(2) : 1;
  const normalization = 2 / DCT_BLOCK_SIZE;
  const denominator = DCT_BLOCK_SIZE * 2;

  for (let y = 0; y < DCT_BLOCK_SIZE; y += 1) {
    for (let x = 0; x < DCT_BLOCK_SIZE; x += 1) {
      const value = normalization
        * alphaU
        * alphaV
        * Math.cos(((2 * x + 1) * u * Math.PI) / denominator)
        * Math.cos(((2 * y + 1) * v * Math.PI) / denominator);
      basis[y * DCT_BLOCK_SIZE + x] = value;
    }
  }

  return basis;
}

function clampColor(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function xorshift32(seed: number) {
  let value = seed >>> 0 || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
  };
}

function buildBlockOrder(blocksWide: number, blocksHigh: number) {
  const totalBlocks = blocksWide * blocksHigh;
  const order = new Uint32Array(totalBlocks);
  for (let index = 0; index < totalBlocks; index += 1) {
    order[index] = index;
  }

  const nextRandom = xorshift32(PRNG_SEED ^ totalBlocks);
  for (let index = totalBlocks - 1; index > 0; index -= 1) {
    const swapIndex = nextRandom() % (index + 1);
    const temp = order[index];
    order[index] = order[swapIndex];
    order[swapIndex] = temp;
  }

  return order;
}

function byteLengthToHeader(payloadLength: number) {
  return Uint8Array.of(
    HEADER_MAGIC.charCodeAt(0),
    HEADER_MAGIC.charCodeAt(1),
    HEADER_MAGIC.charCodeAt(2),
    HEADER_MAGIC.charCodeAt(3),
    payloadLength & 0xff,
    (payloadLength >>> 8) & 0xff,
    (payloadLength >>> 16) & 0xff,
    (payloadLength >>> 24) & 0xff
  );
}

function parseHeader(bytes: Uint8Array) {
  if (bytes.length < HEADER_SIZE) {
    throw new Error('Watermark header is truncated.');
  }

  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== HEADER_MAGIC) {
    throw new Error('No embedded route watermark found in image.');
  }

  const payloadLength = (
    bytes[4]
    | (bytes[5] << 8)
    | (bytes[6] << 16)
    | (bytes[7] << 24)
  ) >>> 0;

  return {
    payloadLength
  };
}

function bytesToBits(bytes: Uint8Array) {
  const bits: Bit[] = [];
  for (const byte of bytes) {
    for (let bit = 7; bit >= 0; bit -= 1) {
      bits.push(((byte >>> bit) & 1) as Bit);
    }
  }
  return bits;
}

function bitsToBytes(bits: Bit[], expectedByteLength: number) {
  const bytes = new Uint8Array(expectedByteLength);
  for (let byteIndex = 0; byteIndex < expectedByteLength; byteIndex += 1) {
    let value = 0;
    for (let bitOffset = 0; bitOffset < 8; bitOffset += 1) {
      const bitIndex = byteIndex * 8 + bitOffset;
      value = (value << 1) | (bits[bitIndex] ?? 0);
    }
    bytes[byteIndex] = value;
  }
  return bytes;
}

function buildBitPermutation(length: number, seed: number) {
  const permutation = new Uint32Array(length);
  for (let index = 0; index < length; index += 1) {
    permutation[index] = index;
  }

  const nextRandom = xorshift32(seed ^ length);
  for (let index = length - 1; index > 0; index -= 1) {
    const swapIndex = nextRandom() % (index + 1);
    const temp = permutation[index];
    permutation[index] = permutation[swapIndex];
    permutation[swapIndex] = temp;
  }

  return permutation;
}

function permuteBits(bits: Bit[], seed: number) {
  const permutation = buildBitPermutation(bits.length, seed);
  const output = new Array<Bit>(bits.length);

  for (let index = 0; index < bits.length; index += 1) {
    output[permutation[index]] = bits[index];
  }

  return output;
}

function unpermuteBits(bits: Bit[], seed: number) {
  const permutation = buildBitPermutation(bits.length, seed);
  const output = new Array<Bit>(bits.length);

  for (let index = 0; index < bits.length; index += 1) {
    output[index] = bits[permutation[index]] ?? 0;
  }

  return output;
}

function encodeHamming15_11(inputBits: Bit[]) {
  const output: Bit[] = [];
  const dataPositions = [3, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
  const parityPositions = [1, 2, 4, 8];

  for (let offset = 0; offset < inputBits.length; offset += HAMMING_DATA_BITS) {
    const codeword = new Uint8Array(HAMMING_CODE_BITS + 1);
    const chunk = inputBits.slice(offset, offset + HAMMING_DATA_BITS);

    dataPositions.forEach((position, index) => {
      codeword[position] = chunk[index] ?? 0;
    });

    parityPositions.forEach((parityPosition) => {
      let parity = 0;
      for (let position = 1; position <= HAMMING_CODE_BITS; position += 1) {
        if (position & parityPosition) {
          parity ^= codeword[position];
        }
      }
      codeword[parityPosition] = parity;
    });

    for (let position = 1; position <= HAMMING_CODE_BITS; position += 1) {
      output.push(codeword[position] as Bit);
    }
  }

  return output;
}

function decodeHamming15_11(encodedBits: Bit[], expectedPlainBitLength: number) {
  const output: Bit[] = [];
  const dataPositions = [3, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
  const parityPositions = [1, 2, 4, 8];
  const requiredCodewords = Math.ceil(expectedPlainBitLength / HAMMING_DATA_BITS);

  for (let codewordIndex = 0; codewordIndex < requiredCodewords; codewordIndex += 1) {
    const offset = codewordIndex * HAMMING_CODE_BITS;
    const codeword = new Uint8Array(HAMMING_CODE_BITS + 1);

    for (let bitIndex = 0; bitIndex < HAMMING_CODE_BITS; bitIndex += 1) {
      codeword[bitIndex + 1] = encodedBits[offset + bitIndex] ?? 0;
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
    }

    dataPositions.forEach((position) => {
      output.push(codeword[position] as Bit);
    });
  }

  return output.slice(0, expectedPlainBitLength);
}

function getRequiredEncodedBitsForByteLength(byteLength: number) {
  const plainBitLength = byteLength * 8;
  return Math.ceil(plainBitLength / HAMMING_DATA_BITS) * HAMMING_CODE_BITS;
}

function calculateLumaAt(pixelBytes: Uint8ClampedArray, pixelIndex: number) {
  const r = pixelBytes[pixelIndex];
  const g = pixelBytes[pixelIndex + 1];
  const b = pixelBytes[pixelIndex + 2];
  return (0.299 * r) + (0.587 * g) + (0.114 * b);
}

function getBlockOrigin(blockIndex: number, blocksWide: number, offsetX = 0, offsetY = 0) {
  const blockX = (blockIndex % blocksWide) * BLOCK_SIZE + offsetX;
  const blockY = Math.floor(blockIndex / blocksWide) * BLOCK_SIZE + offsetY;
  return { blockX, blockY };
}

function forEachLogicalBlockSubBlock(
  blockX: number,
  blockY: number,
  callback: (subBlockX: number, subBlockY: number) => void
) {
  for (let subBlockRow = 0; subBlockRow < LOGICAL_BLOCK_REPEAT; subBlockRow += 1) {
    for (let subBlockColumn = 0; subBlockColumn < LOGICAL_BLOCK_REPEAT; subBlockColumn += 1) {
      callback(
        blockX + (subBlockColumn * DCT_BLOCK_SIZE),
        blockY + (subBlockRow * DCT_BLOCK_SIZE)
      );
    }
  }
}

function isBlockFullyInsideImage(
  imageWidth: number,
  imageHeight: number,
  blockX: number,
  blockY: number
) {
  return (
    blockX >= 0
    && blockY >= 0
    && (blockX + BLOCK_SIZE) <= imageWidth
    && (blockY + BLOCK_SIZE) <= imageHeight
  );
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getAdaptiveWatermarkStrength(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  strengthBias = 0
) {
  let activitySum = 0;
  let sampleCount = 0;
  const previousRowValues = new Float32Array(DCT_BLOCK_SIZE);

  for (let localY = 0; localY < DCT_BLOCK_SIZE; localY += 1) {
    let previousValue = 0;

    for (let localX = 0; localX < DCT_BLOCK_SIZE; localX += 1) {
      const pixelX = blockX + localX;
      const pixelY = blockY + localY;
      const pixelIndex = (pixelY * imageWidth + pixelX) * 4;
      const luma = calculateLumaAt(pixelBytes, pixelIndex);

      if (localX > 0) {
        activitySum += Math.abs(luma - previousValue);
        sampleCount += 1;
      }

      if (localY > 0) {
        activitySum += Math.abs(luma - previousRowValues[localX]);
        sampleCount += 1;
      }

      previousValue = luma;
      previousRowValues[localX] = luma;
    }
  }

  const normalizedActivity = clampUnit(sampleCount ? activitySum / (sampleCount * BLOCK_ACTIVITY_DIVISOR) : 0);
  return WATERMARK_STRENGTH_MIN
    + ((WATERMARK_STRENGTH_MAX - WATERMARK_STRENGTH_MIN) * normalizedActivity)
    + strengthBias;
}

function computeCoefficient(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  basis: Float32Array
) {
  let coefficient = 0;

  for (let localY = 0; localY < DCT_BLOCK_SIZE; localY += 1) {
    for (let localX = 0; localX < DCT_BLOCK_SIZE; localX += 1) {
      const pixelX = blockX + localX;
      const pixelY = blockY + localY;
      const pixelIndex = (pixelY * imageWidth + pixelX) * 4;
      coefficient += calculateLumaAt(pixelBytes, pixelIndex) * basis[localY * DCT_BLOCK_SIZE + localX];
    }
  }

  return coefficient;
}

function applyCoefficientDelta(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  deltaA: number,
  deltaB: number
) {
  for (let localY = 0; localY < DCT_BLOCK_SIZE; localY += 1) {
    for (let localX = 0; localX < DCT_BLOCK_SIZE; localX += 1) {
      const basisIndex = localY * DCT_BLOCK_SIZE + localX;
      const lumaDelta = (deltaA * COEFFICIENT_A[basisIndex]) + (deltaB * COEFFICIENT_B[basisIndex]);
      if (Math.abs(lumaDelta) < 0.0001) {
        continue;
      }

      const pixelX = blockX + localX;
      const pixelY = blockY + localY;
      const pixelIndex = (pixelY * imageWidth + pixelX) * 4;
      pixelBytes[pixelIndex] = clampColor(pixelBytes[pixelIndex] + lumaDelta);
      pixelBytes[pixelIndex + 1] = clampColor(pixelBytes[pixelIndex + 1] + lumaDelta);
      pixelBytes[pixelIndex + 2] = clampColor(pixelBytes[pixelIndex + 2] + lumaDelta);
    }
  }
}

function getCoefficientPair(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number
) {
  return {
    a: computeCoefficient(pixelBytes, imageWidth, blockX, blockY, COEFFICIENT_A),
    b: computeCoefficient(pixelBytes, imageWidth, blockX, blockY, COEFFICIENT_B)
  };
}

function signOrPositive(value: number) {
  return value < 0 ? -1 : 1;
}

function embedBitIntoDctBlock(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  bit: Bit,
  strengthBias = 0
) {
  const targetStrength = getAdaptiveWatermarkStrength(pixelBytes, imageWidth, blockX, blockY, strengthBias);
  const coefficients = getCoefficientPair(pixelBytes, imageWidth, blockX, blockY);
  const signA = signOrPositive(coefficients.a);
  const signB = signOrPositive(coefficients.b);
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

  const newA = signA * amplitudeA;
  const newB = signB * amplitudeB;
  applyCoefficientDelta(
    pixelBytes,
    imageWidth,
    blockX,
    blockY,
    newA - coefficients.a,
    newB - coefficients.b
  );
}

function embedBitIntoBlock(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  bit: Bit,
  strengthBias = 0
) {
  forEachLogicalBlockSubBlock(blockX, blockY, (subBlockX, subBlockY) => {
    embedBitIntoDctBlock(pixelBytes, imageWidth, subBlockX, subBlockY, bit, strengthBias);
  });
}

function decodeBitConfidenceFromDctBlock(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number
) {
  const coefficients = getCoefficientPair(pixelBytes, imageWidth, blockX, blockY);
  const difference = Math.abs(coefficients.a) - Math.abs(coefficients.b);
  return {
    bit: (difference >= 0 ? 1 : 0) as Bit,
    confidence: Math.abs(difference),
    signedDifference: difference
  };
}

function decodeBitConfidenceFromBlock(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number
) {
  let signedDifferenceSum = 0;

  forEachLogicalBlockSubBlock(blockX, blockY, (subBlockX, subBlockY) => {
    const decoded = decodeBitConfidenceFromDctBlock(pixelBytes, imageWidth, subBlockX, subBlockY);
    signedDifferenceSum += decoded.signedDifference;
  });

  const signedDifference = signedDifferenceSum;

  return {
    bit: (signedDifference >= 0 ? 1 : 0) as Bit,
    confidence: Math.abs(signedDifference),
    signedDifference
  };
}

function assertImageSupportsWatermark(imageWidth: number, imageHeight: number) {
  if (imageWidth < BLOCK_SIZE || imageHeight < BLOCK_SIZE) {
    throw new Error('Image is too small to contain route watermark.');
  }
}

function getHeaderBlockBudget(totalBlocks: number) {
  const proportionalBudget = Math.floor(totalBlocks * HEADER_BLOCK_FRACTION);
  const minimumBudget = HEADER_ENCODED_BIT_LENGTH * HEADER_MIN_REPETITION_FACTOR;
  return Math.min(totalBlocks, Math.max(minimumBudget, proportionalBudget));
}

function takeLeadingBlocks(blockOrder: Uint32Array, requiredBlocks: number) {
  if (requiredBlocks > blockOrder.length) {
    throw new Error('Image watermark payload is truncated.');
  }

  return blockOrder.slice(0, requiredBlocks);
}

function buildRemainingBlockOrder(
  blockOrder: Uint32Array,
  reservedBlocks: Uint32Array,
  totalBlocks: number
) {
  const reservedSet = new Uint8Array(totalBlocks);
  reservedBlocks.forEach((blockIndex) => {
    reservedSet[blockIndex] = 1;
  });

  const remainingBlocks = new Uint32Array(blockOrder.length - reservedBlocks.length);
  let writeIndex = 0;

  blockOrder.forEach((blockIndex) => {
    if (reservedSet[blockIndex]) {
      return;
    }

    remainingBlocks[writeIndex] = blockIndex;
    writeIndex += 1;
  });

  return remainingBlocks;
}

function buildLayout(
  blocksWide: number,
  blocksHigh: number,
  mode: AnchorLayoutMode = 'enhanced',
  contentBlocksOverride?: Uint32Array
) {
  const totalBlocks = blocksWide * blocksHigh;
  const edgeAnchorBlocks = getAnchorRegions(blocksWide, blocksHigh);
  const anchorBlocks = mode === 'enhanced'
    ? mergeBlockLists(edgeAnchorBlocks, getInternalAnchorRegions(blocksWide, blocksHigh, edgeAnchorBlocks))
    : edgeAnchorBlocks;
  const blockOrder = contentBlocksOverride || buildRemainingBlockOrder(buildBlockOrder(blocksWide, blocksHigh), anchorBlocks, totalBlocks);
  const contentBlocks = blockOrder;
  const headerBlocks = takeLeadingBlocks(contentBlocks, Math.min(contentBlocks.length, getHeaderBlockBudget(totalBlocks)));
  const payloadBlocks = buildRemainingBlockOrder(contentBlocks, headerBlocks, totalBlocks);

  return {
    mode,
    blocksWide,
    blocksHigh,
    anchorBlocks,
    headerBlocks,
    payloadBlocks
  } satisfies WatermarkLayout;
}

function buildLayoutFromImage(
  _pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  mode: AnchorLayoutMode = 'enhanced'
) {
  const blocksWide = Math.floor(imageWidth / BLOCK_SIZE);
  const blocksHigh = Math.floor(imageHeight / BLOCK_SIZE);
  return buildLayout(blocksWide, blocksHigh, mode);
}

function embedEncodedBitsAcrossBlocks(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  layout: WatermarkLayout,
  selectedBlocks: Uint32Array,
  encodedBits: Bit[],
  strengthBias = 0,
  offsetX = 0,
  offsetY = 0
) {
  if (selectedBlocks.length < encodedBits.length) {
    throw new Error('Image watermark payload is truncated.');
  }

  for (let bitIndex = 0; bitIndex < encodedBits.length; bitIndex += 1) {
    const startIndex = Math.floor((bitIndex * selectedBlocks.length) / encodedBits.length);
    const endIndex = Math.floor(((bitIndex + 1) * selectedBlocks.length) / encodedBits.length);
    const bit = encodedBits[bitIndex];

    for (let blockOrderIndex = startIndex; blockOrderIndex < endIndex; blockOrderIndex += 1) {
      const blockIndex = selectedBlocks[blockOrderIndex];
      const { blockX, blockY } = getBlockOrigin(blockIndex, layout.blocksWide, offsetX, offsetY);
      embedBitIntoBlock(pixelBytes, imageWidth, blockX, blockY, bit, strengthBias);
    }
  }
}

function decodeEncodedBitsAcrossBlocks(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  layout: WatermarkLayout,
  selectedBlocks: Uint32Array,
  encodedBitLength: number,
  offsetX = 0,
  offsetY = 0
): DecodedBitsDiagnostics {
  if (selectedBlocks.length < encodedBitLength) {
    throw new Error('Image watermark payload is truncated.');
  }

  const bits: Bit[] = [];
  let confidenceSum = 0;
  let minimumConfidence = Number.POSITIVE_INFINITY;

  for (let bitIndex = 0; bitIndex < encodedBitLength; bitIndex += 1) {
    const startIndex = Math.floor((bitIndex * selectedBlocks.length) / encodedBitLength);
    const endIndex = Math.floor(((bitIndex + 1) * selectedBlocks.length) / encodedBitLength);
    let weightedVote = 0;
    let weightTotal = 0;
    let sampleCount = 0;

    for (let blockOrderIndex = startIndex; blockOrderIndex < endIndex; blockOrderIndex += 1) {
      const blockIndex = selectedBlocks[blockOrderIndex];
      const { blockX, blockY } = getBlockOrigin(blockIndex, layout.blocksWide, offsetX, offsetY);
      if (!isBlockFullyInsideImage(imageWidth, imageHeight, blockX, blockY)) {
        continue;
      }

      const decoded = decodeBitConfidenceFromBlock(pixelBytes, imageWidth, blockX, blockY);
      weightedVote += decoded.bit ? decoded.confidence : -decoded.confidence;
      weightTotal += decoded.confidence;
      sampleCount += 1;
    }

    const confidence = sampleCount ? weightTotal / sampleCount : 0;
    const bit = (weightedVote >= 0 ? 1 : 0) as Bit;
    bits.push(bit);
    confidenceSum += confidence;
    minimumConfidence = Math.min(minimumConfidence, confidence);
  }

  return {
    bits,
    averageConfidence: bits.length ? confidenceSum / bits.length : 0,
    minimumConfidence: Number.isFinite(minimumConfidence) ? minimumConfidence : 0
  };
}

function getAnchorRegions(blocksWide: number, blocksHigh: number) {
  const topRows = Math.min(2, blocksHigh);
  const bottomRows = Math.min(2, blocksHigh);
  const leftColumns = Math.min(2, blocksWide);
  const rightColumns = Math.min(2, blocksWide);

  const anchors: number[] = [];

  for (let y = 0; y < topRows; y += 1) {
    for (let x = 0; x < blocksWide; x += 1) {
      anchors.push(y * blocksWide + x);
    }
  }

  for (let y = blocksHigh - bottomRows; y < blocksHigh; y += 1) {
    if (y < 0) continue;
    for (let x = 0; x < blocksWide; x += 1) {
      anchors.push(y * blocksWide + x);
    }
  }

  for (let y = topRows; y < blocksHigh - bottomRows; y += 1) {
    for (let x = 0; x < leftColumns; x += 1) {
      anchors.push(y * blocksWide + x);
    }
    for (let x = blocksWide - rightColumns; x < blocksWide; x += 1) {
      if (x >= 0) {
        anchors.push(y * blocksWide + x);
      }
    }
  }

  return Uint32Array.from(Array.from(new Set(anchors)));
}

function getAnchorBitForBlockIndex(index: number): Bit {
  return ANCHOR_PATTERN[index % ANCHOR_PATTERN.length] as Bit;
}

function getInternalAnchorRegions(
  blocksWide: number,
  blocksHigh: number,
  reservedBlocks: Uint32Array
) {
  const totalBlocks = blocksWide * blocksHigh;
  const reserved = new Uint8Array(totalBlocks);
  reservedBlocks.forEach((blockIndex) => {
    reserved[blockIndex] = 1;
  });

  const candidateBlocks: number[] = [];
  for (let blockY = 2; blockY < blocksHigh - 2; blockY += 1) {
    for (let blockX = 2; blockX < blocksWide - 2; blockX += 1) {
      const blockIndex = (blockY * blocksWide) + blockX;
      if (reserved[blockIndex]) {
        continue;
      }
      candidateBlocks.push(blockIndex);
    }
  }

  if (!candidateBlocks.length) {
    return new Uint32Array(0);
  }

  const desiredCount = Math.max(
    INTERNAL_ANCHOR_MIN_COUNT,
    Math.min(
      INTERNAL_ANCHOR_MAX_COUNT,
      Math.round(candidateBlocks.length * INTERNAL_ANCHOR_FRACTION)
    )
  );
  const count = Math.min(candidateBlocks.length, desiredCount);
  const shuffledCandidates = buildBlockOrder(candidateBlocks.length, 1);
  const anchors = new Uint32Array(count);

  for (let index = 0; index < count; index += 1) {
    anchors[index] = candidateBlocks[shuffledCandidates[index]];
  }

  return anchors;
}

function mergeBlockLists(...lists: Uint32Array[]) {
  const values: number[] = [];
  const seen = new Set<number>();

  lists.forEach((list) => {
    list.forEach((blockIndex) => {
      if (seen.has(blockIndex)) {
        return;
      }
      seen.add(blockIndex);
      values.push(blockIndex);
    });
  });

  return Uint32Array.from(values);
}

function embedAnchorPattern(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blocksWide: number,
  anchorBlocks: Uint32Array
) {
  anchorBlocks.forEach((blockIndex, index) => {
    const { blockX, blockY } = getBlockOrigin(blockIndex, blocksWide);
    embedBitIntoBlock(
      pixelBytes,
      imageWidth,
      blockX,
      blockY,
      getAnchorBitForBlockIndex(index),
      WATERMARK_ANCHOR_STRENGTH - WATERMARK_STRENGTH_MAX
    );
  });
}

function evaluateAnchorOffset(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  blocksWide: number,
  anchorBlocks: Uint32Array,
  offsetX: number,
  offsetY: number
) {
  let score = 0;
  let confidenceSum = 0;
  let sampleCount = 0;

  anchorBlocks.forEach((blockIndex, index) => {
    const { blockX, blockY } = getBlockOrigin(blockIndex, blocksWide, offsetX, offsetY);
    if (!isBlockFullyInsideImage(imageWidth, imageHeight, blockX, blockY)) {
      return;
    }

    const decoded = decodeBitConfidenceFromBlock(pixelBytes, imageWidth, blockX, blockY);
    const expected = getAnchorBitForBlockIndex(index);
    const signed = decoded.signedDifference;
    score += expected === 1 ? signed : -signed;
    confidenceSum += decoded.confidence;
    sampleCount += 1;
  });

  return {
    score,
    averageConfidence: sampleCount ? confidenceSum / sampleCount : 0
  };
}

function findAnchorOffsetCandidates(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  layout: WatermarkLayout
) {
  const candidates: AnchorOffsetCandidate[] = [];

  for (let offsetY = 0; offsetY <= ANCHOR_SCAN_RANGE; offsetY += 1) {
    for (let offsetX = 0; offsetX <= ANCHOR_SCAN_RANGE; offsetX += 1) {
      const evaluation = evaluateAnchorOffset(
        pixelBytes,
        imageWidth,
        imageHeight,
        layout.blocksWide,
        layout.anchorBlocks,
        offsetX,
        offsetY
      );

      candidates.push({
        offsetX,
        offsetY,
        score: evaluation.score,
        confidence: evaluation.averageConfidence
      });
    }
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return right.confidence - left.confidence;
  });

  return candidates.slice(0, MAX_ANCHOR_OFFSET_CANDIDATES);
}

function getBestAnchorOffsetCandidate(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  layout: WatermarkLayout
) {
  return findAnchorOffsetCandidates(pixelBytes, imageWidth, imageHeight, layout)[0] || {
    offsetX: 0,
    offsetY: 0,
    score: 0,
    confidence: 0
  };
}

export function calculateRobustWatermarkCapacity(imageWidth: number, imageHeight: number) {
  assertImageSupportsWatermark(imageWidth, imageHeight);
  const blocksWide = Math.floor(imageWidth / BLOCK_SIZE);
  const blocksHigh = Math.floor(imageHeight / BLOCK_SIZE);
  const layout = buildLayout(blocksWide, blocksHigh, 'enhanced');
  const usablePayloadBlocks = layout.payloadBlocks.length;
  const usableCodewords = Math.floor(usablePayloadBlocks / (HAMMING_CODE_BITS * MIN_PAYLOAD_REPETITION_FACTOR));
  const usablePlainBits = usableCodewords * HAMMING_DATA_BITS;
  return Math.max(0, Math.floor(usablePlainBits / 8));
}

export function embedRobustWatermark(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  payload: Uint8Array
) {
  assertImageSupportsWatermark(imageWidth, imageHeight);

  const layout = buildLayoutFromImage(pixelBytes, imageWidth, imageHeight, 'enhanced');
  const header = byteLengthToHeader(payload.byteLength);
  const headerEncodedBits = permuteBits(encodeHamming15_11(bytesToBits(header)), PRNG_SEED ^ 0x01);
  const payloadEncodedBits = permuteBits(encodeHamming15_11(bytesToBits(payload)), PRNG_SEED ^ payload.byteLength);

  if (layout.payloadBlocks.length < payloadEncodedBits.length * MIN_PAYLOAD_REPETITION_FACTOR) {
    const capacity = calculateRobustWatermarkCapacity(imageWidth, imageHeight);
    throw new Error(`Export image cannot fit robust route watermark (${payload.byteLength} bytes > ${capacity} bytes).`);
  }

  embedAnchorPattern(pixelBytes, imageWidth, layout.blocksWide, layout.anchorBlocks);
  embedEncodedBitsAcrossBlocks(
    pixelBytes,
    imageWidth,
    layout,
    layout.headerBlocks,
    headerEncodedBits,
    WATERMARK_HEADER_STRENGTH_BOOST
  );
  embedEncodedBitsAcrossBlocks(pixelBytes, imageWidth, layout, layout.payloadBlocks, payloadEncodedBits);
}

function buildAnalysisBlockFlags(layout: WatermarkLayout) {
  const totalBlocks = layout.blocksWide * layout.blocksHigh;
  const blockFlags = new Uint8Array(totalBlocks);

  layout.anchorBlocks.forEach((blockIndex) => {
    blockFlags[blockIndex] |= ROBUST_WATERMARK_BLOCK_FLAG_ANCHOR;
  });

  layout.headerBlocks.forEach((blockIndex) => {
    blockFlags[blockIndex] |= ROBUST_WATERMARK_BLOCK_FLAG_HEADER;
  });

  layout.payloadBlocks.forEach((blockIndex) => {
    blockFlags[blockIndex] |= ROBUST_WATERMARK_BLOCK_FLAG_PAYLOAD;
  });

  return blockFlags;
}

export function analyzeRobustWatermarkFrequency(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
): RobustWatermarkFrequencyAnalysis {
  assertImageSupportsWatermark(imageWidth, imageHeight);

  const blocksWide = Math.floor(imageWidth / BLOCK_SIZE);
  const blocksHigh = Math.floor(imageHeight / BLOCK_SIZE);
  const layout = buildLayoutFromImage(pixelBytes, imageWidth, imageHeight, 'enhanced');
  const anchorResult = getBestAnchorOffsetCandidate(pixelBytes, imageWidth, imageHeight, layout);
  const signedDifferences = new Float32Array(blocksWide * blocksHigh);
  const confidences = new Float32Array(blocksWide * blocksHigh);
  const blockFlags = buildAnalysisBlockFlags(layout);
  let maxAbsSignedDifference = 0;
  let maxConfidence = 0;
  let confidenceSum = 0;
  let validBlockCount = 0;

  for (let blockIndex = 0; blockIndex < signedDifferences.length; blockIndex += 1) {
    const { blockX, blockY } = getBlockOrigin(
      blockIndex,
      blocksWide,
      anchorResult.offsetX,
      anchorResult.offsetY
    );

    if (!isBlockFullyInsideImage(imageWidth, imageHeight, blockX, blockY)) {
      continue;
    }

    const decoded = decodeBitConfidenceFromBlock(pixelBytes, imageWidth, blockX, blockY);
    signedDifferences[blockIndex] = decoded.signedDifference;
    confidences[blockIndex] = decoded.confidence;
    blockFlags[blockIndex] |= ROBUST_WATERMARK_BLOCK_FLAG_VALID;
    maxAbsSignedDifference = Math.max(maxAbsSignedDifference, Math.abs(decoded.signedDifference));
    maxConfidence = Math.max(maxConfidence, decoded.confidence);
    confidenceSum += decoded.confidence;
    validBlockCount += 1;
  }

  return {
    layoutMode: layout.mode,
    blocksWide,
    blocksHigh,
    anchorOffsetX: anchorResult.offsetX,
    anchorOffsetY: anchorResult.offsetY,
    anchorStrength: anchorResult.confidence,
    maxAbsSignedDifference,
    maxConfidence,
    averageConfidence: validBlockCount ? confidenceSum / validBlockCount : 0,
    validBlockCount,
    signedDifferences,
    confidences,
    blockFlags
  };
}

function tryExtractRobustWatermarkCandidate(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  mode: AnchorLayoutMode,
  interleaved: boolean
): WatermarkExtractionCandidate {
  const layout = buildLayoutFromImage(pixelBytes, imageWidth, imageHeight, mode);
  const anchorCandidates = findAnchorOffsetCandidates(pixelBytes, imageWidth, imageHeight, layout);
  let bestCandidate: WatermarkExtractionCandidate | null = null;
  let bestError: Error | null = null;

  for (const anchorResult of anchorCandidates) {
    try {
      const headerDiagnostics = decodeEncodedBitsAcrossBlocks(
        pixelBytes,
        imageWidth,
        imageHeight,
        layout,
        layout.headerBlocks,
        HEADER_ENCODED_BIT_LENGTH,
        anchorResult.offsetX,
        anchorResult.offsetY
      );
      const rawHeaderBits = interleaved
        ? unpermuteBits(headerDiagnostics.bits, PRNG_SEED ^ 0x01)
        : headerDiagnostics.bits;
      const headerBytes = bitsToBytes(
        decodeHamming15_11(rawHeaderBits, HEADER_PLAIN_BITS),
        HEADER_SIZE
      );
      const { payloadLength } = parseHeader(headerBytes);
      const payloadEncodedBitLength = getRequiredEncodedBitsForByteLength(payloadLength);

      if (layout.payloadBlocks.length < payloadEncodedBitLength * MIN_PAYLOAD_REPETITION_FACTOR) {
        throw new Error('Image watermark payload is truncated.');
      }

      const payloadDiagnostics = decodeEncodedBitsAcrossBlocks(
        pixelBytes,
        imageWidth,
        imageHeight,
        layout,
        layout.payloadBlocks,
        payloadEncodedBitLength,
        anchorResult.offsetX,
        anchorResult.offsetY
      );
      const rawPayloadBits = interleaved
        ? unpermuteBits(payloadDiagnostics.bits, PRNG_SEED ^ payloadLength)
        : payloadDiagnostics.bits;
      const payloadBits = decodeHamming15_11(rawPayloadBits, payloadLength * 8);
      const payload = bitsToBytes(payloadBits, payloadLength);

      const candidate: WatermarkExtractionCandidate = {
        payload,
        layoutMode: mode,
        anchorScore: anchorResult.score,
        diagnostics: {
          layoutMode: mode,
          anchorOffsetX: anchorResult.offsetX,
          anchorOffsetY: anchorResult.offsetY,
          anchorStrength: anchorResult.confidence,
          headerAverageConfidence: headerDiagnostics.averageConfidence,
          headerMinimumConfidence: headerDiagnostics.minimumConfidence,
          payloadAverageConfidence: payloadDiagnostics.averageConfidence,
          payloadMinimumConfidence: payloadDiagnostics.minimumConfidence,
          payloadLength
        }
      };

      if (!bestCandidate) {
        bestCandidate = candidate;
        continue;
      }

      const candidateScore = candidate.anchorScore
        + candidate.diagnostics.headerAverageConfidence
        + candidate.diagnostics.payloadAverageConfidence;
      const bestScore = bestCandidate.anchorScore
        + bestCandidate.diagnostics.headerAverageConfidence
        + bestCandidate.diagnostics.payloadAverageConfidence;

      if (candidateScore > bestScore) {
        bestCandidate = candidate;
      }
    } catch (error) {
      bestError = error instanceof Error ? error : new Error('Watermark decode failed.');
    }
  }

  if (bestCandidate) {
    return bestCandidate;
  }

  throw bestError || new Error('No embedded route watermark found in image.');
}

export function extractRobustWatermarkWithDiagnostics(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
): RobustWatermarkExtractionResult {
  assertImageSupportsWatermark(imageWidth, imageHeight);

  const attempts: Array<{ mode: AnchorLayoutMode; interleaved: boolean }> = [
    { mode: 'enhanced', interleaved: true },
    { mode: 'enhanced', interleaved: false },
    { mode: 'legacy', interleaved: false }
  ];
  let bestCandidate: WatermarkExtractionCandidate | null = null;
  let bestError: Error | null = null;

  for (const attempt of attempts) {
    try {
      const candidate = tryExtractRobustWatermarkCandidate(
        pixelBytes,
        imageWidth,
        imageHeight,
        attempt.mode,
        attempt.interleaved
      );

      if (!bestCandidate) {
        bestCandidate = candidate;
        continue;
      }

      const candidateScore = candidate.anchorScore + candidate.diagnostics.payloadAverageConfidence;
      const bestScore = bestCandidate.anchorScore + bestCandidate.diagnostics.payloadAverageConfidence;
      if (candidateScore > bestScore) {
        bestCandidate = candidate;
      }
    } catch (error) {
      bestError = error instanceof Error ? error : new Error('Watermark decode failed.');
    }
  }

  if (!bestCandidate) {
    throw bestError || new Error('No embedded route watermark found in image.');
  }

  return {
    payload: bestCandidate.payload,
    diagnostics: bestCandidate.diagnostics
  };
}

export function extractRobustWatermark(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
) {
  return extractRobustWatermarkWithDiagnostics(pixelBytes, imageWidth, imageHeight).payload;
}
