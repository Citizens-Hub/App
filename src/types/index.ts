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
  emailVerified: 0 | 1;
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
  HISTORICAL = "历史"
}

export interface CcuEdgeData {
  price: number;
  sourceShip?: Ship;
  targetShip?: Ship;
  sourceType?: CcuSourceType;
  customPrice?: number;
}

export interface WbHistoryData {
  name: string;
  price: string;
}

export interface HangarItem {
  id: number;
  name: string;
  type: string; // 'ccu', 'ship' 等
  fromShip?: string;
  toShip?: string;
  price?: number;
}

export enum ListingType {
  WTS = 'WTS',
  WTB = 'WTB'
}

export interface ListingItem {
  id: string;
  type: ListingType;
  name: string;
  description: string;
  imageUrl: string;
  languages: string[];
  communicationTools: string[];
  price?: string;
  seller: string;
  createdAt: Date;
}

