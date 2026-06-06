import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ArrowDown, ArrowUp, Copy, ExternalLink, Image, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useIntl, type IntlShape } from 'react-intl';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import {
  ListingItem,
  Promotion,
  PromotionHeroTranslation,
  PromotionItemContent,
  PromotionLocaleCode,
  PromotionResponse,
  PromotionSection,
  PromotionSeoTranslation,
} from '@/types';
import { useAdminMarketSearch, useAdminPromotions } from '@/hooks/swr/admin/useMarketingOffers';
import { formatUsdPrice } from '@/pages/Market/marketI18n';
import { getAvailableStock } from '@/pages/Market/marketUtils';
import MediaLibraryModal from '@/pages/Blog/components/MediaLibraryModal';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
const PROMOTION_LOCALES: PromotionLocaleCode[] = ['en', 'zh-CN', 'zh-HK', 'ja-JP', 'de-DE'];

type DiscountMode = 'percentage' | 'amount_off' | 'fixed_price';
type MessageSeverity = 'success' | 'error' | 'info';
type MediaTarget =
  | { kind: 'hero'; locale: PromotionLocaleCode; field: 'imageUrl' | 'mobileImageUrl' }
  | { kind: 'seo'; locale: PromotionLocaleCode }
  | { kind: 'section'; sectionId: string }
  | { kind: 'item'; skuId: string };

interface DraftPromotionItem {
  item: ListingItem;
  originalUnitPrice: number;
  discountMode: DiscountMode;
  discountValue: string;
  itemContent: PromotionItemContent;
}

interface PromotionFormState {
  id?: string;
  slug: string;
  title: string;
  startsAt: string;
  expiresAt: string;
  heroContent: Record<string, PromotionHeroTranslation>;
  seoContent: Record<string, PromotionSeoTranslation>;
  sections: PromotionSection[];
  adminNote: string;
  items: DraftPromotionItem[];
}

function emptyLocaleMap<T extends object>(factory: () => T): Record<string, T> {
  return PROMOTION_LOCALES.reduce<Record<string, T>>((acc, locale) => {
    acc[locale] = factory();
    return acc;
  }, {});
}

function defaultStartsAt() {
  const date = new Date(Date.now() + 15 * 60 * 1000);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

function defaultExpiresAt() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

function createEmptyForm(): PromotionFormState {
  return {
    slug: '',
    title: '',
    startsAt: defaultStartsAt(),
    expiresAt: defaultExpiresAt(),
    heroContent: emptyLocaleMap(() => ({
      eyebrow: '',
      title: '',
      subtitle: '',
      ctaLabel: '',
      imageUrl: '',
      mobileImageUrl: '',
      imageAlt: '',
    })),
    seoContent: emptyLocaleMap(() => ({
      title: '',
      description: '',
      imageUrl: '',
    })),
    sections: [],
    adminNote: '',
    items: [],
  };
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

function adminPromotionMessage(intl: IntlShape, id: string, defaultMessage: string, values?: Record<string, string | number>) {
  const messageId = `admin.promotions.${id}`;
  return intl.formatMessage({ id: messageId, defaultMessage }, values);
}

function getLocaleLabel(intl: IntlShape, locale: PromotionLocaleCode) {
  switch (locale) {
    case 'zh-CN':
      return adminPromotionMessage(intl, 'locale.zhCN', 'Simplified Chinese');
    case 'zh-HK':
      return adminPromotionMessage(intl, 'locale.zhHK', 'Traditional Chinese');
    case 'ja-JP':
      return adminPromotionMessage(intl, 'locale.jaJP', 'Japanese');
    case 'de-DE':
      return adminPromotionMessage(intl, 'locale.deDE', 'German');
    case 'en':
    default:
      return adminPromotionMessage(intl, 'locale.en', 'English');
  }
}

function getPromotionStatusLabel(intl: IntlShape, status: string) {
  switch (status) {
    case 'active':
      return adminPromotionMessage(intl, 'status.active', 'Active');
    case 'scheduled':
      return adminPromotionMessage(intl, 'status.scheduled', 'Scheduled');
    case 'draft':
      return adminPromotionMessage(intl, 'status.draft', 'Draft');
    case 'ended':
      return adminPromotionMessage(intl, 'status.ended', 'Ended');
    case 'canceled':
      return adminPromotionMessage(intl, 'status.canceled', 'Canceled');
    default:
      return status;
  }
}

function buildDraftItem(item: ListingItem): DraftPromotionItem {
  return {
    item,
    originalUnitPrice: item.price,
    discountMode: 'percentage',
    discountValue: '10',
    itemContent: {
      translations: emptyLocaleMap(() => ({
        title: '',
        description: '',
        badge: '',
        buttonLabel: '',
        imageAlt: '',
      })),
      imageUrl: '',
    },
  };
}

function formFromPromotion(promotion: Promotion): PromotionFormState {
  return {
    id: promotion.id,
    slug: promotion.slug,
    title: promotion.title,
    startsAt: toDatetimeLocal(promotion.startsAt),
    expiresAt: toDatetimeLocal(promotion.expiresAt),
    heroContent: {
      ...emptyLocaleMap(() => ({})),
      ...promotion.heroContent,
    },
    seoContent: {
      ...emptyLocaleMap(() => ({})),
      ...promotion.seoContent,
    },
    sections: promotion.sections || [],
    adminNote: promotion.adminNote || '',
    items: (promotion.items || [])
      .filter((item) => item.active && item.originalItem)
      .map((item) => ({
        item: item.originalItem as ListingItem,
        originalUnitPrice: item.originalUnitPrice,
        discountMode: (item.discountMode === 'percentage' || item.discountMode === 'amount_off' || item.discountMode === 'fixed_price')
          ? item.discountMode
          : 'fixed_price',
        discountValue: String(item.discountValue),
        itemContent: {
          translations: {
            ...emptyLocaleMap(() => ({})),
            ...(item.itemContent?.translations || {}),
          },
          imageUrl: item.itemContent?.imageUrl || '',
        },
      })),
  };
}

function promotionStatusColor(status: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  if (status === 'active') return 'success';
  if (status === 'scheduled') return 'info';
  if (status === 'draft') return 'warning';
  if (status === 'ended') return 'default';
  if (status === 'canceled') return 'error';
  return 'default';
}

function createSection(type: PromotionSection['type'], existingCount: number): PromotionSection {
  return {
    id: `section-${Date.now()}-${existingCount}`,
    type,
    translations: emptyLocaleMap(() => ({
      title: '',
      subtitle: '',
      body: '',
    })),
    itemSkuIds: [],
    items: type === 'benefits'
      ? [
          { id: `benefit-${Date.now()}-0`, translations: emptyLocaleMap(() => ({ title: '', body: '' })) },
          { id: `benefit-${Date.now()}-1`, translations: emptyLocaleMap(() => ({ title: '', body: '' })) },
        ]
      : [],
    imageSide: 'right',
  };
}

function parseDiscountValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function calculateDiscountUnitPrice(originalPrice: number, mode: DiscountMode, value: string) {
  const discountValue = parseDiscountValue(value);
  let nextPrice = originalPrice;

  if (mode === 'percentage') {
    const percentOff = Math.max(0, Math.min(discountValue, 100));
    nextPrice = originalPrice * (1 - percentOff / 100);
  } else if (mode === 'amount_off') {
    nextPrice = originalPrice - discountValue;
  } else {
    nextPrice = discountValue;
  }

  return Math.max(0, Math.round(nextPrice * 100) / 100);
}

function getDiscountModeLabel(intl: IntlShape, mode: DiscountMode) {
  if (mode === 'percentage') return adminPromotionMessage(intl, 'discountMode.percentage', 'Percentage off');
  if (mode === 'amount_off') return adminPromotionMessage(intl, 'discountMode.amountOff', 'Amount off');
  return adminPromotionMessage(intl, 'discountMode.fixedPrice', 'Fixed price');
}

function getDiscountValueLabel(intl: IntlShape, mode: DiscountMode) {
  if (mode === 'percentage') return adminPromotionMessage(intl, 'discountValue.percentOff', 'Percent off');
  if (mode === 'amount_off') return adminPromotionMessage(intl, 'discountValue.amountOff', 'Amount off');
  return adminPromotionMessage(intl, 'discountValue.fixedPromotionPrice', 'Fixed promotion price');
}

function getPromotionSectionTypeLabel(intl: IntlShape, type: PromotionSection['type']) {
  if (type === 'media_text') return adminPromotionMessage(intl, 'sectionType.mediaText', 'Media/text');
  if (type === 'product_group') return adminPromotionMessage(intl, 'sectionType.productGroup', 'Product group');
  if (type === 'benefits') return adminPromotionMessage(intl, 'sectionType.benefits', 'Benefits');
  return type;
}

function getPromotionActionSuccessMessage(intl: IntlShape, action: 'publish' | 'end' | 'cancel' | 'delete') {
  switch (action) {
    case 'publish':
      return adminPromotionMessage(intl, 'message.publishSuccess', 'Promotion published.');
    case 'end':
      return adminPromotionMessage(intl, 'message.endSuccess', 'Promotion ended.');
    case 'cancel':
      return adminPromotionMessage(intl, 'message.cancelSuccess', 'Promotion canceled.');
    case 'delete':
      return adminPromotionMessage(intl, 'message.deleteSuccess', 'Promotion deleted.');
  }
}

function getPromotionActionFailedMessage(intl: IntlShape, action: 'publish' | 'end' | 'cancel' | 'delete') {
  switch (action) {
    case 'publish':
      return adminPromotionMessage(intl, 'message.publishFailed', 'Failed to publish promotion.');
    case 'end':
      return adminPromotionMessage(intl, 'message.endFailed', 'Failed to end promotion.');
    case 'cancel':
      return adminPromotionMessage(intl, 'message.cancelFailed', 'Failed to cancel promotion.');
    case 'delete':
      return adminPromotionMessage(intl, 'message.deleteFailed', 'Failed to delete promotion.');
  }
}

function buildPromotionPayload(form: PromotionFormState) {
  return {
    slug: form.slug,
    title: form.title,
    startsAt: new Date(form.startsAt).toISOString(),
    expiresAt: new Date(form.expiresAt).toISOString(),
    heroContent: form.heroContent,
    seoContent: form.seoContent,
    sections: form.sections,
    adminNote: form.adminNote,
    items: form.items.map((entry, index) => ({
      originalSkuId: entry.item.skuId,
      discountMode: entry.discountMode,
      discountValue: Number(entry.discountValue || 0),
      sortOrder: index,
      itemContent: entry.itemContent,
    })),
  };
}

export default function PromotionsManager() {
  const intl = useIntl();
  const { token } = useSelector((state: RootState) => state.user.user);
  const [form, setForm] = useState<PromotionFormState>(() => createEmptyForm());
  const [search, setSearch] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [selectedPromotionId, setSelectedPromotionId] = useState<string | null>(null);
  const [editingLocale, setEditingLocale] = useState<PromotionLocaleCode>('en');
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ severity: MessageSeverity; text: string } | null>(null);
  const [mediaTarget, setMediaTarget] = useState<MediaTarget | null>(null);

  const { data: promotionsData, isLoading: promotionsLoading, mutate } = useAdminPromotions({ page: 1, limit: 20, search });
  const { data: marketData, isLoading: marketLoading } = useAdminMarketSearch({
    search: itemQuery,
    inStockOnly: true,
    groupCcus: false,
    itemTypes: ['ccu', 'package', 'misc'],
    browseCategories: ['standalone_ship', 'ship_package', 'paint', 'other'],
    combineTypeFiltersWithOr: true,
    page: 1,
    limit: 20,
  });

  const promotions = promotionsData?.promotions || [];
  const activeSlotPromotion = promotions.find((promotion) => ['draft', 'scheduled', 'active'].includes(promotion.status));
  const selectedSkuIds = useMemo(() => new Set(form.items.map((entry) => entry.item.skuId)), [form.items]);
  const itemOptions = (marketData?.items || []).filter((item) => item.itemType !== 'credit' && !selectedSkuIds.has(item.skuId));

  useEffect(() => {
    if (message) {
      const timeoutId = window.setTimeout(() => setMessage(null), 7000);
      return () => window.clearTimeout(timeoutId);
    }
  }, [message]);

  const selectPromotion = (promotion: Promotion) => {
    setSelectedPromotionId(promotion.id);
    setForm(formFromPromotion(promotion));
  };

  const resetForm = () => {
    setSelectedPromotionId(null);
    setForm(createEmptyForm());
  };

  const updateHero = (field: keyof PromotionHeroTranslation, value: string, locale = editingLocale) => {
    setForm((current) => ({
      ...current,
      heroContent: {
        ...current.heroContent,
        [locale]: {
          ...(current.heroContent[locale] || {}),
          [field]: value,
        },
      },
    }));
  };

  const updateSeo = (field: keyof PromotionSeoTranslation, value: string, locale = editingLocale) => {
    setForm((current) => ({
      ...current,
      seoContent: {
        ...current.seoContent,
        [locale]: {
          ...(current.seoContent[locale] || {}),
          [field]: value,
        },
      },
    }));
  };

  const updateSection = (sectionId: string, updater: (section: PromotionSection) => PromotionSection) => {
    setForm((current) => ({
      ...current,
      sections: current.sections.map((section) => section.id === sectionId ? updater(section) : section),
    }));
  };

  const addItem = (item: ListingItem | null) => {
    if (!item || selectedSkuIds.has(item.skuId)) return;
    setForm((current) => ({
      ...current,
      items: [...current.items, buildDraftItem(item)],
    }));
    setItemQuery('');
  };

  const savePromotion = async () => {
    if (!form.title.trim() || !form.slug.trim() || !form.heroContent.en?.title?.trim() || form.items.length === 0) {
      setMessage({
        severity: 'error',
        text: adminPromotionMessage(intl, 'message.requiredFields', 'Title, slug, English hero title, and at least one product are required.'),
      });
      return;
    }
    const invalidDiscountItem = form.items.find((entry) => {
      const calculatedDiscountPrice = calculateDiscountUnitPrice(entry.originalUnitPrice, entry.discountMode, entry.discountValue);
      return calculatedDiscountPrice <= 0 || calculatedDiscountPrice >= entry.originalUnitPrice;
    });
    if (invalidDiscountItem) {
      setMessage({
        severity: 'error',
        text: adminPromotionMessage(
          intl,
          'message.invalidDiscountPriceForItem',
          'Promotion price must be lower than the market price and greater than zero for {itemName}.',
          { itemName: invalidDiscountItem.item.name },
        ),
      });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/promotions${form.id ? `/${encodeURIComponent(form.id)}` : ''}`, {
        method: form.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildPromotionPayload(form)),
      });
      const result = await response.json().catch(() => null) as PromotionResponse | { error?: string } | null;
      if (!response.ok) {
        throw new Error(result && 'error' in result && result.error ? result.error : adminPromotionMessage(intl, 'message.saveFailed', 'Failed to save promotion.'));
      }

      const savedPromotion = result && 'promotion' in result ? result.promotion : null;
      await mutate();
      if (savedPromotion) {
        setSelectedPromotionId(savedPromotion.id);
        setForm(formFromPromotion(savedPromotion));
      }
      setMessage({ severity: 'success', text: adminPromotionMessage(intl, 'message.saveSuccess', 'Promotion saved.') });
    } catch (error) {
      setMessage({
        severity: 'error',
        text: error instanceof Error ? error.message : adminPromotionMessage(intl, 'message.saveFailed', 'Failed to save promotion.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const postPromotionAction = async (promotion: Promotion, action: 'publish' | 'end' | 'cancel' | 'delete') => {
    setActionLoadingId(`${promotion.id}:${action}`);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/promotions/${encodeURIComponent(promotion.id)}${action === 'delete' ? '' : `/${action}`}`, {
        method: action === 'delete' ? 'DELETE' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response.json().catch(() => null) as { error?: string } | PromotionResponse | null;
      if (!response.ok) {
        throw new Error(result && 'error' in result && result.error ? result.error : getPromotionActionFailedMessage(intl, action));
      }

      await mutate();
      setMessage({ severity: 'success', text: getPromotionActionSuccessMessage(intl, action) });
      if (action === 'delete' && selectedPromotionId === promotion.id) {
        resetForm();
      }
    } catch (error) {
      setMessage({
        severity: 'error',
        text: error instanceof Error ? error.message : getPromotionActionFailedMessage(intl, action),
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMediaSelect = (url: string) => {
    if (!mediaTarget) return;

    if (mediaTarget.kind === 'hero') {
      updateHero(mediaTarget.field, url, mediaTarget.locale);
    } else if (mediaTarget.kind === 'seo') {
      updateSeo('imageUrl', url, mediaTarget.locale);
    } else if (mediaTarget.kind === 'section') {
      updateSection(mediaTarget.sectionId, (section) => ({ ...section, imageUrl: url }));
    } else if (mediaTarget.kind === 'item') {
      setForm((current) => ({
        ...current,
        items: current.items.map((entry) => entry.item.skuId === mediaTarget.skuId
          ? { ...entry, itemContent: { ...entry.itemContent, imageUrl: url } }
          : entry),
      }));
    }

    setMediaTarget(null);
  };

  const canCreateNew = !activeSlotPromotion || Boolean(form.id);

  return (
    <Stack spacing={3}>
      <Box display="flex" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 750 }}>{adminPromotionMessage(intl, 'heading', 'Promotions')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {adminPromotionMessage(intl, 'description', 'One draft, scheduled, or active promotion can exist site-wide.')}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<Plus className="h-4 w-4" />}
          disabled={!canCreateNew}
          onClick={resetForm}
        >
          {adminPromotionMessage(intl, 'newDraft', 'New draft')}
        </Button>
      </Box>

      {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}
      {!canCreateNew ? (
        <Alert severity="info">
          {adminPromotionMessage(intl, 'createDisabled', 'Create is disabled until the current draft/scheduled/active promotion is ended, canceled, or deleted.')}
        </Alert>
      ) : null}

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 0 }}>
        <Stack spacing={2}>
          <Box display="flex" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{adminPromotionMessage(intl, 'listTitle', 'Promotion list')}</Typography>
            <TextField size="small" label={adminPromotionMessage(intl, 'search', 'Search')} value={search} onChange={(event) => setSearch(event.target.value)} />
          </Box>
          {promotionsLoading ? <CircularProgress size={24} /> : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{adminPromotionMessage(intl, 'table.title', 'Title')}</TableCell>
                    <TableCell>{adminPromotionMessage(intl, 'table.status', 'Status')}</TableCell>
                    <TableCell>{adminPromotionMessage(intl, 'table.dates', 'Dates')}</TableCell>
                    <TableCell>{adminPromotionMessage(intl, 'table.products', 'Products')}</TableCell>
                    <TableCell align="right">{adminPromotionMessage(intl, 'table.actions', 'Actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {promotions.map((promotion) => (
                    <TableRow key={promotion.id} hover selected={promotion.id === selectedPromotionId}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{promotion.title}</Typography>
                        <Typography variant="caption" color="text.secondary">{promotion.slug}</Typography>
                      </TableCell>
                      <TableCell><Chip size="small" color={promotionStatusColor(promotion.status)} label={getPromotionStatusLabel(intl, promotion.status)} /></TableCell>
                      <TableCell>
                        <Typography variant="caption" display="block">{new Date(promotion.startsAt).toLocaleString()}</Typography>
                        <Typography variant="caption" color="text.secondary">{new Date(promotion.expiresAt).toLocaleString()}</Typography>
                      </TableCell>
                      <TableCell>{promotion.itemCount} / {promotion.discountSkuCount}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap">
                          <Button size="small" onClick={() => selectPromotion(promotion)}>{adminPromotionMessage(intl, 'action.edit', 'Edit')}</Button>
                          <Tooltip title={adminPromotionMessage(intl, 'action.openPublicPage', 'Open public page')}>
                            <IconButton size="small" component="a" href={promotion.promotionUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={adminPromotionMessage(intl, 'action.copyUrl', 'Copy URL')}>
                            <IconButton size="small" onClick={() => navigator.clipboard.writeText(promotion.promotionUrl)}>
                              <Copy className="h-4 w-4" />
                            </IconButton>
                          </Tooltip>
                          {promotion.status === 'draft' ? (
                            <Button
                              size="small"
                              variant="contained"
                              disabled={actionLoadingId === `${promotion.id}:publish`}
                              onClick={() => void postPromotionAction(promotion, 'publish')}
                            >
                              {adminPromotionMessage(intl, 'action.publish', 'Publish')}
                            </Button>
                          ) : null}
                          {promotion.status === 'active' || promotion.status === 'scheduled' ? (
                            <Button size="small" color="warning" onClick={() => void postPromotionAction(promotion, 'end')}>
                              {adminPromotionMessage(intl, 'action.end', 'End')}
                            </Button>
                          ) : null}
                          {promotion.status === 'draft' || promotion.status === 'scheduled' ? (
                            <Button size="small" color="error" onClick={() => void postPromotionAction(promotion, promotion.status === 'draft' ? 'delete' : 'cancel')}>
                              {promotion.status === 'draft'
                                ? adminPromotionMessage(intl, 'action.delete', 'Delete')
                                : adminPromotionMessage(intl, 'action.cancel', 'Cancel')}
                            </Button>
                          ) : null}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 0 }}>
        <Stack spacing={3}>
          <Box display="flex" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {form.id
                ? adminPromotionMessage(intl, 'editTitle', 'Edit promotion')
                : adminPromotionMessage(intl, 'createTitle', 'Create promotion')}
            </Typography>
            <TextField
              select
              size="small"
              label={adminPromotionMessage(intl, 'editingLanguage', 'Editing language')}
              value={editingLocale}
              onChange={(event) => setEditingLocale(event.target.value as PromotionLocaleCode)}
              sx={{ width: 180 }}
            >
              {PROMOTION_LOCALES.map((locale) => <MenuItem key={locale} value={locale}>{getLocaleLabel(intl, locale)}</MenuItem>)}
            </TextField>
          </Box>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={2}>
            <TextField label={adminPromotionMessage(intl, 'field.slug', 'Slug')} value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} />
            <TextField label={adminPromotionMessage(intl, 'field.internalTitle', 'Internal title')} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
            <TextField type="datetime-local" label={adminPromotionMessage(intl, 'field.startsAt', 'Starts at')} value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField type="datetime-local" label={adminPromotionMessage(intl, 'field.expiresAt', 'Expires at')} value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} InputLabelProps={{ shrink: true }} />
          </Box>

          <Divider />

          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {adminPromotionMessage(intl, 'heroTitle', 'Hero ({locale})', { locale: getLocaleLabel(intl, editingLocale) })}
          </Typography>
          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={2}>
            <TextField label={adminPromotionMessage(intl, 'field.eyebrow', 'Eyebrow')} value={form.heroContent[editingLocale]?.eyebrow || ''} onChange={(event) => updateHero('eyebrow', event.target.value)} />
            <TextField label={adminPromotionMessage(intl, 'field.title', 'Title')} value={form.heroContent[editingLocale]?.title || ''} onChange={(event) => updateHero('title', event.target.value)} />
            <TextField label={adminPromotionMessage(intl, 'field.subtitle', 'Subtitle')} value={form.heroContent[editingLocale]?.subtitle || ''} onChange={(event) => updateHero('subtitle', event.target.value)} multiline minRows={2} />
            <TextField label={adminPromotionMessage(intl, 'field.ctaLabel', 'CTA label')} value={form.heroContent[editingLocale]?.ctaLabel || ''} onChange={(event) => updateHero('ctaLabel', event.target.value)} />
            <TextField label={adminPromotionMessage(intl, 'field.imageUrl', 'Image URL')} value={form.heroContent[editingLocale]?.imageUrl || ''} onChange={(event) => updateHero('imageUrl', event.target.value)} />
            <Button variant="outlined" startIcon={<Image className="h-4 w-4" />} onClick={() => setMediaTarget({ kind: 'hero', locale: editingLocale, field: 'imageUrl' })}>
              {adminPromotionMessage(intl, 'action.pickHeroImage', 'Pick hero image')}
            </Button>
            <TextField label={adminPromotionMessage(intl, 'field.mobileImageUrl', 'Mobile image URL')} value={form.heroContent[editingLocale]?.mobileImageUrl || ''} onChange={(event) => updateHero('mobileImageUrl', event.target.value)} />
            <Button variant="outlined" startIcon={<Image className="h-4 w-4" />} onClick={() => setMediaTarget({ kind: 'hero', locale: editingLocale, field: 'mobileImageUrl' })}>
              {adminPromotionMessage(intl, 'action.pickMobileImage', 'Pick mobile image')}
            </Button>
            <TextField label={adminPromotionMessage(intl, 'field.imageAlt', 'Image alt')} value={form.heroContent[editingLocale]?.imageAlt || ''} onChange={(event) => updateHero('imageAlt', event.target.value)} />
          </Box>

          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {adminPromotionMessage(intl, 'seoTitle', 'SEO ({locale})', { locale: getLocaleLabel(intl, editingLocale) })}
          </Typography>
          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={2}>
            <TextField label={adminPromotionMessage(intl, 'field.seoTitle', 'SEO title')} value={form.seoContent[editingLocale]?.title || ''} onChange={(event) => updateSeo('title', event.target.value)} />
            <TextField label={adminPromotionMessage(intl, 'field.shareImageUrl', 'Share image URL')} value={form.seoContent[editingLocale]?.imageUrl || ''} onChange={(event) => updateSeo('imageUrl', event.target.value)} />
            <TextField label={adminPromotionMessage(intl, 'field.metaDescription', 'Meta description')} value={form.seoContent[editingLocale]?.description || ''} onChange={(event) => updateSeo('description', event.target.value)} multiline minRows={2} />
            <Button variant="outlined" startIcon={<Image className="h-4 w-4" />} onClick={() => setMediaTarget({ kind: 'seo', locale: editingLocale })}>
              {adminPromotionMessage(intl, 'action.pickShareImage', 'Pick share image')}
            </Button>
          </Box>

          <Divider />

          <Box display="flex" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{adminPromotionMessage(intl, 'productsTitle', 'Products')}</Typography>
            <Autocomplete
              size="small"
              loading={marketLoading}
              options={itemOptions}
              getOptionLabel={(option) => adminPromotionMessage(
                intl,
                'marketItemOption',
                '{name} - {price} - stock {stock}',
                { name: option.name, price: formatUsdPrice(intl.locale, option.price), stock: getAvailableStock(option) },
              )}
              onInputChange={(_, value) => setItemQuery(value)}
              onChange={(_, value) => addItem(value)}
              sx={{ width: { xs: '100%', md: 520 } }}
              renderInput={(params) => <TextField {...params} label={adminPromotionMessage(intl, 'searchMarketItem', 'Search market item')} />}
            />
          </Box>

          <Stack spacing={2}>
            {form.items.map((entry, index) => {
              const calculatedDiscountPrice = calculateDiscountUnitPrice(entry.originalUnitPrice, entry.discountMode, entry.discountValue);
              const discountIsValid = calculatedDiscountPrice > 0 && calculatedDiscountPrice < entry.originalUnitPrice;

              return (
              <Paper key={entry.item.skuId} variant="outlined" sx={{ p: 2, borderRadius: 0 }}>
                <Stack spacing={2}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{entry.item.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {adminPromotionMessage(
                          intl,
                          'productSummary',
                          '{skuId} - market price {price} - stock {stock}',
                          { skuId: entry.item.skuId, price: formatUsdPrice(intl.locale, entry.originalUnitPrice), stock: getAvailableStock(entry.item) },
                        )}
                      </Typography>
                    </Box>
                    <IconButton size="small" color="error" onClick={() => setForm((current) => ({ ...current, items: current.items.filter((item) => item.item.skuId !== entry.item.skuId) }))}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </Box>
                  <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr 1fr' }} gap={2}>
                    <TextField select label={adminPromotionMessage(intl, 'field.discountMode', 'Discount mode')} value={entry.discountMode} onChange={(event) => setForm((current) => ({
                      ...current,
                      items: current.items.map((item) => item.item.skuId === entry.item.skuId ? { ...item, discountMode: event.target.value as DiscountMode } : item),
                    }))}>
                      <MenuItem value="percentage">{getDiscountModeLabel(intl, 'percentage')}</MenuItem>
                      <MenuItem value="amount_off">{getDiscountModeLabel(intl, 'amount_off')}</MenuItem>
                      <MenuItem value="fixed_price">{getDiscountModeLabel(intl, 'fixed_price')}</MenuItem>
                    </TextField>
                    <TextField
                      label={getDiscountValueLabel(intl, entry.discountMode)}
                      value={entry.discountValue}
                      type="number"
                      inputProps={{ min: 0, step: entry.discountMode === 'percentage' ? 1 : 0.01 }}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        items: current.items.map((item) => item.item.skuId === entry.item.skuId ? { ...item, discountValue: event.target.value } : item),
                      }))}
                    />
                    <Box sx={{ border: '1px solid', borderColor: discountIsValid ? 'divider' : 'error.main', p: 1.5 }}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {adminPromotionMessage(intl, 'finalDiscountPrice', 'Final discount price')}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                        {formatUsdPrice(intl.locale, calculatedDiscountPrice)}
                      </Typography>
                      <Typography variant="caption" color={discountIsValid ? 'text.secondary' : 'error'} display="block">
                        {discountIsValid
                          ? adminPromotionMessage(
                            intl,
                            'calculatedDiscountHelp',
                            'Calculated from {mode} and discount value.',
                            { mode: getDiscountModeLabel(intl, entry.discountMode) },
                          )
                          : adminPromotionMessage(intl, 'invalidDiscountPrice', 'Discount price must be lower than the market price and greater than zero.')}
                      </Typography>
                    </Box>
                  </Box>
                  <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={2}>
                    <TextField label={adminPromotionMessage(intl, 'field.titleOverride', 'Title override ({locale})', { locale: getLocaleLabel(intl, editingLocale) })} value={entry.itemContent.translations?.[editingLocale]?.title || ''} onChange={(event) => setForm((current) => ({
                      ...current,
                      items: current.items.map((item) => item.item.skuId === entry.item.skuId ? {
                        ...item,
                        itemContent: {
                          ...item.itemContent,
                          translations: {
                            ...(item.itemContent.translations || {}),
                            [editingLocale]: {
                              ...(item.itemContent.translations?.[editingLocale] || {}),
                              title: event.target.value,
                            },
                          },
                        },
                      } : item),
                    }))} />
                    <TextField label={adminPromotionMessage(intl, 'field.badge', 'Badge')} value={entry.itemContent.translations?.[editingLocale]?.badge || ''} onChange={(event) => setForm((current) => ({
                      ...current,
                      items: current.items.map((item) => item.item.skuId === entry.item.skuId ? {
                        ...item,
                        itemContent: {
                          ...item.itemContent,
                          translations: {
                            ...(item.itemContent.translations || {}),
                            [editingLocale]: {
                              ...(item.itemContent.translations?.[editingLocale] || {}),
                              badge: event.target.value,
                            },
                          },
                        },
                      } : item),
                    }))} />
                    <TextField label={adminPromotionMessage(intl, 'field.descriptionOverride', 'Description override')} multiline minRows={2} value={entry.itemContent.translations?.[editingLocale]?.description || ''} onChange={(event) => setForm((current) => ({
                      ...current,
                      items: current.items.map((item) => item.item.skuId === entry.item.skuId ? {
                        ...item,
                        itemContent: {
                          ...item.itemContent,
                          translations: {
                            ...(item.itemContent.translations || {}),
                            [editingLocale]: {
                              ...(item.itemContent.translations?.[editingLocale] || {}),
                              description: event.target.value,
                            },
                          },
                        },
                      } : item),
                    }))} />
                    <TextField label={adminPromotionMessage(intl, 'field.imageUrl', 'Image URL')} value={entry.itemContent.imageUrl || ''} onChange={(event) => setForm((current) => ({
                      ...current,
                      items: current.items.map((item) => item.item.skuId === entry.item.skuId ? { ...item, itemContent: { ...item.itemContent, imageUrl: event.target.value } } : item),
                    }))} />
                    <Button variant="outlined" startIcon={<Image className="h-4 w-4" />} onClick={() => setMediaTarget({ kind: 'item', skuId: entry.item.skuId })}>
                      {adminPromotionMessage(intl, 'action.pickItemImage', 'Pick item image')}
                    </Button>
                    <Typography variant="caption" color="text.secondary">
                      {adminPromotionMessage(intl, 'sortOrder', 'Sort order: {index}', { index: index + 1 })}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
              );
            })}
          </Stack>

          <Divider />

          <Box display="flex" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{adminPromotionMessage(intl, 'sectionsTitle', 'Sections')}</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button size="small" variant="outlined" onClick={() => setForm((current) => ({ ...current, sections: [...current.sections, createSection('media_text', current.sections.length)] }))}>
                {adminPromotionMessage(intl, 'action.addMediaText', 'Add media/text')}
              </Button>
              <Button size="small" variant="outlined" onClick={() => setForm((current) => ({ ...current, sections: [...current.sections, createSection('product_group', current.sections.length)] }))}>
                {adminPromotionMessage(intl, 'action.addProductGroup', 'Add product group')}
              </Button>
              <Button size="small" variant="outlined" onClick={() => setForm((current) => ({ ...current, sections: [...current.sections, createSection('benefits', current.sections.length)] }))}>
                {adminPromotionMessage(intl, 'action.addBenefits', 'Add benefits')}
              </Button>
            </Stack>
          </Box>

          <Stack spacing={2}>
            {form.sections.map((section, index) => (
              <Paper key={section.id} variant="outlined" sx={{ p: 2, borderRadius: 0 }}>
                <Stack spacing={2}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {adminPromotionMessage(
                        intl,
                        'sectionHeading',
                        '{type} section {index}',
                        { type: getPromotionSectionTypeLabel(intl, section.type), index: index + 1 },
                      )}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <IconButton size="small" disabled={index === 0} onClick={() => setForm((current) => {
                        const next = [...current.sections];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        return { ...current, sections: next };
                      })}><ArrowUp className="h-4 w-4" /></IconButton>
                      <IconButton size="small" disabled={index === form.sections.length - 1} onClick={() => setForm((current) => {
                        const next = [...current.sections];
                        [next[index], next[index + 1]] = [next[index + 1], next[index]];
                        return { ...current, sections: next };
                      })}><ArrowDown className="h-4 w-4" /></IconButton>
                      <IconButton size="small" color="error" onClick={() => setForm((current) => ({ ...current, sections: current.sections.filter((entry) => entry.id !== section.id) }))}><Trash2 className="h-4 w-4" /></IconButton>
                    </Stack>
                  </Box>
                  <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={2}>
                    <TextField label={adminPromotionMessage(intl, 'field.title', 'Title')} value={section.translations?.[editingLocale]?.title || ''} onChange={(event) => updateSection(section.id, (currentSection) => ({
                      ...currentSection,
                      translations: {
                        ...(currentSection.translations || {}),
                        [editingLocale]: {
                          ...(currentSection.translations?.[editingLocale] || {}),
                          title: event.target.value,
                        },
                      },
                    }))} />
                    <TextField label={adminPromotionMessage(intl, 'field.subtitle', 'Subtitle')} value={section.translations?.[editingLocale]?.subtitle || ''} onChange={(event) => updateSection(section.id, (currentSection) => ({
                      ...currentSection,
                      translations: {
                        ...(currentSection.translations || {}),
                        [editingLocale]: {
                          ...(currentSection.translations?.[editingLocale] || {}),
                          subtitle: event.target.value,
                        },
                      },
                    }))} />
                    <TextField label={adminPromotionMessage(intl, 'field.body', 'Body')} multiline minRows={3} value={section.translations?.[editingLocale]?.body || ''} onChange={(event) => updateSection(section.id, (currentSection) => ({
                      ...currentSection,
                      translations: {
                        ...(currentSection.translations || {}),
                        [editingLocale]: {
                          ...(currentSection.translations?.[editingLocale] || {}),
                          body: event.target.value,
                        },
                      },
                    }))} />
                    <TextField label={adminPromotionMessage(intl, 'field.imageUrl', 'Image URL')} value={section.imageUrl || ''} onChange={(event) => updateSection(section.id, (currentSection) => ({ ...currentSection, imageUrl: event.target.value }))} />
                    <Button variant="outlined" startIcon={<Image className="h-4 w-4" />} onClick={() => setMediaTarget({ kind: 'section', sectionId: section.id })}>
                      {adminPromotionMessage(intl, 'action.pickSectionImage', 'Pick section image')}
                    </Button>
                    <TextField
                      select
                      label={adminPromotionMessage(intl, 'field.imageSide', 'Image side')}
                      value={section.imageSide || 'right'}
                      onChange={(event) => updateSection(section.id, (currentSection) => ({ ...currentSection, imageSide: event.target.value as 'left' | 'right' }))}
                    >
                      <MenuItem value="left">{adminPromotionMessage(intl, 'imageSide.left', 'Left')}</MenuItem>
                      <MenuItem value="right">{adminPromotionMessage(intl, 'imageSide.right', 'Right')}</MenuItem>
                    </TextField>
                  </Box>
                  <Autocomplete
                    multiple
                    size="small"
                    options={form.items.map((entry) => entry.item)}
                    value={form.items.map((entry) => entry.item).filter((item) => (section.itemSkuIds || []).includes(item.skuId))}
                    getOptionLabel={(option) => option.name}
                    onChange={(_, value) => updateSection(section.id, (currentSection) => ({ ...currentSection, itemSkuIds: value.map((item) => item.skuId) }))}
                    renderInput={(params) => <TextField {...params} label={adminPromotionMessage(intl, 'field.linkedProducts', 'Linked products')} />}
                  />
                  {section.type === 'benefits' ? (
                    <Stack spacing={1}>
                      {(section.items || []).map((benefit) => (
                        <Box key={benefit.id} display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr auto' }} gap={1}>
                          <TextField size="small" label={adminPromotionMessage(intl, 'field.benefitTitle', 'Benefit title')} value={benefit.translations?.[editingLocale]?.title || ''} onChange={(event) => updateSection(section.id, (currentSection) => ({
                            ...currentSection,
                            items: (currentSection.items || []).map((entry) => entry.id === benefit.id ? {
                              ...entry,
                              translations: {
                                ...(entry.translations || {}),
                                [editingLocale]: {
                                  ...(entry.translations?.[editingLocale] || {}),
                                  title: event.target.value,
                                },
                              },
                            } : entry),
                          }))} />
                          <TextField size="small" label={adminPromotionMessage(intl, 'field.benefitBody', 'Benefit body')} value={benefit.translations?.[editingLocale]?.body || ''} onChange={(event) => updateSection(section.id, (currentSection) => ({
                            ...currentSection,
                            items: (currentSection.items || []).map((entry) => entry.id === benefit.id ? {
                              ...entry,
                              translations: {
                                ...(entry.translations || {}),
                                [editingLocale]: {
                                  ...(entry.translations?.[editingLocale] || {}),
                                  body: event.target.value,
                                },
                              },
                            } : entry),
                          }))} />
                          <IconButton size="small" color="error" onClick={() => updateSection(section.id, (currentSection) => ({ ...currentSection, items: (currentSection.items || []).filter((entry) => entry.id !== benefit.id) }))}><Trash2 className="h-4 w-4" /></IconButton>
                        </Box>
                      ))}
                      <Button size="small" variant="outlined" onClick={() => updateSection(section.id, (currentSection) => ({
                        ...currentSection,
                        items: [...(currentSection.items || []), { id: `benefit-${Date.now()}`, translations: emptyLocaleMap(() => ({ title: '', body: '' })) }],
                      }))}>
                        {adminPromotionMessage(intl, 'action.addBenefit', 'Add benefit')}
                      </Button>
                    </Stack>
                  ) : null}
                </Stack>
              </Paper>
            ))}
          </Stack>

          <TextField label={adminPromotionMessage(intl, 'field.adminNote', 'Admin note')} value={form.adminNote} onChange={(event) => setForm((current) => ({ ...current, adminNote: event.target.value }))} multiline minRows={2} />

          <Box display="flex" justifyContent="flex-end" gap={1} flexWrap="wrap">
            <Button variant="outlined" startIcon={<RefreshCw className="h-4 w-4" />} onClick={resetForm}>
              {adminPromotionMessage(intl, 'action.reset', 'Reset')}
            </Button>
            <Button variant="contained" disabled={saving || !canCreateNew} onClick={() => void savePromotion()}>
              {saving
                ? adminPromotionMessage(intl, 'action.saving', 'Saving...')
                : adminPromotionMessage(intl, 'action.savePromotion', 'Save promotion')}
            </Button>
          </Box>
        </Stack>
      </Paper>

      <MediaLibraryModal
        open={Boolean(mediaTarget)}
        onClose={() => setMediaTarget(null)}
        onSelectUrl={handleMediaSelect}
      />
    </Stack>
  );
}
