const BLOCK_SIZE = 8;
const HEADER_MAGIC = 'CHWM';
const HEADER_SIZE = 8;
const HEADER_PLAIN_BITS = HEADER_SIZE * 8;
const HAMMING_DATA_BITS = 11;
const HAMMING_CODE_BITS = 15;
const HEADER_ENCODED_BIT_LENGTH = Math.ceil(HEADER_PLAIN_BITS / HAMMING_DATA_BITS) * HAMMING_CODE_BITS;
const MIN_PAYLOAD_REPETITION_FACTOR = 2;
const HEADER_MIN_REPETITION_FACTOR = 8;
const HEADER_BLOCK_FRACTION = 0.02;
const WATERMARK_STRENGTH = 10;
const PRNG_SEED = 0x43_48_57_4d;
const COEFFICIENT_A = createDctBasis(1, 2);
const COEFFICIENT_B = createDctBasis(2, 1);

type Bit = 0 | 1;

function createDctBasis(u: number, v: number) {
  const basis = new Float32Array(BLOCK_SIZE * BLOCK_SIZE);
  const alphaU = u === 0 ? 1 / Math.sqrt(2) : 1;
  const alphaV = v === 0 ? 1 / Math.sqrt(2) : 1;

  for (let y = 0; y < BLOCK_SIZE; y += 1) {
    for (let x = 0; x < BLOCK_SIZE; x += 1) {
      const value = 0.25
        * alphaU
        * alphaV
        * Math.cos(((2 * x + 1) * u * Math.PI) / 16)
        * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
      basis[y * BLOCK_SIZE + x] = value;
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

function getBlockOrigin(blockIndex: number, blocksWide: number) {
  const blockX = (blockIndex % blocksWide) * BLOCK_SIZE;
  const blockY = Math.floor(blockIndex / blocksWide) * BLOCK_SIZE;
  return { blockX, blockY };
}

function computeCoefficient(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  basis: Float32Array
) {
  let coefficient = 0;

  for (let localY = 0; localY < BLOCK_SIZE; localY += 1) {
    for (let localX = 0; localX < BLOCK_SIZE; localX += 1) {
      const pixelX = blockX + localX;
      const pixelY = blockY + localY;
      const pixelIndex = (pixelY * imageWidth + pixelX) * 4;
      coefficient += calculateLumaAt(pixelBytes, pixelIndex) * basis[localY * BLOCK_SIZE + localX];
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
  for (let localY = 0; localY < BLOCK_SIZE; localY += 1) {
    for (let localX = 0; localX < BLOCK_SIZE; localX += 1) {
      const basisIndex = localY * BLOCK_SIZE + localX;
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

function embedBitIntoBlock(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  bit: Bit
) {
  const coefficients = getCoefficientPair(pixelBytes, imageWidth, blockX, blockY);
  const signA = signOrPositive(coefficients.a);
  const signB = signOrPositive(coefficients.b);
  let amplitudeA = Math.abs(coefficients.a);
  let amplitudeB = Math.abs(coefficients.b);

  const difference = amplitudeA - amplitudeB;
  const requiresSwap = bit === 1 ? difference < WATERMARK_STRENGTH : -difference < WATERMARK_STRENGTH;
  if (!requiresSwap) {
    return;
  }

  const midpoint = (amplitudeA + amplitudeB) / 2;
  if (bit === 1) {
    amplitudeA = midpoint + (WATERMARK_STRENGTH / 2);
    amplitudeB = Math.max(0, midpoint - (WATERMARK_STRENGTH / 2));
  } else {
    amplitudeA = Math.max(0, midpoint - (WATERMARK_STRENGTH / 2));
    amplitudeB = midpoint + (WATERMARK_STRENGTH / 2);
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

function decodeBitFromBlock(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number
): Bit {
  const coefficients = getCoefficientPair(pixelBytes, imageWidth, blockX, blockY);
  return Math.abs(coefficients.a) >= Math.abs(coefficients.b) ? 1 : 0;
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

function buildDistributedBlockSequence(blockOrder: Uint32Array, requiredBlocks: number) {
  if (requiredBlocks > blockOrder.length) {
    throw new Error('Image watermark payload is truncated.');
  }

  const selectedBlocks = new Uint32Array(requiredBlocks);
  for (let index = 0; index < requiredBlocks; index += 1) {
    const sourceIndex = Math.min(
      blockOrder.length - 1,
      Math.floor(((index + 0.5) * blockOrder.length) / requiredBlocks)
    );
    selectedBlocks[index] = blockOrder[sourceIndex];
  }

  return selectedBlocks;
}

function buildRemainingBlockOrder(blockOrder: Uint32Array, reservedBlocks: Uint32Array) {
  const reservedSet = new Uint8Array(blockOrder.length);
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

export function calculateRobustWatermarkCapacity(imageWidth: number, imageHeight: number) {
  assertImageSupportsWatermark(imageWidth, imageHeight);
  const blocksWide = Math.floor(imageWidth / BLOCK_SIZE);
  const blocksHigh = Math.floor(imageHeight / BLOCK_SIZE);
  const totalBlocks = blocksWide * blocksHigh;
  const usablePayloadBlocks = Math.max(0, totalBlocks - getHeaderBlockBudget(totalBlocks));
  const usableCodewords = Math.floor(usablePayloadBlocks / (HAMMING_CODE_BITS * MIN_PAYLOAD_REPETITION_FACTOR));
  const usablePlainBits = usableCodewords * HAMMING_DATA_BITS;
  return Math.max(0, Math.floor(usablePlainBits / 8));
}

function embedEncodedBitsAcrossBlocks(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blocksWide: number,
  selectedBlocks: Uint32Array,
  encodedBits: Bit[]
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
      const { blockX, blockY } = getBlockOrigin(blockIndex, blocksWide);
      embedBitIntoBlock(pixelBytes, imageWidth, blockX, blockY, bit);
    }
  }
}

export function embedRobustWatermark(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  payload: Uint8Array
) {
  assertImageSupportsWatermark(imageWidth, imageHeight);

  const header = byteLengthToHeader(payload.byteLength);
  const headerEncodedBits = encodeHamming15_11(bytesToBits(header));
  const payloadEncodedBits = encodeHamming15_11(bytesToBits(payload));
  const blocksWide = Math.floor(imageWidth / BLOCK_SIZE);
  const blocksHigh = Math.floor(imageHeight / BLOCK_SIZE);
  const blockOrder = buildBlockOrder(blocksWide, blocksHigh);
  const headerBlockBudget = getHeaderBlockBudget(blockOrder.length);
  const headerBlocks = buildDistributedBlockSequence(blockOrder, headerBlockBudget);
  const payloadOrder = buildRemainingBlockOrder(blockOrder, headerBlocks);

  if (payloadOrder.length < payloadEncodedBits.length * MIN_PAYLOAD_REPETITION_FACTOR) {
    const capacity = calculateRobustWatermarkCapacity(imageWidth, imageHeight);
    throw new Error(`Export image cannot fit robust route watermark (${payload.byteLength} bytes > ${capacity} bytes).`);
  }

  embedEncodedBitsAcrossBlocks(pixelBytes, imageWidth, blocksWide, headerBlocks, headerEncodedBits);
  embedEncodedBitsAcrossBlocks(pixelBytes, imageWidth, blocksWide, payloadOrder, payloadEncodedBits);
}

function decodeEncodedBits(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blocksWide: number,
  selectedBlocks: Uint32Array,
  encodedBitLength: number
) {
  if (selectedBlocks.length < encodedBitLength) {
    throw new Error('Image watermark payload is truncated.');
  }

  const output: Bit[] = [];

  for (let bitIndex = 0; bitIndex < encodedBitLength; bitIndex += 1) {
    const startIndex = Math.floor((bitIndex * selectedBlocks.length) / encodedBitLength);
    const endIndex = Math.floor(((bitIndex + 1) * selectedBlocks.length) / encodedBitLength);
    let ones = 0;
    let total = 0;

    for (let blockOrderIndex = startIndex; blockOrderIndex < endIndex; blockOrderIndex += 1) {
      const blockIndex = selectedBlocks[blockOrderIndex];
      const { blockX, blockY } = getBlockOrigin(blockIndex, blocksWide);
      ones += decodeBitFromBlock(pixelBytes, imageWidth, blockX, blockY);
      total += 1;
    }

    output.push(ones * 2 >= total ? 1 : 0);
  }

  return output;
}

export function extractRobustWatermark(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
) {
  assertImageSupportsWatermark(imageWidth, imageHeight);

  const blocksWide = Math.floor(imageWidth / BLOCK_SIZE);
  const blocksHigh = Math.floor(imageHeight / BLOCK_SIZE);
  const blockOrder = buildBlockOrder(blocksWide, blocksHigh);
  const headerBlocks = buildDistributedBlockSequence(blockOrder, getHeaderBlockBudget(blockOrder.length));
  const headerBits = decodeEncodedBits(pixelBytes, imageWidth, blocksWide, headerBlocks, HEADER_ENCODED_BIT_LENGTH);
  const headerBytes = bitsToBytes(decodeHamming15_11(headerBits, HEADER_PLAIN_BITS), HEADER_SIZE);
  const { payloadLength } = parseHeader(headerBytes);

  const payloadEncodedBitLength = getRequiredEncodedBitsForByteLength(payloadLength);
  const payloadOrder = buildRemainingBlockOrder(blockOrder, headerBlocks);
  if (payloadOrder.length < payloadEncodedBitLength * MIN_PAYLOAD_REPETITION_FACTOR) {
    throw new Error('Image watermark payload is truncated.');
  }
  const payloadBits = decodeEncodedBits(pixelBytes, imageWidth, blocksWide, payloadOrder, payloadEncodedBitLength);
  const plainBits = decodeHamming15_11(payloadBits, payloadLength * 8);
  return bitsToBytes(plainBits, payloadLength);
}
