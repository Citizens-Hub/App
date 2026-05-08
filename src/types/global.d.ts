declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }

  interface String {
    getNodeShipId(): string;
  }
}

export {};
