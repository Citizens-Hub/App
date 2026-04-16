import { useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
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
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowRightLeft, Archive, Minus, Plus, ShoppingCart } from 'lucide-react';
import useSWR from 'swr';
import { useApi, useMarketItemData } from '@/hooks';
import {
  CartItem as CartItemType,
  MarketPackageShip,
  ProfileData,
  Resource,
  Ship,
  ShipResponse,
} from '@/types';
import {
  buildMarketResource,
  getMarketItemVisual,
  MARKET_ITEM_PLACEHOLDER,
  toLargeRsiImage,
} from '@/components/marketItemDisplay';
import { useCartStore } from '@/hooks/useCartStore';
import CartDrawer from './components/CartDrawer';
import MarketItemMedia from './components/MarketItemMedia';
import { findShip, getAvailableStock, getListingBasePrice, getListingDiscountPercent } from './marketUtils';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

interface UserProfileResponse {
  user: ProfileData;
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;

  return (
    <div className='flex flex-col gap-1 rounded border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]'>
      <div className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400'>
        {label}
      </div>
      <div className='text-sm text-slate-800 dark:text-slate-100'>{value}</div>
    </div>
  );
}

function toAbsoluteRsiUrl(url?: string | null) {
  if (!url) return '';
  return url.startsWith('http') ? url : `https://robertsspaceindustries.com${url}`;
}

function stripRichText(value?: string | null) {
  if (!value) return '';

  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*[*-]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseShipValue(value?: string | null) {
  if (!value) return '';

  return value
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
}

function formatCrewRange(minCrew?: number | null, maxCrew?: number | null) {
  if (minCrew == null && maxCrew == null) return '';
  if (minCrew != null && maxCrew != null) {
    return minCrew === maxCrew ? `${minCrew}` : `${minCrew}-${maxCrew}`;
  }

  return `${minCrew ?? maxCrew ?? ''}`;
}

function formatMetricValue(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '';
  return Number.isInteger(value) ? `${value}` : `${value}`;
}

function buildDimensionSummary(ship?: Ship | null) {
  const length = formatMetricValue(ship?.details?.length);
  const beam = formatMetricValue(ship?.details?.beam);
  const height = formatMetricValue(ship?.details?.height);

  if (!length && !beam && !height) return '';

  return [length, beam, height].filter(Boolean).join(' × ') + ' m';
}

function formatUsdValue(value?: number | null, locale = 'en-US') {
  if (!value) return '';
  return (value / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' });
}

function formatShipStatus(ship?: Ship | null) {
  return ship?.flyableStatus || titleCaseShipValue(ship?.details?.productionStatus);
}

function normalizeComparisonValue(value?: string | null) {
  const normalized = value?.trim();
  return normalized || '-';
}

function resolveShipImage(ship?: Ship | null, fallbackImage?: string) {
  const thumbnailImage = ship?.details?.imageComposer?.find((entry) => entry.slot === 'thumbnail')?.url;

  return toAbsoluteRsiUrl(thumbnailImage)
    || toLargeRsiImage(ship?.medias?.productThumbMediumAndSmall)
    || toAbsoluteRsiUrl(ship?.medias?.slideShow)
    || fallbackImage
    || MARKET_ITEM_PLACEHOLDER;
}

type ShipComparisonRow = {
  label: string;
  fromValue: string;
  toValue: string;
  changed: boolean;
};

type ShipSpecRow = {
  label: string;
  value: string;
};

function ShipComparisonTable({
  currentShipName,
  newShipName,
  rows,
}: {
  currentShipName: string;
  newShipName: string;
  rows: ShipComparisonRow[];
}) {
  return (
    <div className='overflow-hidden rounded border border-gray-200 dark:border-gray-800'>
      <div className='overflow-x-auto'>
        <table className='min-w-full border-collapse text-sm'>
          <thead className='bg-slate-50 dark:bg-slate-950/70'>
            <tr>
              <th className='border-b border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:border-gray-800 dark:text-slate-400'>
                <FormattedMessage id="market.detail.compare.metric" defaultMessage="Metric" />
              </th>
              <th className='border-b border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:border-gray-800 dark:text-slate-400'>
                {currentShipName}
              </th>
              <th className='border-b border-gray-200 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:border-gray-800 dark:text-slate-400'>
                {newShipName}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className={row.changed
                  ? 'bg-blue-50/70 dark:bg-blue-950/20'
                  : 'bg-white dark:bg-transparent'}
              >
                <td className='border-b border-gray-200 px-4 py-3 font-medium text-slate-900 dark:border-gray-800 dark:text-slate-100'>
                  {row.label}
                </td>
                <td className='border-b border-gray-200 px-4 py-3 text-slate-700 dark:border-gray-800 dark:text-slate-300'>
                  {row.fromValue}
                </td>
                <td className='border-b border-gray-200 px-4 py-3 text-slate-900 dark:border-gray-800 dark:text-slate-100'>
                  <div className='flex items-center gap-2'>
                    <span>{row.toValue}</span>
                    {/* {row.changed && (
                      <Chip
                        size="small"
                        color="primary"
                        variant="outlined"
                        label={<FormattedMessage id="market.detail.compare.changed" defaultMessage="Changed" />}
                      />
                    )} */}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShipSpecsTable({
  rows,
}: {
  rows: ShipSpecRow[];
}) {
  const visibleRows = rows.filter((row) => row.value && row.value !== '-');

  if (visibleRows.length === 0) {
    return null;
  }

  return (
    <div className='overflow-hidden rounded border border-gray-200 dark:border-gray-800'>
      <div className='overflow-x-auto'>
        <table className='min-w-full border-collapse text-sm'>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.label} className='bg-white dark:bg-transparent'>
                <td className='w-[180px] border-b border-gray-200 bg-slate-50 px-4 py-3 font-medium text-slate-900 dark:border-gray-800 dark:bg-slate-950/70 dark:text-slate-100'>
                  {row.label}
                </td>
                <td className='border-b border-gray-200 px-4 py-3 text-slate-700 dark:border-gray-800 dark:text-slate-300'>
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShipIntroductionCard({
  eyebrow,
  ship,
  fallbackName,
  fallbackImage,
  fallbackDescription,
}: {
  eyebrow: string;
  ship?: Ship | null;
  fallbackName?: string;
  fallbackImage?: string;
  fallbackDescription?: string;
}) {
  const intl = useIntl();
  const title = ship?.name || fallbackName || '-';
  const imageUrl = resolveShipImage(ship, fallbackImage);
  const description = stripRichText(ship?.details?.body || ship?.details?.excerpt) || fallbackDescription || '';
  const metadata = [
    ship?.manufacturer?.name,
    ship?.focus,
    titleCaseShipValue(ship?.type),
    titleCaseShipValue(ship?.details?.size),
    formatShipStatus(ship),
  ].filter(Boolean) as string[];
  const specRows: ShipSpecRow[] = [
    {
      label: intl.formatMessage({ id: 'market.detail.compare.manufacturer', defaultMessage: 'Manufacturer' }),
      value: normalizeComparisonValue(ship?.manufacturer?.name),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.compare.focus', defaultMessage: 'Role / Focus' }),
      value: normalizeComparisonValue(ship?.focus),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.compare.type', defaultMessage: 'Type' }),
      value: normalizeComparisonValue(titleCaseShipValue(ship?.type)),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.compare.size', defaultMessage: 'Size' }),
      value: normalizeComparisonValue(titleCaseShipValue(ship?.details?.size)),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.compare.status', defaultMessage: 'Status' }),
      value: normalizeComparisonValue(formatShipStatus(ship)),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.crew', defaultMessage: 'Crew' }),
      value: normalizeComparisonValue(formatCrewRange(ship?.details?.minCrew, ship?.details?.maxCrew)),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.cargo', defaultMessage: 'Cargo' }),
      value: normalizeComparisonValue(ship?.details?.cargoCapacity != null ? `${formatMetricValue(ship.details.cargoCapacity)} SCU` : ''),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.scmSpeed', defaultMessage: 'SCM Speed' }),
      value: normalizeComparisonValue(ship?.details?.maxScmSpeed != null ? `${formatMetricValue(ship.details.maxScmSpeed)} m/s` : ''),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.afterburner', defaultMessage: 'Afterburner' }),
      value: normalizeComparisonValue(ship?.details?.afterburnerSpeed != null ? `${formatMetricValue(ship.details.afterburnerSpeed)} m/s` : ''),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.dimensions', defaultMessage: 'Dimensions' }),
      value: normalizeComparisonValue(buildDimensionSummary(ship)),
    },
    {
      label: intl.formatMessage({ id: 'ships.msrp', defaultMessage: 'MSRP' }),
      value: normalizeComparisonValue(formatUsdValue(ship?.msrp, intl.locale)),
    },
  ];

  return (
    <div className='overflow-hidden rounded border border-gray-200 bg-white dark:border-gray-800 dark:bg-slate-950'>
      <div className='flex flex-col'>
        <Box
          component="img"
          sx={{ width: '100%', height: { xs: 260, md: 360, lg: 420 }, objectFit: 'cover' }}
          src={imageUrl}
          alt={title}
        />

        <div className='flex flex-col gap-4 p-5'>
          <div className='flex flex-col gap-2'>
            <div className='text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400'>
              {eyebrow}
            </div>
            <div className='text-2xl font-semibold text-slate-900 dark:text-slate-100'>
              {title}
            </div>
            {metadata.length > 0 && (
              <div className='flex flex-wrap gap-2'>
                {metadata.map((entry) => (
                  <Chip key={`${title}-${entry}`} label={entry} size="small" variant="outlined" />
                ))}
              </div>
            )}
          </div>

          {description && (
            <div className='text-sm leading-7 text-slate-700 dark:text-slate-200'>
              {description}
            </div>
          )}

          <ShipSpecsTable rows={specRows} />
        </div>
      </div>
    </div>
  );
}

function usePackageShipDetails(shipIds: number[]) {
  const idsKey = shipIds.join(',');

  const { data, isLoading } = useSWR<Record<number, Ship>>(
    idsKey ? ['market-package-ship-details', idsKey] : null,
    async () => {
      const results = await Promise.allSettled(
        shipIds.map(async (shipId) => {
          const response = await fetch(`${API_BASE_URL}/api/ship?id=${shipId}`);

          if (!response.ok) {
            throw new Error(`Failed to load ship ${shipId}`);
          }

          const payload = await response.json() as ShipResponse;
          return payload.data.ship;
        }),
      );

      return results.reduce<Record<number, Ship>>((acc, result, index) => {
        if (result.status === 'fulfilled') {
          acc[shipIds[index]] = result.value;
        }

        return acc;
      }, {});
    },
  );

  return {
    shipDetailsById: data || {},
    isLoading,
  };
}

function PackageContentCard({
  imageUrl,
  eyebrow,
  title,
  subtitle,
  metadata = [],
}: {
  imageUrl?: string | null;
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  metadata?: string[];
}) {
  const filteredMetadata = metadata.filter(Boolean);

  return (
    <div className='overflow-hidden rounded border border-gray-200 bg-white dark:border-gray-800 dark:bg-slate-950'>
      {imageUrl ? (
        <Box
          component="img"
          sx={{ width: '100%', height: 160, objectFit: 'cover' }}
          src={imageUrl}
          alt={title}
        />
      ) : (
        <div className='flex h-40 items-center justify-center bg-slate-100 px-4 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:bg-slate-900 dark:text-slate-500'>
          {eyebrow}
        </div>
      )}

      <div className='flex flex-col gap-2 p-4'>
        <div className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400'>
          {eyebrow}
        </div>
        <div className='text-base font-semibold text-slate-900 dark:text-slate-100'>
          {title}
        </div>
        {subtitle && (
          <div className='text-sm text-slate-500 dark:text-slate-400'>
            {subtitle}
          </div>
        )}
        {filteredMetadata.length > 0 && (
          <div className='flex flex-wrap gap-2'>
            {filteredMetadata.map((entry, index) => (
              <Chip
                key={`${title}-${entry}-${index}`}
                label={entry}
                size="small"
                variant="outlined"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TextOnlyPackageItemRow({
  title,
  itemKind,
}: {
  title: string;
  itemKind?: string | null;
}) {
  return (
    <div className='flex items-start gap-3 px-4 py-3'>
      <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded border border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/80 dark:bg-blue-950/50 dark:text-blue-300'>
        <Archive className='h-4 w-4' />
      </div>
      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        {itemKind && (
          <div className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400'>
            {itemKind}
          </div>
        )}
        <div className='text-sm font-medium text-slate-900 dark:text-slate-100'>
          {title}
        </div>
      </div>
    </div>
  );
}

export default function MarketDetail() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { skuId } = useParams();
  const decodedSkuId = decodeURIComponent(skuId || '');
  const { item, ships, loading, error, notFound } = useMarketItemData(decodedSkuId);
  const { cart, cartOpen, addToCart, removeFromCart, openCart, closeCart, updateItemQuantity } = useCartStore();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  const normalizedPackageShips = useMemo<MarketPackageShip[]>(() => {
    if (!item || item.itemType !== 'package') return [];

    if ((item.packageShips?.length || 0) > 0) {
      return (item.packageShips || []).filter(ship => ship.shipId !== null);
    }

    if (item.shipId || item.shipName) {
      return [{
        shipId: item.shipId,
        shipName: item.shipName || item.name,
        sortOrder: 0,
      }];
    }

    return [];
  }, [item]);
  const packageShipDetailIds = useMemo(
    () => Array.from(new Set(
      normalizedPackageShips
        .map((ship) => ship.shipId)
        .filter((shipId): shipId is number => typeof shipId === 'number'),
    )).sort((a, b) => a - b),
    [normalizedPackageShips],
  );
  const { shipDetailsById: packageShipDetailsById, isLoading: packageShipDetailsLoading } = usePackageShipDetails(packageShipDetailIds);

  const { data: sellerProfileResponse } = useApi<UserProfileResponse>(
    item ? `/api/user/profile/${item.belongsTo}` : null,
  );
  const { data: fromShipResponse } = useApi<ShipResponse>(
    item?.itemType === 'ccu' && item.fromShipId ? `/api/ship?id=${item.fromShipId}` : null,
  );
  const { data: toShipResponse } = useApi<ShipResponse>(
    item?.itemType === 'ccu' && item.toShipId ? `/api/ship?id=${item.toShipId}` : null,
  );

  const seller = sellerProfileResponse?.user;

  const handleAddToCart = () => {
    if (!item) return;

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
    if (item?.skuId === resourceId) {
      return getAvailableStock(item);
    }

    return cart.find((cartItem) => cartItem.resource.id === resourceId)?.resource.marketAvailableStock ?? 0;
  };

  if (loading && !item && !notFound) {
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

  if (notFound || !item) {
    return (
      <div className='absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-y-auto bg-white px-4 py-4 text-left md:px-8 dark:bg-transparent'>
        <div className='mx-auto flex max-w-[1120px] flex-col gap-4'>
          <Button variant="text" onClick={() => navigate('/market')} sx={{ alignSelf: 'flex-start' }}>
            <FormattedMessage id="market.backToMarket" defaultMessage="Back to market" />
          </Button>
          <Alert severity="warning">
            <FormattedMessage id="market.itemNotFound" defaultMessage="This listing does not exist or has been removed." />
          </Alert>
        </div>
      </div>
    );
  }

  const visual = getMarketItemVisual(item, ships);
  const availableStock = getAvailableStock(item);
  const basePrice = getListingBasePrice(item, ships);
  const discount = getListingDiscountPercent(item, ships);
  const inCartItem = cart.find((cartItem: CartItemType) => cartItem.resource.id === item.skuId);
  const inCartQuantity = inCartItem?.quantity || 0;
  const fromShipInfo = fromShipResponse?.data.ship || visual.fromShip;
  const toShipInfo = toShipResponse?.data.ship || visual.toShip;
  const currentShipName = fromShipInfo?.name || visual.fromShipName || item.fromShipName || '-';
  const upgradedShipName = toShipInfo?.name || visual.toShipName || item.toShipName || '-';
  const comparisonRows: ShipComparisonRow[] = [
    {
      label: intl.formatMessage({ id: 'market.detail.compare.manufacturer', defaultMessage: 'Manufacturer' }),
      fromValue: normalizeComparisonValue(fromShipInfo?.manufacturer?.name),
      toValue: normalizeComparisonValue(toShipInfo?.manufacturer?.name),
      changed: normalizeComparisonValue(fromShipInfo?.manufacturer?.name) !== normalizeComparisonValue(toShipInfo?.manufacturer?.name),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.compare.focus', defaultMessage: 'Role / Focus' }),
      fromValue: normalizeComparisonValue(fromShipInfo?.focus),
      toValue: normalizeComparisonValue(toShipInfo?.focus),
      changed: normalizeComparisonValue(fromShipInfo?.focus) !== normalizeComparisonValue(toShipInfo?.focus),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.compare.type', defaultMessage: 'Type' }),
      fromValue: normalizeComparisonValue(titleCaseShipValue(fromShipInfo?.type)),
      toValue: normalizeComparisonValue(titleCaseShipValue(toShipInfo?.type)),
      changed: normalizeComparisonValue(titleCaseShipValue(fromShipInfo?.type)) !== normalizeComparisonValue(titleCaseShipValue(toShipInfo?.type)),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.compare.size', defaultMessage: 'Size' }),
      fromValue: normalizeComparisonValue(titleCaseShipValue(fromShipInfo?.details?.size)),
      toValue: normalizeComparisonValue(titleCaseShipValue(toShipInfo?.details?.size)),
      changed: normalizeComparisonValue(titleCaseShipValue(fromShipInfo?.details?.size)) !== normalizeComparisonValue(titleCaseShipValue(toShipInfo?.details?.size)),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.compare.status', defaultMessage: 'Status' }),
      fromValue: normalizeComparisonValue(formatShipStatus(fromShipInfo)),
      toValue: normalizeComparisonValue(formatShipStatus(toShipInfo)),
      changed: normalizeComparisonValue(formatShipStatus(fromShipInfo)) !== normalizeComparisonValue(formatShipStatus(toShipInfo)),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.crew', defaultMessage: 'Crew' }),
      fromValue: normalizeComparisonValue(formatCrewRange(fromShipInfo?.details?.minCrew, fromShipInfo?.details?.maxCrew)),
      toValue: normalizeComparisonValue(formatCrewRange(toShipInfo?.details?.minCrew, toShipInfo?.details?.maxCrew)),
      changed: normalizeComparisonValue(formatCrewRange(fromShipInfo?.details?.minCrew, fromShipInfo?.details?.maxCrew)) !== normalizeComparisonValue(formatCrewRange(toShipInfo?.details?.minCrew, toShipInfo?.details?.maxCrew)),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.cargo', defaultMessage: 'Cargo' }),
      fromValue: normalizeComparisonValue(fromShipInfo?.details?.cargoCapacity != null ? `${formatMetricValue(fromShipInfo.details.cargoCapacity)} SCU` : ''),
      toValue: normalizeComparisonValue(toShipInfo?.details?.cargoCapacity != null ? `${formatMetricValue(toShipInfo.details.cargoCapacity)} SCU` : ''),
      changed: normalizeComparisonValue(fromShipInfo?.details?.cargoCapacity != null ? `${formatMetricValue(fromShipInfo.details.cargoCapacity)} SCU` : '') !== normalizeComparisonValue(toShipInfo?.details?.cargoCapacity != null ? `${formatMetricValue(toShipInfo.details.cargoCapacity)} SCU` : ''),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.scmSpeed', defaultMessage: 'SCM Speed' }),
      fromValue: normalizeComparisonValue(fromShipInfo?.details?.maxScmSpeed != null ? `${formatMetricValue(fromShipInfo.details.maxScmSpeed)} m/s` : ''),
      toValue: normalizeComparisonValue(toShipInfo?.details?.maxScmSpeed != null ? `${formatMetricValue(toShipInfo.details.maxScmSpeed)} m/s` : ''),
      changed: normalizeComparisonValue(fromShipInfo?.details?.maxScmSpeed != null ? `${formatMetricValue(fromShipInfo.details.maxScmSpeed)} m/s` : '') !== normalizeComparisonValue(toShipInfo?.details?.maxScmSpeed != null ? `${formatMetricValue(toShipInfo.details.maxScmSpeed)} m/s` : ''),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.afterburner', defaultMessage: 'Afterburner' }),
      fromValue: normalizeComparisonValue(fromShipInfo?.details?.afterburnerSpeed != null ? `${formatMetricValue(fromShipInfo.details.afterburnerSpeed)} m/s` : ''),
      toValue: normalizeComparisonValue(toShipInfo?.details?.afterburnerSpeed != null ? `${formatMetricValue(toShipInfo.details.afterburnerSpeed)} m/s` : ''),
      changed: normalizeComparisonValue(fromShipInfo?.details?.afterburnerSpeed != null ? `${formatMetricValue(fromShipInfo.details.afterburnerSpeed)} m/s` : '') !== normalizeComparisonValue(toShipInfo?.details?.afterburnerSpeed != null ? `${formatMetricValue(toShipInfo.details.afterburnerSpeed)} m/s` : ''),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.dimensions', defaultMessage: 'Dimensions' }),
      fromValue: normalizeComparisonValue(buildDimensionSummary(fromShipInfo)),
      toValue: normalizeComparisonValue(buildDimensionSummary(toShipInfo)),
      changed: normalizeComparisonValue(buildDimensionSummary(fromShipInfo)) !== normalizeComparisonValue(buildDimensionSummary(toShipInfo)),
    },
    {
      label: intl.formatMessage({ id: 'ships.msrp', defaultMessage: 'MSRP' }),
      fromValue: normalizeComparisonValue(formatUsdValue(fromShipInfo?.msrp, intl.locale)),
      toValue: normalizeComparisonValue(formatUsdValue(toShipInfo?.msrp, intl.locale)),
      changed: normalizeComparisonValue(formatUsdValue(fromShipInfo?.msrp, intl.locale)) !== normalizeComparisonValue(formatUsdValue(toShipInfo?.msrp, intl.locale)),
    },
  ];
  const packageShips = normalizedPackageShips;
  const packageItems = item.packageItems || [];
  const packageItemsWithImage = packageItems.filter((entry) => entry.imageUrl !== "https://robertsspaceindustries.com/undefined");
  const packageItemsWithoutImage = packageItems.filter((entry) => entry.imageUrl === "https://robertsspaceindustries.com/undefined");
  // const formattedCreatedAt = new Date(item.createdAt).toLocaleString(intl.locale);

  return (
    <div className='absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-y-auto bg-white px-4 py-4 text-left md:px-8 dark:bg-transparent'>
      <div className='mx-auto flex w-full max-w-[1280px] flex-col gap-4'>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
          <div className='flex flex-col gap-2'>
            <Button variant="text" onClick={() => navigate('/market')} sx={{ alignSelf: 'flex-start', px: 0 }}>
              <FormattedMessage id="market.backToMarket" defaultMessage="Back to market" />
            </Button>
            <Typography variant="h5">
              {item.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {item.itemType === 'ccu'
                ? `${visual.fromShipName || item.fromShipName || '-'} → ${visual.toShipName || item.toShipName || '-'}`
                : [visual.shipName || item.shipName, item.packageKind, item.insuranceType].filter(Boolean).join(' · ') || item.description || item.externalRef || ''}
            </Typography>
          </div>

          <div className='flex items-center gap-3'>
            <Link to="/orders" className='rounded border border-black/10 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'>
              <FormattedMessage id="market.myOrders" defaultMessage="My Orders" />
            </Link>
            <IconButton
              onClick={openCart}
              sx={{ border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', borderRadius: 1 }}
            >
              <Badge badgeContent={cart.length} color="secondary" overlap="circular">
                <ShoppingCart className='h-6 w-6' />
              </Badge>
            </IconButton>
          </div>
        </Box>

        <div className='grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,_1fr)_360px]'>
          <div className='flex flex-col gap-6'>
            <div className='overflow-hidden rounded border border-gray-200 bg-white dark:border-gray-800 dark:bg-slate-900'>
              <MarketItemMedia
                item={item}
                ships={ships}
                height={460}
                badgeText={discount ? `${discount}% off` : null}
              />
            </div>

            <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
              <DetailField label={intl.formatMessage({ id: 'market.detail.type', defaultMessage: 'Type' })} value={item.itemType} />
              <DetailField label={intl.formatMessage({ id: 'market.detail.insurance', defaultMessage: 'Insurance' })} value={item.insuranceType || '-'} />
            </div>

            <div className='rounded border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-slate-900'>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                <FormattedMessage id="market.detail.productInfo" defaultMessage="Product Details" />
              </Typography>

              {/* <div className='flex flex-wrap gap-2'>
                <Chip label={item.itemType} size="small" />
                {item.packageKind && <Chip label={item.packageKind} size="small" variant="outlined" />}
                {item.canGift && (
                  <Chip
                    size="small"
                    color="success"
                    label={intl.formatMessage({ id: 'market.canGift', defaultMessage: 'Giftable' })}
                  />
                )}
                {item.isBuyBack && (
                  <Chip
                    size="small"
                    color="warning"
                    label={intl.formatMessage({ id: 'market.filter.buyback', defaultMessage: 'Buyback' })}
                  />
                )}
              </div>

              <Divider sx={{ my: 3 }} /> */}

              {item.itemType === 'ccu' && (
                <div className='flex flex-col gap-6'>
                  <div className='flex flex-col gap-3'>
                    <div className='flex items-center gap-2 text-slate-900 dark:text-slate-100'>
                      <ArrowRightLeft className='h-4 w-4' />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        <FormattedMessage id="market.detail.compare.title" defaultMessage="Ship Upgrade Comparison" />
                      </Typography>
                    </div>
                    <div className='text-sm text-slate-500 dark:text-slate-400'>
                      <FormattedMessage
                        id="market.detail.compare.description"
                        defaultMessage="Compare the current ship and the upgraded ship side by side before placing the order."
                      />
                    </div>

                    <ShipComparisonTable
                      currentShipName={currentShipName}
                      newShipName={upgradedShipName}
                      rows={comparisonRows}
                    />
                  </div>

                  <div className='flex flex-col gap-3'>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      <FormattedMessage id="market.detail.upgradeShipDetails" defaultMessage="Upgraded Ship Details" />
                    </Typography>

                    <ShipIntroductionCard
                      eyebrow={intl.formatMessage({ id: 'market.detail.upgradeShip', defaultMessage: 'Upgraded Ship' })}
                      ship={toShipInfo}
                      fallbackName={upgradedShipName}
                      fallbackImage={visual.toImage || MARKET_ITEM_PLACEHOLDER}
                      fallbackDescription={item.description}
                    />
                  </div>
                </div>
              )}

              {item.itemType === 'package' && (
                <div className='flex flex-col gap-4'>
                  {(packageShips.length > 0 || packageItems.length > 0) && (
                    <div className='flex flex-col gap-2'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          <FormattedMessage
                            id="market.detail.bundleContents"
                            defaultMessage={item.packageKind === 'bundle' ? 'Bundle Contents' : 'Package Contents'}
                          />
                        </Typography>
                        {/* {packageShips.length > 0 && (
                          <Chip
                            size="small"
                            label={intl.formatMessage(
                              { id: 'market.detail.shipCount', defaultMessage: '{count} ships' },
                              { count: packageShips.length },
                            )}
                          />
                        )}
                        {packageItems.length > 0 && (
                          <Chip
                            size="small"
                            label={intl.formatMessage(
                              { id: 'market.detail.extraCount', defaultMessage: '{count} extras' },
                              { count: packageItems.length },
                            )}
                          />
                        )} */}
                      </div>
                      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'>
                        {packageShips.map((ship) => {
                          const shipInfo = findShip(ships, ship.shipId, ship.shipName);
                          const shipImage = toLargeRsiImage(shipInfo?.medias?.productThumbMediumAndSmall) || MARKET_ITEM_PLACEHOLDER;
                          const msrpText = shipInfo?.msrp
                            ? (shipInfo.msrp / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })
                            : null;

                          return (
                            <PackageContentCard
                              key={`${item.skuId}-${ship.sortOrder}-${ship.shipName}`}
                              imageUrl={shipImage}
                              eyebrow={intl.formatMessage({ id: 'market.detail.ship', defaultMessage: 'Ship' })}
                              title={ship.shipName}
                              subtitle={shipInfo?.manufacturer?.name || shipInfo?.type || null}
                              metadata={[
                                msrpText
                                  ? intl.formatMessage(
                                      { id: 'market.detail.shipMsrp', defaultMessage: 'MSRP {price}' },
                                      { price: msrpText },
                                    )
                                  : '',
                                item.insuranceType
                                  ? intl.formatMessage(
                                      { id: 'market.detail.shipInsurance', defaultMessage: 'Insurance {insurance}' },
                                      { insurance: item.insuranceType },
                                    )
                                  : '',
                              ]}
                            />
                          );
                        })}

                        {packageItemsWithImage.map((entry) => (
                          <PackageContentCard
                            key={`${item.skuId}-${entry.sortOrder}-${entry.itemName}`}
                            imageUrl={entry.imageUrl ? toLargeRsiImage(entry.imageUrl) || entry.imageUrl : null}
                            eyebrow={entry.itemKind || intl.formatMessage({ id: 'market.detail.extra', defaultMessage: 'Extra' })}
                            title={entry.itemName}
                            subtitle={entry.itemKind || null}
                          />
                        ))}
                      </div>

                      {packageItemsWithoutImage.length > 0 && (
                        <div className='mt-2 flex flex-col gap-2'>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            <FormattedMessage
                              id="market.detail.additionalItems"
                              defaultMessage="Additional Included Items"
                            />
                          </Typography>
                          <div className='overflow-hidden rounded border border-gray-200 bg-white dark:border-gray-800 dark:bg-slate-950'>
                            {packageItemsWithoutImage.map((entry, index) => (
                              <div
                                key={`${item.skuId}-textonly-${entry.sortOrder}-${entry.itemName}`}
                                className={index > 0 ? 'border-t border-gray-200 dark:border-gray-800' : ''}
                              >
                                <TextOnlyPackageItemRow
                                  title={entry.itemName}
                                  itemKind={entry.itemKind || intl.formatMessage({ id: 'market.detail.extra', defaultMessage: 'Extra' })}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {packageShips.length > 0 && (
                        <div className='mt-4 flex flex-col gap-4'>
                          <div className='flex items-center justify-between gap-3'>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              <FormattedMessage
                                id="market.detail.includedShipDetails"
                                defaultMessage="Included Ship Details"
                              />
                            </Typography>
                            {packageShipDetailsLoading && (
                              <div className='text-xs text-slate-500 dark:text-slate-400'>
                                <FormattedMessage
                                  id="market.detail.loadingShipDescriptions"
                                  defaultMessage="Loading ship descriptions..."
                                />
                              </div>
                            )}
                          </div>

                          <div className='flex flex-col gap-4'>
                            {packageShips.map((packageShip) => {
                              const detailedShip = packageShip.shipId ? packageShipDetailsById[packageShip.shipId] : undefined;
                              const fallbackShip = findShip(ships, packageShip.shipId, packageShip.shipName);
                              const shipInfo = detailedShip || fallbackShip;
                              const shipImage = resolveShipImage(shipInfo, toLargeRsiImage(fallbackShip?.medias?.productThumbMediumAndSmall) || MARKET_ITEM_PLACEHOLDER);

                              return (
                                <ShipIntroductionCard
                                  key={`${item.skuId}-ship-detail-${packageShip.sortOrder}-${packageShip.shipName}`}
                                  eyebrow={intl.formatMessage({ id: 'market.detail.includedShip', defaultMessage: 'Included Ship' })}
                                  ship={shipInfo}
                                  fallbackName={packageShip.shipName}
                                  fallbackImage={shipImage}
                                />
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {item.description && (
                <div className='mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200'>
                  {item.description}
                </div>
              )}
            </div>
          </div>

          <div className='flex flex-col gap-6 xl:sticky xl:top-4 xl:self-start'>
            <div className='rounded border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-slate-900'>
              <div className='flex flex-col gap-3'>
                <div className='text-2xl font-semibold text-slate-900 dark:text-slate-100'>
                  US${item.price.toFixed(2)}
                </div>
                {discount && Number(discount) > 0 && (
                  <div className='text-sm text-slate-500 line-through dark:text-slate-400'>
                    US${basePrice.toFixed(2)}
                  </div>
                )}
                <div className='text-sm text-slate-500 dark:text-slate-400'>
                  <span>
                    <span><FormattedMessage id="market.available" defaultMessage="Available Stock" /></span>
                    <span>:</span>
                  </span>
                  <span className='font-semibold text-[#1d4ed8]'> {availableStock}</span>
                </div>
              </div>

              <Divider sx={{ my: 3 }} />

              {inCartItem ? (
                <div className='flex flex-col gap-3'>
                  <ButtonGroup size="small" aria-label="quantity">
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

                  <Button variant="outlined" onClick={openCart}>
                    <FormattedMessage id="market.openCart" defaultMessage="Open cart" />
                  </Button>
                </div>
              ) : (
                <div className='flex flex-col gap-3'>
                  <Button
                    variant="outlined"
                    onClick={handleAddToCart}
                    disabled={availableStock <= 0}
                  >
                    <FormattedMessage id="market.addToCart" defaultMessage="Add to cart" />
                  </Button>
                  <Button variant="outlined" onClick={openCart}>
                    <FormattedMessage id="market.openCart" defaultMessage="Open cart" />
                  </Button>
                </div>
              )}
            </div>

            <div className='rounded border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-slate-900'>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                <FormattedMessage id="market.sellerInfo" defaultMessage="Seller" />
              </Typography>

              <div className='flex items-center gap-3'>
                <Avatar src={seller?.avatar || ''} alt={seller?.name || item.belongsTo} sx={{ width: 56, height: 56 }} />
                <div className='flex flex-col'>
                  <div className='text-base font-semibold text-slate-900 dark:text-slate-100'>
                    {seller?.name || `Seller ${item.belongsTo}`}
                  </div>
                </div>
              </div>

              {/* {seller?.description && (
                <div className='mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200'>
                  {seller.description}
                </div>
              )} */}

              <div className='mt-4 flex flex-col gap-2'>
                {seller?.sharedHangar && (
                  <Button variant="outlined" onClick={() => navigate(`/share/hangar/${item.belongsTo}`)}>
                    <FormattedMessage id="market.viewSellerHangar" defaultMessage="View seller hangar" />
                  </Button>
                )}
                {seller?.homepage && (
                  <Button variant="text" component="a" href={seller.homepage} target="_blank" rel="noreferrer">
                    <FormattedMessage id="market.visitHomepage" defaultMessage="Visit homepage" />
                  </Button>
                )}
              </div>

              {seller?.contacts && (
                <div className='mt-4 rounded border border-dashed border-black/10 p-4 text-sm text-slate-700 dark:border-white/10 dark:text-slate-200'>
                  {seller.contacts}
                </div>
              )}
            </div>
          </div>
        </div>
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
    </div>
  );
}
