export type Bit = 0 | 1;

export type AnchorLayoutMode = 'legacy' | 'enhanced' | 'fixed';

export interface RobustWatermarkDiagnostics {
  version?: 1 | 2;
  layoutMode?: AnchorLayoutMode;
  anchorOffsetX: number;
  anchorOffsetY: number;
  anchorStrength: number;
  headerAverageConfidence: number;
  headerMinimumConfidence: number;
  payloadAverageConfidence: number;
  payloadMinimumConfidence: number;
  payloadLength: number;
  payloadAcceptedMacroCount?: number;
  payloadRejectedMacroCount?: number;
  payloadSkippedMacroCount?: number;
  payloadAverageSymbolVotes?: number;
  payloadMinimumSymbolVotes?: number;
  payloadAverageSymbolAgreement?: number;
  payloadMinimumSymbolAgreement?: number;
  payloadAverageMacroAgreement?: number;
  payloadMinimumMacroAgreement?: number;
  payloadTransportLength?: number;
  payloadEccParityBytes?: number;
  payloadEccErasedByteCount?: number;
  payloadEccCorrectedByteCount?: number;
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
  version?: 1 | 2;
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

export interface RobustWatermarkHeaderDebug {
  averageConfidence: number;
  minimumConfidence: number;
  recoveredBytesHex: string;
  recoveredText: string;
  magic: string;
  expectedMagic: string;
  magicByteMatches: number;
  version: number | null;
  protocolId: number | null;
  payloadRepetition: number | null;
  headerRepetition: number | null;
  payloadLength: number | null;
  payloadCrc32Hex: string | null;
  maxPayloadLength: number | null;
  parseError: string | null;
}

export interface RobustWatermarkGeometryDebug {
  blocksWide: number;
  blocksHigh: number;
  totalBlocks: number;
  headerBlockCount: number;
  payloadBlockCount: number;
  capacityBytes: number;
  capacitiesByRepetition: Array<{
    repetition: number;
    capacityBytes: number;
  }>;
}

export interface RobustWatermarkPayloadDebug {
  encodedBitLength: number;
  symbolCount: number;
  repetitionFactor: number;
  requiredMacroCount: number;
  acceptedMacroCount: number;
  rejectedMacroCount: number;
  skippedMacroCount: number;
  averageSymbolVotes: number;
  minimumSymbolVotes: number;
  averageSymbolAgreement: number;
  minimumSymbolAgreement: number;
  averageMacroAgreement: number;
  minimumMacroAgreement: number;
  averageConfidence: number;
  minimumConfidence: number;
  transportLength?: number;
  eccParityBytes?: number | null;
  eccErasedByteCount?: number;
  eccCorrectedByteCount?: number;
}

export interface RobustWatermarkDebugAttempt {
  version: 1 | 2;
  ok: boolean;
  error: string | null;
  diagnostics: RobustWatermarkDiagnostics | null;
  geometry: RobustWatermarkGeometryDebug | null;
  header: RobustWatermarkHeaderDebug | null;
  invertedHeader: RobustWatermarkHeaderDebug | null;
  payload: RobustWatermarkPayloadDebug | null;
}

export interface RobustWatermarkDebugReport {
  imageWidth: number;
  imageHeight: number;
  imageMegapixels: number;
  selectedVersion: 1 | 2 | null;
  capacityBytes: number | null;
  attempts: RobustWatermarkDebugAttempt[];
  notes: string[];
}
