import { useState, useMemo, useEffect, useCallback } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useParams, useNavigate, Link } from 'react-router';
import {
  TextField,
  InputAdornment,
  Typography,
  CircularProgress,
  Box,
  FormControlLabel,
  Switch,
  useMediaQuery,
  useTheme,
  IconButton
} from '@mui/material';
import { Search, InfoOutlined, ArrowBack, Timeline, BarChart } from '@mui/icons-material';
import { Helmet } from 'react-helmet';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
  TooltipItem,
  TooltipModel
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';
import { useShipsData, usePriceHistoryData, useWatchlistData, useWarbondSubscription, useUserSession } from '@/hooks';
import { PriceHistoryEntity } from '@/types';
import { useApi } from '@/hooks/swr/useApi';
import { CcusData } from '@/types';
import AddToWatchlistButton from '@/components/AddToWatchlistButton';
import { Button, Snackbar, Alert, Tooltip } from '@mui/material';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import BlankPageAd from '@/components/BlankPageAd';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

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
  const { isEnabled: isSubscribed, mutate: mutateSubscription } = useWarbondSubscription();
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
  const handleToggleSubscription = async () => {
    if (!isLoggedIn || !isEmailVerified) return;

    setSubscriptionLoading(true);
    const isEnabling = !isSubscribed;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/wb-subscription/${isEnabling ? 'enable' : 'disable'}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        await mutateSubscription();
        setSubscriptionSnackbar({
          open: true,
          message: intl.formatMessage(
            {
              id: isEnabling ? 'warbondSubscription.enableSuccess' : 'warbondSubscription.disableSuccess',
              defaultMessage: isEnabling ? 'Warbond subscription enabled' : 'Warbond subscription disabled',
            }
          ),
          severity: 'success',
        });
      } else {
        setSubscriptionSnackbar({
          open: true,
          message: data.message || intl.formatMessage({
            id: isEnabling ? 'warbondSubscription.enableFailed' : 'warbondSubscription.disableFailed',
            defaultMessage: isEnabling ? 'Failed to enable subscription' : 'Failed to disable subscription',
          }),
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
                aria-label="back"
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
                  aria-label="timeline view"
                >
                  <Timeline fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => setMobileViewMode('chart')}
                  color={mobileViewMode === 'chart' ? 'primary' : 'default'}
                  aria-label="chart view"
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
          <div className='flex-1 overflow-y-auto p-4'>
            {mobileViewMode === 'timeline' ? (
              <PriceHistoryTimeline history={selectedPriceHistory?.history || null} />
            ) : (
              <PriceHistoryChart
                history={selectedPriceHistory?.history || null}
                currentMsrp={selectedShip?.msrp || 0}
                shipName={selectedShip?.name || ''}
              />
            )}
          </div>
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
              <div className="text-gray-500 dark:text-gray-400 mt-2 text-xs text-left flex items-center gap-1">
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
              </div>
            </Box>
          </div>

          <div className='flex-1 overflow-y-auto'>
            {filteredShips.map((ship) => {
              const wbPrice = getWbPrice(ship.id);
              // const hasCcu = hasCcuAvailable(ship.id);

              return (
                <div
                  key={ship.id}
                  role="button"
                  tabIndex={0}
                  aria-label={intl.formatMessage({ id: "priceHistory.selectShip", defaultMessage: "Select {shipName} to view price history" }, { shipName: ship.name })}
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
                    <AddToWatchlistButton
                      shipId={ship.id}
                      shipName={ship.name}
                      size="small"
                    />
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
                <div className='flex-[1] min-w-0 overflow-y-auto'>
                  <PriceHistoryTimeline history={selectedPriceHistory?.history || null} />
                </div>

                <div className='flex-[5] min-w-0 flex flex-col'>
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

// Price History Chart Component
function PriceHistoryChart({ history, currentMsrp, shipName }: { history: PriceHistoryEntity['history'] | null; currentMsrp: number; shipName: string }) {
  // Keep currentMsrp for potential future use (e.g., showing current price when no history)
  void currentMsrp;

  const intl = useIntl();
  const [isDarkMode, setIsDarkMode] = useState(() =>
    document.documentElement.classList.contains('dark')
  );
  const [useRealTimeScale, setUseRealTimeScale] = useState(false);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  const getEditionName = useCallback((edition: string, skuId: number) => {
    if (
      edition.toLowerCase().trim() === (shipName.toLowerCase().trim() + ' upgrade') ||
      edition.toLowerCase().includes('standard') ||
      edition.toLowerCase().trim() === (shipName.toLowerCase().trim() + ' - upgrade') ||
      edition.trim() === "Unknown"
    ) {
      return 'Standard (Sku:' + skuId.toString() + ")";
    }

    return "Warbond (Sku:" + skuId.toString() + ")";
  }, [shipName]);

  // Generate distinct colors for editions
  const getEditionColor = (_edition: string, index: number): string => {
    const standardColors = [
      'rgb(37, 99, 235)',     // blue-600 (deeper blue)
      // 'rgb(96, 165, 250)',    // blue-400 (lighter blue)
    ];

    const warbondColors = [
      'rgb(34, 197, 94)',     // green-500 (bright green)
      'rgb(249, 115, 22)',    // orange-500 (vibrant orange)
      'rgb(168, 85, 247)',    // purple-500 (vibrant purple)
      'rgb(239, 68, 68)',     // red-500 (bright red)
      'rgb(234, 179, 8)',     // yellow-500 (golden yellow)
      'rgb(236, 72, 153)',    // pink-500 (bright pink)
    ];

    if (_edition.includes('Standard')) {
      return standardColors[index % standardColors.length];
    }

    return warbondColors[index % warbondColors.length];
  };

  // Filter and sort history entries that have price data
  // Interface for edition period
  interface EditionPeriod {
    startTs: number;
    endTs: number | null; // null means still active
    price: number;
  }

  // Store period data for tooltip access
  const [periodData, setPeriodData] = useState<{
    editionPeriods: Map<string, EditionPeriod[]>;
    sortedTimestamps: number[];
  } | null>(null);

  const chartData = useMemo(() => {
    if (!history) return null;

    const now = Date.now();
    const sortedHistory = [...history].sort((a, b) => a.ts - b.ts);

    // Build periods for each edition: [startTs, endTs) - closed start, open end
    const editionPeriods = new Map<string, EditionPeriod[]>();
    const activeEditions = new Map<string, { startTs: number; price: number }>();

    // Process entries to build periods
    for (const entry of sortedHistory) {
      const edition = getEditionName(entry.edition || 'Unknown', entry.sku || 0);

      if (entry.change === '+') {
        const price = (entry.msrp ?? entry.baseMsrp ?? 0) / 100;
        // If this edition was already active, close the previous period first
        if (activeEditions.has(edition)) {
          const previous = activeEditions.get(edition)!;
          if (!editionPeriods.has(edition)) {
            editionPeriods.set(edition, []);
          }
          // End previous period just before new start (open interval)
          editionPeriods.get(edition)!.push({
            startTs: previous.startTs,
            endTs: entry.ts, // This will be excluded (open end)
            price: previous.price
          });
        }
        // Start new period
        activeEditions.set(edition, { startTs: entry.ts, price });
      } else if (entry.change === '-') {
        // Edition removed - close the period
        if (activeEditions.has(edition)) {
          const active = activeEditions.get(edition)!;
          if (!editionPeriods.has(edition)) {
            editionPeriods.set(edition, []);
          }
          // [start, end) - include start, exclude end
          editionPeriods.get(edition)!.push({
            startTs: active.startTs,
            endTs: entry.ts, // Removal timestamp (excluded from interval)
            price: active.price
          });
          activeEditions.delete(edition);
        }
      }
    }

    // Close remaining active editions (they continue to now)
    for (const [edition, active] of activeEditions.entries()) {
      if (!editionPeriods.has(edition)) {
        editionPeriods.set(edition, []);
      }
      editionPeriods.get(edition)!.push({
        startTs: active.startTs,
        endTs: null, // Still active
        price: active.price
      });
    }

    // Collect all unique timestamps needed for the chart
    // For [start, end) intervals, we need:
    // - start (included)
    // - end - 1ms (last valid point before end, if end > start + 1ms)
    // - end (excluded, will be null)
    const allTimestamps = new Set<number>();
    for (const periods of editionPeriods.values()) {
      for (const period of periods) {
        allTimestamps.add(period.startTs);
        if (period.endTs !== null) {
          // Add end - 1ms as the last valid point (included in [start, end))
          // Only add if it's different from startTs and >= startTs
          const lastValidTs = period.endTs - 1;
          if (lastValidTs >= period.startTs && lastValidTs !== period.startTs) {
            allTimestamps.add(lastValidTs);
          }
          // Add end point itself (will be null, excluded from interval)
          allTimestamps.add(period.endTs);
        } else {
          // Still active, add now as the latest point
          allTimestamps.add(now);
        }
      }
    }

    // Sort all timestamps
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    // Store period data for tooltip
    setPeriodData({ editionPeriods, sortedTimestamps });

    // Create labels from timestamps
    const labels = sortedTimestamps.map(ts =>
      new Date(ts).toLocaleDateString(intl.locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    );

    for (let i = labels.length - 1; i > 0; i--) {
      if (labels[i] === labels[i - 1]) {
        labels[i] = '';
      }
    }

    // Build datasets for each edition
    const editionArray = Array.from(editionPeriods.keys()).sort();

    const datasets: Array<{
      label: string;
      data: Array<number | null> | Array<{ x: number; y: number | null }>;
      borderColor: string;
      backgroundColor: string;
      fill: boolean;
      tension: number;
      pointRadius: number | Array<number>;
      pointHoverRadius: number | Array<number>;
      spanGaps: boolean;
    }> = [];

    editionArray.forEach((edition, index) => {
      const periods = editionPeriods.get(edition)!;

      if (useRealTimeScale) {
        // Time scale mode: use {x: timestamp, y: price} format
        const data: Array<{ x: number; y: number | null }> = [];

        for (const ts of sortedTimestamps) {
          let value: number | null = null;

          for (const period of periods) {
            if (period.endTs === null) {
              // Still active - include up to and including now (connect to today)
              if (ts >= period.startTs && ts <= now) {
                value = period.price;
                break;
              }
            } else {
              // Closed period - [start, end) interval (start included, end excluded)
              if (ts === period.endTs) {
                // This is the end point (excluded from interval)
                value = null;
                break;
              }
              // Check if timestamp is in [start, end) interval
              if (ts >= period.startTs && ts < period.endTs) {
                // This timestamp is within the interval (included)
                value = period.price;
                break;
              }
            }
          }

          data.push({ x: ts, y: value });
        }

        // Calculate pointRadius array: only show points at the start and end of each continuous segment
        const pointRadius: Array<number> = [];
        const pointHoverRadius: Array<number> = [];

        for (let i = 0; i < data.length; i++) {
          const currentValue = data[i].y;
          const prevValue = i > 0 ? data[i - 1].y : null;
          const nextValue = i < data.length - 1 ? data[i + 1].y : null;

          // Show point if:
          // 1. Current point has a value (not null)
          // 2. It's the start of a segment (prev is null, current is not null)
          // 3. It's the end of a segment (current is not null, next is null)
          // 4. It's a single point segment (prev is null, current is not null, next is null)
          if (currentValue !== null) {
            const isStartOfSegment = prevValue === null;
            const isEndOfSegment = nextValue === null;

            if (isStartOfSegment || isEndOfSegment) {
              pointRadius.push(4);
              pointHoverRadius.push(6);
            } else {
              pointRadius.push(0);
              pointHoverRadius.push(0);
            }
          } else {
            pointRadius.push(0);
            pointHoverRadius.push(0);
          }
        }

        datasets.push({
          label: edition,
          data,
          borderColor: getEditionColor(getEditionName(edition, 0), index),
          backgroundColor: getEditionColor(edition, index).replace('rgb', 'rgba').replace(')', ', 0.1)'),
          fill: true,
          tension: 0,
          pointRadius: pointRadius,
          pointHoverRadius: pointHoverRadius,
          spanGaps: false // Don't connect across null values
        });
      } else {
        // Category scale mode: use array format
        const data: Array<number | null> = [];

        for (const ts of sortedTimestamps) {
          let value: number | null = null;

          for (const period of periods) {
            if (period.endTs === null) {
              // Still active - include up to and including now (connect to today)
              if (ts >= period.startTs && ts <= now) {
                value = period.price;
                break;
              }
            } else {
              // Closed period - [start, end) interval (start included, end excluded)
              if (ts === period.endTs) {
                // This is the end point (excluded from interval)
                value = null;
                break;
              }
              // Check if timestamp is in [start, end) interval
              if (ts >= period.startTs && ts < period.endTs) {
                // This timestamp is within the interval (included)
                value = period.price;
                break;
              }
            }
          }

          data.push(value);
        }

        // Calculate pointRadius array: only show points at the start and end of each continuous segment
        const pointRadius: Array<number> = [];
        const pointHoverRadius: Array<number> = [];

        for (let i = 0; i < data.length; i++) {
          const currentValue = data[i];
          const prevValue = i > 0 ? data[i - 1] : null;
          const nextValue = i < data.length - 1 ? data[i + 1] : null;

          // Show point if:
          // 1. Current point has a value (not null)
          // 2. It's the start of a segment (prev is null, current is not null)
          // 3. It's the end of a segment (current is not null, next is null)
          // 4. It's a single point segment (prev is null, current is not null, next is null)
          if (currentValue !== null) {
            const isStartOfSegment = prevValue === null;
            const isEndOfSegment = nextValue === null;

            if (isStartOfSegment || isEndOfSegment) {
              pointRadius.push(4);
              pointHoverRadius.push(6);
            } else {
              pointRadius.push(0);
              pointHoverRadius.push(0);
            }
          } else {
            pointRadius.push(0);
            pointHoverRadius.push(0);
          }
        }

        datasets.push({
          label: edition,
          data,
          borderColor: getEditionColor(getEditionName(edition, 0), index),
          backgroundColor: getEditionColor(edition, index).replace('rgb', 'rgba').replace(')', ', 0.1)'),
          fill: true,
          tension: 0,
          pointRadius: pointRadius,
          pointHoverRadius: pointHoverRadius,
          spanGaps: false // Don't connect across null values
        });
      }
    });

    return {
      labels: useRealTimeScale ? undefined : labels,
      datasets
    };
  }, [getEditionName, history, intl.locale, useRealTimeScale]);

  // Helper function to find period info for a data point
  const findPeriodForDataPoint = useCallback((
    dataIndex: number,
    datasetLabel: string,
    editionPeriods: Map<string, EditionPeriod[]>,
    sortedTimestamps: number[]
  ): EditionPeriod | null => {
    if (!periodData || dataIndex < 0 || dataIndex >= sortedTimestamps.length) {
      return null;
    }

    const timestamp = sortedTimestamps[dataIndex];
    const periods = editionPeriods.get(datasetLabel);

    if (!periods) {
      return null;
    }

    // Find the period that contains this timestamp
    for (const period of periods) {
      if (period.endTs === null) {
        // Still active - check if timestamp is within range
        if (timestamp >= period.startTs && timestamp <= Date.now()) {
          return period;
        }
      } else {
        // Closed period - [start, end) interval
        if (timestamp >= period.startTs && timestamp < period.endTs) {
          return period;
        }
      }
    }

    return null;
  }, [periodData]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: isDarkMode ? 'rgb(229, 231, 235)' : 'rgb(17, 24, 39)',
          usePointStyle: true,
          padding: 15,
          font: {
            size: 12
          }
        }
      },
      title: {
        display: true,
        text: intl.formatMessage({ id: 'priceHistory.chart.title', defaultMessage: 'Price Trend' }),
        color: isDarkMode ? 'rgb(229, 231, 235)' : 'rgb(17, 24, 39)',
        font: {
          size: 16,
          weight: 'bold' as const
        },
        padding: {
          top: 10,
          bottom: 20
        }
      },
      tooltip: {
        enabled: false,
        external: (context: { chart: ChartJS; tooltip: TooltipModel<'line'> }) => {
          // Tooltip element
          let tooltipEl = document.getElementById('chartjs-tooltip');

          // Create element on first render
          if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = 'chartjs-tooltip';
            tooltipEl.innerHTML = '<div class="chartjs-tooltip-content"></div>';
            document.body.appendChild(tooltipEl);
          }

          const tooltipModel = context.tooltip;

          // Hide if no tooltip
          if (tooltipModel.opacity === 0) {
            tooltipEl.style.opacity = '0';
            tooltipEl.style.pointerEvents = 'none';
            return;
          }

          // Get period data
          if (!periodData) {
            return;
          }

          const { editionPeriods, sortedTimestamps } = periodData;

          // Set caret position
          tooltipEl.classList.remove('above', 'below', 'no-transform');
          if (tooltipModel.yAlign) {
            tooltipEl.classList.add(tooltipModel.yAlign);
          } else {
            tooltipEl.classList.add('no-transform');
          }

          // Build tooltip content
          const contentDiv = tooltipEl.querySelector('.chartjs-tooltip-content') as HTMLElement;
          if (!contentDiv) return;

          let innerHtml = '';

          // Process each tooltip item
          if (tooltipModel.dataPoints && tooltipModel.dataPoints.length > 0) {
            const items = tooltipModel.dataPoints.filter((item: TooltipItem<'line'>) => item.parsed.y !== null);

            if (items.length > 0) {
              // Get timestamp from parsed data
              let dataIndex: number;
              let timestamp: number;

              if (useRealTimeScale) {
                // Time scale mode: get timestamp from parsed.x
                timestamp = items[0].parsed.x as number;
                // Find the index in sortedTimestamps
                dataIndex = sortedTimestamps.findIndex(ts => ts === timestamp);
                // If not found exactly, find the closest timestamp
                if (dataIndex === -1 && sortedTimestamps.length > 0) {
                  // Find the closest timestamp
                  let closestIndex = 0;
                  let minDiff = Math.abs(sortedTimestamps[0] - timestamp);
                  for (let i = 1; i < sortedTimestamps.length; i++) {
                    const diff = Math.abs(sortedTimestamps[i] - timestamp);
                    if (diff < minDiff) {
                      minDiff = diff;
                      closestIndex = i;
                    }
                  }
                  dataIndex = closestIndex;
                  timestamp = sortedTimestamps[dataIndex];
                }
              } else {
                // Category scale mode: use dataIndex
                dataIndex = items[0].dataIndex;
                if (dataIndex >= 0 && dataIndex < sortedTimestamps.length) {
                  timestamp = sortedTimestamps[dataIndex];
                } else {
                  return; // Invalid data index
                }
              }

              const titleLines = tooltipModel.title || [];

              // Add title (date)
              if (titleLines.length > 0) {
                innerHtml += `<div class="tooltip-title">${titleLines[0]}</div>`;
              }

              // Add each dataset's information
              for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const datasetLabel = item.dataset.label || '';
                const price = item.parsed.y;

                // Find period info
                const period = findPeriodForDataPoint(
                  dataIndex,
                  datasetLabel,
                  editionPeriods,
                  sortedTimestamps
                );

                const colors = tooltipModel.labelColors[i];
                const colorStyle = `background: ${colors.backgroundColor}; border-color: ${colors.borderColor}; border-width: 2px`;

                innerHtml += '<div class="tooltip-item">';
                innerHtml += `<span class="tooltip-color-box" style="${colorStyle}"></span>`;
                innerHtml += `<span class="tooltip-label">${datasetLabel}: `;
                innerHtml += `<span class="tooltip-price">${(price as number).toLocaleString(intl.locale, {
                  style: 'currency',
                  currency: 'USD'
                })}</span></span>`;

                if (history?.find(h => h.ts === period?.startTs)?.items && history.find(h => h.ts === period?.startTs)!.items!.length > 1)
                  innerHtml += `<span class="tooltip-items-value">w/ ${history.find(h => h.ts === period?.startTs)!.items!.slice(1).flatMap(item => item.title).join(', ')}</span>`;

                // Add start and end time if period found
                if (period) {
                  innerHtml += '<div class="tooltip-time-info">';

                  // Start time (listed time)
                  const startDate = new Date(period.startTs).toLocaleString(intl.locale, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  innerHtml += `<div class="tooltip-time-row">`;
                  innerHtml += `<span class="tooltip-time-label">${intl.formatMessage({ id: 'priceHistory.chart.listed', defaultMessage: 'Listed:' })}</span>`;
                  innerHtml += `<span class="tooltip-time-value">${startDate}</span>`;
                  innerHtml += `</div>`;

                  // End time (removed time)
                  if (period.endTs === null) {
                    innerHtml += `<div class="tooltip-time-row">`;
                    innerHtml += `<span class="tooltip-time-label">${intl.formatMessage({ id: 'priceHistory.chart.removed', defaultMessage: 'Removed:' })}</span>`;
                    innerHtml += `<span class="tooltip-time-value">${intl.formatMessage({ id: 'priceHistory.chart.currentlyAvailable', defaultMessage: 'Currently available' })}</span>`;
                    innerHtml += `</div>`;
                  } else {
                    const endDate = new Date(period.endTs).toLocaleString(intl.locale, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                    innerHtml += `<div class="tooltip-time-row">`;
                    innerHtml += `<span class="tooltip-time-label">${intl.formatMessage({ id: 'priceHistory.chart.removed', defaultMessage: 'Removed:' })}</span>`;
                    innerHtml += `<span class="tooltip-time-value">${endDate}</span>`;
                    innerHtml += `</div>`;
                  }

                  innerHtml += '</div>';
                }

                innerHtml += '</div>';
              }
            }
          }

          contentDiv.innerHTML = innerHtml;

          // Position tooltip
          const position = context.chart.canvas.getBoundingClientRect();
          const bodyFontSize = 12;
          const bodyFontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
          const bodyFontString = `${bodyFontSize}px ${bodyFontFamily}`;

          // Apply initial styles to measure tooltip size
          tooltipEl.style.opacity = '0';
          tooltipEl.style.position = 'absolute';
          tooltipEl.style.font = bodyFontString;
          tooltipEl.style.padding = (tooltipModel.options.padding || 12) + 'px';
          tooltipEl.style.pointerEvents = 'none';
          tooltipEl.style.backgroundColor = isDarkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)';
          tooltipEl.style.color = isDarkMode ? 'rgb(229, 231, 235)' : 'rgb(17, 24, 39)';
          tooltipEl.style.border = `1px solid ${isDarkMode ? 'rgb(75, 85, 99)' : 'rgb(229, 231, 235)'}`;
          tooltipEl.style.borderRadius = '6px';
          tooltipEl.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
          tooltipEl.style.zIndex = '1000';
          tooltipEl.style.maxWidth = '300px';

          // Temporarily position to measure
          tooltipEl.style.left = '-9999px';
          tooltipEl.style.top = '-9999px';

          // Get tooltip dimensions after rendering
          const tooltipRect = tooltipEl.getBoundingClientRect();
          const tooltipWidth = tooltipRect.width;
          const tooltipHeight = tooltipRect.height;

          // Calculate initial position (data point position)
          const dataPointX = position.left + window.scrollX + tooltipModel.caretX;
          const dataPointY = position.top + window.scrollY + tooltipModel.caretY;

          // Calculate offsets to avoid covering the data point
          const offsetX = 10; // Horizontal offset from data point
          const offsetY = 10; // Vertical offset from data point

          // Get viewport dimensions
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;

          // Determine horizontal position (left or right of data point)
          let left: number;
          const spaceOnRight = viewportWidth - dataPointX - offsetX;
          const spaceOnLeft = dataPointX - offsetX;

          if (spaceOnRight >= tooltipWidth) {
            // Enough space on the right, place tooltip to the right
            left = dataPointX + offsetX;
          } else if (spaceOnLeft >= tooltipWidth) {
            // Not enough space on right, but enough on left, place to the left
            left = dataPointX - tooltipWidth - offsetX;
          } else {
            // Not enough space on either side, center on data point
            left = dataPointX - tooltipWidth / 2;
            // Clamp to viewport boundaries
            left = Math.max(10, Math.min(left, viewportWidth - tooltipWidth - 10));
          }

          // Determine vertical position (above or below data point)
          let top: number;
          const spaceBelow = viewportHeight - dataPointY - offsetY;
          const spaceAbove = dataPointY - offsetY;

          if (spaceBelow >= tooltipHeight) {
            // Enough space below, place tooltip below
            top = dataPointY + offsetY;
          } else if (spaceAbove >= tooltipHeight) {
            // Not enough space below, but enough above, place above
            top = dataPointY - tooltipHeight - offsetY;
          } else {
            // Not enough space on either side, center on data point
            top = dataPointY - tooltipHeight / 2;
            // Clamp to viewport boundaries
            top = Math.max(10, Math.min(top, viewportHeight - tooltipHeight - 10));
          }

          // Apply final position
          tooltipEl.style.left = left + 'px';
          tooltipEl.style.top = top + 'px';
          tooltipEl.style.opacity = '1';
        }
      }
    },
    scales: {
      x: useRealTimeScale ? {
        type: 'time' as const,
        max: Date.now(),
        time: {
          unit: 'day' as const,
          displayFormats: {
            day: 'MMM d, yyyy'
          },
          tooltipFormat: 'MMM d, yyyy HH:mm'
        },
        grid: {
          color: isDarkMode ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.5)',
        },
        ticks: {
          color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          maxRotation: 45,
          minRotation: 45,
          font: {
            size: 11
          }
        }
      } : {
        grid: {
          color: isDarkMode ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.5)',
        },
        ticks: {
          color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          maxRotation: 45,
          minRotation: 45,
          font: {
            size: 11
          }
        }
      },
      y: {
        grid: {
          color: isDarkMode ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.5)',
        },
        ticks: {
          color: isDarkMode ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          callback: function (value: string | number) {
            return (value as number).toLocaleString(intl.locale, {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            });
          },
          font: {
            size: 11
          }
        },
        beginAtZero: true,
        grace: '15%'
      }
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false
    }
  }), [isDarkMode, intl, periodData, findPeriodForDataPoint, history, useRealTimeScale]);

  if (!chartData) {
    return null;
  }

  return (
    <>
      <style>{`
        #chartjs-tooltip {
          font-size: 12px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          max-width: 300px;
        }
        .chartjs-tooltip-content {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .tooltip-title {
          font-weight: bold;
          margin-bottom: 4px;
          padding-bottom: 4px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }
        .dark .tooltip-title {
          border-bottom-color: rgba(255, 255, 255, 0.1);
        }
        .tooltip-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .tooltip-item .tooltip-label {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .tooltip-color-box {
          display: inline-block;
          width: 12px;
          height: 12px;
          border-radius: 2px;
          flex-shrink: 0;
        }
        .tooltip-price {
          font-weight: 600;
        }
        .tooltip-time-info {
          margin-top: 4px;
          padding-top: 4px;
          border-top: 1px solid rgba(0, 0, 0, 0.1);
          font-size: 11px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .tooltip-items-value {
          font-size: 10px;
          color: rgba(0, 0, 0, 0.6);
        }
        .dark .tooltip-items-value {
          color: rgba(255, 255, 255, 0.6);
        }
        .dark .tooltip-time-info {
          border-top-color: rgba(255, 255, 255, 0.1);
        }
        .tooltip-time-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        .tooltip-time-label {
          color: rgba(0, 0, 0, 0.6);
          font-weight: 500;
        }
        .dark .tooltip-time-label {
          color: rgba(255, 255, 255, 0.6);
        }
        .tooltip-time-value {
          color: rgba(0, 0, 0, 0.8);
          text-align: right;
        }
        .dark .tooltip-time-value {
          color: rgba(255, 255, 255, 0.8);
        }
      `}</style>
      <Box className='h-full flex flex-col'>
        <Box className='bg-white dark:bg-gray-800 pb-4 pl-4 flex-1 flex flex-col'>
          <Box className='mb-2 flex justify-end'>
            <FormControlLabel
              control={
                <Switch
                  checked={useRealTimeScale}
                  onChange={(e) => setUseRealTimeScale(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                  <FormattedMessage
                    id="priceHistory.chart.realTimeScale"
                    defaultMessage="Real Time Scale"
                  />
                </Typography>
              }
            />
          </Box>
          <Box className='flex-1 min-h-0'>
            <Line data={chartData} options={chartOptions} />
          </Box>
        </Box>
      </Box>
    </>
  );
}

// Price History Timeline Component
function PriceHistoryTimeline({ history }: { history: PriceHistoryEntity['history'] | null }) {
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
    <div>
      <div className='space-y-4'>
        {processedHistory.map((entry, index) => {
          type ProcessedEntry = PriceHistoryEntity['history'][0] & { effectiveMsrp?: number; isUnavailable?: boolean };
          const processedEntry = entry as ProcessedEntry;
          const displayPrice = processedEntry.effectiveMsrp ?? entry.msrp;
          const isUnavailable = processedEntry.isUnavailable ?? false;

          return (
            <div
              key={index}
              className={`border-l-2 pl-4 py-2 text-left ${entry.change === '+' ? 'border-green-500' : 'border-red-500'}`}
            >
              <div className='flex items-center gap-2'>
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
                <div className='text-gray-600 dark:text-gray-300'>
                  {entry.edition}
                </div>
              )}
              {
                entry.items && entry.items.length > 1 && entry.change === '+' && (
                  <div className='text-gray-500 dark:text-gray-400 text-left text-sm mb-1'>
                    w/ {entry.items.slice(1).flatMap(item => item.title).join(', ')}
                  </div>
                )
              }
              {displayPrice !== undefined && !isUnavailable && (
                <div className='font-bold text-blue-400 text-left text-md'>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

