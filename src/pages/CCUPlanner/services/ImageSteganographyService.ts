const HEADER_MAGIC = 'CHST';
const HEADER_VERSION = 1;
const HEADER_SIZE = 12;

function buildHeader(payloadLength: number) {
  const header = new Uint8Array(HEADER_SIZE);
  header[0] = HEADER_MAGIC.charCodeAt(0);
  header[1] = HEADER_MAGIC.charCodeAt(1);
  header[2] = HEADER_MAGIC.charCodeAt(2);
  header[3] = HEADER_MAGIC.charCodeAt(3);
  header[4] = HEADER_VERSION;
  header[5] = 0;
  header[6] = 0;
  header[7] = 0;
  header[8] = payloadLength & 0xff;
  header[9] = (payloadLength >>> 8) & 0xff;
  header[10] = (payloadLength >>> 16) & 0xff;
  header[11] = (payloadLength >>> 24) & 0xff;
  return header;
}

function parseHeader(bytes: Uint8Array) {
  if (bytes.length < HEADER_SIZE) {
    throw new Error('Image watermark header is truncated.');
  }

  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== HEADER_MAGIC) {
    throw new Error('No embedded route data found in image.');
  }

  const version = bytes[4];
  if (version !== HEADER_VERSION) {
    throw new Error(`Unsupported image watermark version: ${version}`);
  }

  const payloadLength = (
    bytes[8]
    | (bytes[9] << 8)
    | (bytes[10] << 16)
    | (bytes[11] << 24)
  ) >>> 0;

  return {
    payloadLength
  };
}

function setLeastSignificantBit(value: number, bit: number) {
  return (value & 0xfe) | (bit & 1);
}

function readLeastSignificantBit(value: number) {
  return value & 1;
}

function getBitFromBytes(bytes: Uint8Array, bitIndex: number) {
  const byteIndex = bitIndex >>> 3;
  const offset = 7 - (bitIndex & 7);
  return (bytes[byteIndex] >>> offset) & 1;
}

function setBitInBytes(bytes: Uint8Array, bitIndex: number, bit: number) {
  const byteIndex = bitIndex >>> 3;
  const offset = 7 - (bitIndex & 7);
  if (bit) {
    bytes[byteIndex] |= 1 << offset;
  } else {
    bytes[byteIndex] &= ~(1 << offset);
  }
}

function getUsableChannelCount(pixelBytes: Uint8ClampedArray) {
  return Math.floor(pixelBytes.length / 4) * 3;
}

function getCarrierIndex(bitIndex: number) {
  const pixelIndex = Math.floor(bitIndex / 3);
  const channelOffset = bitIndex % 3;
  return pixelIndex * 4 + channelOffset;
}

export function calculateSteganographyCapacity(pixelBytes: Uint8ClampedArray) {
  return Math.floor(getUsableChannelCount(pixelBytes) / 8) - HEADER_SIZE;
}

export function embedPayloadIntoImageData(pixelBytes: Uint8ClampedArray, payload: Uint8Array) {
  const header = buildHeader(payload.length);
  const combined = new Uint8Array(header.length + payload.length);
  combined.set(header, 0);
  combined.set(payload, header.length);

  const requiredBits = combined.length * 8;
  const usableChannels = getUsableChannelCount(pixelBytes);
  if (requiredBits > usableChannels) {
    throw new Error('Export image is too small to embed route data.');
  }

  for (let bitIndex = 0; bitIndex < requiredBits; bitIndex += 1) {
    const carrierIndex = getCarrierIndex(bitIndex);
    pixelBytes[carrierIndex] = setLeastSignificantBit(pixelBytes[carrierIndex], getBitFromBytes(combined, bitIndex));
  }
}

export function extractPayloadFromImageData(pixelBytes: Uint8ClampedArray) {
  const usableChannels = getUsableChannelCount(pixelBytes);
  if (usableChannels < HEADER_SIZE * 8) {
    throw new Error('Image is too small to contain route data.');
  }

  const headerBytes = new Uint8Array(HEADER_SIZE);
  for (let bitIndex = 0; bitIndex < HEADER_SIZE * 8; bitIndex += 1) {
    const carrierIndex = getCarrierIndex(bitIndex);
    setBitInBytes(headerBytes, bitIndex, readLeastSignificantBit(pixelBytes[carrierIndex]));
  }

  const { payloadLength } = parseHeader(headerBytes);
  const totalBytes = HEADER_SIZE + payloadLength;
  const totalBits = totalBytes * 8;
  if (totalBits > usableChannels) {
    throw new Error('Embedded route payload is truncated.');
  }

  const combined = new Uint8Array(totalBytes);
  combined.set(headerBytes, 0);

  for (let bitIndex = HEADER_SIZE * 8; bitIndex < totalBits; bitIndex += 1) {
    const carrierIndex = getCarrierIndex(bitIndex);
    setBitInBytes(combined, bitIndex, readLeastSignificantBit(pixelBytes[carrierIndex]));
  }

  return combined.subarray(HEADER_SIZE);
}
