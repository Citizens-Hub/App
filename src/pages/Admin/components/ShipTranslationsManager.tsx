import { useState } from 'react';
import { useIntl } from 'react-intl';
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
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
import type { ShipTranslationListResponse, ShipTranslationLocale } from '@/types';
import ShipTranslationEditorDialog, {
  formatShipTranslationTimestamp,
  SHIP_TRANSLATION_LOCALE_LABELS,
  SHIP_TRANSLATION_LOCALES,
} from './ShipTranslationEditorDialog';

export default function ShipTranslationsManager() {
  const intl = useIntl();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [targetLocale, setTargetLocale] = useState<ShipTranslationLocale>('zh-CN');
  const [selectedShipId, setSelectedShipId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const listPath = `/api/ship-translations?locale=${encodeURIComponent(targetLocale)}&page=${page + 1}&limit=${rowsPerPage}${query ? `&query=${encodeURIComponent(query)}` : ''}`;
  const {
    data: listData,
    error: listError,
    isLoading: listLoading,
    mutate: mutateList,
  } = useAuthApi<ShipTranslationListResponse>(listPath, {
    revalidateOnFocus: false,
    revalidateIfStale: true,
  });

  const handleOpenEditor = (shipId: number) => {
    setSelectedShipId(shipId);
    setDialogOpen(true);
  };

  const handleCloseEditor = () => {
    setDialogOpen(false);
    setSelectedShipId(null);
  };

  const handleSearch = () => {
    setPage(0);
    setQuery(searchInput.trim());
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" gutterBottom>
          {intl.formatMessage({
            id: 'admin.shipTranslations.title',
            defaultMessage: 'Ship Translations',
          })}
        </Typography>
        <Typography color="text.secondary">
          {intl.formatMessage({
            id: 'admin.shipTranslations.description',
            defaultMessage: 'Manage ship name and ship detail translations without touching RSI source data.',
          })}
        </Typography>
      </Box>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField
          label={intl.formatMessage({
            id: 'admin.shipTranslations.search',
            defaultMessage: 'Search by ship ID, name, manufacturer, or slug',
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
            id: 'admin.shipTranslations.locale',
            defaultMessage: 'Target locale',
          })}
          value={targetLocale}
          onChange={(event) => {
            setTargetLocale(event.target.value as ShipTranslationLocale);
            setPage(0);
          }}
          sx={{ minWidth: 180 }}
        >
          {SHIP_TRANSLATION_LOCALES.map((locale) => (
            <MenuItem key={locale} value={locale}>
              {SHIP_TRANSLATION_LOCALE_LABELS[locale]}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" onClick={handleSearch}>
          {intl.formatMessage({
            id: 'admin.shipTranslations.searchAction',
            defaultMessage: 'Search',
          })}
        </Button>
      </Stack>

      {listError && (
        <Alert severity="error">
          {listError instanceof Error ? listError.message : intl.formatMessage({
            id: 'admin.shipTranslations.loadFailed',
            defaultMessage: 'Failed to load ship translations.',
          })}
        </Alert>
      )}

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>
                {intl.formatMessage({
                  id: 'admin.shipTranslations.ship',
                  defaultMessage: 'Ship',
                })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({
                  id: 'admin.shipTranslations.manufacturer',
                  defaultMessage: 'Manufacturer',
                })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({
                  id: 'admin.shipTranslations.status',
                  defaultMessage: 'Status',
                })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({
                  id: 'admin.shipTranslations.updatedAt',
                  defaultMessage: 'Updated',
                })}
              </TableCell>
              <TableCell align="right">
                {intl.formatMessage({
                  id: 'admin.shipTranslations.actions',
                  defaultMessage: 'Actions',
                })}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {listLoading && !listData?.list?.length ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography align="center">
                    {intl.formatMessage({ id: 'loading', defaultMessage: 'Loading...' })}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}

            {!listLoading && !listData?.list?.length ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography align="center" color="text.secondary">
                    {intl.formatMessage({
                      id: 'admin.shipTranslations.empty',
                      defaultMessage: 'No ships matched the current filter.',
                    })}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}

            {listData?.list.map((item) => (
              <TableRow key={`${item.shipId}-${targetLocale}`} hover>
                <TableCell>{item.shipId}</TableCell>
                <TableCell>
                  <Stack spacing={0.5}>
                    <Typography fontWeight={600}>{item.source.shipName}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.slug || '-'}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell>{item.source.manufacturerName || '-'}</TableCell>
                <TableCell>
                  {item.translation ? (
                    <Chip
                      color="success"
                      size="small"
                      label={intl.formatMessage({
                        id: 'admin.shipTranslations.translated',
                        defaultMessage: 'Translated',
                      })}
                    />
                  ) : (
                    <Chip
                      color="warning"
                      size="small"
                      label={intl.formatMessage({
                        id: 'admin.shipTranslations.untranslated',
                        defaultMessage: 'Untranslated',
                      })}
                    />
                  )}
                </TableCell>
                <TableCell>{formatShipTranslationTimestamp(item.translation?.updatedAt, intl.locale)}</TableCell>
                <TableCell align="right">
                  <Button variant="outlined" onClick={() => handleOpenEditor(item.shipId)}>
                    {intl.formatMessage({
                      id: 'admin.shipTranslations.edit',
                      defaultMessage: 'Edit',
                    })}
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

      <ShipTranslationEditorDialog
        open={dialogOpen}
        shipId={selectedShipId}
        onClose={handleCloseEditor}
        initialLocale={targetLocale}
        onSaved={async () => {
          await mutateList();
        }}
      />
    </Stack>
  );
}
