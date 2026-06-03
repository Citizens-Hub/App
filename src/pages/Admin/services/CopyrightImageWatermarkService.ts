export const COPYRIGHT_WATERMARK_TEXT = "Citizens' Hub";

export type CopyrightWatermarkOutputFormat = 'auto' | 'png' | 'jpeg' | 'webp';
export type CopyrightWatermarkConfidence = 'none' | 'low' | 'medium' | 'high';

export interface CopyrightWatermarkProcessOptions {
  strength: number;
  outputFormat?: CopyrightWatermarkOutputFormat;
  quality?: number;
}

export interface CopyrightWatermarkProcessResult {
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
  inputType: string;
  outputType: string;
  hasTransparency: boolean;
}

export interface CopyrightWatermarkVerificationResult {
  blob: Blob;
  width: number;
  height: number;
  score: number;
  detected: boolean;
  confidence: CopyrightWatermarkConfidence;
  signalDifference: number;
  insideSignal: number;
  outsideSignal: number;
}

const DEFAULT_OUTPUT_QUALITY = 0.96;
const DEFAULT_OUTPUT_FORMAT: CopyrightWatermarkOutputFormat = 'auto';
const WATERMARK_SUFFIX = 'citizenshub-watermarked';
const REVEAL_SUFFIX = 'citizenshub-watermark-check';
const MIN_STRENGTH = 0;
const MAX_STRENGTH = 100;
const DCT_BLOCK_SIZE = 8;
const MIN_BLOCKS_WIDE = 24;
const MIN_BLOCKS_HIGH = 16;
const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'bmp']);

type CoefficientBasis = Float32Array;

interface DecodedCanvasImage {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  imageData: ImageData;
  width: number;
  height: number;
}

interface FrequencyWatermarkGeometry {
  blocksWide: number;
  blocksHigh: number;
  usableWidth: number;
  usableHeight: number;
}

interface FrequencyWatermarkAnalysis {
  insideSignal: number;
  outsideSignal: number;
  outsideStdDev: number;
  signalDifference: number;
  score: number;
  confidence: CopyrightWatermarkConfidence;
  detected: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampByte(value: number) {
  return Math.round(clamp(value, 0, 255));
}

function getFileExtension(fileName: string) {
  const match = /\.([^.]+)$/.exec(fileName);
  return match?.[1]?.toLowerCase() || '';
}

function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]*$/, '');
}

function getOutputExtension(mimeType: string) {
  if (mimeType === 'image/jpeg') {
    return 'jpg';
  }

  if (mimeType === 'image/webp') {
    return 'webp';
  }

  return 'png';
}

function normalizeInputType(file: File) {
  const fileType = file.type.toLowerCase();
  if (fileType) {
    return fileType;
  }

  const extension = getFileExtension(file.name);
  if (extension === 'jpg' || extension === 'jpeg') {
    return 'image/jpeg';
  }

  if (extension === 'webp') {
    return 'image/webp';
  }

  if (extension === 'png') {
    return 'image/png';
  }

  return '';
}

function getRequestedMimeType(
  file: File,
  hasTransparency: boolean,
  outputFormat: CopyrightWatermarkOutputFormat,
) {
  if (outputFormat === 'png') {
    return 'image/png';
  }

  if (outputFormat === 'jpeg') {
    return hasTransparency ? 'image/png' : 'image/jpeg';
  }

  if (outputFormat === 'webp') {
    return 'image/webp';
  }

  if (hasTransparency) {
    return 'image/png';
  }

  const inputType = normalizeInputType(file);
  if (inputType === 'image/jpeg' || inputType === 'image/png' || inputType === 'image/webp') {
    return inputType;
  }

  return 'image/png';
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getCanvasContext(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Unable to initialize image canvas.');
  }

  return ctx;
}

async function decodeFileToCanvas(file: File): Promise<DecodedCanvasImage> {
  const imageBitmap = await createImageBitmap(file);

  try {
    const canvas = createCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = getCanvasContext(canvas);
    ctx.drawImage(imageBitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, imageBitmap.width, imageBitmap.height);

    return {
      canvas,
      ctx,
      imageData,
      width: imageBitmap.width,
      height: imageBitmap.height,
    };
  } finally {
    imageBitmap.close();
  }
}

function hasTransparentPixels(imageData: ImageData) {
  const data = imageData.data;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 255) {
      return true;
    }
  }

  return false;
}

function getFrequencyWatermarkGeometry(width: number, height: number): FrequencyWatermarkGeometry {
  const blocksWide = Math.floor(width / DCT_BLOCK_SIZE);
  const blocksHigh = Math.floor(height / DCT_BLOCK_SIZE);

  if (blocksWide < MIN_BLOCKS_WIDE || blocksHigh < MIN_BLOCKS_HIGH) {
    throw new Error('Image is too small for the frequency-domain watermark.');
  }

  return {
    blocksWide,
    blocksHigh,
    usableWidth: blocksWide * DCT_BLOCK_SIZE,
    usableHeight: blocksHigh * DCT_BLOCK_SIZE,
  };
}

function createDctBasis(u: number, v: number): CoefficientBasis {
  const basis = new Float32Array(DCT_BLOCK_SIZE * DCT_BLOCK_SIZE);
  const normalization = 2 / DCT_BLOCK_SIZE;
  const denominator = DCT_BLOCK_SIZE * 2;

  for (let y = 0; y < DCT_BLOCK_SIZE; y += 1) {
    for (let x = 0; x < DCT_BLOCK_SIZE; x += 1) {
      basis[y * DCT_BLOCK_SIZE + x] = normalization
        * Math.cos(((2 * x + 1) * u * Math.PI) / denominator)
        * Math.cos(((2 * y + 1) * v * Math.PI) / denominator);
    }
  }

  return basis;
}

const COEFFICIENT_A = createDctBasis(1, 2);
const COEFFICIENT_B = createDctBasis(2, 1);

function getLuma(data: Uint8ClampedArray, pixelIndex: number) {
  return (data[pixelIndex] * 0.299) + (data[pixelIndex + 1] * 0.587) + (data[pixelIndex + 2] * 0.114);
}

function calculateCoefficient(
  data: Uint8ClampedArray,
  imageWidth: number,
  blockX: number,
  blockY: number,
  basis: CoefficientBasis,
) {
  let coefficient = 0;

  for (let localY = 0; localY < DCT_BLOCK_SIZE; localY += 1) {
    for (let localX = 0; localX < DCT_BLOCK_SIZE; localX += 1) {
      const pixelIndex = (((blockY + localY) * imageWidth) + blockX + localX) * 4;
      coefficient += getLuma(data, pixelIndex) * basis[localY * DCT_BLOCK_SIZE + localX];
    }
  }

  return coefficient;
}

function calculateBlockAlpha(data: Uint8ClampedArray, imageWidth: number, blockX: number, blockY: number) {
  let alphaSum = 0;

  for (let localY = 0; localY < DCT_BLOCK_SIZE; localY += 1) {
    for (let localX = 0; localX < DCT_BLOCK_SIZE; localX += 1) {
      const pixelIndex = (((blockY + localY) * imageWidth) + blockX + localX) * 4;
      alphaSum += data[pixelIndex + 3] / 255;
    }
  }

  return alphaSum / (DCT_BLOCK_SIZE * DCT_BLOCK_SIZE);
}

function calculateBlockActivity(data: Uint8ClampedArray, imageWidth: number, blockX: number, blockY: number) {
  let differenceSum = 0;
  let count = 0;

  for (let localY = 0; localY < DCT_BLOCK_SIZE; localY += 1) {
    for (let localX = 0; localX < DCT_BLOCK_SIZE; localX += 1) {
      const pixelIndex = (((blockY + localY) * imageWidth) + blockX + localX) * 4;
      const luma = getLuma(data, pixelIndex);

      if (localX + 1 < DCT_BLOCK_SIZE) {
        differenceSum += Math.abs(luma - getLuma(data, pixelIndex + 4));
        count += 1;
      }

      if (localY + 1 < DCT_BLOCK_SIZE) {
        differenceSum += Math.abs(luma - getLuma(data, pixelIndex + imageWidth * 4));
        count += 1;
      }
    }
  }

  return count > 0 ? differenceSum / count : 0;
}

function getActivityFactor(activity: number) {
  return clamp(0.42 + activity / 40, 0.42, 1);
}

function getTargetCoefficientDifference(strength: number) {
  const normalizedStrength = clamp(strength, MIN_STRENGTH, MAX_STRENGTH);
  if (normalizedStrength <= 0) {
    return 0;
  }

  return 6 + normalizedStrength * 0.28;
}

function getMaximumCoefficientAdjustment(strength: number) {
  const normalizedStrength = clamp(strength, MIN_STRENGTH, MAX_STRENGTH);
  if (normalizedStrength <= 0) {
    return 0;
  }

  return 8 + normalizedStrength * 0.55;
}

function getBackgroundTargetWeight(strength: number) {
  return 0.34 + clamp(strength, MIN_STRENGTH, MAX_STRENGTH) * 0.0022;
}

function getFrequencyMaskFontSize(blocksWide: number, blocksHigh: number) {
  const shortSide = Math.max(1, Math.min(blocksWide, blocksHigh));
  return Math.round(clamp(shortSide / 7, 8, 30));
}

function createFrequencyWatermarkMask(blocksWide: number, blocksHigh: number) {
  const canvas = createCanvas(blocksWide, blocksHigh);
  const ctx = getCanvasContext(canvas);
  const fontSize = getFrequencyMaskFontSize(blocksWide, blocksHigh);
  const textWidthEstimate = fontSize * COPYRIGHT_WATERMARK_TEXT.length * 0.62;
  const columnGap = Math.max(24, Math.round(textWidthEstimate + fontSize * 2.4));
  const rowGap = Math.max(16, Math.round(fontSize * 2.8));
  const diagonal = Math.ceil(Math.hypot(blocksWide, blocksHigh));

  ctx.clearRect(0, 0, blocksWide, blocksHigh);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.save();
  ctx.translate(blocksWide / 2, blocksHigh / 2);
  ctx.rotate(-Math.PI / 7);

  let rowIndex = 0;
  for (let y = -diagonal; y <= diagonal; y += rowGap) {
    const rowOffset = rowIndex % 2 === 0 ? 0 : columnGap / 2;

    for (let x = -diagonal; x <= diagonal; x += columnGap) {
      ctx.fillText(COPYRIGHT_WATERMARK_TEXT, x + rowOffset, y);
    }

    rowIndex += 1;
  }

  ctx.restore();

  return ctx.getImageData(0, 0, blocksWide, blocksHigh).data;
}

function applyFrequencyWatermark(imageData: ImageData, width: number, height: number, strength: number) {
  const normalizedStrength = clamp(strength, MIN_STRENGTH, MAX_STRENGTH);
  if (normalizedStrength <= 0) {
    return;
  }

  const geometry = getFrequencyWatermarkGeometry(width, height);
  const data = imageData.data;
  const maskData = createFrequencyWatermarkMask(geometry.blocksWide, geometry.blocksHigh);
  const targetDifference = getTargetCoefficientDifference(normalizedStrength);
  const maximumAdjustment = getMaximumCoefficientAdjustment(normalizedStrength);
  const backgroundTargetWeight = getBackgroundTargetWeight(normalizedStrength);

  for (let blockRow = 0; blockRow < geometry.blocksHigh; blockRow += 1) {
    const blockY = blockRow * DCT_BLOCK_SIZE;

    for (let blockColumn = 0; blockColumn < geometry.blocksWide; blockColumn += 1) {
      const maskAlpha = maskData[((blockRow * geometry.blocksWide) + blockColumn) * 4 + 3] / 255;
      const blockX = blockColumn * DCT_BLOCK_SIZE;
      const blockAlpha = calculateBlockAlpha(data, width, blockX, blockY);

      if (blockAlpha <= 0.2) {
        continue;
      }

      const coefficientA = calculateCoefficient(data, width, blockX, blockY, COEFFICIENT_A);
      const coefficientB = calculateCoefficient(data, width, blockX, blockY, COEFFICIENT_B);
      const currentDifference = coefficientA - coefficientB;
      const activityFactor = getActivityFactor(calculateBlockActivity(data, width, blockX, blockY));
      const isTextBlock = maskAlpha >= 0.08;
      const targetWeight = isTextBlock
        ? 0.45 + maskAlpha * 0.55
        : backgroundTargetWeight;
      const targetSign = isTextBlock ? 1 : -1;
      const target = targetSign * targetDifference * targetWeight * activityFactor;
      const neededAdjustment = target - currentDifference;

      const coefficientAdjustment = clamp(
        neededAdjustment,
        -maximumAdjustment * activityFactor * targetWeight,
        maximumAdjustment * activityFactor * targetWeight,
      );

      if (Math.abs(coefficientAdjustment) < 0.05) {
        continue;
      }

      const adjustA = coefficientAdjustment / 2;
      const adjustB = -coefficientAdjustment / 2;

      for (let localY = 0; localY < DCT_BLOCK_SIZE; localY += 1) {
        for (let localX = 0; localX < DCT_BLOCK_SIZE; localX += 1) {
          const basisIndex = localY * DCT_BLOCK_SIZE + localX;
          const pixelIndex = (((blockY + localY) * width) + blockX + localX) * 4;
          const pixelAlpha = data[pixelIndex + 3] / 255;

          if (pixelAlpha <= 0.02) {
            continue;
          }

          const deltaLuma = (adjustA * COEFFICIENT_A[basisIndex] + adjustB * COEFFICIENT_B[basisIndex]) * pixelAlpha;
          data[pixelIndex] = clampByte(data[pixelIndex] + deltaLuma);
          data[pixelIndex + 1] = clampByte(data[pixelIndex + 1] + deltaLuma);
          data[pixelIndex + 2] = clampByte(data[pixelIndex + 2] + deltaLuma);
        }
      }
    }
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, requestedMimeType: string, quality: number) {
  const normalizedQuality = clamp(quality, 0.1, 1);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        if (requestedMimeType !== 'image/png') {
          canvas.toBlob((fallbackBlob) => {
            if (fallbackBlob) {
              resolve(fallbackBlob);
              return;
            }

            reject(new Error('Unable to encode watermarked image.'));
          }, 'image/png');
          return;
        }

        reject(new Error('Unable to encode watermarked image.'));
      },
      requestedMimeType,
      requestedMimeType === 'image/png' ? undefined : normalizedQuality,
    );
  });
}

function buildOutputFileName(fileName: string, mimeType: string, suffix: string) {
  return `${stripFileExtension(fileName)}-${suffix}.${getOutputExtension(mimeType)}`;
}

function buildRevealFileName(fileName: string) {
  return `${stripFileExtension(fileName)}-${REVEAL_SUFFIX}.png`;
}

function boxBlurFloat(source: Float32Array, width: number, height: number, radius: number) {
  if (radius <= 0) {
    return source;
  }

  const temp = new Float32Array(source.length);
  const output = new Float32Array(source.length);

  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    let count = 0;
    const rowOffset = y * width;

    for (let x = -radius; x <= radius; x += 1) {
      if (x >= 0 && x < width) {
        sum += source[rowOffset + x];
        count += 1;
      }
    }

    for (let x = 0; x < width; x += 1) {
      temp[rowOffset + x] = sum / count;

      const removeX = x - radius;
      if (removeX >= 0) {
        sum -= source[rowOffset + removeX];
        count -= 1;
      }

      const addX = x + radius + 1;
      if (addX < width) {
        sum += source[rowOffset + addX];
        count += 1;
      }
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let count = 0;

    for (let y = -radius; y <= radius; y += 1) {
      if (y >= 0 && y < height) {
        sum += temp[y * width + x];
        count += 1;
      }
    }

    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = sum / count;

      const removeY = y - radius;
      if (removeY >= 0) {
        sum -= temp[removeY * width + x];
        count -= 1;
      }

      const addY = y + radius + 1;
      if (addY < height) {
        sum += temp[addY * width + x];
        count += 1;
      }
    }
  }

  return output;
}

function readFrequencyWatermarkResponse(imageData: ImageData, width: number, height: number) {
  const geometry = getFrequencyWatermarkGeometry(width, height);
  const data = imageData.data;
  const response = new Float32Array(geometry.blocksWide * geometry.blocksHigh);

  for (let blockRow = 0; blockRow < geometry.blocksHigh; blockRow += 1) {
    const blockY = blockRow * DCT_BLOCK_SIZE;

    for (let blockColumn = 0; blockColumn < geometry.blocksWide; blockColumn += 1) {
      const blockX = blockColumn * DCT_BLOCK_SIZE;
      const blockIndex = blockRow * geometry.blocksWide + blockColumn;
      const blockAlpha = calculateBlockAlpha(data, width, blockX, blockY);

      if (blockAlpha <= 0.2) {
        response[blockIndex] = 0;
        continue;
      }

      const coefficientA = calculateCoefficient(data, width, blockX, blockY, COEFFICIENT_A);
      const coefficientB = calculateCoefficient(data, width, blockX, blockY, COEFFICIENT_B);
      response[blockIndex] = (coefficientA - coefficientB) * blockAlpha;
    }
  }

  return {
    geometry,
    response: boxBlurFloat(response, geometry.blocksWide, geometry.blocksHigh, 2),
  };
}

function getConfidence(score: number, signalDifference: number): CopyrightWatermarkConfidence {
  if (score >= 2.8 && signalDifference >= 2.2) {
    return 'high';
  }

  if (score >= 1.8 && signalDifference >= 1.2) {
    return 'medium';
  }

  if (score >= 1.05 && signalDifference >= 0.65) {
    return 'low';
  }

  return 'none';
}

function analyzeFrequencyWatermarkResponse(
  response: Float32Array,
  geometry: FrequencyWatermarkGeometry,
): FrequencyWatermarkAnalysis {
  const maskData = createFrequencyWatermarkMask(geometry.blocksWide, geometry.blocksHigh);
  let insideSum = 0;
  let insideWeight = 0;
  let outsideSum = 0;
  let outsideSquareSum = 0;
  let outsideWeight = 0;

  for (let blockIndex = 0; blockIndex < response.length; blockIndex += 1) {
    const maskAlpha = maskData[blockIndex * 4 + 3] / 255;
    const value = response[blockIndex];

    if (maskAlpha >= 0.2) {
      insideSum += value * maskAlpha;
      insideWeight += maskAlpha;
      continue;
    }

    outsideSum += value;
    outsideSquareSum += value * value;
    outsideWeight += 1;
  }

  const insideSignal = insideWeight > 0 ? insideSum / insideWeight : 0;
  const outsideSignal = outsideWeight > 0 ? outsideSum / outsideWeight : 0;
  const outsideMeanSquare = outsideWeight > 0 ? outsideSquareSum / outsideWeight : 0;
  const outsideVariance = Math.max(0, outsideMeanSquare - outsideSignal * outsideSignal);
  const outsideStdDev = Math.sqrt(outsideVariance);
  const signalDifference = insideSignal - outsideSignal;
  const score = signalDifference / Math.max(outsideStdDev, 0.75);
  const confidence = getConfidence(score, signalDifference);

  return {
    insideSignal,
    outsideSignal,
    outsideStdDev,
    signalDifference,
    score,
    confidence,
    detected: confidence !== 'none',
  };
}

function createFrequencyRevealImage(
  response: Float32Array,
  geometry: FrequencyWatermarkGeometry,
  analysis: FrequencyWatermarkAnalysis,
) {
  const scale = Math.max(2, Math.min(10, Math.floor(960 / Math.max(geometry.blocksWide, geometry.blocksHigh)) || 2));
  const canvas = createCanvas(geometry.blocksWide * scale, geometry.blocksHigh * scale);
  const ctx = getCanvasContext(canvas);
  const maskData = createFrequencyWatermarkMask(geometry.blocksWide, geometry.blocksHigh);
  const correlation = new Float32Array(response.length);
  const radius = Math.max(4, Math.round(Math.min(geometry.blocksWide, geometry.blocksHigh) / 18));
  let maximumMagnitude = 1;

  for (let blockRow = 0; blockRow < geometry.blocksHigh; blockRow += 1) {
    for (let blockColumn = 0; blockColumn < geometry.blocksWide; blockColumn += 1) {
      let textSum = 0;
      let textWeight = 0;
      let backgroundSum = 0;
      let backgroundWeight = 0;

      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        const sampleRow = blockRow + offsetY;
        if (sampleRow < 0 || sampleRow >= geometry.blocksHigh) {
          continue;
        }

        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const sampleColumn = blockColumn + offsetX;
          if (sampleColumn < 0 || sampleColumn >= geometry.blocksWide) {
            continue;
          }

          const sampleIndex = sampleRow * geometry.blocksWide + sampleColumn;
          const maskAlpha = maskData[sampleIndex * 4 + 3] / 255;
          const value = response[sampleIndex];

          if (maskAlpha >= 0.2) {
            textSum += value * maskAlpha;
            textWeight += maskAlpha;
          } else {
            backgroundSum += value;
            backgroundWeight += 1;
          }
        }
      }

      const blockIndex = blockRow * geometry.blocksWide + blockColumn;
      const textSignal = textWeight > 0 ? textSum / textWeight : analysis.insideSignal;
      const backgroundSignal = backgroundWeight > 0 ? backgroundSum / backgroundWeight : analysis.outsideSignal;
      const maskAlpha = maskData[blockIndex * 4 + 3] / 255;
      const signedSignal = maskAlpha >= 0.2
        ? textSignal - backgroundSignal
        : backgroundSignal - textSignal;

      correlation[blockIndex] = signedSignal;
      maximumMagnitude = Math.max(maximumMagnitude, Math.abs(signedSignal));
    }
  }

  const reveal = boxBlurFloat(correlation, geometry.blocksWide, geometry.blocksHigh, 1);
  const gain = 120 / Math.max(maximumMagnitude, analysis.outsideStdDev, 1);

  ctx.fillStyle = '#101010';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let blockRow = 0; blockRow < geometry.blocksHigh; blockRow += 1) {
    for (let blockColumn = 0; blockColumn < geometry.blocksWide; blockColumn += 1) {
      const blockIndex = blockRow * geometry.blocksWide + blockColumn;
      const value = clampByte(128 + reveal[blockIndex] * gain);

      ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
      ctx.fillRect(blockColumn * scale, blockRow * scale, scale, scale);
    }
  }

  return canvas;
}

export function getCopyrightWatermarkAcceptedInputTypes() {
  return '.jpg,.jpeg,.png,.webp,.avif,.bmp,image/jpeg,image/png,image/webp,image/avif,image/bmp';
}

export function isSupportedCopyrightWatermarkImage(file: File) {
  const extension = getFileExtension(file.name);
  const type = normalizeInputType(file);

  if (type === 'image/svg+xml') {
    return false;
  }

  return SUPPORTED_EXTENSIONS.has(extension) || (
    type.startsWith('image/')
    && type !== 'image/svg+xml'
  );
}

export function getCopyrightWatermarkRelativePath(file: File) {
  return file.webkitRelativePath || file.name;
}

export function buildCopyrightWatermarkOutputPath(relativePath: string, mimeType: string) {
  const segments = relativePath.split('/').filter(Boolean);
  const fileName = segments.pop() || relativePath;
  const outputFileName = buildOutputFileName(fileName, mimeType, WATERMARK_SUFFIX);

  return [...segments, outputFileName].join('/');
}

export async function embedCopyrightImageWatermark(
  file: File,
  options: CopyrightWatermarkProcessOptions,
): Promise<CopyrightWatermarkProcessResult> {
  const decodedImage = await decodeFileToCanvas(file);
  const hasTransparency = hasTransparentPixels(decodedImage.imageData);
  const outputFormat = options.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
  const requestedMimeType = getRequestedMimeType(file, hasTransparency, outputFormat);
  const quality = options.quality ?? DEFAULT_OUTPUT_QUALITY;

  applyFrequencyWatermark(
    decodedImage.imageData,
    decodedImage.width,
    decodedImage.height,
    options.strength,
  );

  decodedImage.ctx.putImageData(decodedImage.imageData, 0, 0);

  const blob = await canvasToBlob(decodedImage.canvas, requestedMimeType, quality);
  const outputType = blob.type || requestedMimeType;

  return {
    blob,
    fileName: buildOutputFileName(file.name, outputType, WATERMARK_SUFFIX),
    width: decodedImage.width,
    height: decodedImage.height,
    inputType: normalizeInputType(file) || 'image/*',
    outputType,
    hasTransparency,
  };
}

export async function verifyCopyrightImageWatermark(file: File): Promise<CopyrightWatermarkVerificationResult> {
  const decodedImage = await decodeFileToCanvas(file);
  const { geometry, response } = readFrequencyWatermarkResponse(
    decodedImage.imageData,
    decodedImage.width,
    decodedImage.height,
  );
  const analysis = analyzeFrequencyWatermarkResponse(response, geometry);
  const revealCanvas = createFrequencyRevealImage(response, geometry, analysis);
  const blob = await canvasToBlob(revealCanvas, 'image/png', 1);

  return {
    blob,
    width: decodedImage.width,
    height: decodedImage.height,
    score: analysis.score,
    detected: analysis.detected,
    confidence: analysis.confidence,
    signalDifference: analysis.signalDifference,
    insideSignal: analysis.insideSignal,
    outsideSignal: analysis.outsideSignal,
  };
}

export function buildCopyrightWatermarkRevealFileName(fileName: string) {
  return buildRevealFileName(fileName);
}
