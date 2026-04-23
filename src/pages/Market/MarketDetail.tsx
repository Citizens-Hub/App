import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  // Avatar,
  Badge,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  MenuItem,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowRightLeft, Archive, Minus, Plus, ShoppingCart } from 'lucide-react';
import useSWR from 'swr';
import RsiIcon from '@/components/RsiIcon';
import { useLocale } from '@/contexts/LocaleContext';
import { useApi, useMarketItemData } from '@/hooks';
import {
  CartItem as CartItemType,
  ListingItem,
  MarketItemVariant,
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
import {
  getShipMetricIconPath,
  resolveShipFocusIconPath,
} from '@/data/rsiIcons';
import { localizeShipDataLabel } from '@/data/shipDetailLabelI18n';
import { localizeShipFocus, localizeShipSize, localizeShipStatus, localizeShipType } from '@/data/shipMetadataI18n';
import { useCartStore } from '@/hooks/useCartStore';
import { appendShipLocaleToPath } from '@/hooks/swr/shipLocale';
import { getShipDisplayName } from '@/utils/shipDisplay';
import CartDrawer from './components/CartDrawer';
import MarketItemMedia from './components/MarketItemMedia';
import { findShip, getAvailableStock, getListingBasePrice, getListingDiscountPercent } from './marketUtils';
import {
  formatCreditAmountSummary,
  formatCreditFaceValueSummary,
  formatCreditOptionLabel,
  formatCreditPriceFormula,
  formatMarketCreditResourceName,
  formatMarketDiscount,
  formatUsdPrice,
  getMarketItemTypeLabel,
} from './marketI18n';
import {
  getLocalizedMarketItemShipNames,
  getMarketItemDisplayName,
  getMarketItemSummary,
} from './marketDisplayI18n';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

interface UserProfileResponse {
  user: ProfileData;
}

function DetailField({ label, value }: { label: string; value?: string | null; }) {
  if (!value) return null;

  return (
    <div className='flex items-start gap-3 rounded border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]'>
      {/* <RsiIcon src={iconSrc} className='mt-0.5 h-5 w-5' /> */}
      <div className='min-w-0 flex-1'>
        <div className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400'>
          {label}
        </div>
        <div className='text-sm text-slate-800 dark:text-slate-100'>{value}</div>
      </div>
    </div>
  );
}

function toAbsoluteRsiUrl(url?: string | null) {
  if (!url) return '';
  return url.startsWith('http') ? url : `https://robertsspaceindustries.com${url}`;
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

function normalizeComparisonValue(value?: string | null) {
  const normalized = value?.trim();
  return normalized || '-';
}

function getAvailableUnits(stock: number, lockedStock: number) {
  return Math.max(stock - lockedStock, 0);
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
  iconSrc?: string | null;
};

type ShipSpecRow = {
  label: string;
  value: string;
  iconSrc?: string | null;
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
          <thead className='bg-neutral-50 dark:bg-neutral-950/70'>
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
                  <div className='flex items-center gap-2'>
                    <RsiIcon src={row.iconSrc} className='h-4 w-4' />
                    <span>{row.label}</span>
                  </div>
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
                <td className='w-[180px] border-b border-gray-200 bg-neutral-50 px-4 py-3 font-medium text-slate-900 dark:border-gray-800 dark:bg-neutral-950/70 dark:text-slate-100'>
                  <div className='flex items-center gap-2'>
                    <RsiIcon src={row.iconSrc} className='h-4 w-4' />
                    <span>{row.label}</span>
                  </div>
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
  const { locale } = useLocale();
  const title = ship?.name || fallbackName || '-';
  const imageUrl = resolveShipImage(ship, fallbackImage);
  const descriptionMarkdown = (ship?.details?.body || ship?.details?.excerpt || fallbackDescription || '').trim();
  const localizedType = localizeShipType(locale, ship?.type);
  const localizedSize = localizeShipSize(locale, ship?.details?.size);
  const localizedStatus = localizeShipStatus(locale, ship);
  const localizedFocus = localizeShipFocus(locale, ship?.focus);
  const metadata = [
    ship?.manufacturer?.name,
    localizedFocus,
    localizedType,
    localizedSize,
    localizedStatus,
  ].filter(Boolean) as string[];
  const specRows: ShipSpecRow[] = [
    {
      label: localizeShipDataLabel(locale, 'manufacturer'),
      value: normalizeComparisonValue(ship?.manufacturer?.name),
    },
    {
      label: localizeShipDataLabel(locale, 'focus'),
      value: normalizeComparisonValue(localizedFocus),
      iconSrc: resolveShipFocusIconPath(ship?.focus),
    },
    {
      label: localizeShipDataLabel(locale, 'type'),
      value: normalizeComparisonValue(localizedType),
      iconSrc: getShipMetricIconPath('type', ship?.type),
    },
    {
      label: localizeShipDataLabel(locale, 'size'),
      value: normalizeComparisonValue(localizedSize),
      iconSrc: getShipMetricIconPath('size'),
    },
    {
      label: localizeShipDataLabel(locale, 'status'),
      value: normalizeComparisonValue(localizedStatus),
      iconSrc: getShipMetricIconPath('status'),
    },
    {
      label: localizeShipDataLabel(locale, 'crew'),
      value: normalizeComparisonValue(formatCrewRange(ship?.details?.minCrew, ship?.details?.maxCrew)),
      iconSrc: getShipMetricIconPath('crew'),
    },
    {
      label: localizeShipDataLabel(locale, 'cargo'),
      value: normalizeComparisonValue(ship?.details?.cargoCapacity != null ? `${formatMetricValue(ship.details.cargoCapacity)} SCU` : ''),
      iconSrc: getShipMetricIconPath('cargo'),
    },
    {
      label: localizeShipDataLabel(locale, 'scmSpeed'),
      value: normalizeComparisonValue(ship?.details?.maxScmSpeed != null ? `${formatMetricValue(ship.details.maxScmSpeed)} m/s` : ''),
      iconSrc: getShipMetricIconPath('scmSpeed'),
    },
    {
      label: localizeShipDataLabel(locale, 'afterburner'),
      value: normalizeComparisonValue(ship?.details?.afterburnerSpeed != null ? `${formatMetricValue(ship.details.afterburnerSpeed)} m/s` : ''),
      iconSrc: getShipMetricIconPath('afterburner'),
    },
    {
      label: localizeShipDataLabel(locale, 'dimensions'),
      value: normalizeComparisonValue(buildDimensionSummary(ship)),
      iconSrc: getShipMetricIconPath('dimensions'),
    },
    {
      label: localizeShipDataLabel(locale, 'msrp'),
      value: normalizeComparisonValue(formatUsdValue(ship?.msrp, intl.locale)),
      iconSrc: getShipMetricIconPath('msrp'),
    },
  ];

  return (
    <div className='overflow-hidden rounded border border-gray-200 bg-white dark:border-gray-800 dark:bg-neutral-950'>
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
            <div className='flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100'>
              <span>{title}</span>
            </div>
            {metadata.length > 0 && (
              <div className='flex flex-wrap gap-2'>
                {metadata.map((entry) => (
                  <Chip key={`${title}-${entry}`} label={entry} size="small" variant="outlined" />
                ))}
              </div>
            )}
          </div>

          {descriptionMarkdown && (
            <div className='ship-info-description-markdown text-sm leading-7 text-slate-700 dark:text-slate-200'>
              <MarkdownPreview
                source={descriptionMarkdown}
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
          )}

          <ShipSpecsTable rows={specRows} />
        </div>
      </div>
    </div>
  );
}

function usePackageShipDetails(shipIds: number[], locale: ReturnType<typeof useLocale>['locale']) {
  const idsKey = shipIds.join(',');
  const localizedRequestPaths = shipIds.map((shipId) => appendShipLocaleToPath(`/api/ship?id=${shipId}`, locale));

  const { data, isLoading } = useSWR<Record<number, Ship>>(
    idsKey ? ['market-package-ship-details', idsKey, locale] : null,
    async () => {
      const results = await Promise.allSettled(
        shipIds.map(async (shipId, index) => {
          const requestPath = localizedRequestPaths[index];
          const response = await fetch(`${API_BASE_URL}${requestPath}`);

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
    <div className='overflow-hidden rounded border border-gray-200 bg-white dark:border-gray-800 dark:bg-neutral-950'>
      {imageUrl ? (
        <Box
          component="img"
          sx={{ width: '100%', height: 160, objectFit: 'cover' }}
          src={imageUrl}
          alt={title}
        />
      ) : (
        <div className='flex h-40 items-center justify-center bg-neutral-100 px-4 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:bg-neutral-900 dark:text-slate-500'>
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
  const { locale } = useLocale();
  const navigate = useNavigate();
  const { skuId } = useParams();
  const decodedSkuId = decodeURIComponent(skuId || '');
  const { item, ships, loading, error, notFound } = useMarketItemData(decodedSkuId);
  const { cart, cartOpen, addToCart, removeFromCart, openCart, closeCart, updateItemQuantity } = useCartStore();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  const [selectedCcuCost, setSelectedCcuCost] = useState<number | ''>('');
  const [selectedCcuSellerId, setSelectedCcuSellerId] = useState('');
  const ccuVariants = useMemo<MarketItemVariant[]>(() => {
    if (!item || item.itemType !== 'ccu') {
      return [];
    }

    if (item.variants?.length) {
      return item.variants;
    }

    return [{
      skuId: item.skuId,
      name: item.name,
      price: item.price,
      cost: item.cost,
      itemType: 'ccu',
      stock: item.stock,
      lockedStock: item.lockedStock,
      sourceKind: item.sourceKind,
      belongsTo: item.belongsTo,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      deletedAt: null,
      fromShipId: item.fromShipId,
      toShipId: item.toShipId,
      fromShipName: item.fromShipName,
      toShipName: item.toShipName,
      toSkuId: item.toSkuId,
      imageUrl: item.imageUrl,
      fromImageUrl: item.fromImageUrl,
      toImageUrl: item.toImageUrl,
      seller: item.seller || null,
    }];
  }, [item]);
  const ccuSellerIds = useMemo(
    () => Array.from(new Set(ccuVariants.map((variant) => variant.belongsTo).filter(Boolean))).sort(),
    [ccuVariants],
  );
  const { data: ccuSellerProfiles = {} } = useSWR<Record<string, ProfileData>>(
    ccuSellerIds.length ? ['market-ccu-seller-profiles', ccuSellerIds.join(',')] : null,
    async () => {
      const results = await Promise.allSettled(
        ccuSellerIds.map(async (sellerId) => {
          const response = await fetch(`${API_BASE_URL}/api/user/profile/${sellerId}`);

          if (!response.ok) {
            throw new Error(`Failed to load seller profile ${sellerId}`);
          }

          const payload = await response.json() as UserProfileResponse;
          return [sellerId, payload.user] as const;
        }),
      );

      return results.reduce<Record<string, ProfileData>>((acc, result) => {
        if (result.status === 'fulfilled') {
          const [sellerId, profile] = result.value;
          acc[sellerId] = profile;
        }

        return acc;
      }, {});
    },
  );
  const variantsMatchingSelectedSeller = useMemo(
    () => (selectedCcuSellerId
      ? ccuVariants.filter((variant) => variant.belongsTo === selectedCcuSellerId)
      : ccuVariants),
    [ccuVariants, selectedCcuSellerId],
  );
  const ccuCostOptions = useMemo(
    () => Array.from(new Set(
      variantsMatchingSelectedSeller
        .map((variant) => variant.cost)
        .filter((cost): cost is number => typeof cost === 'number' && Number.isFinite(cost)),
    )).sort((left, right) => left - right),
    [variantsMatchingSelectedSeller],
  );
  const variantsMatchingSelectedCost = useMemo(
    () => (typeof selectedCcuCost === 'number'
      ? ccuVariants.filter((variant) => variant.cost === selectedCcuCost)
      : ccuVariants),
    [ccuVariants, selectedCcuCost],
  );
  const ccuSellerOptions = useMemo(() => {
    const sellers = Array.from(new Set(variantsMatchingSelectedCost.map((variant) => variant.belongsTo).filter(Boolean)));

    return sellers
      .map((sellerId) => {
        const profile = ccuSellerProfiles[sellerId];
        const fallbackEmail = ccuVariants.find((variant) => variant.belongsTo === sellerId)?.seller?.email || '';
        const label = profile?.name?.trim()
          || profile?.email?.trim()
          || fallbackEmail
          || intl.formatMessage({ id: 'market.sellerUnknown', defaultMessage: 'Seller' });

        return { sellerId, label };
      })
      .sort((left, right) => left.label.localeCompare(right.label, intl.locale));
  }, [ccuSellerProfiles, ccuVariants, intl, variantsMatchingSelectedCost]);
  const matchingCcuVariants = useMemo(
    () => ccuVariants.filter((variant) => (
      (typeof selectedCcuCost !== 'number' || variant.cost === selectedCcuCost)
      && (!selectedCcuSellerId || variant.belongsTo === selectedCcuSellerId)
    )),
    [ccuVariants, selectedCcuCost, selectedCcuSellerId],
  );
  const selectedCcuVariant = useMemo(() => {
    if (!matchingCcuVariants.length) {
      return null;
    }

    const inStockVariants = matchingCcuVariants.filter((variant) => getAvailableUnits(variant.stock, variant.lockedStock) > 0);
    const candidateVariants = inStockVariants.length ? inStockVariants : matchingCcuVariants;

    return [...candidateVariants].sort((left, right) => {
      if (left.price !== right.price) {
        return left.price - right.price;
      }

      const leftCost = typeof left.cost === 'number' ? left.cost : Number.POSITIVE_INFINITY;
      const rightCost = typeof right.cost === 'number' ? right.cost : Number.POSITIVE_INFINITY;
      if (leftCost !== rightCost) {
        return leftCost - rightCost;
      }

      const stockDiff = getAvailableUnits(right.stock, right.lockedStock) - getAvailableUnits(left.stock, left.lockedStock);
      if (stockDiff !== 0) {
        return stockDiff;
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    })[0] || null;
  }, [matchingCcuVariants]);
  const activeItem = useMemo<ListingItem | null>(() => {
    if (!item) {
      return null;
    }

    if (item.itemType !== 'ccu' || !selectedCcuVariant) {
      return item;
    }

    return {
      ...item,
      ...selectedCcuVariant,
      name: item.name,
      variantCount: item.variantCount,
      variants: item.variants,
    };
  }, [item, selectedCcuVariant]);

  useEffect(() => {
    if (typeof selectedCcuCost === 'number' && !ccuCostOptions.includes(selectedCcuCost)) {
      setSelectedCcuCost('');
    }
  }, [ccuCostOptions, selectedCcuCost]);

  useEffect(() => {
    if (selectedCcuSellerId && !ccuSellerOptions.some((option) => option.sellerId === selectedCcuSellerId)) {
      setSelectedCcuSellerId('');
    }
  }, [ccuSellerOptions, selectedCcuSellerId]);

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
  const { shipDetailsById: packageShipDetailsById, isLoading: packageShipDetailsLoading } = usePackageShipDetails(packageShipDetailIds, locale);

  // const { data: sellerProfileResponse } = useApi<UserProfileResponse>(
  //   activeItem && activeItem.itemType !== 'credit' ? `/api/user/profile/${activeItem.belongsTo}` : null,
  // );
  const { data: fromShipResponse } = useApi<ShipResponse>(
    activeItem?.itemType === 'ccu' && activeItem.fromShipId ? `/api/ship?id=${activeItem.fromShipId}` : null,
  );
  const { data: toShipResponse } = useApi<ShipResponse>(
    activeItem?.itemType === 'ccu' && activeItem.toShipId ? `/api/ship?id=${activeItem.toShipId}` : null,
  );

  // const seller = sellerProfileResponse?.user;
  // const activeSellerProfile = item?.itemType === 'ccu'
  //   ? (activeItem ? ccuSellerProfiles[activeItem.belongsTo] || seller || null : null)
  //   : seller || null;
  // const activeSellerName = useMemo(() => {
  //   if (item?.itemType === 'credit') {
  //     return intl.formatMessage({ id: 'market.credit.poolTitle', defaultMessage: 'Assigned after payment' });
  //   }

  //   const fallbackEmail = item?.itemType === 'ccu'
  //     ? ccuVariants.find((variant) => variant.belongsTo === activeItem?.belongsTo)?.seller?.email
  //     : undefined;

  //   return activeSellerProfile?.name?.trim()
  //     || activeSellerProfile?.email?.trim()
  //     || fallbackEmail
  //     || intl.formatMessage({ id: 'market.sellerUnknown', defaultMessage: 'Seller' });
  // }, [activeItem?.belongsTo, activeSellerProfile, ccuVariants, intl, item?.itemType]);
  const [selectedCreditAmount, setSelectedCreditAmount] = useState<number | ''>('');
  const resolvedCreditOptions = useMemo(() => {
    if (item?.itemType !== 'credit') {
      return [];
    }

    if (item.creditOptions?.length) {
      return item.creditOptions;
    }

    if (
      typeof item.creditAmount === 'number'
      && typeof item.discountRateBps === 'number'
      && typeof item.sellerCount === 'number'
    ) {
      return [{
        amount: item.creditAmount,
        price: item.price,
        discountRateBps: item.discountRateBps,
        sellerCount: item.sellerCount,
      }];
    }

    return [];
  }, [item]);

  useEffect(() => {
    if (item?.itemType !== 'credit' || !resolvedCreditOptions.length) {
      setSelectedCreditAmount('');
      return;
    }

    setSelectedCreditAmount((currentValue) => {
      if (typeof currentValue === 'number' && resolvedCreditOptions.some((option) => option.amount === currentValue)) {
        return currentValue;
      }

      return resolvedCreditOptions[0].amount;
    });
  }, [item, resolvedCreditOptions]);

  const selectedCreditOption = useMemo(() => {
    if (item?.itemType !== 'credit') {
      return null;
    }

    return resolvedCreditOptions.find((option) => option.amount === selectedCreditAmount) || resolvedCreditOptions[0] || null;
  }, [item, resolvedCreditOptions, selectedCreditAmount]);

  const handleAddToCart = () => {
    if (!item) return;

    if (item.itemType === 'credit') {
      if (!selectedCreditOption) {
        return;
      }

      const cartItem: Resource = buildMarketResource({
        ...item,
        skuId: `credit-pool:${selectedCreditOption.amount}`,
        name: formatMarketCreditResourceName(intl, selectedCreditOption.amount),
        price: selectedCreditOption.price,
        creditAmount: selectedCreditOption.amount,
        discountRateBps: selectedCreditOption.discountRateBps,
        sellerCount: selectedCreditOption.sellerCount,
        creditOptions: undefined,
      }, ships);

      addToCart(cartItem);
      setSnackbarMessage(intl.formatMessage({ id: 'market.addedToCart', defaultMessage: 'Added to cart' }));
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      return;
    }

    if (!activeItem) {
      return;
    }

    const existingCartItem = cart.find((cartItem: CartItemType) => cartItem.resource.id === activeItem.skuId);
    const availableStock = getAvailableStock(activeItem);

    if (existingCartItem) {
      const currentQuantity = existingCartItem.quantity || 1;
      if (currentQuantity < availableStock) {
        updateItemQuantity(activeItem.skuId, currentQuantity + 1);
        setSnackbarMessage(intl.formatMessage({ id: 'market.quantityUpdated', defaultMessage: 'Quantity updated' }));
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      }
      return;
    }

    const cartItem: Resource = buildMarketResource(activeItem, ships);
    addToCart(cartItem);
    setSnackbarMessage(intl.formatMessage({ id: 'market.addedToCart', defaultMessage: 'Added to cart' }));
    setSnackbarSeverity('success');
    setSnackbarOpen(true);
  };

  const getAvailableStockByResourceId = (resourceId: string) => {
    if (item?.itemType === 'credit' && resourceId.startsWith('credit-pool:')) {
      return Number.MAX_SAFE_INTEGER;
    }

    if (item?.itemType === 'ccu') {
      const matchedVariant = ccuVariants.find((variant) => variant.skuId === resourceId);
      if (matchedVariant) {
        return getAvailableUnits(matchedVariant.stock, matchedVariant.lockedStock);
      }
    }

    if (activeItem?.skuId === resourceId) {
      return getAvailableStock(activeItem);
    }

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

  const displayItem = activeItem || item;
  const visual = getMarketItemVisual(displayItem, ships);
  const availableStock = item.itemType === 'credit' ? 1 : getAvailableStock(displayItem);
  const displayPrice = item.itemType === 'credit'
    ? (selectedCreditOption?.price || item.price)
    : displayItem.price;
  const basePrice = item.itemType === 'credit'
    ? (selectedCreditOption?.amount || getListingBasePrice(item, ships))
    : getListingBasePrice(displayItem, ships);
  const discount = item.itemType === 'credit'
    ? (selectedCreditOption && selectedCreditOption.amount > displayPrice
        ? (((selectedCreditOption.amount - displayPrice) / selectedCreditOption.amount) * 100).toFixed(2)
        : null)
    : getListingDiscountPercent(displayItem, ships);
  const selectedCreditSkuId = selectedCreditOption ? `credit-pool:${selectedCreditOption.amount}` : item.skuId;
  const selectedMarketSkuId = item.itemType === 'credit' ? selectedCreditSkuId : displayItem.skuId;
  const inCartItem = cart.find((cartItem: CartItemType) =>
    cartItem.resource.id === selectedMarketSkuId,
  );
  const inCartQuantity = inCartItem?.quantity || 0;
  const fromShipInfo = fromShipResponse?.data.ship || visual.fromShip;
  const toShipInfo = toShipResponse?.data.ship || visual.toShip;
  const { fromShipName: localizedFromShipName, toShipName: localizedToShipName } = getLocalizedMarketItemShipNames(displayItem, ships);
  const currentShipName = getShipDisplayName(fromShipInfo) || localizedFromShipName || '-';
  const upgradedShipName = getShipDisplayName(toShipInfo) || localizedToShipName || '-';
  const displayTitle = item.itemType === 'credit' && selectedCreditOption?.amount
    ? formatMarketCreditResourceName(intl, selectedCreditOption.amount)
    : getMarketItemDisplayName(intl, displayItem, ships);
  const displaySummary = item.itemType === 'credit'
    ? [
        selectedCreditOption?.amount
          ? formatCreditFaceValueSummary(intl, selectedCreditOption.amount, selectedCreditOption.amount)
          : null,
        resolvedCreditOptions.length ? formatCreditAmountSummary(intl, resolvedCreditOptions.length) : null,
      ].filter(Boolean).join(' · ') || item.description || item.externalRef || ''
    : getMarketItemSummary(intl, displayItem, ships);
  const fromShipType = localizeShipType(locale, fromShipInfo?.type);
  const toShipType = localizeShipType(locale, toShipInfo?.type);
  const fromShipSize = localizeShipSize(locale, fromShipInfo?.details?.size);
  const toShipSize = localizeShipSize(locale, toShipInfo?.details?.size);
  const fromShipStatus = localizeShipStatus(locale, fromShipInfo);
  const toShipStatus = localizeShipStatus(locale, toShipInfo);
  const fromShipFocus = localizeShipFocus(locale, fromShipInfo?.focus);
  const toShipFocus = localizeShipFocus(locale, toShipInfo?.focus);
  const comparisonRows: ShipComparisonRow[] = [
    {
      label: localizeShipDataLabel(locale, 'manufacturer'),
      fromValue: normalizeComparisonValue(fromShipInfo?.manufacturer?.name),
      toValue: normalizeComparisonValue(toShipInfo?.manufacturer?.name),
      changed: normalizeComparisonValue(fromShipInfo?.manufacturer?.name) !== normalizeComparisonValue(toShipInfo?.manufacturer?.name),
    },
    {
      label: localizeShipDataLabel(locale, 'focus'),
      fromValue: normalizeComparisonValue(fromShipFocus),
      toValue: normalizeComparisonValue(toShipFocus),
      changed: normalizeComparisonValue(fromShipFocus) !== normalizeComparisonValue(toShipFocus),
      iconSrc: resolveShipFocusIconPath(toShipInfo?.focus || fromShipInfo?.focus),
    },
    {
      label: localizeShipDataLabel(locale, 'type'),
      fromValue: normalizeComparisonValue(fromShipType),
      toValue: normalizeComparisonValue(toShipType),
      changed: normalizeComparisonValue(fromShipType) !== normalizeComparisonValue(toShipType),
      iconSrc: getShipMetricIconPath('type', toShipInfo?.type || fromShipInfo?.type),
    },
    {
      label: localizeShipDataLabel(locale, 'size'),
      fromValue: normalizeComparisonValue(fromShipSize),
      toValue: normalizeComparisonValue(toShipSize),
      changed: normalizeComparisonValue(fromShipSize) !== normalizeComparisonValue(toShipSize),
      iconSrc: getShipMetricIconPath('size'),
    },
    {
      label: localizeShipDataLabel(locale, 'status'),
      fromValue: normalizeComparisonValue(fromShipStatus),
      toValue: normalizeComparisonValue(toShipStatus),
      changed: normalizeComparisonValue(fromShipStatus) !== normalizeComparisonValue(toShipStatus),
      iconSrc: getShipMetricIconPath('status'),
    },
    {
      label: localizeShipDataLabel(locale, 'crew'),
      fromValue: normalizeComparisonValue(formatCrewRange(fromShipInfo?.details?.minCrew, fromShipInfo?.details?.maxCrew)),
      toValue: normalizeComparisonValue(formatCrewRange(toShipInfo?.details?.minCrew, toShipInfo?.details?.maxCrew)),
      changed: normalizeComparisonValue(formatCrewRange(fromShipInfo?.details?.minCrew, fromShipInfo?.details?.maxCrew)) !== normalizeComparisonValue(formatCrewRange(toShipInfo?.details?.minCrew, toShipInfo?.details?.maxCrew)),
      iconSrc: getShipMetricIconPath('crew'),
    },
    {
      label: localizeShipDataLabel(locale, 'cargo'),
      fromValue: normalizeComparisonValue(fromShipInfo?.details?.cargoCapacity != null ? `${formatMetricValue(fromShipInfo.details.cargoCapacity)} SCU` : ''),
      toValue: normalizeComparisonValue(toShipInfo?.details?.cargoCapacity != null ? `${formatMetricValue(toShipInfo.details.cargoCapacity)} SCU` : ''),
      changed: normalizeComparisonValue(fromShipInfo?.details?.cargoCapacity != null ? `${formatMetricValue(fromShipInfo.details.cargoCapacity)} SCU` : '') !== normalizeComparisonValue(toShipInfo?.details?.cargoCapacity != null ? `${formatMetricValue(toShipInfo.details.cargoCapacity)} SCU` : ''),
      iconSrc: getShipMetricIconPath('cargo'),
    },
    {
      label: localizeShipDataLabel(locale, 'scmSpeed'),
      fromValue: normalizeComparisonValue(fromShipInfo?.details?.maxScmSpeed != null ? `${formatMetricValue(fromShipInfo.details.maxScmSpeed)} m/s` : ''),
      toValue: normalizeComparisonValue(toShipInfo?.details?.maxScmSpeed != null ? `${formatMetricValue(toShipInfo.details.maxScmSpeed)} m/s` : ''),
      changed: normalizeComparisonValue(fromShipInfo?.details?.maxScmSpeed != null ? `${formatMetricValue(fromShipInfo.details.maxScmSpeed)} m/s` : '') !== normalizeComparisonValue(toShipInfo?.details?.maxScmSpeed != null ? `${formatMetricValue(toShipInfo.details.maxScmSpeed)} m/s` : ''),
      iconSrc: getShipMetricIconPath('scmSpeed'),
    },
    {
      label: localizeShipDataLabel(locale, 'afterburner'),
      fromValue: normalizeComparisonValue(fromShipInfo?.details?.afterburnerSpeed != null ? `${formatMetricValue(fromShipInfo.details.afterburnerSpeed)} m/s` : ''),
      toValue: normalizeComparisonValue(toShipInfo?.details?.afterburnerSpeed != null ? `${formatMetricValue(toShipInfo.details.afterburnerSpeed)} m/s` : ''),
      changed: normalizeComparisonValue(fromShipInfo?.details?.afterburnerSpeed != null ? `${formatMetricValue(fromShipInfo.details.afterburnerSpeed)} m/s` : '') !== normalizeComparisonValue(toShipInfo?.details?.afterburnerSpeed != null ? `${formatMetricValue(toShipInfo.details.afterburnerSpeed)} m/s` : ''),
      iconSrc: getShipMetricIconPath('afterburner'),
    },
    {
      label: localizeShipDataLabel(locale, 'dimensions'),
      fromValue: normalizeComparisonValue(buildDimensionSummary(fromShipInfo)),
      toValue: normalizeComparisonValue(buildDimensionSummary(toShipInfo)),
      changed: normalizeComparisonValue(buildDimensionSummary(fromShipInfo)) !== normalizeComparisonValue(buildDimensionSummary(toShipInfo)),
      iconSrc: getShipMetricIconPath('dimensions'),
    },
    {
      label: localizeShipDataLabel(locale, 'msrp'),
      fromValue: normalizeComparisonValue(formatUsdValue(fromShipInfo?.msrp, intl.locale)),
      toValue: normalizeComparisonValue(formatUsdValue(toShipInfo?.msrp, intl.locale)),
      changed: normalizeComparisonValue(formatUsdValue(fromShipInfo?.msrp, intl.locale)) !== normalizeComparisonValue(formatUsdValue(toShipInfo?.msrp, intl.locale)),
      iconSrc: getShipMetricIconPath('msrp'),
    },
  ];
  const packageShips = normalizedPackageShips;
  const packageItems = item.packageItems || [];
  const packageItemsWithImage = packageItems.filter((entry) => {
    const imageUrl = entry.imageUrl?.trim();
    return Boolean(imageUrl && imageUrl !== "https://robertsspaceindustries.com/undefined");
  });
  const packageItemsWithoutImage = packageItems.filter((entry) => {
    const imageUrl = entry.imageUrl?.trim();
    return !imageUrl || imageUrl === "https://robertsspaceindustries.com/undefined";
  });
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
              {displayTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {displaySummary}
            </Typography>
          </div>

          <div className='flex items-center gap-3'>
            <Link to="/orders" className='rounded '>
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
            <div className='overflow-hidden rounded border border-gray-200 bg-white dark:border-gray-800 dark:bg-neutral-900'>
              <MarketItemMedia
                item={displayItem}
                ships={ships}
                height={460}
                badgeText={item.itemType === 'credit' ? null : (discount ? formatMarketDiscount(intl, discount) : null)}
              />
            </div>

            <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
              <DetailField
                label={intl.formatMessage({ id: 'market.detail.type', defaultMessage: 'Type' })}
                value={getMarketItemTypeLabel(intl, item.itemType)}
              />
              <DetailField
                label={intl.formatMessage({ id: 'market.detail.meltValue', defaultMessage: 'Exchange value' })}
                value={typeof displayItem.cost === 'number' ? formatUsdPrice(intl.locale, displayItem.cost) : undefined}
              />
              <DetailField
                label={item.itemType === 'credit'
                  ? intl.formatMessage({ id: 'market.credit.faceValue', defaultMessage: 'Face Value' })
                  : item.itemType === 'package'
                    ? intl.formatMessage({ id: 'market.detail.insurance', defaultMessage: 'Insurance' })
                    : ''}
                value={item.itemType === 'credit'
                  ? (selectedCreditOption?.amount ? formatUsdPrice(intl.locale, selectedCreditOption.amount) : '-')
                  : item.itemType === 'package'
                    ? (item.insuranceType || '-')
                    : undefined}
              />
            </div>

            <div className='rounded border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-neutral-900'>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                <FormattedMessage id="market.detail.productInfo" defaultMessage="Product Details" />
              </Typography>

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
                      fallbackDescription={displayItem.description}
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
                            id={item.packageKind === 'bundle' ? 'market.detail.bundleContents' : 'market.detail.packageContents'}
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
                            ? formatUsdPrice(intl.locale, shipInfo.msrp / 100)
                            : null;

                          return (
                            <PackageContentCard
                              key={`${item.skuId}-${ship.sortOrder}-${ship.shipName}`}
                              imageUrl={shipImage}
                              eyebrow={intl.formatMessage({ id: 'market.detail.ship', defaultMessage: 'Ship' })}
                              title={ship.shipName}
                              subtitle={shipInfo?.manufacturer?.name || localizeShipType(locale, shipInfo?.type) || null}
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
                          <div className='overflow-hidden rounded border border-gray-200 bg-white dark:border-gray-800 dark:bg-neutral-950'>
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

              {item.itemType === 'credit' && (
                <div className='flex flex-col gap-4'>
                  <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                    <DetailField
                      label={intl.formatMessage({ id: 'market.credit.faceValue', defaultMessage: 'Face Value' })}
                      value={selectedCreditOption?.amount ? formatUsdPrice(intl.locale, selectedCreditOption.amount) : '-'}
                    />
                    <DetailField
                      label={intl.formatMessage({ id: 'market.credit.eligibleSellers', defaultMessage: 'Eligible Sellers' })}
                      value={typeof selectedCreditOption?.sellerCount === 'number' ? String(selectedCreditOption.sellerCount) : '-'}
                    />
                  </div>
                  <Typography variant="body2" color="text.secondary">
                    {selectedCreditOption
                      ? formatCreditPriceFormula(intl, selectedCreditOption.amount, selectedCreditOption.discountRateBps)
                      : (displayItem.externalRef || displayItem.description)}
                  </Typography>
                </div>
              )}

              {displayItem.description && (
                <div className='mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200'>
                  {displayItem.description}
                </div>
              )}
            </div>
          </div>

          <div className='flex flex-col gap-6 xl:sticky xl:top-4 xl:self-start'>
            <div className='rounded border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-neutral-900'>
              <div className='flex flex-col gap-3'>
                <div className='text-2xl font-semibold text-slate-900 dark:text-slate-100'>
                  {formatUsdPrice(intl.locale, displayPrice)}
                </div>
                {discount && Number(discount) > 0 && (
                  <div className='text-sm text-slate-500 line-through dark:text-slate-400'>
                    {formatUsdPrice(intl.locale, basePrice)}
                  </div>
                )}
                <div className='text-sm text-slate-500 dark:text-slate-400'>
                  <span>
                    <span>
                      {item.itemType === 'credit'
                        ? <FormattedMessage id="market.credit.amountCount" defaultMessage="Available Amounts" />
                        : <FormattedMessage id="market.available" defaultMessage="Available Stock" />}
                    </span>
                    <span>:</span>
                  </span>
                  <span className='font-semibold text-[#1d4ed8]'> {item.itemType === 'credit' ? resolvedCreditOptions.length : availableStock}</span>
                </div>
                {item.itemType !== 'credit' && typeof displayItem.cost === 'number' && (
                  <div className='text-sm text-slate-500 dark:text-slate-400'>
                    <FormattedMessage
                      id="market.detail.meltValueSummary"
                      defaultMessage="Exchange value: {value}"
                      values={{ value: formatUsdPrice(intl.locale, displayItem.cost) }}
                    />
                  </div>
                )}
              </div>

              <Divider sx={{ my: 3 }} />

              {item.itemType === 'ccu' && ccuVariants.length > 0 && (
                <div className='mb-3 flex flex-col gap-3'>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label={intl.formatMessage({ id: 'market.detail.meltValue', defaultMessage: 'Exchange value' })}
                    value={selectedCcuCost}
                    InputLabelProps={{ shrink: true }}
                    SelectProps={{
                      displayEmpty: true,
                      renderValue: (value) => value === ''
                        ? intl.formatMessage({ id: 'market.autoMatch', defaultMessage: 'Auto match' })
                        : formatUsdPrice(intl.locale, Number(value)),
                    }}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSelectedCcuCost(value === '' ? '' : Number(value));
                    }}
                  >
                    <MenuItem value="">
                      <FormattedMessage id="market.autoMatch" defaultMessage="Auto match" />
                    </MenuItem>
                    {ccuCostOptions.map((cost) => (
                      <MenuItem key={cost} value={cost}>
                        {formatUsdPrice(intl.locale, cost)}
                      </MenuItem>
                    ))}
                  </TextField>

                  {/* <TextField
                    select
                    fullWidth
                    size="small"
                    label={intl.formatMessage({ id: 'market.sellerInfo', defaultMessage: 'Seller' })}
                    value={selectedCcuSellerId}
                    onChange={(event) => setSelectedCcuSellerId(event.target.value)}
                  >
                    <MenuItem value="">
                      <FormattedMessage id="market.autoMatch" defaultMessage="Auto match" />
                    </MenuItem>
                    {ccuSellerOptions.map((option) => (
                      <MenuItem key={option.sellerId} value={option.sellerId}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField> */}

                </div>
              )}

              {item.itemType === 'credit' && (
                <TextField
                  select
                  fullWidth
                  size="small"
                  label={intl.formatMessage({ id: 'market.credit.selectAmount', defaultMessage: 'Select amount' })}
                  value={selectedCreditOption?.amount || ''}
                  onChange={(event) => setSelectedCreditAmount(Number(event.target.value))}
                  sx={{ mb: 3 }}
                >
                  {resolvedCreditOptions.map((option) => (
                    <MenuItem key={option.amount} value={option.amount}>
                      {formatCreditOptionLabel(intl, option.amount, option.price)}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              {item.itemType === 'credit' ? (
                <div className='flex flex-col gap-3'>
                  <Button
                    variant="outlined"
                    onClick={handleAddToCart}
                    disabled={!selectedCreditOption}
                  >
                    <FormattedMessage id="market.credit.addSelectedAmount" defaultMessage="Add selected amount" />
                  </Button>
                  <Button variant="outlined" onClick={openCart}>
                    <FormattedMessage id="market.openCart" defaultMessage="Open cart" />
                  </Button>
                </div>
              ) : inCartItem ? (
                <div className='flex flex-col gap-3'>
                  <ButtonGroup
                    size="small"
                    aria-label={intl.formatMessage({ id: 'market.quantityControls', defaultMessage: 'Quantity controls' })}
                  >
                    <IconButton
                      size="small"
                      onClick={() => {
                        if (inCartQuantity > 1) {
                          updateItemQuantity(selectedMarketSkuId, inCartQuantity - 1);
                        } else {
                          removeFromCart(selectedMarketSkuId);
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
                          updateItemQuantity(selectedMarketSkuId, inCartQuantity + 1);
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

            {/* <div className='rounded border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-neutral-900'>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                <FormattedMessage
                  id={item.itemType === 'credit' ? 'market.credit.poolInfo' : 'market.sellerInfo'}
                  defaultMessage={item.itemType === 'credit' ? 'Credit Pool' : 'Seller'}
                />
              </Typography>

              <div className='flex items-center gap-3'>
                <Avatar
                  src={item.itemType === 'credit' ? '' : (activeSellerProfile?.avatar || '')}
                  alt={activeSellerName}
                  sx={{ width: 56, height: 56 }}
                />
                <div className='flex flex-col'>
                  <div className='text-base font-semibold text-slate-900 dark:text-slate-100'>
                    {activeSellerName}
                  </div>
                </div>
              </div>

              <div className='mt-4 flex flex-col gap-2'>
                {item.itemType === 'credit' ? (
                  <Typography variant="body2" color="text.secondary">
                    <FormattedMessage
                      id="market.credit.poolDescription"
                      defaultMessage="One eligible seller is assigned automatically after payment. The order will not be split across multiple sellers."
                    />
                  </Typography>
                ) : (
                  <>
                    {activeSellerProfile?.sharedHangar && (
                      <Button variant="outlined" onClick={() => navigate(`/share/hangar/${displayItem.belongsTo}`)}>
                        <FormattedMessage id="market.viewSellerHangar" defaultMessage="View seller hangar" />
                      </Button>
                    )}
                    {activeSellerProfile?.homepage && (
                      <Button variant="text" component="a" href={activeSellerProfile.homepage} target="_blank" rel="noreferrer">
                        <FormattedMessage id="market.visitHomepage" defaultMessage="Visit homepage" />
                      </Button>
                    )}
                  </>
                )}
              </div>

              {item.itemType !== 'credit' && activeSellerProfile?.contacts && (
                <div className='mt-4 rounded border border-dashed border-black/10 p-4 text-sm text-slate-700 dark:border-white/10 dark:text-slate-200'>
                  {activeSellerProfile.contacts}
                </div>
              )}
            </div> */}
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
