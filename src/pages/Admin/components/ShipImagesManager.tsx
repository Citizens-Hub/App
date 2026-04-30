import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { CloudSync, Image, Refresh, Search } from '@mui/icons-material';

import { useAuthApi } from '@/hooks';
import type { RootState } from '@/store';
import type {
  ShipImageAsset,
  ShipImageAssetListResponse,
  ShipImageAssetStatus,
  ShipImageSyncBatch,
  ShipImageSyncBatchListResponse,
  ShipImageSyncCreateResponse,
  ShipImageSyncPreviewResponse,
  ShipImageSyncStatsResponse,
  ShipImageSyncStatus,
} from '@/types';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

type FlashState = {
  severity: 'success' | 'error';
  text: string;
} | null;

function formatTimestamp(value: string | null | undefined, locale: string): string {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(locale);
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '-';

  if (bytes >= 1024 * 1024) {
    const value = bytes / (1024 * 1024);
    return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2)} MB`;
  }

  if (bytes >= 1024) {
    const value = bytes / 1024;
    return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2)} KB`;
  }

  return `${bytes} B`;
}

function parsePositiveInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getBatchStatusColor(status: ShipImageSyncStatus): 'default' | 'success' | 'warning' | 'error' {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'running' || status === 'pending') return 'warning';
  return 'default';
}

function getAssetStatusColor(status: ShipImageAssetStatus): 'default' | 'success' | 'warning' | 'error' {
  if (status === 'synced') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'skipped' || status === 'pending') return 'warning';
  return 'default';
}

function BatchProgress({ batch }: { batch: ShipImageSyncBatch }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="body2">
        {batch.processedImages}/{batch.totalImages}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        +{batch.succeededImages} / skip {batch.skippedImages} / fail {batch.failedImages}
      </Typography>
    </Stack>
  );
}

export default function ShipImagesManager() {
  const intl = useIntl();
  const { user } = useSelector((state: RootState) => state.user);
  const [shipIdInput, setShipIdInput] = useState('');
  const [force, setForce] = useState(false);
  const [assetQuery, setAssetQuery] = useState('');
  const [assetStatus, setAssetStatus] = useState('');
  const [assetPage, setAssetPage] = useState(0);
  const [assetLimit, setAssetLimit] = useState(20);
  const [batchPage, setBatchPage] = useState(0);
  const [batchLimit, setBatchLimit] = useState(10);
  const [batchStatus, setBatchStatus] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);

  const parsedShipId = useMemo(() => parsePositiveInt(shipIdInput), [shipIdInput]);
  const previewPath = parsedShipId
    ? `/api/admin/ship-images/preview?shipId=${parsedShipId}`
    : '/api/admin/ship-images/preview';
  const batchQuery = new URLSearchParams({
    page: String(batchPage + 1),
    limit: String(batchLimit),
  });
  const assetQueryParams = new URLSearchParams({
    page: String(assetPage + 1),
    limit: String(assetLimit),
  });

  if (batchStatus) batchQuery.set('status', batchStatus);
  if (assetStatus) assetQueryParams.set('status', assetStatus);
  if (assetQuery.trim()) assetQueryParams.set('query', assetQuery.trim());
  if (selectedBatchId) assetQueryParams.set('batchId', selectedBatchId);
  if (parsedShipId) assetQueryParams.set('shipId', String(parsedShipId));

  const {
    data: stats,
    error: statsError,
    mutate: mutateStats,
  } = useAuthApi<ShipImageSyncStatsResponse>('/api/admin/ship-images/stats', {
    revalidateOnFocus: false,
  });

  const {
    data: preview,
    mutate: mutatePreview,
  } = useAuthApi<ShipImageSyncPreviewResponse>(previewPath, {
    revalidateOnFocus: false,
  });

  const {
    data: batches,
    error: batchesError,
    isLoading: batchesLoading,
    mutate: mutateBatches,
  } = useAuthApi<ShipImageSyncBatchListResponse>(`/api/admin/ship-images/batches?${batchQuery.toString()}`, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  });

  const {
    data: assets,
    error: assetsError,
    isLoading: assetsLoading,
    mutate: mutateAssets,
  } = useAuthApi<ShipImageAssetListResponse>(`/api/admin/ship-images/assets?${assetQueryParams.toString()}`, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  });

  const refreshAll = async () => {
    await Promise.all([
      mutateStats(),
      mutatePreview(),
      mutateBatches(),
      mutateAssets(),
    ]);
  };

  const createSyncBatch = async () => {
    setSyncing(true);
    setFlash(null);

    try {
      const body: {
        force: boolean;
        shipId?: number;
      } = {
        force,
      };

      if (parsedShipId) {
        body.shipId = parsedShipId;
      } else if (shipIdInput.trim()) {
        throw new Error(intl.formatMessage({
          id: 'admin.shipImages.invalidShipId',
          defaultMessage: 'Ship ID must be a positive integer.',
        }));
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/ship-images/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: user.token ? `Bearer ${user.token}` : '',
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as ShipImageSyncCreateResponse & { message?: string };

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || intl.formatMessage({
          id: 'admin.shipImages.syncFailed',
          defaultMessage: 'Failed to start image sync.',
        }));
      }

      setFlash({
        severity: 'success',
        text: intl.formatMessage(
          {
            id: 'admin.shipImages.syncQueued',
            defaultMessage: 'Image sync batch {batchId} has been queued.',
          },
          { batchId: payload.data.batch.id },
        ),
      });
      setSelectedBatchId(payload.data.batch.id);
      setBatchPage(0);
      setAssetPage(0);
      await refreshAll();
    } catch (error) {
      setFlash({
        severity: 'error',
        text: error instanceof Error ? error.message : intl.formatMessage({
          id: 'admin.shipImages.syncFailed',
          defaultMessage: 'Failed to start image sync.',
        }),
      });
    } finally {
      setSyncing(false);
    }
  };

  const latestBatch = stats?.data.latestBatch;
  const previewData = preview?.data;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" gutterBottom>
          {intl.formatMessage({ id: 'admin.shipImages.title', defaultMessage: 'Ship Images' })}
        </Typography>
        <Typography color="text.secondary">
          {intl.formatMessage({
            id: 'admin.shipImages.description',
            defaultMessage: 'Sync RSI ship images into the images R2 bucket.',
          })}
        </Typography>
      </Box>

      {flash && <Alert severity={flash.severity}>{flash.text}</Alert>}
      {statsError && (
        <Alert severity="error">
          {statsError instanceof Error ? statsError.message : intl.formatMessage({
            id: 'admin.shipImages.statsFailed',
            defaultMessage: 'Failed to load image stats.',
          })}
        </Alert>
      )}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip icon={<Image />} label={`Bucket citizenshub-images`} />
        <Chip label={`Assets ${stats?.data.totalAssets ?? '-'}`} />
        <Chip color="success" label={`Synced ${stats?.data.syncedAssets ?? '-'}`} />
        <Chip color="warning" label={`Skipped ${stats?.data.skippedAssets ?? '-'}`} />
        <Chip color="error" label={`Failed ${stats?.data.failedAssets ?? '-'}`} />
        {latestBatch && (
          <Chip
            color={getBatchStatusColor(latestBatch.status)}
            label={`Latest ${latestBatch.status} ${latestBatch.processedImages}/${latestBatch.totalImages}`}
          />
        )}
      </Stack>

      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
          <TextField
            label={intl.formatMessage({ id: 'admin.shipImages.shipId', defaultMessage: 'Ship ID' })}
            value={shipIdInput}
            onChange={(event) => {
              setShipIdInput(event.target.value);
              setAssetPage(0);
            }}
            placeholder={intl.formatMessage({ id: 'admin.shipImages.allShips', defaultMessage: 'All ships' })}
            type="number"
            sx={{ width: { xs: '100%', md: 220 } }}
          />
          <FormControlLabel
            control={<Switch checked={force} onChange={(event) => setForce(event.target.checked)} />}
            label={intl.formatMessage({ id: 'admin.shipImages.force', defaultMessage: 'Force overwrite existing R2 objects' })}
          />
          <Button
            variant="contained"
            startIcon={<CloudSync />}
            onClick={createSyncBatch}
            disabled={syncing || Boolean(shipIdInput.trim() && !parsedShipId)}
          >
            {intl.formatMessage({ id: 'admin.shipImages.startSync', defaultMessage: 'Start sync' })}
          </Button>
          <Button startIcon={<Refresh />} onClick={refreshAll} disabled={syncing}>
            {intl.formatMessage({ id: 'admin.shipImages.refresh', defaultMessage: 'Refresh' })}
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          {previewData
            ? intl.formatMessage(
                {
                  id: 'admin.shipImages.preview',
                  defaultMessage: 'Current scope contains {shipCount} ships and {imageCount} image URLs.',
                },
                {
                  shipCount: previewData.shipCount,
                  imageCount: previewData.imageCount,
                },
              )
            : intl.formatMessage({ id: 'loading', defaultMessage: 'Loading...' })}
        </Typography>
      </Stack>

      <Stack spacing={1.5}>
        <Typography variant="h6">
          {intl.formatMessage({ id: 'admin.shipImages.batches', defaultMessage: 'Sync batches' })}
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            select
            label={intl.formatMessage({ id: 'admin.shipImages.status', defaultMessage: 'Status' })}
            value={batchStatus}
            onChange={(event) => {
              setBatchStatus(event.target.value);
              setBatchPage(0);
            }}
            sx={{ width: { xs: '100%', md: 220 } }}
          >
            <MenuItem value="">{intl.formatMessage({ id: 'admin.shipImages.allStatuses', defaultMessage: 'All' })}</MenuItem>
            {['pending', 'running', 'completed', 'failed'].map((status) => (
              <MenuItem key={status} value={status}>{status}</MenuItem>
            ))}
          </TextField>
        </Stack>

        {batchesError && (
          <Alert severity="error">
            {batchesError instanceof Error ? batchesError.message : intl.formatMessage({
              id: 'admin.shipImages.batchesFailed',
              defaultMessage: 'Failed to load sync batches.',
            })}
          </Alert>
        )}

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{intl.formatMessage({ id: 'admin.shipImages.batch', defaultMessage: 'Batch' })}</TableCell>
                <TableCell>{intl.formatMessage({ id: 'admin.shipImages.status', defaultMessage: 'Status' })}</TableCell>
                <TableCell>{intl.formatMessage({ id: 'admin.shipImages.scope', defaultMessage: 'Scope' })}</TableCell>
                <TableCell>{intl.formatMessage({ id: 'admin.shipImages.progress', defaultMessage: 'Progress' })}</TableCell>
                <TableCell>{intl.formatMessage({ id: 'admin.shipImages.createdAt', defaultMessage: 'Created' })}</TableCell>
                <TableCell>{intl.formatMessage({ id: 'admin.shipImages.finishedAt', defaultMessage: 'Finished' })}</TableCell>
                <TableCell>{intl.formatMessage({ id: 'admin.shipImages.error', defaultMessage: 'Error' })}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {batchesLoading && !batches?.list.length ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography align="center">{intl.formatMessage({ id: 'loading', defaultMessage: 'Loading...' })}</Typography>
                  </TableCell>
                </TableRow>
              ) : null}

              {!batchesLoading && !batches?.list.length ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography align="center" color="text.secondary">
                      {intl.formatMessage({ id: 'admin.shipImages.noBatches', defaultMessage: 'No sync batches found.' })}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}

              {batches?.list.map((batch) => (
                <TableRow
                  key={batch.id}
                  hover
                  selected={selectedBatchId === batch.id}
                  onClick={() => {
                    setSelectedBatchId(selectedBatchId === batch.id ? '' : batch.id);
                    setAssetPage(0);
                  }}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Typography variant="body2" className="break-all">{batch.id}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={getBatchStatusColor(batch.status)} label={batch.status} />
                  </TableCell>
                  <TableCell>
                    {batch.shipId ? `ship ${batch.shipId}` : batch.scope}
                    {batch.force ? ' / force' : ''}
                  </TableCell>
                  <TableCell><BatchProgress batch={batch} /></TableCell>
                  <TableCell>{formatTimestamp(batch.createdAt, intl.locale)}</TableCell>
                  <TableCell>{formatTimestamp(batch.finishedAt, intl.locale)}</TableCell>
                  <TableCell sx={{ maxWidth: 260 }}>
                    <Typography variant="body2" color="error" className="break-words">
                      {batch.errorMessage || '-'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={batches?.total ?? 0}
          page={batchPage}
          onPageChange={(_, nextPage) => setBatchPage(nextPage)}
          rowsPerPage={batchLimit}
          onRowsPerPageChange={(event) => {
            setBatchLimit(Number(event.target.value));
            setBatchPage(0);
          }}
          rowsPerPageOptions={[10, 20, 50]}
        />
      </Stack>

      <Stack spacing={1.5}>
        <Typography variant="h6">
          {intl.formatMessage({ id: 'admin.shipImages.assets', defaultMessage: 'Image assets' })}
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label={intl.formatMessage({ id: 'admin.shipImages.search', defaultMessage: 'Search URL, R2 key, image kind, or ship name' })}
            value={assetQuery}
            onChange={(event) => {
              setAssetQuery(event.target.value);
              setAssetPage(0);
            }}
            InputProps={{ startAdornment: <Search fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> }}
            fullWidth
          />
          <TextField
            select
            label={intl.formatMessage({ id: 'admin.shipImages.status', defaultMessage: 'Status' })}
            value={assetStatus}
            onChange={(event) => {
              setAssetStatus(event.target.value);
              setAssetPage(0);
            }}
            sx={{ width: { xs: '100%', md: 220 } }}
          >
            <MenuItem value="">{intl.formatMessage({ id: 'admin.shipImages.allStatuses', defaultMessage: 'All' })}</MenuItem>
            {['pending', 'synced', 'skipped', 'failed'].map((status) => (
              <MenuItem key={status} value={status}>{status}</MenuItem>
            ))}
          </TextField>
          {selectedBatchId && (
            <Button onClick={() => setSelectedBatchId('')}>
              {intl.formatMessage({ id: 'admin.shipImages.clearBatchFilter', defaultMessage: 'Clear batch filter' })}
            </Button>
          )}
        </Stack>

        {assetsError && (
          <Alert severity="error">
            {assetsError instanceof Error ? assetsError.message : intl.formatMessage({
              id: 'admin.shipImages.assetsFailed',
              defaultMessage: 'Failed to load image assets.',
            })}
          </Alert>
        )}

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{intl.formatMessage({ id: 'admin.shipImages.ship', defaultMessage: 'Ship' })}</TableCell>
                <TableCell>{intl.formatMessage({ id: 'admin.shipImages.kind', defaultMessage: 'Kind' })}</TableCell>
                <TableCell>{intl.formatMessage({ id: 'admin.shipImages.status', defaultMessage: 'Status' })}</TableCell>
                <TableCell>{intl.formatMessage({ id: 'admin.shipImages.r2Key', defaultMessage: 'R2 key' })}</TableCell>
                <TableCell>{intl.formatMessage({ id: 'admin.shipImages.size', defaultMessage: 'Size' })}</TableCell>
                <TableCell>{intl.formatMessage({ id: 'admin.shipImages.syncedAt', defaultMessage: 'Synced' })}</TableCell>
                <TableCell>{intl.formatMessage({ id: 'admin.shipImages.sourceUrl', defaultMessage: 'Source URL' })}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {assetsLoading && !assets?.list.length ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography align="center">{intl.formatMessage({ id: 'loading', defaultMessage: 'Loading...' })}</Typography>
                  </TableCell>
                </TableRow>
              ) : null}

              {!assetsLoading && !assets?.list.length ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography align="center" color="text.secondary">
                      {intl.formatMessage({ id: 'admin.shipImages.noAssets', defaultMessage: 'No image assets found.' })}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}

              {assets?.list.map((asset: ShipImageAsset) => (
                <TableRow key={asset.id} hover>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography variant="body2" fontWeight={600}>{asset.shipName || '-'}</Typography>
                      <Typography variant="caption" color="text.secondary">{asset.shipId}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>{asset.imageKind}</TableCell>
                  <TableCell>
                    <Chip size="small" color={getAssetStatusColor(asset.status)} label={asset.status} />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 280 }}>
                    <Typography variant="body2" className="break-all">{asset.r2Key}</Typography>
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography variant="body2">{formatBytes(asset.fileSize)}</Typography>
                      <Typography variant="caption" color="text.secondary">{asset.contentType || '-'}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>{formatTimestamp(asset.lastSyncedAt, intl.locale)}</TableCell>
                  <TableCell sx={{ maxWidth: 360 }}>
                    <Typography variant="body2" className="break-all">{asset.sourceUrl}</Typography>
                    {asset.errorMessage && (
                      <Typography variant="caption" color="error" className="break-words">
                        {asset.errorMessage}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={assets?.total ?? 0}
          page={assetPage}
          onPageChange={(_, nextPage) => setAssetPage(nextPage)}
          rowsPerPage={assetLimit}
          onRowsPerPageChange={(event) => {
            setAssetLimit(Number(event.target.value));
            setAssetPage(0);
          }}
          rowsPerPageOptions={[20, 50, 100]}
        />
      </Stack>
    </Stack>
  );
}
