declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    rdt?: (...args: unknown[]) => void;
    gapi?: {
      load: (moduleName: string, callback: () => void) => void;
      surveyoptin?: {
        render: (config: {
          merchant_id: number;
          order_id: string;
          email: string;
          delivery_country: string;
          estimated_delivery_date: string;
          products?: Array<{ gtin: string }>;
        }) => void;
      };
    };
    merchantwidget?: {
      start: (config: {
        merchant_id: number;
        position?: string;
        region?: string;
      }) => void;
    };
  }

  interface String {
    getNodeShipId(): string;
  }
}

export {};
