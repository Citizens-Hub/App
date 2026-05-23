import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Box,
  CircularProgress,
  Snackbar,
  Alert,
  FormControlLabel,
  Radio,
  RadioGroup,
  Badge,
  ButtonGroup,
  Chip,
  MenuItem,
  Button,
  Divider,
  TablePagination,
  Tooltip,
} from '@mui/material';
import { ContentCopy, Search } from '@mui/icons-material';
import { FormattedMessage, useIntl } from 'react-intl';
import CartDrawer from './components/CartDrawer';
import MarketItemMedia from './components/MarketItemMedia';
import {
  ListingItem,
  CartItem as CartItemType,
  MarketBrowseCategory,
  MarketItemType,
  MarketShipTraitFilter,
  MarketSortMode,
  Resource,
  NewUserCouponPreview,
} from '@/types';
import { Plus, ShoppingCart, Minus, X } from 'lucide-react';
import { useAccountMarketData, useAuthApi, useMarketData } from '@/hooks';
import { Link, useSearchParams } from 'react-router';
import { Helmet } from 'react-helmet';
import { useCartStore } from '@/hooks/useCartStore';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { buildMarketResource } from '@/components/marketItemDisplay';
import { getAbsoluteAssetUrl, getAccountMarketListPath, getMarketDetailUrl, getMarketListUrl } from '@/utils/marketLinks';
import {
  ACCOUNT_MARKET_COUPON_PERCENT_OFF,
  getMonthlyAccountCouponCode,
} from '@/utils/accountMarketCoupon';
import { getManufacturerLogoPath } from '@/data/rsiManufacturers';
import {
  getAvailableStock,
  getListingBasePrice,
  getListingDiscountPercent,
} from './marketUtils';
import {
  formatMarketDiscount,
  formatMarketPriceFrom,
  formatPackageContentsSummary,
  formatUsdPrice,
  getMarketBrowseCategoryLabel,
  getMarketItemTypeLabel,
} from './marketI18n';
import { getMarketItemDisplayName, getMarketItemSummary } from './marketDisplayI18n';
import { getMarketImageAssetUrl } from '@/utils/marketImages';

type MarketItemFilterOption = 'all' | MarketItemType | MarketBrowseCategory;

type MarketPageSearchState = {
  searchTerm: string;
  selectedItemFilter: MarketItemFilterOption;
  selectedShipTraitFilter: MarketShipTraitFilter | 'all';
  selectedManufacturerId: number | null;
  sortBy: MarketSortMode;
  page: number;
  rowsPerPage: number;
};

const MARKET_DEFAULT_ROWS_PER_PAGE = 12;
const MARKET_ROWS_PER_PAGE_OPTIONS = [12, 24, 36] as const;
const MARKET_SEARCH_DEBOUNCE_MS = 300;
const COUPON_COUNTDOWN_INTERVAL_MS = 1000;
const MARKET_SEARCH_PARAM_KEYS = ['search', 'itemType', 'browseCategory', 'tag', 'shipTrait', 'manufacturerId', 'sortBy', 'page', 'limit'] as const;
const VALID_MARKET_ITEM_TYPE_FILTERS = new Set<MarketItemType>(['ccu', 'credit']);
const VALID_MARKET_BROWSE_CATEGORY_FILTERS = new Set<MarketBrowseCategory>(['standalone_ship', 'ship_package', 'paint', 'other']);
const VALID_MARKET_SHIP_TRAIT_FILTERS = new Set<MarketShipTraitFilter>(['oc', 'non_oc', 'lti']);
const VALID_MARKET_SORT_MODES = new Set<MarketSortMode>(['recommended', 'newest', 'priceDesc', 'priceAsc']);

function formatCouponCountdown(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function parseMarketSearchParamList(searchParams: URLSearchParams, key: string): string[] {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseNonNegativeInteger(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseRowsPerPage(value: string | null): number {
  const parsed = Number.parseInt(value || '', 10);
  return MARKET_ROWS_PER_PAGE_OPTIONS.includes(parsed as typeof MARKET_ROWS_PER_PAGE_OPTIONS[number])
    ? parsed
    : MARKET_DEFAULT_ROWS_PER_PAGE;
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseMarketPageSearchState(searchParams: URLSearchParams): MarketPageSearchState {
  const itemTypeFilter = parseMarketSearchParamList(searchParams, 'itemType')
    .find((value): value is MarketItemType => VALID_MARKET_ITEM_TYPE_FILTERS.has(value as MarketItemType));
  const browseCategoryFilter = parseMarketSearchParamList(searchParams, 'browseCategory')
    .find((value): value is MarketBrowseCategory => VALID_MARKET_BROWSE_CATEGORY_FILTERS.has(value as MarketBrowseCategory));
  const shipTraitFilter = parseMarketSearchParamList(searchParams, 'shipTrait')
    .find((value): value is MarketShipTraitFilter => VALID_MARKET_SHIP_TRAIT_FILTERS.has(value as MarketShipTraitFilter));
  const sortByParam = searchParams.get('sortBy');
  const legacyOcTagSelected = parseMarketSearchParamList(searchParams, 'tag').includes('oc');

  return {
    searchTerm: searchParams.get('search') || '',
    selectedItemFilter: itemTypeFilter || browseCategoryFilter || 'all',
    selectedShipTraitFilter: shipTraitFilter || (legacyOcTagSelected ? 'oc' : 'all'),
    selectedManufacturerId: parsePositiveInteger(searchParams.get('manufacturerId')),
    sortBy: VALID_MARKET_SORT_MODES.has(sortByParam as MarketSortMode)
      ? sortByParam as MarketSortMode
      : 'recommended',
    page: parseNonNegativeInteger(searchParams.get('page'), 0),
    rowsPerPage: parseRowsPerPage(searchParams.get('limit')),
  };
}

function buildMarketPageSearchParams(currentSearchParams: URLSearchParams, state: MarketPageSearchState): URLSearchParams {
  const nextSearchParams = new URLSearchParams(currentSearchParams);

  MARKET_SEARCH_PARAM_KEYS.forEach((key) => {
    nextSearchParams.delete(key);
  });

  const trimmedSearch = state.searchTerm.trim();
  if (trimmedSearch) {
    nextSearchParams.set('search', trimmedSearch);
  }

  if (state.selectedItemFilter === 'ccu' || state.selectedItemFilter === 'credit') {
    nextSearchParams.set('itemType', state.selectedItemFilter);
  } else if (state.selectedItemFilter !== 'all') {
    nextSearchParams.set('browseCategory', state.selectedItemFilter);
  }

  if (state.selectedShipTraitFilter !== 'all') {
    nextSearchParams.set('shipTrait', state.selectedShipTraitFilter);
  }

  if (state.selectedManufacturerId) {
    nextSearchParams.set('manufacturerId', String(state.selectedManufacturerId));
  }

  if (state.sortBy !== 'recommended') {
    nextSearchParams.set('sortBy', state.sortBy);
  }

  if (state.page > 0) {
    nextSearchParams.set('page', String(state.page));
  }

  if (state.rowsPerPage !== MARKET_DEFAULT_ROWS_PER_PAGE) {
    nextSearchParams.set('limit', String(state.rowsPerPage));
  }

  return nextSearchParams;
}

const Market: React.FC = () => {
  const intl = useIntl();
  const { user } = useSelector((state: RootState) => state.user);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const lastCommittedSearchRef = useRef('');
  const [searchParams, setSearchParams] = useSearchParams();
  const { cart, cartOpen, addToCart, removeFromCart, openCart, closeCart, updateItemQuantity } = useCartStore();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  const [couponPopupDismissed, setCouponPopupDismissed] = useState(false);
  const [couponNow, setCouponNow] = useState(Date.now());
  // const [showAlert, setShowAlert] = useState(import.meta.env.VITE_PUBLIC_ENV !== 'development');
  const [showAlert, setShowAlert] = useState(false);
  const autoClaimAttemptedRef = useRef<string | null>(null);
  const { data: couponPreview, mutate: mutateCouponPreview } = useAuthApi<NewUserCouponPreview>(
    user.token ? '/api/user/new-user-coupon' : null,
  );
  const {
    searchTerm,
    selectedItemFilter,
    selectedShipTraitFilter,
    selectedManufacturerId,
    sortBy,
    page,
    rowsPerPage,
  } = useMemo(() => parseMarketPageSearchState(searchParams), [searchParams]);
  const [searchInput, setSearchInput] = useState(() => searchTerm);
  const showsShipTraitFilters = selectedItemFilter === 'all'
    || selectedItemFilter === 'standalone_ship'
    || selectedItemFilter === 'ship_package';
  const showsManufacturerFilter = showsShipTraitFilters || selectedItemFilter === 'ccu';
  const normalizedSearchParams = useMemo(() => buildMarketPageSearchParams(searchParams, {
    searchTerm,
    selectedItemFilter,
    selectedShipTraitFilter: showsShipTraitFilters ? selectedShipTraitFilter : 'all',
    selectedManufacturerId: showsManufacturerFilter ? selectedManufacturerId : null,
    sortBy,
    page,
    rowsPerPage,
  }), [
    page,
    rowsPerPage,
    searchParams,
    searchTerm,
    selectedManufacturerId,
    selectedItemFilter,
    selectedShipTraitFilter,
    showsManufacturerFilter,
    showsShipTraitFilters,
    sortBy,
  ]);

  useEffect(() => {
    if (normalizedSearchParams.toString() !== searchParams.toString()) {
      setSearchParams(normalizedSearchParams, { replace: true });
    }
  }, [normalizedSearchParams, searchParams, setSearchParams]);

  useEffect(() => {
    if (searchTerm !== lastCommittedSearchRef.current) {
      setSearchInput(searchTerm);
      lastCommittedSearchRef.current = searchTerm;
    }
  }, [searchTerm]);

  useEffect(() => {
    if (searchInput === searchTerm) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete('page');

      if (searchInput.trim()) {
        nextSearchParams.set('search', searchInput);
      } else {
        nextSearchParams.delete('search');
      }

      lastCommittedSearchRef.current = searchInput;

      if (nextSearchParams.toString() !== searchParams.toString()) {
        setSearchParams(nextSearchParams, { replace: true });
      }
    }, MARKET_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput, searchParams, searchTerm, setSearchParams]);

  const updateMarketSearchParams = (updater: (nextSearchParams: URLSearchParams) => void) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    updater(nextSearchParams);

    if (nextSearchParams.toString() !== searchParams.toString()) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  };

  const marketQuery = useMemo(() => {
    const itemTypes: MarketItemType[] = [];
    const browseCategories: MarketBrowseCategory[] = [];
    const shipTraits = showsShipTraitFilters && selectedShipTraitFilter !== 'all'
      ? [selectedShipTraitFilter]
      : [];
    const manufacturerIds = showsManufacturerFilter && selectedManufacturerId
      ? [selectedManufacturerId]
      : [];

    switch (selectedItemFilter) {
      case 'ccu':
      case 'credit':
        itemTypes.push(selectedItemFilter);
        break;
      case 'standalone_ship':
      case 'ship_package':
      case 'paint':
      case 'other':
        browseCategories.push(selectedItemFilter);
        break;
      default:
        break;
    }

    return {
      search: searchTerm,
      itemTypes,
      browseCategories,
      shipTraits,
      manufacturerIds,
      sortBy,
      page,
      limit: rowsPerPage,
    };
  }, [
    page,
    rowsPerPage,
    searchTerm,
    selectedManufacturerId,
    selectedItemFilter,
    selectedShipTraitFilter,
    showsManufacturerFilter,
    showsShipTraitFilters,
    sortBy,
  ]);
  const { ships, listingItems, pagination, loading, refreshing, error } = useMarketData(marketQuery);
  const { listingItems: featuredAccountItems } = useAccountMarketData({ limit: 3, page: 0 });
  const accountCouponCode = getMonthlyAccountCouponCode();

  const handleCopyAccountCouponCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(accountCouponCode);
      setSnackbarMessage(intl.formatMessage({ id: 'common.copied', defaultMessage: 'Copied to clipboard' }));
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (error) {
      console.error('Failed to copy account coupon code:', error);
    }
  }, [accountCouponCode, intl]);

  const manufacturerOptions = useMemo(() => {
    const options = new Map<number, { id: number; name: string; logoPath: string | null }>();
    const addManufacturer = (manufacturer: { id?: number | null; name?: string | null; localizedName?: string | null }) => {
      if (!manufacturer.id || !manufacturer.name) {
        return;
      }

      if (!options.has(manufacturer.id)) {
        options.set(manufacturer.id, {
          id: manufacturer.id,
          name: manufacturer.localizedName || manufacturer.name,
          logoPath: getManufacturerLogoPath(manufacturer),
        });
      }
    };

    ships.forEach((ship) => {
      addManufacturer(ship.manufacturer);
    });

    listingItems.forEach((item) => {
      if (!item.toShipManufacturerId && !item.fromShipManufacturerId && !item.shipManufacturerId) {
        return;
      }

      [
        item.toShipManufacturerId,
        item.fromShipManufacturerId,
        item.shipManufacturerId,
        ...(item.packageShips || []).map((packageShip) => packageShip.manufacturerId),
      ].forEach((manufacturerId) => {
        if (!manufacturerId || options.has(manufacturerId)) {
          return;
        }

        options.set(manufacturerId, {
          id: manufacturerId,
          name: String(manufacturerId),
          logoPath: getManufacturerLogoPath({ id: manufacturerId }),
        });
      });
    });

    return Array.from(options.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [listingItems, ships]);

  useEffect(() => {
    pageContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [marketQuery]);

  const handleAddToCart = (item: ListingItem) => {
    if (item.itemType === 'ccu') {
      return;
    }

    const existingCartItem = cart.find((cartItem: CartItemType) => cartItem.resource.id === item.skuId);
    const availableStock = getAvailableStock(item);

    if (existingCartItem) {
      const currentQuantity = existingCartItem.quantity || 1;
      if (currentQuantity < availableStock) {
        updateItemQuantity(item.skuId, currentQuantity + 1);
        setSnackbarMessage(intl.formatMessage({ id: 'market.quantityUpdated', defaultMessage: 'Quantity updated' }));
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      }
      return;
    }

    const cartItem: Resource = buildMarketResource(item, ships);
    addToCart(cartItem);

    setSnackbarMessage(intl.formatMessage({ id: 'market.addedToCart', defaultMessage: 'Added to cart' }));
    setSnackbarSeverity('success');
    setSnackbarOpen(true);
  };

  const getAvailableStockByResourceId = (resourceId: string) => {
    if (resourceId.startsWith('credit-pool:')) {
      return Number.MAX_SAFE_INTEGER;
    }

    const item = listingItems.find((listingItem) => listingItem.skuId === resourceId);
    if (item) return getAvailableStock(item);

    return cart.find((cartItem) => cartItem.resource.id === resourceId)?.resource.marketAvailableStock ?? 0;
  };

  const handleOpenDetails = (item: ListingItem) => {
    window.open(getMarketDetailUrl(item.skuId), '_blank', 'noopener,noreferrer');
  };

  const handleClaimNewUserCoupon = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/user/new-user-coupon/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to claim coupon');
      }

      await mutateCouponPreview();
      setCouponPopupDismissed(false);
      if (!options?.silent) {
        setSnackbarMessage(intl.formatMessage({
          id: 'market.newUserCoupon.claimSuccess',
          defaultMessage: 'Coupon claimed successfully.',
        }));
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      }
    } catch (error) {
      console.error(error);
      if (!options?.silent) {
        setSnackbarMessage(intl.formatMessage({
          id: 'market.newUserCoupon.claimError',
          defaultMessage: 'Failed to claim coupon.',
        }));
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
      }
    }
  }, [intl, mutateCouponPreview, user.token]);

  const activeCoupon = couponPreview?.activeCoupon;
  const activeCouponExpiresAt = activeCoupon?.expiresAt ? new Date(activeCoupon.expiresAt).getTime() : Number.NaN;

  useEffect(() => {
    if (
      !activeCoupon
      || couponPopupDismissed
      || !Number.isFinite(activeCouponExpiresAt)
      || activeCouponExpiresAt <= Date.now()
    ) {
      return;
    }

    const updateCouponNow = () => {
      setCouponNow(Date.now());
    };

    updateCouponNow();
    const intervalId = window.setInterval(updateCouponNow, COUPON_COUNTDOWN_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeCoupon, activeCoupon?.id, activeCouponExpiresAt, couponPopupDismissed]);

  useEffect(() => {
    if (!user.token || !user.id) {
      autoClaimAttemptedRef.current = null;
      return;
    }

    if (!couponPreview?.claimable) {
      return;
    }

    const claimAttemptKey = `${user.id}:market-autoclaim`;
    if (autoClaimAttemptedRef.current === claimAttemptKey) {
      return;
    }

    autoClaimAttemptedRef.current = claimAttemptKey;
    void handleClaimNewUserCoupon({ silent: true });
  }, [couponPreview?.claimable, handleClaimNewUserCoupon, user.id, user.token]);

  useEffect(() => {
    if (couponPreview?.activeCoupon?.id) {
      setCouponPopupDismissed(false);
    }
  }, [couponPreview?.activeCoupon?.id]);

  const isCouponPopupVisible = Boolean(
    activeCoupon
    && !couponPopupDismissed
    && Number.isFinite(activeCouponExpiresAt)
    && activeCouponExpiresAt > couponNow,
  );
  const couponAmountOffText = activeCoupon ? formatUsdPrice(intl.locale, activeCoupon.amountOff) : '';
  const couponMinimumAmountText = activeCoupon ? formatUsdPrice(intl.locale, activeCoupon.minimumAmount) : '';
  const couponCountdownText = Number.isFinite(activeCouponExpiresAt)
    ? formatCouponCountdown(activeCouponExpiresAt - couponNow)
    : '';
  const hasActiveFilters = Boolean(
    searchTerm.trim()
    || selectedItemFilter !== 'all'
    || (showsShipTraitFilters && selectedShipTraitFilter !== 'all')
    || (showsManufacturerFilter && selectedManufacturerId)
    || sortBy !== 'recommended'
    || page > 0
    || rowsPerPage !== MARKET_DEFAULT_ROWS_PER_PAGE,
  );
  const pageUrl = typeof window !== 'undefined'
    ? window.location.href
    : getMarketListUrl();
  const canonicalUrl = getMarketListUrl();
  const metaTitle = hasActiveFilters
    ? `Star Citizen Market Search Results | Citizens' Hub`
    : `Star Citizen Market - CCU, Ships, Store Credit & Paints | Citizens' Hub`;
  const metaDescription = hasActiveFilters
    ? `Browse filtered Star Citizen marketplace listings on Citizens' Hub, including CCUs, ships, store credit, paints, and other items.`
    : `Browse the Citizens' Hub Star Citizen market for CCU upgrades, standalone ships, ship packages, store credit, paints, and other marketplace listings.`;
  const metaKeywords = hasActiveFilters
    ? 'Star Citizen market search, CCU listings, Star Citizen ships, store credit, Star Citizen marketplace'
    : 'Star Citizen market, CCU, ship upgrades, standalone ships, ship packages, store credit, paints, Star Citizen marketplace';
  const metaImage = getAbsoluteAssetUrl('/logo.png');
  const robotsContent = hasActiveFilters ? 'noindex,follow' : 'index,follow';
  if (loading && listingItems.length === 0 && pagination.total === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta name="keywords" content={metaKeywords} />
        <meta name="robots" content={robotsContent} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={metaImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDescription} />
        <meta name="twitter:image" content={metaImage} />
        <link rel="canonical" href={canonicalUrl} />
      </Helmet>
      <div
        ref={pageContainerRef}
        className='absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-y-auto bg-white px-4 py-4 text-left md:px-8 dark:bg-transparent'
      >
        {showAlert && (
          <Alert
            severity="warning"
            sx={{ zIndex: 1000, position: 'fixed', top: 65, left: 0, right: 0, width: '100%', borderRadius: 0 }}
            onClose={() => {
              setShowAlert(false);
            }}
          >
            <div className="text-sm text-left">
              <FormattedMessage
                id="market.betaNotice"
                defaultMessage="This page is a test deployment and the order is run in the test environment. All the items listed are test items. Please do not place an order."
              />
            </div>
          </Alert>
        )}

        <div className='mx-auto flex w-full max-w-[1280px] flex-col gap-4'>
          <Box sx={{ display: 'flex', justifyContent: 'end', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
            <div className='flex items-center gap-3'>
              <Link to="/orders" className='text-slate-700 transition dark:text-slate-200'>
                <FormattedMessage id="market.myOrders" defaultMessage="My Orders" />
              </Link>
              <Link to="/tickets" className='text-slate-700 transition dark:text-slate-200'>
                <FormattedMessage id="market.myTickets" defaultMessage="My Tickets" />
              </Link>
              <IconButton
                onClick={openCart}
                sx={{ border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', borderRadius: 0 }}
              >
                <Badge badgeContent={cart.length} color="secondary" overlap="circular">
                  <ShoppingCart className='h-6 w-6' />
                </Badge>
              </IconButton>
            </div>
          </Box>

          <div className='rounded border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-neutral-900 md:p-5'>
            <div className='flex flex-col gap-3'>
              <div className='flex flex-col gap-2'>
                <div className='text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400'>
                  <FormattedMessage id="market.trust.eyebrow" defaultMessage="Why Buy Here" />
                </div>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.35 }}>
                  <FormattedMessage id="market.trust.title" defaultMessage="Own stock, no third-party sellers involved" />
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <FormattedMessage
                    id="market.trust.description"
                    defaultMessage="All items come directly from our own stock, with no third-party sellers involved, and are fully covered by our customer protection policy."
                  />
                </Typography>
              </div>
              <div className='border-t border-gray-200 pt-3 text-sm leading-7 text-slate-600 dark:border-gray-800 dark:text-slate-300'>
                <div>
                  <FormattedMessage id="market.trust.deliveryWithin24h" defaultMessage="Guaranteed delivery within 24 hours." />
                </div>
                <div>
                  <FormattedMessage id="market.trust.deliveryWindow" defaultMessage="Usually we can deliver within 30 minutes between 10:00 and 00:00 Hong Kong time." />
                </div>
                <div>
                  <FormattedMessage
                    id="market.trust.progressSupport"
                    defaultMessage="You can join our <discord>Discord</discord> or <ticket>submit a ticket</ticket> at any time to ask about progress."
                    values={{
                      discord: (chunks) => (
                        <a
                          href="https://discord.gg/AEuRtb5Vy8"
                          target="_blank"
                          rel="noopener noreferrer"
                          className='underline underline-offset-4 transition hover:text-slate-900 dark:hover:text-white'
                        >
                          {chunks}
                        </a>
                      ),
                      ticket: (chunks) => (
                        <Link
                          to="/tickets"
                          className='underline underline-offset-4 transition hover:text-slate-900 dark:hover:text-white'
                        >
                          {chunks}
                        </Link>
                      ),
                    }}
                  />
                </div>
                <div className='pt-2'>
                  <picture>
                    <source
                      srcSet="/stripe/Powered by Stripe - blurple.svg"
                    />
                    <img
                      src="/stripe/Powered by Stripe - blurple.svg"
                      alt="Powered by Stripe"
                      className='h-8 w-auto opacity-80'
                    />
                  </picture>
                </div>
              </div>
            </div>
          </div>

          <div className='grid items-start grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,_1fr)]'>
            <div className='lg:sticky lg:top-4 lg:self-start'>
              <Box sx={{ borderRadius: 0, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', p: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  <FormattedMessage id="market.filter.type" defaultMessage="Item Type" />
                </Typography>
                <RadioGroup
                  value={selectedItemFilter}
                  onChange={(event) => {
                    const nextFilter = event.target.value as MarketItemFilterOption;
                    updateMarketSearchParams((nextSearchParams) => {
                      nextSearchParams.delete('itemType');
                      nextSearchParams.delete('browseCategory');
                      nextSearchParams.delete('tag');
                      nextSearchParams.delete('shipTrait');
                      nextSearchParams.delete('manufacturerId');
                      nextSearchParams.delete('page');

                      if (nextFilter === 'ccu' || nextFilter === 'credit') {
                        nextSearchParams.set('itemType', nextFilter);
                      } else if (nextFilter !== 'all') {
                        nextSearchParams.set('browseCategory', nextFilter);
                      }

                      const nextShowsShipTraitFilters = nextFilter === 'all'
                        || nextFilter === 'standalone_ship'
                        || nextFilter === 'ship_package';
                      const nextShowsManufacturerFilter = nextShowsShipTraitFilters || nextFilter === 'ccu';

                      if (nextShowsShipTraitFilters && selectedShipTraitFilter !== 'all') {
                        nextSearchParams.set('shipTrait', selectedShipTraitFilter);
                      }

                      if (nextShowsManufacturerFilter && selectedManufacturerId) {
                        nextSearchParams.set('manufacturerId', String(selectedManufacturerId));
                      }
                    });
                  }}
                >
                  <FormControlLabel
                    control={(
                      <Radio size="small" />
                    )}
                    value="all"
                    label={intl.formatMessage({ id: 'market.filter.all', defaultMessage: 'All' })}
                  />
                  <FormControlLabel
                    control={(
                      <Radio size="small" />
                    )}
                    value="ccu"
                    label={intl.formatMessage({ id: 'market.filter.ccu', defaultMessage: 'CCU' })}
                  />
                  <FormControlLabel
                    control={(
                      <Radio size="small" />
                    )}
                    value="standalone_ship"
                    label={intl.formatMessage({ id: 'market.filter.standaloneShip', defaultMessage: 'Standalone Ship' })}
                  />
                  <FormControlLabel
                    control={(
                      <Radio size="small" />
                    )}
                    value="ship_package"
                    label={intl.formatMessage({ id: 'market.filter.shipPackage', defaultMessage: 'Ship Package' })}
                  />
                  <FormControlLabel
                    control={(
                      <Radio size="small" />
                    )}
                    value="paint"
                    label={intl.formatMessage({ id: 'market.filter.paint', defaultMessage: 'Paint' })}
                  />
                  <FormControlLabel
                    control={(
                      <Radio size="small" />
                    )}
                    value="other"
                    label={intl.formatMessage({ id: 'market.filter.other', defaultMessage: 'Other' })}
                  />
                  <FormControlLabel
                    control={(
                      <Radio size="small" />
                    )}
                    value="credit"
                    label={intl.formatMessage({ id: 'market.filter.credit', defaultMessage: 'Credit' })}
                  />
                </RadioGroup>

                {(showsShipTraitFilters || showsManufacturerFilter) && (
                  <>
                    {showsShipTraitFilters && (
                      <>
                        <Divider sx={{ my: 2 }} />

                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                          <FormattedMessage id="market.filter.shipTraits" defaultMessage="Ship Traits" />
                        </Typography>
                        <RadioGroup
                          value={selectedShipTraitFilter}
                          onChange={(event) => {
                            const nextShipTrait = event.target.value as MarketShipTraitFilter | 'all';
                            updateMarketSearchParams((nextSearchParams) => {
                              nextSearchParams.delete('tag');
                              nextSearchParams.delete('shipTrait');
                              nextSearchParams.delete('page');

                              if (nextShipTrait !== 'all') {
                                nextSearchParams.set('shipTrait', nextShipTrait);
                              }
                            });
                          }}
                        >
                          <FormControlLabel
                            control={<Radio size="small" />}
                            value="all"
                            label={intl.formatMessage({ id: 'market.filter.shipTraits.all', defaultMessage: 'All ship listings' })}
                          />
                          <FormControlLabel
                            control={<Radio size="small" />}
                            value="oc"
                            label={intl.formatMessage({ id: 'market.tag.oc', defaultMessage: 'OC' })}
                          />
                          <FormControlLabel
                            control={<Radio size="small" />}
                            value="non_oc"
                            label={intl.formatMessage({ id: 'market.tag.nonOc', defaultMessage: 'Non-OC' })}
                          />
                          <FormControlLabel
                            control={<Radio size="small" />}
                            value="lti"
                            label={intl.formatMessage({ id: 'market.tag.lti', defaultMessage: 'LTI' })}
                          />
                        </RadioGroup>
                      </>
                    )}

                    {showsManufacturerFilter && (
                      <>
                        <Divider sx={{ my: 2 }} />

                        <TextField
                          select
                          fullWidth
                          size="small"
                          label={intl.formatMessage({ id: 'market.filter.manufacturer', defaultMessage: 'Brand' })}
                          value={selectedManufacturerId ? String(selectedManufacturerId) : 'all'}
                          sx={{
                            '& .MuiOutlinedInput-root': { borderRadius: 0 }
                          }}
                          onChange={(event) => {
                            const nextManufacturerId = parsePositiveInteger(event.target.value);
                            updateMarketSearchParams((nextSearchParams) => {
                              nextSearchParams.delete('manufacturerId');
                              nextSearchParams.delete('page');

                              if (nextManufacturerId) {
                                nextSearchParams.set('manufacturerId', String(nextManufacturerId));
                              }
                            });
                          }}
                        >
                          <MenuItem value="all">
                            {intl.formatMessage({ id: 'market.filter.manufacturer.all', defaultMessage: 'All brands' })}
                          </MenuItem>
                          {manufacturerOptions.map((manufacturer) => (
                            <MenuItem key={manufacturer.id} value={String(manufacturer.id)}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                                {manufacturer.logoPath && (
                                  <Box
                                    component="img"
                                    src={manufacturer.logoPath}
                                    alt=""
                                    sx={{
                                      width: 24,
                                      height: 24,
                                      objectFit: 'contain',
                                      flexShrink: 0,
                                      filter: 'var(--market-manufacturer-logo-filter, none)',
                                    }}
                                  />
                                )}
                                <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {manufacturer.name}
                                </Box>
                              </Box>
                            </MenuItem>
                          ))}
                        </TextField>
                      </>
                    )}
                  </>
                )}
              </Box>

              <Box sx={{ mt: 2, borderRadius: 0, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', p: 2 }}>
                <div className='flex flex-col gap-3'>
                  <div className='text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300'>
                    <FormattedMessage id="accountMarket.panel.eyebrow" defaultMessage="Looking for a Star Citizen account?" />
                  </div>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.35 }}>
                    <FormattedMessage id="accountMarket.panel.title" defaultMessage="Premium Star Citizen accounts on sale now" />
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <FormattedMessage
                      id="accountMarket.panel.description"
                      defaultMessage="Browse our accounts for sale, including limited ships, retired items, buyback access, and extras. If you need something specific, contact us about a custom account."
                    />
                  </Typography>

                  <div className='border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/20'>
                    <div className='text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300'>
                      <FormattedMessage id="accountMarket.panel.codeLabel" defaultMessage="Discount code" />
                    </div>
                    <div className='mt-1 flex items-start gap-1'>
                      <div className='min-w-0 break-all text-lg font-black leading-tight text-slate-900 dark:text-white'>{accountCouponCode}</div>
                      <Tooltip title={intl.formatMessage({ id: 'common.copy', defaultMessage: 'Copy' })} arrow>
                        <IconButton size="small" sx={{ flexShrink: 0, mt: '1px' }} onClick={() => void handleCopyAccountCouponCode()}>
                          <ContentCopy fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </div>
                    <div className='mt-1 text-slate-600 dark:text-slate-300'>
                      <FormattedMessage
                        id="accountMarket.panel.codeBody"
                        defaultMessage="Use the monthly account code at checkout to claim {percent}% off eligible account listings."
                        values={{ percent: ACCOUNT_MARKET_COUPON_PERCENT_OFF }}
                      />
                    </div>
                  </div>

                  {featuredAccountItems[0] ? (
                    <Link
                      to={`/account-market/${encodeURIComponent(featuredAccountItems[0].skuId)}`}
                      className='flex gap-3 border border-gray-200 p-3 transition hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600'
                    >
                      <img
                        src={getMarketImageAssetUrl(featuredAccountItems[0].imageUrl || featuredAccountItems[0].entries.find((entry) => entry.imageUrl)?.imageUrl || '/imgs/credit.webp')}
                        alt={featuredAccountItems[0].name}
                        className='h-20 w-20 shrink-0 object-cover'
                      />
                      <div className='min-w-0 flex-1'>
                        <div className='text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400'>
                          <FormattedMessage id="accountMarket.panel.featured" defaultMessage="Featured account" />
                        </div>
                        <div className='mt-1 line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white'>
                          {featuredAccountItems[0].name}
                        </div>
                        <div className='mt-2 text-sm font-bold text-slate-900 dark:text-white'>
                          {intl.formatNumber(featuredAccountItems[0].price, { style: 'currency', currency: 'USD' })}
                        </div>
                      </div>
                    </Link>
                  ) : (
                    <div className='border border-dashed border-gray-300 p-3 text-sm text-slate-500 dark:border-gray-700 dark:text-slate-400'>
                      <FormattedMessage id="accountMarket.panel.empty" defaultMessage="Account listings will appear here when available." />
                    </div>
                  )}

                  <Button component={Link} to={getAccountMarketListPath()} variant="contained" fullWidth>
                    <FormattedMessage id="accountMarket.panel.cta" defaultMessage="Browse Accounts" />
                  </Button>
                </div>
              </Box>
            </div>

          <div className='min-w-0'>
            <Box
              sx={{
                mb: 3,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 220px' },
                gap: 2,
                borderRadius: 0,
                border: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'background.paper',
                p: 2,
              }}
            >
              <TextField
                fullWidth
                variant="outlined"
                placeholder={intl.formatMessage({ id: 'market.searchPlaceholder', defaultMessage: 'Search products, ships, bundles...' })}
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                }}
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: 0 }
                }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search />
                      </InputAdornment>
                    )
                  }
                }}
                size="small"
              />

              <TextField
                select
                fullWidth
                size="small"
                label={intl.formatMessage({ id: 'market.sort', defaultMessage: 'Sort' })}
                value={sortBy}
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: 0 }
                }}
                onChange={(event) => {
                  const nextSortBy = event.target.value as MarketSortMode;
                  updateMarketSearchParams((nextSearchParams) => {
                    nextSearchParams.delete('page');

                    if (nextSortBy === 'recommended') {
                      nextSearchParams.delete('sortBy');
                    } else {
                      nextSearchParams.set('sortBy', nextSortBy);
                    }
                  });
                }}
              >
                <MenuItem value="recommended">
                  {intl.formatMessage({ id: 'market.sort.recommended', defaultMessage: 'Recommended' })}
                </MenuItem>
                <MenuItem value="newest">
                  {intl.formatMessage({ id: 'market.sort.newest', defaultMessage: 'Newest' })}
                </MenuItem>
                <MenuItem value="priceDesc">
                  {intl.formatMessage({ id: 'market.sort.priceDesc', defaultMessage: 'Price: High to Low' })}
                </MenuItem>
                <MenuItem value="priceAsc">
                  {intl.formatMessage({ id: 'market.sort.priceAsc', defaultMessage: 'Price: Low to High' })}
                </MenuItem>
              </TextField>
            </Box>

            <Box sx={{ position: 'relative' }}>
              {refreshing && (
                <Box
                  sx={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    mb: 2,
                    display: 'flex',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.5,
                      py: 0.75,
                      border: '1px solid',
                      borderColor: 'divider',
                      backgroundColor: 'background.paper',
                      boxShadow: 2,
                    }}
                  >
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                      <FormattedMessage id="market.loading" defaultMessage="Loading..." />
                    </Typography>
                  </Box>
                </Box>
              )}

              {listingItems.length === 0 ? (
                <Box sx={{ borderRadius: 0, border: '1px dashed', borderColor: 'divider', backgroundColor: 'background.paper', p: 6, textAlign: 'center' }}>
                  <Typography variant="h6">
                    <FormattedMessage id="market.noResults" defaultMessage="No products found" />
                  </Typography>
                </Box>
              ) : (
                <>
                  <div className='grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3'>
                    {listingItems.map((item) => {
                      const availableStock = getAvailableStock(item);
                      const inCartItem = cart.find((cartItem: CartItemType) => cartItem.resource.id === item.skuId);
                      const inCartQuantity = inCartItem?.quantity || 0;
                      const basePrice = getListingBasePrice(item, ships);
                      const discount = getListingDiscountPercent(item, ships);
                      const isCredit = item.itemType === 'credit';
                      const isCcu = item.itemType === 'ccu';
                      const isVariantPriceRange = isCcu && (item.variantCount || 0) > 1;
                      const packageShips = item.packageShips || [];
                      const packageItems = item.packageItems || [];
                      const displayName = getMarketItemDisplayName(intl, item, ships);

                      return (
                        <div
                          key={item.skuId}
                          className='flex h-full flex-col overflow-hidden border border-gray-200 bg-white transition hover:border-gray-300 dark:border-gray-800 dark:bg-neutral-900 dark:hover:border-gray-700'
                        >
                          <div
                            className='block w-full cursor-pointer text-left'
                            onClick={() => handleOpenDetails(item)}
                          >
                            <MarketItemMedia
                              item={item}
                              ships={ships}
                              height={240}
                              badgeText={!isCredit && discount ? formatMarketDiscount(intl, discount) : null}
                            />
                          </div>

                          <div className='flex flex-1 flex-col gap-4 p-5'>
                            <div className='flex flex-wrap gap-2'>
                              {item.browseCategory && <Chip size="small" variant="outlined" label={getMarketBrowseCategoryLabel(intl, item.browseCategory)} />}
                              {item.itemType === 'ccu' && <Chip size="small" label={getMarketItemTypeLabel(intl, item.itemType)} />}
                              {item.itemType === 'credit' && <Chip size="small" label={getMarketItemTypeLabel(intl, item.itemType)} />}
                            </div>

                            <div className='flex flex-1 flex-col gap-2'>
                              <div
                                className='w-full cursor-pointer text-left text-inherit no-underline'
                                onClick={() => handleOpenDetails(item)}
                              >
                                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.35 }}>
                                  {displayName}
                                </Typography>
                              </div>
                              <Typography variant="body2" color="text.secondary" sx={{ minHeight: 42 }}>
                                {getMarketItemSummary(intl, item, ships)}
                              </Typography>
                              {item.itemType === 'package' && (packageShips.length > 0 || packageItems.length > 0) && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                  }}
                                >
                                  {formatPackageContentsSummary(intl, packageShips.filter(ship => ship.shipId !== null).length, packageItems.length)}
                                </Typography>
                              )}
                            </div>

                            <div className='mt-auto flex flex-col gap-4'>
                              <div className='flex flex-col gap-1'>
                                <div className='text-xl font-semibold text-slate-900 dark:text-slate-100'>
                                  {isCredit || isVariantPriceRange
                                    ? formatMarketPriceFrom(intl, item.price)
                                    : formatUsdPrice(intl.locale, item.price)}
                                </div>
                                {discount && Number(discount) > 0 && (
                                  <div className='text-sm text-slate-500 line-through dark:text-slate-400'>
                                    {formatUsdPrice(intl.locale, basePrice)}
                                  </div>
                                )}
                                {typeof item.cost === 'number' && item.cost > 0 && (
                                  <div className='text-sm text-slate-500 dark:text-slate-400'>
                                    {intl.formatMessage(
                                      { id: 'market.detail.meltValueSummary', defaultMessage: 'Exchange value: {value}' },
                                      { value: formatUsdPrice(intl.locale, item.cost) },
                                    )}
                                  </div>
                                )}
                              </div>

                              <Divider />

                              <div className='flex items-center justify-between gap-3'>
                              {/* <Link
                                to={getMarketDetailPath(item.skuId)}
                                className='text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300'
                              >
                                {isCcu ? (
                                  <FormattedMessage
                                    id="market.viewDetails"
                                    defaultMessage="View details"
                                  />
                                ) : (
                                  <FormattedMessage id="market.viewDetails" defaultMessage="View details" />
                                )}
                              </Link> */}

                                {isCredit ? (
                                  <Button
                                    variant="outlined"
                                    onClick={() => handleOpenDetails(item)}
                                    size="small"
                                  >
                                    <FormattedMessage id="market.credit.chooseAmount" defaultMessage="Choose amount" />
                                  </Button>
                                ) : isCcu ? (
                                  <Button
                                    variant="outlined"
                                    onClick={() => handleOpenDetails(item)}
                                    size="small"
                                  >
                                    <FormattedMessage
                                      id="market.viewDetails"
                                      defaultMessage="View details"
                                    />
                                  </Button>
                                ) : inCartItem ? (
                                  <ButtonGroup
                                    size="small"
                                    aria-label={intl.formatMessage({ id: 'market.quantityControls', defaultMessage: 'Quantity controls' })}
                                  >
                                    <IconButton
                                      size="small"
                                      onClick={() => {
                                        if (inCartQuantity > 1) {
                                          updateItemQuantity(item.skuId, inCartQuantity - 1);
                                        } else {
                                          removeFromCart(item.skuId);
                                        }
                                      }}
                                    >
                                      <Minus className="h-4 w-4" />
                                    </IconButton>
                                    <Typography sx={{ px: 2, display: 'flex', alignItems: 'center', border: '1px solid', borderColor: 'divider' }}>
                                      {inCartQuantity}
                                    </Typography>
                                    <IconButton
                                      size="small"
                                      disabled={inCartQuantity >= availableStock}
                                      onClick={() => {
                                        if (inCartQuantity < availableStock) {
                                          updateItemQuantity(item.skuId, inCartQuantity + 1);
                                        }
                                      }}
                                    >
                                      <Plus className="h-4 w-4" />
                                    </IconButton>
                                  </ButtonGroup>
                                ) : (
                                  <Button
                                    variant="outlined"
                                    onClick={() => handleAddToCart(item)}
                                    disabled={availableStock <= 0}
                                    size="small"
                                  >
                                    <FormattedMessage id="market.addToCart" defaultMessage="Add to cart" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <Box sx={{ mt: 2, borderRadius: 0, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper' }}>
                    <TablePagination
                      rowsPerPageOptions={[12, 24, 36]}
                      component="div"
                      count={pagination.total}
                      rowsPerPage={rowsPerPage}
                      page={page}
                      onPageChange={(_event, newPage) => {
                        updateMarketSearchParams((nextSearchParams) => {
                          if (newPage > 0) {
                            nextSearchParams.set('page', String(newPage));
                          } else {
                            nextSearchParams.delete('page');
                          }
                        });
                      }}
                      onRowsPerPageChange={(event) => {
                        const nextRowsPerPage = parseInt(event.target.value, 10);
                        updateMarketSearchParams((nextSearchParams) => {
                          nextSearchParams.delete('page');

                          if (nextRowsPerPage === MARKET_DEFAULT_ROWS_PER_PAGE) {
                            nextSearchParams.delete('limit');
                          } else {
                            nextSearchParams.set('limit', String(nextRowsPerPage));
                          }
                        });
                      }}
                      labelRowsPerPage={intl.formatMessage({ id: 'pagination.rowsPerPage', defaultMessage: 'Rows per page:' })}
                      labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${intl.formatMessage({ id: 'pagination.total', defaultMessage: 'Total' })} ${count}`}
                    />
                  </Box>
                </>
              )}
            </Box>
          </div>
        </div>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 1.5,
            flexWrap: 'wrap',
            borderTop: '1px solid',
            borderColor: 'divider',
            pt: 3,
            mt: 1,
            color: 'text.secondary',
          }}
        >
          {/* MARK: ABOUT US */}
          {/* <Link to="/about-us" className='text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'>
            <FormattedMessage id="navigate.about" defaultMessage="About Us" />
          </Link>
          <span className='text-slate-400'>|</span> */}
          <Link to="/terms-of-service" className='text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'>
            <FormattedMessage id="navigate.terms" defaultMessage="Terms of Service" />
          </Link>
          <span className='text-slate-400'>|</span>
          <Link to="/refund-policy" className='text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'>
            <FormattedMessage id="navigate.refund" defaultMessage="Refund Policy" />
          </Link>
          <span className='text-slate-400'>|</span>
          <Link to="/privacy" className='text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'>
            <FormattedMessage id="navigate.privacy" defaultMessage="Privacy Policy" />
          </Link>
        </Box>
        </div>

        <CartDrawer
          open={cartOpen}
          cart={cart}
          onClose={closeCart}
          onRemoveFromCart={removeFromCart}
          onUpdateQuantity={updateItemQuantity}
          getAvailableStock={getAvailableStockByResourceId}
        />

        <Snackbar
          open={snackbarOpen}
          autoHideDuration={3000}
          onClose={() => setSnackbarOpen(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <Alert
            onClose={() => setSnackbarOpen(false)}
            severity={snackbarSeverity}
            variant="filled"
          >
            {snackbarMessage}
          </Alert>
        </Snackbar>

        {isCouponPopupVisible && activeCoupon && (
          <Box
            sx={{
              position: 'fixed',
              left: { xs: 16, sm: 24 },
              bottom: { xs: 16, sm: 24 },
              zIndex: 1300,
              width: { xs: 'calc(100vw - 32px)', sm: 388 },
              borderRadius: 0,
              border: '1px solid',
              borderColor: 'warning.main',
              backgroundColor: 'background.paper',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: -1,
                left: -1,
                right: -1,
                height: 4,
                backgroundColor: 'warning.main',
              },
            }}
          >
            <Box sx={{ position: 'relative', p: 2.5, pt: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                <Box sx={{ minWidth: 0, pr: 1 }}>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      px: 1,
                      py: 0.375,
                      borderRadius: 0,
                      border: '1px solid',
                      borderColor: 'warning.main',
                      backgroundColor: 'rgba(237, 108, 2, 0.08)',
                      color: 'warning.dark',
                      fontSize: 12,
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                    }}
                  >
                    <FormattedMessage
                      id="market.newUserCoupon.popupTitle"
                      defaultMessage="New user offer"
                    />
                  </Box>

                  <Typography variant="h6" sx={{ mt: 1.5, fontWeight: 800, lineHeight: 1.45 }}>
                    <FormattedMessage
                      id="market.newUserCoupon.popupBody"
                      defaultMessage="Get {amountOff} off a minimum purchase of {minimumAmount}."
                      values={{
                        amountOff: couponAmountOffText,
                        minimumAmount: couponMinimumAmountText,
                      }}
                    />
                  </Typography>

                </Box>

                <Button
                  variant="text"
                  size="small"
                  onClick={() => setCouponPopupDismissed(true)}
                  sx={{
                    minWidth: 'auto',
                    p: 0.5,
                    borderRadius: 0,
                    border: '1px solid',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    '&:hover': {
                      borderColor: 'text.primary',
                      backgroundColor: 'transparent',
                    },
                  }}
                  aria-label={intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </Box>

              <Box
                sx={{
                  mt: 2,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 1,
                  flexWrap: 'wrap',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  <FormattedMessage
                    id="market.newUserCoupon.popupCountdownPrefix"
                    defaultMessage="Expires in:"
                  />
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 900, color: 'warning.dark', letterSpacing: '0.1em', lineHeight: 1 }}>
                  {couponCountdownText}
                </Typography>
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                <FormattedMessage
                  id="market.newUserCoupon.popupHint"
                  defaultMessage="The coupon will be applied automatically at checkout."
                />
              </Typography>
            </Box>
          </Box>
        )}
      </div>
    </>
  );
};

export default Market;
