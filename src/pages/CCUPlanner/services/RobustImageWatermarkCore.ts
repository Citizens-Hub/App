import type { Bit } from './RobustImageWatermarkTypes';

export const DCT_BLOCK_SIZE = 8;
export const LOGICAL_BLOCK_REPEAT = 2;
export const BLOCK_SIZE = DCT_BLOCK_SIZE * LOGICAL_BLOCK_REPEAT;
export const HAMMING_DATA_BITS = 11;
export const HAMMING_CODE_BITS = 15;
export const ROUTE_PAYLOAD_MAGIC = 'CHRP';

export interface CoefficientPairDefinition {
  basisA: Float32Array;
  basisB: Float32Array;
  strengthBias: number;
}

export interface CoefficientPair {
  a: number;
  b: number;
}

export interface CoefficientDecision {
  bit: Bit;
  confidence: number;
  signedDifference: number;
}

export function createDctBasis(u: number, v: number) {
  const basis = new Float32Array(DCT_BLOCK_SIZE * DCT_BLOCK_SIZE);
  const alphaU = u === 0 ? 1 / Math.sqrt(2) : 1;
  const alphaV = v === 0 ? 1 / Math.sqrt(2) : 1;
  const normalization = 2 / DCT_BLOCK_SIZE;
  const denominator = DCT_BLOCK_SIZE * 2;

  for (let y = 0; y < DCT_BLOCK_SIZE; y += 1) {
    for (let x = 0; x < DCT_BLOCK_SIZE; x += 1) {
      basis[y * DCT_BLOCK_SIZE + x] = normalization
        * alphaU
        * alphaV
        * Math.cos(((2 * x + 1) * u * Math.PI) / denominator)
        * Math.cos(((2 * y + 1) * v * Math.PI) / denominator);
    }
  }

  return basis;
}

export const COEFFICIENT_A = createDctBasis(1, 2);
export const COEFFICIENT_B = createDctBasis(2, 1);
export const COEFFICIENT_C = createDctBasis(1, 3);
export const COEFFICIENT_D = createDctBasis(3, 1);
export const COEFFICIENT_LOW_A = createDctBasis(1, 0);
export const COEFFICIENT_LOW_B = createDctBasis(0, 1);
export const COEFFICIENT_LOW_C = createDctBasis(1, 1);
export const COEFFICIENT_LOW_D = createDctBasis(2, 0);

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }

  return table;
})();

export function clampColor(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function xorshift32(seed: number) {
  let value = seed >>> 0 || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
  };
}

export function buildBlockOrder(length: number, seed: number) {
  const order = new Uint32Array(length);
  for (let index = 0; index < length; index += 1) {
    order[index] = index;
  }

  const nextRandom = xorshift32(seed ^ length);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = nextRandom() % (index + 1);
    const temp = order[index];
    order[index] = order[swapIndex];
    order[swapIndex] = temp;
  }

  return order;
}

export function bytesToBits(bytes: Uint8Array) {
  const bits: Bit[] = [];

  for (const byte of bytes) {
    for (let bit = 7; bit >= 0; bit -= 1) {
      bits.push(((byte >>> bit) & 1) as Bit);
    }
  }

  return bits;
}

export function bitsToBytes(bits: Bit[], expectedByteLength: number) {
  const bytes = new Uint8Array(expectedByteLength);

  for (let byteIndex = 0; byteIndex < expectedByteLength; byteIndex += 1) {
    let value = 0;

    for (let bitOffset = 0; bitOffset < 8; bitOffset += 1) {
      const bitIndex = (byteIndex * 8) + bitOffset;
      value = (value << 1) | (bits[bitIndex] ?? 0);
    }

    bytes[byteIndex] = value;
  }

  return bytes;
}

export function bitsToNibbles(bits: Bit[]) {
  const nibbleCount = Math.ceil(bits.length / 4);
  const nibbles = new Uint8Array(nibbleCount);

  for (let nibbleIndex = 0; nibbleIndex < nibbleCount; nibbleIndex += 1) {
    let value = 0;

    for (let bitOffset = 0; bitOffset < 4; bitOffset += 1) {
      const bitIndex = (nibbleIndex * 4) + bitOffset;
      value = (value << 1) | (bits[bitIndex] ?? 0);
    }

    nibbles[nibbleIndex] = value;
  }

  return nibbles;
}

export function nibblesToBits(nibbles: Uint8Array, expectedBitLength: number) {
  const bits: Bit[] = [];

  for (const nibble of nibbles) {
    bits.push(((nibble >>> 3) & 1) as Bit);
    bits.push(((nibble >>> 2) & 1) as Bit);
    bits.push(((nibble >>> 1) & 1) as Bit);
    bits.push((nibble & 1) as Bit);
  }

  return bits.slice(0, expectedBitLength);
}

export function buildBitPermutation(length: number, seed: number) {
  const permutation = new Uint32Array(length);
  for (let index = 0; index < length; index += 1) {
    permutation[index] = index;
  }

  const nextRandom = xorshift32(seed ^ length);
  for (let index = permutation.length - 1; index > 0; index -= 1) {
    const swapIndex = nextRandom() % (index + 1);
    const temp = permutation[index];
    permutation[index] = permutation[swapIndex];
    permutation[swapIndex] = temp;
  }

  return permutation;
}

export function permuteBits(bits: Bit[], seed: number) {
  const permutation = buildBitPermutation(bits.length, seed);
  const output = new Array<Bit>(bits.length);

  for (let index = 0; index < bits.length; index += 1) {
    output[permutation[index]] = bits[index];
  }

  return output;
}

export function unpermuteBits(bits: Bit[], seed: number) {
  const permutation = buildBitPermutation(bits.length, seed);
  const output = new Array<Bit>(bits.length);

  for (let index = 0; index < bits.length; index += 1) {
    output[index] = bits[permutation[index]] ?? 0;
  }

  return output;
}

export function encodeHamming15_11(inputBits: Bit[]) {
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

export function decodeHamming15_11(encodedBits: Bit[], expectedPlainBitLength: number) {
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

export function getRequiredEncodedBitsForByteLength(byteLength: number) {
  return Math.ceil((byteLength * 8) / HAMMING_DATA_BITS) * HAMMING_CODE_BITS;
}

export function calculateLumaAt(pixelBytes: Uint8ClampedArray, pixelIndex: number) {
  const r = pixelBytes[pixelIndex];
  const g = pixelBytes[pixelIndex + 1];
  const b = pixelBytes[pixelIndex + 2];
  return (0.299 * r) + (0.587 * g) + (0.114 * b);
}

export function getBlockOrigin(blockIndex: number, blocksWide: number, offsetX = 0, offsetY = 0) {
  const blockX = (blockIndex % blocksWide) * BLOCK_SIZE + offsetX;
  const blockY = Math.floor(blockIndex / blocksWide) * BLOCK_SIZE + offsetY;
  return { blockX, blockY };
}

export function forEachLogicalBlockSubBlock(
  blockX: number,
  blockY: number,
  callback: (subBlockX: number, subBlockY: number, subBlockIndex: number) => void
) {
  let subBlockIndex = 0;

  for (let subBlockRow = 0; subBlockRow < LOGICAL_BLOCK_REPEAT; subBlockRow += 1) {
    for (let subBlockColumn = 0; subBlockColumn < LOGICAL_BLOCK_REPEAT; subBlockColumn += 1) {
      callback(
        blockX + (subBlockColumn * DCT_BLOCK_SIZE),
        blockY + (subBlockRow * DCT_BLOCK_SIZE),
        subBlockIndex
      );
      subBlockIndex += 1;
    }
  }
}

export function isBlockFullyInsideImage(
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

export function assertImageSupportsWatermark(imageWidth: number, imageHeight: number) {
  if (imageWidth < BLOCK_SIZE || imageHeight < BLOCK_SIZE) {
    throw new Error('Image is too small to contain route watermark.');
  }
}

export function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function getNormalizedDctBlockActivity(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number
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

  return clampUnit(sampleCount ? activitySum / (sampleCount * 6) : 0);
}

export function getLogicalBlockActivity(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number
) {
  let activitySum = 0;
  let subBlockCount = 0;

  forEachLogicalBlockSubBlock(blockX, blockY, (subBlockX, subBlockY) => {
    activitySum += getNormalizedDctBlockActivity(pixelBytes, imageWidth, subBlockX, subBlockY);
    subBlockCount += 1;
  });

  return subBlockCount ? activitySum / subBlockCount : 0;
}

export function getLogicalBlockAverageLuma(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number
) {
  let lumaSum = 0;
  let sampleCount = 0;

  for (let localY = 0; localY < BLOCK_SIZE; localY += 1) {
    for (let localX = 0; localX < BLOCK_SIZE; localX += 1) {
      const pixelX = blockX + localX;
      const pixelY = blockY + localY;
      const pixelIndex = (pixelY * imageWidth + pixelX) * 4;
      lumaSum += calculateLumaAt(pixelBytes, pixelIndex);
      sampleCount += 1;
    }
  }

  return sampleCount ? lumaSum / sampleCount : 0;
}

export function computeCoefficient(
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

export function applyCoefficientDelta(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  basisA: Float32Array,
  basisB: Float32Array,
  deltaA: number,
  deltaB: number
) {
  for (let localY = 0; localY < DCT_BLOCK_SIZE; localY += 1) {
    for (let localX = 0; localX < DCT_BLOCK_SIZE; localX += 1) {
      const basisIndex = localY * DCT_BLOCK_SIZE + localX;
      const lumaDelta = (deltaA * basisA[basisIndex]) + (deltaB * basisB[basisIndex]);
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

export function getCoefficientPairForBases(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  basisA: Float32Array,
  basisB: Float32Array
): CoefficientPair {
  return {
    a: computeCoefficient(pixelBytes, imageWidth, blockX, blockY, basisA),
    b: computeCoefficient(pixelBytes, imageWidth, blockX, blockY, basisB)
  };
}

export function signOrPositive(value: number) {
  return value < 0 ? -1 : 1;
}

export function embedBitIntoCoefficientPair(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  bit: Bit,
  basisA: Float32Array,
  basisB: Float32Array,
  coefficients: CoefficientPair,
  targetStrength: number
) {
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

  const nextA = signA * amplitudeA;
  const nextB = signB * amplitudeB;
  applyCoefficientDelta(
    pixelBytes,
    imageWidth,
    blockX,
    blockY,
    basisA,
    basisB,
    nextA - coefficients.a,
    nextB - coefficients.b
  );
}

export function decodeBitConfidenceFromCoefficientPair(coefficients: CoefficientPair): CoefficientDecision {
  const signedDifference = Math.abs(coefficients.a) - Math.abs(coefficients.b);
  return {
    bit: (signedDifference >= 0 ? 1 : 0) as Bit,
    confidence: Math.abs(signedDifference),
    signedDifference
  };
}

export function hasRoutePayloadSignature(bytes: Uint8Array) {
  if (bytes.length < ROUTE_PAYLOAD_MAGIC.length) {
    return false;
  }

  for (let index = 0; index < ROUTE_PAYLOAD_MAGIC.length; index += 1) {
    if (bytes[index] !== ROUTE_PAYLOAD_MAGIC.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
