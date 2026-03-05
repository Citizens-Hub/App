import { useState, useMemo, useEffect, useCallback } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useParams, useNavigate, Link } from 'react-router';
import {
  TextField,
  InputAdornment,
  Typography,
  CircularProgress,
  Box,
  useMediaQuery,
  useTheme,
  IconButton
} from '@mui/material';
import { Search, InfoOutlined, ArrowBack, Timeline, BarChart, NotificationsActive, NotificationsNone } from '@mui/icons-material';
import { Helmet } from 'react-helmet';
import { useShipsData, usePriceHistoryData, useWatchlistData, useWarbondSubscription, useUserSession } from '@/hooks';
import { PriceHistoryEntity } from '@/types';
import { useApi } from '@/hooks/swr/useApi';
import { CcusData } from '@/types';
import AddToWatchlistButton from '@/components/AddToWatchlistButton';
import PriceHistoryChart from '@/components/PriceHistoryChart';
import { Button, Snackbar, Alert, Tooltip } from '@mui/material';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import BlankPageAd from '@/components/BlankPageAd';

// Generate URL-friendly slug from ship name
const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

export default function PriceHistory() {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { shipSlug } = useParams<{ shipSlug?: string }>();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShipId, setSelectedShipId] = useState<number | null>(null);
  const [mobileViewMode, setMobileViewMode] = useState<'timeline' | 'chart'>('timeline');

  // Fetch ships data
  const { ships, loading: shipsLoading, error: shipsError } = useShipsData();

  // Fetch price history data
  const { priceHistoryMap, loading: priceHistoryLoading, error: priceHistoryError, updatedAt } = usePriceHistoryData();

  // Fetch watchlist data
  const { isInWatchlist } = useWatchlistData();

  // Fetch subscription status
  const { isEnabled: isSubscribed, standardSkuShipIds, mutate: mutateSubscription } = useWarbondSubscription();
  const { data: userSession } = useUserSession();
  const { user } = useSelector((state: RootState) => state.user);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionSnackbar, setSubscriptionSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const isLoggedIn = !!user.token;
  const isEmailVerified = userSession?.user?.emailVerified ?? false;

  // Fetch CCU data to check if CCU is available
  const { data: ccusData } = useApi<CcusData>('/api/ccus');
  const ccus = ccusData?.data?.to?.ships || [];

  const loading = shipsLoading || priceHistoryLoading;
  const error = shipsError || priceHistoryError;
  const standardSkuShipIdSet = useMemo(() => new Set(standardSkuShipIds), [standardSkuShipIds]);

  // Filter ships based on search term
  const filteredShips = useMemo(() => {
    if (!ships) return [];

    // Filter out ships with price 0 and ships without price history
    let filtered = ships.filter(ship => {
      // Must have price > 1500
      if (ship.msrp <= 1500) return false;

      // Must have price history records (ship is available for sale)
      const priceHistory = priceHistoryMap[ship.id];
      if (!priceHistory || !priceHistory.history || priceHistory.history.length === 0) {
        return false;
      }

      return true;
    });

    if (searchTerm) {
      filtered = filtered.filter(ship =>
        ship.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ship.manufacturer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ship.type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort: watchlist ships first, then by price
    return filtered.sort((a, b) => {
      const aInWatchlist = isInWatchlist(a.id);
      const bInWatchlist = isInWatchlist(b.id);

      // If one is in watchlist and the other is not, put watchlist ship first
      if (aInWatchlist && !bInWatchlist) return -1;
      if (!aInWatchlist && bInWatchlist) return 1;

      // If both are in watchlist or both are not, sort by price
      return a.msrp - b.msrp;
    });
  }, [ships, searchTerm, priceHistoryMap, isInWatchlist]);

  // Find ship by slug
  const findShipBySlug = useCallback((slug: string | undefined): number | null => {
    if (!slug || !ships || ships.length === 0) return null;
    const ship = ships.find(s => generateSlug(s.name) === slug);
    return ship ? ship.id : null;
  }, [ships]);

  // Initialize selected ship from URL parameter
  useEffect(() => {
    if (!ships || ships.length === 0) return;

    if (shipSlug) {
      const shipId = findShipBySlug(shipSlug);
      if (shipId !== null) {
        // Only update if different to avoid unnecessary re-renders
        if (shipId !== selectedShipId) {
          setSelectedShipId(shipId);
        }
      } else {
        // If slug doesn't match any ship, navigate to base URL
        navigate('/price-history', { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipSlug, ships, findShipBySlug]);

  // Handle ship selection and update URL
  const handleShipSelect = (shipId: number | null) => {
    if (shipId === null) {
      setSelectedShipId(null);
      return;
    }

    if (shipSlug) {
      navigate('/price-history', { replace: true });
    }

    setSelectedShipId(shipId);
  };

  // Get selected ship
  const selectedShip = selectedShipId ? ships?.find(s => s.id === selectedShipId) : null;

  // Get price history for selected ship
  const selectedPriceHistory = selectedShipId ? priceHistoryMap[selectedShipId] : null;

  // Check if ship has CCU available
  // const hasCcuAvailable = (shipId: number) => {
  //   return ccus.some(ccu => ccu.id === shipId);
  // };

  // Get WB price if available
  const getWbPrice = (shipId: number) => {
    const ship = ships.find(s => s.id === shipId);
    if (!ship) return null;

    const ccu = ccus.find(c => c.id === shipId);
    if (ccu) {
      const wbSku = ccu.skus.find(sku => sku.price < ship.msrp && sku.available);
      return wbSku ? wbSku.price : null;
    }
    return null;
  };

  // Handle subscription toggle
  const updateSubscriptionSettings = async ({
    wbChanges,
    nextStandardSkuShipIds,
    successMessage,
    failedMessage,
  }: {
    wbChanges: boolean;
    nextStandardSkuShipIds: number[];
    successMessage: string;
    failedMessage: string;
  }) => {
    setSubscriptionLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/wb-subscription/settings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.token}`,
          },
          body: JSON.stringify({
            wbChanges,
            standardSkuShipIds: nextStandardSkuShipIds,
          }),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        await mutateSubscription((current) => {
          if (!current?.data) return current;

          return {
            ...current,
            data: {
              ...current.data,
              wbNotificationEnabled: wbChanges,
              wbChanges,
              standardSkuShipIds: nextStandardSkuShipIds,
              settings: {
                ...(current.data.settings || {}),
                wbChanges,
                standardSkuShipIds: nextStandardSkuShipIds,
              },
            },
          };
        }, { revalidate: false });
        await mutateSubscription();
        setSubscriptionSnackbar({
          open: true,
          message: successMessage,
          severity: 'success',
        });
      } else {
        setSubscriptionSnackbar({
          open: true,
          message: data.message || failedMessage,
          severity: 'error',
        });
      }
    } catch (error) {
      setSubscriptionSnackbar({
        open: true,
        message: intl.formatMessage({
          id: 'warbondSubscription.error',
          defaultMessage: 'An error occurred while updating subscription',
        }),
        severity: 'error',
      });
      console.error('Subscription error:', error);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleToggleSubscription = async () => {
    if (!isLoggedIn || !isEmailVerified) return;

    const isEnabling = !isSubscribed;
    await updateSubscriptionSettings({
      wbChanges: isEnabling,
      nextStandardSkuShipIds: standardSkuShipIds,
      successMessage: intl.formatMessage({
        id: isEnabling ? 'warbondSubscription.enableSuccess' : 'warbondSubscription.disableSuccess',
        defaultMessage: isEnabling ? 'Warbond subscription enabled' : 'Warbond subscription disabled',
      }),
      failedMessage: intl.formatMessage({
        id: isEnabling ? 'warbondSubscription.enableFailed' : 'warbondSubscription.disableFailed',
        defaultMessage: isEnabling ? 'Failed to enable subscription' : 'Failed to disable subscription',
      }),
    });
  };

  const handleToggleStandardSkuReminder = async (shipId: number, shipName: string) => {
    if (!isLoggedIn || !isEmailVerified) return;

    const isEnabledForShip = standardSkuShipIdSet.has(shipId);
    const nextStandardSkuShipIds = isEnabledForShip
      ? standardSkuShipIds.filter((id) => id !== shipId)
      : Array.from(new Set([...standardSkuShipIds, shipId])).sort((a, b) => a - b);

    await updateSubscriptionSettings({
      wbChanges: isSubscribed,
      nextStandardSkuShipIds,
      successMessage: intl.formatMessage(
        {
          id: isEnabledForShip
            ? 'warbondSubscription.standardSku.disableSuccess'
            : 'warbondSubscription.standardSku.enableSuccess',
          defaultMessage: isEnabledForShip
            ? 'Disabled standard SKU listing reminder for {shipName}'
            : 'Enabled standard SKU listing reminder for {shipName}',
        },
        { shipName }
      ),
      failedMessage: intl.formatMessage(
        {
          id: isEnabledForShip
            ? 'warbondSubscription.standardSku.disableFailed'
            : 'warbondSubscription.standardSku.enableFailed',
          defaultMessage: isEnabledForShip
            ? 'Failed to disable standard SKU listing reminder for {shipName}'
            : 'Failed to enable standard SKU listing reminder for {shipName}',
        },
        { shipName }
      ),
    });
  };

  if (loading) {
    return (
      <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 flex items-center justify-center'>
        <CircularProgress />
      </div>
    );
  }

  if (error) {
    return (
      <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 flex items-center justify-center'>
        <Typography color="error">{error}</Typography>
      </div>
    );
  }

  // Prepare SEO meta information
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const pageUrl = selectedShip
    ? `${baseUrl}/price-history/${generateSlug(selectedShip.name)}`
    : `${baseUrl}/price-history`;
  const currentPrice = selectedShip ? (selectedShip.msrp / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : null;

  const metaTitle = selectedShip
    ? `${selectedShip.name} Price History - Star Citizen Ship Prices | Citizens' Hub`
    : "Star Citizen Ship Price History - Track Ship Prices & Warbond Deals | Citizens' Hub";

  const metaDescription = selectedShip
    ? `Track the price history of ${selectedShip.name} (${selectedShip.manufacturer.name}) in Star Citizen. View current price ${currentPrice ? `(${currentPrice})` : ''}, historical price changes, warbond deals, and availability timeline.`
    : 'Browse and track price history for all Star Citizen ships. Monitor ship prices, warbond deals, and availability changes. Find the best deals on your favorite ships.';

  const metaImage = selectedShip?.medias?.productThumbMediumAndSmall || '';

  // Mobile view: full screen price history when ship is selected
  if (isMobile && selectedShipId) {
    return (
      <>
        <Helmet>
          <title>{metaTitle}</title>
          <meta name="description" content={metaDescription} />
          <meta name="keywords" content={`Star Citizen, ${selectedShip?.name}, ${selectedShip?.manufacturer.name}, ship price history, warbond, price tracking, Star Citizen ships`} />
          <meta property="og:title" content={metaTitle} />
          <meta property="og:description" content={metaDescription} />
          <meta property="og:url" content={pageUrl} />
          <meta property="og:type" content="website" />
          {metaImage && <meta property="og:image" content={metaImage} />}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={metaTitle} />
          <meta name="twitter:description" content={metaDescription} />
          {metaImage && <meta name="twitter:image" content={metaImage} />}
          <link rel="canonical" href={pageUrl} />
        </Helmet>
        <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 flex flex-col bg-white dark:bg-gray-900'>
          {/* Header with back button */}
          <div className='p-3 border-b border-gray-200 dark:border-gray-800'>
            {/* First row: Back button, Ship name, View toggle */}
            <div className='flex items-center gap-2'>
              <IconButton
                onClick={() => handleShipSelect(null)}
                aria-label={intl.formatMessage({ id: "priceHistory.back", defaultMessage: "Back" })}
                size="small"
                sx={{ flexShrink: 0 }}
              >
                <ArrowBack />
              </IconButton>
              <Typography variant="h6" className='truncate flex-1 min-w-0 text-left'>
                {selectedShip?.name}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                <IconButton
                  size="small"
                  onClick={() => setMobileViewMode('timeline')}
                  color={mobileViewMode === 'timeline' ? 'primary' : 'default'}
                  aria-label={intl.formatMessage({ id: "priceHistory.switchToTimelineView", defaultMessage: "Switch to timeline view" })}
                >
                  <Timeline fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => setMobileViewMode('chart')}
                  color={mobileViewMode === 'chart' ? 'primary' : 'default'}
                  aria-label={intl.formatMessage({ id: "priceHistory.switchToChartView", defaultMessage: "Switch to chart view" })}
                >
                  <BarChart fontSize="small" />
                </IconButton>
              </Box>
            </div>
            {/* Second row: Update time */}
            {updatedAt && (
              <div className='flex items-center justify-end mt-2'>
                <Typography variant="caption" className='text-gray-400 dark:text-gray-500'>
                  <FormattedMessage
                    id="priceHistory.dataUpdatedAt"
                    defaultMessage="Data updated at: {updatedAt}"
                    values={{
                      updatedAt: new Date(updatedAt).toLocaleString(intl.locale, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    }}
                  />
                </Typography>
              </div>
            )}
          </div>

          {/* Content area - Timeline or Chart based on view mode */}
          <>
            {mobileViewMode === 'timeline' ? (
              <div className='flex-1 overflow-y-auto p-4 flex flex-col gap-2'>
                <PriceHistoryTimeline 
                  history={selectedPriceHistory?.history || null} 
                  ariaLabel={intl.formatMessage({ id: "priceHistory.timeline.label", defaultMessage: "Price history timeline for {shipName}" }, { shipName: selectedShip?.name || '' })}
                />
              </div>
            ) : (
              <div className='flex-1 overflow-y-auto p-4 flex flex-col gap-2' role="figure" aria-label={intl.formatMessage({ id: "priceHistory.chart.label", defaultMessage: "Price history chart for {shipName}" }, { shipName: selectedShip?.name || '' })}>
                <PriceHistoryChart
                  history={selectedPriceHistory?.history || null}
                  currentMsrp={selectedShip?.msrp || 0}
                  shipName={selectedShip?.name || ''}
                />
              </div>
            )}
          </>
        </div>
        <Snackbar
          open={subscriptionSnackbar.open}
          autoHideDuration={6000}
          onClose={() => setSubscriptionSnackbar(prev => ({ ...prev, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSubscriptionSnackbar(prev => ({ ...prev, open: false }))}
            severity={subscriptionSnackbar.severity}
            sx={{ width: '100%' }}
          >
            {subscriptionSnackbar.message}
          </Alert>
        </Snackbar>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta name="keywords" content={selectedShip
          ? `Star Citizen, ${selectedShip.name}, ${selectedShip.manufacturer.name}, ship price history, warbond, price tracking, Star Citizen ships`
          : 'Star Citizen, ship price history, warbond deals, price tracking, Star Citizen ships, ship prices, CCU, Star Citizen marketplace'} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:type" content="website" />
        {metaImage && <meta property="og:image" content={metaImage} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDescription} />
        {metaImage && <meta name="twitter:image" content={metaImage} />}
        <link rel="canonical" href={pageUrl} />
      </Helmet>
      <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 flex flex-col md:flex-row'>
        {/* Left Panel - Ship List */}
        <div className='hidden'>
          {
            ships.map((ship) => (
              <Link to={`/price-history/${generateSlug(ship.name)}`} key={ship.id}>
                {ship.name}
              </Link>
            ))
          }
        </div>
        <div className={`w-full md:w-96 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full overflow-hidden ${isMobile && selectedShipId ? 'hidden' : ''}`}>
          <div className='p-4 border-b border-gray-200 dark:border-gray-800'>
            {/* <Typography variant="h6" className='mb-4'>
            <FormattedMessage id="priceHistory.title" defaultMessage="Price History" />
          </Typography> */}
            <TextField
              size="small"
              fullWidth
              placeholder={intl.formatMessage({ id: 'priceHistory.searchPlaceholder', defaultMessage: 'Search ships...' })}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: 0 }
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search fontSize="small" />
                    </InputAdornment>
                  ),
                }
              }}
            />
            <Box className="mt-3">
              <Button
                variant="outlined"
                color={isSubscribed ? "error" : "primary"}
                size="small"
                fullWidth
                onClick={handleToggleSubscription}
                disabled={subscriptionLoading || !isLoggedIn || !isEmailVerified}
                id="warbondSubscription.button"
                aria-label={isSubscribed ? intl.formatMessage({ id: "warbondSubscription.disable", defaultMessage: "Disable Subscription" }) : intl.formatMessage({ id: "warbondSubscription.enable", defaultMessage: "Enable Subscription" })}
              >
                {subscriptionLoading ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <FormattedMessage
                    id={isSubscribed ? 'warbondSubscription.disable' : 'warbondSubscription.enable'}
                    defaultMessage={isSubscribed ? 'Disable Subscription' : 'Enable Subscription'}
                  />
                )}
              </Button>
              <label htmlFor="warbondSubscription.button" className="text-gray-500 dark:text-gray-400 mt-2 text-xs text-left flex items-center gap-1">
                <FormattedMessage id="warbondSubscription.description"
                  defaultMessage="You will receive email notifications when warbonds are listed or removed."
                />
                <Tooltip
                  arrow
                  title={
                    <FormattedMessage
                      id="warbondSubscription.emailDeliveryDisclaimer"
                      defaultMessage="Email delivery may be affected by multiple factors and is not guaranteed."
                    />
                  }
                >
                  <InfoOutlined sx={{ fontSize: 14, cursor: 'help' }} />
                </Tooltip>
              </label>
              <Typography variant="caption" className="text-gray-500 dark:text-gray-400 mt-2 text-left block">
                <FormattedMessage
                  id="warbondSubscription.standardSku.selectedCount"
                  defaultMessage="Standard SKU reminder ships: {count}"
                  values={{ count: standardSkuShipIds.length }}
                />
              </Typography>
            </Box>
          </div>

          <div className='flex-1 overflow-y-auto' role="list" aria-label={intl.formatMessage({ id: "priceHistory.shipList", defaultMessage: "Ship list" })}>
            {filteredShips.map((ship) => {
              const wbPrice = getWbPrice(ship.id);
              const isStandardSkuReminderEnabled = standardSkuShipIdSet.has(ship.id);
              // const hasCcu = hasCcuAvailable(ship.id);

              return (
                <div
                  key={ship.id}
                  role="listitem"
                >
                  <div
                    role="button"
                    aria-label={intl.formatMessage({ id: "priceHistory.viewHistory", defaultMessage: "{shipName}'s price history" }, { shipName: ship.name })}
                    onClick={() => handleShipSelect(ship.id)}
                    className={`p-3 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-700 ${selectedShipId === ship.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  >
                    <div className='flex items-center gap-3'>
                      {ship.medias?.productThumbMediumAndSmall && (
                        <img
                          src={ship.medias.productThumbMediumAndSmall}
                          alt={ship.name}
                          className='w-16 h-16 object-cover rounded'
                        />
                      )}
                      <div className='flex-1 min-w-0'>
                        <div className='flex items-center gap-2 mb-1'>
                          {wbPrice && (
                            <span className='text-xs text-white bg-orange-400 rounded px-1'>WB</span>
                          )}
                          <Typography variant="body2" className='font-medium truncate'>
                            {ship.name}
                          </Typography>
                        </div>
                        <div className='text-gray-500 dark:text-gray-400 text-left text-sm'>
                          {ship.manufacturer.name}
                        </div>
                        <div className='flex items-center gap-2 mt-1'>
                          {wbPrice ? (
                            <>
                              <span className='text-sm text-gray-400 line-through'>
                                {(ship.msrp / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })}
                              </span>
                              <span className='text-sm text-blue-400 font-bold'>
                                {(wbPrice / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })}
                              </span>
                            </>
                          ) : (
                            <span className='text-sm text-blue-400 font-bold'>
                              {(ship.msrp / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })}
                            </span>
                          )}
                        </div>
                        {/* {!hasCcu && (
                      <Typography variant="caption" className='text-red-500 block mt-1'>
                        <FormattedMessage id="priceHistory.ccuUnavailable" defaultMessage="CCU Unavailable" />
                      </Typography>
                    )} */}
                      </div>
                      <div className='flex items-center gap-1'>
                        <Tooltip
                          arrow
                          title={intl.formatMessage(
                            {
                              id: isStandardSkuReminderEnabled
                                ? 'warbondSubscription.standardSku.disable'
                                : 'warbondSubscription.standardSku.enable',
                              defaultMessage: isStandardSkuReminderEnabled
                                ? 'Disable standard SKU listing reminder for {shipName}'
                                : 'Enable standard SKU listing reminder for {shipName}',
                            },
                            { shipName: ship.name }
                          )}
                        >
                          <span>
                            <IconButton
                              size="small"
                              color={isStandardSkuReminderEnabled ? 'primary' : 'default'}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleToggleStandardSkuReminder(ship.id, ship.name);
                              }}
                              disabled={subscriptionLoading || !isLoggedIn || !isEmailVerified}
                              aria-label={intl.formatMessage(
                                {
                                  id: isStandardSkuReminderEnabled
                                    ? 'warbondSubscription.standardSku.disable'
                                    : 'warbondSubscription.standardSku.enable',
                                  defaultMessage: isStandardSkuReminderEnabled
                                    ? 'Disable standard SKU listing reminder for {shipName}'
                                    : 'Enable standard SKU listing reminder for {shipName}',
                                },
                                { shipName: ship.name }
                              )}
                            >
                              {isStandardSkuReminderEnabled ? (
                                <NotificationsActive fontSize="small" />
                              ) : (
                                <NotificationsNone fontSize="small" />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <AddToWatchlistButton
                          shipId={ship.id}
                          shipName={ship.name}
                          size="small"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel - Price History Details */}
        <div className={`flex-1 flex flex-col overflow-hidden ${isMobile && selectedShipId ? 'hidden' : ''}`}>
          {selectedShip ? (
            <div className='flex flex-col h-full p-4'>
              {/* <Typography variant="h5" className='mb-2'>
              {selectedShip.name}
            </Typography>
            <Typography variant="body2" className='text-gray-500 dark:text-gray-400 mb-2'>
              {selectedShip.manufacturer.name}
            </Typography> */}
              <div className='flex items-center justify-end mb-4'>
                {updatedAt && (
                  <Typography variant="caption" className='text-gray-400 dark:text-gray-500'>
                    <FormattedMessage
                      id="priceHistory.dataUpdatedAt"
                      defaultMessage="Data updated at: {updatedAt}"
                      values={{
                        updatedAt: new Date(updatedAt).toLocaleString(intl.locale, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      }}
                    />
                  </Typography>
                )}
                {/* <AddToWatchlistButton
                shipId={selectedShip.id}
                shipName={selectedShip.name}
                size="small"
              /> */}
              </div>

              {/* Chart and Timeline - Side by side layout */}
              <div className='flex-1 flex flex-row gap-4 min-h-0 mt-4'>
                <div className='flex-[1] min-w-0 overflow-y-auto flex flex-col gap-2'>
                  <PriceHistoryTimeline 
                    history={selectedPriceHistory?.history || null} 
                    ariaLabel={intl.formatMessage({ id: 'priceHistory.timeline.label', defaultMessage: 'Price history timeline for {shipName}' }, { shipName: selectedShip.name })}
                  />
                </div>

                <div className='flex-[5] min-w-0 flex flex-col' role="figure" aria-label={intl.formatMessage({ id: 'priceHistory.chart.label', defaultMessage: 'Price history chart for {shipName}' }, { shipName: selectedShip.name })}>
                  <PriceHistoryChart history={selectedPriceHistory?.history || null} currentMsrp={selectedShip.msrp} shipName={selectedShip.name} />
                </div>
              </div>
            </div>
          ) : (
            <div className='flex flex-col items-center justify-between py-2 h-full'>
              <Typography variant="body1" className='text-gray-400'>
                <FormattedMessage id="priceHistory.selectShip" defaultMessage="Select a ship to view price history" />
              </Typography>
              <div className='w-full'>
                <BlankPageAd />
              </div>
              <div />
            </div>
          )}
        </div>
        <Snackbar
          open={subscriptionSnackbar.open}
          autoHideDuration={6000}
          onClose={() => setSubscriptionSnackbar(prev => ({ ...prev, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSubscriptionSnackbar(prev => ({ ...prev, open: false }))}
            severity={subscriptionSnackbar.severity}
            sx={{ width: '100%' }}
          >
            {subscriptionSnackbar.message}
          </Alert>
        </Snackbar>
      </div>
    </>
  );
}

// Price History Timeline Component
function PriceHistoryTimeline({ history, ariaLabel }: { history: PriceHistoryEntity['history'] | null; ariaLabel?: string }) {
  const intl = useIntl();

  // Helper function to check if edition indicates a discount version
  const isDiscountEdition = (edition?: string) => {
    if (!edition) return false;
    const lowerEdition = edition.toLowerCase();
    return lowerEdition.includes('warbond') ||
      lowerEdition.includes(' - wb') ||
      lowerEdition.includes('-wb') ||
      lowerEdition.endsWith(' - ') ||
      lowerEdition.includes('upgrade -');
  };

  // Helper function to get effective price for an entry
  const getEffectivePrice = (entry: PriceHistoryEntity['history'][0], allHistory: PriceHistoryEntity['history']) => {
    // If entry has msrp, use it
    if (entry.msrp !== undefined) {
      return entry.msrp;
    }

    // If this is a discount edition removal (change === '-' and edition indicates discount)
    if (entry.change === '-' && isDiscountEdition(entry.edition)) {
      // Use baseMsrp if available
      if (entry.baseMsrp !== undefined) {
        return entry.baseMsrp;
      }

      // Sort history by timestamp (newest first for easier lookup)
      const sortedHistory = [...allHistory].sort((a, b) => b.ts - a.ts);
      const currentIndex = sortedHistory.findIndex(e => e.ts === entry.ts && e.edition === entry.edition);

      if (currentIndex >= 0) {
        // First, look for a standard edition added after this removal (in the past, so earlier timestamp)
        // Since sortedHistory is newest first, we look at indices after currentIndex (older entries)
        for (let i = currentIndex + 1; i < sortedHistory.length; i++) {
          const laterEntry = sortedHistory[i];
          // If we find a standard edition addition after removal, that's the recovered price
          if (laterEntry.change === '+' &&
            laterEntry.msrp !== undefined &&
            !isDiscountEdition(laterEntry.edition) &&
            laterEntry.ts < entry.ts) {
            return laterEntry.baseMsrp || laterEntry.msrp;
          }
        }

        // If not found, look for the most recent standard edition before the discount was added
        // This represents the price before the discount was applied
        for (let i = currentIndex + 1; i < sortedHistory.length; i++) {
          const prevEntry = sortedHistory[i];
          if (prevEntry.change === '+' &&
            prevEntry.msrp !== undefined &&
            !isDiscountEdition(prevEntry.edition)) {
            return prevEntry.baseMsrp || prevEntry.msrp;
          }
        }
      }
    }

    return undefined;
  };

  if (!history || history.length === 0) {
    return (
      <Typography variant="body2" className='text-gray-400'>
        <FormattedMessage id="priceHistory.noHistory" defaultMessage="No price history available" />
      </Typography>
    );
  }

  // Sort history by timestamp (oldest first for counting)
  const sortedHistoryForCounting = [...history].sort((a, b) => a.ts - b.ts);

  // Calculate active SKU count after each entry
  const skuCountAfterEntry = new Map<number, number>();
  let activeSkuCount = 0;

  for (const entry of sortedHistoryForCounting) {
    if (entry.change === '+') {
      activeSkuCount++;
    } else if (entry.change === '-') {
      activeSkuCount = Math.max(0, activeSkuCount - 1);
    }
    // Store the count after processing this entry
    skuCountAfterEntry.set(entry.ts, activeSkuCount);
  }

  // Helper to check if ship is unavailable after a timestamp
  const isUnavailableAfter = (ts: number): boolean => {
    return (skuCountAfterEntry.get(ts) ?? 0) === 0;
  };

  // Sort history by timestamp (newest first)
  const sortedHistory = [...history].sort((a, b) => b.ts - a.ts);

  // Process entries to get effective prices and availability status
  const processedHistory = sortedHistory.map(entry => ({
    ...entry,
    effectiveMsrp: getEffectivePrice(entry, history),
    isUnavailable: isUnavailableAfter(entry.ts)
  }));

  return (
    <ul className='space-y-4 list-none' aria-label={ariaLabel}>
      {processedHistory.map((entry, index) => {
        type ProcessedEntry = PriceHistoryEntity['history'][0] & { effectiveMsrp?: number; isUnavailable?: boolean };
        const processedEntry = entry as ProcessedEntry;
        const displayPrice = processedEntry.effectiveMsrp ?? entry.msrp;
        const isUnavailable = processedEntry.isUnavailable ?? false;

        return (
          <li
            key={index}
            tabIndex={0}
            className={`border-l-2 pl-4 py-2 text-left ${entry.change === '+' ? 'border-green-500' : 'border-red-500'}`}
            aria-label={entry.change === '+' ? intl.formatMessage({ id: "priceHistory.timeline.entry.added", defaultMessage: "An {edition} sku for {price} was added on {date}" }, {
              edition: entry.edition, price: (displayPrice ? displayPrice / 100 : "unknown").toLocaleString(intl.locale, { style: 'currency', currency: 'USD' }), date: new Date(entry.ts).toLocaleDateString(intl.locale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit'
              })
            }) : intl.formatMessage({ id: "priceHistory.timeline.entry.removed", defaultMessage: "An {edition} sku was removed on {date}" }, {
              edition: entry.edition, date: new Date(entry.ts).toLocaleDateString(intl.locale, {
                year: 'numeric',
                month: 'long', day: 'numeric', hour: '2-digit'
              })
            })}
          >
            <div className='flex items-center gap-2' aria-hidden>
              <span
                className={`${entry.change === '+' ? 'text-green-500' : 'text-red-500'} text-left text-md font-bold -translate-y-[2px]`}
              >{entry.change}</span>
              <div className='font-medium text-left text-md'>
                {new Date(entry.ts).toLocaleDateString(intl.locale, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit'
                })}
              </div>
            </div>
            {entry.edition && (
              <div className='text-gray-600 dark:text-gray-300' aria-hidden>
                {entry.edition}
              </div>
            )}
            {
              entry.items && entry.items.length > 1 && entry.change === '+' && (
                <div className='text-gray-500 dark:text-gray-400 text-left text-sm mb-1' aria-hidden>
                  w/ {entry.items.slice(1).flatMap(item => item.title).join(', ')}
                </div>
              )
            }
            {displayPrice !== undefined && !isUnavailable && (
              <div className='font-bold text-blue-400 text-left text-md' aria-hidden>
                {(displayPrice / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })}
                {entry.baseMsrp && entry.baseMsrp !== displayPrice && (
                  <span className='text-gray-400 line-through ml-2'>
                    {(entry.baseMsrp / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })}
                  </span>
                )}
              </div>
            )}
            {/* {isUnavailable && entry.change === '-' && (
                <div className='text-gray-500 dark:text-gray-400 italic text-left text-md'>
                  <FormattedMessage id="priceHistory.allSkusRemoved" defaultMessage="All SKUs removed" />
                </div>
              )} */}
          </li>
        );
      })}
    </ul>
  );
}
