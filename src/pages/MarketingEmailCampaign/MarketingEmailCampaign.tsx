import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useNavigate, useParams } from 'react-router';
import { CheckCircle2, ShoppingCart, Ticket } from 'lucide-react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { MarketingEmailCampaignItem, MarketingEmailCampaignResponse } from '@/types';
import { useAuthApi, useShipsData } from '@/hooks';
import { buildMarketCartItem } from '@/components/marketItemDisplay';
import MarketItemMedia from '@/pages/Market/components/MarketItemMedia';
import { formatUsdPrice } from '@/pages/Market/marketI18n';
const getOrCreateMarketingEmailCheckoutKey = (userId: string | undefined, campaignId: string) => {
  const storageKey = `marketing-email-campaign:checkout:${userId || 'anonymous'}:${campaignId}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;

  const key = crypto.randomUUID();
  window.sessionStorage.setItem(storageKey, key);
  return key;
};

const clearMarketingEmailCheckoutKey = (userId: string | undefined, campaignId: string) => {
  window.sessionStorage.removeItem(`marketing-email-campaign:checkout:${userId || 'anonymous'}:${campaignId}`);
};

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

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

function getSectionItems(allItems: MarketingEmailCampaignItem[], skuIds?: string[]) {
  if (!skuIds?.length) return allItems;
  const skuSet = new Set(skuIds);
  return allItems.filter((item) => skuSet.has(item.skuId));
}

export default function MarketingEmailCampaign() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { token = '' } = useParams();
  const { user } = useSelector((state: RootState) => state.user);
  const { data, error, isLoading, mutate } = useAuthApi<MarketingEmailCampaignResponse>(
    token ? `/api/marketing-email-campaigns/${encodeURIComponent(token)}` : null,
  );
  const { ships } = useShipsData();
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const campaign = data?.campaign;
  const cartItems = useMemo(() => {
    if (!campaign) return [];
    return campaign.items.map((item) => buildMarketCartItem({
      ...item,
      price: item.offerUnitPrice,
    }, item.quantity, ships));
  }, [campaign, ships]);
  const claimable = Boolean(campaign && campaign.status !== 'canceled' && campaign.status !== 'expired' && !campaign.coupon);
  const claimed = Boolean(campaign?.coupon);
  const campaignClosed = campaign?.status === 'canceled' || campaign?.status === 'expired';

  const handleClaim = async () => {
    if (!token || !campaign) return false;

    setClaiming(true);
    setClaimError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/marketing-email-campaigns/${encodeURIComponent(token)}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });
      const result = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        const errorMessage = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
          ? result.error
          : intl.formatMessage({
            id: 'marketingEmail.claimError',
            defaultMessage: 'Failed to claim this coupon.',
          });
        throw new Error(errorMessage);
      }

      if (!result || typeof result !== 'object' || !('campaign' in result)) {
        throw new Error(intl.formatMessage({
          id: 'marketingEmail.claimError',
          defaultMessage: 'Failed to claim this coupon.',
        }));
      }

      const claimResult = result as MarketingEmailCampaignResponse;
      await mutate(claimResult, { revalidate: false });
      return claimResult.campaign;
    } catch (error) {
      setClaimError(error instanceof Error
        ? error.message
        : intl.formatMessage({ id: 'marketingEmail.claimError', defaultMessage: 'Failed to claim this coupon.' }));
      return null;
    } finally {
      setClaiming(false);
    }
  };

  const handleCheckoutRecommended = async () => {
    if (!campaign || campaignClosed || !cartItems.length) {
      navigate('/market');
      return;
    }

    let checkoutCampaign = campaign;
    if (!claimed && claimable) {
      const claimedCampaign = await handleClaim();
      if (!claimedCampaign) {
        return;
      }
      checkoutCampaign = claimedCampaign;
    }

    const couponId = checkoutCampaign.coupon?.id || '';
    if (!couponId) {
      setClaimError(intl.formatMessage({
        id: 'marketingEmail.claimBeforeCheckout',
        defaultMessage: 'Claim the coupon before checking out.',
      }));
      return;
    }

    setCheckingOut(true);
    setClaimError(null);
    const idempotencyKey = getOrCreateMarketingEmailCheckoutKey(user.id, campaign.id);
    try {
      const response = await fetch(`${API_BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          items: cartItems.map((item) => ({
            skuId: item.skuId,
            quantity: item.quantity,
          })),
          selectedCouponId: couponId,
        }),
      });

      const result = await response.json().catch(() => null);
      clearMarketingEmailCheckoutKey(user.id, campaign.id);
      if (!response.ok) {
        throw new Error(result?.error || `HTTP error ${response.status}`);
      }

      if (typeof result?.url === 'string' && result.url) {
        window.location.href = result.url;
      } else {
        throw new Error('Checkout session URL not found');
      }
    } catch (error) {
      setClaimError(error instanceof Error
        ? error.message
        : intl.formatMessage({ id: 'checkout.createOrderError', defaultMessage: 'Failed to create checkout order.' }));
    } finally {
      setCheckingOut(false);
    }
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="70vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !campaign) {
    return (
      <Box maxWidth={760} mx="auto" p={3}>
        <Alert severity="error">
          <FormattedMessage id="marketingEmail.notFound" defaultMessage="This marketing email link is unavailable or not assigned to your account." />
        </Alert>
      </Box>
    );
  }

  const productGrid = (items: MarketingEmailCampaignItem[]) => (
    <Box display="grid" gridTemplateColumns={{ xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }} gap={2}>
      {items.map((item) => (
        <Box
          key={item.skuId}
          component={Link}
          to={`/market/${encodeURIComponent(item.skuId)}?mec=${encodeURIComponent(token)}`}
          sx={{
            display: 'block',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            color: 'inherit',
            textDecoration: 'none',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <MarketItemMedia item={item} ships={ships} height={210} badgeText={formatUsdPrice(intl.locale, item.offerUnitPrice)} />
          <Box p={2}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{item.emailHeadline || item.name}</Typography>
            {item.emailDescription ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{item.emailDescription}</Typography>
            ) : null}
            <Box display="flex" justifyContent="space-between" gap={2} mt={2}>
              <Typography variant="body2">{formatUsdPrice(intl.locale, item.offerUnitPrice)}</Typography>
              <Typography variant="body2" color="text.secondary">x{item.quantity}</Typography>
            </Box>
          </Box>
        </Box>
      ))}
    </Box>
  );

  return (
    <Box textAlign="left">
      <Box
        sx={{
          minHeight: { xs: 520, md: 600 },
          display: 'flex',
          alignItems: 'end',
          backgroundImage: campaign.heroImageUrl
            ? `linear-gradient(90deg, rgba(6,10,18,0.88), rgba(6,10,18,0.36)), url(${campaign.heroImageUrl})`
            : 'linear-gradient(135deg, #07111f, #1f2937)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          color: 'white',
        }}
      >
        <Box width="100%" maxWidth={1180} mx="auto" px={{ xs: 2, md: 3 }} py={{ xs: 5, md: 7 }}>
          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'minmax(0, 1fr) 360px' }} gap={3} alignItems="end">
            <Box>
              <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.72)' }}>{campaign.eyebrow || campaign.brandLabel}</Typography>
              <Typography variant="h2" sx={{ fontWeight: 900, maxWidth: 760, fontSize: { xs: 40, md: 64 }, lineHeight: 1.02 }}>{campaign.title}</Typography>
              <Typography variant="h6" sx={{ mt: 2, maxWidth: 680, color: 'rgba(255,255,255,0.82)', whiteSpace: 'pre-line' }}>
                {campaign.subtitle || campaign.message || intl.formatMessage({
                  id: 'marketingEmail.defaultMessage',
                  defaultMessage: 'Claim this limited-time coupon and use it on eligible Citizens\' Hub market orders.',
                })}
              </Typography>
            </Box>
            <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.94)', color: 'text.primary', border: '1px solid rgba(255,255,255,0.4)' }}>
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Ticket className="h-4 w-4" />
                  <FormattedMessage id="checkout.couponSelect" defaultMessage="Coupon" />
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 900 }}>-{formatUsdPrice(intl.locale, campaign.amountOff)}</Typography>
                <Typography variant="body2" color="text.secondary">
                  <FormattedMessage
                    id="admin.marketingEmails.minimumShort"
                    defaultMessage="Min {amount}"
                    values={{ amount: formatUsdPrice(intl.locale, campaign.minimumAmount) }}
                  />
                  {' · '}
                  <FormattedMessage id="marketingOffer.expires" defaultMessage="Expires" /> {new Date(campaign.expiresAt).toLocaleString(intl.locale)}
                </Typography>
                {claimed && campaign.coupon ? (
                  <Alert severity="success" icon={<CheckCircle2 className="h-4 w-4" />}>
                    <FormattedMessage id="marketingEmail.claimed" defaultMessage="Coupon claimed. It will appear in checkout while eligible." />
                  </Alert>
                ) : null}
                {claimError && <Alert severity="error">{claimError}</Alert>}
                {campaign.status === 'canceled' || campaign.status === 'expired' ? (
                  <Alert severity="warning">
                    <FormattedMessage
                      id="marketingEmail.statusNotice"
                      defaultMessage="Campaign status: {status}"
                      values={{ status: intl.formatMessage(getCampaignStatusMessage(campaign.status)) }}
                    />
                  </Alert>
                ) : null}
                <Button
                  variant="contained"
                  size="large"
                  startIcon={claiming ? <CircularProgress size={16} /> : <Ticket className="h-4 w-4" />}
                  disabled={!claimable || claiming}
                  onClick={() => void handleClaim()}
                >
                  {campaign.claimButtonLabel || <FormattedMessage id="marketingEmail.claim" defaultMessage="Claim coupon" />}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={(claiming || checkingOut) ? <CircularProgress size={16} /> : <ShoppingCart className="h-4 w-4" />}
                  disabled={campaignClosed || claiming || checkingOut}
                  onClick={() => void handleCheckoutRecommended()}
                >
                  <FormattedMessage id="marketingEmail.checkoutRecommended" defaultMessage="Checkout recommended items" />
                </Button>
              </Stack>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box maxWidth={1180} mx="auto" px={{ xs: 2, md: 3 }} py={{ xs: 4, md: 6 }}>
        <Stack spacing={{ xs: 4, md: 6 }}>
          {campaign.message ? (
            <Box maxWidth={820}>
              <Typography variant="body1" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{campaign.message}</Typography>
            </Box>
          ) : null}

          {(campaign.landingSections || []).map((section) => {
            if (section.type === 'benefits') {
              return (
                <Box key={section.id}>
                  <Typography variant="overline" color="text.secondary">{section.eyebrow}</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900 }}>{section.title}</Typography>
                  {section.body ? <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>{section.body}</Typography> : null}
                  <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }} gap={2} mt={2}>
                    {(section.items || []).map((item) => (
                      <Box key={item.id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{item.title}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{item.body}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              );
            }

            if (section.type === 'media_text') {
              const imageFirst = section.imageSide === 'left';
              return (
                <Box
                  key={section.id}
                  display="grid"
                  gridTemplateColumns={{ xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}
                  gap={3}
                  alignItems="center"
                >
                  {section.imageUrl ? (
                    <Box sx={{ order: { xs: 0, md: imageFirst ? 0 : 1 } }}>
                      <Box component="img" src={section.imageUrl} alt={section.imageAlt || section.title || campaign.title} sx={{ width: '100%', display: 'block', border: '1px solid', borderColor: 'divider' }} />
                    </Box>
                  ) : null}
                  <Box>
                    <Typography variant="overline" color="text.secondary">{section.eyebrow}</Typography>
                    <Typography variant="h4" sx={{ fontWeight: 900 }}>{section.title}</Typography>
                    {section.body ? <Typography variant="body1" color="text.secondary" sx={{ mt: 1, whiteSpace: 'pre-line' }}>{section.body}</Typography> : null}
                  </Box>
                </Box>
              );
            }

            const sectionItems = getSectionItems(campaign.items, section.itemSkuIds);
            return (
              <Box key={section.id}>
                <Box display="flex" justifyContent="space-between" gap={2} flexWrap="wrap" alignItems="end" mb={2}>
                  <Box>
                    <Typography variant="overline" color="text.secondary">{section.eyebrow}</Typography>
                    <Typography variant="h4" sx={{ fontWeight: 900 }}>{section.title || campaign.sectionTitle}</Typography>
                    {section.body ? <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>{section.body}</Typography> : null}
                  </Box>
                  <Chip label={`${sectionItems.length} ${intl.formatMessage({ id: 'admin.marketingEmails.landingProducts', defaultMessage: 'products' })}`} />
                </Box>
                {productGrid(sectionItems)}
              </Box>
            );
          })}

          <Box>
            <Box display="flex" justifyContent="space-between" gap={2} flexWrap="wrap" alignItems="end" mb={2}>
              <Box>
                <Typography variant="overline" color="text.secondary">{campaign.sectionTitle || <FormattedMessage id="admin.marketingEmails.sectionTitle" defaultMessage="Product section title" />}</Typography>
                <Typography variant="h4" sx={{ fontWeight: 900 }}>
                  <FormattedMessage id="marketingEmail.recommendedProducts" defaultMessage="Recommended products" />
                </Typography>
                {campaign.sectionBody ? <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>{campaign.sectionBody}</Typography> : null}
              </Box>
            </Box>
            {productGrid(campaign.items)}
          </Box>

          {campaign.footerNote ? (
            <Typography variant="body2" color="text.secondary">{campaign.footerNote}</Typography>
          ) : null}
        </Stack>
      </Box>
    </Box>
  );
}
