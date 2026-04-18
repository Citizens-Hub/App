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
  ShipTranslation,
  ShipTranslationDetailResponse,
  ShipTranslationDraftResponse,
  ShipTranslationField,
  ShipTranslationListResponse,
  ShipTranslationLocale,
  ShipTranslationUpsertResponse,
} from '@/types';
import { RootState } from '@/store';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

const SHIP_TRANSLATION_LOCALES: ShipTranslationLocale[] = ['zh-CN', 'zh-HK', 'ja-JP', 'de-DE'];

const SHIP_TRANSLATION_LOCALE_LABELS: Record<ShipTranslationLocale, string> = {
  'zh-CN': '简体中文',
  'zh-HK': '繁體中文',
  'ja-JP': '日本語',
  'de-DE': 'Deutsch',
  en: 'English',
};

type ShipTranslationForm = Record<ShipTranslationField, string>;

const EMPTY_FORM: ShipTranslationForm = {
  shipName: '',
  title: '',
  excerpt: '',
  body: '',
};

function toEditableForm(translation?: ShipTranslation | null): ShipTranslationForm {
  return {
    shipName: translation?.shipName || '',
    title: translation?.title || '',
    excerpt: translation?.excerpt || '',
    body: translation?.body || '',
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

function TranslationField({
  sourceLabel,
  sourceValue,
  targetLabel,
  value,
  onChange,
  onGenerateAiDraft,
  aiButtonLabel,
  aiLoadingLabel,
  aiLoading = false,
  aiDisabled = false,
  multiline = false,
  minRows,
}: {
  sourceLabel: string;
  sourceValue: string;
  targetLabel: string;
  value: string;
  onChange: (nextValue: string) => void;
  onGenerateAiDraft: () => void;
  aiButtonLabel: string;
  aiLoadingLabel: string;
  aiLoading?: boolean;
  aiDisabled?: boolean;
  multiline?: boolean;
  minRows?: number;
}) {
  return (
    <Stack spacing={1.5}>
      <TextField
        label={sourceLabel}
        value={sourceValue || '-'}
        fullWidth
        multiline={multiline}
        minRows={multiline ? minRows : undefined}
        InputProps={{
          readOnly: true,
        }}
      />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'flex-start' }}>
        <TextField
          label={targetLabel}
          value={value}
          fullWidth
          multiline={multiline}
          minRows={multiline ? minRows : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          variant="outlined"
          onClick={onGenerateAiDraft}
          disabled={aiDisabled}
          sx={{ minWidth: 160 }}
        >
          {aiLoading ? aiLoadingLabel : aiButtonLabel}
        </Button>
      </Stack>
    </Stack>
  );
}

export default function ShipTranslationsManager() {
  const intl = useIntl();
  const { user } = useSelector((state: RootState) => state.user);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [targetLocale, setTargetLocale] = useState<ShipTranslationLocale>('zh-CN');
  const [selectedShipId, setSelectedShipId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ShipTranslationForm>(EMPTY_FORM);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'deleting'>('idle');
  const [draftingField, setDraftingField] = useState<ShipTranslationField | null>(null);
  const [editorMessage, setEditorMessage] = useState<{ severity: 'success' | 'info' | 'error'; text: string } | null>(null);

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

  const detailPath = dialogOpen && selectedShipId
    ? `/api/ship-translations/${selectedShipId}`
    : null;
  const {
    data: detailData,
    error: detailError,
    isLoading: detailLoading,
    mutate: mutateDetail,
  } = useAuthApi<ShipTranslationDetailResponse>(detailPath, {
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

  const getFieldDisplayName = (field: ShipTranslationField) => {
    switch (field) {
      case 'shipName':
        return intl.formatMessage({
          id: 'admin.shipTranslations.targetShipName',
          defaultMessage: 'Translated ship name',
        });
      case 'title':
        return intl.formatMessage({
          id: 'admin.shipTranslations.targetTitle',
          defaultMessage: 'Translated detail title',
        });
      case 'excerpt':
        return intl.formatMessage({
          id: 'admin.shipTranslations.targetExcerpt',
          defaultMessage: 'Translated excerpt',
        });
      case 'body':
        return intl.formatMessage({
          id: 'admin.shipTranslations.targetBody',
          defaultMessage: 'Translated body',
        });
    }
  };

  const handleOpenEditor = (shipId: number) => {
    setSelectedShipId(shipId);
    setDialogOpen(true);
    setEditorMessage(null);
    setDraftingField(null);
    setForm(EMPTY_FORM);
  };

  const handleCloseEditor = () => {
    setDialogOpen(false);
    setSelectedShipId(null);
    setEditorMessage(null);
    setSaveState('idle');
    setDraftingField(null);
    setForm(EMPTY_FORM);
  };

  const handleSearch = () => {
    setPage(0);
    setQuery(searchInput.trim());
  };

  const handleSave = async () => {
    if (!selectedShipId) return;

    setSaveState('saving');
    setEditorMessage(null);

    try {
      await requestAuthorizedJson<ShipTranslationUpsertResponse>(
        `/api/ship-translations/${selectedShipId}/${targetLocale}`,
        {
          method: 'PUT',
          body: JSON.stringify(form),
        },
      );

      setEditorMessage({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.shipTranslations.saveSuccess',
          defaultMessage: 'Translation saved.',
        }),
      });
      await Promise.all([mutateDetail(), mutateList()]);
    } catch (error) {
      setEditorMessage({
        severity: 'error',
        text: error instanceof Error ? error.message : intl.formatMessage({
          id: 'admin.shipTranslations.saveFailed',
          defaultMessage: 'Failed to save translation.',
        }),
      });
    } finally {
      setSaveState('idle');
    }
  };

  const handleDelete = async () => {
    if (!selectedShipId) return;

    const confirmed = window.confirm(intl.formatMessage({
      id: 'admin.shipTranslations.deleteConfirm',
      defaultMessage: 'Delete the current locale translation?',
    }));
    if (!confirmed) return;

    setSaveState('deleting');
    setEditorMessage(null);

    try {
      await requestAuthorizedJson<{ success: boolean; deleted: boolean }>(
        `/api/ship-translations/${selectedShipId}/${targetLocale}`,
        {
          method: 'DELETE',
        },
      );

      setForm(EMPTY_FORM);
      setEditorMessage({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.shipTranslations.deleteSuccess',
          defaultMessage: 'Translation deleted.',
        }),
      });
      await Promise.all([mutateDetail(), mutateList()]);
    } catch (error) {
      setEditorMessage({
        severity: 'error',
        text: error instanceof Error ? error.message : intl.formatMessage({
          id: 'admin.shipTranslations.deleteFailed',
          defaultMessage: 'Failed to delete translation.',
        }),
      });
    } finally {
      setSaveState('idle');
    }
  };

  const handleGenerateAiDraft = async (field: ShipTranslationField) => {
    if (!selectedShipId) return;

    setDraftingField(field);
    setEditorMessage(null);

    try {
      const result = await requestAuthorizedJson<ShipTranslationDraftResponse>(
        `/api/ship-translations/${selectedShipId}/${targetLocale}/ai-draft`,
        {
          method: 'POST',
          body: JSON.stringify({ field }),
        },
      );

      setForm((current) => ({
        ...current,
        [result.data.field]: result.data.value || '',
      }));
      setEditorMessage({
        severity: 'info',
        text: intl.formatMessage(
          {
            id: 'admin.shipTranslations.aiDraftReady',
            defaultMessage: 'AI draft inserted into {field} from {model}. Review it before saving.',
          },
          {
            field: getFieldDisplayName(result.data.field),
            model: result.data.model,
          },
        ),
      });
    } catch (error) {
      setEditorMessage({
        severity: 'error',
        text: error instanceof Error ? error.message : intl.formatMessage({
          id: 'admin.shipTranslations.aiDraftFailed',
          defaultMessage: 'Failed to generate AI draft.',
        }),
      });
    } finally {
      setDraftingField(null);
    }
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
                <TableCell>{formatTranslationTimestamp(item.translation?.updatedAt, intl.locale)}</TableCell>
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

      <Dialog
        open={dialogOpen}
        onClose={handleCloseEditor}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>
          {intl.formatMessage({
            id: 'admin.shipTranslations.editorTitle',
            defaultMessage: 'Edit Ship Translation',
          })}
        </DialogTitle>
        <DialogContent dividers>
          {detailError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {detailError instanceof Error ? detailError.message : intl.formatMessage({
                id: 'admin.shipTranslations.detailFailed',
                defaultMessage: 'Failed to load translation detail.',
              })}
            </Alert>
          )}

          {editorMessage && (
            <Alert severity={editorMessage.severity} sx={{ mb: 2 }}>
              {editorMessage.text}
            </Alert>
          )}

          {detailLoading || !detailData?.data ? (
            <Typography align="center">
              {intl.formatMessage({ id: 'loading', defaultMessage: 'Loading...' })}
            </Typography>
          ) : (
            <Stack spacing={3}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
                <Box>
                  <Typography variant="h6">{detailData.data.source.shipName}</Typography>
                  <Typography color="text.secondary">{detailData.data.slug || '-'}</Typography>
                </Box>
                <TextField
                  select
                  label={intl.formatMessage({
                    id: 'admin.shipTranslations.locale',
                    defaultMessage: 'Target locale',
                  })}
                  value={targetLocale}
                  onChange={(event) => setTargetLocale(event.target.value as ShipTranslationLocale)}
                  sx={{ minWidth: 180 }}
                >
                  {SHIP_TRANSLATION_LOCALES.map((locale) => (
                    <MenuItem key={locale} value={locale}>
                      {SHIP_TRANSLATION_LOCALE_LABELS[locale]}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              <TranslationField
                sourceLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.sourceShipName',
                  defaultMessage: 'Source ship name',
                })}
                sourceValue={detailData.data.source.shipName}
                targetLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.targetShipName',
                  defaultMessage: 'Translated ship name',
                })}
                value={form.shipName}
                onChange={(nextValue) => setForm((current) => ({ ...current, shipName: nextValue }))}
                onGenerateAiDraft={() => handleGenerateAiDraft('shipName')}
                aiButtonLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.generateFieldAi',
                  defaultMessage: 'AI Translate Field',
                })}
                aiLoadingLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.generating',
                  defaultMessage: 'Generating...',
                })}
                aiLoading={draftingField === 'shipName'}
                aiDisabled={!detailData.data.source.shipName || detailLoading || saveState !== 'idle' || draftingField !== null}
              />

              <TranslationField
                sourceLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.sourceTitle',
                  defaultMessage: 'Source detail title',
                })}
                sourceValue={detailData.data.source.title}
                targetLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.targetTitle',
                  defaultMessage: 'Translated detail title',
                })}
                value={form.title}
                onChange={(nextValue) => setForm((current) => ({ ...current, title: nextValue }))}
                onGenerateAiDraft={() => handleGenerateAiDraft('title')}
                aiButtonLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.generateFieldAi',
                  defaultMessage: 'AI Translate Field',
                })}
                aiLoadingLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.generating',
                  defaultMessage: 'Generating...',
                })}
                aiLoading={draftingField === 'title'}
                aiDisabled={!detailData.data.source.title || detailLoading || saveState !== 'idle' || draftingField !== null}
              />

              <TranslationField
                sourceLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.sourceExcerpt',
                  defaultMessage: 'Source excerpt',
                })}
                sourceValue={detailData.data.source.excerpt}
                targetLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.targetExcerpt',
                  defaultMessage: 'Translated excerpt',
                })}
                value={form.excerpt}
                onChange={(nextValue) => setForm((current) => ({ ...current, excerpt: nextValue }))}
                onGenerateAiDraft={() => handleGenerateAiDraft('excerpt')}
                aiButtonLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.generateFieldAi',
                  defaultMessage: 'AI Translate Field',
                })}
                aiLoadingLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.generating',
                  defaultMessage: 'Generating...',
                })}
                aiLoading={draftingField === 'excerpt'}
                aiDisabled={!detailData.data.source.excerpt || detailLoading || saveState !== 'idle' || draftingField !== null}
                multiline
                minRows={4}
              />

              <TranslationField
                sourceLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.sourceBody',
                  defaultMessage: 'Source body',
                })}
                sourceValue={detailData.data.source.body}
                targetLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.targetBody',
                  defaultMessage: 'Translated body',
                })}
                value={form.body}
                onChange={(nextValue) => setForm((current) => ({ ...current, body: nextValue }))}
                onGenerateAiDraft={() => handleGenerateAiDraft('body')}
                aiButtonLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.generateFieldAi',
                  defaultMessage: 'AI Translate Field',
                })}
                aiLoadingLabel={intl.formatMessage({
                  id: 'admin.shipTranslations.generating',
                  defaultMessage: 'Generating...',
                })}
                aiLoading={draftingField === 'body'}
                aiDisabled={!detailData.data.source.body || detailLoading || saveState !== 'idle' || draftingField !== null}
                multiline
                minRows={8}
              />

              <Typography color="text.secondary" variant="body2">
                {intl.formatMessage(
                  {
                    id: 'admin.shipTranslations.currentUpdatedAt',
                    defaultMessage: 'Current translation updated at: {updatedAt}',
                  },
                  {
                    updatedAt: formatTranslationTimestamp(selectedTranslation?.updatedAt, intl.locale),
                  },
                )}
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditor}>
            {intl.formatMessage({
              id: 'admin.shipTranslations.close',
              defaultMessage: 'Close',
            })}
          </Button>
          <Button
            color="error"
            onClick={handleDelete}
            disabled={!selectedTranslation || detailLoading || saveState !== 'idle' || draftingField !== null}
          >
            {saveState === 'deleting'
              ? intl.formatMessage({
                  id: 'admin.shipTranslations.deleting',
                  defaultMessage: 'Deleting...',
                })
              : intl.formatMessage({
                  id: 'admin.shipTranslations.delete',
                  defaultMessage: 'Delete',
                })}
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!selectedShipId || detailLoading || saveState !== 'idle' || draftingField !== null}
          >
            {saveState === 'saving'
              ? intl.formatMessage({
                  id: 'admin.shipTranslations.saving',
                  defaultMessage: 'Saving...',
                })
              : intl.formatMessage({
                  id: 'admin.shipTranslations.save',
                  defaultMessage: 'Save',
                })}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
