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
  fetch(`${import.meta.env.VITE_PUBLIC_BI_ENDPOINT}/api/bi/info`, {
    method: "POST",
    body: JSON.stringify({
      ...info,
      deviceTag: getDeviceTag()
    }),
  });
};
