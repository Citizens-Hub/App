import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { Plus, Trash2 } from 'lucide-react';
import { CloudUpload } from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { useSWRConfig } from 'swr';

import { useAdminMarketHomeSettings, useApi } from '@/hooks';
import {
  MarketHomeHeroSlide,
  MarketHomeHeroTranslation,
  MarketHomeLocaleCode,
  MarketHomeSettings,
  ShipsData,
} from '@/types';
import { RootState } from '@/store';
import { getShipDisplayName, getShipManufacturerDisplayName } from '@/utils/shipDisplay';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
const MARKET_HOME_LOCALES: MarketHomeLocaleCode[] = ['zh-CN', 'zh-HK', 'en', 'ja-JP', 'de-DE'];

const EMPTY_TRANSLATION: MarketHomeHeroTranslation = {
  eyebrow: '',
  title: '',
  subtitle: '',
  ctaLabel: '',
};

const DEFAULT_SETTINGS: MarketHomeSettings = {
  enabled: true,
  slides: [],
  updatedAt: null,
};

type UploadTarget = 'media' | 'poster';

interface MarketHomeMediaUploadResponse {
  success: boolean;
  data: {
    mediaType: 'image' | 'video';
    url: string;
    fileName: string;
    fileSize: number;
    contentType: string;
    filePath: string;
  };
  error?: string;
}

function createEmptySlide(index: number): MarketHomeHeroSlide {
  return {
    id: `hero-${Date.now()}-${index}`,
    enabled: true,
    mediaType: 'image',
    mediaUrl: '',
    posterUrl: '',
    shipId: null,
    linkMode: 'ship',
    translations: {
      'zh-CN': {
        eyebrow: 'Featured Ship',
        title: '',
        subtitle: '',
        ctaLabel: '查看详情',
      },
      en: {
        eyebrow: 'Featured Ship',
        title: '',
        subtitle: '',
        ctaLabel: 'View details',
      },
    },
  };
}

function getLocaleLabel(locale: MarketHomeLocaleCode) {
  switch (locale) {
    case 'zh-CN':
      return '简体中文';
    case 'zh-HK':
      return '繁體中文';
    case 'ja-JP':
      return '日本語';
    case 'de-DE':
      return 'Deutsch';
    case 'en':
    default:
      return 'English';
  }
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) {
    return '-';
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 1 : 2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(bytes >= 100 * 1024 ? 0 : 1)} KB`;
  }

  return `${bytes} B`;
}

function normalizeSettings(settings?: MarketHomeSettings | null): MarketHomeSettings {
  if (!settings) {
    return DEFAULT_SETTINGS;
  }

  return {
    enabled: settings.enabled !== false,
    slides: Array.isArray(settings.slides) ? settings.slides : [],
    updatedAt: settings.updatedAt || null,
  };
}

export default function MarketHomeSettingsManager() {
  const intl = useIntl();
  const token = useSelector((state: RootState) => state.user.user.token);
  const { mutate: mutateCache } = useSWRConfig();
  const { data, error, isLoading, mutate } = useAdminMarketHomeSettings();
  const { data: shipsData, error: shipsError, isLoading: shipsLoading } = useApi<ShipsData>('/api/ships', {
    revalidateOnFocus: false,
  });
  const [settings, setSettings] = useState<MarketHomeSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setSettings(normalizeSettings(data?.data.settings));
  }, [data]);

  const activeSlides = useMemo(() => (
    settings.slides.filter((slide) => slide.enabled && slide.mediaUrl.trim() && slide.shipId)
  ), [settings.slides]);
  const shipOptions = useMemo(() => {
    return [...(shipsData?.data.ships || [])].sort((left, right) => (
      getShipDisplayName(left).localeCompare(getShipDisplayName(right))
    ));
  }, [shipsData?.data.ships]);
  const shipsById = useMemo(() => {
    return new Map(shipOptions.map((ship) => [ship.id, ship]));
  }, [shipOptions]);

  const updateSlide = (slideIndex: number, updater: (slide: MarketHomeHeroSlide) => MarketHomeHeroSlide) => {
    setSettings((current) => ({
      ...current,
      slides: current.slides.map((slide, index) => (index === slideIndex ? updater(slide) : slide)),
    }));
  };

  const updateTranslation = (
    slideIndex: number,
    locale: MarketHomeLocaleCode,
    field: keyof MarketHomeHeroTranslation,
    value: string,
  ) => {
    updateSlide(slideIndex, (slide) => ({
      ...slide,
      translations: {
        ...slide.translations,
        [locale]: {
          ...(slide.translations[locale] || EMPTY_TRANSLATION),
          [field]: value,
        },
      },
    }));
  };

  const handleAddSlide = () => {
    setSettings((current) => ({
      ...current,
      slides: [...current.slides, createEmptySlide(current.slides.length)],
    }));
  };

  const handleRemoveSlide = (slideIndex: number) => {
    setSettings((current) => ({
      ...current,
      slides: current.slides.filter((_, index) => index !== slideIndex),
    }));
  };

  const handleUploadMedia = async (slideIndex: number, file: File | null | undefined, target: UploadTarget) => {
    if (!file) {
      return;
    }

    const slide = settings.slides[slideIndex];
    if (!slide) {
      return;
    }

    const uploadKey = `${slide.id || slideIndex}:${target}`;
    setUploadingKey(uploadKey);
    setFlash(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mediaType', target === 'poster' ? 'image' : slide.mediaType);

      const response = await fetch(`${API_BASE_URL}/api/admin/market/home-media`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json().catch(() => null) as MarketHomeMediaUploadResponse | null;
      if (!response.ok || !result?.data?.url) {
        throw new Error(result?.error || 'Failed to upload market home media');
      }

      updateSlide(slideIndex, (current) => ({
        ...current,
        mediaType: target === 'poster' ? current.mediaType : result.data.mediaType,
        mediaUrl: target === 'media' ? result.data.url : current.mediaUrl,
        posterUrl: target === 'poster' ? result.data.url : current.posterUrl,
      }));

      setFlash({
        severity: 'success',
        text: intl.formatMessage(
          { id: 'admin.marketHome.uploadSuccess', defaultMessage: 'Uploaded {fileName} ({size}).' },
          { fileName: result.data.fileName, size: formatBytes(result.data.fileSize) },
        ),
      });
    } catch (uploadError) {
      console.error(uploadError);
      setFlash({
        severity: 'error',
        text: uploadError instanceof Error
          ? uploadError.message
          : intl.formatMessage({
              id: 'admin.marketHome.uploadError',
              defaultMessage: 'Failed to upload market home media.',
            }),
      });
    } finally {
      setUploadingKey(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setFlash(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/market/home-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to save market home settings');
      }

      await Promise.all([
        mutate(result, { revalidate: false }),
        mutateCache(`${API_BASE_URL}/api/market/home-settings`, result, { revalidate: false }),
      ]);
      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.marketHome.saveSuccess',
          defaultMessage: 'Market home settings saved.',
        }),
      });
    } catch (saveError) {
      console.error(saveError);
      setFlash({
        severity: 'error',
        text: saveError instanceof Error
          ? saveError.message
          : intl.formatMessage({
              id: 'admin.marketHome.saveError',
              defaultMessage: 'Failed to save market home settings.',
            }),
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <Typography><FormattedMessage id="common.loading" defaultMessage="Loading..." /></Typography>;
  }

  return (
    <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            <FormattedMessage id="admin.marketHome.title" defaultMessage="Market Home" />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            <FormattedMessage
              id="admin.marketHome.description"
              defaultMessage="Configure the market homepage hero. Each slide links to a ship feature page with ship details, 3D model preview, and matched purchasable listings."
            />
          </Typography>
        </Box>

        {error ? (
          <Alert severity="error">
            <FormattedMessage id="admin.marketHome.loadError" defaultMessage="Failed to load market home settings." />
          </Alert>
        ) : null}

        {shipsError ? (
          <Alert severity="warning">
            <FormattedMessage
              id="admin.marketHome.shipsLoadError"
              defaultMessage="The ship selector failed to load. Try refreshing before saving hero ship links."
            />
          </Alert>
        ) : null}

        {flash ? <Alert severity={flash.severity}>{flash.text}</Alert> : null}

        <Alert severity={activeSlides.length > 0 ? 'success' : 'info'}>
          <FormattedMessage
            id="admin.marketHome.activeSummary"
            defaultMessage="{count, plural, one {# active hero slide} other {# active hero slides}} will be shown on the market homepage."
            values={{ count: activeSlides.length }}
          />
        </Alert>

        <Box display="flex" alignItems="center" gap={2}>
          <Switch
            checked={settings.enabled}
            onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))}
          />
          <Typography>
            <FormattedMessage id="admin.marketHome.enabled" defaultMessage="Enable market homepage hero" />
          </Typography>
        </Box>

        <Stack spacing={2}>
          {settings.slides.map((slide, slideIndex) => (
            <Paper
              key={slide.id || slideIndex}
              variant="outlined"
              sx={{ p: 2, borderRadius: 0, bgcolor: 'background.default' }}
            >
              <Stack spacing={2}>
                <Box display="flex" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
                  <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      <FormattedMessage
                        id="admin.marketHome.slideTitle"
                        defaultMessage="Hero slide {index}"
                        values={{ index: slideIndex + 1 }}
                      />
                    </Typography>
                    <Chip
                      size="small"
                      color={slide.enabled ? 'success' : 'default'}
                      label={slide.enabled
                        ? intl.formatMessage({ id: 'common.enabled', defaultMessage: 'Enabled' })
                        : intl.formatMessage({ id: 'common.disabled', defaultMessage: 'Disabled' })}
                    />
                  </Box>
                  <IconButton
                    color="error"
                    onClick={() => handleRemoveSlide(slideIndex)}
                    aria-label={intl.formatMessage({ id: 'common.delete', defaultMessage: 'Delete' })}
                  >
                    <Trash2 className="h-5 w-5" />
                  </IconButton>
                </Box>

                <Box display="grid" gap={2} gridTemplateColumns={{ xs: '1fr', md: '160px minmax(0, 1fr)' }}>
                  <TextField
                    select
                    label={intl.formatMessage({ id: 'admin.marketHome.mediaType', defaultMessage: 'Media type' })}
                    value={slide.mediaType}
                    onChange={(event) => updateSlide(slideIndex, (current) => ({
                      ...current,
                      mediaType: event.target.value === 'video' ? 'video' : 'image',
                    }))}
                  >
                    <MenuItem value="image">
                      <FormattedMessage id="admin.marketHome.mediaType.image" defaultMessage="Image" />
                    </MenuItem>
                    <MenuItem value="video">
                      <FormattedMessage id="admin.marketHome.mediaType.video" defaultMessage="Video" />
                    </MenuItem>
                  </TextField>

                  <Autocomplete
                    options={shipOptions}
                    value={slide.shipId ? shipsById.get(slide.shipId) || null : null}
                    loading={shipsLoading}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    getOptionLabel={(option) => {
                      const manufacturer = getShipManufacturerDisplayName(option);
                      return manufacturer
                        ? `${getShipDisplayName(option)} · ${manufacturer}`
                        : getShipDisplayName(option);
                    }}
                    onChange={(_, value) => updateSlide(slideIndex, (current) => ({
                      ...current,
                      shipId: value?.id ?? null,
                    }))}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        required
                        label={intl.formatMessage({ id: 'admin.marketHome.ship', defaultMessage: 'Ship' })}
                        placeholder={intl.formatMessage({ id: 'admin.marketHome.shipPlaceholder', defaultMessage: 'Search and select a ship' })}
                        slotProps={{
                          input: {
                            ...params.InputProps,
                            endAdornment: (
                              <>
                                {shipsLoading ? <CircularProgress color="inherit" size={18} /> : null}
                                {params.InputProps.endAdornment}
                              </>
                            ),
                          },
                        }}
                      />
                    )}
                  />
                </Box>

                <Box display="grid" gap={2} gridTemplateColumns={{ xs: '1fr', lg: 'minmax(0, 1fr) 280px' }}>
                  <Stack spacing={1.5}>
                    <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
                      <Button
                        component="label"
                        variant="outlined"
                        startIcon={uploadingKey === `${slide.id || slideIndex}:media` ? <CircularProgress size={16} /> : <CloudUpload />}
                        disabled={Boolean(uploadingKey)}
                      >
                        <FormattedMessage id="admin.marketHome.uploadMedia" defaultMessage="Upload hero media" />
                        <input
                          hidden
                          type="file"
                          accept={slide.mediaType === 'video' ? 'video/*' : 'image/*'}
                          onChange={(event) => {
                            void handleUploadMedia(slideIndex, event.target.files?.[0], 'media');
                            event.target.value = '';
                          }}
                        />
                      </Button>
                      <Typography variant="caption" color="text.secondary">
                        {slide.mediaType === 'video'
                          ? intl.formatMessage({ id: 'admin.marketHome.videoUploadHint', defaultMessage: 'MP4/WebM/Ogg/QuickTime, up to 80 MB.' })
                          : intl.formatMessage({ id: 'admin.marketHome.imageUploadHint', defaultMessage: 'JPG/PNG/WebP/GIF/AVIF, up to 12 MB.' })}
                      </Typography>
                    </Box>

                    <TextField
                      label={intl.formatMessage({ id: 'admin.marketHome.mediaUrl', defaultMessage: 'Media URL' })}
                      value={slide.mediaUrl}
                      onChange={(event) => updateSlide(slideIndex, (current) => ({ ...current, mediaUrl: event.target.value }))}
                      required
                      helperText={intl.formatMessage({
                        id: 'admin.marketHome.mediaUrlHelp',
                        defaultMessage: 'Uploading fills this automatically. Local development uses the API proxy; production uses the R2 public endpoint.',
                      })}
                    />

                    {slide.mediaType === 'video' ? (
                      <>
                        <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
                          <Button
                            component="label"
                            variant="outlined"
                            startIcon={uploadingKey === `${slide.id || slideIndex}:poster` ? <CircularProgress size={16} /> : <CloudUpload />}
                            disabled={Boolean(uploadingKey)}
                          >
                            <FormattedMessage id="admin.marketHome.uploadPoster" defaultMessage="Upload poster" />
                            <input
                              hidden
                              type="file"
                              accept="image/*"
                              onChange={(event) => {
                                void handleUploadMedia(slideIndex, event.target.files?.[0], 'poster');
                                event.target.value = '';
                              }}
                            />
                          </Button>
                          <Typography variant="caption" color="text.secondary">
                            <FormattedMessage id="admin.marketHome.posterUploadHint" defaultMessage="Optional image shown before the video starts loading." />
                          </Typography>
                        </Box>
                        <TextField
                          label={intl.formatMessage({ id: 'admin.marketHome.posterUrl', defaultMessage: 'Video poster URL' })}
                          value={slide.posterUrl}
                          onChange={(event) => updateSlide(slideIndex, (current) => ({ ...current, posterUrl: event.target.value }))}
                        />
                      </>
                    ) : null}
                  </Stack>

                  <Box
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                      minHeight: 160,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {slide.mediaUrl ? (
                      slide.mediaType === 'video' ? (
                        <Box
                          component="video"
                          src={slide.mediaUrl}
                          poster={slide.posterUrl || undefined}
                          controls
                          muted
                          sx={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }}
                        />
                      ) : (
                        <Box
                          component="img"
                          src={slide.mediaUrl}
                          alt=""
                          sx={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }}
                        />
                      )
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        <FormattedMessage id="admin.marketHome.noMediaPreview" defaultMessage="No media uploaded" />
                      </Typography>
                    )}
                  </Box>
                </Box>

                <FormControlLabel
                  control={(
                    <Switch
                      checked={slide.enabled}
                      onChange={(event) => updateSlide(slideIndex, (current) => ({ ...current, enabled: event.target.checked }))}
                    />
                  )}
                  label={intl.formatMessage({ id: 'admin.marketHome.slideEnabled', defaultMessage: 'Show this slide' })}
                />

                <Divider />

                <Stack spacing={2}>
                  {MARKET_HOME_LOCALES.map((locale) => {
                    const translation = slide.translations[locale] || EMPTY_TRANSLATION;

                    return (
                      <Box key={`${slide.id}-${locale}`} display="grid" gap={1.5}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {getLocaleLabel(locale)}
                        </Typography>
                        <Box display="grid" gap={1.5} gridTemplateColumns={{ xs: '1fr', md: '180px minmax(0, 1fr) 150px' }}>
                          <TextField
                            label={intl.formatMessage({ id: 'admin.marketHome.eyebrow', defaultMessage: 'Eyebrow' })}
                            value={translation.eyebrow}
                            onChange={(event) => updateTranslation(slideIndex, locale, 'eyebrow', event.target.value)}
                          />
                          <TextField
                            label={intl.formatMessage({ id: 'admin.marketHome.heroTitle', defaultMessage: 'Title' })}
                            value={translation.title}
                            onChange={(event) => updateTranslation(slideIndex, locale, 'title', event.target.value)}
                          />
                          <TextField
                            label={intl.formatMessage({ id: 'admin.marketHome.ctaLabel', defaultMessage: 'CTA label' })}
                            value={translation.ctaLabel}
                            onChange={(event) => updateTranslation(slideIndex, locale, 'ctaLabel', event.target.value)}
                          />
                        </Box>
                        <TextField
                          label={intl.formatMessage({ id: 'admin.marketHome.subtitle', defaultMessage: 'Subtitle' })}
                          value={translation.subtitle}
                          onChange={(event) => updateTranslation(slideIndex, locale, 'subtitle', event.target.value)}
                          multiline
                          minRows={2}
                        />
                      </Box>
                    );
                  })}
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>

        <Box display="flex" gap={2} flexWrap="wrap">
          <Button variant="outlined" startIcon={<Plus className="h-4 w-4" />} onClick={handleAddSlide}>
            <FormattedMessage id="admin.marketHome.addSlide" defaultMessage="Add slide" />
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            <FormattedMessage id="admin.marketHome.save" defaultMessage="Save market home" />
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
