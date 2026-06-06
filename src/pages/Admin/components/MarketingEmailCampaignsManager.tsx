import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import { ArrowDown, ArrowUp, Copy, Eye, Image as ImageIcon, Plus, RefreshCw, Save, Send, Trash2, X } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import {
  AdminMarketingEmailCampaignPreviewResponse,
  AdminUserSearchItem,
  MarketingEmailAudience,
  MarketingEmailAudienceLocale,
  MarketingEmailBlock,
  MarketingEmailBlockType,
  MarketingEmailCampaign,
  MarketingEmailCampaignResponse,
  MarketingEmailLocalizedString,
  MarketingEmailProduct,
} from '@/types';
import {
  useAdminMarketingEmailCampaigns,
  useAdminUserSearch,
} from '@/hooks/swr/admin/useMarketingOffers';
import MediaLibraryModal from '@/pages/Blog/components/MediaLibraryModal';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

const EMAIL_LOCALES: MarketingEmailAudienceLocale[] = ['en', 'zh-CN', 'zh-HK'];
const BLOCK_TYPES: MarketingEmailBlockType[] = ['hero', 'text', 'image', 'button', 'product_group', 'divider'];

const localeLabels: Record<MarketingEmailAudienceLocale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-HK': '繁體中文',
};

const blockLabels: Record<MarketingEmailBlockType, string> = {
  hero: 'Hero',
  text: 'Text',
  image: 'Image',
  button: 'Button',
  product_group: 'Product group',
  divider: 'Divider',
};

const statusMessages: Record<string, { id: string; defaultMessage: string }> = {
  draft: { id: 'admin.marketingEmails.status.draft', defaultMessage: 'Draft' },
  sending: { id: 'admin.marketingEmails.status.sending', defaultMessage: 'Sending' },
  sent: { id: 'admin.marketingEmails.status.sent', defaultMessage: 'Sent' },
  canceled: { id: 'admin.marketingEmails.status.canceled', defaultMessage: 'Canceled' },
};

type MediaPickerTarget =
  | { type: 'block'; blockId: string }
  | { type: 'product'; blockId: string; productId: string };

interface EmailFormState {
  editingId: string | null;
  title: string;
  subjectContent: MarketingEmailLocalizedString;
  preheaderContent: MarketingEmailLocalizedString;
  blocks: MarketingEmailBlock[];
  audience: MarketingEmailAudience;
  defaultLocale: MarketingEmailAudienceLocale;
  selectedUsers: AdminUserSearchItem[];
  sendEmail: boolean;
}

function createLocalizedString(en = ''): MarketingEmailLocalizedString {
  return {
    en,
    'zh-CN': '',
    'zh-HK': '',
  };
}

function createProduct(index: number): MarketingEmailProduct {
  return {
    id: `product-${Date.now()}-${index}`,
    title: createLocalizedString(''),
    body: createLocalizedString(''),
    imageUrl: '',
    imageAlt: createLocalizedString(''),
    url: createLocalizedString(''),
    buttonLabel: createLocalizedString('View item'),
    priceLabel: createLocalizedString(''),
    badge: createLocalizedString(''),
  };
}

function createBlock(type: MarketingEmailBlockType, index: number): MarketingEmailBlock {
  return {
    id: `block-${Date.now()}-${index}`,
    type,
    eyebrow: createLocalizedString(''),
    title: createLocalizedString(type === 'hero' ? 'Citizens Hub update' : ''),
    body: createLocalizedString(''),
    imageUrl: '',
    imageAlt: createLocalizedString(''),
    imageSide: 'right',
    url: createLocalizedString(''),
    buttonLabel: createLocalizedString(type === 'button' || type === 'hero' ? 'Open' : ''),
    products: type === 'product_group' ? [createProduct(0)] : [],
  };
}

function createInitialForm(): EmailFormState {
  return {
    editingId: null,
    title: 'Citizens Hub marketing email',
    subjectContent: createLocalizedString('Citizens Hub update'),
    preheaderContent: createLocalizedString('New content is ready at Citizens Hub.'),
    blocks: [
      {
        ...createBlock('hero', 0),
        title: createLocalizedString('Citizens Hub update'),
        body: createLocalizedString('Browse the latest market picks and community updates.'),
      },
    ],
    audience: 'selected_users',
    defaultLocale: 'en',
    selectedUsers: [],
    sendEmail: false,
  };
}

function localizedValue(value: MarketingEmailLocalizedString | undefined, locale: MarketingEmailAudienceLocale) {
  return value?.[locale] || '';
}

function setLocalizedValue(
  value: MarketingEmailLocalizedString | undefined,
  locale: MarketingEmailAudienceLocale,
  nextValue: string,
): MarketingEmailLocalizedString {
  return {
    ...(value || {}),
    [locale]: nextValue,
  };
}

function sanitizeLocalized(value?: MarketingEmailLocalizedString): MarketingEmailLocalizedString {
  const result: MarketingEmailLocalizedString = {};
  for (const locale of EMAIL_LOCALES) {
    const next = value?.[locale]?.trim();
    if (next) {
      result[locale] = next;
    }
  }

  return result;
}

function sanitizeBlocks(blocks: MarketingEmailBlock[]): MarketingEmailBlock[] {
  return blocks.map((block) => ({
    id: block.id,
    type: block.type,
    eyebrow: sanitizeLocalized(block.eyebrow),
    title: sanitizeLocalized(block.title),
    body: sanitizeLocalized(block.body),
    imageUrl: block.imageUrl?.trim() || null,
    imageAlt: sanitizeLocalized(block.imageAlt),
    imageSide: block.imageSide === 'left' ? 'left' : 'right',
    url: sanitizeLocalized(block.url),
    buttonLabel: sanitizeLocalized(block.buttonLabel),
    products: (block.products || []).map((product) => ({
      id: product.id,
      title: sanitizeLocalized(product.title),
      body: sanitizeLocalized(product.body),
      imageUrl: product.imageUrl?.trim() || null,
      imageAlt: sanitizeLocalized(product.imageAlt),
      url: sanitizeLocalized(product.url),
      buttonLabel: sanitizeLocalized(product.buttonLabel),
      priceLabel: sanitizeLocalized(product.priceLabel),
      badge: sanitizeLocalized(product.badge),
    })),
  }));
}

function getStatusColor(status: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  if (status === 'sent') return 'success';
  if (status === 'sending') return 'info';
  if (status === 'draft') return 'default';
  if (status === 'canceled') return 'error';
  return 'default';
}

export default function MarketingEmailCampaignsManager() {
  const intl = useIntl();
  const { token, email: adminEmail } = useSelector((state: RootState) => state.user.user);
  const [form, setForm] = useState<EmailFormState>(() => createInitialForm());
  const [activeLocale, setActiveLocale] = useState<MarketingEmailAudienceLocale>('en');
  const [userQuery, setUserQuery] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewCampaignId, setPreviewCampaignId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<AdminMarketingEmailCampaignPreviewResponse['email'] | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRecipientEmail, setPreviewRecipientEmail] = useState(adminEmail || '');
  const [previewSending, setPreviewSending] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<MediaPickerTarget | null>(null);

  const { data: usersData, isLoading: usersLoading } = useAdminUserSearch(userQuery);
  const { data: campaignsData, isLoading: campaignsLoading, mutate } = useAdminMarketingEmailCampaigns({
    page: 1,
    limit: 20,
    search,
  });

  const selectedUserIds = useMemo(() => new Set(form.selectedUsers.map((user) => user.id)), [form.selectedUsers]);
  const campaigns = campaignsData?.campaigns || [];

  useEffect(() => {
    if (message) {
      const timeoutId = window.setTimeout(() => setMessage(null), 7000);
      return () => window.clearTimeout(timeoutId);
    }
  }, [message]);

  const resetForm = () => {
    setForm(createInitialForm());
    setUserQuery('');
    setActiveLocale('en');
  };

  const updateLocalizedField = (
    field: 'subjectContent' | 'preheaderContent',
    locale: MarketingEmailAudienceLocale,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      [field]: setLocalizedValue(current[field], locale, value),
    }));
  };

  const updateBlock = (blockId: string, patch: Partial<MarketingEmailBlock>) => {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block) => block.id === blockId ? { ...block, ...patch } : block),
    }));
  };

  const updateBlockLocalizedField = (
    blockId: string,
    field: 'eyebrow' | 'title' | 'body' | 'imageAlt' | 'url' | 'buttonLabel',
    locale: MarketingEmailAudienceLocale,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block) => block.id === blockId
        ? { ...block, [field]: setLocalizedValue(block[field], locale, value) }
        : block),
    }));
  };

  const updateProduct = (blockId: string, productId: string, patch: Partial<MarketingEmailProduct>) => {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block) => block.id === blockId
        ? {
            ...block,
            products: (block.products || []).map((product) => product.id === productId ? { ...product, ...patch } : product),
          }
        : block),
    }));
  };

  const updateProductLocalizedField = (
    blockId: string,
    productId: string,
    field: 'title' | 'body' | 'imageAlt' | 'url' | 'buttonLabel' | 'priceLabel' | 'badge',
    locale: MarketingEmailAudienceLocale,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block) => block.id === blockId
        ? {
            ...block,
            products: (block.products || []).map((product) => product.id === productId
              ? { ...product, [field]: setLocalizedValue(product[field], locale, value) }
              : product),
          }
        : block),
    }));
  };

  const addBlock = (type: MarketingEmailBlockType) => {
    setForm((current) => ({
      ...current,
      blocks: [...current.blocks, createBlock(type, current.blocks.length)],
    }));
  };

  const moveBlock = (blockId: string, direction: -1 | 1) => {
    setForm((current) => {
      const index = current.blocks.findIndex((block) => block.id === blockId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.blocks.length) {
        return current;
      }

      const nextBlocks = [...current.blocks];
      [nextBlocks[index], nextBlocks[nextIndex]] = [nextBlocks[nextIndex], nextBlocks[index]];
      return { ...current, blocks: nextBlocks };
    });
  };

  const removeBlock = (blockId: string) => {
    setForm((current) => ({ ...current, blocks: current.blocks.filter((block) => block.id !== blockId) }));
  };

  const addProduct = (blockId: string) => {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block) => block.id === blockId
        ? { ...block, products: [...(block.products || []), createProduct(block.products?.length || 0)] }
        : block),
    }));
  };

  const removeProduct = (blockId: string, productId: string) => {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block) => block.id === blockId
        ? { ...block, products: (block.products || []).filter((product) => product.id !== productId) }
        : block),
    }));
  };

  const validateForm = () => {
    if (!form.title.trim()) {
      return 'Title is required.';
    }

    if (!form.subjectContent.en?.trim()) {
      return 'English subject is required.';
    }

    if (form.blocks.length === 0) {
      return 'Add at least one email block.';
    }

    if (form.audience === 'selected_users' && form.selectedUsers.length === 0) {
      return 'Select at least one recipient.';
    }

    return '';
  };

  const buildPayload = () => ({
    title: form.title.trim(),
    subjectContent: sanitizeLocalized(form.subjectContent),
    preheaderContent: sanitizeLocalized(form.preheaderContent),
    blocks: sanitizeBlocks(form.blocks),
    audience: form.audience,
    defaultLocale: form.defaultLocale,
    recipientUserIds: form.selectedUsers.map((user) => user.id),
    sendEmail: form.sendEmail,
  });

  const saveCampaign = async () => {
    const validationError = validateForm();
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setCreating(true);
    setMessage(null);
    try {
      const response = await fetch(form.editingId
        ? `${API_BASE_URL}/api/admin/marketing-email-campaigns/${encodeURIComponent(form.editingId)}`
        : `${API_BASE_URL}/api/admin/marketing-email-campaigns`, {
        method: form.editingId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildPayload()),
      });

      const result = await response.json().catch(() => null) as MarketingEmailCampaignResponse | { error?: string } | null;
      if (!response.ok) {
        throw new Error(result && 'error' in result && result.error
          ? result.error
          : 'Failed to save marketing email.');
      }

      resetForm();
      await mutate();
      setMessage(form.editingId ? 'Marketing email updated.' : 'Marketing email created.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save marketing email.');
    } finally {
      setCreating(false);
    }
  };

  const postCampaignAction = async (campaign: MarketingEmailCampaign, action: 'send' | 'cancel') => {
    setActionLoadingId(`${campaign.id}:${action}`);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/marketing-email-campaigns/${encodeURIComponent(campaign.id)}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || `Failed to ${action}.`);
      }

      await mutate();
      setMessage(action === 'send' ? 'Marketing email queued.' : 'Marketing email canceled.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Failed to ${action}.`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const openPreview = async (campaign: MarketingEmailCampaign) => {
    setPreviewCampaignId(campaign.id);
    setPreviewData(null);
    setPreviewHtml('');
    setPreviewLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/marketing-email-campaigns/${encodeURIComponent(campaign.id)}/preview`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response.json().catch(() => null) as AdminMarketingEmailCampaignPreviewResponse | { error?: string } | null;
      if (!response.ok || !result || !('email' in result)) {
        throw new Error(result && 'error' in result && result.error ? result.error : 'Failed to load preview.');
      }
      setPreviewData(result.email);
      setPreviewHtml(result.html || '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load preview.');
      setPreviewCampaignId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const sendPreviewEmail = async () => {
    if (!previewCampaignId) return;
    const email = previewRecipientEmail.trim();
    if (!email) {
      setMessage('Enter a preview recipient email.');
      return;
    }

    setPreviewSending(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/marketing-email-campaigns/${encodeURIComponent(previewCampaignId)}/preview/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email }),
      });
      const result = await response.json().catch(() => null) as { success?: boolean; email?: string; error?: string } | null;
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to send preview email.');
      }
      setMessage(`Preview email sent to ${result?.email || email}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to send preview email.');
    } finally {
      setPreviewSending(false);
    }
  };

  const copyPreviewSubject = async () => {
    if (!previewData?.subject) return;
    await navigator.clipboard.writeText(previewData.subject);
    setMessage('Preview subject copied.');
  };

  const editCampaign = (campaign: MarketingEmailCampaign) => {
    setForm({
      editingId: campaign.id,
      title: campaign.title,
      subjectContent: {
        ...createLocalizedString(''),
        ...(campaign.subjectContent || {}),
      },
      preheaderContent: {
        ...createLocalizedString(''),
        ...(campaign.preheaderContent || {}),
      },
      blocks: campaign.blocks?.length ? campaign.blocks : [createBlock('hero', 0)],
      audience: campaign.audience || 'selected_users',
      defaultLocale: campaign.defaultLocale || 'en',
      selectedUsers: (campaign.recipients || []).map((recipient) => ({
        id: recipient.userId,
        email: recipient.email,
        name: recipient.name,
        emailVerified: true,
        createdAt: recipient.createdAt,
      })),
      sendEmail: false,
    });
    setActiveLocale(campaign.defaultLocale || 'en');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMediaSelected = (url: string) => {
    if (mediaPickerTarget?.type === 'block') {
      updateBlock(mediaPickerTarget.blockId, { imageUrl: url });
    } else if (mediaPickerTarget?.type === 'product') {
      updateProduct(mediaPickerTarget.blockId, mediaPickerTarget.productId, { imageUrl: url });
    }
    setMediaPickerTarget(null);
  };

  const renderLocalizedInput = (
    label: string,
    value: MarketingEmailLocalizedString | undefined,
    onChange: (locale: MarketingEmailAudienceLocale, value: string) => void,
    options?: { multiline?: boolean; minRows?: number; requiredEn?: boolean },
  ) => (
    <TextField
      label={`${label} (${localeLabels[activeLocale]})${options?.requiredEn && activeLocale === 'en' ? ' *' : ''}`}
      value={localizedValue(value, activeLocale)}
      onChange={(event) => onChange(activeLocale, event.target.value)}
      multiline={options?.multiline}
      minRows={options?.minRows}
      fullWidth
    />
  );

  const renderProductEditor = (block: MarketingEmailBlock, product: MarketingEmailProduct, index: number) => (
    <Paper key={product.id} variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Box display="flex" justifyContent="space-between" gap={1} alignItems="center">
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Product {index + 1}</Typography>
          <IconButton size="small" onClick={() => removeProduct(block.id, product.id)}>
            <X className="h-4 w-4" />
          </IconButton>
        </Box>
        <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={2}>
          {renderLocalizedInput('Title', product.title, (locale, value) => updateProductLocalizedField(block.id, product.id, 'title', locale, value), { requiredEn: true })}
          {renderLocalizedInput('Badge', product.badge, (locale, value) => updateProductLocalizedField(block.id, product.id, 'badge', locale, value))}
        </Box>
        {renderLocalizedInput('Description', product.body, (locale, value) => updateProductLocalizedField(block.id, product.id, 'body', locale, value), { multiline: true, minRows: 2 })}
        <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={2}>
          {renderLocalizedInput('URL', product.url, (locale, value) => updateProductLocalizedField(block.id, product.id, 'url', locale, value))}
          {renderLocalizedInput('Button label', product.buttonLabel, (locale, value) => updateProductLocalizedField(block.id, product.id, 'buttonLabel', locale, value))}
        </Box>
        <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={2}>
          {renderLocalizedInput('Price label', product.priceLabel, (locale, value) => updateProductLocalizedField(block.id, product.id, 'priceLabel', locale, value))}
          <Box display="flex" gap={1} alignItems="flex-start">
            <TextField
              fullWidth
              label="Image URL"
              value={product.imageUrl || ''}
              onChange={(event) => updateProduct(block.id, product.id, { imageUrl: event.target.value })}
            />
            <Tooltip title="Choose from media library">
              <IconButton
                sx={{ mt: 1 }}
                onClick={() => setMediaPickerTarget({ type: 'product', blockId: block.id, productId: product.id })}
              >
                <ImageIcon className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        {renderLocalizedInput('Image alt', product.imageAlt, (locale, value) => updateProductLocalizedField(block.id, product.id, 'imageAlt', locale, value))}
      </Stack>
    </Paper>
  );

  const renderBlockEditor = (block: MarketingEmailBlock, index: number) => (
    <Paper key={block.id} variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Box display="flex" justifyContent="space-between" gap={1} alignItems="center" flexWrap="wrap">
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" label={blockLabels[block.type]} />
            <Typography variant="caption" color="text.secondary">#{index + 1}</Typography>
          </Stack>
          <Box>
            <Tooltip title="Move up">
              <span>
                <IconButton size="small" disabled={index === 0} onClick={() => moveBlock(block.id, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Move down">
              <span>
                <IconButton size="small" disabled={index === form.blocks.length - 1} onClick={() => moveBlock(block.id, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </IconButton>
              </span>
            </Tooltip>
            <IconButton size="small" onClick={() => removeBlock(block.id)}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </Box>
        </Box>

        {block.type !== 'divider' && (
          <>
            <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '180px 1fr 1fr' }} gap={2}>
              <FormControl>
                <InputLabel>Type</InputLabel>
                <Select
                  label="Type"
                  value={block.type}
                  onChange={(event) => updateBlock(block.id, {
                    type: event.target.value as MarketingEmailBlockType,
                    products: event.target.value === 'product_group' && !block.products?.length ? [createProduct(0)] : block.products,
                  })}
                >
                  {BLOCK_TYPES.map((type) => <MenuItem key={type} value={type}>{blockLabels[type]}</MenuItem>)}
                </Select>
              </FormControl>
              {renderLocalizedInput('Eyebrow', block.eyebrow, (locale, value) => updateBlockLocalizedField(block.id, 'eyebrow', locale, value))}
              {renderLocalizedInput('Title', block.title, (locale, value) => updateBlockLocalizedField(block.id, 'title', locale, value))}
            </Box>

            {renderLocalizedInput('Body', block.body, (locale, value) => updateBlockLocalizedField(block.id, 'body', locale, value), { multiline: true, minRows: 3 })}

            {(block.type === 'hero' || block.type === 'text' || block.type === 'image') && (
              <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr 160px' }} gap={2}>
                <Box display="flex" gap={1} alignItems="flex-start">
                  <TextField
                    fullWidth
                    label="Image URL"
                    value={block.imageUrl || ''}
                    onChange={(event) => updateBlock(block.id, { imageUrl: event.target.value })}
                  />
                  <Tooltip title="Choose from media library">
                    <IconButton sx={{ mt: 1 }} onClick={() => setMediaPickerTarget({ type: 'block', blockId: block.id })}>
                      <ImageIcon className="h-4 w-4" />
                    </IconButton>
                  </Tooltip>
                </Box>
                {renderLocalizedInput('Image alt', block.imageAlt, (locale, value) => updateBlockLocalizedField(block.id, 'imageAlt', locale, value))}
                <FormControl>
                  <InputLabel>Image side</InputLabel>
                  <Select
                    label="Image side"
                    value={block.imageSide || 'right'}
                    onChange={(event) => updateBlock(block.id, { imageSide: event.target.value as 'left' | 'right' })}
                  >
                    <MenuItem value="right">Right</MenuItem>
                    <MenuItem value="left">Left</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            )}

            {(block.type === 'hero' || block.type === 'text' || block.type === 'button' || block.type === 'image') && (
              <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={2}>
                {renderLocalizedInput('URL', block.url, (locale, value) => updateBlockLocalizedField(block.id, 'url', locale, value))}
                {renderLocalizedInput('Button label', block.buttonLabel, (locale, value) => updateBlockLocalizedField(block.id, 'buttonLabel', locale, value))}
              </Box>
            )}

            {block.type === 'product_group' && (
              <Stack spacing={2}>
                <Box display="flex" justifyContent="space-between" gap={1} alignItems="center">
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Products</Typography>
                  <Button size="small" variant="outlined" startIcon={<Plus className="h-4 w-4" />} onClick={() => addProduct(block.id)}>
                    Add product
                  </Button>
                </Box>
                {(block.products || []).map((product, productIndex) => renderProductEditor(block, product, productIndex))}
              </Stack>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
        <Stack spacing={2}>
          <Box display="flex" justifyContent="space-between" gap={2} flexWrap="wrap" alignItems="center">
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                <FormattedMessage id="admin.marketingEmails.title" defaultMessage="Marketing Emails" />
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Independent block email editor. Links are manual and are not connected to promotions or coupons.
              </Typography>
            </Box>
            {form.editingId && (
              <Button variant="outlined" onClick={resetForm}>
                New email
              </Button>
            )}
          </Box>

          {message && (
            <Alert severity={/created|updated|queued|canceled|sent|copied/i.test(message) ? 'success' : 'error'}>
              {message}
            </Alert>
          )}

          <Stack direction="row" spacing={1} flexWrap="wrap">
            {EMAIL_LOCALES.map((locale) => (
              <Button
                key={locale}
                size="small"
                variant={activeLocale === locale ? 'contained' : 'outlined'}
                onClick={() => setActiveLocale(locale)}
              >
                {localeLabels[locale]}
              </Button>
            ))}
          </Stack>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 180px 180px' }} gap={2}>
            <TextField
              label="Internal title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            />
            <FormControl>
              <InputLabel>Default locale</InputLabel>
              <Select
                label="Default locale"
                value={form.defaultLocale}
                onChange={(event) => setForm((current) => ({ ...current, defaultLocale: event.target.value as MarketingEmailAudienceLocale }))}
              >
                {EMAIL_LOCALES.map((locale) => <MenuItem key={locale} value={locale}>{localeLabels[locale]}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl>
              <InputLabel>Audience</InputLabel>
              <Select
                label="Audience"
                value={form.audience}
                onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value as MarketingEmailAudience }))}
              >
                <MenuItem value="selected_users">Selected users</MenuItem>
                <MenuItem value="marketing_consent">All opted-in users</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={2}>
            {renderLocalizedInput('Subject', form.subjectContent, updateLocalizedField.bind(null, 'subjectContent'), { requiredEn: true })}
            {renderLocalizedInput('Preheader', form.preheaderContent, updateLocalizedField.bind(null, 'preheaderContent'))}
          </Box>

          {form.audience === 'selected_users' && (
            <Autocomplete
              multiple
              value={form.selectedUsers}
              options={usersData?.users || []}
              loading={usersLoading}
              getOptionDisabled={(option) => selectedUserIds.has(option.id)}
              getOptionLabel={(option) => `${option.email}${option.name ? ` · ${option.name}` : ''}`}
              onChange={(_, value) => setForm((current) => ({ ...current, selectedUsers: value }))}
              inputValue={userQuery}
              onInputChange={(_, value) => setUserQuery(value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Recipients"
                  placeholder="Search users by email or name"
                />
              )}
            />
          )}

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Box display="flex" justifyContent="space-between" gap={2} flexWrap="wrap" alignItems="center">
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Blocks</Typography>
                <Box display="flex" gap={1} flexWrap="wrap">
                  {BLOCK_TYPES.map((type) => (
                    <Button key={type} size="small" variant="outlined" startIcon={<Plus className="h-4 w-4" />} onClick={() => addBlock(type)}>
                      {blockLabels[type]}
                    </Button>
                  ))}
                </Box>
              </Box>
              <Stack spacing={2}>
                {form.blocks.map((block, index) => renderBlockEditor(block, index))}
              </Stack>
            </Stack>
          </Paper>

          <FormControlLabel
            control={<Checkbox checked={form.sendEmail} onChange={(event) => setForm((current) => ({ ...current, sendEmail: event.target.checked }))} />}
            label="Queue email immediately after save"
          />

          <Box display="flex" gap={1} justifyContent="flex-end" flexWrap="wrap">
            <Button variant="outlined" startIcon={<RefreshCw className="h-4 w-4" />} onClick={resetForm}>
              Reset
            </Button>
            <Button variant="contained" startIcon={creating ? <CircularProgress size={16} /> : <Save className="h-4 w-4" />} onClick={saveCampaign} disabled={creating}>
              {form.editingId ? 'Update email' : 'Create email'}
            </Button>
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
        <Stack spacing={2}>
          <Box display="flex" justifyContent="space-between" gap={2} flexWrap="wrap" alignItems="center">
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Existing emails</Typography>
            <TextField
              size="small"
              label="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Box>

          {campaignsLoading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Title</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Audience</TableCell>
                    <TableCell>Recipients</TableCell>
                    <TableCell>Updated</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {campaigns.map((campaign) => (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{campaign.title}</Typography>
                        <Typography variant="caption" color="text.secondary">{campaign.id}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" color={getStatusColor(campaign.status)} label={intl.formatMessage(statusMessages[campaign.status] || { id: 'admin.marketingEmails.status.unknown', defaultMessage: campaign.status })} />
                      </TableCell>
                      <TableCell>{campaign.audience === 'marketing_consent' ? 'All opted-in' : 'Selected users'}</TableCell>
                      <TableCell>{campaign.recipientCount}</TableCell>
                      <TableCell>{new Date(campaign.updatedAt).toLocaleString(intl.locale)}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Preview">
                          <IconButton size="small" onClick={() => openPreview(campaign)}>
                            <Eye className="h-4 w-4" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit draft">
                          <span>
                            <IconButton size="small" disabled={campaign.status !== 'draft'} onClick={() => editCampaign(campaign)}>
                              <Save className="h-4 w-4" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Send">
                          <span>
                            <IconButton
                              size="small"
                              disabled={campaign.status !== 'draft' || actionLoadingId === `${campaign.id}:send`}
                              onClick={() => postCampaignAction(campaign, 'send')}
                            >
                              {actionLoadingId === `${campaign.id}:send` ? <CircularProgress size={16} /> : <Send className="h-4 w-4" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Cancel">
                          <span>
                            <IconButton
                              size="small"
                              disabled={campaign.status === 'sent' || campaign.status === 'canceled' || actionLoadingId === `${campaign.id}:cancel`}
                              onClick={() => postCampaignAction(campaign, 'cancel')}
                            >
                              {actionLoadingId === `${campaign.id}:cancel` ? <CircularProgress size={16} /> : <X className="h-4 w-4" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {campaigns.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
                          No marketing emails yet.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </Paper>

      <Dialog open={Boolean(previewCampaignId)} onClose={() => setPreviewCampaignId(null)} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center" gap={2}>
            <Typography variant="h6">Preview</Typography>
            <IconButton onClick={() => setPreviewCampaignId(null)}><X className="h-4 w-4" /></IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {previewLoading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : (
            <Stack spacing={2}>
              {previewData && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={1}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" gap={1}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{previewData.subject || previewData.title}</Typography>
                      <Tooltip title="Copy subject">
                        <IconButton size="small" onClick={copyPreviewSubject}>
                          <Copy className="h-4 w-4" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    {previewData.preheader && <Typography variant="body2" color="text.secondary">{previewData.preheader}</Typography>}
                  </Stack>
                </Paper>
              )}

              <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
                <TextField
                  size="small"
                  label="Preview recipient"
                  value={previewRecipientEmail}
                  onChange={(event) => setPreviewRecipientEmail(event.target.value)}
                  sx={{ minWidth: 280 }}
                />
                <Button variant="outlined" startIcon={previewSending ? <CircularProgress size={16} /> : <Send className="h-4 w-4" />} onClick={sendPreviewEmail} disabled={previewSending}>
                  Send preview
                </Button>
              </Box>

              <Divider />
              {previewHtml ? (
                <Box
                  component="iframe"
                  title="Marketing email preview"
                  srcDoc={previewHtml}
                  sx={{ width: '100%', height: 720, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
                />
              ) : (
                <Typography variant="body2" color="text.secondary">No preview HTML.</Typography>
              )}
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <MediaLibraryModal
        open={Boolean(mediaPickerTarget)}
        onClose={() => setMediaPickerTarget(null)}
        onSelectUrl={handleMediaSelected}
      />
    </Stack>
  );
}
