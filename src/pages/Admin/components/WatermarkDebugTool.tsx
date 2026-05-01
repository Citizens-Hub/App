import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import routeImagePayloadService from '@/pages/CCUPlanner/services/RouteImagePayloadService';
import type {
  RobustWatermarkDiagnostics,
  RobustWatermarkFrequencyAnalysis,
} from '@/pages/CCUPlanner/services/RobustImageWatermarkService';
import {
  analyzeRobustWatermarkFrequency,
  extractRobustWatermarkWithDiagnostics,
  ROBUST_WATERMARK_BLOCK_FLAG_ANCHOR,
  ROBUST_WATERMARK_BLOCK_FLAG_HEADER,
  ROBUST_WATERMARK_BLOCK_FLAG_VALID,
} from '@/pages/CCUPlanner/services/RobustImageWatermarkService';

type InspectionResult = {
  fileName: string;
  imageWidth: number;
  imageHeight: number;
  previewUrl: string;
  signalMapUrl: string;
  confidenceMapUrl: string;
  frequency: {
    layoutMode: string;
    blocksWide: number;
    blocksHigh: number;
    anchorOffsetX: number;
    anchorOffsetY: number;
    anchorStrength: number;
    averageConfidence: number;
    maxAbsSignedDifference: number;
    maxConfidence: number;
    validBlockCount: number;
  };
  payloadByteLength: number | null;
  diagnostics: RobustWatermarkDiagnostics | null;
  decodedSummary: {
    nodeCount: number;
    edgeCount: number;
    startShipPriceCount: number;
  } | null;
  decodeError: string | null;
};

function formatMetric(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : '-';
}

function revokePreviewUrl(url: string | null | undefined) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getHeatmapScale(blocksWide: number, blocksHigh: number) {
  const maxBlocks = Math.max(blocksWide, blocksHigh, 1);
  return Math.max(3, Math.min(10, Math.floor(960 / maxBlocks) || 3));
}

function createFrequencyHeatmapUrl(
  analysis: RobustWatermarkFrequencyAnalysis,
  mode: 'signal' | 'confidence'
) {
  const scale = getHeatmapScale(analysis.blocksWide, analysis.blocksHigh);
  const canvas = document.createElement('canvas');
  canvas.width = analysis.blocksWide * scale;
  canvas.height = analysis.blocksHigh * scale;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Unable to initialize watermark heatmap canvas.');
  }

  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const signalDenominator = Math.max(analysis.maxAbsSignedDifference, 1);
  const confidenceDenominator = Math.max(analysis.maxConfidence, 1);
  const accentInset = scale >= 6 ? 1 : 0;

  for (let blockY = 0; blockY < analysis.blocksHigh; blockY += 1) {
    for (let blockX = 0; blockX < analysis.blocksWide; blockX += 1) {
      const index = blockY * analysis.blocksWide + blockX;
      const flags = analysis.blockFlags[index];
      const isValid = (flags & ROBUST_WATERMARK_BLOCK_FLAG_VALID) !== 0;
      const pixelX = blockX * scale;
      const pixelY = blockY * scale;

      if (!isValid) {
        ctx.fillStyle = '#131a2d';
      } else if (mode === 'signal') {
        const diff = analysis.signedDifferences[index];
        const intensity = Math.min(1, Math.abs(diff) / signalDenominator);
        const base = 24 + Math.round(intensity * 160);
        const glow = 40 + Math.round(intensity * 120);
        ctx.fillStyle = diff >= 0
          ? `rgb(${base}, ${180 + glow / 4}, ${190 + glow / 3})`
          : `rgb(${190 + glow / 3}, ${70 + glow / 6}, ${70 + glow / 7})`;
      } else {
        const confidence = analysis.confidences[index];
        const intensity = Math.min(1, confidence / confidenceDenominator);
        const value = 20 + Math.round(intensity * 220);
        ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
      }

      ctx.fillRect(pixelX, pixelY, scale, scale);

      if ((flags & ROBUST_WATERMARK_BLOCK_FLAG_ANCHOR) !== 0) {
        ctx.strokeStyle = '#f4b740';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          pixelX + accentInset,
          pixelY + accentInset,
          Math.max(1, scale - (accentInset * 2)),
          Math.max(1, scale - (accentInset * 2))
        );
      } else if ((flags & ROBUST_WATERMARK_BLOCK_FLAG_HEADER) !== 0 && scale >= 4) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(pixelX, pixelY, scale, 1);
      }
    }
  }

  return canvas.toDataURL('image/png');
}

export default function WatermarkDebugTool() {
  const intl = useIntl();
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      revokePreviewUrl(result?.previewUrl);
    };
  }, [result]);

  const inspectFile = async (file: File) => {
    setBusy(true);
    setError(null);

    let previewUrl: string | null = null;

    try {
      const imageBuffer = await file.arrayBuffer();
      const blob = new Blob([imageBuffer], { type: file.type || 'image/jpeg' });
      const imageBitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        imageBitmap.close();
        throw new Error('Unable to initialize debug canvas context.');
      }

      ctx.drawImage(imageBitmap, 0, 0);
      imageBitmap.close();

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const analysis = analyzeRobustWatermarkFrequency(imageData.data, canvas.width, canvas.height);

      previewUrl = URL.createObjectURL(file);

      let payloadByteLength: number | null = null;
      let diagnostics: RobustWatermarkDiagnostics | null = null;
      let decodedSummary: InspectionResult['decodedSummary'] = null;
      let decodeError: string | null = null;

      try {
        const extracted = extractRobustWatermarkWithDiagnostics(imageData.data, canvas.width, canvas.height);
        payloadByteLength = extracted.payload.byteLength;
        diagnostics = extracted.diagnostics;
        const inspection = await routeImagePayloadService.inspectPayload(extracted.payload);
        decodedSummary = inspection.summary;
      } catch (decodeFailure) {
        decodeError = toErrorMessage(
          decodeFailure,
          intl.formatMessage({
            id: 'admin.watermarkDebug.decodeFailed',
            defaultMessage: 'Watermark payload could not be decoded from this image.'
          })
        );
      }

      const nextResult: InspectionResult = {
        fileName: file.name,
        imageWidth: canvas.width,
        imageHeight: canvas.height,
        previewUrl,
        signalMapUrl: createFrequencyHeatmapUrl(analysis, 'signal'),
        confidenceMapUrl: createFrequencyHeatmapUrl(analysis, 'confidence'),
        frequency: {
          layoutMode: analysis.layoutMode,
          blocksWide: analysis.blocksWide,
          blocksHigh: analysis.blocksHigh,
          anchorOffsetX: analysis.anchorOffsetX,
          anchorOffsetY: analysis.anchorOffsetY,
          anchorStrength: analysis.anchorStrength,
          averageConfidence: analysis.averageConfidence,
          maxAbsSignedDifference: analysis.maxAbsSignedDifference,
          maxConfidence: analysis.maxConfidence,
          validBlockCount: analysis.validBlockCount
        },
        payloadByteLength,
        diagnostics,
        decodedSummary,
        decodeError
      };

      setResult((previous) => {
        revokePreviewUrl(previous?.previewUrl);
        return nextResult;
      });
    } catch (inspectionError) {
      revokePreviewUrl(previewUrl);
      setResult((previous) => {
        revokePreviewUrl(previous?.previewUrl);
        return null;
      });
      setError(
        toErrorMessage(
          inspectionError,
          intl.formatMessage({
            id: 'admin.watermarkDebug.inspectFailed',
            defaultMessage: 'Failed to inspect watermark image.'
          })
        )
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" gutterBottom>
          {intl.formatMessage({
            id: 'admin.watermarkDebug.title',
            defaultMessage: 'Watermark Debug Tool'
          })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'admin.watermarkDebug.description',
            defaultMessage: 'Upload an exported image or a compressed copy to inspect anchor alignment, decode confidence, and recovered route summary.'
          })}
        </Typography>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Button component="label" variant="contained" disabled={busy}>
          {busy
            ? intl.formatMessage({ id: 'admin.watermarkDebug.inspecting', defaultMessage: 'Inspecting...' })
            : intl.formatMessage({ id: 'admin.watermarkDebug.chooseImage', defaultMessage: 'Choose image' })}
          <input
            hidden
            type="file"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void inspectFile(file);
              }
              event.target.value = '';
            }}
          />
        </Button>
        {result && (
          <Typography variant="body2" color="text.secondary">
            {result.fileName} · {result.imageWidth} x {result.imageHeight}
          </Typography>
        )}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {result?.decodeError && <Alert severity="warning">{result.decodeError}</Alert>}

      {result && (
        <Stack spacing={3}>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                lg: 'minmax(0, 1.2fr) minmax(0, 1fr)'
              }
            }}
          >
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Typography variant="subtitle1">
                  {intl.formatMessage({
                    id: 'admin.watermarkDebug.originalImage',
                    defaultMessage: 'Source image'
                  })}
                </Typography>
                <Box
                  component="img"
                  src={result.previewUrl}
                  alt={result.fileName}
                  sx={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    backgroundColor: 'background.default'
                  }}
                />
              </Stack>
            </Paper>

            <Stack spacing={2}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle1">
                    {intl.formatMessage({
                      id: 'admin.watermarkDebug.signalMap',
                      defaultMessage: 'Frequency watermark signal map'
                    })}
                  </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {intl.formatMessage({
                        id: 'admin.watermarkDebug.signalMapDescription',
                        defaultMessage: 'Each cell is one logical 16x16 watermark block made from 2x2 frequency cells. Cyan means coefficient A dominates, red means coefficient B dominates. Brighter blocks carry a stronger embedded signal.'
                      })}
                    </Typography>
                  <Box
                    component="img"
                    src={result.signalMapUrl}
                    alt={intl.formatMessage({
                      id: 'admin.watermarkDebug.signalMapAlt',
                      defaultMessage: 'Frequency watermark signal heatmap'
                    })}
                    sx={{
                      width: '100%',
                      height: 'auto',
                      display: 'block',
                      imageRendering: 'pixelated',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      backgroundColor: '#0b1020'
                    }}
                  />
                </Stack>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle1">
                    {intl.formatMessage({
                      id: 'admin.watermarkDebug.confidenceMap',
                      defaultMessage: 'Confidence map'
                    })}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {intl.formatMessage({
                      id: 'admin.watermarkDebug.confidenceMapDescription',
                      defaultMessage: 'Brighter cells are easier to decode. Amber outlines mark anchor blocks and white top strokes mark header blocks.'
                    })}
                  </Typography>
                  <Box
                    component="img"
                    src={result.confidenceMapUrl}
                    alt={intl.formatMessage({
                      id: 'admin.watermarkDebug.confidenceMapAlt',
                      defaultMessage: 'Watermark confidence heatmap'
                    })}
                    sx={{
                      width: '100%',
                      height: 'auto',
                      display: 'block',
                      imageRendering: 'pixelated',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      backgroundColor: '#0b1020'
                    }}
                  />
                </Stack>
              </Paper>
            </Stack>
          </Box>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.metric', defaultMessage: 'Metric' })}</TableCell>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.value', defaultMessage: 'Value' })}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.blockGrid', defaultMessage: 'Block grid' })}</TableCell>
                  <TableCell>{`${result.frequency.blocksWide} x ${result.frequency.blocksHigh}`}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.validBlocks', defaultMessage: 'Valid analyzed blocks' })}</TableCell>
                  <TableCell>{result.frequency.validBlockCount}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.layoutMode', defaultMessage: 'Decode layout' })}</TableCell>
                  <TableCell>{result.diagnostics?.layoutMode ?? result.frequency.layoutMode ?? '-'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.anchorOffset', defaultMessage: 'Anchor offset' })}</TableCell>
                  <TableCell>{`${result.frequency.anchorOffsetX}, ${result.frequency.anchorOffsetY}`}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.anchorStrength', defaultMessage: 'Anchor strength' })}</TableCell>
                  <TableCell>{formatMetric(result.frequency.anchorStrength)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.avgBlockConfidence', defaultMessage: 'Average block confidence' })}</TableCell>
                  <TableCell>{formatMetric(result.frequency.averageConfidence)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.maxSignal', defaultMessage: 'Max signed signal magnitude' })}</TableCell>
                  <TableCell>{formatMetric(result.frequency.maxAbsSignedDifference)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.maxConfidence', defaultMessage: 'Peak confidence' })}</TableCell>
                  <TableCell>{formatMetric(result.frequency.maxConfidence)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.payloadBytes', defaultMessage: 'Recovered payload bytes' })}</TableCell>
                  <TableCell>{result.payloadByteLength ?? '-'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.headerConfidence', defaultMessage: 'Header avg / min confidence' })}</TableCell>
                  <TableCell>
                    {result.diagnostics
                      ? `${formatMetric(result.diagnostics.headerAverageConfidence)} / ${formatMetric(result.diagnostics.headerMinimumConfidence)}`
                      : '-'}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.payloadConfidence', defaultMessage: 'Payload avg / min confidence' })}</TableCell>
                  <TableCell>
                    {result.diagnostics
                      ? `${formatMetric(result.diagnostics.payloadAverageConfidence)} / ${formatMetric(result.diagnostics.payloadMinimumConfidence)}`
                      : '-'}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.nodeCount', defaultMessage: 'Recovered nodes' })}</TableCell>
                  <TableCell>{result.decodedSummary?.nodeCount ?? '-'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.edgeCount', defaultMessage: 'Recovered edges' })}</TableCell>
                  <TableCell>{result.decodedSummary?.edgeCount ?? '-'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.watermarkDebug.priceCount', defaultMessage: 'Recovered start prices' })}</TableCell>
                  <TableCell>{result.decodedSummary?.startShipPriceCount ?? '-'}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      )}
    </Stack>
  );
}
