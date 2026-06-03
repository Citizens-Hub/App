import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Snackbar,
  Typography,
} from '@mui/material';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useNavigate, useParams } from 'react-router';
import { Helmet } from 'react-helmet';
import { ArrowLeft, Minus, Plus, ShoppingCart } from 'lucide-react';

import ShipModelPreview from '@/components/ShipModelPreview';
import CartDrawer from './components/CartDrawer';
import MarketItemMedia from './components/MarketItemMedia';
import {
  buildMarketCartItem,
  buildMarketResource,
  getMarketItemVisual,
  MARKET_ITEM_PLACEHOLDER,
} from '@/components/marketItemDisplay';
import {
  CartItem as CartItemType,
  ListingItem,
  MarketShipRelatedItemsResponse,
  Resource,
  Ship,
  ShipResponse,
  ShipsData,
} from '@/types';
import { useApi } from '@/hooks';
import { useCartStore } from '@/hooks/useCartStore';
import { useLocale } from '@/contexts/LocaleContext';
import { getShipDisplayName, getShipManufacturerDisplayName } from '@/utils/shipDisplay';
import { getShipDetailImageUrl, getShipDetailThumbnailUrl, getShipSlideshowImage, getShipThumbLarge } from '@/utils/shipImage';
import { getAbsoluteAssetUrl, getMarketDetailUrl, getMarketListPath, getSiteUrl } from '@/utils/marketLinks';
import {
  getAvailableStock,
  getListingBasePrice,
  getListingDiscountPercent,
  resolveLowestCcuVariant,
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
import { getDirectCheckoutPath, saveDirectCheckoutItems } from '@/utils/directCheckout';
import { localizeShipFocus, localizeShipSize, localizeShipStatus, localizeShipType } from '@/data/shipMetadataI18n';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

function resolveShipLargestSlideshowImage(ship?: Ship | null) {
  const imageComposer = ship?.details?.imageComposer;
  if (!imageComposer?.length) {
    return '';
  }

  const candidates = imageComposer
    .map((entry, index) => ({
      entry,
      index,
      slot: (entry.slot || '').trim().toLowerCase(),
      size: Number.parseInt(entry.name || '', 10) || 0,
    }))
    .filter(({ entry, slot }) => (
      Boolean(entry.url)
      && (slot === 'media_list' || slot === 'slideshow' || slot === 'slide_show')
    ))
    .sort((left, right) => right.size - left.size || left.index - right.index);

  const selected = candidates[0];
  return selected ? getShipDetailImageUrl(ship, selected.entry, selected.index) : '';
}

function resolveShipHeroImage(ship?: Ship | null) {
  return resolveShipLargestSlideshowImage(ship)
    || getShipSlideshowImage(ship)
    || getShipDetailThumbnailUrl(ship)
    || getShipDetailImageUrl(ship)
    || getShipThumbLarge(ship)
    || MARKET_ITEM_PLACEHOLDER;
}

function formatMetricValue(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '';
  return Number.isInteger(value) ? `${value}` : `${value}`;
}

function formatCrewRange(minCrew?: number | null, maxCrew?: number | null) {
  if (minCrew == null && maxCrew == null) return '';
  if (minCrew != null && maxCrew != null) {
    return minCrew === maxCrew ? `${minCrew}` : `${minCrew}-${maxCrew}`;
  }

  return `${minCrew ?? maxCrew ?? ''}`;
}

function buildDimensionSummary(ship?: Ship | null) {
  const length = formatMetricValue(ship?.details?.length);
  const beam = formatMetricValue(ship?.details?.beam);
  const height = formatMetricValue(ship?.details?.height);

  return [length, beam, height].filter(Boolean).join(' x ');
}

function getRelatedGroupKey(item: ListingItem) {
  if (item.itemType === 'ccu') {
    return 'ccu';
  }

  if (item.browseCategory === 'standalone_ship') {
    return 'ship';
  }

  if (item.browseCategory === 'ship_package') {
    return 'package';
  }

  if (item.browseCategory === 'paint') {
    return 'paint';
  }

  return 'other';
}

export default function MarketShipFeature() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { locale } = useLocale();
  const { shipId: shipIdParam } = useParams();
  const shipId = Number(shipIdParam);
  const validShipId = Number.isInteger(shipId) && shipId > 0;
  const { cart, cartOpen, addToCart, removeFromCart, openCart, closeCart, updateItemQuantity } = useCartStore();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  const {
    data: shipResponse,
    isLoading: shipLoading,
    error: shipError,
  } = useApi<ShipResponse>(validShipId ? `/api/ship?id=${shipId}` : null);
  const {
    data: shipsResponse,
  } = useApi<ShipsData>('/api/ships');
  const {
    data: relatedResponse,
    isLoading: relatedLoading,
    error: relatedError,
  } = useApi<MarketShipRelatedItemsResponse>(validShipId ? `/api/market/ships/${shipId}/related` : null, {
    keepPreviousData: true,
  });

  const ship = shipResponse?.data.ship ?? null;
  const ships = useMemo(() => {
    if (!shipsResponse?.data.ships) {
      return ship ? [ship] : [];
    }

    const hasCurrentShip = shipsResponse.data.ships.some((entry) => entry.id === ship?.id);
    return hasCurrentShip || !ship
      ? shipsResponse.data.ships
      : [...shipsResponse.data.ships, ship];
  }, [ship, shipsResponse]);
  const relatedItems = useMemo(() => relatedResponse?.data.items || [], [relatedResponse?.data.items]);
  const groupedItems = useMemo(() => {
    const groups = new Map<string, ListingItem[]>();

    for (const item of relatedItems) {
      const key = getRelatedGroupKey(item);
      groups.set(key, [...(groups.get(key) || []), item]);
    }

    return groups;
  }, [relatedItems]);
  const shipName = getShipDisplayName(ship) || ship?.name || '';
  const manufacturerName = getShipManufacturerDisplayName(ship);
  const localizedFocus = localizeShipFocus(locale, ship?.focus);
  const localizedType = localizeShipType(locale, ship?.type);
  const localizedSize = localizeShipSize(locale, ship?.details?.size);
  const localizedStatus = localizeShipStatus(locale, ship || undefined);
  const heroImage = resolveShipHeroImage(ship);
  const metaTitle = shipName
    ? `${shipName} - Star Citizen Ship Market | Citizens' Hub`
    : `Star Citizen Ship Market | Citizens' Hub`;
  const metaDescription = ship?.details?.excerpt
    || `View Star Citizen ship details, 3D model preview, and related Citizens' Hub marketplace listings.`;
  const pageUrl = getSiteUrl(validShipId ? `/market/ships/${shipId}` : getMarketListPath());
  const specItems = [
    { label: intl.formatMessage({ id: 'ship.manufacturer', defaultMessage: 'Manufacturer' }), value: manufacturerName },
    { label: intl.formatMessage({ id: 'ship.focus', defaultMessage: 'Focus' }), value: localizedFocus },
    { label: intl.formatMessage({ id: 'ship.type', defaultMessage: 'Type' }), value: localizedType },
    { label: intl.formatMessage({ id: 'ship.size', defaultMessage: 'Size' }), value: localizedSize },
    { label: intl.formatMessage({ id: 'ship.status', defaultMessage: 'Status' }), value: localizedStatus },
    { label: intl.formatMessage({ id: 'ship.crew', defaultMessage: 'Crew' }), value: formatCrewRange(ship?.details?.minCrew, ship?.details?.maxCrew) },
    { label: intl.formatMessage({ id: 'ship.cargo', defaultMessage: 'Cargo' }), value: ship?.details?.cargoCapacity != null ? `${formatMetricValue(ship.details.cargoCapacity)} SCU` : '' },
    { label: intl.formatMessage({ id: 'ship.dimensions', defaultMessage: 'Dimensions' }), value: buildDimensionSummary(ship) ? `${buildDimensionSummary(ship)} m` : '' },
    { label: intl.formatMessage({ id: 'ship.msrp', defaultMessage: 'MSRP' }), value: ship?.msrp ? formatUsdPrice(intl.locale, ship.msrp / 100) : '' },
  ].filter((item) => item.value);

  const resolveDirectMarketItem = (item: ListingItem): ListingItem | null => {
    if (item.itemType === 'credit') {
      return null;
    }

    return item.itemType === 'ccu' ? resolveLowestCcuVariant(item) : item;
  };

  const resolveDirectMarketItemForAction = async (item: ListingItem): Promise<ListingItem | null> => {
    if (item.itemType !== 'ccu') {
      return resolveDirectMarketItem(item);
    }

    if (item.variants?.length) {
      return resolveLowestCcuVariant(item);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/market/item/${encodeURIComponent(item.skuId)}`);
      if (!response.ok) {
        throw new Error(`Failed to load CCU group ${item.skuId}`);
      }

      const groupedItem = await response.json() as ListingItem;
      return resolveLowestCcuVariant(groupedItem);
    } catch (error) {
      console.error('Failed to resolve CCU group for direct market action:', error);
      return resolveDirectMarketItem(item);
    }
  };

  const handleOpenDetails = (item: ListingItem) => {
    window.open(getMarketDetailUrl(item.skuId), '_blank', 'noopener,noreferrer');
  };

  const handleAddToCart = async (item: ListingItem) => {
    const targetItem = await resolveDirectMarketItemForAction(item);
    if (!targetItem) {
      handleOpenDetails(item);
      return;
    }

    const existingCartItem = cart.find((cartItem: CartItemType) => cartItem.resource.id === targetItem.skuId);
    const availableStock = getAvailableStock(targetItem);

    if (existingCartItem) {
      const currentQuantity = existingCartItem.quantity || 1;
      if (currentQuantity < availableStock) {
        updateItemQuantity(targetItem.skuId, currentQuantity + 1);
        setSnackbarMessage(intl.formatMessage({ id: 'market.quantityUpdated', defaultMessage: 'Quantity updated' }));
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      }
      return;
    }

    const cartItem: Resource = buildMarketResource(targetItem, ships);
    addToCart(cartItem);

    setSnackbarMessage(intl.formatMessage({ id: 'market.addedToCart', defaultMessage: 'Added to cart' }));
    setSnackbarSeverity('success');
    setSnackbarOpen(true);
  };

  const handleBuyNow = async (item: ListingItem) => {
    const targetItem = await resolveDirectMarketItemForAction(item);
    if (!targetItem || getAvailableStock(targetItem) <= 0) {
      handleOpenDetails(item);
      return;
    }

    const directCheckoutItems = [buildMarketCartItem(targetItem, 1, ships)];
    saveDirectCheckoutItems(directCheckoutItems);
    navigate(getDirectCheckoutPath());
  };

  const getAvailableStockByResourceId = (resourceId: string) => {
    const item = relatedItems.find((listingItem) => listingItem.skuId === resourceId);
    if (item) return getAvailableStock(item);

    return cart.find((cartItem) => cartItem.resource.id === resourceId)?.resource.marketAvailableStock ?? 0;
  };

  const renderListingCard = (item: ListingItem) => {
    const directItem = resolveDirectMarketItem(item);
    const directItemSkuId = directItem?.skuId || item.skuId;
    const availableStock = directItem ? getAvailableStock(directItem) : getAvailableStock(item);
    const inCartItem = directItem
      ? cart.find((cartItem: CartItemType) => cartItem.resource.id === directItemSkuId)
      : undefined;
    const inCartQuantity = inCartItem?.quantity || 0;
    const basePrice = getListingBasePrice(item, ships);
    const discount = getListingDiscountPercent(item, ships);
    const isCredit = item.itemType === 'credit';
    const isCcu = item.itemType === 'ccu';
    const isVariantPriceRange = isCcu && (item.variantCount || 0) > 1;
    const packageShips = item.packageShips || [];
    const packageItems = item.packageItems || [];
    const displayName = getMarketItemDisplayName(intl, item, ships);
    const visual = getMarketItemVisual(item, ships, { imageVariant: 'thumbLarge' });

    return (
      <div
        key={item.skuId}
        className='flex h-full flex-col overflow-hidden border border-gray-200 bg-white transition hover:border-gray-300 dark:border-gray-800 dark:bg-neutral-900 dark:hover:border-gray-700'
      >
        <div className='block w-full cursor-pointer text-left' onClick={() => handleOpenDetails(item)}>
          <MarketItemMedia
            item={item}
            ships={ships}
            height={220}
            badgeText={!isCredit && discount ? formatMarketDiscount(intl, discount) : null}
          />
        </div>

        <div className='flex flex-1 flex-col gap-4 p-4'>
          <div className='flex flex-wrap gap-2'>
            {item.browseCategory && <Chip size="small" variant="outlined" label={getMarketBrowseCategoryLabel(intl, item.browseCategory)} />}
            {item.itemType === 'ccu' && <Chip size="small" label={getMarketItemTypeLabel(intl, item.itemType)} />}
            {visual.toShipName && item.itemType === 'ccu' ? <Chip size="small" variant="outlined" label={visual.toShipName} /> : null}
          </div>

          <div className='flex flex-1 flex-col gap-2'>
            <div
              className='w-full cursor-pointer text-left text-inherit'
              onClick={() => handleOpenDetails(item)}
            >
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.35, fontSize: '1.05rem' }}>
                {displayName}
              </Typography>
            </div>
            <Typography variant="body2" color="text.secondary" sx={{ minHeight: 42 }}>
              {getMarketItemSummary(intl, item, ships)}
            </Typography>
            {item.itemType === 'package' && (packageShips.length > 0 || packageItems.length > 0) ? (
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
                {formatPackageContentsSummary(intl, packageShips.filter((entry) => entry.shipId !== null).length, packageItems.length)}
              </Typography>
            ) : null}
          </div>

          <div className='mt-auto flex flex-col gap-4'>
            <div className='flex flex-col gap-1'>
              <div className='text-xl font-semibold text-slate-900 dark:text-slate-100'>
                {isCredit || isVariantPriceRange
                  ? formatMarketPriceFrom(intl, item.price)
                  : formatUsdPrice(intl.locale, item.price)}
              </div>
              {discount && Number(discount) > 0 ? (
                <div className='text-sm text-slate-500 line-through dark:text-slate-400'>
                  {formatUsdPrice(intl.locale, basePrice)}
                </div>
              ) : null}
              {typeof item.cost === 'number' && item.cost > 0 ? (
                <div className='text-sm text-slate-500 dark:text-slate-400'>
                  {intl.formatMessage(
                    { id: 'market.detail.meltValueSummary', defaultMessage: 'Exchange value: {value}' },
                    { value: formatUsdPrice(intl.locale, item.cost) },
                  )}
                </div>
              ) : null}
            </div>

            <Divider />

            <div className='flex items-center justify-between gap-3'>
              {isCredit ? (
                <Button variant="outlined" onClick={() => handleOpenDetails(item)} size="small">
                  <FormattedMessage id="market.credit.chooseAmount" defaultMessage="Choose amount" />
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
                        updateItemQuantity(directItemSkuId, inCartQuantity - 1);
                      } else {
                        removeFromCart(directItemSkuId);
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
                        updateItemQuantity(directItemSkuId, inCartQuantity + 1);
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </IconButton>
                </ButtonGroup>
              ) : (
                <Button variant="outlined" onClick={() => handleAddToCart(item)} disabled={availableStock <= 0} size="small">
                  <FormattedMessage id="market.addToCart" defaultMessage="Add to cart" />
                </Button>
              )}
              {!isCredit ? (
                <Button variant="contained" onClick={() => handleBuyNow(item)} disabled={availableStock <= 0} size="small">
                  <FormattedMessage id="market.buyNow" defaultMessage="Buy now" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!validShipId) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <Alert severity="error">
          <FormattedMessage id="market.ship.invalid" defaultMessage="Invalid ship ID." />
        </Alert>
      </Box>
    );
  }

  if (shipLoading && !ship) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (shipError || !ship) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <Alert severity="error">
          <FormattedMessage id="market.ship.loadError" defaultMessage="Failed to load ship details." />
        </Alert>
      </Box>
    );
  }

  return (
    <>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:type" content="product" />
        <meta property="og:image" content={getAbsoluteAssetUrl(heroImage)} />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href={pageUrl} />
      </Helmet>

      <div className='absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-y-auto bg-slate-50 text-left text-slate-950 dark:bg-neutral-950 dark:text-white'>
        <section className='relative min-h-[520px] overflow-hidden border-b border-gray-200 bg-slate-900 dark:border-gray-800'>
          <img src={heroImage} alt="" className='absolute inset-0 h-full w-full object-cover blur-sm' />
          <div className='absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.88),rgba(15,23,42,0.62)_42%,rgba(15,23,42,0.22)_78%)]' />
          <div className='relative z-10 mx-auto flex min-h-[520px] max-w-[1440px] flex-col justify-end px-4 py-8 md:px-10 md:py-12'>
            <Button
              component={Link}
              to={getMarketListPath()}
              startIcon={<ArrowLeft className='h-4 w-4' />}
              sx={{ alignSelf: 'flex-start', color: 'white', borderRadius: 0, mb: 'auto' }}
            >
              <FormattedMessage id="market.backToMarket" defaultMessage="Back to market" />
            </Button>

            <div className='max-w-4xl'>
              <div className='text-xs font-semibold uppercase tracking-[0.18em] text-blue-200'>
                {manufacturerName || <FormattedMessage id="market.ship.featured" defaultMessage="Featured ship" />}
              </div>
              <Typography
                component="h1"
                sx={{
                  mt: 1.5,
                  fontSize: { xs: 40, md: 72 },
                  lineHeight: 0.95,
                  fontWeight: 900,
                  letterSpacing: 0,
                  textTransform: 'uppercase',
                  color: 'white',
                }}
              >
                {shipName}
              </Typography>
              <div className='mt-5 flex flex-wrap gap-2'>
                {[localizedFocus, localizedType, localizedSize, localizedStatus].filter(Boolean).map((entry) => (
                  <Chip
                    key={entry}
                    label={entry}
                    sx={{ borderRadius: 0, color: 'white', borderColor: 'rgba(255,255,255,0.36)', bgcolor: 'rgba(255,255,255,0.08)' }}
                    variant="outlined"
                  />
                ))}
              </div>
              {ship.details?.excerpt ? (
                <Typography sx={{ mt: 4, maxWidth: 760, color: 'rgba(255,255,255,0.78)', fontSize: { xs: 15, md: 18 }, lineHeight: 1.75 }}>
                  <MarkdownPreview
                    source={ship.details.body}
                    skipHtml={false}
                    style={{
                      backgroundColor: 'transparent',
                      color: 'inherit',
                      fontSize: '1.2rem',
                      lineHeight: '1.75',
                    }}
                    wrapperElement={{
                      'data-color-mode': document.documentElement.classList.contains('dark') ? 'dark' : 'light',
                    }}
                  />
                </Typography>
              ) : null}
            </div>
          </div>
        </section>

        <main className='mx-auto grid w-full max-w-[1440px] gap-8 px-4 py-8 md:px-10'>
          <section className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]'>
            <div className='min-w-0 border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-neutral-900 md:p-6'>
              <ShipModelPreview open shipId={ship.id} />
            </div>

            <div className='border border-gray-200 bg-white text-slate-950 dark:border-gray-800 dark:bg-neutral-900 dark:text-white'>
              <div className='border-b border-gray-200 p-5 dark:border-gray-800'>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  <FormattedMessage id="market.ship.specs" defaultMessage="Ship specs" />
                </Typography>
              </div>
              <div className='grid'>
                {specItems.map((item) => (
                  <div key={item.label} className='grid grid-cols-[150px_minmax(0,1fr)] border-b border-gray-200 px-5 py-3 text-sm dark:border-gray-800'>
                    <div className='font-semibold text-slate-500 dark:text-slate-400'>{item.label}</div>
                    <div className='min-w-0 text-slate-950 dark:text-white'>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* {ship.details?.body ? (
            <section className='border border-gray-200 bg-white p-5 text-slate-950 dark:border-gray-800 dark:bg-neutral-900 dark:text-white md:p-6'>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
                <FormattedMessage id="market.ship.overview" defaultMessage="Overview" />
              </Typography>
              <div className='ship-info-description-markdown text-sm leading-7 text-slate-700 dark:text-slate-200'>
                <MarkdownPreview
                  source={ship.details.body}
                  skipHtml={false}
                  style={{
                    backgroundColor: 'transparent',
                    color: 'inherit',
                    fontSize: '0.875rem',
                    lineHeight: '1.75',
                  }}
                  wrapperElement={{
                    'data-color-mode': document.documentElement.classList.contains('dark') ? 'dark' : 'light',
                  }}
                />
              </div>
            </section>
          ) : null} */}

          <section className='grid gap-5'>
            <div className='flex flex-wrap items-end justify-between gap-3'>
              <div>
                <Typography variant="h4" sx={{ fontWeight: 900, color: 'text.primary' }}>
                  <FormattedMessage id="market.ship.relatedTitle" defaultMessage="Related products" />
                </Typography>
              </div>
              <IconButton
                onClick={openCart}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  backgroundColor: 'background.paper',
                  color: 'text.primary',
                  borderRadius: 0,
                  '&:hover': { backgroundColor: 'action.hover' },
                }}
              >
                <Badge badgeContent={cart.length} color="secondary" overlap="circular">
                  <ShoppingCart className='h-6 w-6' />
                </Badge>
              </IconButton>
            </div>

            {relatedError ? (
              <Alert severity="error">
                <FormattedMessage id="market.ship.relatedLoadError" defaultMessage="Failed to load related products." />
              </Alert>
            ) : relatedLoading && relatedItems.length === 0 ? (
              <Box display="flex" justifyContent="center" alignItems="center" minHeight={220}>
                <CircularProgress />
              </Box>
            ) : relatedItems.length === 0 ? (
              <div className='border border-dashed border-gray-300 bg-white p-8 text-center text-slate-500 dark:border-gray-700 dark:bg-neutral-900 dark:text-slate-400'>
                <FormattedMessage id="market.ship.noRelatedProducts" defaultMessage="No related products are currently available." />
              </div>
            ) : (
              ['ship', 'package', 'ccu', 'paint', 'other'].map((groupKey) => {
                const items = groupedItems.get(groupKey) || [];
                if (!items.length) {
                  return null;
                }

                const groupTitle = groupKey === 'ccu'
                  ? intl.formatMessage({ id: 'market.filter.ccu', defaultMessage: 'CCU' })
                  : groupKey === 'ship'
                    ? intl.formatMessage({ id: 'market.filter.standaloneShip', defaultMessage: 'Standalone Ship' })
                    : groupKey === 'package'
                      ? intl.formatMessage({ id: 'market.filter.shipPackage', defaultMessage: 'Ship Package' })
                      : groupKey === 'paint'
                        ? intl.formatMessage({ id: 'market.filter.paint', defaultMessage: 'Paint' })
                        : intl.formatMessage({ id: 'market.filter.other', defaultMessage: 'Other' });

                return (
                  <div key={groupKey} className='grid gap-3'>
                    <div className='flex items-center gap-3'>
                      <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary' }}>{groupTitle}</Typography>
                      <Chip label={items.length} size="small" sx={{ borderRadius: 0 }} />
                    </div>
                    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
                      {items.map(renderListingCard)}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </main>

        <CartDrawer
          open={cartOpen}
          cart={cart}
          ships={ships}
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
          <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} variant="filled">
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </div>
    </>
  );
}
