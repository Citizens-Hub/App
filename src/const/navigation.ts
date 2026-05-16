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
    name: "navigation.priceHistory",
    path: "/price-history/:shipSlug",
    hidden: true,
  },
  {
    name: "navigation.hangar",
    path: "/hangar",
  },
  {
    name: "navigation.fleetview",
    path: "/fleetview",
  },
  {
    name: "navigation.market",
    path: "/market",
  },
  {
    name: "navigation.market",
    path: "/market/:item",
    hidden: true,
  },
  {
    name: "navigation.orders",
    path: "/orders",
  },
  {
    name: "navigation.orders",
    path: "/orders/:orderId",
    hidden: true,
  },
  {
    name: "navigation.tickets",
    path: "/tickets",
  },
  {
    name: "navigation.ticketsCreate",
    path: "/tickets/create",
    hidden: true,
  },
  {
    name: "navigation.ticketsReply",
    path: "/tickets/:ticketId/reply",
    hidden: true,
  },
  {
    name: "navigation.tickets",
    path: "/tickets/:ticketId",
    hidden: true,
  },
  {
    name: "navigation.storePreview",
    path: "/store-preview",
  },
  // {
  //   name: "navigation.fleaMarket",
  //   path: "/flea-market",
  //   hidden: true,
  // },
  {
    name: "navigation.blog",
    path: "/blog",
  },
  {
    name: "navigation.appSettings",
    path: "/app-settings",
  },
  {
    name: "navigation.blog",
    path: "/blog/:slug",
    hidden: true,
  },
  {
    name: "navigation.blog",
    path: "/blog/:slug/edit",
    hidden: true,
  },
  {
    name: "navigation.blog",
    path: "/blog/create",
    hidden: true,
  },
  {
    name: "navigation.reseller",
    path: "/reseller",
    // hidden: import.meta.env.VITE_PUBLIC_ENV !== "development",
    requireReseller: true
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
    name: "navigation.terms",
    path: "/terms-of-service",
    hidden: true,
  },
  {
    name: "navigation.refund",
    path: "/refund-policy",
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
    path: "/reseller/orders/:orderId",
    hidden: true,
  },
  {
    name: "navigation.graphql",
    path: "/graphql-export",
    hidden: true,
  },
  {
    name: "navigation.admin",
    path: "/admin",
    requireAdmin: true,
  },
  {
    name: "navigation.adminTickets",
    path: "/admin/tickets",
    hidden: true,
    requireAdmin: true,
  },
  {
    name: "navigation.adminTicketDetail",
    path: "/admin/tickets/:ticketId",
    hidden: true,
    requireAdmin: true,
  },
  {
    name: "navigation.adminTicketReply",
    path: "/admin/tickets/:ticketId/reply",
    hidden: true,
    requireAdmin: true,
  },
  {
    name: "navigation.offers",
    path: "/offers/:offerId",
    hidden: true,
  },
];
