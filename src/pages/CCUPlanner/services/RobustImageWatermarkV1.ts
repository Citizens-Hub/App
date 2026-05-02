import {
  BLOCK_SIZE,
  COEFFICIENT_A,
  COEFFICIENT_B,
  HAMMING_CODE_BITS,
  buildBlockOrder,
  getBlockOrigin,
  assertImageSupportsWatermark,
  bitsToBytes,
  decodeBitConfidenceFromCoefficientPair,
  decodeHamming15_11,
  forEachLogicalBlockSubBlock,
  getCoefficientPairForBases,
  getRequiredEncodedBitsForByteLength,
  hasRoutePayloadSignature,
  isBlockFullyInsideImage,
  unpermuteBits
} from './RobustImageWatermarkCore';
import {
  ROBUST_WATERMARK_BLOCK_FLAG_ANCHOR,
  ROBUST_WATERMARK_BLOCK_FLAG_HEADER,
  ROBUST_WATERMARK_BLOCK_FLAG_PAYLOAD,
  ROBUST_WATERMARK_BLOCK_FLAG_VALID,
  type AnchorLayoutMode,
  type Bit,
  type RobustWatermarkExtractionResult,
  type RobustWatermarkFrequencyAnalysis
} from './RobustImageWatermarkTypes';

const HEADER_MAGIC = 'CHWM';
const HEADER_SIZE = 8;
const HEADER_PLAIN_BITS = HEADER_SIZE * 8;
const HEADER_ENCODED_BIT_LENGTH = Math.ceil(HEADER_PLAIN_BITS / 11) * HAMMING_CODE_BITS;
const MIN_PAYLOAD_REPETITION_FACTOR = 1;
const HEADER_MIN_REPETITION_FACTOR = 4;
const HEADER_BLOCK_FRACTION = 0.02;
const ANCHOR_SCAN_RANGE = BLOCK_SIZE - 1;
const ANCHOR_PATTERN = [1, 0, 1, 1, 0, 0, 1, 0] as const;
const INTERNAL_ANCHOR_FRACTION = 0.004;
const INTERNAL_ANCHOR_MIN_COUNT = 24;
const INTERNAL_ANCHOR_MAX_COUNT = 512;
const MAX_ANCHOR_OFFSET_CANDIDATES = 8;
const PRNG_SEED = 0x43_48_57_4d;

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

  return { payloadLength };
}

function decodeBitConfidenceFromDctBlock(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number
) {
  const coefficients = getCoefficientPairForBases(
    pixelBytes,
    imageWidth,
    blockX,
    blockY,
    COEFFICIENT_A,
    COEFFICIENT_B
  );
  return decodeBitConfidenceFromCoefficientPair(coefficients);
}

function decodeBitConfidenceFromBlock(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number
) {
  let signedDifference = 0;

  forEachLogicalBlockSubBlock(blockX, blockY, (subBlockX, subBlockY) => {
    signedDifference += decodeBitConfidenceFromDctBlock(pixelBytes, imageWidth, subBlockX, subBlockY).signedDifference;
  });

  return {
    bit: (signedDifference >= 0 ? 1 : 0) as Bit,
    confidence: Math.abs(signedDifference),
    signedDifference
  };
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
  const reserved = new Uint8Array(totalBlocks);
  reservedBlocks.forEach((blockIndex) => {
    reserved[blockIndex] = 1;
  });

  const remaining = new Uint32Array(blockOrder.length - reservedBlocks.length);
  let writeIndex = 0;

  blockOrder.forEach((blockIndex) => {
    if (reserved[blockIndex]) {
      return;
    }
    remaining[writeIndex] = blockIndex;
    writeIndex += 1;
  });

  return remaining;
}

function getAnchorRegions(blocksWide: number, blocksHigh: number) {
  const topRows = Math.min(2, blocksHigh);
  const bottomRows = Math.min(2, blocksHigh);
  const leftColumns = Math.min(2, blocksWide);
  const rightColumns = Math.min(2, blocksWide);
  const anchors: number[] = [];

  for (let y = 0; y < topRows; y += 1) {
    for (let x = 0; x < blocksWide; x += 1) {
      anchors.push((y * blocksWide) + x);
    }
  }

  for (let y = blocksHigh - bottomRows; y < blocksHigh; y += 1) {
    if (y < 0) {
      continue;
    }
    for (let x = 0; x < blocksWide; x += 1) {
      anchors.push((y * blocksWide) + x);
    }
  }

  for (let y = topRows; y < blocksHigh - bottomRows; y += 1) {
    for (let x = 0; x < leftColumns; x += 1) {
      anchors.push((y * blocksWide) + x);
    }
    for (let x = blocksWide - rightColumns; x < blocksWide; x += 1) {
      if (x >= 0) {
        anchors.push((y * blocksWide) + x);
      }
    }
  }

  return Uint32Array.from(Array.from(new Set(anchors)));
}

function getAnchorBitForBlockIndex(index: number) {
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
      if (!reserved[blockIndex]) {
        candidateBlocks.push(blockIndex);
      }
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
  const shuffled = buildBlockOrder(candidateBlocks.length, PRNG_SEED);
  const anchors = new Uint32Array(count);

  for (let index = 0; index < count; index += 1) {
    anchors[index] = candidateBlocks[shuffled[index]];
  }

  return anchors;
}

function mergeBlockLists(...lists: Uint32Array[]) {
  const seen = new Set<number>();
  const values: number[] = [];

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

function buildLayout(
  blocksWide: number,
  blocksHigh: number,
  mode: AnchorLayoutMode = 'enhanced'
) {
  const totalBlocks = blocksWide * blocksHigh;
  const edgeAnchorBlocks = getAnchorRegions(blocksWide, blocksHigh);
  const anchorBlocks = mode === 'enhanced'
    ? mergeBlockLists(edgeAnchorBlocks, getInternalAnchorRegions(blocksWide, blocksHigh, edgeAnchorBlocks))
    : edgeAnchorBlocks;
  const contentBlocks = buildRemainingBlockOrder(
    buildBlockOrder(totalBlocks, PRNG_SEED),
    anchorBlocks,
    totalBlocks
  );
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

function buildLayoutFromImage(imageWidth: number, imageHeight: number, mode: AnchorLayoutMode = 'enhanced') {
  const blocksWide = Math.floor(imageWidth / BLOCK_SIZE);
  const blocksHigh = Math.floor(imageHeight / BLOCK_SIZE);
  return buildLayout(blocksWide, blocksHigh, mode);
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
    bits.push((weightedVote >= 0 ? 1 : 0) as Bit);
    confidenceSum += confidence;
    minimumConfidence = Math.min(minimumConfidence, confidence);
  }

  return {
    bits,
    averageConfidence: bits.length ? confidenceSum / bits.length : 0,
    minimumConfidence: Number.isFinite(minimumConfidence) ? minimumConfidence : 0
  };
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
    score += expected === 1 ? decoded.signedDifference : -decoded.signedDifference;
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

function tryExtractRobustWatermarkV1Candidate(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  mode: AnchorLayoutMode,
  interleaved: boolean
): WatermarkExtractionCandidate {
  const layout = buildLayoutFromImage(imageWidth, imageHeight, mode);
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
      const payload = bitsToBytes(
        decodeHamming15_11(rawPayloadBits, payloadLength * 8),
        payloadLength
      );

      if (!hasRoutePayloadSignature(payload)) {
        throw new Error('Route payload signature mismatch.');
      }

      const candidate: WatermarkExtractionCandidate = {
        payload,
        layoutMode: mode,
        anchorScore: anchorResult.score,
        diagnostics: {
          version: 1,
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

export function analyzeRobustWatermarkFrequencyV1(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
): RobustWatermarkFrequencyAnalysis {
  assertImageSupportsWatermark(imageWidth, imageHeight);

  const blocksWide = Math.floor(imageWidth / BLOCK_SIZE);
  const blocksHigh = Math.floor(imageHeight / BLOCK_SIZE);
  const layout = buildLayoutFromImage(imageWidth, imageHeight, 'enhanced');
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
    version: 1,
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

export function extractRobustWatermarkV1WithDiagnostics(
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
      const candidate = tryExtractRobustWatermarkV1Candidate(
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

export function extractRobustWatermarkV1(
  pixelBytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
) {
  return extractRobustWatermarkV1WithDiagnostics(pixelBytes, imageWidth, imageHeight).payload;
}
