import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useNavigate, useParams } from 'react-router';
import { Lock, ShoppingCart } from 'lucide-react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { MarketingOfferResponse } from '@/types';
import { useAuthApi, useShipsData, useUserSession } from '@/hooks';
import { buildMarketCartItem } from '@/components/marketItemDisplay';
import MarketItemMedia from '@/pages/Market/components/MarketItemMedia';
import { formatUsdPrice } from '@/pages/Market/marketI18n';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
const DEFAULT_SERVICE_FEE = 0.99;

const marketingOfferStatusMessages: Record<string, { id: string; defaultMessage: string }> = {
  creating: { id: 'marketingOffer.status.creating', defaultMessage: 'Creating' },
  active: { id: 'marketingOffer.status.active', defaultMessage: 'Active' },
  failed: { id: 'marketingOffer.status.failed', defaultMessage: 'Failed' },
  canceled: { id: 'marketingOffer.status.canceled', defaultMessage: 'Canceled' },
  used: { id: 'marketingOffer.status.used', defaultMessage: 'Used' },
  expired: { id: 'marketingOffer.status.expired', defaultMessage: 'Expired' },
};

function getMarketingOfferStatusMessage(status: string) {
  return marketingOfferStatusMessages[status] || { id: 'marketingOffer.status.unknown', defaultMessage: 'Unknown' };
}

function getOrCreateOfferCheckoutKey(userId: string | undefined, offerId: string) {
  const storageKey = `marketing-offer:checkout:${userId || 'anonymous'}:${offerId}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;

  const key = crypto.randomUUID();
  window.sessionStorage.setItem(storageKey, key);
  return key;
}

function clearOfferCheckoutKey(userId: string | undefined, offerId: string) {
  window.sessionStorage.removeItem(`marketing-offer:checkout:${userId || 'anonymous'}:${offerId}`);
}

export default function MarketingOffer() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { token = '' } = useParams();
  const { user } = useSelector((state: RootState) => state.user);
  const { data, error, isLoading } = useAuthApi<MarketingOfferResponse>(
    token ? `/api/marketing-offers/${encodeURIComponent(token)}` : null,
  );
  const { data: userSession } = useUserSession();
  const { ships } = useShipsData();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const offer = data?.offer;
  const checkoutItems = useMemo(() => {
    if (!offer) return [];
    return offer.items.map((item) => buildMarketCartItem({
      ...item,
      price: item.offerUnitPrice,
    }, item.quantity, ships));
  }, [offer, ships]);
  const canCheckout = offer?.status === 'active' && userSession?.user?.emailVerified;
  const accountEmail = userSession?.user?.email?.trim() || user.email?.trim() || '';

  const handleCheckout = async () => {
    if (!offer || !checkoutItems.length) return;

    setSubmitting(true);
    setSubmitError(null);
    const idempotencyKey = getOrCreateOfferCheckoutKey(user.id, offer.id);

    try {
      const response = await fetch(`${API_BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          marketingOfferId: offer.id,
          items: checkoutItems.map((item) => ({
            skuId: item.skuId,
            quantity: item.quantity,
          })),
        }),
      });

      const result = await response.json().catch(() => null);
      clearOfferCheckoutKey(user.id, offer.id);
      if (!response.ok) {
        throw new Error(result?.error || `HTTP error ${response.status}`);
      }

      window.location.href = result.url;
    } catch (checkoutError) {
      setSubmitError(checkoutError instanceof Error
        ? checkoutError.message
        : intl.formatMessage({ id: 'marketingOffer.checkoutStartError', defaultMessage: 'Failed to start checkout.' }));
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="70vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !offer) {
    return (
      <Box maxWidth={760} mx="auto" p={3}>
        <Alert severity="error">
          <FormattedMessage id="marketingOffer.notFound" defaultMessage="This offer is unavailable or not assigned to your account." />
        </Alert>
      </Box>
    );
  }

  const isServiceFeeFree = offer.serviceFee <= 0;

  return (
    <Box maxWidth={1100} mx="auto" p={{ xs: 2, md: 3 }} textAlign='left'>
      <Stack spacing={2}>
        <Box
          sx={{
            borderColor: 'divider',
            borderRadius: 0,
            bgcolor: 'background.paper',
          }}
        >
          <Stack spacing={2}>
            <Box display="flex" justifyContent="space-between" gap={2} flexWrap="wrap">
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>{offer.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  <FormattedMessage
                    id="marketingOffer.boundNotice"
                    defaultMessage="This private offer is bound to your signed-in account and must be checked out as a bundle."
                  />
                </Typography>
              </Box>
              <Stack alignItems={{ xs: 'flex-start', md: 'flex-end' }} spacing={0.5}>
                <Typography variant="body2" color="text.secondary">
                  <FormattedMessage id="marketingOffer.expires" defaultMessage="Expires" />
                </Typography>
                <Typography variant="subtitle2">{new Date(offer.expiresAt).toLocaleString(intl.locale)}</Typography>
              </Stack>
            </Box>

            {offer.status !== 'active' && (
              <Alert severity={offer.status === 'used' ? 'info' : 'warning'}>
                <FormattedMessage
                  id="marketingOffer.statusNotice"
                  defaultMessage="Offer status: {status}"
                  values={{ status: intl.formatMessage(getMarketingOfferStatusMessage(offer.status)) }}
                />
              </Alert>
            )}

            {userSession?.user && !userSession.user.emailVerified && (
              <Alert severity="warning">
                <FormattedMessage id="marketingOffer.verifyEmailNotice" defaultMessage="Please verify your email before checkout." />
              </Alert>
            )}

            {submitError && <Alert severity="error">{submitError}</Alert>}
          </Stack>
        </Box>

        <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'minmax(0, 1fr) 360px' }} gap={2} alignItems="start">
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 0, bgcolor: 'background.paper', alignSelf: 'start' }}>
            {offer.items.map((item, index) => (
              <Box
                key={item.skuId}
                component={Link}
                to={`/market/${encodeURIComponent(item.skuId)}`}
                aria-label={intl.formatMessage(
                  { id: 'marketingOffer.openItemDetail', defaultMessage: 'Open {name} details' },
                  { name: item.name },
                )}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '220px minmax(0, 1fr)' },
                  borderTop: index === 0 ? 'none' : '1px solid',
                  borderColor: 'divider',
                  color: 'inherit',
                  textDecoration: 'none',
                  transition: 'background-color 0.15s ease',
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                }}
              >
                <Box
                  sx={{
                    borderRight: { xs: 'none', sm: '1px solid' },
                    borderBottom: { xs: '1px solid', sm: 'none' },
                    borderColor: 'divider',
                  }}
                >
                  <MarketItemMedia item={item} ships={ships} height={180} badgeText={`x${item.quantity}`} />
                </Box>
                <Box p={2}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>{item.name}</Typography>
                    {/* <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{item.skuId}</Typography> */}
                    <Box display="flex" gap={3} mt={2} flexWrap="wrap">
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          <FormattedMessage id="marketingOffer.unitPrice" defaultMessage="Unit price" />
                        </Typography>
                        <Typography variant="body2">{formatUsdPrice(intl.locale, item.offerUnitPrice)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          <FormattedMessage id="checkout.quantity" defaultMessage="Quantity" />
                        </Typography>
                        <Typography variant="body2">{item.quantity}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          <FormattedMessage id="marketingOffer.lineSubtotal" defaultMessage="Line subtotal" />
                        </Typography>
                        <Typography variant="body2">{formatUsdPrice(intl.locale, item.offerUnitPrice * item.quantity)}</Typography>
                      </Box>
                    </Box>
                  </Box>
              </Box>
            ))}
          </Box>

          <Box
            sx={{
              p: 3,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 0,
              bgcolor: 'background.paper',
              alignSelf: 'start',
            }}
          >
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
              <FormattedMessage id="checkout.summary" defaultMessage="Summary" />
            </Typography>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="body1">
                <FormattedMessage id="checkout.subtotal" defaultMessage="Subtotal" />
              </Typography>
              <Typography variant="body1" fontWeight="500">
                {formatUsdPrice(intl.locale, offer.subtotal)}
              </Typography>
            </Box>

            {offer.discountAmount > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="body1">
                  <FormattedMessage id="checkout.discountAmount" defaultMessage="Discount" />
                </Typography>
                <Typography variant="body1" fontWeight="500" color="success.main">
                  -{formatUsdPrice(intl.locale, offer.discountAmount)}
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                <FormattedMessage id="checkout.serviceFee" defaultMessage="Software Service Fee" />
              </Typography>
              <Typography variant="body2" fontWeight="500">
                {isServiceFeeFree && (
                  <Box component="span" sx={{ color: 'success.main' }}>
                    <FormattedMessage id="checkout.waived" defaultMessage="(waived)" />
                  </Box>
                )}
                {isServiceFeeFree ? (
                  <Box component="span" sx={{ textDecoration: 'line-through', ml: 1 }}>
                    {formatUsdPrice(intl.locale, DEFAULT_SERVICE_FEE)}
                  </Box>
                ) : (
                  <span>{formatUsdPrice(intl.locale, offer.serviceFee)}</span>
                )}
              </Typography>
            </Box>

            <Box sx={{ borderTop: '1px solid #e0e0e0', pt: 2, mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="body1" fontWeight="700">
                  <FormattedMessage id="checkout.total" defaultMessage="Total" />
                </Typography>
                <Typography variant="body1" fontWeight="700" color="primary">
                  {formatUsdPrice(intl.locale, offer.total)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  <span>*</span>
                  <span><FormattedMessage id="checkout.taxes" defaultMessage="Taxes not included" /></span>
                </Typography>
              </Box>
            </Box>

            <Alert severity="warning" sx={{ mt: 2, textAlign: 'left' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                <FormattedMessage
                  id="checkout.rsiGiftEmailNotice"
                  defaultMessage="Items will be delivered via RSI gift to the email address associated with your account at registration. Please make sure you can access that inbox."
                />
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                <FormattedMessage
                  id="checkout.currentAccountEmailLabel"
                  defaultMessage="Current account email:"
                />
                {' '}
                <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {accountEmail || intl.formatMessage({ id: 'common.notAvailable', defaultMessage: 'Not available' })}
                </Box>
              </Typography>
            </Alert>

            <Stack spacing={2} sx={{ mt: 2 }}>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                size="large"
                sx={{ textTransform: 'uppercase' }}
                startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : canCheckout ? <ShoppingCart className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                disabled={!canCheckout || submitting || offer.status !== 'active'}
                onClick={() => void handleCheckout()}
              >
                {submitting ? (
                  <FormattedMessage id="checkout.processing" defaultMessage="Processing..." />
                ) : (
                  <FormattedMessage id="marketingOffer.checkoutBundle" defaultMessage="Checkout bundle" />
                )}
              </Button>
              {!userSession?.user?.emailVerified && (
                <Button
                  variant="outlined"
                  fullWidth
                  sx={{ textTransform: 'uppercase' }}
                  onClick={() => navigate('/app-settings')}
                >
                  <FormattedMessage id="marketingOffer.verifyEmailAction" defaultMessage="Verify email" />
                </Button>
              )}
            </Stack>
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
