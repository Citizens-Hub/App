import { useEffect, useState, type ChangeEvent } from 'react';
import { type IntlShape, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Paper,
  Stack,
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

import { useAuthApi } from '@/hooks';
import type {
  GameShopAdminListResponse,
  GameShopChangeType,
  GameShopImportBatchCancelResponse,
  GameShopDetailResponse,
  GameShopHistoryResponse,
  GameShopImportBatchListResponse,
  GameShopImportResponse,
  GameShopImportSummary,
  GameShopInventoryChangeType,
  GameShopShipMatchRematchResponse,
} from '@/types';
import type { RootState } from '@/store';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

type FlashState = {
  severity: 'success' | 'error';
  text: string;
} | null;

type PendingAction = 'fullPreview' | 'fullApply' | 'singlePreview' | 'singleApply' | 'rematchShipMatches' | null;

function formatTimestamp(value: string | null | undefined, locale: string): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(locale);
}

function formatNullableNumber(value: number | null): string {
  return value === null ? '-' : String(value);
}

function getChangeColor(changeType: GameShopChangeType | GameShopInventoryChangeType): 'default' | 'success' | 'warning' | 'error' {
  if (changeType === 'added') {
    return 'success';
  }

  if (changeType === 'updated') {
    return 'warning';
  }

  if (changeType === 'removed') {
    return 'error';
  }

  return 'default';
}

function getBatchStatusColor(status: string): 'default' | 'success' | 'warning' | 'error' {
  if (status === 'applied') {
    return 'success';
  }

  if (status === 'failed') {
    return 'error';
  }

  if (status === 'cancelled') {
    return 'default';
  }

  return 'warning';
}

function getChangeLabel(changeType: GameShopChangeType | GameShopInventoryChangeType, intl: IntlShape) {
  switch (changeType) {
    case 'added':
      return intl.formatMessage({ id: 'admin.gameShops.change.added', defaultMessage: 'Added' });
    case 'updated':
      return intl.formatMessage({ id: 'admin.gameShops.change.updated', defaultMessage: 'Updated' });
    case 'removed':
      return intl.formatMessage({ id: 'admin.gameShops.change.removed', defaultMessage: 'Removed' });
    default:
      return intl.formatMessage({ id: 'admin.gameShops.change.unchanged', defaultMessage: 'Unchanged' });
  }
}

function getBatchStatusLabel(status: string, intl: IntlShape) {
  switch (status) {
    case 'pending':
      return intl.formatMessage({ id: 'admin.gameShops.status.pending', defaultMessage: 'Pending' });
    case 'applying':
      return intl.formatMessage({ id: 'admin.gameShops.status.applying', defaultMessage: 'Applying' });
    case 'applied':
      return intl.formatMessage({ id: 'admin.gameShops.status.applied', defaultMessage: 'Applied' });
    case 'failed':
      return intl.formatMessage({ id: 'admin.gameShops.status.failed', defaultMessage: 'Failed' });
    case 'cancelling':
      return intl.formatMessage({ id: 'admin.gameShops.status.cancelling', defaultMessage: 'Cancelling' });
    case 'cancelled':
      return intl.formatMessage({ id: 'admin.gameShops.status.cancelled', defaultMessage: 'Cancelled' });
    default:
      return status;
  }
}

function getBatchScopeLabel(scope: string, intl: IntlShape) {
  switch (scope) {
    case 'full':
      return intl.formatMessage({ id: 'admin.gameShops.scope.full', defaultMessage: 'Full' });
    case 'single':
      return intl.formatMessage({ id: 'admin.gameShops.scope.single', defaultMessage: 'Single' });
    default:
      return scope;
  }
}

function getBatchSourceTypeLabel(sourceType: string, intl: IntlShape) {
  switch (sourceType) {
    case 'file':
      return intl.formatMessage({ id: 'admin.gameShops.sourceType.file', defaultMessage: 'File' });
    case 'manual':
      return intl.formatMessage({ id: 'admin.gameShops.sourceType.manual', defaultMessage: 'Manual' });
    default:
      return sourceType;
  }
}

function isActiveBatchStatus(status: string): boolean {
  return status === 'pending' || status === 'applying' || status === 'cancelling';
}

function SummarySection({ summary, intl }: { summary: GameShopImportSummary; intl: IntlShape }) {
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip
          label={intl.formatMessage(
            { id: 'admin.gameShops.summary.shopCount', defaultMessage: 'Shops {count}' },
            { count: summary.shopCount },
          )}
          size="small"
        />
        <Chip
          label={intl.formatMessage(
            { id: 'admin.gameShops.summary.inventoryCount', defaultMessage: 'Inventory {count}' },
            { count: summary.inventoryCount },
          )}
          size="small"
        />
        <Chip
          label={intl.formatMessage(
            { id: 'admin.gameShops.summary.shopAdded', defaultMessage: 'Shop +{count}' },
            { count: summary.shops.added },
          )}
          size="small"
          color="success"
        />
        <Chip
          label={intl.formatMessage(
            { id: 'admin.gameShops.summary.shopUpdated', defaultMessage: 'Shop ~{count}' },
            { count: summary.shops.updated },
          )}
          size="small"
          color="warning"
        />
        <Chip
          label={intl.formatMessage(
            { id: 'admin.gameShops.summary.shopUnchanged', defaultMessage: 'Shop ={count}' },
            { count: summary.shops.unchanged },
          )}
          size="small"
        />
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip
          label={intl.formatMessage(
            { id: 'admin.gameShops.summary.productAdded', defaultMessage: 'Product +{count}' },
            { count: summary.products.added },
          )}
          size="small"
          color="success"
        />
        <Chip
          label={intl.formatMessage(
            { id: 'admin.gameShops.summary.productUpdated', defaultMessage: 'Product ~{count}' },
            { count: summary.products.updated },
          )}
          size="small"
          color="warning"
        />
        <Chip
          label={intl.formatMessage(
            { id: 'admin.gameShops.summary.productUnchanged', defaultMessage: 'Product ={count}' },
            { count: summary.products.unchanged },
          )}
          size="small"
        />
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip
          label={intl.formatMessage(
            { id: 'admin.gameShops.summary.inventoryAdded', defaultMessage: 'Inventory +{count}' },
            { count: summary.inventory.added },
          )}
          size="small"
          color="success"
        />
        <Chip
          label={intl.formatMessage(
            { id: 'admin.gameShops.summary.inventoryUpdated', defaultMessage: 'Inventory ~{count}' },
            { count: summary.inventory.updated },
          )}
          size="small"
          color="warning"
        />
        <Chip
          label={intl.formatMessage(
            { id: 'admin.gameShops.summary.inventoryRemoved', defaultMessage: 'Inventory -{count}' },
            { count: summary.inventory.removed },
          )}
          size="small"
          color="error"
        />
        <Chip
          label={intl.formatMessage(
            { id: 'admin.gameShops.summary.inventoryUnchanged', defaultMessage: 'Inventory ={count}' },
            { count: summary.inventory.unchanged },
          )}
          size="small"
        />
      </Stack>
    </Stack>
  );
}

function PreviewSection({
  title,
  response,
  intl,
}: {
  title: string;
  response: GameShopImportResponse | null;
  intl: IntlShape;
}) {
  if (!response) {
    return null;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1" fontWeight={600}>
        {title}
      </Typography>

      <SummarySection summary={response.summary} intl={intl} />

      {response.summary.warnings.length > 0 ? (
        <Alert severity="warning">
          {response.summary.warnings.join('；')}
        </Alert>
      ) : null}

      <TableContainer sx={{ maxHeight: 280 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>{intl.formatMessage({ id: 'admin.gameShops.preview.column.shop', defaultMessage: 'Shop' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.gameShops.preview.column.status', defaultMessage: 'Status' })}</TableCell>
              <TableCell>{intl.formatMessage({ id: 'admin.gameShops.preview.column.inventory', defaultMessage: 'Inventory' })}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {response.shops.slice(0, 20).map((shop) => (
              <TableRow key={`${response.mode}-${shop.sourceShopId}`}>
                <TableCell>
                  <Stack spacing={0.25}>
                    <Typography variant="body2" fontWeight={600}>
                      {shop.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[shop.system, shop.location, shop.sourceShopId].filter(Boolean).join(' / ') || '-'}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={getChangeColor(shop.shopChangeType)}
                    label={getChangeLabel(shop.shopChangeType, intl)}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    +{shop.inventoryChanges.added} / ~{shop.inventoryChanges.updated} / -{shop.inventoryChanges.removed} / ={shop.inventoryChanges.unchanged}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

async function parseImportText(text: string, intl: IntlShape): Promise<unknown> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(intl.formatMessage({
      id: 'admin.gameShops.import.error.requiredPayload',
      defaultMessage: 'JSON payload is required.',
    }));
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(intl.formatMessage({
      id: 'admin.gameShops.import.error.invalidPayload',
      defaultMessage: 'Invalid JSON payload.',
    }));
  }
}

export default function GameShopsManager() {
  const intl = useIntl();
  const { user } = useSelector((state: RootState) => state.user);
  const formatDateTime = (value?: string | null) => formatTimestamp(value, intl.locale);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [systemFilter, setSystemFilter] = useState('');
  const [rentalFilter, setRentalFilter] = useState<'all' | 'true' | 'false'>('all');
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
  const [inventoryQuery, setInventoryQuery] = useState('');

  const [fullImportText, setFullImportText] = useState('');
  const [fullImportFileName, setFullImportFileName] = useState<string | null>(null);
  const [singleImportText, setSingleImportText] = useState('');
  const [singleImportFileName, setSingleImportFileName] = useState<string | null>(null);
  const [fullPreview, setFullPreview] = useState<GameShopImportResponse | null>(null);
  const [singlePreview, setSinglePreview] = useState<GameShopImportResponse | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [pendingCancelBatchId, setPendingCancelBatchId] = useState<string | null>(null);

  const listPath = `/api/admin/game-shops?page=${page + 1}&limit=${rowsPerPage}${query ? `&query=${encodeURIComponent(query)}` : ''}${systemFilter ? `&system=${encodeURIComponent(systemFilter)}` : ''}${rentalFilter !== 'all' ? `&isRental=${rentalFilter}` : ''}`;
  const {
    data: listData,
    error: listError,
    isLoading: listLoading,
    mutate: mutateList,
  } = useAuthApi<GameShopAdminListResponse>(listPath, {
    revalidateOnFocus: false,
    revalidateIfStale: true,
  });

  const {
    data: detailData,
    error: detailError,
    isLoading: detailLoading,
    mutate: mutateDetail,
  } = useAuthApi<GameShopDetailResponse>(
    selectedShopId ? `/api/admin/game-shops/${selectedShopId}` : null,
    {
      revalidateOnFocus: false,
      revalidateIfStale: true,
    },
  );

  const {
    data: historyData,
    error: historyError,
    isLoading: historyLoading,
    mutate: mutateHistory,
  } = useAuthApi<GameShopHistoryResponse>(
    selectedShopId ? `/api/admin/game-shops/${selectedShopId}/history?limit=10` : null,
    {
      revalidateOnFocus: false,
      revalidateIfStale: true,
    },
  );

  const {
    data: batchData,
    error: batchError,
    isLoading: batchLoading,
    mutate: mutateBatches,
  } = useAuthApi<GameShopImportBatchListResponse>('/api/admin/game-shops/import-batches?page=1&limit=10', {
    revalidateOnFocus: false,
    revalidateIfStale: true,
  });

  const selectedShop = detailData?.data || null;
  const hasActiveBatch = (batchData?.list || []).some((batch) => isActiveBatchStatus(batch.status));
  const filteredInventory = selectedShop?.inventory.filter((item) => {
    const needle = inventoryQuery.trim().toLowerCase();
    if (!needle) {
      return true;
    }

    return item.localName.toLowerCase().includes(needle)
      || item.sourceRef.toLowerCase().includes(needle);
  }) || [];

  const runImportRequest = async (
    endpoint: string,
    payloadText: string,
    fileName: string | null,
  ): Promise<GameShopImportResponse> => {
    const payload = await parseImportText(payloadText, intl);
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: user.token ? `Bearer ${user.token}` : '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload,
        fileName,
        sourceType: fileName ? 'file' : 'manual',
      }),
    });

    const json = await response.json().catch(() => null) as GameShopImportResponse | { success?: boolean; message?: string } | null;
    if (!response.ok || !json || json.success !== true) {
      throw new Error((json && 'message' in json && typeof json.message === 'string')
        ? json.message
        : intl.formatMessage({
          id: 'admin.gameShops.requestFailed',
          defaultMessage: 'Request failed.',
        }));
    }

    return json as GameShopImportResponse;
  };

  const runRematchShipMatchesRequest = async (): Promise<GameShopShipMatchRematchResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/admin/game-shops/ship-matches/rematch`, {
      method: 'POST',
      headers: {
        Authorization: user.token ? `Bearer ${user.token}` : '',
      },
    });

    const json = await response.json().catch(() => null) as GameShopShipMatchRematchResponse | { success?: boolean; message?: string } | null;
    if (!response.ok || !json || json.success !== true) {
      throw new Error((json && 'message' in json && typeof json.message === 'string')
        ? json.message
        : intl.formatMessage({
          id: 'admin.gameShops.requestFailed',
          defaultMessage: 'Request failed.',
        }));
    }

    return json as GameShopShipMatchRematchResponse;
  };

  const runCancelImportBatchRequest = async (batchId: string, force = false): Promise<GameShopImportBatchCancelResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/admin/game-shops/import-batches/${encodeURIComponent(batchId)}/cancel${force ? '?force=true' : ''}`, {
      method: 'POST',
      headers: {
        Authorization: user.token ? `Bearer ${user.token}` : '',
      },
    });

    const json = await response.json().catch(() => null) as GameShopImportBatchCancelResponse | { success?: boolean; message?: string } | null;
    if (!response.ok || !json || json.success !== true) {
      throw new Error((json && 'message' in json && typeof json.message === 'string')
        ? json.message
        : intl.formatMessage({
          id: 'admin.gameShops.requestFailed',
          defaultMessage: 'Request failed.',
        }));
    }

    return json as GameShopImportBatchCancelResponse;
  };

  useEffect(() => {
    if (!hasActiveBatch) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void mutateBatches();
      void mutateList();

      if (selectedShopId) {
        void mutateDetail();
        void mutateHistory();
      }
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [hasActiveBatch, mutateBatches, mutateDetail, mutateHistory, mutateList, selectedShopId]);

  const handleSearch = () => {
    setPage(0);
    setQuery(searchInput.trim());
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setQuery('');
    setSystemFilter('');
    setRentalFilter('all');
    setPage(0);
  };

  const handleFileLoad = async (
    event: ChangeEvent<HTMLInputElement>,
    target: 'full' | 'single',
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    if (target === 'full') {
      setFullImportText(text);
      setFullImportFileName(file.name);
    } else {
      setSingleImportText(text);
      setSingleImportFileName(file.name);
    }

    event.target.value = '';
  };

  const handlePreview = async (mode: 'full' | 'single') => {
    setFlash(null);
    setPendingAction(mode === 'full' ? 'fullPreview' : 'singlePreview');

    try {
      const response = await runImportRequest(
        mode === 'full' ? '/api/admin/game-shops/import/preview' : '/api/admin/game-shops/import/single/preview',
        mode === 'full' ? fullImportText : singleImportText,
        mode === 'full' ? fullImportFileName : singleImportFileName,
      );

      if (mode === 'full') {
        setFullPreview(response);
      } else {
        setSinglePreview(response);
      }
    } catch (error) {
      setFlash({
        severity: 'error',
        text: error instanceof Error ? error.message : intl.formatMessage({
          id: 'admin.gameShops.import.previewFailed',
          defaultMessage: 'Preview failed.',
        }),
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleApply = async (mode: 'full' | 'single') => {
    setFlash(null);
    setPendingAction(mode === 'full' ? 'fullApply' : 'singleApply');

    try {
      const response = await runImportRequest(
        mode === 'full' ? '/api/admin/game-shops/import/apply' : '/api/admin/game-shops/import/single/apply',
        mode === 'full' ? fullImportText : singleImportText,
        mode === 'full' ? fullImportFileName : singleImportFileName,
      );

      await mutateBatches();
      setFlash({
        severity: 'success',
        text: response.data?.status === 'applied'
          ? intl.formatMessage({
            id: mode === 'full'
              ? 'admin.gameShops.flash.fullApplied'
              : 'admin.gameShops.flash.singleApplied',
            defaultMessage: mode === 'full'
              ? 'Full import applied. Batch {batchId}.'
              : 'Single shop import applied. Batch {batchId}.',
          }, { batchId: response.data?.batchId || '-' })
          : intl.formatMessage({
            id: mode === 'full'
              ? 'admin.gameShops.flash.fullSubmitted'
              : 'admin.gameShops.flash.singleSubmitted',
            defaultMessage: mode === 'full'
              ? 'Full import submitted. Batch {batchId} is processing in background.'
              : 'Single shop import submitted. Batch {batchId} is processing in background.',
          }, { batchId: response.data?.batchId || '-' }),
      });
    } catch (error) {
      setFlash({
        severity: 'error',
        text: error instanceof Error ? error.message : intl.formatMessage({
          id: 'admin.gameShops.import.applyFailed',
          defaultMessage: 'Apply failed.',
        }),
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleRematchShipMatches = async () => {
    setFlash(null);
    setPendingAction('rematchShipMatches');

    try {
      const response = await runRematchShipMatchesRequest();
      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.gameShops.flash.rematchSuccess',
          defaultMessage: 'Ship matches rebuilt. Updated {updatedProducts}/{totalProducts}, matched {matched}, ambiguous {ambiguous}, unmatched {unmatched}.',
        }, {
          updatedProducts: response.data.updatedProducts,
          totalProducts: response.data.totalProducts,
          matched: response.data.matched,
          ambiguous: response.data.ambiguous,
          unmatched: response.data.unmatched,
        }),
      });
    } catch (error) {
      setFlash({
        severity: 'error',
        text: error instanceof Error ? error.message : intl.formatMessage({
          id: 'admin.gameShops.rematchFailed',
          defaultMessage: 'Rematch failed.',
        }),
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleCancelBatch = async (batchId: string, force = false) => {
    setFlash(null);
    setPendingCancelBatchId(batchId);

    try {
      const response = await runCancelImportBatchRequest(batchId, force);
      await mutateBatches();
      if (selectedShopId) {
        await mutateHistory();
      }
      setFlash({
        severity: 'success',
        text: response.data.status === 'cancelled'
          ? intl.formatMessage({
            id: force
              ? 'admin.gameShops.flash.cancelledForce'
              : 'admin.gameShops.flash.cancelled',
            defaultMessage: force
              ? 'Batch {batchId} cancelled by force.'
              : 'Batch {batchId} cancelled.',
          }, { batchId: response.data.batchId })
          : intl.formatMessage({
            id: 'admin.gameShops.flash.cancelling',
            defaultMessage: 'Batch {batchId} is cancelling.',
          }, { batchId: response.data.batchId }),
      });
    } catch (error) {
      setFlash({
        severity: 'error',
        text: error instanceof Error ? error.message : intl.formatMessage({
          id: 'admin.gameShops.cancelFailed',
          defaultMessage: 'Cancel failed.',
        }),
      });
    } finally {
      setPendingCancelBatchId(null);
    }
  };

  const renderImportSection = (
    title: string,
    description: string,
    mode: 'full' | 'single',
    payloadText: string,
    setPayloadText: (value: string) => void,
    fileName: string | null,
    previewResponse: GameShopImportResponse | null,
  ) => (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6">{title}</Typography>
          <Typography color="text.secondary">{description}</Typography>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button variant="outlined" component="label">
            <span>
              {intl.formatMessage({
                id: 'admin.gameShops.import.uploadJson',
                defaultMessage: 'Load JSON file',
              })}
            </span>
            <input
              hidden
              type="file"
              accept="application/json,.json,text/plain"
              onChange={(event) => {
                void handleFileLoad(event, mode);
              }}
            />
          </Button>
          <Chip size="small" label={fileName || intl.formatMessage({
            id: 'admin.gameShops.import.noFile',
            defaultMessage: 'No file selected',
          })} />
        </Stack>

        <TextField
          label={intl.formatMessage({
            id: mode === 'full' ? 'admin.gameShops.import.fullPayload' : 'admin.gameShops.import.singlePayload',
            defaultMessage: mode === 'full'
              ? 'Paste the full shops payload'
              : 'Paste one shop object or an array with one shop',
          })}
          value={payloadText}
          onChange={(event) => setPayloadText(event.target.value)}
          multiline
          minRows={10}
          maxRows={18}
          fullWidth
        />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button
            variant="outlined"
            onClick={() => {
              void handlePreview(mode);
            }}
            disabled={pendingAction !== null}
          >
            {pendingAction === (mode === 'full' ? 'fullPreview' : 'singlePreview')
              ? intl.formatMessage({ id: 'admin.gameShops.import.previewing', defaultMessage: 'Previewing...' })
              : intl.formatMessage({ id: 'admin.gameShops.import.preview', defaultMessage: 'Preview' })}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              void handleApply(mode);
            }}
            disabled={pendingAction !== null}
          >
            {pendingAction === (mode === 'full' ? 'fullApply' : 'singleApply')
              ? intl.formatMessage({ id: 'admin.gameShops.import.applying', defaultMessage: 'Applying...' })
              : intl.formatMessage({ id: 'admin.gameShops.import.apply', defaultMessage: 'Apply' })}
          </Button>
        </Stack>

        <PreviewSection
          title={intl.formatMessage({
            id: 'admin.gameShops.import.previewResult',
            defaultMessage: 'Preview Result',
          })}
          response={previewResponse}
          intl={intl}
        />
      </Stack>
    </Paper>
  );

  return (
    <Stack spacing={3}>
      <Box>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ md: 'center' }}>
          <Box>
            <Typography variant="h5" gutterBottom>
              {intl.formatMessage({
                id: 'admin.gameShops.title',
                defaultMessage: 'Game Shops',
              })}
            </Typography>
            <Typography color="text.secondary">
              {intl.formatMessage({
                id: 'admin.gameShops.description',
                defaultMessage: 'Store in-game shop data independently, inspect current inventory, and run full or single-shop imports from JSON payloads.',
              })}
            </Typography>
          </Box>

          <Button
            variant="outlined"
            onClick={() => {
              void handleRematchShipMatches();
            }}
            disabled={pendingAction !== null}
          >
            {pendingAction === 'rematchShipMatches'
              ? intl.formatMessage({ id: 'admin.gameShops.shipMatchRematching', defaultMessage: 'Rebuilding ship matches...' })
              : intl.formatMessage({ id: 'admin.gameShops.shipMatchRematch', defaultMessage: 'Rebuild Ship Matches' })}
          </Button>
        </Stack>
      </Box>

      {flash ? <Alert severity={flash.severity}>{flash.text}</Alert> : null}

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: {
            xs: '1fr',
            xl: 'minmax(0, 1.15fr) minmax(360px, 0.85fr)',
          },
        }}
      >
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="h6">
                {intl.formatMessage({
                  id: 'admin.gameShops.list.title',
                  defaultMessage: 'Shop Directory',
                })}
              </Typography>
              <Typography color="text.secondary">
                {intl.formatMessage({
                  id: 'admin.gameShops.list.description',
                  defaultMessage: 'Search by internal ID, source shop ID, system, location, or display name.',
                })}
              </Typography>
            </Box>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
              <TextField
                label={intl.formatMessage({
                  id: 'admin.gameShops.search',
                  defaultMessage: 'Search shops',
                })}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleSearch();
                  }
                }}
                fullWidth
              />

              <TextField
                select
                label={intl.formatMessage({
                  id: 'admin.gameShops.system',
                  defaultMessage: 'System',
                })}
                value={systemFilter}
                onChange={(event) => {
                  setSystemFilter(event.target.value);
                  setPage(0);
                }}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="">
                  {intl.formatMessage({
                    id: 'admin.gameShops.systemAll',
                    defaultMessage: 'All systems',
                  })}
                </MenuItem>
                {listData?.systems.map((system) => (
                  <MenuItem key={system} value={system}>{system}</MenuItem>
                ))}
              </TextField>

              <TextField
                select
                label={intl.formatMessage({
                  id: 'admin.gameShops.rental',
                  defaultMessage: 'Rental',
                })}
                value={rentalFilter}
                onChange={(event) => {
                  setRentalFilter(event.target.value as 'all' | 'true' | 'false');
                  setPage(0);
                }}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="all">
                  {intl.formatMessage({
                    id: 'admin.gameShops.rentalAll',
                    defaultMessage: 'All',
                  })}
                </MenuItem>
                <MenuItem value="true">
                  {intl.formatMessage({
                    id: 'admin.gameShops.rentalOnly',
                    defaultMessage: 'Rental only',
                  })}
                </MenuItem>
                <MenuItem value="false">
                  {intl.formatMessage({
                    id: 'admin.gameShops.storeOnly',
                    defaultMessage: 'Store only',
                  })}
                </MenuItem>
              </TextField>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button variant="contained" onClick={handleSearch}>
                {intl.formatMessage({ id: 'admin.gameShops.searchAction', defaultMessage: 'Search' })}
              </Button>
              <Button variant="text" onClick={handleClearFilters}>
                {intl.formatMessage({ id: 'admin.gameShops.clearFilters', defaultMessage: 'Clear' })}
              </Button>
            </Stack>

            {listError ? (
              <Alert severity="error">
                {listError instanceof Error ? listError.message : intl.formatMessage({
                  id: 'admin.gameShops.loadFailed',
                  defaultMessage: 'Failed to load shops.',
                })}
              </Alert>
            ) : null}

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>
                      {intl.formatMessage({ id: 'admin.gameShops.shop', defaultMessage: 'Shop' })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({ id: 'admin.gameShops.systemCol', defaultMessage: 'System' })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({ id: 'admin.gameShops.inventoryCount', defaultMessage: 'Inventory' })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({ id: 'admin.gameShops.updatedAt', defaultMessage: 'Updated' })}
                    </TableCell>
                    <TableCell align="right">
                      {intl.formatMessage({ id: 'admin.gameShops.actions', defaultMessage: 'Actions' })}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {listLoading && !listData?.list.length ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Typography align="center">
                          {intl.formatMessage({ id: 'loading', defaultMessage: 'Loading...' })}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}

                  {!listLoading && !listData?.list.length ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Typography align="center" color="text.secondary">
                          {intl.formatMessage({
                            id: 'admin.gameShops.empty',
                            defaultMessage: 'No shops matched the current filter.',
                          })}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}

                  {listData?.list.map((shop) => (
                    <TableRow
                      key={shop.id}
                      hover
                      selected={selectedShopId === shop.id}
                    >
                      <TableCell>{shop.id}</TableCell>
                      <TableCell>
                        <Stack spacing={0.5}>
                          <Typography fontWeight={600}>{shop.name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {[shop.location, shop.sourceShopId].filter(Boolean).join(' / ') || '-'}
                          </Typography>
                          <Stack direction="row" spacing={1}>
                            {shop.isRental ? (
                              <Chip
                                size="small"
                                label={intl.formatMessage({
                                  id: 'admin.gameShops.rentalChip',
                                  defaultMessage: 'Rental',
                                })}
                              />
                            ) : null}
                            {!shop.isActive ? (
                              <Chip
                                size="small"
                                color="warning"
                                label={intl.formatMessage({
                                  id: 'admin.gameShops.inactiveChip',
                                  defaultMessage: 'Inactive',
                                })}
                              />
                            ) : null}
                          </Stack>
                        </Stack>
                      </TableCell>
                      <TableCell>{shop.system || '-'}</TableCell>
                      <TableCell>{shop.activeInventoryCount}</TableCell>
                      <TableCell>{formatDateTime(shop.lastSeenAt)}</TableCell>
                      <TableCell align="right">
                        <Button
                          variant="outlined"
                          onClick={() => {
                            setSelectedShopId(shop.id);
                            setInventoryQuery('');
                          }}
                        >
                          {intl.formatMessage({ id: 'admin.gameShops.inspect', defaultMessage: 'Inspect' })}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              component="div"
              count={listData?.total || 0}
              page={page}
              rowsPerPage={rowsPerPage}
              onPageChange={(_event, nextPage) => setPage(nextPage)}
              onRowsPerPageChange={(event) => {
                setRowsPerPage(parseInt(event.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[10, 20, 50]}
              labelRowsPerPage={intl.formatMessage({ id: 'pagination.rowsPerPage', defaultMessage: 'Rows per page:' })}
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${intl.formatMessage({ id: 'pagination.total', defaultMessage: 'Total' })} ${count}`}
            />
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="h6">
                {intl.formatMessage({
                  id: 'admin.gameShops.detail.title',
                  defaultMessage: 'Shop Detail',
                })}
              </Typography>
              <Typography color="text.secondary">
                {intl.formatMessage({
                  id: 'admin.gameShops.detail.description',
                  defaultMessage: 'Inspect current inventory and recent import history for the selected shop.',
                })}
              </Typography>
            </Box>

            {selectedShopId === null ? (
              <Alert severity="info">
                {intl.formatMessage({
                  id: 'admin.gameShops.detail.selectShop',
                  defaultMessage: 'Select a shop from the directory to inspect its current inventory and history.',
                })}
              </Alert>
            ) : null}

            {detailError ? (
              <Alert severity="error">
                {detailError instanceof Error ? detailError.message : intl.formatMessage({
                  id: 'admin.gameShops.detail.loadFailed',
                  defaultMessage: 'Failed to load shop detail.',
                })}
              </Alert>
            ) : null}

            {selectedShop && !detailLoading ? (
              <>
                <Stack spacing={1}>
                  <Typography variant="h6">{selectedShop.name}</Typography>
                  <Typography color="text.secondary">
                    {[selectedShop.system, selectedShop.location].filter(Boolean).join(' / ') || '-'}
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip
                      size="small"
                      label={intl.formatMessage(
                        { id: 'admin.gameShops.detail.sourceRef', defaultMessage: 'Source {sourceShopId}' },
                        { sourceShopId: selectedShop.sourceShopId },
                      )}
                    />
                    <Chip
                      size="small"
                      label={intl.formatMessage(
                        { id: 'admin.gameShops.detail.inventoryChip', defaultMessage: 'Inventory {count}' },
                        { count: selectedShop.activeInventoryCount },
                      )}
                    />
                    {selectedShop.isRental ? (
                      <Chip
                        size="small"
                        label={intl.formatMessage({
                          id: 'admin.gameShops.rentalChip',
                          defaultMessage: 'Rental',
                        })}
                      />
                    ) : null}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {intl.formatMessage({
                      id: 'admin.gameShops.detail.seenRange',
                      defaultMessage: 'First seen: {firstSeen} | Last seen: {lastSeen}',
                    }, {
                      firstSeen: formatDateTime(selectedShop.firstSeenAt),
                      lastSeen: formatDateTime(selectedShop.lastSeenAt),
                    })}
                  </Typography>
                </Stack>

                <Divider />

                <TextField
                  label={intl.formatMessage({
                    id: 'admin.gameShops.detail.inventorySearch',
                    defaultMessage: 'Filter inventory by localName or ref',
                  })}
                  value={inventoryQuery}
                  onChange={(event) => setInventoryQuery(event.target.value)}
                  fullWidth
                />

                <TableContainer sx={{ maxHeight: 320 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>{intl.formatMessage({ id: 'admin.gameShops.detail.column.localName', defaultMessage: 'localName' })}</TableCell>
                        <TableCell>{intl.formatMessage({ id: 'admin.gameShops.detail.column.ref', defaultMessage: 'ref' })}</TableCell>
                        <TableCell>{intl.formatMessage({ id: 'admin.gameShops.detail.column.price', defaultMessage: 'price' })}</TableCell>
                        <TableCell>{intl.formatMessage({ id: 'admin.gameShops.detail.column.available', defaultMessage: 'available' })}</TableCell>
                        <TableCell>{intl.formatMessage({ id: 'admin.gameShops.detail.column.unavailable', defaultMessage: 'unavailable' })}</TableCell>
                        <TableCell>{intl.formatMessage({ id: 'admin.gameShops.detail.column.updated', defaultMessage: 'updated' })}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredInventory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6}>
                            <Typography align="center" color="text.secondary">
                              {intl.formatMessage({
                                id: 'admin.gameShops.detail.inventoryEmpty',
                                defaultMessage: 'No inventory matched the current filter.',
                              })}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : null}

                      {filteredInventory.map((inventoryItem) => (
                        <TableRow key={`${inventoryItem.id}-${inventoryItem.sourceRef}`}>
                          <TableCell>{inventoryItem.localName}</TableCell>
                          <TableCell>{inventoryItem.sourceRef}</TableCell>
                          <TableCell>{inventoryItem.price.toLocaleString(intl.locale)}</TableCell>
                          <TableCell>{formatNullableNumber(inventoryItem.available)}</TableCell>
                          <TableCell>{formatNullableNumber(inventoryItem.unavailable)}</TableCell>
                          <TableCell>{formatDateTime(inventoryItem.lastSeenAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Divider />

                <Stack spacing={1.5}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {intl.formatMessage({
                      id: 'admin.gameShops.detail.history',
                      defaultMessage: 'Recent History',
                    })}
                  </Typography>

                  {historyError ? (
                    <Alert severity="error">
                      {historyError instanceof Error ? historyError.message : intl.formatMessage({
                        id: 'admin.gameShops.history.loadFailed',
                        defaultMessage: 'Failed to load history.',
                      })}
                    </Alert>
                  ) : null}

                  {historyLoading && !historyData?.data.history.length ? (
                    <Typography color="text.secondary">
                      {intl.formatMessage({ id: 'loading', defaultMessage: 'Loading...' })}
                    </Typography>
                  ) : null}

                  {!historyLoading && !historyData?.data.history.length ? (
                    <Typography color="text.secondary">
                      {intl.formatMessage({
                        id: 'admin.gameShops.history.empty',
                        defaultMessage: 'No import history for this shop yet.',
                      })}
                    </Typography>
                  ) : null}

                  {historyData?.data.history.map((entry) => (
                    <Paper key={entry.batchId} variant="outlined" sx={{ p: 2 }}>
                      <Stack spacing={1.25}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
                          <Stack spacing={0.5}>
                            <Typography fontWeight={600}>
                              {intl.formatMessage(
                                { id: 'admin.gameShops.history.batch', defaultMessage: 'Batch {batchId}' },
                                { batchId: entry.batchId },
                              )}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {getBatchScopeLabel(entry.batch.scope, intl)} / {getBatchSourceTypeLabel(entry.batch.sourceType, intl)} / {formatDateTime(entry.batch.createdAt)}
                            </Typography>
                          </Stack>
                          <Stack direction="row" spacing={1}>
                            <Chip
                              size="small"
                              color={getChangeColor(entry.changeType)}
                              label={getChangeLabel(entry.changeType, intl)}
                            />
                            <Chip
                              size="small"
                              color={getBatchStatusColor(entry.batch.status)}
                              label={getBatchStatusLabel(entry.batch.status, intl)}
                            />
                          </Stack>
                        </Stack>

                        <Typography variant="body2">
                          +{entry.inventoryChanges.added} / ~{entry.inventoryChanges.updated} / -{entry.inventoryChanges.removed} / ={entry.inventoryChanges.unchanged}
                        </Typography>

                        {entry.batch.errorMessage ? (
                          <Alert severity="error">{entry.batch.errorMessage}</Alert>
                        ) : null}

                        {entry.items.length > 0 ? (
                          <TableContainer>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>{intl.formatMessage({ id: 'admin.gameShops.history.column.localName', defaultMessage: 'localName' })}</TableCell>
                                  <TableCell>{intl.formatMessage({ id: 'admin.gameShops.history.column.ref', defaultMessage: 'ref' })}</TableCell>
                                  <TableCell>{intl.formatMessage({ id: 'admin.gameShops.history.column.change', defaultMessage: 'change' })}</TableCell>
                                  <TableCell>{intl.formatMessage({ id: 'admin.gameShops.history.column.price', defaultMessage: 'price' })}</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {entry.items.map((item, index) => (
                                  <TableRow key={`${entry.batchId}-${item.sourceRef}-${index}`}>
                                    <TableCell>{item.localName}</TableCell>
                                    <TableCell>{item.sourceRef}</TableCell>
                                    <TableCell>
                                      <Chip
                                        size="small"
                                        color={getChangeColor(item.changeType)}
                                        label={getChangeLabel(item.changeType, intl)}
                                      />
                                    </TableCell>
                                    <TableCell>{item.price.toLocaleString(intl.locale)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        ) : null}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </>
            ) : null}
          </Stack>
        </Paper>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: {
            xs: '1fr',
            xl: '1fr 1fr',
          },
        }}
      >
        {renderImportSection(
          intl.formatMessage({
            id: 'admin.gameShops.import.fullTitle',
            defaultMessage: 'Full Import',
          }),
          intl.formatMessage({
            id: 'admin.gameShops.import.fullDescription',
            defaultMessage: 'Paste the entire shops payload from a JSON file to preview and apply a full refresh for the included shops.',
          }),
          'full',
          fullImportText,
          setFullImportText,
          fullImportFileName,
          fullPreview,
        )}

        {renderImportSection(
          intl.formatMessage({
            id: 'admin.gameShops.import.singleTitle',
            defaultMessage: 'Single Shop Import',
          }),
          selectedShop
            ? intl.formatMessage({
              id: 'admin.gameShops.import.singleDescriptionSelected',
              defaultMessage: 'Preview or apply a one-shop payload. Current selection: {shopName} ({sourceShopId}).',
            }, {
              shopName: selectedShop.name,
              sourceShopId: selectedShop.sourceShopId,
            })
            : intl.formatMessage({
              id: 'admin.gameShops.import.singleDescription',
              defaultMessage: 'Paste one shop object to preview or apply a targeted update without touching other shops.',
            }),
          'single',
          singleImportText,
          setSingleImportText,
          singleImportFileName,
          singlePreview,
        )}
      </Box>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6">
              {intl.formatMessage({
                id: 'admin.gameShops.batches.title',
                defaultMessage: 'Recent Import Batches',
              })}
            </Typography>
            <Typography color="text.secondary">
              {intl.formatMessage({
                id: 'admin.gameShops.batches.description',
                defaultMessage: 'Track the latest import operations and their aggregated counts.',
              })}
            </Typography>
          </Box>

          {batchError ? (
            <Alert severity="error">
              {batchError instanceof Error ? batchError.message : intl.formatMessage({
                id: 'admin.gameShops.batches.loadFailed',
                defaultMessage: 'Failed to load recent batches.',
              })}
            </Alert>
          ) : null}

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: 'admin.gameShops.batches.column.batch', defaultMessage: 'Batch' })}</TableCell>
                  <TableCell>{intl.formatMessage({ id: 'admin.gameShops.batches.column.scope', defaultMessage: 'Scope' })}</TableCell>
                  <TableCell>{intl.formatMessage({ id: 'admin.gameShops.batches.column.status', defaultMessage: 'Status' })}</TableCell>
                  <TableCell>{intl.formatMessage({ id: 'admin.gameShops.batches.column.source', defaultMessage: 'Source' })}</TableCell>
                  <TableCell>{intl.formatMessage({ id: 'admin.gameShops.batches.column.shops', defaultMessage: 'Shops' })}</TableCell>
                  <TableCell>{intl.formatMessage({ id: 'admin.gameShops.batches.column.inventory', defaultMessage: 'Inventory' })}</TableCell>
                  <TableCell>{intl.formatMessage({ id: 'admin.gameShops.batches.column.created', defaultMessage: 'Created' })}</TableCell>
                  <TableCell align="right">{intl.formatMessage({ id: 'admin.gameShops.batches.column.actions', defaultMessage: 'Actions' })}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {batchLoading && !batchData?.list.length ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Typography align="center">
                        {intl.formatMessage({ id: 'loading', defaultMessage: 'Loading...' })}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : null}

                {!batchLoading && !batchData?.list.length ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Typography align="center" color="text.secondary">
                        {intl.formatMessage({
                          id: 'admin.gameShops.batches.empty',
                          defaultMessage: 'No import batches yet.',
                        })}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : null}

                {batchData?.list.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>
                      <Stack spacing={0.5}>
                        <Typography fontWeight={600}>{batch.id}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {batch.fileName || batch.sourceShopId || '-'}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>{getBatchScopeLabel(batch.scope, intl)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={getBatchStatusColor(batch.status)}
                        label={getBatchStatusLabel(batch.status, intl)}
                      />
                    </TableCell>
                    <TableCell>{getBatchSourceTypeLabel(batch.sourceType, intl)}</TableCell>
                    <TableCell>{batch.batchSummary.shopCount}</TableCell>
                    <TableCell>{batch.batchSummary.inventoryCount}</TableCell>
                    <TableCell>{formatDateTime(batch.createdAt)}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        {batch.status === 'pending' || batch.status === 'applying' ? (
                          <Button
                            size="small"
                            color="warning"
                            variant="outlined"
                            disabled={pendingCancelBatchId === batch.id}
                            onClick={() => {
                              void handleCancelBatch(batch.id);
                            }}
                          >
                            {pendingCancelBatchId === batch.id
                              ? intl.formatMessage({ id: 'admin.gameShops.status.cancelling', defaultMessage: 'Cancelling' })
                              : intl.formatMessage({ id: 'admin.gameShops.batches.cancel', defaultMessage: 'Cancel' })}
                          </Button>
                        ) : null}
                        {batch.status === 'applying' || batch.status === 'cancelling' ? (
                          <Button
                            size="small"
                            color="error"
                            variant="text"
                            disabled={pendingCancelBatchId === batch.id}
                            onClick={() => {
                              void handleCancelBatch(batch.id, true);
                            }}
                          >
                            {intl.formatMessage({ id: 'admin.gameShops.batches.forceCancel', defaultMessage: 'Force Cancel' })}
                          </Button>
                        ) : null}
                        {batch.status === 'cancelling' ? (
                          <Chip
                            size="small"
                            color="warning"
                            label={intl.formatMessage({ id: 'admin.gameShops.status.cancelling', defaultMessage: 'Cancelling' })}
                          />
                        ) : null}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </Paper>
    </Stack>
  );
}
