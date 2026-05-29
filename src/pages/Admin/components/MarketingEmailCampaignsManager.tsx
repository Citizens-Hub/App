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
import { ArrowDown, ArrowUp, Copy, Eye, Image as ImageIcon, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import {
  AdminMarketingEmailCampaignPreviewResponse,
  AdminUserSearchItem,
  ListingItem,
  MarketingEmailCampaign,
  MarketingEmailAudienceLocale,
  MarketingEmailLandingSection,
  MarketingEmailLandingSectionItem,
  MarketingEmailLandingSectionType,
  MarketingEmailCampaignResponse,
} from '@/types';
import {
  useAdminMarketSearch,
  useAdminMarketingEmailCampaigns,
  useAdminUserSearch,
} from '@/hooks/swr/admin/useMarketingOffers';
import { formatUsdPrice } from '@/pages/Market/marketI18n';
import { getAvailableStock } from '@/pages/Market/marketUtils';
import MediaLibraryModal from '@/pages/Blog/components/MediaLibraryModal';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

interface SelectedCampaignItem {
  item: ListingItem;
  quantity: number;
  emailHeadline: string;
  emailDescription: string;
  emailBadge: string;
  emailImageUrl: string;
  buttonLabel: string;
}

const campaignStatusMessages: Record<string, { id: string; defaultMessage: string }> = {
  draft: { id: 'admin.marketingEmails.status.draft', defaultMessage: 'Draft' },
  sending: { id: 'admin.marketingEmails.status.sending', defaultMessage: 'Sending' },
  sent: { id: 'admin.marketingEmails.status.sent', defaultMessage: 'Sent' },
  canceled: { id: 'admin.marketingEmails.status.canceled', defaultMessage: 'Canceled' },
  expired: { id: 'admin.marketingEmails.status.expired', defaultMessage: 'Expired' },
};

function getCampaignStatusMessage(status: string) {
  return campaignStatusMessages[status] || { id: 'admin.marketingEmails.status.unknown', defaultMessage: 'Unknown' };
}

function getCampaignStatusColor(status: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  if (status === 'sent') return 'success';
  if (status === 'sending') return 'info';
  if (status === 'draft') return 'default';
  if (status === 'expired') return 'warning';
  if (status === 'canceled') return 'error';
  return 'default';
}

const templateMessages: Record<string, { id: string; defaultMessage: string }> = {
  featured_products: { id: 'admin.marketingEmails.template.featuredProducts', defaultMessage: 'Featured products' },
  product_grid: { id: 'admin.marketingEmails.template.productGrid', defaultMessage: 'Product grid' },
  launch_story: { id: 'admin.marketingEmails.template.launchStory', defaultMessage: 'Launch story' },
  compact_offer: { id: 'admin.marketingEmails.template.compactOffer', defaultMessage: 'Compact offer' },
  compact: { id: 'admin.marketingEmails.template.compact', defaultMessage: 'Compact' },
  editorial: { id: 'admin.marketingEmails.template.editorial', defaultMessage: 'Editorial' },
};

function getTemplateMessage(template: string) {
  return templateMessages[template] || templateMessages.featured_products;
}

function defaultExpiresAt() {
  const date = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

type MediaPickerTarget =
  | { type: 'hero' }
  | { type: 'item'; skuId: string }
  | { type: 'landing'; sectionId: string };

const audienceLocaleMessages: Record<MarketingEmailAudienceLocale, { id: string; defaultMessage: string }> = {
  en: { id: 'admin.marketingEmails.locale.en', defaultMessage: 'English' },
  'zh-CN': { id: 'admin.marketingEmails.locale.zhCN', defaultMessage: 'Simplified Chinese' },
  'zh-HK': { id: 'admin.marketingEmails.locale.zhHK', defaultMessage: 'Traditional Chinese' },
};

const landingSectionMessages: Record<MarketingEmailLandingSectionType, { id: string; defaultMessage: string }> = {
  benefits: { id: 'admin.marketingEmails.landing.type.benefits', defaultMessage: 'Benefit cards' },
  product_group: { id: 'admin.marketingEmails.landing.type.productGroup', defaultMessage: 'Product group' },
  media_text: { id: 'admin.marketingEmails.landing.type.mediaText', defaultMessage: 'Media and text' },
};

function createLandingSection(type: MarketingEmailLandingSectionType, index: number): MarketingEmailLandingSection {
  return {
    id: `section-${Date.now()}-${index}`,
    type,
    eyebrow: '',
    title: type === 'product_group' ? 'Shop by role' : '',
    body: '',
    imageUrl: '',
    imageAlt: '',
    imageSide: 'right',
    itemSkuIds: [],
    buttonLabel: '',
    items: type === 'benefits'
      ? [
          { id: `benefit-${Date.now()}-1`, title: '', body: '' },
          { id: `benefit-${Date.now()}-2`, title: '', body: '' },
          { id: `benefit-${Date.now()}-3`, title: '', body: '' },
        ]
      : [],
  };
}

export default function MarketingEmailCampaignsManager() {
  const intl = useIntl();
  const { token, email: adminEmail } = useSelector((state: RootState) => state.user.user);
  const [userQuery, setUserQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<AdminUserSearchItem[]>([]);
  const [audience, setAudience] = useState<'selected_users' | 'marketing_consent'>('selected_users');
  const [audienceLocale, setAudienceLocale] = useState<MarketingEmailAudienceLocale>('en');
  const [itemQuery, setItemQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedCampaignItem[]>([]);
  const [title, setTitle] = useState('Limited Citizens\' Hub coupon');
  const [subject, setSubject] = useState('Your Citizens\' Hub coupon is ready');
  const [preheader, setPreheader] = useState('Claim this limited-time coupon before it expires.');
  const [template, setTemplate] = useState('featured_products');
  const [brandLabel, setBrandLabel] = useState("Citizens' Hub");
  const [eyebrow, setEyebrow] = useState('Limited recommendation');
  const [subtitle, setSubtitle] = useState('Open a recommended item and the coupon is claimed automatically.');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [heroImageAlt, setHeroImageAlt] = useState('');
  const [sectionTitle, setSectionTitle] = useState('Recommended picks');
  const [sectionBody, setSectionBody] = useState('');
  const [footerNote, setFooterNote] = useState('One coupon per recipient. The coupon applies only to the recommended items in this email.');
  const [amountOff, setAmountOff] = useState('10');
  const [minimumAmount, setMinimumAmount] = useState('80');
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt());
  const [buttonLabel, setButtonLabel] = useState('');
  const [claimButtonLabel, setClaimButtonLabel] = useState('');
  const [messageBody, setMessageBody] = useState("Hello,\n\nA limited-time Citizens' Hub coupon is available for your account. Claim it from this email, then use it at checkout.");
  const [landingSections, setLandingSections] = useState<MarketingEmailLandingSection[]>([
    {
      id: 'benefits-default',
      type: 'benefits',
      eyebrow: 'How the promo works',
      title: 'Get your next upgrade for less',
      body: '',
      items: [
        { id: 'benefit-1', title: 'Recommended picks', body: 'Use the offer on the products selected for this campaign.' },
        { id: 'benefit-2', title: 'One click claim', body: 'Open the campaign page or any product link to claim the coupon.' },
        { id: 'benefit-3', title: 'Scoped coupon', body: 'The coupon is limited to the listed campaign products.' },
      ],
    },
  ]);
  const [sendEmail, setSendEmail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [previewCampaignId, setPreviewCampaignId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<AdminMarketingEmailCampaignPreviewResponse['email'] | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRecipientEmail, setPreviewRecipientEmail] = useState(adminEmail || '');
  const [previewSending, setPreviewSending] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<MediaPickerTarget | null>(null);

  const { data: usersData, isLoading: usersLoading } = useAdminUserSearch(userQuery);
  const { data: marketData, isLoading: marketLoading } = useAdminMarketSearch({
    search: itemQuery,
    inStockOnly: true,
    groupCcus: false,
    itemTypes: ['ccu', 'package', 'misc'],
    page: 0,
    limit: 12,
  });
  const { data: campaignsData, isLoading: campaignsLoading, mutate } = useAdminMarketingEmailCampaigns({
    page: 1,
    limit: 20,
    search,
  });

  const selectedSkuIds = useMemo(() => new Set(selectedItems.map((entry) => entry.item.skuId)), [selectedItems]);
  const listingItems = marketData?.items || [];
  const itemOptions = listingItems.filter((item) => item.itemType !== 'credit');
  const subtotal = selectedItems.reduce((sum, entry) => sum + entry.item.price * entry.quantity, 0);
  const selectedUserIds = useMemo(() => new Set(selectedUsers.map((user) => user.id)), [selectedUsers]);

  useEffect(() => {
    if (message) {
      const timeoutId = window.setTimeout(() => setMessage(null), 7000);
      return () => window.clearTimeout(timeoutId);
    }
  }, [message]);

  const addItem = (item: ListingItem | null) => {
    if (!item || selectedSkuIds.has(item.skuId)) return;
    setSelectedItems((current) => [...current, {
      item,
      quantity: 1,
      emailHeadline: '',
      emailDescription: '',
      emailBadge: '',
      emailImageUrl: '',
      buttonLabel: '',
    }]);
    setItemQuery('');
  };

  const updateItemQuantity = (skuId: string, quantity: number) => {
    setSelectedItems((current) => current.map((entry) => entry.item.skuId === skuId
      ? { ...entry, quantity: Math.max(1, Math.min(quantity, getAvailableStock(entry.item))) }
      : entry));
  };

  const updateItemEmailField = (
    skuId: string,
    field: Exclude<keyof SelectedCampaignItem, 'item' | 'quantity'>,
    value: string,
  ) => {
    setSelectedItems((current) => current.map((entry) => entry.item.skuId === skuId
      ? { ...entry, [field]: value }
      : entry));
  };

  const updateLandingSection = (
    sectionId: string,
    field: keyof Omit<MarketingEmailLandingSection, 'items' | 'itemSkuIds'>,
    value: string,
  ) => {
    setLandingSections((current) => current.map((section) => section.id === sectionId
      ? { ...section, [field]: value }
      : section));
  };

  const updateLandingSectionItem = (
    sectionId: string,
    itemId: string,
    field: keyof MarketingEmailLandingSectionItem,
    value: string,
  ) => {
    setLandingSections((current) => current.map((section) => {
      if (section.id !== sectionId) return section;
      return {
        ...section,
        items: (section.items || []).map((item) => item.id === itemId
          ? { ...item, [field]: value }
          : item),
      };
    }));
  };

  const addLandingBenefitItem = (sectionId: string) => {
    setLandingSections((current) => current.map((section) => section.id === sectionId
      ? {
          ...section,
          items: [
            ...(section.items || []),
            { id: `benefit-${Date.now()}`, title: '', body: '' },
          ],
        }
      : section));
  };

  const removeLandingBenefitItem = (sectionId: string, itemId: string) => {
    setLandingSections((current) => current.map((section) => section.id === sectionId
      ? { ...section, items: (section.items || []).filter((item) => item.id !== itemId) }
      : section));
  };

  const toggleLandingSectionSku = (sectionId: string, skuId: string, checked: boolean) => {
    setLandingSections((current) => current.map((section) => {
      if (section.id !== sectionId) return section;
      const currentSkuIds = section.itemSkuIds || [];
      return {
        ...section,
        itemSkuIds: checked
          ? Array.from(new Set([...currentSkuIds, skuId]))
          : currentSkuIds.filter((id) => id !== skuId),
      };
    }));
  };

  const moveLandingSection = (sectionId: string, direction: -1 | 1) => {
    setLandingSections((current) => {
      const index = current.findIndex((section) => section.id === sectionId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const resetForm = () => {
    setSelectedItems([]);
    setSelectedUsers([]);
    setUserQuery('');
    setItemQuery('');
    setTitle('Limited Citizens\' Hub coupon');
    setSubject('Your Citizens\' Hub coupon is ready');
    setPreheader('Claim this limited-time coupon before it expires.');
    setTemplate('featured_products');
    setBrandLabel("Citizens' Hub");
    setEyebrow('Limited recommendation');
    setSubtitle('Open a recommended item and the coupon is claimed automatically.');
    setHeroImageUrl('');
    setHeroImageAlt('');
    setSectionTitle('Recommended picks');
    setSectionBody('');
    setFooterNote('One coupon per recipient. The coupon applies only to the recommended items in this email.');
    setAmountOff('10');
    setMinimumAmount('80');
    setExpiresAt(defaultExpiresAt());
    setButtonLabel('');
    setClaimButtonLabel('');
    setMessageBody("Hello,\n\nA limited-time Citizens' Hub coupon is available for your account. Claim it from this email, then use it at checkout.");
    setLandingSections([createLandingSection('benefits', 0)]);
    setSendEmail(false);
    setAudience('selected_users');
    setAudienceLocale('en');
  };

  const createCampaign = async () => {
    if (selectedItems.length === 0 || (audience === 'selected_users' && selectedUsers.length === 0)) {
      setMessage(intl.formatMessage({
        id: 'admin.marketingEmails.validationItemsRecipients',
        defaultMessage: 'Please select at least one item and one recipient.',
      }));
      return;
    }

    setCreating(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/marketing-email-campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          subject,
          preheader,
          template,
          brandLabel,
          eyebrow,
          subtitle,
          message: messageBody,
          buttonLabel,
          claimButtonLabel,
          heroImageUrl,
          heroImageAlt,
          sectionTitle,
          sectionBody,
          footerNote,
          amountOff: Number(amountOff),
          minimumAmount: Number(minimumAmount),
          expiresAt: new Date(expiresAt).toISOString(),
          audience,
          audienceLocale,
          recipientUserIds: selectedUsers.map((user) => user.id),
          sendEmail,
          landingSections,
          items: selectedItems.map((entry) => ({
            skuId: entry.item.skuId,
            quantity: entry.quantity,
            emailHeadline: entry.emailHeadline,
            emailDescription: entry.emailDescription,
            emailBadge: entry.emailBadge,
            emailImageUrl: entry.emailImageUrl,
            buttonLabel: entry.buttonLabel,
          })),
        }),
      });

      const result = await response.json().catch(() => null) as MarketingEmailCampaignResponse | { error?: string } | null;
      if (!response.ok) {
        throw new Error(result && 'error' in result && result.error
          ? result.error
          : intl.formatMessage({
            id: 'admin.marketingEmails.createError',
            defaultMessage: 'Failed to create marketing email campaign.',
          }));
      }

      resetForm();
      await mutate();
      setMessage(intl.formatMessage({
        id: 'admin.marketingEmails.createSuccess',
        defaultMessage: 'Marketing email campaign created.',
      }));
    } catch (error) {
      setMessage(error instanceof Error
        ? error.message
        : intl.formatMessage({
          id: 'admin.marketingEmails.createError',
          defaultMessage: 'Failed to create marketing email campaign.',
        }));
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
        throw new Error(result?.error || intl.formatMessage(
          {
            id: 'admin.marketingEmails.actionError',
            defaultMessage: 'Failed to {action}.',
          },
          {
            action,
          },
        ));
      }

      await mutate();
      setMessage(action === 'send'
        ? intl.formatMessage({ id: 'admin.marketingEmails.emailQueued', defaultMessage: 'Campaign emails queued.' })
        : intl.formatMessage({ id: 'admin.marketingEmails.cancelSuccess', defaultMessage: 'Campaign canceled.' }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : intl.formatMessage(
        {
          id: 'admin.marketingEmails.actionError',
          defaultMessage: 'Failed to {action}.',
        },
        {
          action,
        },
      ));
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
        throw new Error(result && 'error' in result && result.error
          ? result.error
          : intl.formatMessage({ id: 'admin.marketingEmails.previewLoadError', defaultMessage: 'Failed to load preview.' }));
      }
      setPreviewData(result.email);
      setPreviewHtml(result.html || '');
    } catch (error) {
      setMessage(error instanceof Error
        ? error.message
        : intl.formatMessage({ id: 'admin.marketingEmails.previewLoadError', defaultMessage: 'Failed to load preview.' }));
      setPreviewCampaignId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const sendPreviewEmail = async () => {
    if (!previewCampaignId) return;
    const email = previewRecipientEmail.trim();
    if (!email) {
      setMessage(intl.formatMessage({ id: 'admin.marketingEmails.previewEmailRequired', defaultMessage: 'Enter a preview recipient email.' }));
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
        throw new Error(result?.error || intl.formatMessage({ id: 'admin.marketingEmails.previewSendError', defaultMessage: 'Failed to send preview email.' }));
      }
      setMessage(intl.formatMessage(
        { id: 'admin.marketingEmails.previewSent', defaultMessage: 'Preview email sent to {email}.' },
        { email: result?.email || email },
      ));
    } catch (error) {
      setMessage(error instanceof Error
        ? error.message
        : intl.formatMessage({ id: 'admin.marketingEmails.previewSendError', defaultMessage: 'Failed to send preview email.' }));
    } finally {
      setPreviewSending(false);
    }
  };

  const openMediaPicker = (target: MediaPickerTarget) => {
    setMediaPickerTarget(target);
  };

  const handleMediaSelected = (url: string) => {
    if (mediaPickerTarget?.type === 'hero') {
      setHeroImageUrl(url);
    } else if (mediaPickerTarget?.type === 'item') {
      updateItemEmailField(mediaPickerTarget.skuId, 'emailImageUrl', url);
    } else if (mediaPickerTarget?.type === 'landing') {
      updateLandingSection(mediaPickerTarget.sectionId, 'imageUrl', url);
    }
    setMediaPickerTarget(null);
  };

  const copyFirstClaimLink = async (campaign: MarketingEmailCampaign) => {
    const firstLink = campaign.items.find((item) => item.productUrl)?.productUrl
      || campaign.recipients?.find((recipient) => recipient.claimUrl)?.claimUrl;
    if (!firstLink) {
      setMessage(intl.formatMessage({ id: 'admin.marketingEmails.noClaimLink', defaultMessage: 'No claim link is available yet.' }));
      return;
    }

    await navigator.clipboard.writeText(firstLink);
    setMessage(intl.formatMessage({ id: 'admin.marketingEmails.linkCopied', defaultMessage: 'Product link copied.' }));
  };

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              <FormattedMessage id="admin.marketingEmails.title" defaultMessage="Marketing Emails" />
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              <FormattedMessage
                id="admin.marketingEmails.description"
                defaultMessage="Create product recommendation emails. Each recipient can claim one coupon automatically from any product link, and the coupon is limited to the recommended products."
              />
            </Typography>
          </Box>

          {message && (
            <Alert severity={
              message === intl.formatMessage({ id: 'admin.marketingEmails.createSuccess', defaultMessage: 'Marketing email campaign created.' })
              || message === intl.formatMessage({ id: 'admin.marketingEmails.emailQueued', defaultMessage: 'Campaign emails queued.' })
              || message === intl.formatMessage({ id: 'admin.marketingEmails.cancelSuccess', defaultMessage: 'Campaign canceled.' })
              || message === intl.formatMessage({ id: 'admin.marketingEmails.linkCopied', defaultMessage: 'Product link copied.' })
              || message.startsWith(intl.formatMessage({ id: 'admin.marketingEmails.previewSentPrefix', defaultMessage: 'Preview email sent to' }))
                ? 'success'
                : 'error'
            }>
              {message}
            </Alert>
          )}

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={2}>
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingEmails.campaignTitle', defaultMessage: 'Campaign title' })}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingEmails.subject', defaultMessage: 'Email subject' })}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </Box>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 220px' }} gap={2}>
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingEmails.preheader', defaultMessage: 'Preheader' })}
              value={preheader}
              onChange={(event) => setPreheader(event.target.value)}
            />
            <FormControl>
              <InputLabel id="marketing-email-template-label">
                <FormattedMessage id="admin.marketingEmails.template" defaultMessage="Template" />
              </InputLabel>
              <Select
                labelId="marketing-email-template-label"
                label={intl.formatMessage({ id: 'admin.marketingEmails.template', defaultMessage: 'Template' })}
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
              >
                <MenuItem value="featured_products">{intl.formatMessage(templateMessages.featured_products)}</MenuItem>
                <MenuItem value="product_grid">{intl.formatMessage(templateMessages.product_grid)}</MenuItem>
                <MenuItem value="launch_story">{intl.formatMessage(templateMessages.launch_story)}</MenuItem>
                <MenuItem value="compact_offer">{intl.formatMessage(templateMessages.compact_offer)}</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }} gap={2}>
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingEmails.brandLabel', defaultMessage: 'Brand label' })}
              value={brandLabel}
              onChange={(event) => setBrandLabel(event.target.value)}
            />
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingEmails.eyebrow', defaultMessage: 'Eyebrow' })}
              value={eyebrow}
              onChange={(event) => setEyebrow(event.target.value)}
            />
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingEmails.subtitle', defaultMessage: 'Subtitle' })}
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
            />
          </Box>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '2fr 1fr' }} gap={2}>
            <Box display="flex" gap={1} alignItems="flex-start">
              <TextField
                fullWidth
                label={intl.formatMessage({ id: 'admin.marketingEmails.heroImageUrl', defaultMessage: 'Hero image URL' })}
                value={heroImageUrl}
                onChange={(event) => setHeroImageUrl(event.target.value)}
              />
              <Tooltip title={intl.formatMessage({ id: 'admin.marketingEmails.chooseMedia', defaultMessage: 'Choose from media library' })}>
                <IconButton
                  sx={{ mt: 1 }}
                  onClick={() => openMediaPicker({ type: 'hero' })}
                  aria-label={intl.formatMessage({ id: 'admin.marketingEmails.chooseHeroMedia', defaultMessage: 'Choose hero media' })}
                >
                  <ImageIcon className="h-4 w-4" />
                </IconButton>
              </Tooltip>
            </Box>
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingEmails.heroImageAlt', defaultMessage: 'Hero image alt' })}
              value={heroImageAlt}
              onChange={(event) => setHeroImageAlt(event.target.value)}
            />
          </Box>

          <TextField
            label={intl.formatMessage({ id: 'admin.marketingEmails.message', defaultMessage: 'Message' })}
            value={messageBody}
            onChange={(event) => setMessageBody(event.target.value)}
            multiline
            minRows={4}
          />

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 2fr' }} gap={2}>
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingEmails.sectionTitle', defaultMessage: 'Product section title' })}
              value={sectionTitle}
              onChange={(event) => setSectionTitle(event.target.value)}
            />
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingEmails.sectionBody', defaultMessage: 'Product section body' })}
              value={sectionBody}
              onChange={(event) => setSectionBody(event.target.value)}
            />
          </Box>

          <TextField
            label={intl.formatMessage({ id: 'admin.marketingEmails.footerNote', defaultMessage: 'Footer note' })}
            value={footerNote}
            onChange={(event) => setFooterNote(event.target.value)}
            multiline
            minRows={2}
          />

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }} gap={2}>
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingEmails.amountOff', defaultMessage: 'Discount amount (USD)' })}
              type="number"
              value={amountOff}
              inputProps={{ min: 0.01, step: 0.01 }}
              onChange={(event) => setAmountOff(event.target.value)}
            />
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingEmails.minimumAmount', defaultMessage: 'Minimum spend (USD)' })}
              type="number"
              value={minimumAmount}
              inputProps={{ min: 0, step: 0.01 }}
              onChange={(event) => setMinimumAmount(event.target.value)}
            />
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingEmails.expiresAt', defaultMessage: 'Expires at' })}
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap={2}>
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingEmails.buttonLabel', defaultMessage: 'Product button label' })}
              value={buttonLabel}
              onChange={(event) => setButtonLabel(event.target.value)}
              placeholder={intl.formatMessage({ id: 'admin.marketingEmails.productButtonLabelPlaceholder', defaultMessage: 'View item and claim coupon' })}
            />
            <TextField
              label={intl.formatMessage({ id: 'admin.marketingEmails.claimButtonLabel', defaultMessage: 'Coupon claim button label' })}
              value={claimButtonLabel}
              onChange={(event) => setClaimButtonLabel(event.target.value)}
              placeholder={intl.formatMessage({ id: 'admin.marketingEmails.buttonLabelPlaceholder', defaultMessage: 'Claim coupon' })}
            />
          </Box>

          <Autocomplete
            value={null}
            options={itemOptions}
            loading={marketLoading}
            getOptionDisabled={(option) => selectedSkuIds.has(option.skuId)}
            getOptionLabel={(option) => intl.formatMessage(
              {
                id: 'admin.marketingOffers.itemOption',
                defaultMessage: '{name} · {price} · stock {stock}{visibility}',
              },
              {
                name: option.name,
                price: formatUsdPrice(intl.locale, option.price),
                stock: getAvailableStock(option),
                visibility: option.visibleInMarket === false
                  ? intl.formatMessage({ id: 'admin.marketingOffers.hiddenListingSuffix', defaultMessage: ' · hidden' })
                  : '',
              },
            )}
            onChange={(_, value) => addItem(value)}
            inputValue={itemQuery}
            onInputChange={(_, value) => setItemQuery(value)}
            renderInput={(params) => (
              <TextField
                {...params}
                label={intl.formatMessage({ id: 'admin.marketingEmails.addItem', defaultMessage: 'Add related market item' })}
                placeholder={intl.formatMessage({ id: 'admin.marketingEmails.itemPlaceholder', defaultMessage: 'Search market listings' })}
              />
            )}
          />

          {selectedItems.length > 0 && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><FormattedMessage id="admin.marketingOffers.table.item" defaultMessage="Item" /></TableCell>
                    <TableCell width={120}><FormattedMessage id="admin.marketingOffers.table.unit" defaultMessage="Unit" /></TableCell>
                    <TableCell width={140}><FormattedMessage id="checkout.quantity" defaultMessage="Quantity" /></TableCell>
                    <TableCell width={120}><FormattedMessage id="checkout.subtotal" defaultMessage="Subtotal" /></TableCell>
                    <TableCell width={56} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedItems.map((entry) => (
                    <TableRow key={entry.item.skuId} sx={{ verticalAlign: 'top' }}>
                      <TableCell>
                        <Stack spacing={1}>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{entry.item.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{entry.item.skuId}</Typography>
                          </Box>
                          <TextField
                            size="small"
                            label={intl.formatMessage({ id: 'admin.marketingEmails.itemHeadline', defaultMessage: 'Email headline' })}
                            value={entry.emailHeadline}
                            onChange={(event) => updateItemEmailField(entry.item.skuId, 'emailHeadline', event.target.value)}
                            placeholder={entry.item.name}
                          />
                          <TextField
                            size="small"
                            label={intl.formatMessage({ id: 'admin.marketingEmails.itemDescription', defaultMessage: 'Email description' })}
                            value={entry.emailDescription}
                            onChange={(event) => updateItemEmailField(entry.item.skuId, 'emailDescription', event.target.value)}
                            multiline
                            minRows={2}
                          />
                        </Stack>
                      </TableCell>
                      <TableCell>{formatUsdPrice(intl.locale, entry.item.price)}</TableCell>
                      <TableCell>
                        <Stack spacing={1}>
                          <TextField
                            size="small"
                            type="number"
                            value={entry.quantity}
                            inputProps={{ min: 1, max: getAvailableStock(entry.item) }}
                            onChange={(event) => updateItemQuantity(entry.item.skuId, Number(event.target.value))}
                          />
                          <TextField
                            size="small"
                            label={intl.formatMessage({ id: 'admin.marketingEmails.itemBadge', defaultMessage: 'Badge' })}
                            value={entry.emailBadge}
                            onChange={(event) => updateItemEmailField(entry.item.skuId, 'emailBadge', event.target.value)}
                          />
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack spacing={1}>
                          <Typography variant="body2">{formatUsdPrice(intl.locale, entry.item.price * entry.quantity)}</Typography>
                          <TextField
                            size="small"
                            label={intl.formatMessage({ id: 'admin.marketingEmails.itemImageUrl', defaultMessage: 'Email image URL' })}
                            value={entry.emailImageUrl}
                            onChange={(event) => updateItemEmailField(entry.item.skuId, 'emailImageUrl', event.target.value)}
                            InputProps={{
                              endAdornment: (
                                <Tooltip title={intl.formatMessage({ id: 'admin.marketingEmails.chooseMedia', defaultMessage: 'Choose from media library' })}>
                                  <IconButton
                                    size="small"
                                    edge="end"
                                    onClick={() => openMediaPicker({ type: 'item', skuId: entry.item.skuId })}
                                    aria-label={intl.formatMessage(
                                      { id: 'admin.marketingEmails.chooseItemMedia', defaultMessage: 'Choose media for {name}' },
                                      { name: entry.item.name },
                                    )}
                                  >
                                    <ImageIcon className="h-4 w-4" />
                                  </IconButton>
                                </Tooltip>
                              ),
                            }}
                          />
                          <TextField
                            size="small"
                            label={intl.formatMessage({ id: 'admin.marketingEmails.itemButtonLabel', defaultMessage: 'Item button' })}
                            value={entry.buttonLabel}
                            onChange={(event) => updateItemEmailField(entry.item.skuId, 'buttonLabel', event.target.value)}
                          />
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => setSelectedItems((current) => current.filter((item) => item.item.skuId !== entry.item.skuId))}>
                          <X className="h-4 w-4" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Box display="flex" justifyContent="space-between" gap={2} flexWrap="wrap" alignItems="center">
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    <FormattedMessage id="admin.marketingEmails.landingTitle" defaultMessage="Campaign landing page" />
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <FormattedMessage id="admin.marketingEmails.landingDescription" defaultMessage="Build the page that the coupon button opens." />
                  </Typography>
                </Box>
                <Box display="flex" gap={1} flexWrap="wrap">
                  {(Object.keys(landingSectionMessages) as MarketingEmailLandingSectionType[]).map((type) => (
                    <Button
                      key={type}
                      size="small"
                      variant="outlined"
                      startIcon={<Plus className="h-4 w-4" />}
                      onClick={() => setLandingSections((current) => [...current, createLandingSection(type, current.length)])}
                    >
                      {intl.formatMessage(landingSectionMessages[type])}
                    </Button>
                  ))}
                </Box>
              </Box>

              <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'minmax(0, 2fr) minmax(220px, 1fr)' }} gap={2}>
                <Box display="flex" gap={1} alignItems="flex-start">
                  <TextField
                    fullWidth
                    size="small"
                    label={intl.formatMessage({ id: 'admin.marketingEmails.landingHeroImageUrl', defaultMessage: 'Landing hero image URL' })}
                    value={heroImageUrl}
                    onChange={(event) => setHeroImageUrl(event.target.value)}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ImageIcon className="h-4 w-4" />}
                    onClick={() => openMediaPicker({ type: 'hero' })}
                    sx={{ mt: 0.25, whiteSpace: 'nowrap' }}
                  >
                    <FormattedMessage id="admin.marketingEmails.landingHeroMedia" defaultMessage="Upload/select image" />
                  </Button>
                </Box>
                <TextField
                  size="small"
                  label={intl.formatMessage({ id: 'admin.marketingEmails.landingHeroImageAlt', defaultMessage: 'Landing hero image alt' })}
                  value={heroImageAlt}
                  onChange={(event) => setHeroImageAlt(event.target.value)}
                />
              </Box>

              <Box display="grid" gridTemplateColumns={{ xs: '1fr', lg: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)' }} gap={2} alignItems="start">
                <Stack spacing={2}>
                  {landingSections.map((section, index) => (
                    <Paper key={section.id} variant="outlined" sx={{ p: 2 }}>
                      <Stack spacing={2}>
                        <Box display="flex" justifyContent="space-between" gap={1} alignItems="center" flexWrap="wrap">
                          <Chip
                            size="small"
                            label={intl.formatMessage(landingSectionMessages[section.type])}
                          />
                          <Box>
                            <Tooltip title={intl.formatMessage({ id: 'admin.marketingEmails.moveSectionUp', defaultMessage: 'Move section up' })}>
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={index === 0}
                                  onClick={() => moveLandingSection(section.id, -1)}
                                  aria-label={intl.formatMessage({ id: 'admin.marketingEmails.moveSectionUp', defaultMessage: 'Move section up' })}
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title={intl.formatMessage({ id: 'admin.marketingEmails.moveSectionDown', defaultMessage: 'Move section down' })}>
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={index === landingSections.length - 1}
                                  onClick={() => moveLandingSection(section.id, 1)}
                                  aria-label={intl.formatMessage({ id: 'admin.marketingEmails.moveSectionDown', defaultMessage: 'Move section down' })}
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <IconButton size="small" onClick={() => setLandingSections((current) => current.filter((entry) => entry.id !== section.id))}>
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </Box>
                        </Box>
                        <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '180px 1fr' }} gap={2}>
                          <TextField
                            size="small"
                            label={intl.formatMessage({ id: 'admin.marketingEmails.landingEyebrow', defaultMessage: 'Section eyebrow' })}
                            value={section.eyebrow || ''}
                            onChange={(event) => updateLandingSection(section.id, 'eyebrow', event.target.value)}
                          />
                          <TextField
                            size="small"
                            label={intl.formatMessage({ id: 'admin.marketingEmails.landingSectionTitle', defaultMessage: 'Section title' })}
                            value={section.title || ''}
                            onChange={(event) => updateLandingSection(section.id, 'title', event.target.value)}
                          />
                        </Box>
                        <TextField
                          size="small"
                          label={intl.formatMessage({ id: 'admin.marketingEmails.landingBody', defaultMessage: 'Section body' })}
                          value={section.body || ''}
                          onChange={(event) => updateLandingSection(section.id, 'body', event.target.value)}
                          multiline
                          minRows={2}
                        />

                        {section.type === 'benefits' ? (
                          <Stack spacing={1}>
                            {(section.items || []).map((item) => (
                              <Box key={item.id} display="grid" gridTemplateColumns={{ xs: '1fr', md: 'minmax(0, 0.8fr) minmax(0, 1.2fr) auto' }} gap={1}>
                                <TextField
                                  size="small"
                                  label={intl.formatMessage({ id: 'admin.marketingEmails.landingCardTitle', defaultMessage: 'Card title' })}
                                  value={item.title}
                                  onChange={(event) => updateLandingSectionItem(section.id, item.id, 'title', event.target.value)}
                                />
                                <TextField
                                  size="small"
                                  label={intl.formatMessage({ id: 'admin.marketingEmails.landingCardBody', defaultMessage: 'Card body' })}
                                  value={item.body}
                                  onChange={(event) => updateLandingSectionItem(section.id, item.id, 'body', event.target.value)}
                                />
                                <IconButton size="small" onClick={() => removeLandingBenefitItem(section.id, item.id)}>
                                  <X className="h-4 w-4" />
                                </IconButton>
                              </Box>
                            ))}
                            <Button size="small" variant="text" onClick={() => addLandingBenefitItem(section.id)}>
                              <FormattedMessage id="admin.marketingEmails.landingAddCard" defaultMessage="Add card" />
                            </Button>
                          </Stack>
                        ) : null}

                        {section.type === 'product_group' ? (
                          <Stack spacing={1}>
                            <Typography variant="caption" color="text.secondary">
                              <FormattedMessage id="admin.marketingEmails.landingProductSelection" defaultMessage="Products shown in this section" />
                            </Typography>
                            <Box display="flex" gap={1} flexWrap="wrap">
                              {selectedItems.map((entry) => (
                                <FormControlLabel
                                  key={entry.item.skuId}
                                  control={(
                                    <Checkbox
                                      checked={(section.itemSkuIds || []).includes(entry.item.skuId)}
                                      onChange={(event) => toggleLandingSectionSku(section.id, entry.item.skuId, event.target.checked)}
                                    />
                                  )}
                                  label={entry.emailHeadline || entry.item.name}
                                />
                              ))}
                            </Box>
                            <TextField
                              size="small"
                              label={intl.formatMessage({ id: 'admin.marketingEmails.landingSectionButton', defaultMessage: 'Section button label' })}
                              value={section.buttonLabel || ''}
                              onChange={(event) => updateLandingSection(section.id, 'buttonLabel', event.target.value)}
                            />
                          </Stack>
                        ) : null}

                        {section.type === 'media_text' ? (
                          <Stack spacing={2}>
                            <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr auto 180px' }} gap={1} alignItems="start">
                              <TextField
                                size="small"
                                label={intl.formatMessage({ id: 'admin.marketingEmails.landingImageUrl', defaultMessage: 'Section image URL' })}
                                value={section.imageUrl || ''}
                                onChange={(event) => updateLandingSection(section.id, 'imageUrl', event.target.value)}
                              />
                              <Tooltip title={intl.formatMessage({ id: 'admin.marketingEmails.chooseMedia', defaultMessage: 'Choose from media library' })}>
                                <IconButton onClick={() => openMediaPicker({ type: 'landing', sectionId: section.id })}>
                                  <ImageIcon className="h-4 w-4" />
                                </IconButton>
                              </Tooltip>
                              <FormControl size="small">
                                <InputLabel id={`landing-image-side-${section.id}`}>
                                  <FormattedMessage id="admin.marketingEmails.landingImageSide" defaultMessage="Image side" />
                                </InputLabel>
                                <Select
                                  labelId={`landing-image-side-${section.id}`}
                                  label={intl.formatMessage({ id: 'admin.marketingEmails.landingImageSide', defaultMessage: 'Image side' })}
                                  value={section.imageSide || 'right'}
                                  onChange={(event) => updateLandingSection(section.id, 'imageSide', event.target.value)}
                                >
                                  <MenuItem value="left"><FormattedMessage id="common.left" defaultMessage="Left" /></MenuItem>
                                  <MenuItem value="right"><FormattedMessage id="common.right" defaultMessage="Right" /></MenuItem>
                                </Select>
                              </FormControl>
                            </Box>
                            <TextField
                              size="small"
                              label={intl.formatMessage({ id: 'admin.marketingEmails.landingImageAlt', defaultMessage: 'Section image alt' })}
                              value={section.imageAlt || ''}
                              onChange={(event) => updateLandingSection(section.id, 'imageAlt', event.target.value)}
                            />
                          </Stack>
                        ) : null}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>

                <Paper variant="outlined" sx={{ overflow: 'hidden', bgcolor: 'background.default' }}>
                  <Box
                    sx={{
                      minHeight: 220,
                      p: 3,
                      backgroundImage: heroImageUrl ? `linear-gradient(90deg, rgba(0,0,0,0.72), rgba(0,0,0,0.24)), url(${heroImageUrl})` : 'linear-gradient(135deg, #101827, #1f2937)',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      color: 'white',
                    }}
                  >
                    <Typography variant="overline">{eyebrow || brandLabel}</Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>{title}</Typography>
                    <Typography variant="body2" sx={{ mt: 1, maxWidth: 520 }}>{subtitle || preheader}</Typography>
                    <Chip sx={{ mt: 2, bgcolor: 'white', color: 'text.primary' }} label={`-${formatUsdPrice(intl.locale, Number(amountOff) || 0)}`} />
                  </Box>
                  <Stack spacing={2} p={2}>
                    {landingSections.map((section) => (
                      <Box key={`preview-${section.id}`} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
                        <Typography variant="caption" color="text.secondary">{section.eyebrow}</Typography>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{section.title || intl.formatMessage(landingSectionMessages[section.type])}</Typography>
                        {section.body ? <Typography variant="body2" color="text.secondary">{section.body}</Typography> : null}
                        {section.type === 'benefits' ? (
                          <Box display="grid" gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap={1} mt={1}>
                            {(section.items || []).slice(0, 3).map((item) => (
                              <Box key={item.id} sx={{ border: '1px solid', borderColor: 'divider', p: 1 }}>
                                <Typography variant="caption" sx={{ fontWeight: 700 }}>{item.title || '-'}</Typography>
                              </Box>
                            ))}
                          </Box>
                        ) : null}
                        {section.type === 'product_group' ? (
                          <Typography variant="caption" color="text.secondary">
                            {(section.itemSkuIds || []).length || selectedItems.length} <FormattedMessage id="admin.marketingEmails.landingProducts" defaultMessage="products" />
                          </Typography>
                        ) : null}
                      </Box>
                    ))}
                  </Stack>
                </Paper>
              </Box>
            </Stack>
          </Paper>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '220px 220px minmax(0, 1fr)' }} gap={2}>
            <FormControl>
              <InputLabel id="marketing-email-audience-label">
                <FormattedMessage id="admin.marketingEmails.audience" defaultMessage="Audience" />
              </InputLabel>
              <Select
                labelId="marketing-email-audience-label"
                label={intl.formatMessage({ id: 'admin.marketingEmails.audience', defaultMessage: 'Audience' })}
                value={audience}
                onChange={(event) => setAudience(event.target.value as 'selected_users' | 'marketing_consent')}
              >
                <MenuItem value="selected_users">
                  <FormattedMessage id="admin.marketingEmails.audience.selectedUsers" defaultMessage="Selected users" />
                </MenuItem>
                <MenuItem value="marketing_consent">
                  <FormattedMessage id="admin.marketingEmails.audience.marketingConsent" defaultMessage="All opted-in users" />
                </MenuItem>
              </Select>
            </FormControl>
            <FormControl>
              <InputLabel id="marketing-email-audience-locale-label">
                <FormattedMessage id="admin.marketingEmails.audienceLocale" defaultMessage="Audience language" />
              </InputLabel>
              <Select
                labelId="marketing-email-audience-locale-label"
                label={intl.formatMessage({ id: 'admin.marketingEmails.audienceLocale', defaultMessage: 'Audience language' })}
                value={audienceLocale}
                onChange={(event) => setAudienceLocale(event.target.value as MarketingEmailAudienceLocale)}
              >
                {Object.entries(audienceLocaleMessages).map(([value, descriptor]) => (
                  <MenuItem key={value} value={value}>
                    {intl.formatMessage(descriptor)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Autocomplete
              multiple
              value={selectedUsers}
              disabled={audience !== 'selected_users'}
              options={(usersData?.users || []).filter((user) => !selectedUserIds.has(user.id))}
              loading={usersLoading}
              getOptionLabel={(option) => `${option.email}${option.name ? ` (${option.name})` : ''}`}
              onChange={(_, value) => setSelectedUsers(value)}
              inputValue={userQuery}
              onInputChange={(_, value) => setUserQuery(value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={intl.formatMessage({ id: 'admin.marketingEmails.recipients', defaultMessage: 'Recipients' })}
                  placeholder={intl.formatMessage({ id: 'admin.marketingEmails.userPlaceholder', defaultMessage: 'email, name, or user ID' })}
                />
              )}
            />
          </Box>

          <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
            <Typography variant="body2">
              <FormattedMessage
                id="admin.marketingEmails.relatedSubtotal"
                defaultMessage="Related items subtotal {amount}"
                values={{ amount: formatUsdPrice(intl.locale, subtotal) }}
              />
            </Typography>
            <Typography variant="body2">
              <FormattedMessage
                id="admin.marketingEmails.couponSummary"
                defaultMessage="Coupon -{amount}, minimum spend {minimum}"
                values={{
                  amount: formatUsdPrice(intl.locale, Number(amountOff) || 0),
                  minimum: formatUsdPrice(intl.locale, Number(minimumAmount) || 0),
                }}
              />
            </Typography>
            <FormControlLabel
              control={<Checkbox checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} />}
              label={intl.formatMessage({ id: 'admin.marketingEmails.sendNow', defaultMessage: 'Send email now' })}
            />
            <Button
              variant="contained"
              startIcon={creating ? <CircularProgress size={16} /> : <Plus className="h-4 w-4" />}
              onClick={() => void createCampaign()}
              disabled={creating}
            >
              <FormattedMessage id="admin.marketingEmails.createCampaign" defaultMessage="Create campaign" />
            </Button>
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
        <Stack spacing={2}>
          <Box display="flex" gap={2} alignItems="center" justifyContent="space-between" flexWrap="wrap">
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              <FormattedMessage id="admin.marketingEmails.recentCampaigns" defaultMessage="Recent campaigns" />
            </Typography>
            <Box display="flex" gap={1}>
              <TextField
                size="small"
                placeholder={intl.formatMessage({ id: 'admin.marketingEmails.searchCampaigns', defaultMessage: 'Search campaigns' })}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Tooltip title={intl.formatMessage({ id: 'common.refresh', defaultMessage: 'Refresh' })}>
                <IconButton onClick={() => void mutate()}>
                  <RefreshCw className="h-4 w-4" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          <Divider />

          {campaignsLoading ? (
            <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><FormattedMessage id="admin.marketingEmails.table.campaign" defaultMessage="Campaign" /></TableCell>
                    <TableCell><FormattedMessage id="admin.marketingEmails.table.template" defaultMessage="Template" /></TableCell>
                    <TableCell><FormattedMessage id="orders.status" defaultMessage="Status" /></TableCell>
                    <TableCell><FormattedMessage id="admin.marketingEmails.table.value" defaultMessage="Value" /></TableCell>
                    <TableCell><FormattedMessage id="admin.marketingEmails.table.recipients" defaultMessage="Recipients" /></TableCell>
                    <TableCell><FormattedMessage id="marketingOffer.expires" defaultMessage="Expires" /></TableCell>
                    <TableCell align="right"><FormattedMessage id="admin.marketingOffers.table.actions" defaultMessage="Actions" /></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(campaignsData?.campaigns || []).map((campaign) => (
                    <TableRow key={campaign.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{campaign.title}</Typography>
                        <Typography variant="caption" color="text.secondary">{campaign.subject || campaign.id}</Typography>
                      </TableCell>
                      <TableCell>{intl.formatMessage(getTemplateMessage(campaign.template))}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={getCampaignStatusColor(campaign.status)}
                          label={intl.formatMessage(getCampaignStatusMessage(campaign.status))}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">-{formatUsdPrice(intl.locale, campaign.amountOff)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          <FormattedMessage
                            id="admin.marketingEmails.minimumShort"
                            defaultMessage="Min {amount}"
                            values={{ amount: formatUsdPrice(intl.locale, campaign.minimumAmount) }}
                          />
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{campaign.recipientCount}</Typography>
                        {campaign.recipients?.some((recipient) => recipient.claimedAt) && (
                          <Typography variant="caption" color="text.secondary">
                            <FormattedMessage
                              id="admin.marketingEmails.claimedCount"
                              defaultMessage="{count} claimed"
                              values={{ count: campaign.recipients.filter((recipient) => recipient.claimedAt).length }}
                            />
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{new Date(campaign.expiresAt).toLocaleString(intl.locale)}</TableCell>
                      <TableCell align="right">
                        <Tooltip title={intl.formatMessage({ id: 'admin.marketingEmails.preview', defaultMessage: 'Preview email' })}>
                          <IconButton size="small" onClick={() => void openPreview(campaign)}>
                            <Eye className="h-4 w-4" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={intl.formatMessage({ id: 'admin.marketingEmails.copyFirstLink', defaultMessage: 'Copy first product link' })}>
                          <IconButton size="small" onClick={() => void copyFirstClaimLink(campaign)}>
                            <Copy className="h-4 w-4" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={intl.formatMessage({ id: 'admin.marketingEmails.send', defaultMessage: 'Send campaign' })}>
                          <span>
                            <IconButton
                              size="small"
                              disabled={campaign.status === 'canceled' || campaign.status === 'expired' || actionLoadingId === `${campaign.id}:send`}
                              onClick={() => void postCampaignAction(campaign, 'send')}
                            >
                              {actionLoadingId === `${campaign.id}:send` ? <CircularProgress size={16} /> : <Send className="h-4 w-4" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={intl.formatMessage({ id: 'admin.marketingEmails.cancel', defaultMessage: 'Cancel campaign' })}>
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              disabled={campaign.status === 'canceled' || actionLoadingId === `${campaign.id}:cancel`}
                              onClick={() => void postCampaignAction(campaign, 'cancel')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </Paper>

      <Dialog open={Boolean(previewCampaignId)} onClose={() => setPreviewCampaignId(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          <FormattedMessage id="admin.marketingEmails.preview" defaultMessage="Preview email" />
        </DialogTitle>
        <DialogContent dividers>
          {previewLoading ? (
            <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box>
          ) : previewData ? (
            <Stack spacing={2}>
              <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr auto' }} gap={1} alignItems="center">
                <TextField
                  size="small"
                  label={intl.formatMessage({ id: 'admin.marketingEmails.previewRecipient', defaultMessage: 'Preview recipient' })}
                  value={previewRecipientEmail}
                  onChange={(event) => setPreviewRecipientEmail(event.target.value)}
                  type="email"
                />
                <Button
                  variant="outlined"
                  startIcon={previewSending ? <CircularProgress size={16} /> : <Send className="h-4 w-4" />}
                  onClick={() => void sendPreviewEmail()}
                  disabled={previewSending}
                >
                  <FormattedMessage id="admin.marketingEmails.sendPreview" defaultMessage="Send preview" />
                </Button>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  <FormattedMessage id="admin.marketingEmails.previewSubject" defaultMessage="Subject" />
                </Typography>
                <Typography variant="h6">{previewData.subject || previewData.title}</Typography>
              </Box>
              {previewData.preheader && (
                <Typography variant="body2" color="text.secondary">{previewData.preheader}</Typography>
              )}
              <Paper variant="outlined" sx={{ overflow: 'hidden', bgcolor: '#f5f5f5' }}>
                <Box
                  component="iframe"
                  title={intl.formatMessage({ id: 'admin.marketingEmails.previewFrameTitle', defaultMessage: 'Rendered email preview' })}
                  srcDoc={previewHtml}
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  sx={{
                    display: 'block',
                    width: '100%',
                    height: { xs: 640, md: 760 },
                    border: 0,
                    bgcolor: 'white',
                  }}
                />
              </Paper>
            </Stack>
          ) : null}
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
