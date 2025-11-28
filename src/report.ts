export const reportError = (error: { 
  errorType: 
  string, 
  errorMessage: string, 
  callStack?: string 
}) => {
  fetch(`${import.meta.env.VITE_PUBLIC_BI_ENDPOINT}/api/bi/error`, {
    method: "POST",
    body: JSON.stringify(error),
  });
};

export enum BiSlots {
  VIEW_SESSION,
  VERSION_UPDATE,
  CRAWLER_USE,
  // ccu planner
  IMPORT_ROUTE,
  EXPORT_ROUTE,
  PLANNER_USE,
  ADD_RSI_CART,
  // hangar
  NAVIGATE_RSI_HANGAR
}

export const reportBi = <T>(info: {
  slot: BiSlots,
  data: T
}) => {
  fetch(`${import.meta.env.VITE_PUBLIC_BI_ENDPOINT}/api/bi/info`, {
    method: "POST",
    body: JSON.stringify(info),
  });
};
