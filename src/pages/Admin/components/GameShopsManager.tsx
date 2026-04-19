import { useEffect, useState, type ChangeEvent } from 'react';
import { useIntl } from 'react-intl';
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

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
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

function SummarySection({ summary }: { summary: GameShopImportSummary }) {
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip label={`Shops ${summary.shopCount}`} size="small" />
        <Chip label={`Inventory ${summary.inventoryCount}`} size="small" />
        <Chip label={`Shop +${summary.shops.added}`} size="small" color="success" />
        <Chip label={`Shop ~${summary.shops.updated}`} size="small" color="warning" />
        <Chip label={`Shop =${summary.shops.unchanged}`} size="small" />
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip label={`Product +${summary.products.added}`} size="small" color="success" />
        <Chip label={`Product ~${summary.products.updated}`} size="small" color="warning" />
        <Chip label={`Product =${summary.products.unchanged}`} size="small" />
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip label={`Inv +${summary.inventory.added}`} size="small" color="success" />
        <Chip label={`Inv ~${summary.inventory.updated}`} size="small" color="warning" />
        <Chip label={`Inv -${summary.inventory.removed}`} size="small" color="error" />
        <Chip label={`Inv =${summary.inventory.unchanged}`} size="small" />
      </Stack>
    </Stack>
  );
}

function PreviewSection({
  title,
  response,
}: {
  title: string;
  response: GameShopImportResponse | null;
}) {
  if (!response) {
    return null;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1" fontWeight={600}>
        {title}
      </Typography>

      <SummarySection summary={response.summary} />

      {response.summary.warnings.length > 0 ? (
        <Alert severity="warning">
          {response.summary.warnings.join('；')}
        </Alert>
      ) : null}

      <TableContainer sx={{ maxHeight: 280 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Shop</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Inventory</TableCell>
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
                    label={shop.shopChangeType}
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

async function parseImportText(text: string): Promise<unknown> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('JSON payload is required.');
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error('Invalid JSON payload.');
  }
}

export default function GameShopsManager() {
  const intl = useIntl();
  const { user } = useSelector((state: RootState) => state.user);

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
  const hasActiveBatch = (batchData?.list || []).some((batch) => batch.status === 'pending' || batch.status === 'applying');
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
    const payload = await parseImportText(payloadText);
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
        : 'Request failed.');
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
        : 'Request failed.');
    }

    return json as GameShopShipMatchRematchResponse;
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
        text: error instanceof Error ? error.message : 'Preview failed.',
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
          ? (mode === 'full'
            ? `Full import applied. Batch ${response.data?.batchId || '-'}.`
            : `Single shop import applied. Batch ${response.data?.batchId || '-'}.`)
          : (mode === 'full'
            ? `Full import submitted. Batch ${response.data?.batchId || '-'} is processing in background.`
            : `Single shop import submitted. Batch ${response.data?.batchId || '-'} is processing in background.`),
      });
    } catch (error) {
      setFlash({
        severity: 'error',
        text: error instanceof Error ? error.message : 'Apply failed.',
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
        text: `Ship matches rebuilt. Updated ${response.data.updatedProducts}/${response.data.totalProducts}, matched ${response.data.matched}, ambiguous ${response.data.ambiguous}, unmatched ${response.data.unmatched}.`,
      });
    } catch (error) {
      setFlash({
        severity: 'error',
        text: error instanceof Error ? error.message : 'Rematch failed.',
      });
    } finally {
      setPendingAction(null);
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
            {intl.formatMessage({
              id: 'admin.gameShops.import.uploadJson',
              defaultMessage: 'Load JSON file',
            })}
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
                            {shop.isRental ? <Chip size="small" label="Rental" /> : null}
                            {!shop.isActive ? <Chip size="small" color="warning" label="Inactive" /> : null}
                          </Stack>
                        </Stack>
                      </TableCell>
                      <TableCell>{shop.system || '-'}</TableCell>
                      <TableCell>{shop.activeInventoryCount}</TableCell>
                      <TableCell>{formatTimestamp(shop.lastSeenAt)}</TableCell>
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
                    <Chip size="small" label={`Source ${selectedShop.sourceShopId}`} />
                    <Chip size="small" label={`Inventory ${selectedShop.activeInventoryCount}`} />
                    {selectedShop.isRental ? <Chip size="small" label="Rental" /> : null}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    First seen: {formatTimestamp(selectedShop.firstSeenAt)} | Last seen: {formatTimestamp(selectedShop.lastSeenAt)}
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
                        <TableCell>localName</TableCell>
                        <TableCell>ref</TableCell>
                        <TableCell>price</TableCell>
                        <TableCell>available</TableCell>
                        <TableCell>unavailable</TableCell>
                        <TableCell>updated</TableCell>
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
                          <TableCell>{inventoryItem.price.toLocaleString()}</TableCell>
                          <TableCell>{formatNullableNumber(inventoryItem.available)}</TableCell>
                          <TableCell>{formatNullableNumber(inventoryItem.unavailable)}</TableCell>
                          <TableCell>{formatTimestamp(inventoryItem.lastSeenAt)}</TableCell>
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
                              Batch {entry.batchId}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {entry.batch.scope} / {entry.batch.sourceType} / {formatTimestamp(entry.batch.createdAt)}
                            </Typography>
                          </Stack>
                          <Stack direction="row" spacing={1}>
                            <Chip
                              size="small"
                              color={getChangeColor(entry.changeType)}
                              label={entry.changeType}
                            />
                            <Chip
                              size="small"
                              color={entry.batch.status === 'failed' ? 'error' : entry.batch.status === 'applied' ? 'success' : 'warning'}
                              label={entry.batch.status}
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
                                  <TableCell>localName</TableCell>
                                  <TableCell>ref</TableCell>
                                  <TableCell>change</TableCell>
                                  <TableCell>price</TableCell>
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
                                        label={item.changeType}
                                      />
                                    </TableCell>
                                    <TableCell>{item.price.toLocaleString()}</TableCell>
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
              defaultMessage: `Preview or apply a one-shop payload. Current selection: ${selectedShop.name} (${selectedShop.sourceShopId}).`,
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
                  <TableCell>Batch</TableCell>
                  <TableCell>Scope</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Shops</TableCell>
                  <TableCell>Inventory</TableCell>
                  <TableCell>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {batchLoading && !batchData?.list.length ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Typography align="center">
                        {intl.formatMessage({ id: 'loading', defaultMessage: 'Loading...' })}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : null}

                {!batchLoading && !batchData?.list.length ? (
                  <TableRow>
                    <TableCell colSpan={7}>
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
                    <TableCell>{batch.scope}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={batch.status === 'failed' ? 'error' : batch.status === 'applied' ? 'success' : 'warning'}
                        label={batch.status}
                      />
                    </TableCell>
                    <TableCell>{batch.sourceType}</TableCell>
                    <TableCell>{batch.batchSummary.shopCount}</TableCell>
                    <TableCell>{batch.batchSummary.inventoryCount}</TableCell>
                    <TableCell>{formatTimestamp(batch.createdAt)}</TableCell>
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
