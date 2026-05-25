import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  MenuItem,
  Button,
  Divider,
  Drawer,
  Stack,
  TablePagination,
  Tooltip,
  Autocomplete,
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
  Ship,
} from '@/types';
import { ArrowRight, ChevronLeft, ChevronRight, ListFilter, Plus, ShoppingCart, Minus, X, ChevronsRight } from 'lucide-react';
import { useAccountMarketData, useApi, useAuthApi, useMarketData, useMarketHomeSettings } from '@/hooks';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Helmet } from 'react-helmet';
import { useCartStore } from '@/hooks/useCartStore';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { selectUsersHangarItems } from '@/store/upgradesStore';
import { useLocale } from '@/contexts/LocaleContext';
import { buildMarketCartItem, buildMarketResource, isLtiShipListing } from '@/components/marketItemDisplay';
import Crawler from '@/components/Crawler';
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
  resolveLowestCcuVariant,
} from './marketUtils';
import {
  formatMarketDiscount,
  formatMarketCreditResourceName,
  formatMarketPriceFrom,
  formatPackageContentsSummary,
  formatUsdPrice,
  getMarketBrowseCategoryLabel,
  getMarketItemTypeLabel,
} from './marketI18n';
import { getMarketItemDisplayName, getMarketItemSummary } from './marketDisplayI18n';
import { getMarketImageDisplayUrl } from '@/utils/marketImages';
import { getDirectCheckoutPath, saveDirectCheckoutItems } from '@/utils/directCheckout';
import { findShipByIdOrName, getShipDisplayName, getShipManufacturerDisplayName, matchesShipNameQuery } from '@/utils/shipDisplay';
import { getShipSlideshowImage, getShipThumbLarge, getShipThumbSmall } from '@/utils/shipImage';
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

type MarketItemFilterOption = 'all' | MarketItemType | MarketBrowseCategory;

type MarketPageSearchState = {
  searchTerm: string;
  selectedItemFilter: MarketItemFilterOption;
  selectedShipTraitFilter: MarketShipTraitFilter | 'all';
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
const MARKET_SEARCH_DEBOUNCE_MS = 300;
const MARKET_HERO_AUTOPLAY_INTERVAL_MS = 4000;
const COUPON_COUNTDOWN_INTERVAL_MS = 1000;
const MARKET_SEARCH_PARAM_KEYS = ['search', 'itemType', 'browseCategory', 'tag', 'shipTrait', 'manufacturerId', 'packageItem', 'sortBy', 'page', 'limit'] as const;
const STARTER_PACK_GAME_DOWNLOAD_ITEM = 'Star Citizen Digital Download';
const MARKET_PLANNER_MIN_START_MSRP_CENTS = 2_000;
const MARKET_PLANNER_MAX_TARGET_MSRP_CENTS = 100_000;
const MARKET_PLANNER_ROUTE_NODE_GAP_X = 420;
const MARKET_PLANNER_ROUTE_NODE_Y = 120;
const CCU_PLANNER_STORAGE_KEY = 'ccu-planner-data';
const CCU_PLANNER_WORKSPACE_VERSION = 2;
const VALID_MARKET_ITEM_TYPE_FILTERS = new Set<MarketItemType>(['ccu', 'credit']);
const VALID_MARKET_BROWSE_CATEGORY_FILTERS = new Set<MarketBrowseCategory>(['standalone_ship', 'ship_package', 'paint', 'other']);
const VALID_MARKET_SHIP_TRAIT_FILTERS = new Set<MarketShipTraitFilter>(['oc', 'non_oc', 'lti']);
const VALID_MARKET_SORT_MODES = new Set<MarketSortMode>(['recommended', 'newest', 'priceDesc', 'priceAsc']);
const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

const MARKET_HOME_LOCALE_FALLBACKS: MarketHomeLocaleCode[] = ['en'];

const DEFAULT_MARKET_HERO_SLIDES: MarketHomeHeroSlide[] = [
  {
    id: 'default-market-hero',
    enabled: true,
    mediaType: 'video',
    mediaUrl: '/videos/bg.mp4',
    posterUrl: '',
    shipId: null,
    linkMode: 'ship',
    translations: {
      en: {
        eyebrow: 'CitizensHub Market',
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
    eyebrow: resolveText('eyebrow', 'CitizensHub Market'),
    title: resolveText('title', 'Star Citizen Market'),
    subtitle: resolveText('subtitle', ''),
    ctaLabel: resolveText('ctaLabel', 'View details'),
  };
}

function renderMarketHeroMedia(slide: MarketHomeHeroSlide, eager = false) {
  if (slide.mediaType === 'video') {
    return (
      <video
        className='absolute inset-0 h-full w-full object-cover'
        src={slide.mediaUrl}
        poster={slide.posterUrl || undefined}
        muted
        autoPlay
        loop
        playsInline
      />
    );
  }

  return (
    <img
      className='absolute inset-0 h-full w-full object-cover'
      src={slide.mediaUrl}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}

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

const Market: React.FC = () => {
  const intl = useIntl();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const { user } = useSelector((state: RootState) => state.user);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const listingDrawerContentRef = useRef<HTMLDivElement | null>(null);
  const starterPackScrollerRef = useRef<HTMLDivElement | null>(null);
  const starterPackScrollFrameRef = useRef<number | null>(null);
  const starterPackVisibilityFrameRef = useRef<number | null>(null);
  const starterPackRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const lastCommittedSearchRef = useRef('');
  const autoOpenedListingQueryRef = useRef<string | null>(null);
  const suppressListingAutoOpenRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { cart, cartOpen, addToCart, removeFromCart, openCart, closeCart, updateItemQuantity } = useCartStore();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  const [couponPopupDismissed, setCouponPopupDismissed] = useState(false);
  const [couponNow, setCouponNow] = useState(Date.now());
  const [mobileFilterDrawerOpen, setMobileFilterDrawerOpen] = useState(false);
  const [listingDrawerOpen, setListingDrawerOpen] = useState(false);
  const [activeStarterPackSkuId, setActiveStarterPackSkuId] = useState<string | null>(null);
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const [heroAutoplayPaused, setHeroAutoplayPaused] = useState(false);
  const [plannerStartShipId, setPlannerStartShipId] = useState<number | ''>('');
  const [plannerTargetShipId, setPlannerTargetShipId] = useState<number | ''>('');
  const [plannerIncludeHangarCcus, setPlannerIncludeHangarCcus] = useState(false);
  const [plannerExtensionModalOpen, setPlannerExtensionModalOpen] = useState(false);
  // const [showAlert, setShowAlert] = useState(import.meta.env.VITE_PUBLIC_ENV !== 'development');
  const [showAlert, setShowAlert] = useState(false);
  const autoClaimAttemptedRef = useRef<string | null>(null);
  const { data: couponPreview, mutate: mutateCouponPreview } = useAuthApi<NewUserCouponPreview>(
    user.token ? '/api/user/new-user-coupon' : null,
  );
  const selectedHangarItems = useSelector(selectUsersHangarItems);
  const plannerHangarItems = useMemo<HangarItem[]>(() => selectedHangarItems.ccus.map((upgrade, index) => ({
    id: index,
    name: upgrade.name,
    type: 'ccu',
    fromShip: upgrade.parsed.from,
    toShip: upgrade.parsed.to,
    price: upgrade.value,
  })), [selectedHangarItems.ccus]);
  const {
    searchTerm,
    selectedItemFilter,
    selectedShipTraitFilter,
    selectedManufacturerId,
    packageItems,
    sortBy,
    page,
    rowsPerPage,
  } = useMemo(() => parseMarketPageSearchState(searchParams), [searchParams]);
  const [searchInput, setSearchInput] = useState(() => searchTerm);
  const { data: marketHomeSettingsResponse } = useMarketHomeSettings();
  const showsShipTraitFilters = selectedItemFilter === 'all'
    || selectedItemFilter === 'standalone_ship'
    || selectedItemFilter === 'ship_package';
  const showsManufacturerFilter = showsShipTraitFilters || selectedItemFilter === 'ccu';
  const normalizedSearchParams = useMemo(() => buildMarketPageSearchParams(searchParams, {
    searchTerm,
    selectedItemFilter,
    selectedShipTraitFilter: showsShipTraitFilters ? selectedShipTraitFilter : 'all',
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
    selectedShipTraitFilter,
    showsManufacturerFilter,
    showsShipTraitFilters,
    sortBy,
  ]);
  const hasActiveMarketSearchParams = useMemo(() => Boolean(
    searchTerm.trim()
    || selectedItemFilter !== 'all'
    || (showsShipTraitFilters && selectedShipTraitFilter !== 'all')
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
    selectedManufacturerId,
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

    if (listingDrawerOpen || autoOpenedListingQueryRef.current === normalizedKey) {
      return;
    }

    autoOpenedListingQueryRef.current = normalizedKey;
    setListingDrawerOpen(true);
  }, [hasActiveMarketSearchParams, listingDrawerOpen, normalizedSearchParams, searchParams]);

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

  const clearMarketSearchParams = useCallback((options?: { keepDrawerClosed?: boolean }) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    MARKET_SEARCH_PARAM_KEYS.forEach((key) => {
      nextSearchParams.delete(key);
    });

    const nextQueryKey = nextSearchParams.toString();
    lastCommittedSearchRef.current = '';
    autoOpenedListingQueryRef.current = options?.keepDrawerClosed ? nextQueryKey : null;
    suppressListingAutoOpenRef.current = Boolean(options?.keepDrawerClosed);
    setSearchInput('');

    if (nextSearchParams.toString() !== searchParams.toString()) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
      packageItems,
      manufacturerIds,
      sortBy,
      page,
      limit: rowsPerPage,
    };
  }, [
    page,
    packageItems,
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
  const {
    ships: starterPackShips,
    listingItems: starterPackItems,
    loading: starterPackLoading,
  } = useMarketData({
    browseCategories: ['ship_package'],
    shipTraits: ['lti'],
    packageItems: [STARTER_PACK_GAME_DOWNLOAD_ITEM],
    sortBy: 'priceAsc',
    page: 0,
    limit: 12,
  });
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

  useEffect(() => {
    if (starterPackItems.length === 0) {
      setActiveStarterPackSkuId(null);
      return;
    }

    setActiveStarterPackSkuId((currentSkuId) => (
      currentSkuId && starterPackItems.some((item) => item.skuId === currentSkuId)
        ? currentSkuId
        : starterPackItems[0].skuId
    ));
  }, [starterPackItems]);

  useLayoutEffect(() => {
    const previousRects = starterPackRectsRef.current;
    const scroller = starterPackScrollerRef.current;
    if (!scroller) {
      starterPackRectsRef.current = new Map();
      return;
    }

    const cards = Array.from(scroller.querySelectorAll<HTMLElement>('[data-starter-pack-sku-id]'));
    const nextRects = new Map<string, DOMRect>();

    cards.forEach((card) => {
      const skuId = card.dataset.starterPackSkuId;
      if (!skuId) {
        return;
      }

      const nextRect = card.getBoundingClientRect();
      nextRects.set(skuId, nextRect);

      const previousRect = previousRects.get(skuId);
      if (!previousRect) {
        return;
      }

      const deltaX = previousRect.left - nextRect.left;
      const scaleX = nextRect.width > 0 ? previousRect.width / nextRect.width : 1;
      if (Math.abs(deltaX) < 0.5 && Math.abs(scaleX - 1) < 0.002) {
        return;
      }

      card.style.transformOrigin = 'left center';
      card.style.transform = `translateX(${deltaX}px) scaleX(${scaleX})`;
      card.style.transition = 'transform 0s';

      window.requestAnimationFrame(() => {
        card.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)';
        card.style.transform = '';
      });
    });

    starterPackRectsRef.current = nextRects;
  }, [activeStarterPackSkuId, starterPackItems]);

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
  const plannerRoute = useMemo(() => {
    if (!plannerStartShip || !plannerTargetShip || plannerTargetShip.msrp <= plannerStartShip.msrp) {
      return null;
    }

    return buildCurrentMarketRoute({
      startShip: plannerStartShip,
      targetShip: plannerTargetShip,
      ships,
      ccus,
      hangarItems: plannerIncludeHangarCcus ? plannerHangarItems : [],
      marketGroups: marketRouteData?.items || [],
    });
  }, [ccus, marketRouteData?.items, plannerHangarItems, plannerIncludeHangarCcus, plannerStartShip, plannerTargetShip, ships]);
  const plannerRouteMarketEdges = useMemo(
    () => plannerRoute?.edges.filter((edge) => edge.sourceType === CcuSourceType.THIRD_PARTY && edge.listing) || [],
    [plannerRoute],
  );
  const plannerHangarEdgeCount = useMemo(
    () => plannerRoute?.edges.filter((edge) => edge.sourceType === CcuSourceType.HANGER).length || 0,
    [plannerRoute],
  );
  const plannerRoutePurchasableCcuCount = useMemo(
    () => plannerRoute?.edges.filter((edge) => edge.sourceType !== CcuSourceType.HANGER).length || 0,
    [plannerRoute],
  );
  const plannerOfficialCashSpend = useMemo(
    () => Number((plannerRoute?.edges.reduce((sum, edge) => (
      edge.sourceType === CcuSourceType.AVAILABLE_WB || edge.sourceType === CcuSourceType.OFFICIAL_WB
        ? sum + edge.cost
        : sum
    ), 0) || 0).toFixed(2)),
    [plannerRoute],
  );
  const plannerOfficialStoreCreditSpend = useMemo(
    () => Number((plannerRoute?.edges.reduce((sum, edge) => (
      edge.sourceType === CcuSourceType.OFFICIAL
        ? sum + edge.cost
        : sum
    ), 0) || 0).toFixed(2)),
    [plannerRoute],
  );
  const plannerMarketListingPrice = useMemo(
    () => Number(plannerRouteMarketEdges.reduce((sum, edge) => sum + edge.cost, 0).toFixed(2)),
    [plannerRouteMarketEdges],
  );
  const plannerHangarSpend = useMemo(
    () => Number((plannerRoute?.edges.reduce((sum, edge) => (
      edge.sourceType === CcuSourceType.HANGER
        ? sum + edge.cost
        : sum
    ), 0) || 0).toFixed(2)),
    [plannerRoute],
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
    () => plannerRoute && plannerStartShip && plannerTargetShip
      ? Number(Math.max(0, ((plannerTargetShip.msrp - plannerStartShip.msrp) / 100) - plannerOrderTotal).toFixed(2))
      : 0,
    [plannerOrderTotal, plannerRoute, plannerStartShip, plannerTargetShip],
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

    if (!plannerRoute || !plannerStartShip) {
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
  }, [plannerOrderTotal, plannerRoute, plannerStartShip, plannerTargetShip, ships, targetShipListingResponse?.items]);
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

  useEffect(() => {
    setActiveHeroIndex((current) => Math.min(current, Math.max(heroSlides.length - 1, 0)));
  }, [heroSlides.length]);

  const goToPreviousHeroSlide = useCallback(() => {
    setActiveHeroIndex((current) => (current <= 0 ? heroSlides.length - 1 : current - 1));
  }, [heroSlides.length]);

  const goToNextHeroSlide = useCallback(() => {
    setActiveHeroIndex((current) => (current >= heroSlides.length - 1 ? 0 : current + 1));
  }, [heroSlides.length]);

  useEffect(() => {
    if (heroSlides.length <= 1 || heroAutoplayPaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      goToNextHeroSlide();
    }, MARKET_HERO_AUTOPLAY_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [goToNextHeroSlide, heroAutoplayPaused, heroSlides.length]);

  const handleHeroBlur = useCallback((event: React.FocusEvent<HTMLElement>) => {
    const nextFocusedElement = event.relatedTarget;
    if (!(nextFocusedElement instanceof globalThis.Node) || !event.currentTarget.contains(nextFocusedElement)) {
      setHeroAutoplayPaused(false);
    }
  }, []);

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

  const activeFilterCount = useMemo(() => {
    let count = 0;

    if (selectedItemFilter !== 'all') {
      count += 1;
    }
    if (showsShipTraitFilters && selectedShipTraitFilter !== 'all') {
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
    selectedManufacturerId,
    selectedShipTraitFilter,
    packageItems.length,
    showsManufacturerFilter,
    showsShipTraitFilters,
    sortBy,
  ]);

  useEffect(() => {
    pageContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    listingDrawerContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [marketQuery]);

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
    navigate(getDirectCheckoutPath(), {
      state: {
        directCheckoutItems,
        ships,
      },
    });
  };

  const validateMarketRouteListingStock = (edges: MarketRouteEdge[]) => {
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
  };

  const validatePlannerCartStock = (items: PlannerRoutePurchaseItems['cartItems']) => {
    for (const item of items) {
      const existingQuantity = cart.find((cartItem: CartItemType) => cartItem.resource.id === item.resource.id)?.quantity || 0;
      if (existingQuantity + item.quantity > item.availableStock) {
        return false;
      }
    }

    return true;
  };

  const buildPlannerRoutePurchaseItems = (): PlannerRoutePurchaseItems | null => {
    if (!plannerRoute || !plannerStartShip || !plannerTargetShip) {
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
  };

  const handlePlanRouteCheckout = () => {
    const purchaseItems = buildPlannerRoutePurchaseItems();
    if (!purchaseItems || !plannerRoute) {
      return;
    }

    if (!saveMarketRouteToPlannerWorkspace(plannerRoute, intl.locale)) {
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
  };

  const handlePlanRouteAddToCart = () => {
    const purchaseItems = buildPlannerRoutePurchaseItems();
    if (!purchaseItems || !plannerRoute) {
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

    if (!saveMarketRouteToPlannerWorkspace(plannerRoute, intl.locale)) {
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

            if (nextShowsShipTraitFilters && selectedShipTraitFilter !== 'all') {
              nextSearchParams.set('shipTrait', selectedShipTraitFilter);
            }

            if (nextShowsManufacturerFilter && selectedManufacturerId) {
              nextSearchParams.set('manufacturerId', String(selectedManufacturerId));
            }
          });
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
                    nextSearchParams.delete('packageItem');
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
                <FormControlLabel control={<Radio size="small" />} value="oc" label={intl.formatMessage({ id: 'market.tag.oc', defaultMessage: 'OC' })} />
                <FormControlLabel control={<Radio size="small" />} value="non_oc" label={intl.formatMessage({ id: 'market.tag.nonOc', defaultMessage: 'Non-OC' })} />
                <FormControlLabel control={<Radio size="small" />} value="lti" label={intl.formatMessage({ id: 'market.tag.lti', defaultMessage: 'LTI' })} />
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
  );
  const renderAccountMarketPanel = (options?: { compact?: boolean; onNavigate?: () => void }) => {
    const compact = options?.compact ?? false;
    const onNavigate = options?.onNavigate;

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

          {!compact && (
            featuredAccountItems[0] ? (
              <Link
                to={`/account-market/${encodeURIComponent(featuredAccountItems[0].skuId)}`}
                onClick={onNavigate}
                className='flex gap-3 border border-gray-200 p-3 transition hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600'
              >
                <img
                  src={getMarketImageDisplayUrl(
                    featuredAccountItems[0].imageUrl || featuredAccountItems[0].entries.find((entry) => entry.imageUrl)?.imageUrl || '/imgs/credit.webp',
                    { ships, variant: 'thumbLarge' },
                  )}
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
            )
          )}

          <Button component={Link} to={getAccountMarketListPath()} onClick={onNavigate} variant="contained" fullWidth sx={{ borderRadius: 0 }}>
            <FormattedMessage id="accountMarket.panel.cta" defaultMessage="Browse Accounts" />
          </Button>
        </div>
      </Box>
    );
  };

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

  const captureStarterPackRects = () => {
    const scroller = starterPackScrollerRef.current;
    if (!scroller) {
      starterPackRectsRef.current = new Map();
      return;
    }

    starterPackRectsRef.current = new Map(
      Array.from(scroller.querySelectorAll<HTMLElement>('[data-starter-pack-sku-id]'))
        .flatMap((card) => {
          const skuId = card.dataset.starterPackSkuId;
          return skuId ? [[skuId, card.getBoundingClientRect()] as const] : [];
        }),
    );
  };

  const setActiveStarterPack = (skuId: string) => {
    if (activeStarterPackSkuId === skuId) {
      return;
    }

    captureStarterPackRects();
    setActiveStarterPackSkuId(skuId);
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
      const edgePadding = 16;

      if (cardRect.left < scrollerRect.left + edgePadding) {
        scroller.scrollBy({
          left: cardRect.left - scrollerRect.left - edgePadding,
          behavior: 'smooth',
        });
        return;
      }

      if (cardRect.right > scrollerRect.right - edgePadding) {
        scroller.scrollBy({
          left: cardRect.right - scrollerRect.right + edgePadding,
          behavior: 'smooth',
        });
      }
    });
  };

  const activateStarterPackFromPointer = (skuId: string) => {
    setActiveStarterPack(skuId);
    ensureStarterPackVisible(skuId);
  };

  const syncActiveStarterPackFromScroll = () => {
    const scroller = starterPackScrollerRef.current;
    if (!scroller) {
      return;
    }

    const cards = Array.from(scroller.querySelectorAll<HTMLElement>('[data-starter-pack-sku-id]'));
    if (cards.length === 0) {
      return;
    }

    const scrollerRect = scroller.getBoundingClientRect();
    const scrollerCenter = scrollerRect.left + scrollerRect.width / 2;
    const closestCard = cards.reduce((closest, card) => {
      const cardRect = card.getBoundingClientRect();
      const cardCenter = cardRect.left + cardRect.width / 2;
      const distance = Math.abs(cardCenter - scrollerCenter);
      return distance < closest.distance ? { card, distance } : closest;
    }, {
      card: cards[0],
      distance: Number.POSITIVE_INFINITY,
    });
    const nextSkuId = closestCard.card.dataset.starterPackSkuId || null;

    if (nextSkuId) {
      setActiveStarterPack(nextSkuId);
    }
  };

  const handleStarterPackScroll = () => {
    if (starterPackScrollFrameRef.current != null) {
      return;
    }

    starterPackScrollFrameRef.current = window.requestAnimationFrame(() => {
      starterPackScrollFrameRef.current = null;
      syncActiveStarterPackFromScroll();
    });
  };

  useEffect(() => () => {
    if (starterPackScrollFrameRef.current != null) {
      window.cancelAnimationFrame(starterPackScrollFrameRef.current);
    }
    if (starterPackVisibilityFrameRef.current != null) {
      window.cancelAnimationFrame(starterPackVisibilityFrameRef.current);
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
          onScroll={handleStarterPackScroll}
          className='mt-5 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        >
          {starterPackItems.map((item) => {
            const visual = getStarterPackVisual(item);
            const displayName = getMarketItemDisplayName(intl, item, ships);
            const availableStock = getAvailableStock(item);
            const isActive = activeStarterPackSkuId === item.skuId;

            return (
              <div
                key={item.skuId}
                data-starter-pack-sku-id={item.skuId}
                onClick={() => handleOpenDetails(item)}
                onMouseEnter={() => {
                  if (!isActive) {
                    activateStarterPackFromPointer(item.skuId);
                  }
                }}
                onFocus={() => {
                  if (!isActive) {
                    activateStarterPackFromPointer(item.skuId);
                  }
                }}
                tabIndex={0}
                role="button"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleOpenDetails(item);
                  }
                }}
                className={`relative h-[300px] shrink-0 cursor-pointer overflow-hidden bg-neutral-900 text-left text-white outline-none [will-change:transform] focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-[360px] ${isActive ? 'w-[420px] sm:w-[500px]' : 'w-[200px] sm:w-[220px]'}`}
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
                  <div className={`max-w-[360px] text-base font-black leading-tight transition duration-300 sm:text-xl ${isActive ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}>
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

  const openManufacturerListings = (manufacturerId: number) => {
    updateMarketSearchParams((nextSearchParams) => {
      MARKET_SEARCH_PARAM_KEYS.forEach((key) => {
        nextSearchParams.delete(key);
      });
      nextSearchParams.set('manufacturerId', String(manufacturerId));
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
          <Typography sx={{ mt: 1, maxWidth: 760, color: 'text.secondary', fontSize: 14, lineHeight: 1.7 }}>
            <FormattedMessage
              id="market.brandBrowse.description"
              defaultMessage="Jump straight to listings from the manufacturers you care about, then refine by ships, packages, CCUs, or LTI."
            />
          </Typography>
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

  const renderCcuRoutePlanner = () => {
    const routeDataLoading = ccusLoading || marketRouteLoading;
    const routeDataError = Boolean(ccusError || marketRouteError);
    const invalidRange = Boolean(plannerStartShip && plannerTargetShip && plannerTargetShip.msrp <= plannerStartShip.msrp);
    const needsCredit = plannerOfficialStoreCreditSpend > 0;
    const creditUnavailable = needsCredit && !plannerCreditLoading && (!plannerSelectedCreditOptions?.length || !plannerCreditListing || Boolean(plannerCreditError));
    const targetShipRecommendationItem = plannerTargetShipListingRecommendation?.item || null;
    const targetShipRecommendationPrice = targetShipRecommendationItem
      ? formatUsdPrice(intl.locale, targetShipRecommendationItem.price)
      : '';
    const canCheckout = Boolean(
      plannerRoute
      && (plannerRouteMarketEdges.length > 0 || needsCredit)
      && !routeDataLoading
      && !routeDataError
      && !creditUnavailable
      && (!needsCredit || !plannerCreditLoading),
    );

    return (
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
            loading={loading}
            filterOptions={(options, state) => filterShipOptions(options, state.inputValue)}
            getOptionLabel={(option) => getShipDisplayName(option)}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            onChange={(_event, value) => {
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
            loading={loading}
            filterOptions={(options, state) => filterShipOptions(options, state.inputValue)}
            getOptionLabel={(option) => getShipDisplayName(option)}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            onChange={(_event, value) => setPlannerTargetShipId(value?.id || '')}
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
                  onChange={(event) => setPlannerIncludeHangarCcus(event.target.checked)}
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
            <Crawler ships={ships} />
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
              {plannerRoute
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
              <strong>{plannerRoute ? plannerRoutePurchasableCcuCount : '-'}</strong>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span><FormattedMessage id="market.ccuPlanner.requiredCredit" defaultMessage="Store Credit to buy" /></span>
              <strong>{plannerRoute ? formatUsdPrice(intl.locale, plannerCreditFaceValue) : '-'}</strong>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span><FormattedMessage id="market.ccuPlanner.totalSpend" defaultMessage="Total spend" /></span>
              <strong>{plannerRoute ? formatUsdPrice(intl.locale, plannerOrderTotal) : '-'}</strong>
            </div>
            {plannerRoute && plannerHangarSpend > 0 && (
              <div className='flex items-center justify-between gap-4 text-xs text-emerald-800 dark:text-emerald-100'>
                <span><FormattedMessage id="market.ccuPlanner.hangarSpend" defaultMessage="Hangar CCU cost included" /></span>
                <strong>{formatUsdPrice(intl.locale, plannerHangarSpend)}</strong>
              </div>
            )}
            {plannerRoute && plannerHangarEdgeCount > 0 && (
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
        ) : routeDataError ? (
          <Alert severity="error" sx={{ borderRadius: 0 }}>
            <FormattedMessage id="market.ccuPlanner.loadError" defaultMessage="Failed to load CCU route data." />
          </Alert>
        ) : plannerStartShip && plannerTargetShip && !plannerRoute && !invalidRange ? (
          <Alert severity="warning" sx={{ borderRadius: 0 }}>
            <FormattedMessage id="market.ccuPlanner.noRoute" defaultMessage="No route is available for this pair with current market and official CCU data." />
          </Alert>
        ) : plannerRoute ? (
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
              {plannerRoute.edges.map((edge, index) => (
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
    );
  };

  const openListingDrawer = (options?: { focusSearch?: boolean }) => {
    suppressListingAutoOpenRef.current = false;
    setListingDrawerOpen(true);
    if (options?.focusSearch) {
      window.setTimeout(() => {
        document.getElementById('market-listing-search-input')?.focus();
      }, 80);
    }
  };

  const closeListingDrawer = (options?: { clearFilters?: boolean }) => {
    setListingDrawerOpen(false);
    if (options?.clearFilters) {
      clearMarketSearchParams({ keepDrawerClosed: true });
    }
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
      <TextField
        fullWidth
        variant="outlined"
        placeholder={intl.formatMessage({ id: 'market.searchPlaceholder', defaultMessage: 'Search products, ships, bundles...' })}
        value={searchInput}
        id="market-listing-search-input"
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

      <div className='grid gap-2 lg:hidden'>
        <Button
          variant="outlined"
          fullWidth
          startIcon={<FilterListOutlined />}
          onClick={() => setMobileFilterDrawerOpen(true)}
          sx={{
            minHeight: 40,
            borderRadius: 0,
            justifyContent: 'space-between',
            px: 1.5,
            textTransform: 'none',
          }}
        >
          <span>
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
  );

  const renderListingGrid = () => (
    <Box sx={{ position: 'relative', p: 2 }}>
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

      {loading && listingItems.length === 0 ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={360}>
          <CircularProgress />
        </Box>
      ) : listingItems.length === 0 ? (
        <Box sx={{ borderRadius: 0, border: '1px dashed', borderColor: 'divider', backgroundColor: 'background.paper', p: 6, textAlign: 'center' }}>
          <Typography variant="h6">
            <FormattedMessage id="market.noResults" defaultMessage="No products found" />
          </Typography>
        </Box>
      ) : (
        <>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5'>
            {listingItems.map((item) => {
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
                      height={220}
                      badgeText={!isCredit && discount ? formatMarketDiscount(intl, discount) : null}
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
                        onClick={() => handleOpenDetails(item)}
                      >
                        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.35, fontSize: '1.05rem' }}>
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
                        {isCredit ? (
                          <Button
                            variant="outlined"
                            onClick={() => handleOpenDetails(item)}
                            size="small"
                          >
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
                          <Button
                            variant="outlined"
                            onClick={() => handleAddToCart(item)}
                            disabled={availableStock <= 0}
                            size="small"
                          >
                            <FormattedMessage id="market.addToCart" defaultMessage="Add to cart" />
                          </Button>
                        )}
                        {!isCredit && (
                          <Button
                            variant="contained"
                            onClick={() => handleBuyNow(item)}
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
            })}
          </div>

          <Box sx={{ mt: 2, borderRadius: 0, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper' }}>
            <TablePagination
              rowsPerPageOptions={[15, 30]}
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
        className='absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-y-auto bg-slate-50 text-left text-slate-950 dark:bg-neutral-950 dark:text-white'
      >
        <style>
          {`
            :root {
              --market-manufacturer-logo-filter: none;
            }

            :root.dark {
              --market-manufacturer-logo-filter: brightness(0) invert(1);
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

        <Button
          variant="contained"
          onClick={() => openListingDrawer()}
          sx={{
            position: 'fixed',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 1200,
            width: 68,
            minWidth: 52,
            minHeight: 196,
            borderRadius: 0,
            px: 0,
            py: 1.5,
            display: 'inline-flex',
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
          <span className="market-listing-button-icon">
            <ListFilter className="h-4 w-4" />
          </span>
        </Button>

        <div className='relative mx-auto flex min-h-full w-full max-w-[1440px] flex-col gap-6 px-4 py-5 md:px-10 md:py-6'>
          <Box sx={{ display: 'flex', justifyContent: 'end', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
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
          </Box>

          <section
            className='relative min-h-[440px] overflow-hidden border border-gray-200 bg-slate-900 shadow-sm dark:border-gray-800 md:min-h-[560px]'
            onMouseEnter={() => setHeroAutoplayPaused(true)}
            onMouseLeave={() => setHeroAutoplayPaused(false)}
            onFocus={() => setHeroAutoplayPaused(true)}
            onBlur={handleHeroBlur}
          >
            <div
              key={activeHeroSlide ? `${activeHeroSlide.id || activeHeroSlideIndex}:${activeHeroSlide.mediaType}:${activeHeroSlide.mediaUrl}` : 'empty-hero-media'}
              className='absolute inset-0 bg-slate-900'
            >
              {activeHeroSlide ? renderMarketHeroMedia(activeHeroSlide, true) : null}
            </div>
            <div className='absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.48)_0%,rgba(15,23,42,0.22)_42%,rgba(15,23,42,0.08)_72%,rgba(15,23,42,0.02)_100%)]' />
            <div className='absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950/70 via-slate-950/36 to-transparent' />

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
                    color: 'white',
                    bgcolor: 'rgba(0,0,0,0.38)',
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
                    color: 'white',
                    bgcolor: 'rgba(0,0,0,0.38)',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.58)' },
                  }}
                  aria-label={intl.formatMessage({ id: 'common.next', defaultMessage: 'Next' })}
                >
                  <ChevronRight className='h-5 w-5' />
                </IconButton>
              </>
            )}

            <div
              key={activeHeroSlide?.id || activeHeroSlideIndex}
              className='relative z-10 flex min-h-[440px] max-w-3xl animate-[marketHeroCopyIn_360ms_ease-out] flex-col justify-end px-6 py-8 md:min-h-[560px] md:px-14 md:py-14 motion-reduce:animate-none'
            >
              <div className='text-xs font-semibold uppercase tracking-[0.18em] text-blue-200'>
                {activeHeroTranslation.eyebrow}
              </div>
              <Typography
                component="h1"
                sx={{
                  mt: 1.5,
                  fontSize: { xs: 34, md: 56 },
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
                <Typography sx={{ mt: 2, maxWidth: 620, color: 'rgba(255,255,255,0.78)', fontSize: { xs: 15, md: 18 }, lineHeight: 1.65 }}>
                  {activeHeroTranslation.subtitle}
                </Typography>
              )}
              <div className='mt-6 flex flex-wrap gap-3'>
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
          </section>

          {/* {heroSlides.length > 1 && (
            <div className='mx-auto w-full flex gap-8 justify-center'>
              {heroSlides.map((slide, index) => {
                const translation = getMarketHeroTranslation(slide, locale as MarketHomeLocaleCode);
                const active = index === activeHeroIndex;

                return (
                  <div
                    key={slide.id || index}
                    onClick={() => setActiveHeroIndex(index)}
                    className={`cursor-pointer min-h-12 border px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.08em] transition ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-slate-700 hover:border-blue-300 dark:border-gray-800 dark:bg-neutral-900 dark:text-slate-200 dark:hover:border-blue-500'}`}
                  >
                    {translation.title || translation.eyebrow || `Hero ${index + 1}`}
                  </div>
                );
              })}
            </div>
          )} */}

          <section className='mx-auto grid w-full gap-4'>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) 180px' },
                gap: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                p: 1.5,
              }}
            >
              <TextField
                fullWidth
                variant="outlined"
                placeholder={intl.formatMessage({ id: 'market.searchPlaceholder', defaultMessage: 'Search products, ships, bundles...' })}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    openListingDrawer();
                  }
                }}
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: 0, bgcolor: 'background.paper' }
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
              <Button
                variant="contained"
                onClick={() => openListingDrawer()}
                sx={{ borderRadius: 0 }}
              >
                <FormattedMessage id="market.search" defaultMessage="Search" />
              </Button>
            </Box>

            <div className='grid gap-3 md:grid-cols-5'>
              {[
                { value: 'standalone_ship' as MarketItemFilterOption, label: intl.formatMessage({ id: 'market.filter.standaloneShip', defaultMessage: 'Standalone Ship' }) },
                { value: 'ship_package' as MarketItemFilterOption, label: intl.formatMessage({ id: 'market.filter.shipPackage', defaultMessage: 'Ship Package' }) },
                { value: 'ccu' as MarketItemFilterOption, label: intl.formatMessage({ id: 'market.filter.ccu', defaultMessage: 'CCU' }) },
                { value: 'paint' as MarketItemFilterOption, label: intl.formatMessage({ id: 'market.filter.paint', defaultMessage: 'Paint' }) },
                { value: 'credit' as MarketItemFilterOption, label: intl.formatMessage({ id: 'market.filter.credit', defaultMessage: 'Credit' }) },
              ].map((entry) => (
                <div
                  key={entry.value}
                  onClick={() => {
                    updateMarketSearchParams((nextSearchParams) => {
                      nextSearchParams.delete('itemType');
                      nextSearchParams.delete('browseCategory');
                      nextSearchParams.delete('shipTrait');
                      nextSearchParams.delete('manufacturerId');
                      nextSearchParams.delete('packageItem');
                      nextSearchParams.delete('page');
                      if (entry.value === 'ccu' || entry.value === 'credit') {
                        nextSearchParams.set('itemType', entry.value);
                      } else {
                        nextSearchParams.set('browseCategory', entry.value);
                      }
                    });
                    openListingDrawer();
                  }}
                  className='cursor-pointer flex min-h-20 items-center justify-between border border-gray-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-900 transition hover:border-blue-400 hover:bg-blue-50 dark:border-gray-800 dark:bg-neutral-900 dark:text-white dark:hover:border-blue-500 dark:hover:bg-neutral-800'
                >
                  <span>{entry.label}</span>
                  <ArrowRight className='h-4 w-4 text-blue-600 dark:text-blue-300' />
                </div>
              ))}
            </div>
          </section>

          {renderCcuRoutePlanner()}

          {renderStarterPackSection()}

          <section className='grid gap-4 md:grid-cols-[minmax(0,1fr)_360px]'>
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

            {renderAccountMarketPanel({ compact: true })}
          </section>

          {renderManufacturerBrowseSection()}

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

        <Drawer
          anchor="right"
          open={mobileFilterDrawerOpen}
          onClose={() => setMobileFilterDrawerOpen(false)}
          PaperProps={{
            sx: {
              width: 'min(92vw, 420px)',
              backgroundColor: 'background.default',
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              <FormattedMessage id="admin.bi.filter" defaultMessage="Filter" />
            </Typography>
            <IconButton onClick={() => setMobileFilterDrawerOpen(false)} aria-label={intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}>
              <X className="h-5 w-5" />
            </IconButton>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2 }}>
            {renderFilterPanel()}
            {renderAccountMarketPanel({ compact: true, onNavigate: () => setMobileFilterDrawerOpen(false) })}
          </Box>
        </Drawer>

        <Drawer
          anchor="right"
          open={listingDrawerOpen}
          onClose={() => closeListingDrawer({ clearFilters: true })}
          PaperProps={{
            sx: {
              width: '100vw',
              maxWidth: '100vw',
              height: '100%',
              backgroundColor: 'background.default',
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
                onClick={() => setMobileFilterDrawerOpen(true)}
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

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '260px minmax(0,1fr)' }, minHeight: 0, flex: 1 }}>
            <Box sx={{ display: { xs: 'none', lg: 'block' }, borderRight: '1px solid', borderColor: 'divider', p: 2, overflowY: 'auto' }}>
              <Stack spacing={2}>
                {renderFilterPanel()}
                {renderAccountMarketPanel({ compact: true })}
              </Stack>
            </Box>
            <Box ref={listingDrawerContentRef} sx={{ minWidth: 0, minHeight: 0, overflowY: 'auto' }}>
              {renderListingControls()}
              {renderListingGrid()}
            </Box>
          </Box>
        </Drawer>

        <CartDrawer
          open={cartOpen}
          cart={cart}
          onClose={closeCart}
          onRemoveFromCart={removeFromCart}
          onUpdateQuantity={updateItemQuantity}
          getAvailableStock={getAvailableStockByResourceId}
        />

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
