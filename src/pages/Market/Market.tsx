import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
  Switch,
  Badge,
  ButtonGroup,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Button,
  Divider,
  Drawer,
  Stack,
  TablePagination,
  Tooltip,
  Autocomplete,
  Rating,
  useMediaQuery,
  useTheme,
  Avatar,
} from '@mui/material';
import {
  ContentCopy,
  FilterListOutlined,
  LocalShippingOutlined,
  Search,
  ShieldOutlined,
  SupportAgentOutlined,
} from '@mui/icons-material';
import { FormattedMessage, useIntl } from 'react-intl';
import CartDrawer from './components/CartDrawer';
import MarketItemMedia from './components/MarketItemMedia';
import {
  ListingItem,
  CartItem as CartItemType,
  CcuEdgeData,
  MarketBrowseCategory,
  MarketHomeHeroSlide,
  MarketHomeHeroTranslation,
  MarketHomeLocaleCode,
  MarketItemType,
  MarketShipFocusFilter,
  MarketShipTraitFilter,
  MarketSortMode,
  Resource,
  NewUserCouponPreview,
  CcusData,
  CcuSourceType,
  HangarItem,
  LowestMarketCcuResponse,
  MarketCartItem,
  MarketListResponse,
  type MarketReviewAttachmentSummary,
  type MarketReviewItem,
  Ship,
  AccountListingItem,
  ShipsData,
} from '@/types';
import { ArrowRight, ChevronLeft, ChevronRight, ListFilter, Plus, ShoppingCart, Minus, X, ChevronsRight, Timer } from 'lucide-react';
import { useAccountMarketData, useApi, useAuthApi, useMarketData, useMarketHomeSettings, useMarketReviews } from '@/hooks';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Helmet } from 'react-helmet';
import { useCartStore } from '@/hooks/useCartStore';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { selectUsersHangarItems } from '@/store/upgradesStore';
import { useLocale } from '@/contexts/LocaleContext';
import { buildMarketCartItem, buildMarketResource, isLtiShipListing } from '@/components/marketItemDisplay';
import Crawler from '@/components/Crawler';
import { getAbsoluteAssetUrl, getAccountMarketDetailPath, getAccountMarketListPath, getMarketDetailUrl, getMarketListUrl } from '@/utils/marketLinks';
import {
  ACCOUNT_MARKET_COUPON_PERCENT_OFF,
  getMonthlyAccountCouponCode,
} from '@/utils/accountMarketCoupon';
import { getManufacturerLogoPath } from '@/data/rsiManufacturers';
import {
  getAvailableStock,
  getListingPriceDisplay,
  resolveLowestCcuVariant,
} from './marketUtils';
import {
  buildMarketLocalizedSearchCandidates,
  resolveLocalizedMarketSearchTerm,
} from './marketSearchLocalization';
import {
  formatMarketDiscount,
  formatMarketOfficialSavings,
  formatMarketCreditResourceName,
  formatMarketPriceFrom,
  formatPackageContentsSummary,
  formatUsdPrice,
  getMarketBrowseCategoryLabel,
  getMarketItemTypeLabel,
} from './marketI18n';
import { getMarketItemDisplayName, getMarketItemSummary } from './marketDisplayI18n';
import { getMarketImageDisplayUrl, resolveMarketImageUrls } from '@/utils/marketImages';
import { getDirectCheckoutPath, saveDirectCheckoutItems } from '@/utils/directCheckout';
import { findShipByIdOrName, getShipDisplayName, getShipManufacturerDisplayName, matchesShipNameQuery } from '@/utils/shipDisplay';
import { getShipSlideshowImage, getShipThumbLarge, getShipThumbSmall } from '@/utils/shipImage';
import { localizeShipFocus } from '@/data/shipMetadataI18n';
import {
  buildCurrentMarketRoute,
  buildSelectedCreditListing,
  findMatchingCreditPoolOptions,
  MarketRouteEdge,
  MarketRouteResult,
} from '@/pages/CCUPlanner/services/marketRoutePlanner';
import ExtensionModal from '@/pages/CCUPlanner/components/ExtensionModal';
import type { FlowData, PlannerWorkspaceData } from '@/pages/CCUPlanner/services/ImportExportService';
import { getCompletedPathsStorageKeyForTab } from '@/pages/CCUPlanner/services/completedPathsStorage';
import type { Edge, Node } from 'reactflow';
import FloatingDiscordButton from '@/components/FloatingDiscordButton';

type MarketItemFilterOption = 'all' | MarketItemType | MarketBrowseCategory;
type MarketPageSearchState = {
  searchTerm: string;
  selectedItemFilter: MarketItemFilterOption;
  selectedShipTraitFilter: MarketShipTraitFilter | 'all';
  selectedShipFocus: MarketShipFocusFilter | 'all';
  selectedManufacturerId: number | null;
  packageItems: string[];
  sortBy: MarketSortMode;
  page: number;
  rowsPerPage: number;
};

interface LtiShipSku {
  skuId: string;
  url: string;
  isWarbond: boolean;
  price?: {
    amount?: number;
    formatted?: string | null;
  } | null;
  stock?: {
    available?: boolean;
  } | null;
}

interface LtiShipEntry {
  shipId: number;
  shipName: string;
  shipTitle?: string;
  skus: LtiShipSku[];
}

interface LtiShipsResponse {
  success: boolean;
  data?: {
    updatedAt?: string;
    ships?: LtiShipEntry[];
  } | null;
}

interface MarketAvailableShipIdsResponse {
  success: boolean;
  data?: {
    shipIds?: number[];
    updatedAt?: string;
  };
}

interface MarketHomePromotionHeroContent {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  imageUrl?: string;
  mobileImageUrl?: string;
  imageAlt?: string;
}

interface MarketHomePromotion {
  id: string;
  slug: string;
  title: string;
  status: string;
  startsAt: string;
  expiresAt: string;
  heroContent?: Record<string, MarketHomePromotionHeroContent>;
  promotionUrl?: string;
  itemCount?: number;
  discountSkuCount?: number;
}

interface MarketHomePromotionsResponse {
  success?: boolean;
  promotions?: MarketHomePromotion[];
}

interface PlannerRoutePurchaseItems {
  checkoutItems: MarketCartItem[];
  cartItems: Array<{
    resource: Resource;
    quantity: number;
    availableStock: number;
  }>;
}

const MARKET_DEFAULT_ROWS_PER_PAGE = 15;
const MARKET_ROWS_PER_PAGE_OPTIONS = [15, 30] as const;
const MARKET_MOBILE_ROWS_PER_BATCH = 15;
const MARKET_SEARCH_DEBOUNCE_MS = 450;
const MARKET_HERO_AUTOPLAY_INTERVAL_MS = 6000;
const COUPON_COUNTDOWN_INTERVAL_MS = 1000;
const MARKET_HOME_OTHER_ITEMS_LIMIT = 12;
const MARKET_REVIEW_SECTION_LIMIT = 6;
const MARKET_REVIEW_DIALOG_LIMIT = 12;
const MARKET_REVIEW_RATING_FILTERS = [5, 4, 3, 2, 1] as const;
const MARKET_SEARCH_PARAM_KEYS = ['search', 'itemType', 'browseCategory', 'tag', 'shipTrait', 'shipFocus', 'manufacturerId', 'packageItem', 'sortBy', 'page', 'limit'] as const;
const STARTER_PACK_GAME_DOWNLOAD_ITEM = 'Star Citizen Digital Download';
const MARKET_PLANNER_MIN_START_MSRP_CENTS = 2_000;
const MARKET_PLANNER_MAX_TARGET_MSRP_CENTS = 99_000;
const MARKET_PLANNER_ROUTE_NODE_GAP_X = 420;
const MARKET_PLANNER_ROUTE_NODE_Y = 120;
const CCU_PLANNER_STORAGE_KEY = 'ccu-planner-data';
const CCU_PLANNER_WORKSPACE_VERSION = 2;
const VALID_MARKET_ITEM_TYPE_FILTERS = new Set<MarketItemType>(['ccu', 'credit']);
const VALID_MARKET_BROWSE_CATEGORY_FILTERS = new Set<MarketBrowseCategory>(['standalone_ship', 'ship_package', 'paint', 'other']);
const VALID_MARKET_SHIP_TRAIT_FILTERS = new Set<MarketShipTraitFilter>(['oc', 'non_oc', 'lti']);
const VALID_MARKET_SORT_MODES = new Set<MarketSortMode>(['recommended', 'newest', 'priceDesc', 'priceAsc']);
const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
const RSI_BASE_URL = 'https://robertsspaceindustries.com';

type MarketReviewRatingFilter = typeof MARKET_REVIEW_RATING_FILTERS[number] | null;

const MARKET_HOME_LOCALE_FALLBACKS: MarketHomeLocaleCode[] = ['en'];

const DEFAULT_MARKET_HERO_SLIDES: MarketHomeHeroSlide[] = [
  {
    id: 'default-market-hero',
    enabled: true,
    mediaType: 'image',
    mediaUrl: 'https://images.citizenshub.app/ships/242/e1a23fa4c3dbaff4e7d286e6485702e8.webp',
    posterUrl: '',
    shipId: null,
    linkMode: 'ship',
    translations: {
      en: {
        eyebrow: 'Citizens\' Hub Market',
        title: 'Star Citizen ships, upgrades, and paints',
        subtitle: 'Browse CCUs, standalone ships, packages, paints, and store credit.',
        ctaLabel: 'Browse listings',
      },
    },
  },
];

function filterShipOptions(options: Ship[], inputValue: string) {
  const query = inputValue.trim().toLowerCase();
  if (!query) {
    return options;
  }

  return options.filter((option) =>
    matchesShipNameQuery(option, query)
    || option.manufacturer.name.toLowerCase().includes(query)
    || option.type.toLowerCase().includes(query),
  );
}

function hasAvailableWarbondLtiSeedSku(entry: LtiShipEntry) {
  return entry.skus.some((sku) => sku.isWarbond && Boolean(sku.url) && (sku.stock?.available ?? true));
}

function isListingForShip(item: ListingItem, targetShip: Ship, ships: Ship[]) {
  if (item.shipId === targetShip.id) {
    return true;
  }

  const directShip = findShipByIdOrName(ships, {
    id: item.shipId,
    name: item.shipName,
  });
  if (directShip?.id === targetShip.id) {
    return true;
  }

  return (item.packageShips || []).some((packageShip) => {
    if (packageShip.shipId === targetShip.id) {
      return true;
    }

    const packageCatalogShip = findShipByIdOrName(ships, {
      id: packageShip.shipId,
      name: packageShip.shipName,
    });
    return packageCatalogShip?.id === targetShip.id;
  });
}

function getCcuTypeStyle(sourceType: CcuSourceType): string {
  switch (sourceType) {
    case CcuSourceType.HANGER:
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700/70';
    case CcuSourceType.AVAILABLE_WB:
    case CcuSourceType.OFFICIAL_WB:
      return 'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-700/70';
    case CcuSourceType.THIRD_PARTY:
      return 'bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-200 dark:border-cyan-700/70';
    case CcuSourceType.OFFICIAL:
    default:
      return 'bg-gray-50 text-gray-700 border border-gray-200 dark:bg-neutral-900/50 dark:text-gray-200 dark:border-neutral-700';
  }
}

function getMarketRouteTypeLabel(sourceType: CcuSourceType, intl: ReturnType<typeof useIntl>): string {
  switch (sourceType) {
    case CcuSourceType.THIRD_PARTY:
      return intl.formatMessage({ id: 'pathBuilder.marketRouteStoreLabel', defaultMessage: 'Store' });
    case CcuSourceType.HANGER:
      return intl.formatMessage({ id: 'routeInfoPanel.hangar', defaultMessage: 'Hangar' });
    case CcuSourceType.AVAILABLE_WB:
    case CcuSourceType.OFFICIAL_WB:
      return intl.formatMessage({ id: 'market.ccuPlanner.officialWbLabel', defaultMessage: 'RSI WB cash purchase' });
    case CcuSourceType.OFFICIAL:
      return intl.formatMessage({ id: 'market.ccuPlanner.officialCreditLabel', defaultMessage: 'Use Store Credit on RSI' });
    default:
      return sourceType;
  }
}

function resolveRsiAssetUrl(value?: string | null) {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return '';
  }

  if (/^https?:\/\//i.test(normalizedValue)) {
    return normalizedValue;
  }

  return `${RSI_BASE_URL}${normalizedValue.startsWith('/') ? normalizedValue : `/${normalizedValue}`}`;
}

function resolveReviewAvatarUrl(avatar?: string | null, rsiAvatar?: string | null) {
  const normalizedAvatar = avatar?.trim();
  if (normalizedAvatar) {
    return /^https?:\/\//i.test(normalizedAvatar)
      ? normalizedAvatar
      : resolveRsiAssetUrl(normalizedAvatar);
  }

  return resolveRsiAssetUrl(rsiAvatar);
}

function getDefaultRouteName(locale: string, index: number) {
  switch (locale) {
    case 'zh-CN':
      return `路线 ${index}`;
    case 'zh-HK':
      return `路線 ${index}`;
    case 'ja-JP':
      return `ルート ${index}`;
    default:
      return `Route ${index}`;
  }
}

function createMarketPlannerRouteId() {
  return `route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createFlowDataFromMarketRoute(route: MarketRouteResult): FlowData | null {
  if (!route.edges.length) {
    return null;
  }

  const nodeIds: string[] = [];
  const routeShips: Ship[] = [route.edges[0].sourceShip];
  route.edges.forEach((edge) => {
    routeShips.push(edge.targetShip);
  });

  const nodes: Node[] = routeShips.map((ship, index) => {
    const nodeId = `market-route-ship-${ship.id}-${Date.now()}-${index}`;
    nodeIds.push(nodeId);

    return {
      id: nodeId,
      type: 'ship',
      position: {
        x: index * MARKET_PLANNER_ROUTE_NODE_GAP_X,
        y: MARKET_PLANNER_ROUTE_NODE_Y,
      },
      data: {
        ship,
        id: nodeId,
      },
    };
  });

  const edges: Edge<CcuEdgeData>[] = route.edges.map((edge, index) => ({
    id: `market-route-edge-${edge.sourceShip.id}-${edge.targetShip.id}-${Date.now()}-${index}`,
    source: nodeIds[index],
    target: nodeIds[index + 1],
    type: 'ccu',
    data: {
      price: edge.cost,
      sourceShip: edge.sourceShip,
      targetShip: edge.targetShip,
      sourceType: edge.sourceType,
    },
  }));

  return {
    nodes,
    edges,
    startShipPrices: {},
  };
}

function readPlannerWorkspace(): PlannerWorkspaceData | null {
  const rawData = window.localStorage.getItem(CCU_PLANNER_STORAGE_KEY);
  if (!rawData) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawData) as Partial<PlannerWorkspaceData>;
    if (!parsed) {
      return null;
    }

    if (Array.isArray((parsed as Partial<FlowData>).nodes) && Array.isArray((parsed as Partial<FlowData>).edges)) {
      return {
        version: CCU_PLANNER_WORKSPACE_VERSION,
        activeTabId: 'legacy-route-1',
        tabs: [
          {
            id: 'legacy-route-1',
            name: 'Route 1',
            flowData: {
              nodes: (parsed as FlowData).nodes,
              edges: (parsed as FlowData).edges,
              startShipPrices: (parsed as FlowData).startShipPrices || {},
            },
            lastAutoSavedAt: null,
          },
        ],
      };
    }

    if (!Array.isArray(parsed.tabs)) {
      return null;
    }

    const tabs = parsed.tabs.filter((tab) => (
      typeof tab?.id === 'string'
      && typeof tab?.name === 'string'
      && tab.flowData
      && Array.isArray(tab.flowData.nodes)
      && Array.isArray(tab.flowData.edges)
    ));

    if (!tabs.length) {
      return null;
    }

    const activeTabId = tabs.some((tab) => tab.id === parsed.activeTabId)
      ? parsed.activeTabId as string
      : tabs[0].id;

    return {
      version: parsed.version || CCU_PLANNER_WORKSPACE_VERSION,
      activeTabId,
      tabs,
    };
  } catch (error) {
    console.warn('Failed to read CCU Planner workspace before market checkout:', error);
    return null;
  }
}

function saveMarketRouteToPlannerWorkspace(route: MarketRouteResult, locale: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  const flowData = createFlowDataFromMarketRoute(route);
  if (!flowData) {
    return false;
  }

  const existingWorkspace = readPlannerWorkspace();
  const existingTabs = existingWorkspace?.tabs || [];
  const newTabId = createMarketPlannerRouteId();
  const nextTabs = [
    ...existingTabs,
    {
      id: newTabId,
      name: getDefaultRouteName(locale, existingTabs.length + 1),
      flowData,
      lastAutoSavedAt: Date.now(),
    },
  ];

  const workspace: PlannerWorkspaceData = {
    version: CCU_PLANNER_WORKSPACE_VERSION,
    activeTabId: newTabId,
    tabs: nextTabs,
  };

  try {
    window.localStorage.setItem(CCU_PLANNER_STORAGE_KEY, JSON.stringify(workspace));
    const completedPathsStorageKey = getCompletedPathsStorageKeyForTab(newTabId);
    if (window.localStorage.getItem(completedPathsStorageKey) === null) {
      window.localStorage.setItem(completedPathsStorageKey, '[]');
    }
    return true;
  } catch (error) {
    console.error('Failed to save market route to CCU Planner workspace:', error);
    return false;
  }
}

function UpgradePreview({
  fromShip,
  toShip,
  className,
}: {
  fromShip: Ship;
  toShip: Ship;
  className?: string;
}) {
  const intl = useIntl();
  const fromImage = getShipThumbLarge(fromShip);
  const toImage = getShipThumbLarge(toShip);

  return (
    <div className={`relative overflow-hidden border border-gray-200 bg-gray-100 dark:border-neutral-700 dark:bg-[#1b1b1b] ${className || 'h-[88px] w-full'}`}>
      {fromImage ? (
        <img src={fromImage} alt={fromShip.name} className="absolute left-0 top-0 h-full w-[35%] object-cover" />
      ) : (
        <div className="absolute left-0 top-0 flex h-full w-[35%] items-center justify-center bg-gray-200 text-[10px] text-gray-500 dark:bg-neutral-700 dark:text-gray-400">
          {intl.formatMessage({ id: 'common.na', defaultMessage: 'N/A' })}
        </div>
      )}

      {toImage ? (
        <img src={toImage} alt={toShip.name} className="absolute right-0 top-0 h-full w-[65%] object-cover shadow-[0_0_20px_0_rgba(0,0,0,0.22)]" />
      ) : (
        <div className="absolute right-0 top-0 flex h-full w-[65%] items-center justify-center bg-gray-200 text-[10px] text-gray-500 dark:bg-neutral-700 dark:text-gray-400">
          {intl.formatMessage({ id: 'common.na', defaultMessage: 'N/A' })}
        </div>
      )}

      <div className="absolute left-[35%] top-1/2 -translate-x-1/2 -translate-y-1/2 text-white">
        <ChevronsRight className="h-6 w-6 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]" />
      </div>
    </div>
  );
}

function getMarketHeroTranslation(
  slide: MarketHomeHeroSlide,
  locale: MarketHomeLocaleCode,
): MarketHomeHeroTranslation {
  const fallbacks = Array.from(new Set([locale, ...MARKET_HOME_LOCALE_FALLBACKS]));
  const resolveText = (field: keyof MarketHomeHeroTranslation, fallback: string) => {
    for (const candidate of fallbacks) {
      const value = slide.translations[candidate]?.[field]?.trim();

      if (value) {
        return value;
      }
    }

    return fallback;
  };

  return {
    eyebrow: resolveText('eyebrow', "Citizens' Hub Market"),
    title: resolveText('title', 'Star Citizen Market'),
    subtitle: resolveText('subtitle', ''),
    ctaLabel: resolveText('ctaLabel', 'View details'),
  };
}

function nonEmptyMarketHomeText(value?: string | null) {
  return value?.trim() || '';
}

function getMarketHomePromotionHeroContent(
  promotion: MarketHomePromotion,
  locale: string,
): MarketHomePromotionHeroContent {
  const localized = promotion.heroContent?.[locale] || {};
  const english = promotion.heroContent?.en || {};
  const resolveText = (field: keyof MarketHomePromotionHeroContent) => (
    nonEmptyMarketHomeText(localized[field]) || nonEmptyMarketHomeText(english[field])
  );

  return {
    eyebrow: resolveText('eyebrow'),
    title: resolveText('title') || promotion.title,
    subtitle: resolveText('subtitle'),
    ctaLabel: resolveText('ctaLabel'),
    imageUrl: resolveText('imageUrl'),
    mobileImageUrl: resolveText('mobileImageUrl'),
    imageAlt: resolveText('imageAlt'),
  };
}

function getMarketHomePromotionPath(promotion: MarketHomePromotion) {
  return `/market/promotions/${encodeURIComponent(promotion.slug)}`;
}

interface MarketHeroMediaProps {
  active: boolean;
  slide: MarketHomeHeroSlide;
}

const MarketHeroMedia = React.memo(function MarketHeroMedia({
  active,
  slide,
}: MarketHeroMediaProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (!active) {
      video.pause();
      return;
    }

    const playPromise = video.play();

    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Autoplay can be rejected by the browser even when muted.
      });
    }
  }, [active, slide.mediaUrl]);

  if (slide.mediaType === 'video') {
    return (
      <video
        ref={videoRef}
        className='absolute inset-0 h-full w-full object-cover'
        src={slide.mediaUrl}
        poster={slide.posterUrl || undefined}
        muted
        autoPlay={active}
        loop
        playsInline
        preload="auto"
      />
    );
  }

  return (
    <img
      className='absolute inset-0 h-full w-full object-cover'
      src={slide.mediaUrl}
      alt=""
      loading="eager"
      decoding="async"
    />
  );
});

interface MarketHomePromotionBannerProps {
  promotion: MarketHomePromotion;
  hero: MarketHomePromotionHeroContent;
  imageUrl: string;
}

const MarketHomePromotionBanner = React.memo(function MarketHomePromotionBanner({
  promotion,
  hero,
  imageUrl,
}: MarketHomePromotionBannerProps) {
  const intl = useIntl();
  const promotionPath = getMarketHomePromotionPath(promotion);
  const itemCount = promotion.itemCount || promotion.discountSkuCount || 0;
  const title = hero.title || promotion.title;
  const eyebrow = hero.eyebrow || intl.formatMessage({
    id: 'market.home.promotion.eyebrow',
    defaultMessage: 'Limited-time promotion',
  });
  const ctaLabel = hero.ctaLabel || intl.formatMessage({
    id: 'market.home.promotion.cta',
    defaultMessage: 'View deals',
  });

  return (
    <section className='relative overflow-hidden border border-cyan-200 bg-white shadow-sm dark:border-cyan-900/70 dark:bg-neutral-900'>
      <div className='absolute inset-y-0 left-0 w-1.5 bg-cyan-500 dark:bg-cyan-400' />
      <div className='grid gap-0 md:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_420px]'>
        <div className='flex min-w-0 flex-col justify-center p-5 pl-6 md:p-6 md:pl-8'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='inline-flex items-center gap-1.5 border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-cyan-800 dark:border-cyan-800/80 dark:bg-cyan-950/50 dark:text-cyan-100'>
              <Timer className='h-3.5 w-3.5' />
              <FormattedMessage id="market.home.promotion.active" defaultMessage="Now live" />
            </span>
            {itemCount > 0 ? (
              <span className='border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-neutral-800 dark:text-slate-200'>
                {intl.formatMessage(
                  { id: 'market.home.promotion.products', defaultMessage: '{count, plural, one {# deal} other {# deals}}' },
                  { count: itemCount },
                )}
              </span>
            ) : null}
          </div>

          <div className='mt-4 text-xs font-bold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300'>
            {eyebrow}
          </div>
          <Typography
            component="h2"
            sx={{
              mt: 1,
              maxWidth: 860,
              color: 'text.primary',
              fontSize: { xs: 26, md: 34 },
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: 0,
            }}
          >
            {title}
          </Typography>
          {hero.subtitle ? (
            <Typography sx={{ mt: 1.5, maxWidth: 720, color: 'text.secondary', fontSize: 15, lineHeight: 1.7 }}>
              {hero.subtitle}
            </Typography>
          ) : null}

          <Button
            component={Link}
            to={promotionPath}
            variant="contained"
            endIcon={<ArrowRight className='h-4 w-4' />}
            sx={{
              mt: 3,
              alignSelf: 'flex-start',
              borderRadius: 0,
              px: 2.75,
              py: 1.15,
              whiteSpace: 'nowrap',
            }}
          >
            {ctaLabel}
          </Button>
        </div>

        <Link
          to={promotionPath}
          aria-label={title}
          className='group relative block min-h-[180px] overflow-hidden bg-slate-100 dark:bg-neutral-950 md:min-h-[240px]'
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className='absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]'
            />
          ) : (
            <div className='absolute inset-0 bg-slate-100 dark:bg-neutral-950' />
          )}
        </Link>
      </div>
    </section>
  );
});

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

function normalizeShipFocusFilter(value?: string | null): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeShipFocusParam(value?: string | null): string {
  return (value || '')
    .trim()
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeLocalizedMarketSearchShips(baseShips: Ship[], localizedShips: Ship[]): Ship[] {
  if (!baseShips.length) {
    return [];
  }

  if (!localizedShips.length) {
    return baseShips;
  }

  const localizedShipById = new Map(localizedShips.map((ship) => [ship.id, ship]));

  return baseShips.map((ship) => {
    const localizedShip = localizedShipById.get(ship.id);
    if (!localizedShip) {
      return ship;
    }

    return {
      ...ship,
      localizedName: localizedShip.name || ship.localizedName,
      manufacturer: {
        ...ship.manufacturer,
        localizedName: localizedShip.manufacturer?.name || ship.manufacturer.localizedName,
      },
    };
  });
}

function getShipFocusSearchParams(searchParams: URLSearchParams): string[] {
  const values = parseMarketSearchParamList(searchParams, 'shipFocus')
    .flatMap((value) => value.split(','))
    .map(normalizeShipFocusParam)
    .filter(Boolean);

  return Array.from(new Set(values));
}

function getShipImageForRoleCard(ship: Ship) {
  return getShipSlideshowImage(ship)
    || getShipThumbLarge(ship)
    || getShipThumbSmall(ship)
    || '';
}

function getMarketHomeListingImage(item: ListingItem | null | undefined, ships: Ship[]) {
  if (!item) {
    return '';
  }

  const listingImages = [
    ...resolveMarketImageUrls(item.imageUrl, item.imageUrls),
    item.toImageUrl,
    item.fromImageUrl,
    item.imageUrl,
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const imageUrl of listingImages) {
    const displayUrl = getMarketImageDisplayUrl(imageUrl, {
      ships,
      variant: 'slideshow',
    });

    if (displayUrl) {
      return displayUrl;
    }
  }

  return '';
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
    selectedShipFocus: getShipFocusSearchParams(searchParams)[0] || 'all',
    selectedManufacturerId: parsePositiveInteger(searchParams.get('manufacturerId')),
    packageItems: parseMarketSearchParamList(searchParams, 'packageItem'),
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

  if (state.selectedShipFocus !== 'all') {
    nextSearchParams.set('shipFocus', state.selectedShipFocus);
  }

  if (state.selectedManufacturerId) {
    nextSearchParams.set('manufacturerId', String(state.selectedManufacturerId));
  }

  state.packageItems.forEach((packageItem) => {
    nextSearchParams.append('packageItem', packageItem);
  });

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

function resolveDirectMarketItem(item: ListingItem): ListingItem | null {
  if (item.itemType === 'credit') {
    return null;
  }

  return item.itemType === 'ccu' ? resolveLowestCcuVariant(item) : item;
}

function normalizeMarketSearchCommitValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getMarketSearchInputEventValue(
  event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | React.CompositionEvent<HTMLDivElement>,
  fallbackValue: string,
) {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return target.value;
  }

  return fallbackValue;
}

interface MarketListingSearchFieldProps {
  id?: string;
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
}

const MarketListingSearchField = React.memo(function MarketListingSearchField({
  id,
  value,
  placeholder,
  onCommit,
}: MarketListingSearchFieldProps) {
  const [draftValue, setDraftValue] = useState(value);
  const [compositionTick, setCompositionTick] = useState(0);
  const valueRef = useRef(value);
  const draftValueRef = useRef(draftValue);
  const onCommitRef = useRef(onCommit);
  const isEditingRef = useRef(false);
  const isComposingRef = useRef(false);
  const debounceTimeoutRef = useRef<number | null>(null);
  const pendingCommitValueRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (debounceTimeoutRef.current !== null) {
      window.clearTimeout(debounceTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    valueRef.current = value;
    const pendingCommitValue = pendingCommitValueRef.current;
    if (
      pendingCommitValue !== null
      && normalizeMarketSearchCommitValue(pendingCommitValue) === normalizeMarketSearchCommitValue(value)
    ) {
      pendingCommitValueRef.current = null;
      if (normalizeMarketSearchCommitValue(draftValueRef.current) === normalizeMarketSearchCommitValue(value)) {
        isEditingRef.current = false;
      }
    }

    if (!isEditingRef.current && pendingCommitValueRef.current === null && draftValueRef.current !== value) {
      draftValueRef.current = value;
      setDraftValue(value);
    }
  }, [value]);

  useEffect(() => {
    draftValueRef.current = draftValue;

    if (isComposingRef.current) {
      return;
    }

    if (normalizeMarketSearchCommitValue(draftValue) === normalizeMarketSearchCommitValue(valueRef.current)) {
      pendingCommitValueRef.current = null;
      isEditingRef.current = false;
      return;
    }

    if (debounceTimeoutRef.current !== null) {
      window.clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = window.setTimeout(() => {
      debounceTimeoutRef.current = null;
      const nextValue = typeof draftValueRef.current === 'string' ? draftValueRef.current : '';
      pendingCommitValueRef.current = nextValue;
      onCommitRef.current(nextValue);
    }, MARKET_SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimeoutRef.current !== null) {
        window.clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    };
  }, [compositionTick, draftValue]);

  const commitNow = useCallback(() => {
    if (isComposingRef.current) {
      return;
    }

    if (debounceTimeoutRef.current !== null) {
      window.clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }

    const nextValue = typeof draftValueRef.current === 'string' ? draftValueRef.current : '';
    if (normalizeMarketSearchCommitValue(nextValue) !== normalizeMarketSearchCommitValue(valueRef.current)) {
      pendingCommitValueRef.current = nextValue;
      onCommitRef.current(nextValue);
      return;
    }

    pendingCommitValueRef.current = null;
    isEditingRef.current = false;
  }, []);

  return (
    <TextField
      fullWidth
      variant="outlined"
      placeholder={placeholder}
      value={draftValue}
      id={id}
      onChange={(event) => {
        const nextValue = getMarketSearchInputEventValue(event, draftValueRef.current);
        isEditingRef.current = true;
        pendingCommitValueRef.current = null;
        draftValueRef.current = nextValue;
        setDraftValue(nextValue);
      }}
      onCompositionStart={() => {
        isComposingRef.current = true;
      }}
      onCompositionEnd={(event) => {
        const nextValue = getMarketSearchInputEventValue(event, draftValueRef.current);
        isComposingRef.current = false;
        isEditingRef.current = true;
        pendingCommitValueRef.current = null;
        draftValueRef.current = nextValue;
        setDraftValue(nextValue);
        setCompositionTick((current) => current + 1);
      }}
      onBlur={commitNow}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing && !isComposingRef.current) {
          event.preventDefault();
          commitNow();
        }
      }}
      sx={{
        '& .MuiOutlinedInput-root': { borderRadius: 0 },
      }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Search />
            </InputAdornment>
          ),
        },
      }}
      size="small"
    />
  );
});

interface MarketHomeSearchBoxProps {
  value: string;
  placeholder: string;
  onSearch: (value: string) => void;
}

const MarketHomeSearchBox = React.memo(function MarketHomeSearchBox({
  value,
  placeholder,
  onSearch,
}: MarketHomeSearchBoxProps) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const submitSearch = useCallback(() => {
    onSearch(draftValue);
  }, [draftValue, onSearch]);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'minmax(0,1fr) 156px' },
        gap: { xs: 0.75, sm: 1 },
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        p: { xs: 0.75, sm: 1 },
      }}
    >
      <TextField
        fullWidth
        variant="outlined"
        placeholder={placeholder}
        value={draftValue}
        onChange={(event) => {
          setDraftValue(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submitSearch();
          }
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            minHeight: 46,
            borderRadius: 0,
            bgcolor: 'background.paper',
          },
        }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            ),
          },
        }}
        size="small"
      />
      <Button
        variant="contained"
        onClick={submitSearch}
        sx={{ minHeight: { xs: 44, sm: 46 }, borderRadius: 0 }}
      >
        <FormattedMessage id="market.search" defaultMessage="Search" />
      </Button>
    </Box>
  );
});

interface MarketHomeCategoryEntry {
  value: MarketItemFilterOption;
  label: string;
  description: string;
  imageUrl: string;
  accentClassName: string;
}

interface MarketHomeCategoryCardProps {
  entry: MarketHomeCategoryEntry;
  onOpen: (value: MarketItemFilterOption) => void;
}

const MarketHomeCategoryCard = React.memo(function MarketHomeCategoryCard({
  entry,
  onOpen,
}: MarketHomeCategoryCardProps) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(entry.value);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(entry.value)}
      onKeyDown={handleKeyDown}
      className='group cursor-pointer relative min-h-[188px] overflow-hidden border border-gray-200 bg-white p-0 text-left text-slate-950 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-gray-800 dark:bg-neutral-900 dark:text-white dark:hover:border-gray-700'
    >
      {entry.imageUrl ? (
        <img
          src={entry.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className='absolute inset-0 h-full w-full object-cover opacity-58 transition duration-500 group-hover:scale-[1.04] dark:opacity-52'
        />
      ) : (
        <div className='absolute inset-0 bg-neutral-900' />
      )}
      <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.70)_0%,rgba(255,255,255,0.54)_30%,rgba(255,255,255,0.94)_100%)] dark:bg-[linear-gradient(180deg,rgba(10,10,10,0.12)_0%,rgba(10,10,10,0.42)_36%,rgba(10,10,10,0.92)_100%)]' />
      <div className={`absolute left-0 top-0 h-1.5 w-full ${entry.accentClassName}`} />

      <div className='relative z-10 flex h-full min-h-[188px] flex-col justify-end p-4'>
        <div className='text-xl font-black leading-tight text-slate-950 dark:text-white'>
          {entry.label}
        </div>
        <p className='mt-2 line-clamp-2 text-sm leading-6 text-slate-700 dark:text-slate-200'>
          {entry.description}
        </p>
        <div className='mt-4 inline-flex items-center gap-2 text-sm font-bold text-sky-700 transition group-hover:gap-3 dark:text-sky-200'>
          <FormattedMessage id="market.home.category.open" defaultMessage="Open listings" />
          <ArrowRight className='h-4 w-4' />
        </div>
      </div>
    </div>
  );
});

interface MarketListingCardProps {
  item: ListingItem;
  ships: Ship[];
  cartQuantity: number;
  onOpenDetails: (item: ListingItem) => void;
  onAddToCart: (item: ListingItem) => void | Promise<void>;
  onBuyNow: (item: ListingItem) => void | Promise<void>;
  onRemoveFromCart: (resourceId: string) => void;
  onUpdateQuantity: (resourceId: string, quantity: number) => void;
}

const MarketListingCard = React.memo(function MarketListingCard({
  item,
  ships,
  cartQuantity,
  onOpenDetails,
  onAddToCart,
  onBuyNow,
  onRemoveFromCart,
  onUpdateQuantity,
}: MarketListingCardProps) {
  const intl = useIntl();
  const directItem = useMemo(() => resolveDirectMarketItem(item), [item]);
  const directItemSkuId = directItem?.skuId || item.skuId;
  const availableStock = directItem ? getAvailableStock(directItem) : getAvailableStock(item);
  const priceDisplay = useMemo(() => getListingPriceDisplay(item, ships), [item, ships]);
  const displayName = useMemo(() => getMarketItemDisplayName(intl, item, ships), [intl, item, ships]);
  const summary = useMemo(() => getMarketItemSummary(intl, item, ships), [intl, item, ships]);
  const isCredit = item.itemType === 'credit';
  const isCcu = item.itemType === 'ccu';
  const isVariantPriceRange = isCcu && (item.variantCount || 0) > 1;
  const packageShips = useMemo(() => item.packageShips || [], [item.packageShips]);
  const packageItems = item.packageItems || [];
  const packageShipCount = useMemo(
    () => packageShips.filter((ship) => ship.shipId !== null).length,
    [packageShips],
  );

  return (
    <div className='flex h-full flex-col overflow-hidden border border-gray-200 bg-white transition hover:border-gray-300 dark:border-gray-800 dark:bg-neutral-900 dark:hover:border-gray-700'>
      <div
        className='block w-full cursor-pointer text-left'
        onClick={() => onOpenDetails(item)}
      >
        <MarketItemMedia
          item={item}
          ships={ships}
          height={220}
          badgeText={!isCredit && priceDisplay.promotionDiscountPercent ? formatMarketDiscount(intl, priceDisplay.promotionDiscountPercent) : null}
        />
      </div>

      <div className='flex flex-1 flex-col gap-4 p-4'>
        <div className='flex flex-wrap gap-2'>
          {item.browseCategory && <Chip size="small" variant="outlined" label={getMarketBrowseCategoryLabel(intl, item.browseCategory)} />}
          {item.itemType === 'ccu' && <Chip size="small" label={getMarketItemTypeLabel(intl, item.itemType)} />}
          {item.itemType === 'credit' && <Chip size="small" label={getMarketItemTypeLabel(intl, item.itemType)} />}
        </div>

        <div className='flex flex-1 flex-col gap-2'>
          <div
            className='w-full cursor-pointer text-left text-inherit no-underline'
            onClick={() => onOpenDetails(item)}
          >
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.35, fontSize: '1.05rem' }}>
              {displayName}
            </Typography>
          </div>
          <Typography variant="body2" color="text.secondary" sx={{ minHeight: 42 }}>
            {summary}
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
              {formatPackageContentsSummary(intl, packageShipCount, packageItems.length)}
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
            {priceDisplay.marketPrice > 0 && (
              <div className='text-sm text-slate-500 line-through dark:text-slate-400'>
                {formatUsdPrice(intl.locale, priceDisplay.marketPrice)}
              </div>
            )}
            {priceDisplay.officialSavingsAmount > 0 ? (
              <div className='text-xs text-slate-500 dark:text-slate-400'>
                {formatMarketOfficialSavings(intl, priceDisplay.officialSavingsAmount)}
              </div>
            ) : null}
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
            {isCredit ? (
              <Button
                variant="outlined"
                onClick={() => onOpenDetails(item)}
                size="small"
              >
                <FormattedMessage id="market.credit.chooseAmount" defaultMessage="Choose amount" />
              </Button>
            ) : cartQuantity > 0 ? (
              <ButtonGroup
                size="small"
                aria-label={intl.formatMessage({ id: 'market.quantityControls', defaultMessage: 'Quantity controls' })}
              >
                <IconButton
                  size="small"
                  onClick={() => {
                    if (cartQuantity > 1) {
                      onUpdateQuantity(directItemSkuId, cartQuantity - 1);
                    } else {
                      onRemoveFromCart(directItemSkuId);
                    }
                  }}
                >
                  <Minus className="h-4 w-4" />
                </IconButton>
                <Typography sx={{ px: 2, display: 'flex', alignItems: 'center', border: '1px solid', borderColor: 'divider' }}>
                  {cartQuantity}
                </Typography>
                <IconButton
                  size="small"
                  disabled={cartQuantity >= availableStock}
                  onClick={() => {
                    if (cartQuantity < availableStock) {
                      onUpdateQuantity(directItemSkuId, cartQuantity + 1);
                    }
                  }}
                >
                  <Plus className="h-4 w-4" />
                </IconButton>
              </ButtonGroup>
            ) : (
              <Button
                variant="outlined"
                onClick={() => void onAddToCart(item)}
                disabled={availableStock <= 0}
                size="small"
              >
                <FormattedMessage id="market.addToCart" defaultMessage="Add to cart" />
              </Button>
            )}
            {!isCredit && (
              <Button
                variant="contained"
                onClick={() => void onBuyNow(item)}
                disabled={availableStock <= 0}
                size="small"
              >
                <FormattedMessage id="market.buyNow" defaultMessage="Buy now" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

type MarketManufacturerOption = {
  id: number;
  name: string;
  logoPath: string | null;
};

type MarketShipFocusOption = {
  focus: string;
  label: string;
  shipCount: number;
  imageUrl: string;
  sampleShipName: string;
};

interface MarketFilterPanelProps {
  selectedItemFilter: MarketItemFilterOption;
  selectedShipTraitFilter: MarketShipTraitFilter | 'all';
  selectedShipFocus: MarketShipFocusFilter | 'all';
  selectedManufacturerId: number | null;
  showsShipTraitFilters: boolean;
  showsShipFocusFilter: boolean;
  showsManufacturerFilter: boolean;
  shipFocusOptions: MarketShipFocusOption[];
  manufacturerOptions: MarketManufacturerOption[];
  onChangeItemFilter: (nextFilter: MarketItemFilterOption) => void;
  onChangeShipTraitFilter: (nextShipTrait: MarketShipTraitFilter | 'all') => void;
  onChangeShipFocus: (nextShipFocus: MarketShipFocusFilter | 'all') => void;
  onChangeManufacturerId: (nextManufacturerId: number | null) => void;
}

const MarketFilterPanel = React.memo(function MarketFilterPanel({
  selectedItemFilter,
  selectedShipTraitFilter,
  selectedShipFocus,
  selectedManufacturerId,
  showsShipTraitFilters,
  showsShipFocusFilter,
  showsManufacturerFilter,
  shipFocusOptions,
  manufacturerOptions,
  onChangeItemFilter,
  onChangeShipTraitFilter,
  onChangeShipFocus,
  onChangeManufacturerId,
}: MarketFilterPanelProps) {
  const intl = useIntl();

  return (
    <Box sx={{ borderRadius: 0, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', p: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        <FormattedMessage id="market.filter.type" defaultMessage="Item Type" />
      </Typography>
      <RadioGroup
        value={selectedItemFilter}
        onChange={(event) => {
          onChangeItemFilter(event.target.value as MarketItemFilterOption);
        }}
      >
        <FormControlLabel control={<Radio size="small" />} value="all" label={intl.formatMessage({ id: 'market.filter.all', defaultMessage: 'All' })} />
        <FormControlLabel control={<Radio size="small" />} value="ccu" label={intl.formatMessage({ id: 'market.filter.ccu', defaultMessage: 'CCU' })} />
        <FormControlLabel control={<Radio size="small" />} value="standalone_ship" label={intl.formatMessage({ id: 'market.filter.standaloneShip', defaultMessage: 'Standalone Ship' })} />
        <FormControlLabel control={<Radio size="small" />} value="ship_package" label={intl.formatMessage({ id: 'market.filter.shipPackage', defaultMessage: 'Ship Package' })} />
        <FormControlLabel control={<Radio size="small" />} value="paint" label={intl.formatMessage({ id: 'market.filter.paint', defaultMessage: 'Paint' })} />
        <FormControlLabel control={<Radio size="small" />} value="other" label={intl.formatMessage({ id: 'market.filter.other', defaultMessage: 'Other' })} />
        <FormControlLabel control={<Radio size="small" />} value="credit" label={intl.formatMessage({ id: 'market.filter.credit', defaultMessage: 'Credit' })} />
      </RadioGroup>

      {(showsShipTraitFilters || showsShipFocusFilter || showsManufacturerFilter) && (
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
                  onChangeShipTraitFilter(event.target.value as MarketShipTraitFilter | 'all');
                }}
              >
                <FormControlLabel
                  control={<Radio size="small" />}
                  value="all"
                  label={intl.formatMessage({ id: 'market.filter.shipTraits.all', defaultMessage: 'All ship listings' })}
                />
                <FormControlLabel control={<Radio size="small" />} value="oc" label={intl.formatMessage({ id: 'market.tag.oc', defaultMessage: 'OC' })} />
                <FormControlLabel control={<Radio size="small" />} value="non_oc" label={intl.formatMessage({ id: 'market.tag.nonOc', defaultMessage: 'Non-OC' })} />
                <FormControlLabel control={<Radio size="small" />} value="lti" label={intl.formatMessage({ id: 'market.tag.lti', defaultMessage: 'LTI' })} />
              </RadioGroup>
            </>
          )}

          {showsShipFocusFilter && shipFocusOptions.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />

              <TextField
                select
                fullWidth
                size="small"
                label={intl.formatMessage({ id: 'market.filter.shipFocus', defaultMessage: 'Ship Role' })}
                value={selectedShipFocus}
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: 0 }
                }}
                onChange={(event) => {
                  const nextShipFocus = normalizeShipFocusParam(event.target.value);
                  onChangeShipFocus((nextShipFocus || 'all') as MarketShipFocusFilter | 'all');
                }}
              >
                <MenuItem value="all">
                  {intl.formatMessage({ id: 'market.filter.shipFocus.all', defaultMessage: 'All roles' })}
                </MenuItem>
                {shipFocusOptions.map((shipFocus) => (
                  <MenuItem key={shipFocus.focus} value={shipFocus.focus}>
                    {shipFocus.label}
                  </MenuItem>
                ))}
              </TextField>
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
                  onChangeManufacturerId(parsePositiveInteger(event.target.value));
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
  );
});

interface AccountMarketPanelProps {
  accountCouponCode: string;
  compact?: boolean;
  onCopyCouponCode: () => void | Promise<void>;
  onNavigate?: () => void;
}

const AccountMarketPanel = React.memo(function AccountMarketPanel({
  accountCouponCode,
  compact = false,
  onCopyCouponCode,
  onNavigate,
}: AccountMarketPanelProps) {
  const intl = useIntl();

  return (
    <Box sx={{ borderRadius: 0, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', p: compact ? 1.75 : 2 }}>
      <div className='flex flex-col gap-3'>
        <div className='text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300'>
          <FormattedMessage id="accountMarket.panel.eyebrow" defaultMessage="Looking for a Star Citizen account?" />
        </div>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.35 }}>
          <FormattedMessage id="accountMarket.panel.title" defaultMessage="Premium Star Citizen accounts on sale now" />
        </Typography>
        {!compact && (
          <Typography variant="body2" color="text.secondary">
            <FormattedMessage
              id="accountMarket.panel.description"
              defaultMessage="Browse our accounts for sale, including limited ships, retired items, buyback access, and extras. If you need something specific, contact us about a custom account."
            />
          </Typography>
        )}

        <div className='border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/20'>
          <div className='text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300'>
            <FormattedMessage id="accountMarket.panel.codeLabel" defaultMessage="Discount code" />
          </div>
          <div className='mt-1 flex items-start gap-1'>
            <div className='min-w-0 break-all text-lg font-black leading-tight text-slate-900 dark:text-white'>{accountCouponCode}</div>
            <Tooltip title={intl.formatMessage({ id: 'common.copy', defaultMessage: 'Copy' })} arrow>
              <IconButton size="small" sx={{ flexShrink: 0, mt: '1px' }} onClick={() => void onCopyCouponCode()}>
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

        <Button component={Link} to={getAccountMarketListPath()} onClick={onNavigate} variant="contained" fullWidth sx={{ borderRadius: 0 }}>
          <FormattedMessage id="accountMarket.panel.cta" defaultMessage="Browse Accounts" />
        </Button>
      </div>
    </Box>
  );
});

interface MarketListingControlsProps {
  searchTerm: string;
  sortBy: MarketSortMode;
  activeFilterCount: number;
  placeholder: string;
  onCommitSearch: (value: string) => void;
  onOpenMobileFilters: () => void;
  onChangeSortBy: (nextSortBy: MarketSortMode) => void;
}

const MarketListingControls = React.memo(function MarketListingControls({
  searchTerm,
  sortBy,
  activeFilterCount,
  placeholder,
  onCommitSearch,
  onOpenMobileFilters,
  onChangeSortBy,
}: MarketListingControlsProps) {
  const intl = useIntl();

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 220px' },
        gap: 2,
        borderRadius: 0,
        borderBottom: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        p: 2,
      }}
    >
      <MarketListingSearchField
        id="market-listing-search-input"
        value={searchTerm}
        placeholder={placeholder}
        onCommit={onCommitSearch}
      />

      <div className='grid gap-2 lg:hidden'>
        <Button
          variant="outlined"
          fullWidth
          startIcon={<FilterListOutlined />}
          onClick={onOpenMobileFilters}
          sx={{
            minHeight: 40,
            borderRadius: 0,
            justifyContent: 'start',
            px: 1.5,
            textTransform: 'none'
          }}
        >
          <span className='mr-2'>
            <FormattedMessage id="admin.bi.filter" defaultMessage="Filter" />
          </span>
          <span className='text-xs text-slate-500 dark:text-slate-400'>
            {activeFilterCount > 0
              ? `${activeFilterCount}`
              : intl.formatMessage({ id: 'market.filter.all', defaultMessage: 'All' })}
          </span>
        </Button>
      </div>

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
          onChangeSortBy(event.target.value as MarketSortMode);
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
  );
});

interface MarketListingGridProps {
  contentReady: boolean;
  refreshing: boolean;
  initialLoading: boolean;
  visibleListingItems: ListingItem[];
  ships: Ship[];
  cartQuantityByResourceId: Map<string, number>;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  page: number;
  rowsPerPage: number;
  isMobileListingDrawer: boolean;
  listingDrawerOpen: boolean;
  mobileLoadingNextPage: boolean;
  mobileHasMoreListings: boolean;
  infiniteSentinelRef: React.RefObject<HTMLDivElement | null>;
  onOpenDetails: (item: ListingItem) => void;
  onAddToCart: (item: ListingItem) => void | Promise<void>;
  onBuyNow: (item: ListingItem) => void | Promise<void>;
  onRemoveFromCart: (resourceId: string) => void;
  onUpdateQuantity: (resourceId: string, quantity: number) => void;
  onChangePage: (newPage: number) => void;
  onChangeRowsPerPage: (nextRowsPerPage: number) => void;
}

const MarketListingGrid = React.memo(function MarketListingGrid({
  contentReady,
  refreshing,
  initialLoading,
  visibleListingItems,
  ships,
  cartQuantityByResourceId,
  pagination,
  page,
  rowsPerPage,
  isMobileListingDrawer,
  listingDrawerOpen,
  mobileLoadingNextPage,
  mobileHasMoreListings,
  infiniteSentinelRef,
  onOpenDetails,
  onAddToCart,
  onBuyNow,
  onRemoveFromCart,
  onUpdateQuantity,
  onChangePage,
  onChangeRowsPerPage,
}: MarketListingGridProps) {
  const intl = useIntl();

  return (
    <Box sx={{ position: 'relative', p: 2 }}>
      {!contentReady ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={360}>
          <CircularProgress size={22} />
        </Box>
      ) : (
        <>
          {refreshing && !initialLoading && (
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

          {initialLoading && visibleListingItems.length === 0 ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight={360}>
              <CircularProgress />
            </Box>
          ) : visibleListingItems.length === 0 ? (
            <Box sx={{ borderRadius: 0, border: '1px dashed', borderColor: 'divider', backgroundColor: 'background.paper', p: 6, textAlign: 'center' }}>
              <Typography variant="h6">
                <FormattedMessage id="market.noResults" defaultMessage="No products found" />
              </Typography>
            </Box>
          ) : (
            <>
              <div className='grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5'>
                {visibleListingItems.map((item) => {
                  const directItem = resolveDirectMarketItem(item);
                  const directItemSkuId = directItem?.skuId || item.skuId;

                  return (
                    <MarketListingCard
                      key={item.skuId}
                      item={item}
                      ships={ships}
                      cartQuantity={cartQuantityByResourceId.get(directItemSkuId) || 0}
                      onOpenDetails={onOpenDetails}
                      onAddToCart={onAddToCart}
                      onBuyNow={onBuyNow}
                      onRemoveFromCart={onRemoveFromCart}
                      onUpdateQuantity={onUpdateQuantity}
                    />
                  );
                })}
              </div>

              {isMobileListingDrawer && listingDrawerOpen && (
                <Box
                  ref={infiniteSentinelRef}
                  sx={{
                    minHeight: 72,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'text.secondary',
                  }}
                >
                  {mobileLoadingNextPage ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CircularProgress size={18} />
                      <Typography variant="body2">
                        <FormattedMessage id="market.loading" defaultMessage="Loading..." />
                      </Typography>
                    </Stack>
                  ) : mobileHasMoreListings ? (
                    <Typography variant="body2">
                      <FormattedMessage id="market.mobileScrollMore" defaultMessage="Scroll for more listings" />
                    </Typography>
                  ) : (
                    <Typography variant="body2">
                      <FormattedMessage id="market.mobileScrollEnd" defaultMessage="All listings loaded" />
                    </Typography>
                  )}
                </Box>
              )}

              <Box sx={{ display: { xs: 'none', md: 'block' }, mt: 2, borderRadius: 0, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper' }}>
                <TablePagination
                  rowsPerPageOptions={[15, 30]}
                  component="div"
                  count={pagination.total}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={(_event, newPage) => {
                    onChangePage(newPage);
                  }}
                  onRowsPerPageChange={(event) => {
                    onChangeRowsPerPage(parseInt(event.target.value, 10));
                  }}
                  labelRowsPerPage={intl.formatMessage({ id: 'pagination.rowsPerPage', defaultMessage: 'Rows per page:' })}
                  labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${intl.formatMessage({ id: 'pagination.total', defaultMessage: 'Total' })} ${count}`}
                />
              </Box>
            </>
          )}
        </>
      )}
    </Box>
  );
});

const MemoizedCrawler = React.memo(Crawler);

interface MarketCcuRoutePlannerProps {
  ships: Ship[];
}

const MarketCcuRoutePlanner = React.memo(function MarketCcuRoutePlanner({
  ships,
}: MarketCcuRoutePlannerProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const selectedHangarItems = useSelector(selectUsersHangarItems);
  const {
    cart,
    addToCart,
    openCart,
    updateItemQuantity,
  } = useCartStore();
  const [plannerStartShipId, setPlannerStartShipId] = useState<number | ''>('');
  const [plannerTargetShipId, setPlannerTargetShipId] = useState<number | ''>('');
  const [plannerIncludeHangarCcus, setPlannerIncludeHangarCcus] = useState(false);
  const [plannerRoute, setPlannerRoute] = useState<MarketRouteResult | null>(null);
  const [plannerRouteCalculating, setPlannerRouteCalculating] = useState(false);
  const [plannerExtensionModalOpen, setPlannerExtensionModalOpen] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  const plannerHangarItems = useMemo<HangarItem[]>(() => selectedHangarItems.ccus.map((upgrade, index) => ({
    id: index,
    name: upgrade.name,
    type: 'ccu',
    fromShip: upgrade.parsed.from,
    toShip: upgrade.parsed.to,
    price: upgrade.value,
  })), [selectedHangarItems.ccus]);
  const {
    data: ccusData,
    error: ccusError,
    isLoading: ccusLoading,
  } = useApi<CcusData>('/api/ccus', {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const {
    data: marketRouteData,
    error: marketRouteError,
    isLoading: marketRouteLoading,
  } = useApi<LowestMarketCcuResponse>('/api/market/ccu/lowest', {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const { data: ltiShipsData } = useApi<LtiShipsResponse>('/api/lti-ships', {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  const ccus = useMemo(() => ccusData?.data?.to?.ships || [], [ccusData]);
  const plannerHangarStartShipIds = useMemo(() => {
    const shipIds = new Set<number>();

    selectedHangarItems.ships
      .filter((item) => !item.isBuyBack && typeof item.id === 'number')
      .forEach((item) => shipIds.add(item.id));

    selectedHangarItems.bundles
      .filter((bundle) => !bundle.isBuyBack)
      .forEach((bundle) => {
        (bundle.ships || []).forEach((bundleShip) => {
          if (typeof bundleShip.id === 'number') {
            shipIds.add(bundleShip.id);
            return;
          }

          const matchedShip = findShipByIdOrName(ships, bundleShip.name || null);
          if (matchedShip) {
            shipIds.add(matchedShip.id);
          }
        });
      });

    return shipIds;
  }, [selectedHangarItems.bundles, selectedHangarItems.ships, ships]);
  const plannerLtiSeedShipIds = useMemo(() => {
    const shipIds = new Set<number>();

    (ltiShipsData?.data?.ships || []).forEach((entry) => {
      if (!hasAvailableWarbondLtiSeedSku(entry)) {
        return;
      }

      const matchedShip = findShipByIdOrName(ships, {
        id: entry.shipId,
        name: entry.shipName || entry.shipTitle,
      });
      if (matchedShip) {
        shipIds.add(matchedShip.id);
      }
    });

    return shipIds;
  }, [ltiShipsData?.data?.ships, ships]);
  const plannerStartShipOptions = useMemo(
    () => ships
      .filter((ship) => ship.msrp >= MARKET_PLANNER_MIN_START_MSRP_CENTS)
      .sort((left, right) => {
        const leftPriority = plannerHangarStartShipIds.has(left.id) ? 0 : plannerLtiSeedShipIds.has(left.id) ? 1 : 2;
        const rightPriority = plannerHangarStartShipIds.has(right.id) ? 0 : plannerLtiSeedShipIds.has(right.id) ? 1 : 2;

        return leftPriority - rightPriority || left.msrp - right.msrp || left.id - right.id;
      }),
    [plannerHangarStartShipIds, plannerLtiSeedShipIds, ships],
  );
  const plannerStartShip = useMemo(
    () => plannerStartShipId ? ships.find((ship) => ship.id === plannerStartShipId) || null : null,
    [plannerStartShipId, ships],
  );
  const plannerTargetShip = useMemo(
    () => plannerTargetShipId ? ships.find((ship) => ship.id === plannerTargetShipId) || null : null,
    [plannerTargetShipId, ships],
  );
  const plannerTargetShipOptions = useMemo(
    () => ships
      .filter((ship) => (
        ship.msrp > 0
        && ship.msrp <= MARKET_PLANNER_MAX_TARGET_MSRP_CENTS
        && (!plannerStartShip || ship.msrp > plannerStartShip.msrp)
      ))
      .sort((left, right) => left.msrp - right.msrp || left.id - right.id),
    [plannerStartShip, ships],
  );
  const targetShipListingSearchPath = useMemo(() => {
    if (!plannerTargetShip) {
      return null;
    }

    const params = new URLSearchParams({
      search: plannerTargetShip.name || getShipDisplayName(plannerTargetShip),
      shipTrait: 'lti',
      sortBy: 'priceAsc',
      page: '0',
      limit: '15',
    });
    params.append('browseCategory', 'standalone_ship');
    params.append('browseCategory', 'ship_package');

    return `/api/market/search?${params.toString()}`;
  }, [plannerTargetShip]);
  const {
    data: targetShipListingResponse,
    isLoading: targetShipListingLoading,
  } = useApi<MarketListResponse>(targetShipListingSearchPath, {
    keepPreviousData: true,
  });
  const plannerRouteInput = useMemo(() => {
    if (!plannerStartShip || !plannerTargetShip || plannerTargetShip.msrp <= plannerStartShip.msrp) {
      return null;
    }

    return {
      startShip: plannerStartShip,
      targetShip: plannerTargetShip,
      ships,
      ccus,
      hangarItems: plannerIncludeHangarCcus ? plannerHangarItems : [],
      marketGroups: marketRouteData?.items || [],
    };
  }, [ccus, marketRouteData?.items, plannerHangarItems, plannerIncludeHangarCcus, plannerStartShip, plannerTargetShip, ships]);

  useEffect(() => {
    if (!plannerRouteInput) {
      setPlannerRoute(null);
      setPlannerRouteCalculating(false);
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    setPlannerRouteCalculating(true);

    const frameId = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        const nextRoute = buildCurrentMarketRoute(plannerRouteInput);
        if (cancelled) {
          return;
        }

        setPlannerRoute(nextRoute);
        setPlannerRouteCalculating(false);
      }, 0);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [plannerRouteInput]);

  const displayedPlannerRoute = plannerRouteCalculating ? null : plannerRoute;
  const plannerRouteMarketEdges = useMemo(
    () => displayedPlannerRoute?.edges.filter((edge) => edge.sourceType === CcuSourceType.THIRD_PARTY && edge.listing) || [],
    [displayedPlannerRoute],
  );
  const plannerHangarEdgeCount = useMemo(
    () => displayedPlannerRoute?.edges.filter((edge) => edge.sourceType === CcuSourceType.HANGER).length || 0,
    [displayedPlannerRoute],
  );
  const plannerRoutePurchasableCcuCount = useMemo(
    () => displayedPlannerRoute?.edges.filter((edge) => edge.sourceType !== CcuSourceType.HANGER).length || 0,
    [displayedPlannerRoute],
  );
  const plannerOfficialCashSpend = useMemo(
    () => Number((displayedPlannerRoute?.edges.reduce((sum, edge) => (
      edge.sourceType === CcuSourceType.AVAILABLE_WB || edge.sourceType === CcuSourceType.OFFICIAL_WB
        ? sum + edge.cost
        : sum
    ), 0) || 0).toFixed(2)),
    [displayedPlannerRoute],
  );
  const plannerOfficialStoreCreditSpend = useMemo(
    () => Number((displayedPlannerRoute?.edges.reduce((sum, edge) => (
      edge.sourceType === CcuSourceType.OFFICIAL
        ? sum + edge.cost
        : sum
    ), 0) || 0).toFixed(2)),
    [displayedPlannerRoute],
  );
  const plannerMarketListingPrice = useMemo(
    () => Number(plannerRouteMarketEdges.reduce((sum, edge) => sum + edge.cost, 0).toFixed(2)),
    [plannerRouteMarketEdges],
  );
  const plannerHangarSpend = useMemo(
    () => Number((displayedPlannerRoute?.edges.reduce((sum, edge) => (
      edge.sourceType === CcuSourceType.HANGER
        ? sum + edge.cost
        : sum
    ), 0) || 0).toFixed(2)),
    [displayedPlannerRoute],
  );
  const {
    data: plannerCreditListing,
    error: plannerCreditError,
    isLoading: plannerCreditLoading,
  } = useApi<ListingItem>(plannerOfficialStoreCreditSpend > 0 ? '/api/market/item/credit-pool' : null, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const plannerSelectedCreditOptions = useMemo(
    () => findMatchingCreditPoolOptions(plannerCreditListing, plannerOfficialStoreCreditSpend),
    [plannerCreditListing, plannerOfficialStoreCreditSpend],
  );
  const plannerCreditFaceValue = useMemo(
    () => plannerSelectedCreditOptions?.reduce((sum, option) => sum + option.amount, 0) || 0,
    [plannerSelectedCreditOptions],
  );
  const plannerCreditPrice = useMemo(
    () => plannerSelectedCreditOptions?.reduce((sum, option) => sum + option.price, 0) || 0,
    [plannerSelectedCreditOptions],
  );
  const plannerOrderTotal = useMemo(
    () => Number((plannerMarketListingPrice + plannerCreditPrice + plannerOfficialCashSpend + plannerHangarSpend).toFixed(2)),
    [plannerCreditPrice, plannerHangarSpend, plannerMarketListingPrice, plannerOfficialCashSpend],
  );
  const plannerInstantSavings = useMemo(
    () => displayedPlannerRoute && plannerStartShip && plannerTargetShip
      ? Number(Math.max(0, ((plannerTargetShip.msrp - plannerStartShip.msrp) / 100) - plannerOrderTotal).toFixed(2))
      : 0,
    [displayedPlannerRoute, plannerOrderTotal, plannerStartShip, plannerTargetShip],
  );
  const plannerTargetShipListingRecommendation = useMemo(() => {
    if (!plannerTargetShip) {
      return null;
    }

    const listings = (targetShipListingResponse?.items || [])
      .filter((item) => getAvailableStock(item) > 0)
      .filter((item) => isLtiShipListing(item))
      .filter((item) => isListingForShip(item, plannerTargetShip, ships))
      .sort((left, right) => left.price - right.price || left.skuId.localeCompare(right.skuId));

    const listing = listings[0];
    if (!listing) {
      return null;
    }

    if (!displayedPlannerRoute || !plannerStartShip) {
      return {
        item: listing,
        mode: 'noRoute' as const,
        difference: 0,
      };
    }

    const priceDifference = Number((listing.price - plannerOrderTotal).toFixed(2));
    if (priceDifference < 0) {
      return {
        item: listing,
        mode: 'save' as const,
        difference: Math.abs(priceDifference),
      };
    }

    const startShipMsrp = plannerStartShip.msrp / 100;
    if (priceDifference > 0 && priceDifference < startShipMsrp) {
      return {
        item: listing,
        mode: 'spendMore' as const,
        difference: priceDifference,
      };
    }

    return null;
  }, [displayedPlannerRoute, plannerOrderTotal, plannerStartShip, plannerTargetShip, ships, targetShipListingResponse?.items]);
  const plannerTargetShipRecommendationText = useMemo(() => {
    if (!plannerTargetShipListingRecommendation || !plannerTargetShip) {
      return '';
    }

    const targetShipName = getShipDisplayName(plannerTargetShip);
    const startShipName = plannerStartShip ? getShipDisplayName(plannerStartShip) : '';

    if (plannerTargetShipListingRecommendation.mode === 'save') {
      return intl.formatMessage(
        {
          id: 'market.ccuPlanner.targetShipListingSave',
          defaultMessage: 'Save {amount} and keep your {startShip}, buy LTI {targetShip} now',
        },
        {
          amount: formatUsdPrice(intl.locale, plannerTargetShipListingRecommendation.difference),
          startShip: startShipName,
          targetShip: targetShipName,
        },
      );
    }

    if (plannerTargetShipListingRecommendation.mode === 'spendMore') {
      return intl.formatMessage(
        {
          id: 'market.ccuPlanner.targetShipListingSpendMore',
          defaultMessage: 'Spend only {amount} more and keep your {startShip}, buy LTI {targetShip} now',
        },
        {
          amount: formatUsdPrice(intl.locale, plannerTargetShipListingRecommendation.difference),
          startShip: startShipName,
          targetShip: targetShipName,
        },
      );
    }

    return intl.formatMessage(
      {
        id: 'market.ccuPlanner.targetShipListingNoRoute',
        defaultMessage: 'Buy LTI {targetShip} now',
      },
      {
        targetShip: targetShipName,
      },
    );
  }, [intl, plannerStartShip, plannerTargetShip, plannerTargetShipListingRecommendation]);

  const handleOpenDetails = useCallback((item: ListingItem) => {
    window.open(getMarketDetailUrl(item.skuId), '_blank', 'noopener,noreferrer');
  }, []);

  const resolveDirectMarketItemForAction = useCallback(async (item: ListingItem): Promise<ListingItem | null> => {
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
  }, []);

  const handleBuyNow = useCallback(async (item: ListingItem) => {
    const targetItem = await resolveDirectMarketItemForAction(item);
    if (!targetItem || getAvailableStock(targetItem) <= 0) {
      handleOpenDetails(item);
      return;
    }

    const directCheckoutItems = [buildMarketCartItem(targetItem, 1, ships)];
    saveDirectCheckoutItems(directCheckoutItems);
    navigate(getDirectCheckoutPath());
  }, [handleOpenDetails, navigate, resolveDirectMarketItemForAction, ships]);

  const validateMarketRouteListingStock = useCallback((edges: MarketRouteEdge[]) => {
    const plannedListingQuantities = new Map<string, number>();

    for (const edge of edges) {
      const listing = edge.listing;
      if (!listing) {
        continue;
      }

      const availableStock = getAvailableStock(listing);
      const nextQuantity = (plannedListingQuantities.get(listing.skuId) || 0) + 1;
      plannedListingQuantities.set(listing.skuId, nextQuantity);

      if (availableStock < nextQuantity) {
        return false;
      }
    }

    return true;
  }, []);

  const validatePlannerCartStock = useCallback((items: PlannerRoutePurchaseItems['cartItems']) => {
    for (const item of items) {
      const existingQuantity = cart.find((cartItem: CartItemType) => cartItem.resource.id === item.resource.id)?.quantity || 0;
      if (existingQuantity + item.quantity > item.availableStock) {
        return false;
      }
    }

    return true;
  }, [cart]);

  const buildPlannerRoutePurchaseItems = useCallback((): PlannerRoutePurchaseItems | null => {
    if (!displayedPlannerRoute || !plannerStartShip || !plannerTargetShip) {
      setSnackbarMessage(intl.formatMessage({
        id: 'market.ccuPlanner.selectShipsFirst',
        defaultMessage: 'Select a starting ship and target ship first.',
      }));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return null;
    }

    if (!validateMarketRouteListingStock(plannerRouteMarketEdges)) {
      setSnackbarMessage(intl.formatMessage({
        id: 'cart.stockLimit',
        defaultMessage: 'Cannot add more than available stock',
      }));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return null;
    }

    const checkoutItems = plannerRouteMarketEdges
      .flatMap((edge) => edge.listing ? [buildMarketCartItem(edge.listing, 1, ships)] : []);
    const cartItemMap = new Map<string, {
      resource: Resource;
      quantity: number;
      availableStock: number;
    }>();
    const addCartListing = (listing: ListingItem, quantity = 1) => {
      const resource = buildMarketResource(listing, ships);
      const availableStock = listing.itemType === 'credit' ? Number.MAX_SAFE_INTEGER : getAvailableStock(listing);
      const existingItem = cartItemMap.get(resource.id);
      if (existingItem) {
        existingItem.quantity += quantity;
        existingItem.availableStock = Math.min(existingItem.availableStock, availableStock);
        return;
      }

      cartItemMap.set(resource.id, {
        resource,
        quantity,
        availableStock,
      });
    };

    plannerRouteMarketEdges.forEach((edge) => {
      if (edge.listing) {
        addCartListing(edge.listing);
      }
    });

    if (plannerOfficialStoreCreditSpend > 0) {
      if (plannerCreditLoading) {
        setSnackbarMessage(intl.formatMessage({
          id: 'pathBuilder.marketRouteCreditLoading',
          defaultMessage: 'Store Credit options are still loading. Try again in a moment.',
        }));
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
        return null;
      }

      if (!plannerSelectedCreditOptions?.length || !plannerCreditListing) {
        setSnackbarMessage(intl.formatMessage(
          {
            id: 'pathBuilder.marketRouteCreditUnavailable',
            defaultMessage: 'No combination of Store Credit amounts can cover the required normal-upgrade spend of {amount}.',
          },
          {
            amount: formatUsdPrice(intl.locale, plannerOfficialStoreCreditSpend),
          },
        ));
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
        return null;
      }

      plannerSelectedCreditOptions.forEach((option) => {
        const creditListing = buildSelectedCreditListing(plannerCreditListing, option);
        const namedCreditListing = {
          ...creditListing,
          name: formatMarketCreditResourceName(intl, option.amount),
        };
        checkoutItems.push(buildMarketCartItem(namedCreditListing, 1, ships));
        addCartListing(namedCreditListing);
      });
    }

    if (checkoutItems.length === 0) {
      setSnackbarMessage(intl.formatMessage({
        id: 'market.ccuPlanner.noPurchasableItems',
        defaultMessage: 'This route has no market items to checkout.',
      }));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return null;
    }

    return {
      checkoutItems,
      cartItems: Array.from(cartItemMap.values()),
    };
  }, [
    displayedPlannerRoute,
    intl,
    plannerCreditListing,
    plannerCreditLoading,
    plannerOfficialStoreCreditSpend,
    plannerRouteMarketEdges,
    plannerSelectedCreditOptions,
    plannerStartShip,
    plannerTargetShip,
    ships,
    validateMarketRouteListingStock,
  ]);

  const handlePlanRouteCheckout = useCallback(() => {
    const purchaseItems = buildPlannerRoutePurchaseItems();
    if (!purchaseItems || !displayedPlannerRoute) {
      return;
    }

    if (!saveMarketRouteToPlannerWorkspace(displayedPlannerRoute, intl.locale)) {
      setSnackbarMessage(intl.formatMessage({
        id: 'market.ccuPlanner.routeSaveFailed',
        defaultMessage: 'Could not add this route to CCU Planner. Please try again.',
      }));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    saveDirectCheckoutItems(purchaseItems.checkoutItems);
    navigate(getDirectCheckoutPath(), {
      state: {
        directCheckoutItems: purchaseItems.checkoutItems,
        ships,
      },
    });
  }, [buildPlannerRoutePurchaseItems, displayedPlannerRoute, intl, navigate, ships]);

  const handlePlanRouteAddToCart = useCallback(() => {
    const purchaseItems = buildPlannerRoutePurchaseItems();
    if (!purchaseItems || !displayedPlannerRoute) {
      return;
    }

    if (!validatePlannerCartStock(purchaseItems.cartItems)) {
      setSnackbarMessage(intl.formatMessage({
        id: 'cart.stockLimit',
        defaultMessage: 'Cannot add more than available stock',
      }));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    if (!saveMarketRouteToPlannerWorkspace(displayedPlannerRoute, intl.locale)) {
      setSnackbarMessage(intl.formatMessage({
        id: 'market.ccuPlanner.routeSaveFailed',
        defaultMessage: 'Could not add this route to CCU Planner. Please try again.',
      }));
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    purchaseItems.cartItems.forEach((item) => {
      const existingQuantity = cart.find((cartItem: CartItemType) => cartItem.resource.id === item.resource.id)?.quantity || 0;
      if (existingQuantity > 0) {
        updateItemQuantity(item.resource.id, existingQuantity + item.quantity);
      } else {
        addToCart(item.resource);
        if (item.quantity > 1) {
          updateItemQuantity(item.resource.id, item.quantity);
        }
      }
    });

    setSnackbarMessage(intl.formatMessage({
      id: 'market.ccuPlanner.addedToCart',
      defaultMessage: 'Route items added to cart',
    }));
    setSnackbarSeverity('success');
    setSnackbarOpen(true);
    openCart();
  }, [
    addToCart,
    buildPlannerRoutePurchaseItems,
    cart,
    displayedPlannerRoute,
    intl,
    openCart,
    updateItemQuantity,
    validatePlannerCartStock,
  ]);

  const routeDataLoading = ccusLoading || marketRouteLoading;
  const routeDataError = Boolean(ccusError || marketRouteError);
  const invalidRange = Boolean(plannerStartShip && plannerTargetShip && plannerTargetShip.msrp <= plannerStartShip.msrp);
  const routeCalculating = plannerRouteCalculating && Boolean(plannerStartShip && plannerTargetShip && !invalidRange);
  const needsCredit = plannerOfficialStoreCreditSpend > 0;
  const creditUnavailable = needsCredit && !plannerCreditLoading && (!plannerSelectedCreditOptions?.length || !plannerCreditListing || Boolean(plannerCreditError));
  const targetShipRecommendationItem = plannerTargetShipListingRecommendation?.item || null;
  const targetShipRecommendationPrice = targetShipRecommendationItem
    ? formatUsdPrice(intl.locale, targetShipRecommendationItem.price)
    : '';
  const canCheckout = Boolean(
    displayedPlannerRoute
    && (plannerRouteMarketEdges.length > 0 || needsCredit)
    && !routeCalculating
    && !routeDataLoading
    && !routeDataError
    && !creditUnavailable
    && (!needsCredit || !plannerCreditLoading),
  );

  return (
    <>
      <section className='grid gap-4 border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-neutral-900 md:p-5'>
        <div className='flex flex-col gap-2 md:flex-row md:items-end md:justify-between'>
          <div>
            <div className='text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300'>
              <FormattedMessage id="market.ccuPlanner.eyebrow" defaultMessage="CCU route checkout" />
            </div>
            <Typography component="h2" sx={{ mt: 0.75, fontWeight: 900, fontSize: { xs: 22, md: 28 }, lineHeight: 1.15, color: 'text.primary' }}>
              <FormattedMessage id="market.ccuPlanner.title" defaultMessage="CCU Chain Planner" />
            </Typography>
            <Typography sx={{ mt: 1, maxWidth: 760, color: 'text.secondary', fontSize: 14, lineHeight: 1.7 }}>
              <FormattedMessage
                id="market.ccuPlanner.description"
                defaultMessage="Use our CCU planner to save money and upgrade to your target ship now."
              />
            </Typography>
          </div>

          <div className='flex shrink-0 flex-wrap items-center gap-2'>
            <Button
              variant="outlined"
              disabled={!canCheckout}
              onClick={handlePlanRouteAddToCart}
              startIcon={<ShoppingCart className="h-4 w-4" />}
              sx={{ borderRadius: 0, minHeight: 42 }}
            >
              <FormattedMessage id="market.ccuPlanner.addToCart" defaultMessage="Add route to cart" />
            </Button>
            <Button
              variant="contained"
              disabled={!canCheckout}
              onClick={handlePlanRouteCheckout}
              sx={{ borderRadius: 0, minHeight: 42 }}
            >
              <FormattedMessage id="market.ccuPlanner.checkout" defaultMessage="Add route to CCU Planner and checkout" />
            </Button>
          </div>
        </div>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) minmax(0,1fr)' },
            gap: 2,
          }}
        >
          <Autocomplete
            value={plannerStartShip}
            options={plannerStartShipOptions}
            loading={!ships.length}
            filterOptions={(options, state) => filterShipOptions(options, state.inputValue)}
            getOptionLabel={(option) => getShipDisplayName(option)}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            onChange={(_event, value) => {
              setPlannerRouteCalculating(Boolean(value && plannerTargetShip && plannerTargetShip.msrp > value.msrp));
              setPlannerStartShipId(value?.id || '');
              if (value && plannerTargetShip && plannerTargetShip.msrp <= value.msrp) {
                setPlannerTargetShipId('');
              }
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={intl.formatMessage({ id: 'market.ccuPlanner.startShip', defaultMessage: 'Starting ship' })}
                placeholder={intl.formatMessage({ id: 'market.ccuPlanner.shipSearch', defaultMessage: 'Search ships...' })}
                size="small"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
              />
            )}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box
                  component="img"
                  src={getShipThumbSmall(option) || '/rsi-icons/ship.svg'}
                  alt=""
                  sx={{ width: 42, height: 28, objectFit: 'cover', bgcolor: 'grey.200', flexShrink: 0 }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {getShipDisplayName(option)}
                  </Box>
                  <Box sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {formatUsdPrice(intl.locale, option.msrp / 100)}
                  </Box>
                  {(plannerHangarStartShipIds.has(option.id) || plannerLtiSeedShipIds.has(option.id)) && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {plannerHangarStartShipIds.has(option.id) && (
                        <Chip
                          size="small"
                          label={intl.formatMessage({ id: 'market.ccuPlanner.hangarStartOption', defaultMessage: 'Hangar' })}
                          sx={{ height: 18, fontSize: 11 }}
                        />
                      )}
                      {plannerLtiSeedShipIds.has(option.id) && (
                        <Chip
                          size="small"
                          color="success"
                          label={intl.formatMessage({ id: 'market.ccuPlanner.ltiSeedStartOption', defaultMessage: 'RSI LTI seed' })}
                          sx={{ height: 18, fontSize: 11 }}
                        />
                      )}
                    </Box>
                  )}
                </Box>
              </Box>
            )}
          />

          <Autocomplete
            value={plannerTargetShip}
            options={plannerTargetShipOptions}
            loading={!ships.length}
            filterOptions={(options, state) => filterShipOptions(options, state.inputValue)}
            getOptionLabel={(option) => getShipDisplayName(option)}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            onChange={(_event, value) => {
              setPlannerRouteCalculating(Boolean(plannerStartShip && value && value.msrp > plannerStartShip.msrp));
              setPlannerTargetShipId(value?.id || '');
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={intl.formatMessage({ id: 'market.ccuPlanner.targetShip', defaultMessage: 'Target ship' })}
                placeholder={intl.formatMessage({ id: 'market.ccuPlanner.shipSearch', defaultMessage: 'Search ships...' })}
                size="small"
                error={invalidRange}
                helperText={invalidRange
                  ? intl.formatMessage({ id: 'market.ccuPlanner.invalidRange', defaultMessage: 'Target ship must have a higher MSRP than the starting ship.' })
                  : undefined}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
              />
            )}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box
                  component="img"
                  src={getShipThumbSmall(option) || '/rsi-icons/ship.svg'}
                  alt=""
                  sx={{ width: 42, height: 28, objectFit: 'cover', bgcolor: 'grey.200', flexShrink: 0 }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {getShipDisplayName(option)}
                  </Box>
                  <Box sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {formatUsdPrice(intl.locale, option.msrp / 100)}
                  </Box>
                </Box>
              </Box>
            )}
          />
        </Box>

        <div className='flex flex-col gap-3 border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/60 dark:bg-blue-950/20 md:flex-row md:items-center md:justify-between'>
          <div className='min-w-0'>
            <FormControlLabel
              control={(
                <Switch
                  size="small"
                  checked={plannerIncludeHangarCcus}
                  onChange={(event) => {
                    setPlannerRouteCalculating(Boolean(plannerStartShip && plannerTargetShip && plannerTargetShip.msrp > plannerStartShip.msrp));
                    setPlannerIncludeHangarCcus(event.target.checked);
                  }}
                />
              )}
              label={intl.formatMessage({
                id: 'market.ccuPlanner.includeHangar',
                defaultMessage: 'Include my hangar CCUs in planning',
              })}
            />
            <Typography variant="body2" color="text.secondary">
              <FormattedMessage
                id="market.ccuPlanner.includeHangarHint"
                defaultMessage="Hangar CCUs can reduce what you need to buy. Their cost is included in route totals."
              />
            </Typography>
          </div>

          <div className='flex shrink-0 flex-wrap items-center gap-2'>
            <MemoizedCrawler ships={ships} />
            <Button
              variant="outlined"
              size="small"
              onClick={() => setPlannerExtensionModalOpen(true)}
              sx={{ borderRadius: 0 }}
            >
              <FormattedMessage id="ccuPlanner.downloadBrowserExtension" defaultMessage="Download Browser Extension" />
            </Button>
          </div>
        </div>

        <div className='grid gap-3 border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30 md:grid-cols-[minmax(0,1fr)_auto] md:items-center'>
          <div>
            <div className='text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300'>
              <FormattedMessage id="market.ccuPlanner.instantSavingsLabel" defaultMessage="Instant savings" />
            </div>
            <div className='mt-1 text-2xl font-black text-emerald-950 dark:text-emerald-50 md:text-3xl'>
              {routeCalculating
                ? intl.formatMessage({ id: 'market.ccuPlanner.calculatingSavings', defaultMessage: 'Calculating savings...' })
                : displayedPlannerRoute
                  ? intl.formatMessage(
                    { id: 'market.ccuPlanner.instantSavings', defaultMessage: 'Order now and save {amount}' },
                    { amount: formatUsdPrice(intl.locale, plannerInstantSavings) },
                  )
                  : intl.formatMessage({ id: 'market.ccuPlanner.instantSavingsPending', defaultMessage: 'Select ships to calculate savings' })}
            </div>
          </div>
          <div className='grid gap-2 text-sm text-emerald-950 dark:text-emerald-50 md:min-w-[300px]'>
            <div className='flex items-center justify-between gap-4'>
              <span><FormattedMessage id="market.ccuPlanner.requiredCcus" defaultMessage="CCUs to buy" /></span>
              <strong>{displayedPlannerRoute ? plannerRoutePurchasableCcuCount : '-'}</strong>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span><FormattedMessage id="market.ccuPlanner.requiredCredit" defaultMessage="Store Credit to buy" /></span>
              <strong>{displayedPlannerRoute ? formatUsdPrice(intl.locale, plannerCreditFaceValue) : '-'}</strong>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span><FormattedMessage id="market.ccuPlanner.totalSpend" defaultMessage="Total spend" /></span>
              <strong>{displayedPlannerRoute ? formatUsdPrice(intl.locale, plannerOrderTotal) : '-'}</strong>
            </div>
            {displayedPlannerRoute && plannerHangarSpend > 0 && (
              <div className='flex items-center justify-between gap-4 text-xs text-emerald-800 dark:text-emerald-100'>
                <span><FormattedMessage id="market.ccuPlanner.hangarSpend" defaultMessage="Hangar CCU cost included" /></span>
                <strong>{formatUsdPrice(intl.locale, plannerHangarSpend)}</strong>
              </div>
            )}
            {displayedPlannerRoute && plannerHangarEdgeCount > 0 && (
              <div className='text-xs text-emerald-800 dark:text-emerald-100'>
                <FormattedMessage
                  id="market.ccuPlanner.hangarUsed"
                  defaultMessage="{count, plural, one {# hangar CCU is used} other {# hangar CCUs are used}} in this route."
                  values={{ count: plannerHangarEdgeCount }}
                />
              </div>
            )}
          </div>
        </div>

        {routeDataLoading ? (
          <div className='flex min-h-28 items-center justify-center gap-2 border border-dashed border-gray-300 text-sm text-slate-500 dark:border-neutral-700 dark:text-slate-400'>
            <CircularProgress size={18} />
            <FormattedMessage id="market.ccuPlanner.loading" defaultMessage="Loading CCU data..." />
          </div>
        ) : routeCalculating ? (
          <div className='flex min-h-28 items-center justify-center gap-2 border border-dashed border-blue-200 bg-blue-50 text-sm text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-200'>
            <CircularProgress size={18} />
            <FormattedMessage id="market.ccuPlanner.calculating" defaultMessage="Calculating route..." />
          </div>
        ) : routeDataError ? (
          <Alert severity="error" sx={{ borderRadius: 0 }}>
            <FormattedMessage id="market.ccuPlanner.loadError" defaultMessage="Failed to load CCU route data." />
          </Alert>
        ) : plannerStartShip && plannerTargetShip && !displayedPlannerRoute && !invalidRange ? (
          <Alert severity="warning" sx={{ borderRadius: 0 }}>
            <FormattedMessage id="market.ccuPlanner.noRoute" defaultMessage="No route is available for this pair with current market and official CCU data." />
          </Alert>
        ) : displayedPlannerRoute ? (
          <div className='grid gap-3'>
            {creditUnavailable && (
              <Alert severity="warning" sx={{ borderRadius: 0 }}>
                <FormattedMessage
                  id="pathBuilder.marketRouteCreditUnavailable"
                  defaultMessage="No combination of Store Credit amounts can cover the required normal-upgrade spend of {amount}."
                  values={{ amount: formatUsdPrice(intl.locale, plannerOfficialStoreCreditSpend) }}
                />
              </Alert>
            )}

            <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
              {displayedPlannerRoute.edges.map((edge, index) => (
                <div key={`${edge.key}-${index}`} className='grid gap-3 border border-gray-200 bg-gray-50 p-3 dark:border-neutral-700 dark:bg-neutral-950'>
                  <div className='text-sm font-semibold text-slate-900 dark:text-white'>
                    {index + 1}. {getShipDisplayName(edge.sourceShip)} -&gt; {getShipDisplayName(edge.targetShip)}
                  </div>
                  <UpgradePreview fromShip={edge.sourceShip} toShip={edge.targetShip} className="h-[92px] w-full" />
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className={`px-2 py-[2px] text-xs ${getCcuTypeStyle(edge.sourceType)}`}>
                      {getMarketRouteTypeLabel(edge.sourceType, intl)}
                    </span>
                    <span className='border border-gray-200 bg-white px-2 py-[2px] text-xs text-gray-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-200'>
                      {formatUsdPrice(intl.locale, edge.cost)}
                    </span>
                    {edge.listing && (
                      <span className='border border-gray-200 bg-white px-2 py-[2px] text-xs text-gray-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-200'>
                        <FormattedMessage id="market.ccuPlanner.stock" defaultMessage="Stock {count}" values={{ count: getAvailableStock(edge.listing) }} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className='border border-dashed border-gray-300 p-5 text-center text-sm text-slate-500 dark:border-neutral-700 dark:text-slate-400'>
            <FormattedMessage id="market.ccuPlanner.empty" defaultMessage="Select two ships to generate a checkout-ready CCU chain." />
          </div>
        )}

        {plannerTargetShip && !targetShipListingLoading && targetShipRecommendationItem && (
          <div className='grid gap-3 border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20 md:grid-cols-[minmax(0,1fr)_auto] md:items-center'>
            <div className='min-w-0'>
              <div className='text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300'>
                <FormattedMessage id="market.ccuPlanner.targetShipListingEyebrow" defaultMessage="LTI whole ship option" />
              </div>
              <div className='mt-1 text-lg font-black text-amber-950 dark:text-amber-50 md:text-xl'>
                {plannerTargetShipRecommendationText}
              </div>
              <div className='mt-2 flex flex-wrap items-center gap-2 text-sm text-amber-900 dark:text-amber-100'>
                <span className='font-semibold'>{targetShipRecommendationPrice}</span>
                <span>{getMarketItemDisplayName(intl, targetShipRecommendationItem, ships)}</span>
              </div>
            </div>

            <div className='flex shrink-0 flex-wrap items-center gap-2'>
              <Button
                variant="outlined"
                onClick={() => handleOpenDetails(targetShipRecommendationItem)}
                sx={{ borderRadius: 0 }}
              >
                <FormattedMessage id="market.viewDetails" defaultMessage="View details" />
              </Button>
              <Button
                variant="contained"
                onClick={() => handleBuyNow(targetShipRecommendationItem)}
                sx={{ borderRadius: 0 }}
              >
                <FormattedMessage id="market.buyNow" defaultMessage="Buy now" />
              </Button>
            </div>
          </div>
        )}
      </section>

      <ExtensionModal
        open={plannerExtensionModalOpen}
        onClose={() => setPlannerExtensionModalOpen(false)}
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
    </>
  );
});

const Market: React.FC = () => {
  const intl = useIntl();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobileListingDrawer = useMediaQuery(theme.breakpoints.down('md'));
  const isListingDrawerSidebarVisible = useMediaQuery(theme.breakpoints.up('lg'));
  const marketDrawerBackground = theme.palette.mode === 'dark'
    ? '#090909'
    : theme.palette.background.default;
  const marketDrawerPaperSx = {
    backgroundColor: marketDrawerBackground,
    backgroundImage: 'none',
  };
  const { user } = useSelector((state: RootState) => state.user);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const listingDrawerContentRef = useRef<HTMLDivElement | null>(null);
  const listingDrawerInfiniteSentinelRef = useRef<HTMLDivElement | null>(null);
  const mobileListingPageRequestPendingRef = useRef(false);
  const pendingListingDrawerClearFiltersRef = useRef(false);
  const starterPackScrollerRef = useRef<HTMLDivElement | null>(null);
  const featuredAccountScrollerRef = useRef<HTMLDivElement | null>(null);
  const otherGearScrollerRef = useRef<HTMLDivElement | null>(null);
  const starterPackVisibilityFrameRef = useRef<number | null>(null);
  const featuredAccountVisibilityFrameRef = useRef<number | null>(null);
  const autoOpenedListingQueryRef = useRef<string | null>(null);
  const suppressListingAutoOpenRef = useRef(false);
  const heroAutoplayTimeoutRef = useRef<number | null>(null);
  const heroAutoplayStartedAtRef = useRef(0);
  const heroAutoplayRemainingMsRef = useRef(MARKET_HERO_AUTOPLAY_INTERVAL_MS);
  const heroPointerPausedRef = useRef(false);
  const heroFocusPausedRef = useRef(false);
  const heroSectionRef = useRef<HTMLElement | null>(null);
  const heroPointerFocusRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { cart, cartOpen, addToCart, removeFromCart, replaceCartItem, openCart, closeCart, updateItemQuantity } = useCartStore();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  const [couponPopupDismissed, setCouponPopupDismissed] = useState(false);
  const [couponNow, setCouponNow] = useState(Date.now());
  const [mobileFilterDrawerOpen, setMobileFilterDrawerOpen] = useState(false);
  const [listingDrawerOpen, setListingDrawerOpen] = useState(false);
  const [listingDrawerClosing, setListingDrawerClosing] = useState(false);
  const [listingDrawerContentReady, setListingDrawerContentReady] = useState(false);
  const [mobileListingPage, setMobileListingPage] = useState(0);
  const [mobileListingItems, setMobileListingItems] = useState<ListingItem[]>([]);
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const [heroProgressAnimationKey, setHeroProgressAnimationKey] = useState(0);
  const [reviewRatingFilter, setReviewRatingFilter] = useState<MarketReviewRatingFilter>(null);
  const [reviewsDialogOpen, setReviewsDialogOpen] = useState(false);
  const [reviewsDialogPage, setReviewsDialogPage] = useState(0);
  const [reviewImagePreview, setReviewImagePreview] = useState<MarketReviewAttachmentSummary | null>(null);
  // const [showAlert, setShowAlert] = useState(import.meta.env.VITE_PUBLIC_ENV !== 'development');
  const [showAlert, setShowAlert] = useState(false);
  const autoClaimAttemptedRef = useRef<string | null>(null);
  const cartRef = useRef(cart);
  const { data: couponPreview, mutate: mutateCouponPreview } = useAuthApi<NewUserCouponPreview>(
    user.token ? '/api/user/new-user-coupon' : null,
  );
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  const {
    searchTerm,
    selectedItemFilter,
    selectedShipTraitFilter,
    selectedShipFocus,
    selectedManufacturerId,
    packageItems,
    sortBy,
    page,
    rowsPerPage,
  } = useMemo(() => parseMarketPageSearchState(searchParams), [searchParams]);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const homeContentEnabled = true;
  const { data: marketHomeSettingsResponse } = useMarketHomeSettings({ enabled: homeContentEnabled });
  const { data: marketHomePromotionsResponse } = useApi<MarketHomePromotionsResponse>(
    homeContentEnabled ? '/api/promotions' : null,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    },
  );
  const { data: marketSearchShipsResponse } = useApi<ShipsData>('/api/ships', {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
  const localizedShipSearchPath = locale === 'en'
    ? null
    : `/api/ships?locale=${encodeURIComponent(locale)}`;
  const { data: localizedShipSearchResponse } = useApi<ShipsData>(localizedShipSearchPath, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
  const localizedShipSearchItems = useMemo(
    () => localizedShipSearchResponse?.data.ships || [],
    [localizedShipSearchResponse],
  );
  const marketSearchShips = useMemo(
    () => marketSearchShipsResponse?.data.ships || [],
    [marketSearchShipsResponse],
  );
  const showsShipTraitFilters = selectedItemFilter === 'all'
    || selectedItemFilter === 'standalone_ship'
    || selectedItemFilter === 'ship_package';
  const showsManufacturerFilter = showsShipTraitFilters || selectedItemFilter === 'ccu';
  const showsShipFocusFilter = showsShipTraitFilters || selectedItemFilter === 'ccu';
  const listingSearchKey = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    params.delete('page');
    params.delete('limit');
    return params.toString();
  }, [searchParams]);
  const normalizedSearchParams = useMemo(() => buildMarketPageSearchParams(searchParams, {
    searchTerm,
    selectedItemFilter,
    selectedShipTraitFilter: showsShipTraitFilters ? selectedShipTraitFilter : 'all',
    selectedShipFocus: showsShipFocusFilter ? selectedShipFocus : 'all',
    selectedManufacturerId: showsManufacturerFilter ? selectedManufacturerId : null,
    packageItems,
    sortBy,
    page,
    rowsPerPage,
  }), [
    page,
    rowsPerPage,
    searchParams,
    searchTerm,
    packageItems,
    selectedManufacturerId,
    selectedItemFilter,
    selectedShipFocus,
    selectedShipTraitFilter,
    showsShipFocusFilter,
    showsManufacturerFilter,
    showsShipTraitFilters,
    sortBy,
  ]);
  const hasActiveMarketSearchParams = useMemo(() => Boolean(
    searchTerm.trim()
    || selectedItemFilter !== 'all'
    || (showsShipTraitFilters && selectedShipTraitFilter !== 'all')
    || (showsShipFocusFilter && selectedShipFocus !== 'all')
    || (showsManufacturerFilter && selectedManufacturerId)
    || packageItems.length > 0
    || sortBy !== 'recommended'
    || page > 0
    || rowsPerPage !== MARKET_DEFAULT_ROWS_PER_PAGE,
  ), [
    page,
    packageItems.length,
    rowsPerPage,
    searchTerm,
    selectedItemFilter,
    selectedShipFocus,
    selectedManufacturerId,
    selectedShipTraitFilter,
    showsShipFocusFilter,
    showsManufacturerFilter,
    showsShipTraitFilters,
    sortBy,
  ]);
  const shouldLoadListingData = listingDrawerOpen || listingDrawerClosing || hasActiveMarketSearchParams;
  useEffect(() => {
    if (normalizedSearchParams.toString() !== searchParams.toString()) {
      setSearchParams(normalizedSearchParams, { replace: true });
    }
  }, [normalizedSearchParams, searchParams, setSearchParams]);

  useEffect(() => {
    const normalizedKey = normalizedSearchParams.toString();
    if (!hasActiveMarketSearchParams) {
      autoOpenedListingQueryRef.current = null;
      suppressListingAutoOpenRef.current = false;
      return;
    }

    if (normalizedKey !== searchParams.toString()) {
      return;
    }

    if (suppressListingAutoOpenRef.current) {
      return;
    }

    if (listingDrawerOpen || listingDrawerClosing || autoOpenedListingQueryRef.current === normalizedKey) {
      return;
    }

    autoOpenedListingQueryRef.current = normalizedKey;
    setListingDrawerOpen(true);
  }, [hasActiveMarketSearchParams, listingDrawerClosing, listingDrawerOpen, normalizedSearchParams, searchParams]);

  useEffect(() => {
    setMobileListingPage(0);
    setMobileListingItems([]);
    mobileListingPageRequestPendingRef.current = false;
    listingDrawerContentRef.current?.scrollTo({ top: 0 });
  }, [listingSearchKey]);

  useEffect(() => {
    setReviewsDialogPage(0);
  }, [reviewRatingFilter]);

  const updateMarketSearchParams = useCallback((updater: (nextSearchParams: URLSearchParams) => void) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    updater(nextSearchParams);

    if (nextSearchParams.toString() !== searchParams.toString()) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const clearMarketSearchParams = useCallback((options?: { keepDrawerClosed?: boolean }) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    MARKET_SEARCH_PARAM_KEYS.forEach((key) => {
      nextSearchParams.delete(key);
    });

    const nextQueryKey = nextSearchParams.toString();
    autoOpenedListingQueryRef.current = options?.keepDrawerClosed ? nextQueryKey : null;
    suppressListingAutoOpenRef.current = Boolean(options?.keepDrawerClosed);

    if (nextSearchParams.toString() !== searchParams.toString()) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const scrollListingDrawerToTop = useCallback(() => {
    const scrollToTop = () => {
      listingDrawerContentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    };

    window.requestAnimationFrame(scrollToTop);
  }, []);

  const openListingDrawer = useCallback((options?: { focusSearch?: boolean }) => {
    pendingListingDrawerClearFiltersRef.current = false;
    suppressListingAutoOpenRef.current = false;
    setListingDrawerClosing(false);
    setListingDrawerContentReady(false);
    setListingDrawerOpen(true);
    if (options?.focusSearch) {
      window.setTimeout(() => {
        document.getElementById('market-listing-search-input')?.focus();
      }, 80);
    }
  }, []);

  const closeListingDrawer = useCallback((options?: { clearFilters?: boolean }) => {
    pendingListingDrawerClearFiltersRef.current = Boolean(options?.clearFilters);
    if (options?.clearFilters) {
      suppressListingAutoOpenRef.current = true;
    }
    setListingDrawerContentReady(false);
    setListingDrawerClosing(true);
    setListingDrawerOpen(false);
  }, []);

  const handleListingDrawerEnter = useCallback(() => {
    setListingDrawerContentReady(false);
  }, []);

  const handleListingDrawerEntered = useCallback(() => {
    setListingDrawerContentReady(true);
  }, []);

  const handleListingDrawerExited = useCallback(() => {
    setListingDrawerContentReady(false);

    const shouldClearFilters = pendingListingDrawerClearFiltersRef.current;
    pendingListingDrawerClearFiltersRef.current = false;

    if (shouldClearFilters) {
      React.startTransition(() => {
        clearMarketSearchParams({ keepDrawerClosed: true });
        setListingDrawerClosing(false);
      });
      return;
    }

    setListingDrawerClosing(false);
  }, [clearMarketSearchParams]);

  const commitMarketSearch = useCallback((nextSearchTerm: string) => {
    const trimmedSearchTerm = nextSearchTerm.trim();
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('page');

    if (trimmedSearchTerm) {
      nextSearchParams.set('search', trimmedSearchTerm);
    } else {
      nextSearchParams.delete('search');
    }

    if (nextSearchParams.toString() !== searchParams.toString()) {
      React.startTransition(() => {
        setSearchParams(nextSearchParams, { replace: true });
      });
    }
  }, [searchParams, setSearchParams]);

  const commitHomeMarketSearch = useCallback((nextSearchTerm: string) => {
    commitMarketSearch(nextSearchTerm);
    openListingDrawer();
  }, [commitMarketSearch, openListingDrawer]);

  const openMobileFilterDrawer = useCallback(() => {
    setMobileFilterDrawerOpen(true);
  }, []);

  const closeMobileFilterDrawer = useCallback(() => {
    setMobileFilterDrawerOpen(false);
  }, []);

  const handleChangeItemFilter = useCallback((nextFilter: MarketItemFilterOption) => {
    updateMarketSearchParams((nextSearchParams) => {
      nextSearchParams.delete('itemType');
      nextSearchParams.delete('browseCategory');
      nextSearchParams.delete('tag');
      nextSearchParams.delete('shipTrait');
      nextSearchParams.delete('shipFocus');
      nextSearchParams.delete('manufacturerId');
      nextSearchParams.delete('packageItem');
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
      const nextShowsShipFocusFilter = nextShowsShipTraitFilters || nextFilter === 'ccu';

      if (nextShowsShipTraitFilters && selectedShipTraitFilter !== 'all') {
        nextSearchParams.set('shipTrait', selectedShipTraitFilter);
      }

      if (nextShowsShipFocusFilter && selectedShipFocus !== 'all') {
        nextSearchParams.set('shipFocus', selectedShipFocus);
      }

      if (nextShowsManufacturerFilter && selectedManufacturerId) {
        nextSearchParams.set('manufacturerId', String(selectedManufacturerId));
      }
    });
  }, [selectedManufacturerId, selectedShipFocus, selectedShipTraitFilter, updateMarketSearchParams]);

  const handleChangeShipTraitFilter = useCallback((nextShipTrait: MarketShipTraitFilter | 'all') => {
    updateMarketSearchParams((nextSearchParams) => {
      nextSearchParams.delete('tag');
      nextSearchParams.delete('shipTrait');
      nextSearchParams.delete('packageItem');
      nextSearchParams.delete('page');

      if (nextShipTrait !== 'all') {
        nextSearchParams.set('shipTrait', nextShipTrait);
      }
    });
  }, [updateMarketSearchParams]);

  const handleChangeShipFocus = useCallback((nextShipFocus: MarketShipFocusFilter | 'all') => {
    updateMarketSearchParams((nextSearchParams) => {
      nextSearchParams.delete('shipFocus');
      nextSearchParams.delete('page');

      if (nextShipFocus !== 'all') {
        nextSearchParams.set('shipFocus', nextShipFocus);
      }
    });
  }, [updateMarketSearchParams]);

  const handleChangeManufacturerId = useCallback((nextManufacturerId: number | null) => {
    updateMarketSearchParams((nextSearchParams) => {
      nextSearchParams.delete('manufacturerId');
      nextSearchParams.delete('page');

      if (nextManufacturerId) {
        nextSearchParams.set('manufacturerId', String(nextManufacturerId));
      }
    });
  }, [updateMarketSearchParams]);

  const handleChangeMarketSort = useCallback((nextSortBy: MarketSortMode) => {
    updateMarketSearchParams((nextSearchParams) => {
      nextSearchParams.delete('page');

      if (nextSortBy === 'recommended') {
        nextSearchParams.delete('sortBy');
      } else {
        nextSearchParams.set('sortBy', nextSortBy);
      }
    });
  }, [updateMarketSearchParams]);

  const handleChangeListingPage = useCallback((newPage: number) => {
    scrollListingDrawerToTop();
    updateMarketSearchParams((nextSearchParams) => {
      if (newPage > 0) {
        nextSearchParams.set('page', String(newPage));
      } else {
        nextSearchParams.delete('page');
      }
    });
  }, [scrollListingDrawerToTop, updateMarketSearchParams]);

  const handleChangeListingRowsPerPage = useCallback((nextRowsPerPage: number) => {
    scrollListingDrawerToTop();
    updateMarketSearchParams((nextSearchParams) => {
      nextSearchParams.delete('page');

      if (nextRowsPerPage === MARKET_DEFAULT_ROWS_PER_PAGE) {
        nextSearchParams.delete('limit');
      } else {
        nextSearchParams.set('limit', String(nextRowsPerPage));
      }
    });
  }, [scrollListingDrawerToTop, updateMarketSearchParams]);

  const localizedMarketSearchShips = useMemo(
    () => mergeLocalizedMarketSearchShips(marketSearchShips, localizedShipSearchItems),
    [localizedShipSearchItems, marketSearchShips],
  );
  const localizedMarketSearchCandidates = useMemo(
    () => buildMarketLocalizedSearchCandidates(localizedMarketSearchShips),
    [localizedMarketSearchShips],
  );
  const backendSearchTerm = useMemo(
    () => resolveLocalizedMarketSearchTerm(deferredSearchTerm, localizedMarketSearchCandidates),
    [deferredSearchTerm, localizedMarketSearchCandidates],
  );

  const marketQuery = useMemo(() => {
    const itemTypes: MarketItemType[] = [];
    const browseCategories: MarketBrowseCategory[] = [];
    const shipTraits = showsShipTraitFilters && selectedShipTraitFilter !== 'all'
      ? [selectedShipTraitFilter]
      : [];
    const shipFocuses = showsShipFocusFilter && selectedShipFocus !== 'all'
      ? [selectedShipFocus]
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
      enabled: shouldLoadListingData,
      search: backendSearchTerm,
      itemTypes,
      browseCategories,
      shipTraits,
      shipFocuses,
      packageItems,
      manufacturerIds,
      sortBy,
      page: isMobileListingDrawer && listingDrawerOpen ? mobileListingPage : page,
      limit: isMobileListingDrawer && listingDrawerOpen ? MARKET_MOBILE_ROWS_PER_BATCH : rowsPerPage,
    };
  }, [
    isMobileListingDrawer,
    backendSearchTerm,
    listingDrawerOpen,
    mobileListingPage,
    page,
    packageItems,
    rowsPerPage,
    selectedManufacturerId,
    selectedItemFilter,
    selectedShipFocus,
    selectedShipTraitFilter,
    shouldLoadListingData,
    showsShipFocusFilter,
    showsManufacturerFilter,
    showsShipTraitFilters,
    sortBy,
  ]);
  const { ships, listingItems, pagination, loading, refreshing, error } = useMarketData(marketQuery);
  const visibleListingItems = isMobileListingDrawer && listingDrawerOpen ? mobileListingItems : listingItems;
  const cartQuantityByResourceId = useMemo(() => {
    const quantities = new Map<string, number>();

    cart.forEach((cartItem: CartItemType) => {
      quantities.set(cartItem.resource.id, cartItem.quantity || 1);
    });

    return quantities;
  }, [cart]);
  const mobileHasMoreListings = isMobileListingDrawer
    && listingDrawerOpen
    && mobileListingItems.length < pagination.total;
  const mobileLoadingNextPage = isMobileListingDrawer
    && listingDrawerOpen
    && refreshing
    && mobileListingPage > 0;
  const listingGridInitialLoading = loading || (
    isMobileListingDrawer
    && listingDrawerOpen
    && refreshing
    && mobileListingItems.length === 0
  );
  const {
    ships: accountMarketShips,
    listingItems: featuredAccountItems,
    loading: featuredAccountLoading,
  } = useAccountMarketData({ enabled: homeContentEnabled, limit: 12, page: 0 });
  const {
    ships: starterPackShips,
    listingItems: starterPackItems,
    loading: starterPackLoading,
  } = useMarketData({
    enabled: homeContentEnabled,
    browseCategories: ['ship_package'],
    shipTraits: ['lti'],
    packageItems: [STARTER_PACK_GAME_DOWNLOAD_ITEM],
    sortBy: 'priceAsc',
    page: 0,
    limit: 12,
  });
  const {
    listingItems: otherGearItems,
    loading: otherGearLoading,
  } = useMarketData({
    enabled: homeContentEnabled,
    browseCategories: ['other'],
    sortBy: 'newest',
    page: 0,
    limit: MARKET_HOME_OTHER_ITEMS_LIMIT,
  });
  const {
    listingItems: standalonePreviewItems,
  } = useMarketData({
    enabled: homeContentEnabled,
    browseCategories: ['standalone_ship'],
    sortBy: 'recommended',
    page: 0,
    limit: 1,
  });
  const {
    listingItems: ccuPreviewItems,
  } = useMarketData({
    enabled: homeContentEnabled,
    itemTypes: ['ccu'],
    sortBy: 'recommended',
    page: 0,
    limit: 1,
  });
  const {
    listingItems: paintPreviewItems,
  } = useMarketData({
    enabled: homeContentEnabled,
    browseCategories: ['paint'],
    sortBy: 'recommended',
    page: 0,
    limit: 1,
  });
  const {
    data: marketReviewsResponse,
    isLoading: marketReviewsLoading,
  } = useMarketReviews(MARKET_REVIEW_SECTION_LIMIT, { enabled: homeContentEnabled, rating: reviewRatingFilter });
  const {
    data: marketReviewsDialogResponse,
    isLoading: marketReviewsDialogLoading,
  } = useMarketReviews(MARKET_REVIEW_DIALOG_LIMIT, {
    enabled: homeContentEnabled && reviewsDialogOpen,
    page: reviewsDialogPage,
    rating: reviewRatingFilter,
  });
  const {
    data: availableShipIdsResponse,
  } = useApi<MarketAvailableShipIdsResponse>('/api/market/available-ship-ids', {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
  const marketReviews = marketReviewsResponse?.items || [];
  const marketReviewsTotal = marketReviewsResponse?.pagination.total || marketReviews.length;
  const marketReviewRatingSummary = marketReviewsResponse?.ratingSummary;
  const marketReviewsDialogItems = marketReviewsDialogResponse?.items || [];
  const marketReviewsDialogPagination = marketReviewsDialogResponse?.pagination;
  const marketReviewsDialogRatingSummary = marketReviewsDialogResponse?.ratingSummary;
  const availableShipIds = useMemo(
    () => new Set(availableShipIdsResponse?.data?.shipIds || []),
    [availableShipIdsResponse?.data?.shipIds],
  );
  const accountCouponCode = getMonthlyAccountCouponCode();
  const heroSlides = useMemo(() => {
    const configuredSlides = marketHomeSettingsResponse?.data.settings.enabled === false
      ? []
      : (marketHomeSettingsResponse?.data.settings.slides || [])
        .filter((slide) => slide.enabled && slide.mediaUrl.trim());

    return configuredSlides.length > 0 ? configuredSlides : DEFAULT_MARKET_HERO_SLIDES;
  }, [marketHomeSettingsResponse]);
  const activeHeroSlideIndex = Math.min(activeHeroIndex, Math.max(heroSlides.length - 1, 0));
  const activeHeroSlide = heroSlides[activeHeroSlideIndex] || heroSlides[0];
  const activeHeroTranslation = activeHeroSlide
    ? getMarketHeroTranslation(activeHeroSlide, locale as MarketHomeLocaleCode)
    : getMarketHeroTranslation(DEFAULT_MARKET_HERO_SLIDES[0], locale as MarketHomeLocaleCode);
  const marketHomePromotion = useMemo(() => (
    (marketHomePromotionsResponse?.promotions || [])
      .find((promotion) => promotion.status === 'active' || promotion.status === 'scheduled') || null
  ), [marketHomePromotionsResponse?.promotions]);
  const marketHomePromotionHero = useMemo(() => (
    marketHomePromotion
      ? getMarketHomePromotionHeroContent(marketHomePromotion, locale)
      : null
  ), [locale, marketHomePromotion]);
  const marketHomePromotionImageUrl = useMemo(() => {
    const rawImageUrl = marketHomePromotionHero?.mobileImageUrl || marketHomePromotionHero?.imageUrl || '';
    return getMarketImageDisplayUrl(rawImageUrl, {
      ships: marketSearchShips,
      variant: 'slideshow',
    }) || rawImageUrl;
  }, [marketHomePromotionHero, marketSearchShips]);
  const heroAutoplayActive = heroSlides.length > 1
    && !listingDrawerOpen
    && !mobileFilterDrawerOpen
    && !cartOpen;

  useEffect(() => {
    setActiveHeroIndex((current) => Math.min(current, Math.max(heroSlides.length - 1, 0)));
  }, [heroSlides.length]);

  const goToPreviousHeroSlide = useCallback(() => {
    setHeroProgressAnimationKey((current) => current + 1);
    setActiveHeroIndex((current) => (current <= 0 ? heroSlides.length - 1 : current - 1));
  }, [heroSlides.length]);

  const goToNextHeroSlide = useCallback(() => {
    setHeroProgressAnimationKey((current) => current + 1);
    setActiveHeroIndex((current) => (current >= heroSlides.length - 1 ? 0 : current + 1));
  }, [heroSlides.length]);

  const goToHeroSlide = useCallback((index: number) => {
    setHeroProgressAnimationKey((current) => current + 1);
    setActiveHeroIndex(Math.min(Math.max(index, 0), Math.max(heroSlides.length - 1, 0)));
  }, [heroSlides.length]);

  const clearHeroAutoplayTimeout = useCallback(() => {
    if (heroAutoplayTimeoutRef.current !== null) {
      window.clearTimeout(heroAutoplayTimeoutRef.current);
      heroAutoplayTimeoutRef.current = null;
    }
  }, []);

  const pauseHeroAutoplayTimer = useCallback(() => {
    if (heroAutoplayTimeoutRef.current !== null) {
      const elapsedMs = window.performance.now() - heroAutoplayStartedAtRef.current;
      heroAutoplayRemainingMsRef.current = Math.max(0, heroAutoplayRemainingMsRef.current - elapsedMs);
    }

    clearHeroAutoplayTimeout();
  }, [clearHeroAutoplayTimeout]);

  const scheduleHeroAutoplay = useCallback((delayMs = MARKET_HERO_AUTOPLAY_INTERVAL_MS) => {
    clearHeroAutoplayTimeout();

    if (
      heroSlides.length <= 1
      || listingDrawerOpen
      || mobileFilterDrawerOpen
      || cartOpen
      || heroPointerPausedRef.current
      || heroFocusPausedRef.current
    ) {
      return;
    }

    const normalizedDelay = Math.max(0, delayMs);
    heroAutoplayRemainingMsRef.current = normalizedDelay;
    heroAutoplayStartedAtRef.current = window.performance.now();
    heroAutoplayTimeoutRef.current = window.setTimeout(() => {
      heroAutoplayTimeoutRef.current = null;

      if (
        document.visibilityState === 'hidden'
        || heroPointerPausedRef.current
        || heroFocusPausedRef.current
      ) {
        heroAutoplayRemainingMsRef.current = MARKET_HERO_AUTOPLAY_INTERVAL_MS;
        return;
      }

      goToNextHeroSlide();
    }, normalizedDelay);
  }, [
    cartOpen,
    clearHeroAutoplayTimeout,
    goToNextHeroSlide,
    heroSlides.length,
    listingDrawerOpen,
    mobileFilterDrawerOpen,
  ]);

  const pauseHeroAutoplay = useCallback((source: 'pointer' | 'focus') => {
    if (source === 'pointer') {
      heroPointerPausedRef.current = true;
    } else {
      heroFocusPausedRef.current = true;
    }

    heroSectionRef.current?.classList.add('is-hero-paused');
    pauseHeroAutoplayTimer();
  }, [pauseHeroAutoplayTimer]);

  const resumeHeroAutoplay = useCallback((source: 'pointer' | 'focus') => {
    if (source === 'pointer') {
      heroPointerPausedRef.current = false;
    } else {
      heroFocusPausedRef.current = false;
    }

    if (!heroPointerPausedRef.current && !heroFocusPausedRef.current) {
      heroSectionRef.current?.classList.remove('is-hero-paused');
    }

    scheduleHeroAutoplay(heroAutoplayRemainingMsRef.current);
  }, [scheduleHeroAutoplay]);

  const handleHeroMouseEnter = useCallback(() => {
    heroPointerFocusRef.current = true;
    pauseHeroAutoplay('pointer');
  }, [pauseHeroAutoplay]);

  const handleHeroMouseLeave = useCallback(() => {
    heroPointerFocusRef.current = false;
    heroFocusPausedRef.current = false;
    resumeHeroAutoplay('pointer');
  }, [resumeHeroAutoplay]);

  const handleHeroFocus = useCallback((event: React.FocusEvent<HTMLElement>) => {
    if (heroPointerFocusRef.current || event.currentTarget.matches(':hover')) {
      return;
    }

    pauseHeroAutoplay('focus');
  }, [pauseHeroAutoplay]);

  useEffect(() => {
    heroAutoplayRemainingMsRef.current = MARKET_HERO_AUTOPLAY_INTERVAL_MS;
    scheduleHeroAutoplay();

    return () => {
      clearHeroAutoplayTimeout();
    };
  }, [
    activeHeroSlideIndex,
    clearHeroAutoplayTimeout,
    heroProgressAnimationKey,
    scheduleHeroAutoplay,
  ]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pauseHeroAutoplayTimer();
        return;
      }

      scheduleHeroAutoplay(heroAutoplayRemainingMsRef.current);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pauseHeroAutoplayTimer, scheduleHeroAutoplay]);

  const handleHeroBlur = useCallback((event: React.FocusEvent<HTMLElement>) => {
    const nextFocusedElement = event.relatedTarget;
    if (!(nextFocusedElement instanceof globalThis.Node) || !event.currentTarget.contains(nextFocusedElement)) {
      resumeHeroAutoplay('focus');
    }
  }, [resumeHeroAutoplay]);

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

    return Array.from(options.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [ships]);

  const shipFocusOptions = useMemo(() => {
    const groupedShips = new Map<string, { focus: string; ships: Ship[] }>();

    ships.forEach((ship) => {
      if (!availableShipIds.has(ship.id)) {
        return;
      }

      const focus = normalizeShipFocusParam(ship.focus);
      const key = normalizeShipFocusFilter(focus);
      if (!focus || !key) {
        return;
      }

      const group = groupedShips.get(key);
      if (group) {
        group.ships.push(ship);
      } else {
        groupedShips.set(key, { focus, ships: [ship] });
      }
    });

    return Array.from(groupedShips.values()).map(({ focus, ships: focusShips }) => {
      let sampleShip = focusShips[0];
      let imageUrl = '';

      for (const candidate of focusShips) {
        const candidateImageUrl = getShipImageForRoleCard(candidate);
        if (candidateImageUrl) {
          sampleShip = candidate;
          imageUrl = candidateImageUrl;
          break;
        }
      }

      if (!imageUrl && sampleShip) {
        imageUrl = getShipImageForRoleCard(sampleShip);
      }

      return {
        focus,
        label: localizeShipFocus(locale, focus),
        shipCount: focusShips.length,
        imageUrl,
        sampleShipName: sampleShip ? getShipDisplayName(sampleShip) : '',
      };
    }).sort((left, right) => (
      right.shipCount - left.shipCount
      || left.label.localeCompare(right.label)
    ));
  }, [availableShipIds, locale, ships]);

  const activeFilterCount = useMemo(() => {
    let count = 0;

    if (selectedItemFilter !== 'all') {
      count += 1;
    }
    if (showsShipTraitFilters && selectedShipTraitFilter !== 'all') {
      count += 1;
    }
    if (showsShipFocusFilter && selectedShipFocus !== 'all') {
      count += 1;
    }
    if (showsManufacturerFilter && selectedManufacturerId) {
      count += 1;
    }
    if (packageItems.length > 0) {
      count += 1;
    }
    if (sortBy !== 'recommended') {
      count += 1;
    }

    return count;
  }, [
    selectedItemFilter,
    selectedShipFocus,
    selectedManufacturerId,
    selectedShipTraitFilter,
    packageItems.length,
    showsShipFocusFilter,
    showsManufacturerFilter,
    showsShipTraitFilters,
    sortBy,
  ]);

  const homeCatalogShips = marketSearchShips.length > 0 ? marketSearchShips : ships;
  const activeHeroImageFallbackUrl = activeHeroSlide?.mediaType === 'image'
    ? activeHeroSlide.mediaUrl
    : activeHeroSlide?.posterUrl || '';
  const marketHomeCategoryEntries = useMemo<MarketHomeCategoryEntry[]>(() => {
    const categoryShips = homeCatalogShips.length > 0 ? homeCatalogShips : ships;
    const firstAvailableShip = categoryShips.find((ship) => availableShipIds.has(ship.id)) || categoryShips[0] || null;
    const standaloneImageUrl = getMarketHomeListingImage(standalonePreviewItems[0], categoryShips)
      || (firstAvailableShip ? getShipImageForRoleCard(firstAvailableShip) : '')
      || activeHeroImageFallbackUrl
      || '';
    const starterPackImageUrl = getMarketHomeListingImage(starterPackItems[0], categoryShips)
      || standaloneImageUrl;
    const ccuImageUrl = getMarketHomeListingImage(ccuPreviewItems[0], categoryShips)
      || starterPackImageUrl;
    const paintImageUrl = getMarketHomeListingImage(paintPreviewItems[0], categoryShips)
      || getMarketHomeListingImage(otherGearItems[0], categoryShips)
      || standaloneImageUrl;
    const creditImageUrl = '/imgs/credit.webp';

    return [
      {
        value: 'standalone_ship',
        label: intl.formatMessage({ id: 'market.home.category.ship.label', defaultMessage: 'Ships' }),
        description: intl.formatMessage({ id: 'market.home.category.ship.description', defaultMessage: 'Browse and buy LTI and OC ships.' }),
        imageUrl: standaloneImageUrl,
        accentClassName: 'bg-sky-500',
      },
      {
        value: 'ship_package',
        label: intl.formatMessage({ id: 'market.home.category.package.label', defaultMessage: 'Ship Packages' }),
        description: intl.formatMessage({ id: 'market.home.category.package.description', defaultMessage: 'Buy bundles that include LTI ships.' }),
        imageUrl: starterPackImageUrl,
        accentClassName: 'bg-emerald-500',
      },
      {
        value: 'ccu',
        label: intl.formatMessage({ id: 'market.home.category.ccu.label', defaultMessage: 'CCU' }),
        description: intl.formatMessage({ id: 'market.home.category.ccu.description', defaultMessage: 'Find a CCU chain tailored to your target ship.' }),
        imageUrl: ccuImageUrl,
        accentClassName: 'bg-cyan-500',
      },
      {
        value: 'paint',
        label: intl.formatMessage({ id: 'market.home.category.paint.label', defaultMessage: 'Paints' }),
        description: intl.formatMessage({ id: 'market.home.category.paint.description', defaultMessage: 'Choose favorite paints and cosmetics for your ships.' }),
        imageUrl: paintImageUrl,
        accentClassName: 'bg-violet-500',
      },
      {
        value: 'credit',
        label: intl.formatMessage({ id: 'market.home.category.credit.label', defaultMessage: 'Store Credit' }),
        description: intl.formatMessage({ id: 'market.home.category.credit.description', defaultMessage: 'Buy discounted store credit.' }),
        imageUrl: creditImageUrl,
        accentClassName: 'bg-amber-500',
      },
    ];
  }, [
    activeHeroImageFallbackUrl,
    availableShipIds,
    ccuPreviewItems,
    homeCatalogShips,
    intl,
    otherGearItems,
    paintPreviewItems,
    ships,
    standalonePreviewItems,
    starterPackItems,
  ]);

  useEffect(() => {
    if (!isMobileListingDrawer || !listingDrawerOpen) {
      mobileListingPageRequestPendingRef.current = false;
      return;
    }

    if (loading || refreshing) {
      return;
    }

    mobileListingPageRequestPendingRef.current = false;

    setMobileListingItems((currentItems) => {
      if (mobileListingPage === 0) {
        return listingItems;
      }

      const existingSkuIds = new Set(currentItems.map((item) => item.skuId));
      const nextItems = listingItems.filter((item) => !existingSkuIds.has(item.skuId));
      return nextItems.length ? [...currentItems, ...nextItems] : currentItems;
    });
  }, [isMobileListingDrawer, listingDrawerOpen, listingItems, loading, mobileListingPage, refreshing]);

  useEffect(() => {
    if (!isMobileListingDrawer || !listingDrawerOpen || !listingDrawerContentReady || !mobileHasMoreListings) {
      return;
    }

    const root = listingDrawerContentRef.current;
    const sentinel = listingDrawerInfiniteSentinelRef.current;
    if (!root || !sentinel) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting || loading || refreshing || mobileListingPageRequestPendingRef.current) {
        return;
      }

      mobileListingPageRequestPendingRef.current = true;
      setMobileListingPage((currentPage) => currentPage + 1);
    }, {
      root,
      rootMargin: '360px 0px',
    });

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [
    isMobileListingDrawer,
    listingDrawerContentReady,
    listingDrawerOpen,
    loading,
    mobileHasMoreListings,
    refreshing,
  ]);

  useEffect(() => {
    listingDrawerContentRef.current?.scrollTo({ top: 0 });
  }, [listingSearchKey]);

  useEffect(() => {
    scrollListingDrawerToTop();
  }, [page, rowsPerPage, scrollListingDrawerToTop]);

  const handleOpenDetails = useCallback((item: ListingItem) => {
    window.open(getMarketDetailUrl(item.skuId), '_blank', 'noopener,noreferrer');
  }, []);

  const resolveDirectMarketItemForAction = useCallback(async (item: ListingItem): Promise<ListingItem | null> => {
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
  }, []);

  const handleAddToCart = useCallback(async (item: ListingItem) => {
    const targetItem = await resolveDirectMarketItemForAction(item);
    if (!targetItem) {
      handleOpenDetails(item);
      return;
    }

    const existingCartItem = cartRef.current.find((cartItem: CartItemType) => cartItem.resource.id === targetItem.skuId);
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
  }, [addToCart, handleOpenDetails, intl, resolveDirectMarketItemForAction, ships, updateItemQuantity]);

  const handleBuyNow = useCallback(async (item: ListingItem) => {
    const targetItem = await resolveDirectMarketItemForAction(item);
    if (!targetItem || getAvailableStock(targetItem) <= 0) {
      handleOpenDetails(item);
      return;
    }

    const directCheckoutItems = [buildMarketCartItem(targetItem, 1, ships)];
    saveDirectCheckoutItems(directCheckoutItems);
    navigate(getDirectCheckoutPath());
  }, [handleOpenDetails, navigate, resolveDirectMarketItemForAction, ships]);

  const getAvailableStockByResourceId = (resourceId: string) => {
    if (resourceId.startsWith('credit-pool:')) {
      return Number.MAX_SAFE_INTEGER;
    }

    const item = listingItems.find((listingItem) => listingItem.skuId === resourceId);
    if (item) return getAvailableStock(item);

    return cart.find((cartItem) => cartItem.resource.id === resourceId)?.resource.marketAvailableStock ?? 0;
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
      || listingDrawerOpen
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
  }, [activeCoupon, activeCoupon?.id, activeCouponExpiresAt, couponPopupDismissed, listingDrawerOpen]);

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
  const hasActiveFilters = hasActiveMarketSearchParams;
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
  const renderProgressSupport = () => (
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
  );
  const renderFilterPanel = () => (
    <MarketFilterPanel
      selectedItemFilter={selectedItemFilter}
      selectedShipTraitFilter={selectedShipTraitFilter}
      selectedShipFocus={selectedShipFocus}
      selectedManufacturerId={selectedManufacturerId}
      showsShipTraitFilters={showsShipTraitFilters}
      showsShipFocusFilter={showsShipFocusFilter}
      showsManufacturerFilter={showsManufacturerFilter}
      shipFocusOptions={shipFocusOptions}
      manufacturerOptions={manufacturerOptions}
      onChangeItemFilter={handleChangeItemFilter}
      onChangeShipTraitFilter={handleChangeShipTraitFilter}
      onChangeShipFocus={handleChangeShipFocus}
      onChangeManufacturerId={handleChangeManufacturerId}
    />
  );

  const renderAccountMarketPanel = (options?: { compact?: boolean; onNavigate?: () => void }) => (
    <AccountMarketPanel
      accountCouponCode={accountCouponCode}
      compact={options?.compact}
      onCopyCouponCode={handleCopyAccountCouponCode}
      onNavigate={options?.onNavigate}
    />
  );

  const scrollStarterPacks = (direction: 'left' | 'right') => {
    const scroller = starterPackScrollerRef.current;
    if (!scroller) {
      return;
    }

    scroller.scrollBy({
      left: direction === 'left' ? -420 : 420,
      behavior: 'smooth',
    });
  };

  const scrollFeaturedAccounts = (direction: 'left' | 'right') => {
    const scroller = featuredAccountScrollerRef.current;
    if (!scroller) {
      return;
    }

    scroller.scrollBy({
      left: direction === 'left' ? -420 : 420,
      behavior: 'smooth',
    });
  };

  const scrollOtherGear = (direction: 'left' | 'right') => {
    const scroller = otherGearScrollerRef.current;
    if (!scroller) {
      return;
    }

    scroller.scrollBy({
      left: direction === 'left' ? -360 : 360,
      behavior: 'smooth',
    });
  };

  const ensureStarterPackVisible = (skuId: string) => {
    if (starterPackVisibilityFrameRef.current != null) {
      window.cancelAnimationFrame(starterPackVisibilityFrameRef.current);
    }

    starterPackVisibilityFrameRef.current = window.requestAnimationFrame(() => {
      starterPackVisibilityFrameRef.current = null;

      const scroller = starterPackScrollerRef.current;
      const card = scroller?.querySelector<HTMLElement>(`[data-starter-pack-sku-id="${CSS.escape(skuId)}"]`);
      if (!scroller || !card) {
        return;
      }

      const scrollerRect = scroller.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const activeWidth = Number.parseFloat(getComputedStyle(scroller).getPropertyValue('--starter-pack-card-active-width'));
      const targetCardWidth = Number.isFinite(activeWidth) && activeWidth > 0
        ? Math.max(cardRect.width, activeWidth)
        : cardRect.width;
      const edgePadding = 16;

      if (cardRect.left < scrollerRect.left + edgePadding) {
        scroller.scrollBy({
          left: cardRect.left - scrollerRect.left - edgePadding,
          behavior: 'smooth',
        });
        return;
      }

      const targetCardRight = cardRect.left + targetCardWidth;
      if (targetCardRight > scrollerRect.right - edgePadding) {
        scroller.scrollBy({
          left: targetCardRight - scrollerRect.right + edgePadding,
          behavior: 'smooth',
        });
      }
    });
  };

  const ensureFeaturedAccountVisible = (skuId: string) => {
    if (featuredAccountVisibilityFrameRef.current != null) {
      window.cancelAnimationFrame(featuredAccountVisibilityFrameRef.current);
    }

    featuredAccountVisibilityFrameRef.current = window.requestAnimationFrame(() => {
      featuredAccountVisibilityFrameRef.current = null;

      const scroller = featuredAccountScrollerRef.current;
      const card = scroller?.querySelector<HTMLElement>(`[data-featured-account-sku-id="${CSS.escape(skuId)}"]`);
      if (!scroller || !card) {
        return;
      }

      const scrollerRect = scroller.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const activeWidth = Number.parseFloat(getComputedStyle(scroller).getPropertyValue('--starter-pack-card-active-width'));
      const targetCardWidth = Number.isFinite(activeWidth) && activeWidth > 0
        ? Math.max(cardRect.width, activeWidth)
        : cardRect.width;
      const edgePadding = 16;

      if (cardRect.left < scrollerRect.left + edgePadding) {
        scroller.scrollBy({
          left: cardRect.left - scrollerRect.left - edgePadding,
          behavior: 'smooth',
        });
        return;
      }

      const targetCardRight = cardRect.left + targetCardWidth;
      if (targetCardRight > scrollerRect.right - edgePadding) {
        scroller.scrollBy({
          left: targetCardRight - scrollerRect.right + edgePadding,
          behavior: 'smooth',
        });
      }
    });
  };

  useEffect(() => () => {
    if (starterPackVisibilityFrameRef.current != null) {
      window.cancelAnimationFrame(starterPackVisibilityFrameRef.current);
    }
    if (featuredAccountVisibilityFrameRef.current != null) {
      window.cancelAnimationFrame(featuredAccountVisibilityFrameRef.current);
    }
  }, []);

  const getStarterPackVisual = (item: ListingItem) => {
    const shipCandidates = [
      { id: item.shipId, name: item.shipName },
      ...(item.packageShips || []).map((packageShip) => ({
        id: packageShip.shipId,
        name: packageShip.shipName,
      })),
    ];
    const sourceShips = starterPackShips.length > 0 ? starterPackShips : ships;
    const ship = shipCandidates.reduce<Ship | null>((matchedShip, candidate) => (
      matchedShip || findShipByIdOrName(sourceShips, candidate)
    ), null);
    const manufacturerName = getShipManufacturerDisplayName(ship);
    const logoPath = getManufacturerLogoPath(ship?.manufacturer);
    const imageUrl = getShipSlideshowImage(ship) || getShipThumbLarge(ship) || getMarketImageDisplayUrl(item.imageUrl, {
      ships: sourceShips,
      variant: 'slideshow',
    });

    return {
      ship,
      manufacturerName,
      logoPath,
      imageUrl: imageUrl || '/imgs/credit.webp',
    };
  };

  const renderStarterPackSection = () => (
    <section className='py-1'>
      <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
        <div className='min-w-0'>
          <div className='text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300'>
            <FormattedMessage id="market.starterPack.eyebrow" defaultMessage="New to Star Citizen?" />
          </div>
          <Typography variant="h5" component="h2" sx={{ mt: 0.75, fontWeight: 900, letterSpacing: 0, color: 'text.primary' }}>
            <FormattedMessage id="market.starterPack.title" defaultMessage="Start with an LTI starter pack" />
          </Typography>
          <Typography sx={{ mt: 1, maxWidth: 760, color: 'text.secondary', fontSize: 14, lineHeight: 1.7 }}>
            <FormattedMessage
              id="market.starterPack.description"
              defaultMessage="Get game access while securing your first LTI ship. We selected LTI ship packs that make a strong starting point for new players."
            />
          </Typography>
        </div>

        <div className='flex shrink-0 items-center gap-2'>
          <Tooltip title={intl.formatMessage({ id: 'common.previous', defaultMessage: 'Previous' })}>
            <IconButton
              onClick={() => scrollStarterPacks('left')}
              aria-label={intl.formatMessage({ id: 'common.previous', defaultMessage: 'Previous' })}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 0 }}
            >
              <ChevronLeft className='h-5 w-5' />
            </IconButton>
          </Tooltip>
          <Tooltip title={intl.formatMessage({ id: 'common.next', defaultMessage: 'Next' })}>
            <IconButton
              onClick={() => scrollStarterPacks('right')}
              aria-label={intl.formatMessage({ id: 'common.next', defaultMessage: 'Next' })}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 0 }}
            >
              <ChevronRight className='h-5 w-5' />
            </IconButton>
          </Tooltip>
          <Button
            variant="outlined"
            endIcon={<ArrowRight className='h-4 w-4' />}
            onClick={openStarterPackListings}
            sx={{ borderRadius: 0 }}
          >
            <FormattedMessage id="market.starterPack.cta" defaultMessage="Browse Starter Packs" />
          </Button>
        </div>
      </div>

      {starterPackLoading && starterPackItems.length === 0 ? (
        <div className='mt-4 flex min-h-48 items-center justify-center border border-dashed border-gray-200 text-slate-500 dark:border-gray-800 dark:text-slate-400'>
          <CircularProgress size={22} />
        </div>
      ) : starterPackItems.length > 0 ? (
        <div
          ref={starterPackScrollerRef}
          className='starter-pack-carousel mt-5 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        >
          {starterPackItems.map((item) => {
            const visual = getStarterPackVisual(item);
            const displayName = getMarketItemDisplayName(intl, item, ships);
            const availableStock = getAvailableStock(item);

            return (
              <div
                key={item.skuId}
                data-starter-pack-sku-id={item.skuId}
                onClick={() => handleOpenDetails(item)}
                onMouseEnter={() => ensureStarterPackVisible(item.skuId)}
                onFocus={() => ensureStarterPackVisible(item.skuId)}
                tabIndex={0}
                role="button"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleOpenDetails(item);
                  }
                }}
                className='starter-pack-card relative h-[300px] shrink-0 cursor-pointer overflow-hidden bg-neutral-900 text-left text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-[360px]'
              >
                <img
                  src={visual.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className='absolute inset-0 h-full w-full object-cover'
                />
                <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08)_0%,rgba(0,0,0,0.16)_42%,rgba(0,0,0,0.82)_100%)]' />
                <div className='absolute left-0 top-0 p-4'>
                  {visual.logoPath ? (
                    <img
                      src={visual.logoPath}
                      alt={visual.manufacturerName}
                      loading="lazy"
                      className='h-10 w-10 object-contain brightness-0 invert drop-shadow-[0_1px_6px_rgba(0,0,0,0.45)]'
                    />
                  ) : (
                    <span className='flex h-10 w-10 items-center justify-center border border-white/35 bg-black/35 text-xs font-black uppercase text-white'>
                      {(visual.manufacturerName || displayName).slice(0, 2)}
                    </span>
                  )}
                </div>
                <div className='absolute inset-x-0 bottom-0 flex min-h-28 flex-col justify-end p-4'>
                  <div className='starter-pack-title max-w-[360px] text-base font-black leading-tight sm:text-xl'>
                    {displayName}
                  </div>
                  <div className='mt-3 flex items-end justify-between gap-3'>
                    <div className='text-xl font-black tabular-nums text-white sm:text-2xl'>
                      {formatUsdPrice(intl.locale, item.price)}
                    </div>
                    {availableStock <= 0 && (
                      <span className='border border-white/25 bg-black/40 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/85'>
                        <FormattedMessage id="market.outOfStock" defaultMessage="Out of stock" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className='mt-4 border border-dashed border-gray-300 p-6 text-center text-sm text-slate-500 dark:border-gray-700 dark:text-slate-400'>
          <FormattedMessage id="market.starterPack.empty" defaultMessage="Starter packs will appear here when available." />
        </div>
      )}
    </section>
  );

  const getFeaturedAccountImageUrl = (item: AccountListingItem) => {
    const listingImages = resolveMarketImageUrls(item.imageUrl, item.imageUrls);
    const entryImage = item.entries.find((entry) => entry.imageUrl)?.imageUrl;
    const imageUrl = listingImages[0] || entryImage || '/imgs/credit.webp';
    return getMarketImageDisplayUrl(imageUrl, {
      ships: accountMarketShips.length > 0 ? accountMarketShips : ships,
      variant: 'slideshow',
    }) || '/imgs/credit.webp';
  };

  const renderFeaturedAccountsSection = () => (
    <section className='py-1'>
      <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
        <div className='min-w-0'>
          <div className='text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300'>
            <FormattedMessage id="accountMarket.panel.eyebrow" defaultMessage="Looking for a Star Citizen account?" />
          </div>
          <Typography variant="h5" component="h2" sx={{ mt: 0.75, fontWeight: 900, letterSpacing: 0, color: 'text.primary' }}>
            <FormattedMessage id="accountMarket.panel.title" defaultMessage="Premium Star Citizen accounts on sale now" />
          </Typography>
          <Typography sx={{ mt: 1, maxWidth: 760, color: 'text.secondary', fontSize: 14, lineHeight: 1.7 }}>
            <FormattedMessage
              id="accountMarket.panel.description"
              defaultMessage="Browse our accounts for sale, including limited ships, retired items, buyback access, and extras. If you need something specific, contact us about a custom account."
            />
          </Typography>
        </div>

        <div className='flex shrink-0 items-center gap-2'>
          <Tooltip title={intl.formatMessage({ id: 'common.previous', defaultMessage: 'Previous' })}>
            <IconButton
              onClick={() => scrollFeaturedAccounts('left')}
              aria-label={intl.formatMessage({ id: 'common.previous', defaultMessage: 'Previous' })}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 0 }}
            >
              <ChevronLeft className='h-5 w-5' />
            </IconButton>
          </Tooltip>
          <Tooltip title={intl.formatMessage({ id: 'common.next', defaultMessage: 'Next' })}>
            <IconButton
              onClick={() => scrollFeaturedAccounts('right')}
              aria-label={intl.formatMessage({ id: 'common.next', defaultMessage: 'Next' })}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 0 }}
            >
              <ChevronRight className='h-5 w-5' />
            </IconButton>
          </Tooltip>
          <Button
            component={Link}
            to={getAccountMarketListPath()}
            variant="outlined"
            endIcon={<ArrowRight className='h-4 w-4' />}
            sx={{ borderRadius: 0 }}
          >
            <FormattedMessage id="accountMarket.panel.cta" defaultMessage="Browse Accounts" />
          </Button>
        </div>
      </div>

      <div className='mt-4 flex flex-col gap-3 border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between'>
        <div className='min-w-0'>
          <div className='text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300'>
            <FormattedMessage id="accountMarket.panel.codeLabel" defaultMessage="Discount code" />
          </div>
          <div className='mt-1 text-slate-700 dark:text-slate-200'>
            <FormattedMessage
              id="accountMarket.panel.codeBody"
              defaultMessage="Use the monthly account code at checkout to claim {percent}% off eligible account listings."
              values={{ percent: ACCOUNT_MARKET_COUPON_PERCENT_OFF }}
            />
          </div>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <div className='break-all text-lg font-black leading-tight text-slate-950 dark:text-white'>{accountCouponCode}</div>
          <Tooltip title={intl.formatMessage({ id: 'common.copy', defaultMessage: 'Copy' })} arrow>
            <IconButton size="small" sx={{ flexShrink: 0 }} onClick={() => void handleCopyAccountCouponCode()}>
              <ContentCopy fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      </div>

      {featuredAccountLoading && featuredAccountItems.length === 0 ? (
        <div className='mt-4 flex min-h-48 items-center justify-center border border-dashed border-gray-200 text-slate-500 dark:border-gray-800 dark:text-slate-400'>
          <CircularProgress size={22} />
        </div>
      ) : featuredAccountItems.length > 0 ? (
        <div
          ref={featuredAccountScrollerRef}
          className='starter-pack-carousel mt-5 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        >
          {featuredAccountItems.map((item) => {
            const availableStock = Math.max(item.stock - item.lockedStock, 0);
            const extraSummaryCount = item.extraCount + item.bundleCount + item.highlightCount;

            return (
              <Link
                key={item.skuId}
                to={getAccountMarketDetailPath(item.skuId)}
                data-featured-account-sku-id={item.skuId}
                onMouseEnter={() => ensureFeaturedAccountVisible(item.skuId)}
                onFocus={() => ensureFeaturedAccountVisible(item.skuId)}
                className='starter-pack-card text-white! relative h-[300px] shrink-0 cursor-pointer overflow-hidden bg-neutral-900 text-left no-underline outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-[360px]'
              >
                <img
                  src={getFeaturedAccountImageUrl(item)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className='absolute inset-0 h-full w-full object-cover'
                />
                <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08)_0%,rgba(0,0,0,0.16)_42%,rgba(0,0,0,0.84)_100%)]' />
                <div className='absolute inset-x-0 bottom-0 flex min-h-32 flex-col justify-end p-4'>
                  <div className='starter-pack-title max-w-[380px] text-base font-black leading-tight sm:text-xl'>
                    {item.name}
                  </div>
                  <div className='starter-pack-title mt-2 flex flex-wrap gap-2 text-xs font-semibold text-white/80'>
                    <span>
                      {intl.formatMessage({ id: 'accountMarket.card.ships', defaultMessage: '{count} ships' }, { count: item.shipCount })}
                    </span>
                    <span>
                      {intl.formatMessage({ id: 'accountMarket.card.ccus', defaultMessage: '{count} CCUs' }, { count: item.ccuCount })}
                    </span>
                    <span>
                      {intl.formatMessage({ id: 'accountMarket.card.extras', defaultMessage: '{count} extras' }, { count: extraSummaryCount })}
                    </span>
                  </div>
                  <div className='mt-3 flex items-end justify-between gap-3'>
                    <div className='text-xl font-black tabular-nums text-white sm:text-2xl'>
                      {intl.formatNumber(item.price, { style: 'currency', currency: 'USD' })}
                    </div>
                    {availableStock <= 0 && (
                      <span className='border border-white/25 bg-black/40 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/85'>
                        <FormattedMessage id="market.outOfStock" defaultMessage="Out of stock" />
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className='mt-4 border border-dashed border-gray-300 p-6 text-center text-sm text-slate-500 dark:border-gray-700 dark:text-slate-400'>
          <FormattedMessage id="accountMarket.panel.empty" defaultMessage="Account listings will appear here when available." />
        </div>
      )}
    </section>
  );

  const openMarketCategoryListings = (value: MarketItemFilterOption) => {
    updateMarketSearchParams((nextSearchParams) => {
      nextSearchParams.delete('itemType');
      nextSearchParams.delete('browseCategory');
      nextSearchParams.delete('tag');
      nextSearchParams.delete('shipTrait');
      nextSearchParams.delete('shipFocus');
      nextSearchParams.delete('manufacturerId');
      nextSearchParams.delete('packageItem');
      nextSearchParams.delete('page');

      if (value === 'ccu' || value === 'credit') {
        nextSearchParams.set('itemType', value);
      } else if (value !== 'all') {
        nextSearchParams.set('browseCategory', value);
      }
    });
    openListingDrawer();
  };

  const renderCategoryBrowseSection = () => (
    <section className='grid gap-4'>
      <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
        <div className='min-w-0'>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 900, letterSpacing: 0, color: 'text.primary' }}>
            <FormattedMessage id="market.home.category.title" defaultMessage="Start from the product type you need" />
          </Typography>
          <Typography sx={{ mt: 1, maxWidth: 760, color: 'text.secondary', fontSize: 14, lineHeight: 1.7 }}>
            <FormattedMessage
              id="market.home.category.description"
              defaultMessage="Jump into ships, starter packages, CCUs, paints, or store credit with filters already applied."
            />
          </Typography>
        </div>
        <Button
          variant="outlined"
          endIcon={<ArrowRight className='h-4 w-4' />}
          onClick={() => openListingDrawer()}
          sx={{ alignSelf: { xs: 'flex-start', md: 'auto' }, borderRadius: 0 }}
        >
          <FormattedMessage id="market.openListings" defaultMessage="Browse all products" />
        </Button>
      </div>

      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
        {marketHomeCategoryEntries.map((entry) => (
          <MarketHomeCategoryCard
            key={entry.value}
            entry={entry}
            onOpen={openMarketCategoryListings}
          />
        ))}
      </div>
    </section>
  );

  const openManufacturerListings = (manufacturerId: number) => {
    updateMarketSearchParams((nextSearchParams) => {
      MARKET_SEARCH_PARAM_KEYS.forEach((key) => {
        nextSearchParams.delete(key);
      });
      nextSearchParams.set('manufacturerId', String(manufacturerId));
    });
    openListingDrawer();
  };

  const openShipFocusListings = (shipFocus: string) => {
    updateMarketSearchParams((nextSearchParams) => {
      MARKET_SEARCH_PARAM_KEYS.forEach((key) => {
        nextSearchParams.delete(key);
      });
      nextSearchParams.set('shipFocus', shipFocus);
    });
    openListingDrawer();
  };

  const renderManufacturerBrowseSection = () => (
    <section className='border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-neutral-900 md:p-5'>
      <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
        <div className='min-w-0'>
          <div className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400'>
            <FormattedMessage id="market.brandBrowse.eyebrow" defaultMessage="Browse by brand" />
          </div>
          <Typography variant="h5" component="h2" sx={{ mt: 0.75, fontWeight: 900, letterSpacing: 0, color: 'text.primary' }}>
            <FormattedMessage id="market.brandBrowse.title" defaultMessage="Find ships and packs by manufacturer" />
          </Typography>
          {/* <Typography sx={{ mt: 1, maxWidth: 760, color: 'text.secondary', fontSize: 14, lineHeight: 1.7 }}>
            <FormattedMessage
              id="market.brandBrowse.description"
              defaultMessage="Jump straight to listings from the manufacturers you care about, then refine by ships, packages, CCUs, or LTI."
            />
          </Typography> */}
        </div>
      </div>

      <div className='mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'>
        {manufacturerOptions.map((manufacturer) => (
          <div
            key={manufacturer.id}
            onClick={() => openManufacturerListings(manufacturer.id)}
            className='flex min-h-20 cursor-pointer items-center gap-3 border border-gray-200 bg-white p-3 text-left transition hover:border-blue-400 hover:bg-blue-50 dark:border-gray-800 dark:bg-neutral-950 dark:hover:border-blue-600 dark:hover:bg-neutral-900'
          >
            {manufacturer.logoPath ? (
              <img
                src={manufacturer.logoPath}
                alt=""
                loading="lazy"
                className='h-9 w-9 shrink-0 object-contain [filter:var(--market-manufacturer-logo-filter,none)]'
              />
            ) : (
              <span className='flex h-9 w-9 shrink-0 items-center justify-center border border-gray-200 text-xs font-black uppercase text-slate-500 dark:border-gray-800 dark:text-slate-400'>
                {manufacturer.name.slice(0, 2)}
              </span>
            )}
            <span className='min-w-0 flex-1 truncate text-sm font-bold text-slate-950 dark:text-white'>
              {manufacturer.name}
            </span>
            <ArrowRight className='h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300' />
          </div>
        ))}
      </div>
    </section>
  );

  const renderShipFocusBrowseSection = () => (
    <section>
      <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
        <div className='min-w-0'>
          <div className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400'>
            <FormattedMessage id="market.roleBrowse.eyebrow" defaultMessage="Browse by role" />
          </div>
          <Typography variant="h5" component="h2" sx={{ mt: 0.75, fontWeight: 900, letterSpacing: 0, color: 'text.primary' }}>
            <FormattedMessage id="market.roleBrowse.title" defaultMessage="Get Into A New Profession" />
          </Typography>
          {/* <Typography sx={{ mt: 1, maxWidth: 760, color: 'text.secondary', fontSize: 14, lineHeight: 1.7 }}>
            <FormattedMessage
              id="market.roleBrowse.description"
              defaultMessage="Choose a ship focus such as fighter, freight, mining, medical, exploration, or touring to browse matching listings."
            />
          </Typography> */}
        </div>
      </div>

      <div className='market-role-marquee relative left-1/2 mt-4 flex w-[100dvw] max-w-[100dvw] -translate-x-1/2 flex-col gap-4 overflow-hidden px-4 md:px-10'>
        {[0, 1].map((rowIndex) => {
          const rowItems = shipFocusOptions.filter((_, index) => index % 2 === rowIndex);
          const marqueeItems = rowItems.length ? [...rowItems, ...rowItems] : [];

          return (
            <div
              key={rowIndex}
              className={`market-role-marquee-row flex w-max gap-3 ${rowIndex === 1 ? 'market-role-marquee-row-reverse' : ''}`}
            >
              {marqueeItems.map((shipFocus, index) => (
                <div
                  key={`${shipFocus.focus}-${index}`}
                  onClick={() => openShipFocusListings(shipFocus.focus)}
                  className='group relative flex h-44 w-80 shrink-0 cursor-pointer overflow-hidden border border-gray-200 bg-slate-900 text-left transition hover:border-blue-400 dark:border-gray-800 dark:hover:border-blue-600 sm:h-52 sm:w-[420px]'
                >
                  {shipFocus.imageUrl ? (
                    <img
                      src={shipFocus.imageUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className='absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]'
                    />
                  ) : (
                    <div className='absolute inset-0 bg-slate-900' />
                  )}
                  <div className='absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.78)_0%,rgba(2,6,23,0.46)_54%,rgba(2,6,23,0.18)_100%)]' />
                  <div className='relative z-10 flex h-full w-full flex-col justify-end p-5 text-white'>
                    {/* <div className='truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-200'>
                      {shipFocus.sampleShipName}
                    </div> */}
                    <div className='mt-1 truncate text-2xl font-black leading-tight'>
                      {shipFocus.label}
                    </div>
                    <div className='mt-3 flex items-center justify-between gap-3 text-xs font-semibold text-white/80'>
                      <span>
                        {intl.formatMessage(
                          { id: 'market.roleBrowse.shipCount', defaultMessage: '{count} ships' },
                          { count: shipFocus.shipCount },
                        )}
                      </span>
                      <ArrowRight className='h-4 w-4 shrink-0 text-blue-200' />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );

  const renderMarketReviewsSection = () => {
    if (!marketReviewsLoading && marketReviews.length === 0 && !reviewRatingFilter) {
      return null;
    }

    const renderMarketReviewCard = (review: MarketReviewItem, options?: { compact?: boolean }) => {
      const rsiName = review.user.rsiDisplayName || review.user.rsiHandle;
      const reviewAvatarUrl = resolveReviewAvatarUrl(review.user.avatar, review.user.rsiAvatar);
      const visiblePurchasedItems = review.purchasedItems || [];
      const hiddenPurchasedItemCount = Math.max(review.purchasedItemCount - visiblePurchasedItems.length, 0);
      const reviewAttachments = review.reviewAttachments || [];
      const openReviewImagePreview = (attachment: MarketReviewAttachmentSummary) => {
        setReviewImagePreview(attachment);
      };

      return (
        <article
          key={review.id}
          className='flex min-w-0 max-w-full flex-col overflow-hidden border border-gray-200 bg-slate-50 p-4 text-left dark:border-gray-800 dark:bg-neutral-950'
        >
          <div className='flex min-w-0 items-start gap-3'>
            {reviewAvatarUrl ? (
              <Avatar src={reviewAvatarUrl} />
            ) : (
              <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-black uppercase text-slate-600 dark:bg-neutral-800 dark:text-slate-300'>
                {review.user.displayName.slice(0, 2)}
              </span>
            )}

            <div className='min-w-0 flex-1'>
              <div className='truncate text-sm font-black text-slate-950 dark:text-white'>
                {review.user.displayName}
              </div>
              {review.user.rsiProfileUrl && rsiName ? (
                <a
                  href={review.user.rsiProfileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className='mt-0.5 block truncate text-xs font-semibold text-blue-700 no-underline hover:underline dark:text-blue-300'
                >
                  <FormattedMessage
                    id="market.reviews.rsiAccount"
                    defaultMessage="RSI: {handle}"
                    values={{ handle: rsiName }}
                  />
                </a>
              ) : (
                <div className='mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400'>
                  <FormattedMessage id="market.reviews.noRsiAccount" defaultMessage="RSI Account not provided" />
                </div>
              )}
            </div>
          </div>

          <div className='mt-4 flex min-w-0 flex-wrap items-center gap-2'>
            <Rating value={review.rating} readOnly size="small" sx={{ flexShrink: 0 }} />
            <span className='text-xs font-bold tabular-nums text-slate-600 dark:text-slate-300'>
              {intl.formatMessage(
                { id: 'market.reviews.ratingValue', defaultMessage: '{rating}/5' },
                { rating: review.rating },
              )}
            </span>
          </div>

          <p className={`${options?.compact ? 'line-clamp-5' : ''} mt-3 min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200`}>
            {review.feedback || intl.formatMessage({ id: 'orders.reviewNoComment', defaultMessage: 'No written review provided.' })}
          </p>

          {reviewAttachments.length > 0 && (
            <div className='mt-4 grid grid-cols-3 gap-2'>
              {reviewAttachments.slice(0, 3).map((attachment) => (
                <Box
                  component="span"
                  role="button"
                  tabIndex={0}
                  key={attachment.id}
                  onClick={() => openReviewImagePreview(attachment)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openReviewImagePreview(attachment);
                    }
                  }}
                  className='block cursor-zoom-in overflow-hidden border border-gray-200 bg-white text-left dark:border-gray-800 dark:bg-neutral-900'
                  aria-label={intl.formatMessage(
                    { id: 'market.reviews.previewImage', defaultMessage: 'Preview review image {name}' },
                    { name: attachment.fileName },
                  )}
                >
                  <img
                    src={attachment.imageUrl}
                    alt={attachment.fileName}
                    loading="lazy"
                    decoding="async"
                    className='aspect-square w-full object-cover transition duration-200 hover:scale-[1.03]'
                  />
                </Box>
              ))}
            </div>
          )}

          {visiblePurchasedItems.length > 0 && (
            <div className='mt-4 min-w-0 border-t border-gray-200 pt-3 dark:border-gray-800'>
              <div className='text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400'>
                <FormattedMessage id="market.reviews.purchased" defaultMessage="Purchased" />
              </div>
              <div className='mt-2 flex min-w-0 flex-wrap gap-2'>
                {visiblePurchasedItems.map((item, index) => (
                  <span
                    key={`${review.id}-${item.name}-${index}`}
                    className='max-w-full break-words border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 dark:border-gray-800 dark:bg-neutral-900 dark:text-slate-200'
                  >
                    {item.quantity > 1 ? `${item.name} x${item.quantity}` : item.name}
                  </span>
                ))}
                {hiddenPurchasedItemCount > 0 && (
                  <span className='border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500 dark:border-gray-800 dark:bg-neutral-900 dark:text-slate-300'>
                    <FormattedMessage
                      id="market.reviews.morePurchasedItems"
                      defaultMessage="+{count} more"
                      values={{ count: hiddenPurchasedItemCount }}
                    />
                  </span>
                )}
              </div>
            </div>
          )}
        </article>
      );
    };

    const renderReviewRatingFilters = (ratingSummary = marketReviewRatingSummary) => {
      const ratingSummaryTotal = ratingSummary?.total || 0;
      if (!ratingSummaryTotal) {
        return null;
      }

      const ratingSummaryCounts = new Map(
        (ratingSummary?.counts || []).map((entry) => [entry.rating, entry.count]),
      );

      return (
        <div className='flex w-full max-w-[360px] flex-col gap-1'>
          {MARKET_REVIEW_RATING_FILTERS.map((rating) => {
            const count = ratingSummaryCounts.get(rating) || 0;
            const percentage = ratingSummaryTotal > 0 ? (count / ratingSummaryTotal) * 100 : 0;
            const selected = reviewRatingFilter === rating;
            const disabled = count <= 0;
            const handleSelectRating = () => {
              if (disabled) {
                return;
              }

              setReviewRatingFilter((current) => current === rating ? null : rating);
            };

            return (
              <Box
                key={rating}
                component="span"
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled}
                onClick={handleSelectRating}
                onKeyDown={(event) => {
                  if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    handleSelectRating();
                  }
                }}
                className={`grid grid-cols-[92px_minmax(80px,1fr)_36px] items-center gap-3 px-1 py-0.5 text-left transition ${disabled ? 'cursor-default opacity-45' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-neutral-900'} ${selected ? 'bg-red-50 ring-1 ring-red-300 dark:bg-red-950/20 dark:ring-red-800' : ''}`}
                aria-label={intl.formatMessage(
                  { id: 'market.reviews.filterRatingAria', defaultMessage: '{rating} star reviews' },
                  { rating },
                )}
              >
                <Rating
                  value={rating}
                  readOnly
                  size="small"
                  sx={{
                    color: '#faaf00',
                    fontSize: 18,
                    '& .MuiRating-iconEmpty': {
                      color: disabled
                        ? (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.22)')
                        : '#faaf00',
                    },
                  }}
                />
                <span className='relative h-2 overflow-hidden bg-slate-100 dark:bg-neutral-800'>
                  <span
                    className='absolute inset-y-0 left-0 bg-[#faaf00]'
                    style={{ width: `${percentage}%` }}
                  />
                </span>
                <span className='text-right text-sm tabular-nums text-slate-500 dark:text-slate-300'>
                  {count}
                </span>
              </Box>
            );
          })}
          {reviewRatingFilter !== null && (
            <Button
              size="small"
              variant="text"
              onClick={() => setReviewRatingFilter(null)}
              sx={{ alignSelf: 'flex-start', borderRadius: 0, textTransform: 'none' }}
            >
              <FormattedMessage id="market.reviews.filterAll" defaultMessage="All ratings" />
            </Button>
          )}
        </div>
      );
    };

    return (
      <section className='min-w-0 max-w-full overflow-hidden border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-neutral-900'>
        <div className='flex flex-col gap-3'>
          <div className='min-w-0'>
            <Typography variant="h6" component="h2" sx={{ mt: 0.5, fontWeight: 900, letterSpacing: 0, color: 'text.primary' }}>
              <FormattedMessage id="market.reviews.title" defaultMessage="Reviews from verified purchases" />
            </Typography>
          </div>

          {renderReviewRatingFilters(marketReviewRatingSummary)}
        </div>

        {marketReviewsLoading && marketReviews.length === 0 ? (
          <div className='mt-4 flex min-h-32 items-center justify-center border border-dashed border-gray-200 text-slate-500 dark:border-gray-800 dark:text-slate-400'>
            <CircularProgress size={22} />
          </div>
        ) : marketReviews.length > 0 ? (
          <div className='mt-4 grid min-w-0 max-w-full gap-3 md:grid-cols-2 xl:grid-cols-3'>
            {marketReviews.slice(0, MARKET_REVIEW_SECTION_LIMIT).map((review) => renderMarketReviewCard(review, { compact: true }))}
          </div>
        ) : (
          <div className='mt-4 flex min-h-28 items-center justify-center border border-dashed border-gray-200 px-4 text-center text-sm font-semibold text-slate-500 dark:border-gray-800 dark:text-slate-400'>
            <FormattedMessage id="market.reviews.emptyForFilter" defaultMessage="No reviews match this rating yet." />
          </div>
        )}

        {marketReviewsTotal > MARKET_REVIEW_SECTION_LIMIT && (
          <div className='mt-4 flex justify-center'>
            <Button
              variant="outlined"
              onClick={() => {
                setReviewsDialogPage(0);
                setReviewsDialogOpen(true);
              }}
              sx={{ borderRadius: 0, textTransform: 'none' }}
            >
              <FormattedMessage
                id="market.reviews.openMore"
                defaultMessage="Open more reviews ({count})"
                values={{ count: marketReviewsTotal }}
              />
            </Button>
          </div>
        )}

        <Dialog
          open={reviewsDialogOpen}
          onClose={() => setReviewsDialogOpen(false)}
          fullWidth
          maxWidth="lg"
          fullScreen={isMobileListingDrawer}
        >
          <DialogTitle className="flex items-start justify-between gap-4 border-b border-gray-200 dark:border-gray-800">
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                <FormattedMessage id="market.reviews.dialogTitle" defaultMessage="Customer reviews" />
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <FormattedMessage
                  id="market.reviews.dialogSummary"
                  defaultMessage="{count} reviews"
                  values={{ count: marketReviewsDialogPagination?.total || marketReviewsTotal }}
                />
              </Typography>
            </Box>
            <IconButton onClick={() => setReviewsDialogOpen(false)} aria-label={intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}>
              <X className="h-5 w-5" />
            </IconButton>
          </DialogTitle>
          <DialogContent className="!p-0">
            <div className='border-b border-gray-200 p-4 dark:border-gray-800'>
              {renderReviewRatingFilters(marketReviewsDialogRatingSummary || marketReviewRatingSummary)}
            </div>
            {marketReviewsDialogLoading && marketReviewsDialogItems.length === 0 ? (
              <div className='flex min-h-60 items-center justify-center'>
                <CircularProgress size={24} />
              </div>
            ) : marketReviewsDialogItems.length > 0 ? (
              <div className='grid min-w-0 max-w-full gap-3 p-4 md:grid-cols-2'>
                {marketReviewsDialogItems.map((review) => renderMarketReviewCard(review))}
              </div>
            ) : (
              <div className='flex min-h-48 items-center justify-center px-4 text-center text-sm font-semibold text-slate-500 dark:text-slate-400'>
                <FormattedMessage id="market.reviews.emptyForFilter" defaultMessage="No reviews match this rating yet." />
              </div>
            )}
            {(marketReviewsDialogPagination?.totalPages || 0) > 1 && (
              <div className='flex items-center justify-center gap-3 border-t border-gray-200 p-4 dark:border-gray-800'>
                <Button
                  variant="outlined"
                  disabled={reviewsDialogPage <= 0 || marketReviewsDialogLoading}
                  onClick={() => setReviewsDialogPage((current) => Math.max(current - 1, 0))}
                  sx={{ borderRadius: 0, textTransform: 'none' }}
                >
                  <FormattedMessage id="common.previous" defaultMessage="Previous" />
                </Button>
                <span className='text-sm font-semibold text-slate-600 dark:text-slate-300'>
                  <FormattedMessage
                    id="market.reviews.pageStatus"
                    defaultMessage="{page}/{totalPages}"
                    values={{
                      page: reviewsDialogPage + 1,
                      totalPages: marketReviewsDialogPagination?.totalPages || 1,
                    }}
                  />
                </span>
                <Button
                  variant="outlined"
                  disabled={reviewsDialogPage + 1 >= (marketReviewsDialogPagination?.totalPages || 1) || marketReviewsDialogLoading}
                  onClick={() => setReviewsDialogPage((current) => current + 1)}
                  sx={{ borderRadius: 0, textTransform: 'none' }}
                >
                  <FormattedMessage id="common.next" defaultMessage="Next" />
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(reviewImagePreview)}
          onClose={() => setReviewImagePreview(null)}
          fullWidth
          maxWidth="md"
        >
          <DialogTitle className="flex items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800">
            <span className='min-w-0 truncate text-base font-bold'>
              {intl.formatMessage({ id: 'market.reviews.imagePreviewTitle', defaultMessage: 'Review image' })}
            </span>
            <IconButton onClick={() => setReviewImagePreview(null)} aria-label={intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}>
              <X className="h-5 w-5" />
            </IconButton>
          </DialogTitle>
          <DialogContent className="!p-0">
            {reviewImagePreview && (
              <div className='flex min-h-[280px] items-center justify-center bg-black'>
                <img
                  src={reviewImagePreview.imageUrl}
                  alt={reviewImagePreview.fileName}
                  className='max-h-[82vh] w-full object-contain'
                />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </section>
    );
  };

  const openOtherGearListings = () => {
    updateMarketSearchParams((nextSearchParams) => {
      nextSearchParams.delete('itemType');
      nextSearchParams.delete('tag');
      nextSearchParams.delete('shipTrait');
      nextSearchParams.delete('shipFocus');
      nextSearchParams.delete('manufacturerId');
      nextSearchParams.delete('packageItem');
      nextSearchParams.delete('page');
      nextSearchParams.set('browseCategory', 'other');
      nextSearchParams.set('sortBy', 'newest');
    });
    openListingDrawer();
  };

  const renderOtherGearSection = () => {
    if (!otherGearLoading && otherGearItems.length === 0) {
      return null;
    }

    return (
      <section className='border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-neutral-900 md:p-5'>
        <div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
          <div className='min-w-0'>
            <div className='text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300'>
              <FormattedMessage id="market.otherGear.eyebrow" defaultMessage="Gear drop" />
            </div>
            <Typography variant="h5" component="h2" sx={{ mt: 0.75, fontWeight: 900, letterSpacing: 0, color: 'text.primary' }}>
              <FormattedMessage id="market.otherGear.title" defaultMessage="Grab Some New Gears" />
            </Typography>
            <Typography sx={{ mt: 1, maxWidth: 760, color: 'text.secondary', fontSize: 14, lineHeight: 1.7 }}>
              <FormattedMessage
                id="market.otherGear.description"
                defaultMessage="Pick up fresh extras, equipment, and other marketplace finds for your next run."
              />
            </Typography>
          </div>

          <div className='flex shrink-0 items-center gap-2'>
            <Tooltip title={intl.formatMessage({ id: 'common.previous', defaultMessage: 'Previous' })}>
              <IconButton
                onClick={() => scrollOtherGear('left')}
                aria-label={intl.formatMessage({ id: 'common.previous', defaultMessage: 'Previous' })}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 0 }}
              >
                <ChevronLeft className='h-5 w-5' />
              </IconButton>
            </Tooltip>
            <Tooltip title={intl.formatMessage({ id: 'common.next', defaultMessage: 'Next' })}>
              <IconButton
                onClick={() => scrollOtherGear('right')}
                aria-label={intl.formatMessage({ id: 'common.next', defaultMessage: 'Next' })}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 0 }}
              >
                <ChevronRight className='h-5 w-5' />
              </IconButton>
            </Tooltip>
            <Button
              variant="outlined"
              endIcon={<ArrowRight className='h-4 w-4' />}
              onClick={openOtherGearListings}
              sx={{ borderRadius: 0 }}
            >
              <FormattedMessage id="market.otherGear.cta" defaultMessage="Browse all gear" />
            </Button>
          </div>
        </div>

        {otherGearLoading && otherGearItems.length === 0 ? (
          <div className='mt-4 flex min-h-48 items-center justify-center border border-dashed border-gray-200 text-slate-500 dark:border-gray-800 dark:text-slate-400'>
            <CircularProgress size={22} />
          </div>
        ) : (
          <div
            ref={otherGearScrollerRef}
            className='mt-5 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          >
            {otherGearItems.map((item) => {
              const directItem = resolveDirectMarketItem(item);
              const availableStock = directItem ? getAvailableStock(directItem) : getAvailableStock(item);
              const priceDisplay = getListingPriceDisplay(item, ships);
              const displayName = getMarketItemDisplayName(intl, item, ships);
              const isCcu = item.itemType === 'ccu';
              const isVariantPriceRange = isCcu && (item.variantCount || 0) > 1;

              return (
                <article
                  key={item.skuId}
                  className='cursor-pointer flex min-h-[390px] w-[min(82vw,280px)] shrink-0 flex-col overflow-hidden border border-gray-200 bg-slate-50 text-left transition hover:border-gray-300 dark:border-gray-800 dark:bg-neutral-950 dark:hover:border-gray-700'
                >
                  <div
                    onClick={() => handleOpenDetails(item)}
                    className='block w-full border-0 bg-transparent p-0 text-left'
                    aria-label={displayName}
                  >
                    <MarketItemMedia
                      item={item}
                      ships={ships}
                      height={170}
                      badgeText={priceDisplay.promotionDiscountPercent ? formatMarketDiscount(intl, priceDisplay.promotionDiscountPercent) : null}
                    />
                  </div>

                  <div className='flex flex-1 flex-col gap-3 p-4'>
                    <div className='flex flex-wrap gap-2'>
                      {item.browseCategory && <Chip size="small" variant="outlined" label={getMarketBrowseCategoryLabel(intl, item.browseCategory)} />}
                      {item.itemType === 'ccu' && <Chip size="small" label={getMarketItemTypeLabel(intl, item.itemType)} />}
                      {item.itemType === 'credit' && <Chip size="small" label={getMarketItemTypeLabel(intl, item.itemType)} />}
                    </div>

                    <div
                      onClick={() => handleOpenDetails(item)}
                      className='border-0 bg-transparent p-0 text-left text-inherit'
                    >
                      <Typography
                        variant="h6"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          fontWeight: 800,
                          lineHeight: 1.3,
                          fontSize: '1rem',
                        }}
                      >
                        {displayName}
                      </Typography>
                    </div>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        minHeight: 40,
                        overflow: 'hidden',
                      }}
                    >
                      {getMarketItemSummary(intl, item, ships)}
                    </Typography>

                    <div className='mt-auto flex flex-col gap-3'>
                      <div>
                        <div className='text-xl font-black text-slate-900 dark:text-slate-100'>
                          {isVariantPriceRange
                            ? formatMarketPriceFrom(intl, item.price)
                            : formatUsdPrice(intl.locale, item.price)}
                        </div>
                        {priceDisplay.marketPrice > 0 && (
                          <div className='text-sm text-slate-500 line-through dark:text-slate-400'>
                            {formatUsdPrice(intl.locale, priceDisplay.marketPrice)}
                          </div>
                        )}
                        {priceDisplay.officialSavingsAmount > 0 ? (
                          <div className='text-xs text-slate-500 dark:text-slate-400'>
                            {formatMarketOfficialSavings(intl, priceDisplay.officialSavingsAmount)}
                          </div>
                        ) : null}
                      </div>

                      <div className='flex items-center justify-between gap-2'>
                        <Button
                          variant="outlined"
                          onClick={() => handleAddToCart(item)}
                          disabled={availableStock <= 0}
                          size="small"
                          sx={{ borderRadius: 0 }}
                        >
                          <FormattedMessage id="market.addToCart" defaultMessage="Add to cart" />
                        </Button>
                        <Button
                          variant="contained"
                          onClick={() => handleBuyNow(item)}
                          disabled={availableStock <= 0}
                          size="small"
                          sx={{ borderRadius: 0 }}
                        >
                          <FormattedMessage id="market.buyNow" defaultMessage="Buy now" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  const openStarterPackListings = () => {
    updateMarketSearchParams((nextSearchParams) => {
      MARKET_SEARCH_PARAM_KEYS.forEach((key) => {
        nextSearchParams.delete(key);
      });
      nextSearchParams.set('browseCategory', 'ship_package');
      nextSearchParams.set('shipTrait', 'lti');
      nextSearchParams.set('packageItem', STARTER_PACK_GAME_DOWNLOAD_ITEM);
      nextSearchParams.set('sortBy', 'priceAsc');
    });
    openListingDrawer();
  };

  const handleHeroAction = (slide: MarketHomeHeroSlide) => {
    if (slide.shipId) {
      navigate(`/market/ships/${encodeURIComponent(String(slide.shipId))}`);
      return;
    }

    openListingDrawer();
  };

  const renderListingControls = () => (
    <MarketListingControls
      searchTerm={searchTerm}
      sortBy={sortBy}
      activeFilterCount={activeFilterCount}
      placeholder={intl.formatMessage({ id: 'market.searchPlaceholder', defaultMessage: 'Search products, ships, bundles...' })}
      onCommitSearch={commitMarketSearch}
      onOpenMobileFilters={openMobileFilterDrawer}
      onChangeSortBy={handleChangeMarketSort}
    />
  );

  const renderListingGrid = () => (
    <MarketListingGrid
      contentReady={listingDrawerContentReady}
      refreshing={refreshing}
      initialLoading={listingGridInitialLoading}
      visibleListingItems={visibleListingItems}
      ships={ships}
      cartQuantityByResourceId={cartQuantityByResourceId}
      pagination={pagination}
      page={page}
      rowsPerPage={rowsPerPage}
      isMobileListingDrawer={isMobileListingDrawer}
      listingDrawerOpen={listingDrawerOpen}
      mobileLoadingNextPage={mobileLoadingNextPage}
      mobileHasMoreListings={mobileHasMoreListings}
      infiniteSentinelRef={listingDrawerInfiniteSentinelRef}
      onOpenDetails={handleOpenDetails}
      onAddToCart={handleAddToCart}
      onBuyNow={handleBuyNow}
      onRemoveFromCart={removeFromCart}
      onUpdateQuantity={updateItemQuantity}
      onChangePage={handleChangeListingPage}
      onChangeRowsPerPage={handleChangeListingRowsPerPage}
    />
  );

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
        className='absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-x-hidden overflow-y-auto bg-slate-50 text-left text-slate-950 dark:bg-neutral-950 dark:text-white'
      >
        <style>
          {`
            :root {
              --market-manufacturer-logo-filter: none;
            }

            :root.dark {
              --market-manufacturer-logo-filter: brightness(0) invert(1);
            }

            .starter-pack-carousel {
              --starter-pack-card-active-width: min(420px, calc(100vw - 32px));
              --starter-pack-card-width: var(--starter-pack-card-active-width);
            }

            @media (min-width: 640px) {
              .starter-pack-carousel {
                --starter-pack-card-active-width: 500px;
              }
            }

            .starter-pack-card {
              width: var(--starter-pack-card-width);
              transition: width 260ms cubic-bezier(0.22, 1, 0.36, 1);
            }

            .starter-pack-title {
              opacity: 1;
              transform: translateY(0);
              transition: opacity 180ms ease-out, transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
            }

            @media (min-width: 640px) and (hover: hover) and (pointer: fine) {
              .starter-pack-carousel {
                --starter-pack-card-width: 220px;
              }

              .starter-pack-card:first-child {
                width: var(--starter-pack-card-active-width);
              }

              .starter-pack-carousel:has(.starter-pack-card:not(:first-child):hover) .starter-pack-card:first-child,
              .starter-pack-carousel:has(.starter-pack-card:not(:first-child):focus-visible) .starter-pack-card:first-child {
                width: var(--starter-pack-card-width);
              }

              .starter-pack-card:hover,
              .starter-pack-card:focus-visible {
                width: var(--starter-pack-card-active-width);
              }

              .starter-pack-title {
                opacity: 0;
                transform: translateY(12px);
              }

              .starter-pack-card:first-child .starter-pack-title {
                opacity: 1;
                transform: translateY(0);
              }

              .starter-pack-carousel:has(.starter-pack-card:not(:first-child):hover) .starter-pack-card:first-child .starter-pack-title,
              .starter-pack-carousel:has(.starter-pack-card:not(:first-child):focus-visible) .starter-pack-card:first-child .starter-pack-title {
                opacity: 0;
                transform: translateY(12px);
              }

              .starter-pack-card:hover .starter-pack-title,
              .starter-pack-card:focus-visible .starter-pack-title {
                opacity: 1;
                transform: translateY(0);
              }
            }

            @keyframes marketHeroCopyIn {
              from {
                opacity: 0;
                transform: translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }

            @keyframes marketHeroProgress {
              from {
                transform: scaleX(0);
              }
              to {
                transform: scaleX(1);
              }
            }

            .market-hero-section.is-hero-paused .market-hero-progress-fill {
              animation-play-state: paused;
            }

            .market-hero-progress-fill {
              animation: marketHeroProgress var(--market-hero-progress-duration, 6000ms) linear forwards;
            }

            .market-hero-progress-fill-complete {
              animation: none;
              transform: scaleX(1);
            }

            .market-role-marquee:hover .market-role-marquee-row {
              animation-play-state: paused;
            }

            .market-role-marquee-row {
              animation: marketRoleMarquee 512s linear infinite;
            }

            .market-role-marquee-row-reverse {
              animation-direction: reverse;
            }

            @keyframes marketRoleMarquee {
              from {
                transform: translateX(0);
              }
              to {
                transform: translateX(calc(-50% - 0.5rem));
              }
            }

            @media (prefers-reduced-motion: reduce) {
              .market-role-marquee {
                overflow-x: auto;
                -ms-overflow-style: none;
                scrollbar-width: none;
              }

              .market-role-marquee::-webkit-scrollbar {
                display: none;
              }

              .market-role-marquee-row {
                animation: none;
              }

              .market-hero-progress-fill {
                animation: none;
                transform: scaleX(1);
              }
            }
          `}
        </style>
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

        <Box
          aria-hidden={listingDrawerOpen}
          sx={{
            visibility: listingDrawerOpen ? 'hidden' : 'visible',
            pointerEvents: listingDrawerOpen ? 'none' : 'auto',
          }}
        >
          <FloatingDiscordButton />

          <Button
            variant="contained"
            onClick={() => openListingDrawer()}
            sx={{
              position: 'fixed',
              right: 0,
              top: '30%',
              transform: 'translateY(-50%)',
              zIndex: 1200,
              width: 48,
              minWidth: 42,
              minHeight: 156,
              borderRadius: 0,
              px: 0,
              py: 1.5,
              display: { xs: 'none', md: 'inline-flex' },
              flexDirection: 'column',
              gap: 1,
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              letterSpacing: 0,
              '& .market-listing-button-icon': {
                writingMode: 'horizontal-tb',
              },
            }}
          >
            <FormattedMessage id="market.openListings" defaultMessage="Browse all products" />
            {/* <span className="market-listing-button-icon">
                <ListFilter className="h-4 w-4" />
              </span> */}
          </Button>

          <div className='relative mx-auto flex min-h-full w-full max-w-[1480px] flex-col gap-8 px-4 py-5 md:px-10 md:py-6'>
            <Box sx={{ display: 'flex', justifyContent: 'end', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              {/* <div className='flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400'>
              <span className='border border-sky-200 bg-sky-50 px-2 py-1 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200'>
                <FormattedMessage id="market.home.utilityLabel" defaultMessage="Citizens Hub Market" />
              </span>
            </div> */}
              <div className='flex items-center gap-2 sm:gap-3'>
                <Link to="/orders" className='text-sm text-slate-600 transition hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'>
                  <FormattedMessage id="market.myOrders" defaultMessage="My Orders" />
                </Link>
                <Link to="/tickets" className='text-sm text-slate-600 transition hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'>
                  <FormattedMessage id="market.myTickets" defaultMessage="My Tickets" />
                </Link>
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
            </Box>

            <section
              ref={heroSectionRef}
              className='market-hero-section relative min-h-[clamp(400px,calc(100dvh-250px),620px)] overflow-hidden border border-gray-200 bg-slate-950 shadow-sm dark:border-gray-800'
              onMouseEnter={handleHeroMouseEnter}
              onMouseLeave={handleHeroMouseLeave}
              onFocus={handleHeroFocus}
              onBlur={handleHeroBlur}
            >
              <div className='absolute inset-0 bg-slate-950'>
                {heroSlides.map((slide, index) => {
                  const active = index === activeHeroSlideIndex;

                  return (
                    <div
                      key={`${slide.id || index}:${slide.mediaType}:${slide.mediaUrl}`}
                      aria-hidden={!active}
                      className={`absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${active ? 'opacity-100' : 'opacity-0'}`}
                    >
                      <MarketHeroMedia active={active} slide={slide} />
                    </div>
                  );
                })}
              </div>
              <div className='absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.86)_0%,rgba(2,6,23,0.60)_40%,rgba(2,6,23,0.18)_78%,rgba(2,6,23,0.08)_100%)]' />
              <div className='absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-slate-950/88 via-slate-950/42 to-transparent' />

              {heroSlides.length > 1 && (
                <>
                  <IconButton
                    onClick={goToPreviousHeroSlide}
                    sx={{
                      position: 'absolute',
                      left: 16,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      zIndex: 20,
                      display: { xs: 'none', md: 'inline-flex' },
                      color: 'white',
                      bgcolor: 'rgba(0,0,0,0.34)',
                      borderRadius: 0,
                      '&:hover': { bgcolor: 'rgba(0,0,0,0.58)' },
                    }}
                    aria-label={intl.formatMessage({ id: 'common.previous', defaultMessage: 'Previous' })}
                  >
                    <ChevronLeft className='h-5 w-5' />
                  </IconButton>
                  <IconButton
                    onClick={goToNextHeroSlide}
                    sx={{
                      position: 'absolute',
                      right: 16,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      zIndex: 20,
                      display: { xs: 'none', md: 'inline-flex' },
                      color: 'white',
                      bgcolor: 'rgba(0,0,0,0.34)',
                      borderRadius: 0,
                      '&:hover': { bgcolor: 'rgba(0,0,0,0.58)' },
                    }}
                    aria-label={intl.formatMessage({ id: 'common.next', defaultMessage: 'Next' })}
                  >
                    <ChevronRight className='h-5 w-5' />
                  </IconButton>
                </>
              )}

              {heroSlides.length > 1 && (
                <div className='absolute bottom-4 right-4 z-20 hidden gap-1.5 md:flex'>
                  {heroSlides.map((slide, index) => {
                    const translation = getMarketHeroTranslation(slide, locale as MarketHomeLocaleCode);
                    const active = index === activeHeroSlideIndex;
                    const handleHeroDotKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        goToHeroSlide(index);
                      }
                    };

                    return (
                      <div
                        key={slide.id || index}
                        role="button"
                        tabIndex={0}
                        onClick={() => goToHeroSlide(index)}
                        onKeyDown={handleHeroDotKeyDown}
                        aria-label={translation.title || translation.eyebrow || `Hero ${index + 1}`}
                        className={`relative h-2.5 cursor-pointer overflow-hidden border border-white/50 transition-[width,background-color] ${active ? 'w-10 bg-white/25' : 'w-2.5 bg-white/30 hover:bg-white/70'}`}
                      >
                        {active && (
                          <span
                            key={`${activeHeroSlideIndex}:${heroProgressAnimationKey}`}
                            className={`market-hero-progress-fill absolute inset-y-0 left-0 w-full origin-left bg-white ${heroAutoplayActive ? '' : 'market-hero-progress-fill-complete'}`}
                            style={{ '--market-hero-progress-duration': `${MARKET_HERO_AUTOPLAY_INTERVAL_MS}ms` } as React.CSSProperties}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                key={activeHeroSlide?.id || activeHeroSlideIndex}
                className='relative z-10 flex min-h-[clamp(400px,calc(100dvh-250px),620px)] px-5 py-6 sm:px-6 md:px-10 md:py-10 motion-reduce:animate-none'
              >
                <div className='flex max-w-3xl animate-[marketHeroCopyIn_360ms_ease-out] flex-col justify-end motion-reduce:animate-none'>
                  <div className='text-xs font-semibold uppercase tracking-[0.18em] text-sky-200'>
                    {activeHeroTranslation.eyebrow}
                  </div>
                  <Typography
                    component="h1"
                    sx={{
                      mt: 1.5,
                      maxWidth: 820,
                      fontSize: { xs: 32, sm: 42, md: 58 },
                      lineHeight: 1,
                      fontWeight: 900,
                      letterSpacing: 0,
                      textTransform: 'uppercase',
                      color: 'white',
                    }}
                  >
                    {activeHeroTranslation.title}
                  </Typography>
                  {activeHeroTranslation.subtitle && (
                    <Typography sx={{ mt: 2, maxWidth: 680, color: 'rgba(255,255,255,0.80)', fontSize: { xs: 15, md: 18 }, lineHeight: 1.65 }}>
                      {activeHeroTranslation.subtitle}
                    </Typography>
                  )}

                  <div className='mt-5 flex flex-wrap gap-3'>
                    <Button
                      variant="contained"
                      endIcon={<ArrowRight className='h-4 w-4' />}
                      onClick={() => handleHeroAction(activeHeroSlide)}
                      sx={{ borderRadius: 0 }}
                    >
                      {activeHeroTranslation.ctaLabel}
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<ListFilter className='h-4 w-4' />}
                      onClick={() => openListingDrawer()}
                      sx={{ borderRadius: 0, borderColor: 'rgba(255,255,255,0.55)', color: 'white', '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.08)' } }}
                    >
                      <FormattedMessage id="market.openListings" defaultMessage="Browse all products" />
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {marketHomePromotion && marketHomePromotionHero ? (
              <MarketHomePromotionBanner
                promotion={marketHomePromotion}
                hero={marketHomePromotionHero}
                imageUrl={marketHomePromotionImageUrl}
              />
            ) : null}

            <MarketHomeSearchBox
              value={searchTerm}
              placeholder={intl.formatMessage({ id: 'market.searchPlaceholder', defaultMessage: 'Search products, ships, bundles...' })}
              onSearch={commitHomeMarketSearch}
            />

            {renderCategoryBrowseSection()}

            <MarketCcuRoutePlanner ships={ships} />

            {renderStarterPackSection()}

            <section className='grid gap-4'>
              <div className='grid gap-4 md:grid-cols-3'>
                <div className='border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-neutral-900'>
                  <ShieldOutlined color="primary" />
                  <Typography sx={{ mt: 1.5, fontWeight: 800, color: 'text.primary' }}>
                    <FormattedMessage id="market.trust.title" defaultMessage="Own stock, no third-party sellers involved" />
                  </Typography>
                  <Typography sx={{ mt: 1, color: 'text.secondary', fontSize: 14, lineHeight: 1.7 }}>
                    <FormattedMessage
                      id="market.trust.description"
                      defaultMessage="All items come directly from our own stock, with no third-party sellers involved, and are fully covered by our customer protection policy."
                    />
                  </Typography>
                </div>
                <div className='border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-neutral-900'>
                  <LocalShippingOutlined color="primary" />
                  <Typography sx={{ mt: 1.5, fontWeight: 800, color: 'text.primary' }}>
                    <FormattedMessage id="market.trust.deliveryWithin24h" defaultMessage="Guaranteed delivery within 24 hours." />
                  </Typography>
                  <Typography sx={{ mt: 1, color: 'text.secondary', fontSize: 14, lineHeight: 1.7 }}>
                    <FormattedMessage id="market.trust.deliveryWindow" defaultMessage="Usually we can deliver within 30 minutes between 10:00 and 00:00 Hong Kong time." />
                  </Typography>
                </div>
                <div className='border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-neutral-900'>
                  <SupportAgentOutlined color="primary" />
                  <Typography sx={{ mt: 1.5, fontWeight: 800, color: 'text.primary' }}>
                    <FormattedMessage id="market.support.title" defaultMessage="Order support" />
                  </Typography>
                  <Typography sx={{ mt: 1, color: 'text.secondary', fontSize: 14, lineHeight: 1.7 }}>
                    {renderProgressSupport()}
                  </Typography>
                </div>
              </div>
            </section>

            {renderMarketReviewsSection()}

            {renderFeaturedAccountsSection()}

            {renderManufacturerBrowseSection()}

            {renderShipFocusBrowseSection()}

            {renderOtherGearSection()}

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
                pb: 2,
                color: 'text.secondary',
              }}
            >
              <Link to="/terms-of-service" className='text-sm text-slate-500 transition hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'>
                <FormattedMessage id="navigate.terms" defaultMessage="Terms of Service" />
              </Link>
              <span className='text-slate-500'>|</span>
              <Link to="/refund-policy" className='text-sm text-slate-500 transition hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'>
                <FormattedMessage id="navigate.refund" defaultMessage="Refund Policy" />
              </Link>
              <span className='text-slate-500'>|</span>
              <Link to="/privacy" className='text-sm text-slate-500 transition hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'>
                <FormattedMessage id="navigate.privacy" defaultMessage="Privacy Policy" />
              </Link>
            </Box>
          </div>
        </Box>

        <Drawer
          anchor="right"
          open={mobileFilterDrawerOpen}
          onClose={closeMobileFilterDrawer}
          PaperProps={{
            sx: {
              width: 'min(92vw, 420px)',
              ...marketDrawerPaperSx,
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              <FormattedMessage id="admin.bi.filter" defaultMessage="Filter" />
            </Typography>
            <IconButton onClick={closeMobileFilterDrawer} aria-label={intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}>
              <X className="h-5 w-5" />
            </IconButton>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2 }}>
            {renderFilterPanel()}
            {renderAccountMarketPanel({ compact: true, onNavigate: closeMobileFilterDrawer })}
          </Box>
        </Drawer>

        <Drawer
          anchor="right"
          open={listingDrawerOpen}
          onClose={() => closeListingDrawer({ clearFilters: true })}
          ModalProps={{ keepMounted: false }}
          slotProps={{
            transition: {
              onEnter: handleListingDrawerEnter,
              onEntered: handleListingDrawerEntered,
              onExited: handleListingDrawerExited,
            },
          }}
          PaperProps={{
            sx: {
              width: '100vw',
              maxWidth: '100vw',
              height: '100%',
              ...marketDrawerPaperSx,
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                <FormattedMessage id="market.drawer.title" defaultMessage="Market listings" />
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <FormattedMessage
                  id="market.drawer.summary"
                  defaultMessage="{total} listings"
                  values={{ total: pagination.total }}
                />
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<FilterListOutlined />}
                onClick={openMobileFilterDrawer}
                sx={{ display: { xs: 'inline-flex', lg: 'none' }, borderRadius: 0 }}
              >
                <FormattedMessage id="admin.bi.filter" defaultMessage="Filter" />
              </Button>
              <Tooltip title={intl.formatMessage({ id: 'market.openCart', defaultMessage: 'Open cart' })}>
                <IconButton
                  onClick={openCart}
                  aria-label={intl.formatMessage({ id: 'market.openCart', defaultMessage: 'Open cart' })}
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
                    <ShoppingCart className="h-5 w-5" />
                  </Badge>
                </IconButton>
              </Tooltip>
              <IconButton onClick={() => closeListingDrawer({ clearFilters: true })} aria-label={intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}>
                <X className="h-5 w-5" />
              </IconButton>
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '260px minmax(0,1fr)' }, minHeight: 0, flex: 1, backgroundColor: marketDrawerBackground }}>
            {isListingDrawerSidebarVisible && (
              <Box sx={{ borderRight: '1px solid', borderColor: 'divider', p: 2, overflowY: 'auto' }}>
                {listingDrawerContentReady && (
                  <Stack spacing={2}>
                    {renderFilterPanel()}
                    {renderAccountMarketPanel({ compact: true })}
                  </Stack>
                )}
              </Box>
            )}
            <Box ref={listingDrawerContentRef} sx={{ minWidth: 0, minHeight: 0, overflowY: 'auto' }}>
              {renderListingControls()}
              {renderListingGrid()}
            </Box>
          </Box>
        </Drawer>

        <CartDrawer
          open={cartOpen}
          cart={cart}
          ships={ships}
          onClose={closeCart}
          onRemoveFromCart={removeFromCart}
          onReplaceCartItem={replaceCartItem}
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
