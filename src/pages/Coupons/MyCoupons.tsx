import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import { ArrowLeft, CalendarClock, CheckCircle2, CircleDollarSign, ExternalLink, RefreshCw, ShoppingBag, TicketPercent } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useNavigate } from 'react-router';

import { useMyCoupons } from '@/hooks';
import type { UserCouponListItem, UserCouponStatus } from '@/types';
import { formatUsdPrice } from '@/pages/Market/marketI18n';

type CouponFilter = 'all' | UserCouponStatus;

const COUPON_FILTERS: CouponFilter[] = ['all', 'available', 'reserved', 'used', 'invalidated'];

const STATUS_COLOR: Record<UserCouponStatus, 'success' | 'default' | 'warning' | 'error' | 'info'> = {
  available: 'success',
  reserved: 'warning',
  used: 'default',
  invalidated: 'default',
};

function isReferralRewardCouponSource(source: string) {
  return source.startsWith('referral_reward_redeemed') || source.startsWith('referral_first_order_reward');
}

function getCouponSourceLabel(intl: ReturnType<typeof useIntl>, source: string) {
  if (source === 'new_user_signup') {
    return intl.formatMessage({
      id: 'coupons.source.newUserSignup',
      defaultMessage: 'New user coupon',
    });
  }

  if (source === 'referral_signup_coupon') {
    return intl.formatMessage({
      id: 'coupons.source.referralSignup',
      defaultMessage: 'Invitee welcome coupon',
    });
  }

  if (isReferralRewardCouponSource(source)) {
    return intl.formatMessage({
      id: 'coupons.source.referralReward',
      defaultMessage: 'Referral reward coupon',
    });
  }

  if (source === 'marketing_offer') {
    return intl.formatMessage({
      id: 'coupons.source.marketingOffer',
      defaultMessage: 'Exclusive offer coupon',
    });
  }

  return intl.formatMessage({
    id: 'coupons.source.general',
    defaultMessage: 'Coupon',
  });
}

function getCouponSourceDescription(intl: ReturnType<typeof useIntl>, source: string) {
  if (source === 'new_user_signup') {
    return intl.formatMessage({
      id: 'coupons.sourceDescription.newUserSignup',
      defaultMessage: 'Claimed from the market new-user offer.',
    });
  }

  if (source === 'referral_signup_coupon') {
    return intl.formatMessage({
      id: 'coupons.sourceDescription.referralSignup',
      defaultMessage: 'Granted after registering with an invitation code.',
    });
  }

  if (isReferralRewardCouponSource(source)) {
    return intl.formatMessage({
      id: 'coupons.sourceDescription.referralReward',
      defaultMessage: 'Redeemed from your referral reward balance.',
    });
  }

  if (source === 'marketing_offer') {
    return intl.formatMessage({
      id: 'coupons.sourceDescription.marketingOffer',
      defaultMessage: 'Claimed from a limited-time personal offer.',
    });
  }

  return intl.formatMessage({
    id: 'coupons.sourceDescription.general',
    defaultMessage: 'A shopping coupon for eligible Citizens Hub orders.',
  });
}

function getCouponStatusLabel(intl: ReturnType<typeof useIntl>, status: UserCouponStatus) {
  switch (status) {
    case 'available':
      return intl.formatMessage({ id: 'coupons.status.available', defaultMessage: 'Available' });
    case 'reserved':
      return intl.formatMessage({ id: 'coupons.status.reserved', defaultMessage: 'Reserved' });
    case 'used':
      return intl.formatMessage({ id: 'coupons.status.used', defaultMessage: 'Used' });
    case 'invalidated':
      return intl.formatMessage({ id: 'coupons.status.invalidated', defaultMessage: 'Unavailable' });
    default:
      return status;
  }
}

function getCouponFilterLabel(intl: ReturnType<typeof useIntl>, filter: CouponFilter) {
  if (filter === 'all') {
    return intl.formatMessage({ id: 'coupons.filter.all', defaultMessage: 'All' });
  }

  return getCouponStatusLabel(intl, filter);
}

function getCouponUsageLabel(intl: ReturnType<typeof useIntl>, coupon: UserCouponListItem) {
  const amountOff = formatUsdPrice(intl.locale, coupon.amountOff);
  if (coupon.minimumAmount <= 0) {
    return intl.formatMessage(
      {
        id: 'coupons.usage.noMinimum',
        defaultMessage: '{amountOff} off, no minimum spend',
      },
      {
        amountOff,
      },
    );
  }

  return intl.formatMessage(
    {
      id: 'coupons.usage.minimum',
      defaultMessage: '{amountOff} off orders over {minimumAmount}',
    },
    {
      amountOff,
      minimumAmount: formatUsdPrice(intl.locale, coupon.minimumAmount),
    },
  );
}

function formatCouponDate(intl: ReturnType<typeof useIntl>, value?: string | null) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString(intl.locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getCouponScopeLabel(intl: ReturnType<typeof useIntl>, coupon: UserCouponListItem) {
  if (!coupon.eligibleSkuIds.length) {
    return intl.formatMessage({
      id: 'coupons.scope.market',
      defaultMessage: 'Market orders',
    });
  }

  return intl.formatMessage(
    {
      id: 'coupons.scope.selectedItems',
      defaultMessage: '{count, plural, one {# selected item} other {# selected items}}',
    },
    {
      count: coupon.eligibleSkuIds.length,
    },
  );
}

function getFilterCount(summary: Record<UserCouponStatus, number>, total: number, filter: CouponFilter) {
  if (filter === 'all') {
    return total;
  }

  return summary[filter] || 0;
}

export default function MyCoupons() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { data, error, isLoading, mutate } = useMyCoupons();
  const [activeFilter, setActiveFilter] = useState<CouponFilter>('all');
  const coupons = useMemo(() => data?.coupons || [], [data?.coupons]);
  const summary = data?.summary || {
    total: 0,
    available: 0,
    reserved: 0,
    used: 0,
    invalidated: 0,
  };

  const filteredCoupons = useMemo(() => (
    activeFilter === 'all'
      ? coupons
      : coupons.filter((coupon) => coupon.status === activeFilter)
  ), [activeFilter, coupons]);

  const availableCouponValue = useMemo(() => (
    coupons
      .filter((coupon) => coupon.status === 'available')
      .reduce((sum, coupon) => sum + coupon.amountOff, 0)
  ), [coupons]);

  return (
    <Box
      sx={{
        position: 'absolute',
        top: '65px',
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'auto',
        bgcolor: 'background.default',
        textAlign: 'left',
      }}
    >
      <Box
        component="main"
        sx={{
          mx: 'auto',
          width: '100%',
          maxWidth: 1180,
          px: { xs: 2, md: 3 },
          py: { xs: 3, md: 4 },
        }}
      >
        <Stack spacing={3}>
          <Box>
            <Link to="/market">
              <ArrowLeft />
            </Link>
          </Box>
          <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
            <Box>
              <Typography component="h1" variant="h4" sx={{ fontWeight: 800, letterSpacing: 0 }}>
                <FormattedMessage id="coupons.title" defaultMessage="My coupons" />
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                onClick={() => void mutate()}
                startIcon={<RefreshCw size={16} />}
                sx={{ borderRadius: 0 }}
                variant="outlined"
              >
                <FormattedMessage id="common.refresh" defaultMessage="Refresh" />
              </Button>
              <Button
                onClick={() => navigate('/market')}
                startIcon={<ShoppingBag size={16} />}
                sx={{ borderRadius: 0 }}
                variant="contained"
              >
                <FormattedMessage id="coupons.shopNow" defaultMessage="Shop now" />
              </Button>
            </Stack>
          </Box>

          {error ? (
            <Alert severity="error">
              <FormattedMessage id="coupons.loadError" defaultMessage="Failed to load coupons." />
            </Alert>
          ) : null}

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '280px minmax(0, 1fr)' },
              gap: 2,
              alignItems: 'start',
              justifyItems: 'stretch',
            }}
          >
            <Stack spacing={2} sx={{ width: '100%' }}>
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 0, bgcolor: 'background.paper', p: 2 }}>
                <Stack spacing={2}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                    <Box sx={{ display: 'flex', width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 0, bgcolor: 'success.light', color: 'success.contrastText' }}>
                      <TicketPercent size={20} />
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        <FormattedMessage id="coupons.summary.available" defaultMessage="Available now" />
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 800 }}>
                        {summary.available}
                      </Typography>
                    </Box>
                  </Box>
                  <Divider />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      <FormattedMessage id="coupons.summary.value" defaultMessage="Available discount value" />
                    </Typography>
                    <Typography variant="h6" sx={{ mt: 0.25, fontWeight: 800 }}>
                      {formatUsdPrice(intl.locale, availableCouponValue) || '$0.00'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      <FormattedMessage id="coupons.summary.total" defaultMessage="Total coupons" />
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 0.25, fontWeight: 700 }}>
                      {summary.total}
                    </Typography>
                  </Box>
                </Stack>
              </Box>

              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 0, bgcolor: 'background.paper', p: 1 }}>
                <Stack spacing={0.75}>
                  {COUPON_FILTERS.map((filter) => {
                    const active = activeFilter === filter;
                    const count = getFilterCount(summary, summary.total, filter);

                    return (
                      <Button
                        key={filter}
                        color={active ? 'primary' : 'inherit'}
                        onClick={() => setActiveFilter(filter)}
                        sx={{
                          justifyContent: 'space-between',
                          borderRadius: 0,
                          px: 1.25,
                          textAlign: 'left',
                        }}
                        variant={active ? 'contained' : 'text'}
                      >
                        <span>{getCouponFilterLabel(intl, filter)}</span>
                        <span>{count}</span>
                      </Button>
                    );
                  })}
                </Stack>
              </Box>
            </Stack>

            <Box sx={{ minWidth: 0, width: '100%', justifySelf: 'stretch' }}>
              {isLoading ? (
                <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 0, bgcolor: 'background.paper', p: 5, textAlign: 'center', width: '100%' }}>
                  <CircularProgress size={28} />
                  <Typography color="text.secondary" sx={{ mt: 2 }}>
                    <FormattedMessage id="coupons.loading" defaultMessage="Loading coupons..." />
                  </Typography>
                </Box>
              ) : filteredCoupons.length ? (
                <Stack spacing={1.5} sx={{ width: '100%' }}>
                  {filteredCoupons.map((coupon) => {
                    const sourceLabel = getCouponSourceLabel(intl, coupon.source);
                    const sourceDescription = getCouponSourceDescription(intl, coupon.source);
                    const isAvailable = coupon.status === 'available';

                    return (
                      <Box
                        key={coupon.id}
                        sx={{
                          border: 1,
                          borderColor: isAvailable ? 'success.main' : 'divider',
                          borderRadius: 0,
                          bgcolor: 'background.paper',
                          overflow: 'hidden',
                          width: '100%',
                        }}
                      >
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', sm: '160px minmax(0, 1fr) auto' },
                            gap: { xs: 1.5, sm: 2 },
                            p: { xs: 2, sm: 2.25 },
                            alignItems: 'center',
                          }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="h4" sx={{ fontWeight: 900, lineHeight: 1, letterSpacing: 0 }}>
                              {formatUsdPrice(intl.locale, coupon.amountOff)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                              {coupon.minimumAmount <= 0 ? (
                                <FormattedMessage id="coupons.noMinimumShort" defaultMessage="No minimum" />
                              ) : (
                                <FormattedMessage
                                  id="coupons.minimumShort"
                                  defaultMessage="Over {minimumAmount}"
                                  values={{ minimumAmount: formatUsdPrice(intl.locale, coupon.minimumAmount) }}
                                />
                              )}
                            </Typography>
                          </Box>

                          <Box sx={{ minWidth: 0 }}>
                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.75 }}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                {sourceLabel}
                              </Typography>
                              <Chip
                                color={STATUS_COLOR[coupon.status]}
                                label={getCouponStatusLabel(intl, coupon.status)}
                                size="small"
                                sx={{ borderRadius: 0 }}
                                variant={isAvailable ? 'filled' : 'outlined'}
                              />
                            </Stack>
                            <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                              {sourceDescription}
                            </Typography>
                            <Stack direction="row" spacing={1.5} sx={{ mt: 1.25, flexWrap: 'wrap', rowGap: 0.75 }}>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, color: 'text.secondary', fontSize: 14 }}>
                                <CircleDollarSign size={16} />
                                <span>{getCouponUsageLabel(intl, coupon)}</span>
                              </Box>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, color: 'text.secondary', fontSize: 14 }}>
                                <CalendarClock size={16} />
                                <span>
                                  <FormattedMessage
                                    id="coupons.expiresAt"
                                    defaultMessage="Expires {date}"
                                    values={{ date: formatCouponDate(intl, coupon.expiresAt) }}
                                  />
                                </span>
                              </Box>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, color: 'text.secondary', fontSize: 14 }}>
                                <CheckCircle2 size={16} />
                                <span>{getCouponScopeLabel(intl, coupon)}</span>
                              </Box>
                            </Stack>
                          </Box>

                          {isAvailable ? (
                            <Button
                              endIcon={<ExternalLink size={15} />}
                              onClick={() => navigate('/market')}
                              size="small"
                              sx={{ borderRadius: 0 }}
                              variant="outlined"
                            >
                              <FormattedMessage id="coupons.useCoupon" defaultMessage="Use coupon" />
                            </Button>
                          ) : null}
                        </Box>
                        {(coupon.appliedAt || coupon.invalidatedAt || coupon.claimedAt) ? (
                          <Box sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover', px: { xs: 2, sm: 2.25 }, py: 1 }}>
                            <Typography color="text.secondary" variant="caption">
                              <FormattedMessage
                                id="coupons.timeline"
                                defaultMessage="Claimed {claimedAt}{usedAt}{unavailableAt}"
                                values={{
                                  claimedAt: formatCouponDate(intl, coupon.claimedAt),
                                  usedAt: coupon.appliedAt
                                    ? intl.formatMessage(
                                      { id: 'coupons.timeline.usedAt', defaultMessage: ' · Used {date}' },
                                      { date: formatCouponDate(intl, coupon.appliedAt) },
                                    )
                                    : '',
                                  unavailableAt: coupon.invalidatedAt
                                    ? intl.formatMessage(
                                      { id: 'coupons.timeline.unavailableAt', defaultMessage: ' · Unavailable {date}' },
                                      { date: formatCouponDate(intl, coupon.invalidatedAt) },
                                    )
                                    : '',
                                }}
                              />
                            </Typography>
                          </Box>
                        ) : null}
                      </Box>
                    );
                  })}
                </Stack>
              ) : (
                <Box
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 0,
                    bgcolor: 'background.paper',
                    p: { xs: 3, sm: 5 },
                    textAlign: 'center',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <TicketPercent size={34} />
                  <Typography variant="h6" sx={{ mt: 2, fontWeight: 800 }}>
                    <FormattedMessage id="coupons.emptyTitle" defaultMessage="No coupons here yet" />
                  </Typography>
                  <Button onClick={() => navigate('/market')} sx={{ mt: 2, borderRadius: 0 }} variant="contained">
                    <FormattedMessage id="coupons.browseMarket" defaultMessage="Browse market" />
                  </Button>
                </Box>
              )}
            </Box>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
