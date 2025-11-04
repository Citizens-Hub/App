export const navigation = [
  {
    name: "navigation.home",
    path: "/",
  },
  {
    name: "navigation.ccuPlanner",
    path: "/ccu-planner",
  },
  {
    name: "navigation.priceHistory",
    path: "/price-history",
  },
  {
    name: "navigation.hangar",
    path: "/hangar",
  },
  {
    name: "navigation.market",
    path: "/market",
    hidden: import.meta.env.VITE_PUBLIC_ENV !== "development",
  },
  {
    name: "navigation.orders",
    path: "/orders",
    hidden: import.meta.env.VITE_PUBLIC_ENV !== "development",
  },
  {
    name: "navigation.storePreview",
    path: "/store-preview",
  },
  {
    name: "navigation.appSettings",
    path: "/app-settings",
  },
  {
    name: "navigation.fleaMarket",
    path: "/flea-market",
    hidden: true,
  },
  {
    name: "navigation.guide",
    path: "/guide",
    hidden: true,
  },
  {
    name: "navigation.privacy",
    path: "/privacy",
    hidden: true,
  },
  {
    name: "navigation.changelog",
    path: "/changelog",
    hidden: true,
  },
  {
    name: "navigation.login",
    path: "/login",
    hidden: true,
  },
  {
    name: "navigation.register",
    path: "/register",
    hidden: true,
  },
  {
    name: "navigation.admin",
    path: "/admin",
    hidden: true,
  },
  {
    name: "navigation.hangarShare",
    path: "/share/hangar/:userId",
    hidden: true,
  },
  {
    name: "navigation.checkout",
    path: "/checkout",
    hidden: true,
  },
  {
    name: "navigation.reseller",
    path: "/reseller",
    hidden: import.meta.env.VITE_PUBLIC_ENV !== "development",
  },
  {
    name: "navigation.blog",
    path: "/blog",
  },
  {
    name: "navigation.blog",
    path: "/blog/:slug",
    hidden: true,
  },
];
