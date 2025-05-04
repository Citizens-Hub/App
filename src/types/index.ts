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

export enum CcuSourceType {
  OFFICIAL = "官方",
  OFFICIAL_WB = "官方WB",
  THIRD_PARTY = "第三方"
}

export interface CcuEdgeData {
  price: number;
  sourceShip?: Ship;
  targetShip?: Ship;
  sourceType?: CcuSourceType;
  customPrice?: number;
}
