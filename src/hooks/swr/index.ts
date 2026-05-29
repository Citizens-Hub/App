// 配置和基础函数
export { default as swrConfig, fetcher, authFetcher } from './swr-config';

// 通用API钩子
export { 
  useApi, 
  useAuthApi, 
  useUserProfile, 
  useUserSession 
} from './useApi';

// 基础功能钩子
export { default as useSharedHangar } from './useSharedHangar';

// 市场相关钩子
export { default as useMarketData } from './market/useMarketData';
export { default as useMarketItemData } from './market/useMarketItemData';
export { useMarketCartValidation } from './market/useMarketCartValidation';
export { useMarketHomeSettings, useAdminMarketHomeSettings } from './market/useMarketHomeSettings';
export { useMarketReviews } from './market/useMarketReviews';
export { default as useAccountMarketData } from './accountMarket/useAccountMarketData';
export { default as useAccountMarketItemData } from './accountMarket/useAccountMarketItemData';
export { useResellerMedia } from './resellerMedia/useResellerMedia';
export { useUploadResellerMedia } from './resellerMedia/useUploadResellerMedia';
export { useDeleteResellerMedia } from './resellerMedia/useDeleteResellerMedia';

// 订单相关钩子
export { default as useOrdersData } from './orders/useOrdersData';
export { default as useOrderData } from './orders/useOrderData';
export { default as useRelatedOrdersData } from './orders/useRelatedOrdersData';
export { default as useRelatedOrderData } from './orders/useRelatedOrderData';
export { useUploadOrderReviewAttachment } from './orders/useUploadOrderReviewAttachment';
export { default as useTicketsData } from './tickets/useTicketsData';
export { default as useTicketData } from './tickets/useTicketData';
export { default as useTicketOrderOptions } from './tickets/useTicketOrderOptions';

// 机库相关钩子
export { default as useHangarData } from './hangar/useHangarData';
export { default as useHangarSync } from './hangar/useHangarSync';

// 资源相关钩子
export { default as useResourceData } from './resources/useResourceData';

// CCU Planner相关钩子
export { default as useCcuPlannerData } from './ccuPlanner/useCcuPlannerData';

// 用户配置相关钩子
export { default as useProfileData } from './profile/useProfileData';

// 共享数据相关钩子
export { default as useSharedData } from './share/useSharedData';
export { default as useShipsData } from './share/useShipsData';

// 价格历史相关钩子
export { default as usePriceHistoryData } from './priceHistory/usePriceHistoryData';

// Watchlist相关钩子
export { default as useWatchlistData } from './watchlist/useWatchlistData';
export { useNewUserCoupon, useAdminNewUserCouponSettings } from './useNewUserCoupon';
export { useAdminInvoiceSettings } from './useInvoiceSettings';
export { useSiteNotification, useAdminSiteNotification } from './useSiteNotification';
export { useAdminUsers } from './admin/useAdminUsers';

// Warbond Subscription相关钩子
export { default as useWarbondSubscription } from './warbondSubscription/useWarbondSubscription'; 
