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