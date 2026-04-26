export interface Resource {
  id: string;
  name: string;
  title: string;
  subtitle: string;
  excerpt: string;
  type: string;
  itemType?: MarketItemType;
  fromShipId?: number;
  toShipId?: number;
  shipId?: number;
  fromShipName?: string;
  toShipName?: string;
  shipName?: string;
  packageKind?: string;
  insuranceType?: string;
  imageUrl?: string;
  fromImageUrl?: string;
  toImageUrl?: string;
  description?: string;
  externalRef?: string;
  creditAmount?: number;
  discountRateBps?: number;
  sellerCount?: number;
  creditOptions?: Array<{
    amount: number;
    price: number;
    discountRateBps: number;
    sellerCount: number;
  }>;
  marketAvailableStock?: number;
  media: {
    thumbnail: {
      storeSmall: string;
    };
    list: {
      slideshow: string;
    }[];
  };
  nativePrice: {
    amount: number;
    discounted: number;
    taxDescription: string[];
  };
  stock: {
    available: boolean;
    level: string;
  };
  isPackage: boolean;
}

export interface ProfileData {
  name: string | null;
  avatar: string | null;
  description: string | null;
  contacts: string | null;
  homepage: string | null;
  sharedHangar: string | null;

  // immutable
  email: string | null;
  emailVerified: boolean;
}
export interface ResourcesData {
  data: {
    store: {
      listing: {
        resources: Resource[];
      };
    };
  };
}

export interface CartItem {
  resource: Resource;
  quantity?: number;
}

export interface Ccu {
  id: number;
  skus: {
    id: number;
    price: number;
    upgradePrice: number;
    unlimitedStock: boolean;
    showStock: boolean;
    available: boolean;
    availableStock: number;
  }[]
}


export interface CcusData {
  data: {
    to: {
      ships: Ccu[];
    };
  };
}

export interface ShipDetailComponent {
  name?: string;
  quantity?: number | null;
  size?: string | null;
  details?: string | null;
  manufacturerName?: string | null;
}

export interface ShipDetailImage {
  name?: string;
  slot?: string;
  url?: string;
}

export interface ShipDetail {
  slug?: string;
  title?: string;
  url?: string;
  body?: string;
  excerpt?: string;
  size?: string;
  productionStatus?: string;
  isCustomizable?: boolean | null;
  purchasable?: boolean | null;
  hasBuyingOptions?: boolean | null;
  viewable?: boolean | null;
  chassisId?: number | null;
  minCrew?: number | null;
  maxCrew?: number | null;
  mass?: number | null;
  length?: number | null;
  beam?: number | null;
  height?: number | null;
  cargoCapacity?: number | null;
  maxScmSpeed?: number | null;
  afterburnerSpeed?: number | null;
  ctm?: string;
  weapons?: ShipDetailComponent[];
  avionics?: ShipDetailComponent[];
  modular?: ShipDetailComponent[];
  propulsions?: ShipDetailComponent[];
  thrusters?: ShipDetailComponent[];
  imageComposer?: ShipDetailImage[];
}

export interface Ship {
  alias?: string;
  ctm?: string;
  id: number;
  name: string;
  localizedName?: string;
  medias: {
    productThumbMediumAndSmall: string;
    slideShow: string;
  };
  manufacturer: {
    id: number;
    name: string;
  };
  focus: string;
  type: string;
  flyableStatus: string;
  owned: boolean;
  msrp: number;
  link: string;
  skus: {
    id: number;
    title: string;
    available: boolean;
    price: number;
    body: string | null;
    unlimitedStock: boolean;
    availableStock: number;
  }[] | null;
  details?: ShipDetail | null;
}

export interface ShipsData {
  data: {
    ships: Ship[];
  };
}

export interface ShipDimensionsItem {
  shipId: number;
  length: number | null;
  beam: number | null;
  height: number | null;
}

export interface ShipDimensionsResponse {
  success: boolean;
  data: {
    ships: ShipDimensionsItem[];
  };
}

export interface ShipResponse {
  success: boolean;
  data: {
    ship: Ship;
  };
}

export interface ShipGameShopPurchaseItem {
  shopId: number;
  sourceShopId: string;
  shopName: string;
  location: string | null;
  system: string | null;
  isRental: boolean;
  sourceRef: string;
  localName: string;
  price: number;
  available: number | null;
  unavailable: number | null;
  shipMatchMethod: string | null;
  lastSeenAt: string;
}

export interface ShipGameShopAvailabilityResponse {
  success: boolean;
  data: {
    shipId: number;
    shipName: string;
    summary: {
      shopCount: number;
      availableShopCount: number;
      lowestPrice: number | null;
      highestPrice: number | null;
      localNames: string[];
    };
    list: ShipGameShopPurchaseItem[];
  };
}

export interface ShipNameTranslationItem {
  shipId: number;
  shipName: string;
}

export interface ShipNameTranslationsResponse {
  success: boolean;
  locale: string;
  translations: ShipNameTranslationItem[];
}

export interface ShipSogModelConfig {
  shipId: number;
  modelPath: string;
  rotation: [number, number, number];
  enabled: boolean;
  originalFileName: string | null;
  fileSize: number | null;
  contentType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipSogModelResponse {
  success: boolean;
  data: {
    model: ShipSogModelConfig | null;
  };
}

export interface AdminShipSogModelListItem {
  shipId: number;
  name: string;
  slug: string | null;
  model: ShipSogModelConfig | null;
}

export interface AdminShipSogModelListResponse {
  success: boolean;
  data: {
    shipModels: AdminShipSogModelListItem[];
  };
}

export interface ShipSogModelMutationResponse {
  success: boolean;
  data: {
    model: ShipSogModelConfig | null;
  };
}

export type ShipTranslationLocale = 'zh-CN' | 'zh-HK' | 'ja-JP' | 'de-DE' | 'en';
export type ShipTranslationField = 'shipName' | 'title' | 'excerpt' | 'body';

export interface ShipTranslationPayload {
  shipName?: string | null;
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
}

export interface ShipTranslation extends ShipTranslationPayload {
  shipId: number;
  locale: ShipTranslationLocale | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ShipTranslationListItem {
  shipId: number;
  slug: string;
  source: {
    shipName: string;
    manufacturerName: string;
    title: string;
    excerpt: string;
    body: string;
  };
  translation: ShipTranslation | null;
}

export interface ShipTranslationListResponse {
  success: boolean;
  page: number;
  limit: number;
  total: number;
  locale: string;
  list: ShipTranslationListItem[];
}

export interface ShipTranslationDetailResponse {
  success: boolean;
  data: {
    shipId: number;
    slug: string;
    source: {
      shipName: string;
      manufacturerName: string;
      title: string;
      excerpt: string;
      body: string;
    };
    translations: Array<ShipTranslation | null>;
  };
}

export interface ShipTranslationUpsertResponse {
  success: boolean;
  deleted?: boolean;
  data: {
    shipId: number;
    locale: string;
    translation: ShipTranslation | null;
  };
}

export interface ShipTranslationDraftResponse {
  success: boolean;
  data: {
    locale: string;
    field: ShipTranslationField;
    model: string;
    value: string | null;
  };
}

export interface ManufacturerTranslationPayload {
  manufacturerName?: string | null;
}

export interface ManufacturerTranslation extends ManufacturerTranslationPayload {
  manufacturerId: number;
  locale: ShipTranslationLocale | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ManufacturerTranslationListItem {
  manufacturerId: number;
  source: {
    manufacturerName: string;
    shipCount: number;
  };
  translation: ManufacturerTranslation | null;
}

export interface ManufacturerTranslationListResponse {
  success: boolean;
  page: number;
  limit: number;
  total: number;
  locale: string;
  list: ManufacturerTranslationListItem[];
}

export interface ManufacturerTranslationDetailResponse {
  success: boolean;
  data: {
    manufacturerId: number;
    source: {
      manufacturerName: string;
      shipCount: number;
      ships: Array<{
        id: number;
        name: string;
      }>;
    };
    translations: Array<ManufacturerTranslation | null>;
  };
}

export interface ManufacturerTranslationUpsertResponse {
  success: boolean;
  deleted?: boolean;
  data: {
    manufacturerId: number;
    locale: string;
    translation: ManufacturerTranslation | null;
  };
}

export interface ManufacturerTranslationDraftResponse {
  success: boolean;
  data: {
    locale: string;
    model: string;
    value: string | null;
  };
}

export interface StoreShipsData {
  id: string;
  title: string;
  name: string;
  url: string;
  slug: string;
  type: string;
  focus: string;
  msrp: number;
  purchasable: boolean;
  productionStatus: string;
  lastUpdate: string;
  publishStart: string;
  __typename: string;
  manufacturerId: number;
  featuredForShipList: boolean;
  minCrew: number;
  maxCrew: number;
  manufacturer: {
    name: string;
    __typename: string;
  };
  imageComposer: {
    name: string;
    slot: string;
    url: string;
    __typename: string;
  }[];
}

export enum CcuSourceType {
  OFFICIAL = "官方",
  AVAILABLE_WB = "线上WB",
  HANGER = "机库CCU",
  OFFICIAL_WB = "官方WB",
  THIRD_PARTY = "第三方",
  HISTORICAL = "历史",
  EXPECTED_WB = "预期WB",
  PRICE_INCREASE = "涨价",
  SUBSCRIPTION = "订阅"
}

export interface CcuEdgeData {
  price: number;
  sourceShip?: Ship;
  targetShip?: Ship;
  sourceType?: CcuSourceType;
  customPrice?: number;
  selectedTargetPriceCents?: number;
  selectedSourcePriceCents?: number;
  validityWindows?: CcuValidityWindow[];
  // ccus: Ccu[];
  // wbHistory: WbHistoryData[];
  // hangarItems: HangarItem[];
  // importItems: ImportItem[];
  // priceHistoryMap: Record<number, PriceHistoryEntity>;
}

export interface CcuValidityWindow {
  sku: number;
  startTs: number;
  endTs: number | null;
}

export interface WbHistoryData {
  name: string;
  price: string;
}

export interface HangarItem {
  id: number;
  name: string;
  type: string;
  fromShip?: string;
  toShip?: string;
  price?: number;
}

export interface ImportItem {
  name: string;
  from: number;
  to: number;
  price: number;
  currency: string;
}

export type MarketItemType = 'ccu' | 'package' | 'misc' | 'credit';
export type MarketPackageKind = 'standalone_ship' | 'bundle';
export type MarketSortMode = 'recommended' | 'newest' | 'priceDesc' | 'priceAsc';

export interface MarketPackageShip {
  shipId?: number;
  shipName: string;
  sortOrder: number;
}

export interface MarketPackageItem {
  itemName: string;
  itemKind?: string;
  imageUrl?: string;
  withImage: boolean;
  sortOrder: number;
}

export enum ListingType {
  WTS = 'WTS',
  WTB = 'WTB'
}

export interface MarketSellerSummary {
  id: string;
  email: string;
}

export interface MarketItemVariant {
  skuId: string;
  name: string;
  price: number;
  cost?: number;
  itemType: 'ccu';
  stock: number;
  lockedStock: number;
  sourceKind?: string | null;
  belongsTo: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  fromShipId?: number;
  toShipId?: number;
  fromShipName?: string;
  toShipName?: string;
  toSkuId?: number;
  imageUrl?: string;
  fromImageUrl?: string;
  toImageUrl?: string;
  seller?: MarketSellerSummary | null;
}

export interface ListingItem {
  skuId: string;
  name: string;
  price: number;
  cost?: number;
  itemType: MarketItemType;
  fromShipId?: number;
  toShipId?: number;
  shipId?: number;
  fromShipName?: string;
  toShipName?: string;
  shipName?: string;
  toSkuId?: number;
  packageKind?: string;
  insuranceType?: string;
  packageShips?: MarketPackageShip[];
  packageItems?: MarketPackageItem[];
  imageUrl?: string;
  fromImageUrl?: string;
  toImageUrl?: string;
  sourceKind?: string | null;
  description?: string;
  externalRef?: string;
  creditAmount?: number;
  discountRateBps?: number;
  sellerCount?: number;
  creditOptions?: Array<{
    amount: number;
    price: number;
    discountRateBps: number;
    sellerCount: number;
  }>;
  variantCount?: number;
  variants?: MarketItemVariant[];
  seller?: MarketSellerSummary | null;
  stock: number;
  lockedStock: number;
  belongsTo: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketListPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MarketListResponse {
  items: ListingItem[];
  pagination: MarketListPagination;
}

export interface LowestMarketCcuGroup {
  key: string;
  fromShipId?: number;
  toShipId?: number;
  fromShipName?: string;
  toShipName?: string;
  availableStock: number;
  listingCount: number;
  listing: ListingItem;
}

export interface LowestMarketCcuResponse {
  items: LowestMarketCcuGroup[];
}

export enum OrderStatus {
  Pending = 'pending',
  Processing = 'processing',
  Paid = 'paid',
  Finished = 'finished',
  Canceled = 'canceled',
}

export interface MarketCartItem {
  skuId: string;
  quantity: number;
  itemType: MarketItemType;
  fromShipId?: number;
  toShipId?: number;
  shipId?: number;
  fromShipName?: string;
  toShipName?: string;
  shipName?: string;
  packageKind?: string;
  insuranceType?: string;
  imageUrl?: string;
  fromImageUrl?: string;
  toImageUrl?: string;
  description?: string;
  externalRef?: string;
  creditAmount?: number;
  discountRateBps?: number;
  sellerCount?: number;
  creditOptions?: Array<{
    amount: number;
    price: number;
    discountRateBps: number;
    sellerCount: number;
  }>;
  // 添加显示所需的额外属性
  name?: string;
  price?: number;
  discounted?: number;
  media?: {
    thumbnail?: {
      storeSmall?: string;
    };
    list?: Array<{
      slideshow?: string;
    }>;
  };
}

export interface OrderItem {
  id?: number;
  skuId?: string;
  quantity: number;
  price: number;
  cancelledQuantity?: number | null;
  shipped?: boolean;
  createdAt?: string;
  updatedAt?: string;
  marketItem: {
    name: string;
    skuId: string;
    itemType: MarketItemType;
    fromShipId?: number;
    toShipId?: number;
    shipId?: number;
    fromShipName?: string;
    toShipName?: string;
    shipName?: string;
    packageKind?: string;
    insuranceType?: string;
    imageUrl?: string;
    fromImageUrl?: string;
    toImageUrl?: string;
    packageShips?: MarketPackageShip[];
    packageItems?: MarketPackageItem[];
    description?: string;
    externalRef?: string;
    creditAmount?: number;
    discountRateBps?: number;
    sellerCount?: number;
    creditOptions?: Array<{
      amount: number;
      price: number;
      discountRateBps: number;
      sellerCount: number;
    }>;
  }
}

export interface Order {
  id: string;
  items: OrderItem[];
  price: number;
  status: OrderStatus;
  createdAt: string;
  expiresAt?: string | null;
  updatedAt?: string;
  sessionId?: string | null;
}

export interface DetailedOrderItem extends OrderItem {
  id: number;
  skuId: string;
  quantity: number;
  price: number;
  cancelledQuantity?: number;
  shipped: boolean;
  updatedAt: string;
  marketItem: {
    name: string;
    skuId: string;
    itemType: MarketItemType;
    fromShipId?: number;
    toShipId?: number;
    shipId?: number;
    fromShipName?: string;
    toShipName?: string;
    shipName?: string;
    packageKind?: string;
    insuranceType?: string;
    imageUrl?: string;
    fromImageUrl?: string;
    toImageUrl?: string;
    packageShips?: MarketPackageShip[];
    packageItems?: MarketPackageItem[];
    description?: string;
    externalRef?: string;
    creditAmount?: number;
    discountRateBps?: number;
    sellerCount?: number;
    creditOptions?: Array<{
      amount: number;
      price: number;
      discountRateBps: number;
      sellerCount: number;
    }>;
    belongsTo: string;
  }
}

export interface DetailedOrder extends Order {
  updatedAt: string;
  invoiceId: string | null;
  items: DetailedOrderItem[];
}

export interface OrderPaymentInfo {
  provider: 'stripe';
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  invoiceId: string | null;
  checkoutStatus: string | null;
  paymentStatus: string | null;
  paymentIntentStatus: string | null;
  currency: string | null;
  amountSubtotal: number | null;
  amountTax: number | null;
  amountShipping: number | null;
  amountTotal: number | null;
  amountCaptured: number | null;
  paidAt: string | null;
  receiptUrl: string | null;
  hostedInvoiceUrl: string | null;
  customerEmail: string | null;
  customerName: string | null;
  billingCountry: string | null;
  paymentMethodType: string | null;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  riskLevel: string | null;
  riskScore: number | null;
  cvcCheck: string | null;
  postalCodeCheck: string | null;
}

export interface DetailedRelatedOrder extends DetailedOrder {
  customerEmail: string | null;
}

export interface ResellerBalanceSummary {
  currency: string;
  availableBalance: number;
  pendingBalance: number;
  totalRevenue: number;
  orderCount: number;
  transactionCount: number;
  availableCount: number;
  pendingCount: number;
  pendingWithdrawalAmount: number;
  paidWithdrawalAmount: number;
  withdrawableBalance: number;
  lastSaleAt: string | null;
}

export interface ResellerBalanceTransaction {
  id: string;
  orderId: string;
  source: 'listing' | 'credit';
  itemType: MarketItemType;
  itemName: string;
  itemSubtitle?: string | null;
  quantity: number;
  creditAmount?: number | null;
  grossAmount: number;
  settlementStatus: 'available' | 'pending';
  shipped: boolean;
  shippedAt: string | null;
  settlementAvailableAt: string | null;
  createdAt: string;
  updatedAt: string;
  orderStatus: OrderStatus;
}

export interface ResellerBalancePagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ResellerBalanceResponse {
  summary: ResellerBalanceSummary;
  transactions: ResellerBalanceTransaction[];
  pagination: ResellerBalancePagination;
}

export type WithdrawalRequestStatus = 'pending' | 'paid' | 'rejected';

export interface WithdrawalRequestUser {
  id: string;
  email: string;
  name: string | null;
}

export interface WithdrawalRequestItem {
  id: number;
  amount: number;
  currency: string;
  accountInfo: string;
  note?: string | null;
  status: WithdrawalRequestStatus;
  balanceSnapshot: number;
  adminNote?: string | null;
  processedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  requester?: WithdrawalRequestUser | null;
  processedBy?: WithdrawalRequestUser | null;
}

export interface MyWithdrawalRequestsResponse {
  requests: WithdrawalRequestItem[];
}

export interface AdminWithdrawalRequestsResponse {
  summary: {
    totalCount: number;
    pendingCount: number;
    paidCount: number;
    rejectedCount: number;
    totalAmount: number;
    pendingAmount: number;
    paidAmount: number;
  };
  requests: WithdrawalRequestItem[];
}

// export interface OrderItem {
//   skuId: string;
//   quantity: number;
//   price: number;
//   // 取消数量，用于库存不足时，记录实际处理数量
//   cancelledQuantity?: number;
// }

export enum UserRole {
  Guest = 0,
  User = 1,
  Admin = 2,
  Reseller = 3,
}

export interface UserInfo {
  id: string;
  avatar: string;
  email: string;
  emailVerified: boolean;
  name: string;
  role: UserRole;
}

export interface RequestItem {
  type: string;
  message?: {
    type: string;
    request: {
      url: string;
      responseType: string;
      method: string;
      data: null | object | object[];
    };
    requestId: string;
  };
  request?: {
    url: string;
    data: null | object | object[];
    responseType: string;
    method: string;
  };
  requestId?: number | string;
}

export type ItemType = "Insurance" | "Ship" | "Skin" | "FPS Equipment" | "Credits" | "Hangar pass" | undefined;
export type InsuranceType = "LTI" | "Other"

export interface PriceHistoryEntry {
  change: "+" | "-";
  edition?: string;
  sku?: number;
  msrp?: number;
  baseMsrp?: number;
  items?: Array<{ id: number; title: string }> | null;
  ts: number;
}

export interface PriceHistoryEntity {
  id: number;
  history: PriceHistoryEntry[];
}

export interface PriceHistoryData {
  entities: Record<string, PriceHistoryEntity>;
  updatedAt: string;
  encrypted?: boolean;
  payload?: string;
}

export interface WatchlistItem {
  id: number;
  shipId: number;
  shipName: string;
  shipAlias: string | null;
  shipMsrp: number;
  shipImage: string;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistData {
  items: WatchlistItem[];
  count: number;
}

export interface WatchlistResponse {
  success: boolean;
  data: WatchlistData;
}

// Blog types
export interface BlogAuthor {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  content: string;
  language: string;
  excerpt: string;
  published: boolean;
  author: BlogAuthor;
  createdAt: string;
  updatedAt: string;
  image?: string | null;
  tags?: string[];
}

export interface BlogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface BlogPostsResponse {
  success: boolean;
  posts: BlogPost[];
  pagination: BlogPagination;
}

export interface BlogPostResponse {
  success: boolean;
  message?: string;
  post: BlogPost;
}

export interface CreateBlogPostRequest {
  slug: string;
  title: string;
  content: string;
  language: string;
  excerpt: string;
  published: boolean;
  image?: string | null;
}

export interface UpdateBlogPostRequest {
  slug?: string;
  title?: string;
  content?: string;
  language?: string;
  excerpt?: string;
  published?: boolean;
  image?: string | null;
}

export interface BlogComment {
  id: string;
  content: string;
  author: BlogAuthor;
  createdAt: string;
  updatedAt: string;
}

export type CaptchaProvider = 'turnstile' | 'tencent';

export interface CaptchaVerificationPayload {
  captchaProvider: CaptchaProvider;
  turnstileToken?: string;
  tencentCaptchaTicket?: string;
  tencentCaptchaRandstr?: string;
}

export interface CreateBlogCommentRequest extends CaptchaVerificationPayload {
  content: string;
}

export interface BlogCommentsResponse {
  success: boolean;
  comments: BlogComment[];
}

export interface CreateBlogCommentResponse {
  success: boolean;
  message?: string;
  comment: BlogComment;
}

export interface DeleteBlogCommentResponse {
  success: boolean;
  message?: string;
}

export enum ErrorTypes {
  BUYBACK_CCU_PARSING_ERROR = "BUYBACK_CCU_PARSING_ERROR",
  RENDER_ERROR = "Render Error",
  CCU_PARSING_ERROR = "CCU_PARSING_ERROR"
}

export interface SessionHistory {
  page: string,
  open: string,
  close: string
}

export type GameShopImportMode = 'full' | 'single';
export type GameShopInventoryChangeType = 'added' | 'updated' | 'removed' | 'unchanged';
export type GameShopChangeType = 'added' | 'updated' | 'unchanged';

export interface GameShopEntityChangeSummary {
  added: number;
  updated: number;
  unchanged: number;
}

export interface GameShopInventoryChangeSummary {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
}

export interface GameShopImportSummary {
  shopCount: number;
  inventoryCount: number;
  shops: GameShopEntityChangeSummary;
  products: GameShopEntityChangeSummary;
  inventory: GameShopInventoryChangeSummary;
  warnings: string[];
}

export interface GameShopImportShopPreview {
  sourceShopId: string;
  name: string;
  location: string | null;
  system: string | null;
  isRental: boolean;
  inventoryCount: number;
  shopChangeType: GameShopChangeType;
  inventoryChanges: GameShopInventoryChangeSummary;
}

export interface GameShopAdminListItem {
  id: number;
  sourceShopId: string;
  name: string;
  location: string | null;
  system: string | null;
  isRental: boolean;
  isActive: boolean;
  activeInventoryCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface GameShopAdminListResponse {
  success: boolean;
  page: number;
  limit: number;
  total: number;
  systems: string[];
  list: GameShopAdminListItem[];
}

export interface GameShopInventoryItem {
  id: number;
  productId: number;
  sourceRef: string;
  localName: string;
  price: number;
  available: number | null;
  unavailable: number | null;
  isActive: boolean;
  rawData: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastImportBatchId: string;
}

export interface GameShopDetailResponse {
  success: boolean;
  data: {
    id: number;
    sourceShopId: string;
    name: string;
    location: string | null;
    system: string | null;
    isRental: boolean;
    isActive: boolean;
    activeInventoryCount: number;
    rawData: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    inventory: GameShopInventoryItem[];
  };
}

export interface GameShopHistoryItem {
  sourceRef: string;
  localName: string;
  price: number;
  available: number | null;
  unavailable: number | null;
  changeType: GameShopInventoryChangeType;
  createdAt: string;
}

export interface GameShopHistoryEntry {
  batchId: string;
  changeType: GameShopChangeType;
  inventoryChanges: GameShopInventoryChangeSummary;
  batch: {
    id: string;
    scope: GameShopImportMode;
    sourceType: string;
    sourceShopId: string | null;
    fileName: string | null;
    checksum: string | null;
    status: string;
    errorMessage: string | null;
    createdBy: string | null;
    createdAt: string;
    finishedAt: string | null;
    summary: GameShopImportSummary | null;
  };
  items: GameShopHistoryItem[];
  createdAt: string;
}

export interface GameShopHistoryResponse {
  success: boolean;
  data: {
    shopId: number;
    sourceShopId: string;
    shopName: string;
    history: GameShopHistoryEntry[];
  };
}

export interface GameShopImportBatchListItem {
  id: string;
  scope: GameShopImportMode;
  sourceType: string;
  sourceShopId: string | null;
  fileName: string | null;
  checksum: string | null;
  status: string;
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: string;
  finishedAt: string | null;
  summary: GameShopImportSummary | null;
  batchSummary: {
    shopCount: number;
    inventoryCount: number;
  };
}

export interface GameShopImportBatchListResponse {
  success: boolean;
  page: number;
  limit: number;
  total: number;
  list: GameShopImportBatchListItem[];
}

export interface GameShopImportBatchCancelResponse {
  success: boolean;
  data: {
    batchId: string;
    previousStatus: string;
    status: string;
  };
}

export interface GameShopImportResponse {
  success: boolean;
  mode: GameShopImportMode;
  summary: GameShopImportSummary;
  shops: GameShopImportShopPreview[];
  data?: {
    batchId: string;
    createdAt?: string;
    status?: string;
  };
}

export interface GameShopShipMatchRematchResponse {
  success: boolean;
  data: {
    totalProducts: number;
    updatedProducts: number;
    matched: number;
    unmatched: number;
    ambiguous: number;
    ignored: number;
    matchedAt: string;
  };
}
