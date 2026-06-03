import { useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import JSZip from 'jszip';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import DriveFolderUploadIcon from '@mui/icons-material/DriveFolderUpload';
import DownloadIcon from '@mui/icons-material/Download';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import ImageSearchIcon from '@mui/icons-material/ImageSearch';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

import {
  COPYRIGHT_WATERMARK_TEXT,
  buildCopyrightWatermarkOutputPath,
  buildCopyrightWatermarkRevealFileName,
  embedCopyrightImageWatermark,
  getCopyrightWatermarkAcceptedInputTypes,
  getCopyrightWatermarkRelativePath,
  isSupportedCopyrightWatermarkImage,
  type CopyrightWatermarkConfidence,
  type CopyrightWatermarkOutputFormat,
  type CopyrightWatermarkProcessResult,
  verifyCopyrightImageWatermark,
} from '@/pages/Admin/services/CopyrightImageWatermarkService';

type ProcessingStatus = 'queued' | 'processing' | 'done' | 'error';

type WatermarkQueueItem = {
  id: string;
  file: File;
  relativePath: string;
  status: ProcessingStatus;
  progressLabel: string;
  result: CopyrightWatermarkProcessResult | null;
  objectUrl: string | null;
  error: string | null;
};

type VerificationResult = {
  fileName: string;
  width: number;
  height: number;
  score: number;
  signalDifference: number;
  insideSignal: number;
  outsideSignal: number;
  detected: boolean;
  confidence: CopyrightWatermarkConfidence;
  revealFileName: string;
  revealUrl: string;
  error: string | null;
};

const DEFAULT_STRENGTH = 60;
const DEFAULT_QUALITY = 0.96;
const ZIP_FILE_NAME = 'citizenshub-watermarked-images.zip';

function revokeObjectUrl(url: string | null | undefined) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

function createQueueId(file: File, index: number) {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function getStatusColor(status: ProcessingStatus): 'default' | 'info' | 'success' | 'error' {
  if (status === 'done') {
    return 'success';
  }

  if (status === 'error') {
    return 'error';
  }

  if (status === 'processing') {
    return 'info';
  }

  return 'default';
}

function getConfidenceColor(confidence: CopyrightWatermarkConfidence): 'default' | 'success' | 'warning' | 'info' {
  if (confidence === 'high') {
    return 'success';
  }

  if (confidence === 'medium') {
    return 'info';
  }

  if (confidence === 'low') {
    return 'warning';
  }

  return 'default';
}

export default function CopyrightWatermarkTool() {
  const intl = useIntl();
  const [tab, setTab] = useState<'embed' | 'verify'>('embed');
  const [strength, setStrength] = useState(DEFAULT_STRENGTH);
  const [outputFormat, setOutputFormat] = useState<CopyrightWatermarkOutputFormat>('auto');
  const [queue, setQueue] = useState<WatermarkQueueItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const queueRef = useRef<WatermarkQueueItem[]>([]);
  const verificationRevealUrlRef = useRef<string | null>(null);

  const acceptedTypes = useMemo(() => getCopyrightWatermarkAcceptedInputTypes(), []);
  const doneItems = queue.filter((item) => item.status === 'done' && item.result);
  const failedItems = queue.filter((item) => item.status === 'error');
  const progressValue = queue.length > 0 ? Math.round((doneItems.length + failedItems.length) / queue.length * 100) : 0;

  useEffect(() => {
    const input = folderInputRef.current;
    if (input) {
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
    }
  }, []);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    verificationRevealUrlRef.current = verificationResult?.revealUrl ?? null;
  }, [verificationResult?.revealUrl]);

  useEffect(() => () => {
    queueRef.current.forEach((item) => revokeObjectUrl(item.objectUrl));
    revokeObjectUrl(verificationRevealUrlRef.current);
  }, []);

  const getStatusLabel = (status: ProcessingStatus) => {
    switch (status) {
      case 'queued':
        return intl.formatMessage({ id: 'admin.copyrightWatermark.status.queued', defaultMessage: 'Queued' });
      case 'processing':
        return intl.formatMessage({ id: 'admin.copyrightWatermark.status.processing', defaultMessage: 'Processing' });
      case 'done':
        return intl.formatMessage({ id: 'admin.copyrightWatermark.status.done', defaultMessage: 'Ready' });
      case 'error':
        return intl.formatMessage({ id: 'admin.copyrightWatermark.status.error', defaultMessage: 'Failed' });
      default:
        return status;
    }
  };

  const getConfidenceLabel = (confidence: CopyrightWatermarkConfidence) => {
    switch (confidence) {
      case 'high':
        return intl.formatMessage({ id: 'admin.copyrightWatermark.confidence.high', defaultMessage: 'High confidence' });
      case 'medium':
        return intl.formatMessage({ id: 'admin.copyrightWatermark.confidence.medium', defaultMessage: 'Medium confidence' });
      case 'low':
        return intl.formatMessage({ id: 'admin.copyrightWatermark.confidence.low', defaultMessage: 'Low confidence' });
      case 'none':
        return intl.formatMessage({ id: 'admin.copyrightWatermark.confidence.none', defaultMessage: 'Not detected' });
      default:
        return confidence;
    }
  };

  const clearQueue = () => {
    queue.forEach((item) => revokeObjectUrl(item.objectUrl));
    setQueue([]);
    setBatchError(null);
  };

  const runEmbedBatch = async (files: File[]) => {
    const supportedFiles = files.filter(isSupportedCopyrightWatermarkImage);

    clearQueue();

    if (supportedFiles.length === 0) {
      setBatchError(intl.formatMessage({
        id: 'admin.copyrightWatermark.error.noSupportedImages',
        defaultMessage: 'Choose at least one supported image file.',
      }));
      return;
    }

    const nextQueue = supportedFiles.map<WatermarkQueueItem>((file, index) => ({
      id: createQueueId(file, index),
      file,
      relativePath: getCopyrightWatermarkRelativePath(file),
      status: 'queued',
      progressLabel: intl.formatMessage({ id: 'admin.copyrightWatermark.status.queued', defaultMessage: 'Queued' }),
      result: null,
      objectUrl: null,
      error: null,
    }));

    setQueue(nextQueue);
    setBatchError(null);
    setProcessing(true);

    for (const item of nextQueue) {
      setQueue((current) => current.map((currentItem) => (
        currentItem.id === item.id
          ? {
            ...currentItem,
            status: 'processing',
            progressLabel: intl.formatMessage({ id: 'admin.copyrightWatermark.status.processing', defaultMessage: 'Processing' }),
          }
          : currentItem
      )));

      try {
        const result = await embedCopyrightImageWatermark(item.file, {
          strength,
          outputFormat,
          quality: DEFAULT_QUALITY,
        });
        const objectUrl = URL.createObjectURL(result.blob);

        setQueue((current) => current.map((currentItem) => {
          if (currentItem.id !== item.id) {
            return currentItem;
          }

          revokeObjectUrl(currentItem.objectUrl);
          return {
            ...currentItem,
            status: 'done',
            progressLabel: intl.formatMessage({ id: 'admin.copyrightWatermark.status.done', defaultMessage: 'Ready' }),
            result,
            objectUrl,
            error: null,
          };
        }));
      } catch (error) {
        setQueue((current) => current.map((currentItem) => (
          currentItem.id === item.id
            ? {
              ...currentItem,
              status: 'error',
              progressLabel: intl.formatMessage({ id: 'admin.copyrightWatermark.status.error', defaultMessage: 'Failed' }),
              error: toErrorMessage(
                error,
                intl.formatMessage({
                  id: 'admin.copyrightWatermark.error.processFailed',
                  defaultMessage: 'Failed to add watermark.',
                }),
              ),
            }
            : currentItem
        )));
      }
    }

    setProcessing(false);
  };

  const handleFileInputChange = (files: FileList | null) => {
    if (!files) {
      return;
    }

    void runEmbedBatch(Array.from(files));
  };

  const handleDownloadZip = async () => {
    if (doneItems.length === 0) {
      return;
    }

    setZipBusy(true);
    try {
      const zip = new JSZip();

      for (const item of doneItems) {
        if (!item.result) {
          continue;
        }

        zip.file(
          buildCopyrightWatermarkOutputPath(item.relativePath, item.result.outputType),
          item.result.blob,
        );
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, ZIP_FILE_NAME);
    } catch (error) {
      setBatchError(toErrorMessage(
        error,
        intl.formatMessage({
          id: 'admin.copyrightWatermark.error.zipFailed',
          defaultMessage: 'Failed to create ZIP archive.',
        }),
      ));
    } finally {
      setZipBusy(false);
    }
  };

  const handleVerifyFile = async (file: File) => {
    revokeObjectUrl(verificationResult?.revealUrl);
    setVerificationResult(null);
    setVerificationError(null);
    setVerificationBusy(true);

    try {
      if (!isSupportedCopyrightWatermarkImage(file)) {
        throw new Error(intl.formatMessage({
          id: 'admin.copyrightWatermark.error.unsupportedImage',
          defaultMessage: 'Unsupported image file.',
        }));
      }

      const result = await verifyCopyrightImageWatermark(file);
      const revealUrl = URL.createObjectURL(result.blob);

      setVerificationResult({
        fileName: file.name,
        width: result.width,
        height: result.height,
        score: result.score,
        signalDifference: result.signalDifference,
        insideSignal: result.insideSignal,
        outsideSignal: result.outsideSignal,
        detected: result.detected,
        confidence: result.confidence,
        revealFileName: buildCopyrightWatermarkRevealFileName(file.name),
        revealUrl,
        error: null,
      });
    } catch (error) {
      setVerificationError(toErrorMessage(
        error,
        intl.formatMessage({
          id: 'admin.copyrightWatermark.error.verifyFailed',
          defaultMessage: 'Failed to verify watermark.',
        }),
      ));
    } finally {
      setVerificationBusy(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" gutterBottom>
          {intl.formatMessage({
            id: 'admin.copyrightWatermark.title',
            defaultMessage: 'Copyright Watermark',
          })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage(
            {
              id: 'admin.copyrightWatermark.description',
              defaultMessage: 'Embed a frequency-domain hidden copyright watermark containing {text}, then download the processed images or reveal the watermark in a verification image.',
            },
            { text: COPYRIGHT_WATERMARK_TEXT },
          )}
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, value: string) => {
            if (value === 'embed' || value === 'verify') {
              setTab(value);
            }
          }}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab
            icon={<AddPhotoAlternateIcon />}
            iconPosition="start"
            label={intl.formatMessage({ id: 'admin.copyrightWatermark.tab.embed', defaultMessage: 'Add watermark' })}
            value="embed"
          />
          <Tab
            icon={<ImageSearchIcon />}
            iconPosition="start"
            label={intl.formatMessage({ id: 'admin.copyrightWatermark.tab.verify', defaultMessage: 'Verify' })}
            value="verify"
          />
        </Tabs>
      </Paper>

      {tab === 'embed' && (
        <Stack spacing={3}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={3}>
              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.4fr) minmax(220px, 0.6fr)' },
                }}
              >
                <Box>
                  <Typography gutterBottom>
                    {intl.formatMessage(
                      {
                        id: 'admin.copyrightWatermark.strength',
                        defaultMessage: 'Watermark strength: {value}',
                      },
                      { value: strength },
                    )}
                  </Typography>
                  <Slider
                    aria-label={intl.formatMessage({
                      id: 'admin.copyrightWatermark.strengthLabel',
                      defaultMessage: 'Watermark strength',
                    })}
                    value={strength}
                    min={0}
                    max={100}
                    step={1}
                    marks={[
                      { value: 0, label: '0' },
                      { value: DEFAULT_STRENGTH, label: intl.formatMessage({ id: 'admin.copyrightWatermark.strengthDefault', defaultMessage: 'Default' }) },
                      { value: 100, label: '100' },
                    ]}
                    onChange={(_, value) => setStrength(Array.isArray(value) ? value[0] : value)}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {intl.formatMessage({
                      id: 'admin.copyrightWatermark.strengthHelp',
                      defaultMessage: 'The default keeps the watermark subtle. Higher values improve verification robustness at the cost of slightly stronger image changes.',
                    })}
                  </Typography>
                </Box>

                <FormControl fullWidth size="small">
                  <InputLabel id="copyright-watermark-output-format-label">
                    {intl.formatMessage({ id: 'admin.copyrightWatermark.outputFormat', defaultMessage: 'Output format' })}
                  </InputLabel>
                  <Select
                    labelId="copyright-watermark-output-format-label"
                    label={intl.formatMessage({ id: 'admin.copyrightWatermark.outputFormat', defaultMessage: 'Output format' })}
                    value={outputFormat}
                    onChange={(event) => setOutputFormat(event.target.value as CopyrightWatermarkOutputFormat)}
                  >
                    <MenuItem value="auto">
                      {intl.formatMessage({ id: 'admin.copyrightWatermark.outputFormat.auto', defaultMessage: 'Keep source when possible' })}
                    </MenuItem>
                    <MenuItem value="png">
                      PNG
                    </MenuItem>
                    <MenuItem value="jpeg">
                      JPEG
                    </MenuItem>
                    <MenuItem value="webp">
                      WebP
                    </MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button
                  component="label"
                  disabled={processing}
                  startIcon={<AddPhotoAlternateIcon />}
                  variant="contained"
                >
                  {intl.formatMessage({ id: 'admin.copyrightWatermark.chooseImages', defaultMessage: 'Choose images' })}
                  <input
                    hidden
                    multiple
                    type="file"
                    accept={acceptedTypes}
                    onChange={(event) => {
                      handleFileInputChange(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </Button>
                <Button
                  component="label"
                  disabled={processing}
                  startIcon={<DriveFolderUploadIcon />}
                  variant="outlined"
                >
                  {intl.formatMessage({ id: 'admin.copyrightWatermark.chooseFolder', defaultMessage: 'Choose folder' })}
                  <input
                    ref={folderInputRef}
                    hidden
                    multiple
                    type="file"
                    accept={acceptedTypes}
                    onChange={(event) => {
                      handleFileInputChange(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </Button>
                <Button
                  disabled={queue.length === 0 || processing}
                  onClick={clearQueue}
                  startIcon={<RestartAltIcon />}
                  variant="text"
                >
                  {intl.formatMessage({ id: 'admin.copyrightWatermark.clear', defaultMessage: 'Clear' })}
                </Button>
              </Stack>
            </Stack>
          </Paper>

          {batchError && <Alert severity="error">{batchError}</Alert>}

          {queue.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
                  <Box>
                    <Typography variant="subtitle1">
                      {intl.formatMessage(
                        {
                          id: 'admin.copyrightWatermark.batchSummary',
                          defaultMessage: '{done}/{total} ready, {failed} failed',
                        },
                        { done: doneItems.length, total: queue.length, failed: failedItems.length },
                      )}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {intl.formatMessage({
                        id: 'admin.copyrightWatermark.localOnly',
                        defaultMessage: 'All processing happens locally in this browser.',
                      })}
                    </Typography>
                  </Box>
                  <Button
                    disabled={doneItems.length === 0 || zipBusy}
                    onClick={() => void handleDownloadZip()}
                    startIcon={<DownloadIcon />}
                    variant="contained"
                  >
                    {zipBusy
                      ? intl.formatMessage({ id: 'admin.copyrightWatermark.zipping', defaultMessage: 'Packing...' })
                      : intl.formatMessage({ id: 'admin.copyrightWatermark.downloadZip', defaultMessage: 'Download ZIP' })}
                  </Button>
                </Stack>

                {(processing || progressValue > 0) && <LinearProgress variant="determinate" value={progressValue} />}

                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{intl.formatMessage({ id: 'admin.copyrightWatermark.table.file', defaultMessage: 'File' })}</TableCell>
                        <TableCell>{intl.formatMessage({ id: 'admin.copyrightWatermark.table.size', defaultMessage: 'Size' })}</TableCell>
                        <TableCell>{intl.formatMessage({ id: 'admin.copyrightWatermark.table.output', defaultMessage: 'Output' })}</TableCell>
                        <TableCell>{intl.formatMessage({ id: 'admin.copyrightWatermark.table.status', defaultMessage: 'Status' })}</TableCell>
                        <TableCell align="right">{intl.formatMessage({ id: 'admin.copyrightWatermark.table.actions', defaultMessage: 'Actions' })}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {queue.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell sx={{ maxWidth: 360 }}>
                            <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                              {item.relativePath}
                            </Typography>
                            {item.error && (
                              <Typography variant="caption" color="error" sx={{ wordBreak: 'break-word' }}>
                                {item.error}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>{formatFileSize(item.file.size)}</TableCell>
                          <TableCell>
                            {item.result
                              ? `${item.result.width} x ${item.result.height} · ${item.result.outputType.replace('image/', '').toUpperCase()}`
                              : '-'}
                          </TableCell>
                          <TableCell>
                            <Chip
                              color={getStatusColor(item.status)}
                              label={getStatusLabel(item.status)}
                              size="small"
                              sx={{ borderRadius: 1 }}
                              variant={item.status === 'queued' ? 'outlined' : 'filled'}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              disabled={!item.result}
                              onClick={() => {
                                if (item.result) {
                                  downloadBlob(item.result.blob, item.result.fileName);
                                }
                              }}
                              size="small"
                              startIcon={<DownloadIcon />}
                              variant="outlined"
                            >
                              {intl.formatMessage({ id: 'admin.copyrightWatermark.download', defaultMessage: 'Download' })}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            </Paper>
          )}
        </Stack>
      )}

      {tab === 'verify' && (
        <Stack spacing={3}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Button
                  component="label"
                  disabled={verificationBusy}
                  startIcon={<FactCheckIcon />}
                  variant="contained"
                >
                  {verificationBusy
                    ? intl.formatMessage({ id: 'admin.copyrightWatermark.verifying', defaultMessage: 'Checking...' })
                    : intl.formatMessage({ id: 'admin.copyrightWatermark.chooseCheckImage', defaultMessage: 'Choose image to check' })}
                  <input
                    hidden
                    type="file"
                    accept={acceptedTypes}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleVerifyFile(file);
                      }
                      event.target.value = '';
                    }}
                  />
                </Button>
                {verificationResult && (
                  <Typography variant="body2" color="text.secondary">
                    {verificationResult.fileName} · {verificationResult.width} x {verificationResult.height}
                  </Typography>
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {intl.formatMessage(
                  {
                    id: 'admin.copyrightWatermark.verifyHelp',
                    defaultMessage: 'The check image reads DCT coefficient differences and renders the hidden {text} pattern for visual inspection.',
                  },
                  { text: COPYRIGHT_WATERMARK_TEXT },
                )}
              </Typography>
            </Stack>
          </Paper>

          {verificationError && <Alert severity="error">{verificationError}</Alert>}

          {verificationResult && (
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 0.85fr) minmax(0, 1.15fr)' },
              }}
            >
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Chip
                      color={verificationResult.detected ? 'success' : 'default'}
                      label={verificationResult.detected
                        ? intl.formatMessage({ id: 'admin.copyrightWatermark.detected', defaultMessage: 'Watermark detected' })
                        : intl.formatMessage({ id: 'admin.copyrightWatermark.notDetected', defaultMessage: 'Watermark not detected' })}
                      sx={{ borderRadius: 1 }}
                    />
                    <Chip
                      color={getConfidenceColor(verificationResult.confidence)}
                      label={getConfidenceLabel(verificationResult.confidence)}
                      sx={{ borderRadius: 1 }}
                      variant="outlined"
                    />
                  </Stack>

                  <TableContainer>
                    <Table size="small">
                      <TableBody>
                        <TableRow>
                          <TableCell>{intl.formatMessage({ id: 'admin.copyrightWatermark.metric.score', defaultMessage: 'Score' })}</TableCell>
                          <TableCell>{verificationResult.score.toFixed(2)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>{intl.formatMessage({ id: 'admin.copyrightWatermark.metric.signal', defaultMessage: 'Signal difference' })}</TableCell>
                          <TableCell>{verificationResult.signalDifference.toFixed(2)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>{intl.formatMessage({ id: 'admin.copyrightWatermark.metric.inside', defaultMessage: 'Inside text signal' })}</TableCell>
                          <TableCell>{verificationResult.insideSignal.toFixed(2)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>{intl.formatMessage({ id: 'admin.copyrightWatermark.metric.outside', defaultMessage: 'Background signal' })}</TableCell>
                          <TableCell>{verificationResult.outsideSignal.toFixed(2)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>

                  <Button
                    href={verificationResult.revealUrl}
                    download={verificationResult.revealFileName}
                    startIcon={<DownloadIcon />}
                    variant="outlined"
                  >
                    {intl.formatMessage({ id: 'admin.copyrightWatermark.downloadCheckImage', defaultMessage: 'Download check image' })}
                  </Button>
                </Stack>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle1">
                    {intl.formatMessage({ id: 'admin.copyrightWatermark.checkImage', defaultMessage: 'Frequency reveal image' })}
                  </Typography>
                  <Box
                    component="img"
                    src={verificationResult.revealUrl}
                    alt={intl.formatMessage({ id: 'admin.copyrightWatermark.checkImageAlt', defaultMessage: 'Frequency-domain watermark reveal' })}
                    sx={{
                      width: '100%',
                      height: 'auto',
                      display: 'block',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      backgroundColor: 'background.default',
                    }}
                  />
                </Stack>
              </Paper>
            </Box>
          )}
        </Stack>
      )}
    </Stack>
  );
}
