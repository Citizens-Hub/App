import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useIntl } from 'react-intl';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { useAuthApi } from '@/hooks';
import { RootState } from '@/store';
import type {
  ShipTranslation,
  ShipTranslationDetailResponse,
  ShipTranslationDraftResponse,
  ShipTranslationField,
  ShipTranslationLocale,
  ShipTranslationUpsertResponse,
} from '@/types';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export const SHIP_TRANSLATION_LOCALES: ShipTranslationLocale[] = ['zh-CN', 'zh-HK', 'ja-JP', 'de-DE'];

export const SHIP_TRANSLATION_LOCALE_LABELS: Record<ShipTranslationLocale, string> = {
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

export function formatShipTranslationTimestamp(value: string | undefined, locale: string) {
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

interface ShipTranslationEditorDialogProps {
  open: boolean;
  shipId: number | null;
  onClose: () => void;
  initialLocale?: ShipTranslationLocale;
  onSaved?: () => void | Promise<void>;
}

export default function ShipTranslationEditorDialog({
  open,
  shipId,
  onClose,
  initialLocale = 'zh-CN',
  onSaved,
}: ShipTranslationEditorDialogProps) {
  const intl = useIntl();
  const { user } = useSelector((state: RootState) => state.user);
  const [targetLocale, setTargetLocale] = useState<ShipTranslationLocale>(initialLocale);
  const [form, setForm] = useState<ShipTranslationForm>(EMPTY_FORM);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'deleting'>('idle');
  const [draftingField, setDraftingField] = useState<ShipTranslationField | null>(null);
  const [editorMessage, setEditorMessage] = useState<{ severity: 'success' | 'info' | 'error'; text: string } | null>(null);

  const detailPath = open && shipId
    ? `/api/ship-translations/${shipId}`
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
    if (!open) {
      return;
    }

    setTargetLocale(initialLocale);
    setForm(EMPTY_FORM);
    setSaveState('idle');
    setDraftingField(null);
    setEditorMessage(null);
  }, [open, shipId, initialLocale]);

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

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setSaveState('idle');
    setDraftingField(null);
    setEditorMessage(null);
    onClose();
  };

  const handleSave = async () => {
    if (!shipId) return;

    setSaveState('saving');
    setEditorMessage(null);

    try {
      await requestAuthorizedJson<ShipTranslationUpsertResponse>(
        `/api/ship-translations/${shipId}/${targetLocale}`,
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
      await Promise.all([mutateDetail(), Promise.resolve(onSaved?.())]);
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
    if (!shipId) return;

    const confirmed = window.confirm(intl.formatMessage({
      id: 'admin.shipTranslations.deleteConfirm',
      defaultMessage: 'Delete the current locale translation?',
    }));
    if (!confirmed) return;

    setSaveState('deleting');
    setEditorMessage(null);

    try {
      await requestAuthorizedJson<{ success: boolean; deleted: boolean }>(
        `/api/ship-translations/${shipId}/${targetLocale}`,
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
      await Promise.all([mutateDetail(), Promise.resolve(onSaved?.())]);
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
    if (!shipId) return;

    setDraftingField(field);
    setEditorMessage(null);

    try {
      const result = await requestAuthorizedJson<ShipTranslationDraftResponse>(
        `/api/ship-translations/${shipId}/${targetLocale}/ai-draft`,
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
    <Dialog
      open={open}
      onClose={handleClose}
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
                  updatedAt: formatShipTranslationTimestamp(selectedTranslation?.updatedAt, intl.locale),
                },
              )}
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>
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
          disabled={!shipId || detailLoading || saveState !== 'idle' || draftingField !== null}
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
  );
}
