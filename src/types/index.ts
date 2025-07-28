export interface Resource {
  id: string;
  name: string;
  title: string;
  subtitle: string;
  excerpt: string;
  type: string;
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

export interface Ship {
  id: number;
  name: string;
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
}

export interface ShipsData {
  data: {
    ships: Ship[];
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
  SUBSCRIPTION = "订阅"
}

export interface CcuEdgeData {
  price: number;
  sourceShip?: Ship;
  targetShip?: Ship;
  sourceType?: CcuSourceType;
  customPrice?: number;
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  hangarItems: HangarItem[];
  importItems: ImportItem[];
  handleAddToCart: (from: number, to: number) => void;
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

export enum ListingType {
  WTS = 'WTS',
  WTB = 'WTB'
}

export interface ListingItem {
  skuId: string;
  name: string;
  price: number;
  itemType: 'ccu' | 'ship';
  fromShipId: number;
  toShipId: number;
  shipId: number;
  stock: number;
  lockedStock: number;
  belongsTo: string;
  createdAt: string;
  updatedAt: string;
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
  itemType: 'ccu' | 'ship';
  fromShipId?: number;
  toShipId?: number;
  shipId?: number;
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
  quantity: number;
  price: number;
  cancelledQuantity?: number;
  marketItem: {
    name: string;
    skuId: string;
    itemType: 'ccu' | 'ship';
    fromShipId?: number;
    toShipId?: number;
    shipId?: number;
  }
}

export interface Order {
  id: number;
  items: OrderItem[];
  price: number;
  status: OrderStatus;
  createdAt: string;
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
    itemType: 'ccu' | 'ship';
    fromShipId?: number;
    toShipId?: number;
    shipId?: number;
    belongsTo: string;
  }
}

export interface DetailedOrder extends Order {
  updatedAt: string;
  invoiceId: string | null;
  items: DetailedOrderItem[];
}

export interface DetailedRelatedOrder extends DetailedOrder {
  customerEmail: string;
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
