export const reportError = (error: { 
  errorType: 
  string, 
  errorMessage: string, 
  appVersion: string,
  callStack?: string,
}) => {
  fetch(`${import.meta.env.VITE_PUBLIC_BI_ENDPOINT}/api/bi/error`, {
    method: "POST",
    body: JSON.stringify({
      ...error,
      href: window.location.href
    }),
  });
};

export enum BiSlots {
  VIEW_SESSION = "VS",
  VERSION_UPDATE = "VU",
  CRAWLER_USE = "CU", // 🆗
  // ccu planner
  IMPORT_ROUTE = "IR", // 🆗
  EXPORT_ROUTE = "ER", // 🆗
  PLANNER_USE = "PU", // 🆗
  ADD_RSI_CART = "ARC", // 🆗
  VIEW_GUIDE = "VG", // 🆗
  MARKET_CCU_PLANNER_SELECTION = "MCPS",
  MARKET_CCU_PLANNER_ROUTE_RESULT = "MCPR",
  MARKET_CCU_PLANNER_ADD_TO_CART = "MCPA",
  MARKET_CCU_PLANNER_CHECKOUT = "MCPC",
  // hangar
  NAVIGATE_RSI_HANGAR = "NRH" // 🆗
}

export const getDeviceTag = () => {
  let deviceTag = localStorage.getItem("deviceTag")
  if (deviceTag) return deviceTag
  deviceTag = crypto.randomUUID();
  localStorage.setItem("deviceTag", deviceTag)
  return deviceTag
}

export const reportBi = <T>(info: {
  slot: BiSlots,
  data: T
}) => {
  void fetch(`${import.meta.env.VITE_PUBLIC_BI_ENDPOINT}/api/bi/info`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    keepalive: true,
    body: JSON.stringify({
      ...info,
      deviceTag: getDeviceTag()
    }),
  }).catch(() => {
    // BI must never interrupt user flows.
  });
};
