import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useIntl } from 'react-intl';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import type {
  ManufacturerTranslation,
  ManufacturerTranslationDetailResponse,
  ManufacturerTranslationDraftResponse,
  ManufacturerTranslationListResponse,
  ManufacturerTranslationUpsertResponse,
  ShipTranslationLocale,
} from '@/types';
import { RootState } from '@/store';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

const TRANSLATION_LOCALES: ShipTranslationLocale[] = ['zh-CN', 'zh-HK', 'ja-JP', 'de-DE'];

const TRANSLATION_LOCALE_LABELS: Record<ShipTranslationLocale, string> = {
  'zh-CN': '简体中文',
  'zh-HK': '繁體中文',
  'ja-JP': '日本語',
  'de-DE': 'Deutsch',
  en: 'English',
};

interface ManufacturerTranslationForm {
  manufacturerName: string;
}

const EMPTY_FORM: ManufacturerTranslationForm = {
  manufacturerName: '',
};

function toEditableForm(translation?: ManufacturerTranslation | null): ManufacturerTranslationForm {
  return {
    manufacturerName: translation?.manufacturerName || '',
  };
}

function formatTranslationTimestamp(value: string | undefined, locale: string) {
  if (!value) return '-';

  return new Date(value).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ManufacturerTranslationsManager() {
  const intl = useIntl();
  const { user } = useSelector((state: RootState) => state.user);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [targetLocale, setTargetLocale] = useState<ShipTranslationLocale>('zh-CN');
  const [selectedManufacturerId, setSelectedManufacturerId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ManufacturerTranslationForm>(EMPTY_FORM);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'deleting'>('idle');
  const [drafting, setDrafting] = useState(false);
  const [editorMessage, setEditorMessage] = useState<{ severity: 'success' | 'info' | 'error'; text: string } | null>(null);

  const listPath = `/api/manufacturer-translations?locale=${encodeURIComponent(targetLocale)}&page=${page + 1}&limit=${rowsPerPage}${query ? `&query=${encodeURIComponent(query)}` : ''}`;
  const {
    data: listData,
    error: listError,
    isLoading: listLoading,
    mutate: mutateList,
  } = useAuthApi<ManufacturerTranslationListResponse>(listPath, {
    revalidateOnFocus: false,
    revalidateIfStale: true,
  });

  const detailPath = dialogOpen && selectedManufacturerId
    ? `/api/manufacturer-translations/${selectedManufacturerId}`
    : null;
  const {
    data: detailData,
    error: detailError,
    isLoading: detailLoading,
    mutate: mutateDetail,
  } = useAuthApi<ManufacturerTranslationDetailResponse>(detailPath, {
    revalidateOnFocus: false,
    revalidateIfStale: true,
  });

  useEffect(() => {
    if (!detailData?.data) return;

    const translation = detailData.data.translations.find((item) => item?.locale === targetLocale) || null;
    setForm(toEditableForm(translation));
  }, [detailData, targetLocale]);

  const selectedTranslation = detailData?.data.translations.find((item) => item?.locale === targetLocale) || null;

  async function requestAuthorizedJson<T>(path: string, init: RequestInit) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: user.token ? `Bearer ${user.token}` : '',
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    const json = await response.json().catch(() => null);
    if (!response.ok || json?.success === false) {
      throw new Error(json?.message || 'Request failed');
    }

    return json as T;
  }

  const handleOpenEditor = (manufacturerId: number) => {
    setSelectedManufacturerId(manufacturerId);
    setDialogOpen(true);
    setEditorMessage(null);
    setDrafting(false);
    setForm(EMPTY_FORM);
  };

  const handleCloseEditor = () => {
    setDialogOpen(false);
    setSelectedManufacturerId(null);
    setEditorMessage(null);
    setSaveState('idle');
    setDrafting(false);
    setForm(EMPTY_FORM);
  };

  const handleSearch = () => {
    setPage(0);
    setQuery(searchInput.trim());
  };

  const handleSave = async () => {
    if (!selectedManufacturerId) return;

    setSaveState('saving');
    setEditorMessage(null);

    try {
      await requestAuthorizedJson<ManufacturerTranslationUpsertResponse>(
        `/api/manufacturer-translations/${selectedManufacturerId}/${targetLocale}`,
        {
          method: 'PUT',
          body: JSON.stringify(form),
        },
      );

      setEditorMessage({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.manufacturerTranslations.saveSuccess',
          defaultMessage: 'Translation saved.',
        }),
      });
      await Promise.all([mutateDetail(), mutateList()]);
    } catch (error) {
      setEditorMessage({
        severity: 'error',
        text: error instanceof Error ? error.message : intl.formatMessage({
          id: 'admin.manufacturerTranslations.saveFailed',
          defaultMessage: 'Failed to save translation.',
        }),
      });
    } finally {
      setSaveState('idle');
    }
  };

  const handleDelete = async () => {
    if (!selectedManufacturerId) return;

    const confirmed = window.confirm(intl.formatMessage({
      id: 'admin.manufacturerTranslations.deleteConfirm',
      defaultMessage: 'Delete the current locale translation?',
    }));
    if (!confirmed) return;

    setSaveState('deleting');
    setEditorMessage(null);

    try {
      await requestAuthorizedJson<{ success: boolean; deleted: boolean }>(
        `/api/manufacturer-translations/${selectedManufacturerId}/${targetLocale}`,
        {
          method: 'DELETE',
        },
      );

      setForm(EMPTY_FORM);
      setEditorMessage({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.manufacturerTranslations.deleteSuccess',
          defaultMessage: 'Translation deleted.',
        }),
      });
      await Promise.all([mutateDetail(), mutateList()]);
    } catch (error) {
      setEditorMessage({
        severity: 'error',
        text: error instanceof Error ? error.message : intl.formatMessage({
          id: 'admin.manufacturerTranslations.deleteFailed',
          defaultMessage: 'Failed to delete translation.',
        }),
      });
    } finally {
      setSaveState('idle');
    }
  };

  const handleGenerateAiDraft = async () => {
    if (!selectedManufacturerId) return;

    setDrafting(true);
    setEditorMessage(null);

    try {
      const result = await requestAuthorizedJson<ManufacturerTranslationDraftResponse>(
        `/api/manufacturer-translations/${selectedManufacturerId}/${targetLocale}/ai-draft`,
        {
          method: 'POST',
        },
      );

      setForm({
        manufacturerName: result.data.value || '',
      });
      setEditorMessage({
        severity: 'info',
        text: intl.formatMessage(
          {
            id: 'admin.manufacturerTranslations.aiDraftReady',
            defaultMessage: 'AI draft inserted from {model}. Review it before saving.',
          },
          {
            model: result.data.model,
          },
        ),
      });
    } catch (error) {
      setEditorMessage({
        severity: 'error',
        text: error instanceof Error ? error.message : intl.formatMessage({
          id: 'admin.manufacturerTranslations.aiDraftFailed',
          defaultMessage: 'Failed to generate AI draft.',
        }),
      });
    } finally {
      setDrafting(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" gutterBottom>
          {intl.formatMessage({
            id: 'admin.manufacturerTranslations.title',
            defaultMessage: 'Manufacturer Translations',
          })}
        </Typography>
        <Typography color="text.secondary">
          {intl.formatMessage({
            id: 'admin.manufacturerTranslations.description',
            defaultMessage: 'Manage reusable manufacturer translations separately from ship detail translations.',
          })}
        </Typography>
      </Box>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField
          label={intl.formatMessage({
            id: 'admin.manufacturerTranslations.search',
            defaultMessage: 'Search by manufacturer ID, manufacturer name, or ship name',
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
            id: 'admin.manufacturerTranslations.locale',
            defaultMessage: 'Target locale',
          })}
          value={targetLocale}
          onChange={(event) => {
            setTargetLocale(event.target.value as ShipTranslationLocale);
            setPage(0);
          }}
          sx={{ minWidth: 180 }}
        >
          {TRANSLATION_LOCALES.map((locale) => (
            <MenuItem key={locale} value={locale}>
              {TRANSLATION_LOCALE_LABELS[locale]}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" onClick={handleSearch}>
          {intl.formatMessage({
            id: 'admin.manufacturerTranslations.searchAction',
            defaultMessage: 'Search',
          })}
        </Button>
      </Stack>

      {listError && (
        <Alert severity="error">
          {listError instanceof Error ? listError.message : intl.formatMessage({
            id: 'admin.manufacturerTranslations.loadFailed',
            defaultMessage: 'Failed to load manufacturer translations.',
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
                  id: 'admin.manufacturerTranslations.manufacturer',
                  defaultMessage: 'Manufacturer',
                })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({
                  id: 'admin.manufacturerTranslations.shipCount',
                  defaultMessage: 'Ships',
                })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({
                  id: 'admin.manufacturerTranslations.status',
                  defaultMessage: 'Status',
                })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({
                  id: 'admin.manufacturerTranslations.updatedAt',
                  defaultMessage: 'Updated',
                })}
              </TableCell>
              <TableCell align="right">
                {intl.formatMessage({
                  id: 'admin.manufacturerTranslations.actions',
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
                      id: 'admin.manufacturerTranslations.empty',
                      defaultMessage: 'No manufacturers matched the current filter.',
                    })}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}

            {listData?.list.map((item) => (
              <TableRow key={`${item.manufacturerId}-${targetLocale}`} hover>
                <TableCell>{item.manufacturerId}</TableCell>
                <TableCell>{item.source.manufacturerName}</TableCell>
                <TableCell>{item.source.shipCount}</TableCell>
                <TableCell>
                  {item.translation ? (
                    <Chip
                      color="success"
                      size="small"
                      label={intl.formatMessage({
                        id: 'admin.manufacturerTranslations.translated',
                        defaultMessage: 'Translated',
                      })}
                    />
                  ) : (
                    <Chip
                      color="warning"
                      size="small"
                      label={intl.formatMessage({
                        id: 'admin.manufacturerTranslations.untranslated',
                        defaultMessage: 'Untranslated',
                      })}
                    />
                  )}
                </TableCell>
                <TableCell>{formatTranslationTimestamp(item.translation?.updatedAt, intl.locale)}</TableCell>
                <TableCell align="right">
                  <Button variant="outlined" onClick={() => handleOpenEditor(item.manufacturerId)}>
                    {intl.formatMessage({
                      id: 'admin.manufacturerTranslations.edit',
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
          setRowsPerPage(Number(event.target.value));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 20, 50]}
      />

      <Dialog open={dialogOpen} onClose={handleCloseEditor} fullWidth maxWidth="md">
        <DialogTitle>
          {intl.formatMessage({
            id: 'admin.manufacturerTranslations.editorTitle',
            defaultMessage: 'Edit manufacturer translation',
          })}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {detailError && (
              <Alert severity="error">
                {detailError instanceof Error ? detailError.message : intl.formatMessage({
                  id: 'admin.manufacturerTranslations.detailFailed',
                  defaultMessage: 'Failed to load translation detail.',
                })}
              </Alert>
            )}

            {editorMessage && (
              <Alert severity={editorMessage.severity}>
                {editorMessage.text}
              </Alert>
            )}

            <TextField
              select
              label={intl.formatMessage({
                id: 'admin.manufacturerTranslations.locale',
                defaultMessage: 'Target locale',
              })}
              value={targetLocale}
              onChange={(event) => setTargetLocale(event.target.value as ShipTranslationLocale)}
              sx={{ maxWidth: 220 }}
            >
              {TRANSLATION_LOCALES.map((locale) => (
                <MenuItem key={locale} value={locale}>
                  {TRANSLATION_LOCALE_LABELS[locale]}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label={intl.formatMessage({
                id: 'admin.manufacturerTranslations.sourceManufacturer',
                defaultMessage: 'Source manufacturer name',
              })}
              value={detailData?.data.source.manufacturerName || ''}
              fullWidth
              InputProps={{
                readOnly: true,
              }}
            />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'flex-start' }}>
              <TextField
                label={intl.formatMessage({
                  id: 'admin.manufacturerTranslations.targetManufacturer',
                  defaultMessage: 'Translated manufacturer name',
                })}
                value={form.manufacturerName}
                fullWidth
                onChange={(event) => setForm({ manufacturerName: event.target.value })}
              />
              <Button
                variant="outlined"
                onClick={handleGenerateAiDraft}
                disabled={!detailData?.data.source.manufacturerName || detailLoading || saveState !== 'idle' || drafting}
                sx={{ minWidth: 160 }}
              >
                {drafting
                  ? intl.formatMessage({
                    id: 'admin.manufacturerTranslations.generating',
                    defaultMessage: 'Generating...',
                  })
                  : intl.formatMessage({
                    id: 'admin.manufacturerTranslations.generateAi',
                    defaultMessage: 'Generate AI draft',
                  })}
              </Button>
            </Stack>

            <Stack spacing={1}>
              <Typography variant="subtitle2">
                {intl.formatMessage({
                  id: 'admin.manufacturerTranslations.relatedShips',
                  defaultMessage: 'Related ships',
                })}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {intl.formatMessage(
                  {
                    id: 'admin.manufacturerTranslations.relatedShipsCount',
                    defaultMessage: 'This translation will be reused by {count} ships.',
                  },
                  {
                    count: detailData?.data.source.shipCount || 0,
                  },
                )}
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {(detailData?.data.source.ships || []).map((ship) => (
                  <Chip key={ship.id} label={`${ship.name} (#${ship.id})`} size="small" variant="outlined" />
                ))}
              </Stack>
            </Stack>

            {selectedTranslation?.updatedAt && (
              <Typography variant="body2" color="text.secondary">
                {intl.formatMessage(
                  {
                    id: 'admin.manufacturerTranslations.currentUpdatedAt',
                    defaultMessage: 'Current locale updated at: {time}',
                  },
                  {
                    time: formatTranslationTimestamp(selectedTranslation.updatedAt, intl.locale),
                  },
                )}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditor}>
            {intl.formatMessage({
              id: 'admin.manufacturerTranslations.close',
              defaultMessage: 'Close',
            })}
          </Button>
          <Button
            color="error"
            onClick={handleDelete}
            disabled={saveState !== 'idle'}
          >
            {saveState === 'deleting'
              ? intl.formatMessage({
                id: 'admin.manufacturerTranslations.deleting',
                defaultMessage: 'Deleting...',
              })
              : intl.formatMessage({
                id: 'admin.manufacturerTranslations.delete',
                defaultMessage: 'Delete current locale',
              })}
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saveState !== 'idle'}
          >
            {saveState === 'saving'
              ? intl.formatMessage({
                id: 'admin.manufacturerTranslations.saving',
                defaultMessage: 'Saving...',
              })
              : intl.formatMessage({
                id: 'admin.manufacturerTranslations.save',
                defaultMessage: 'Save translation',
              })}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
