import { FormattedMessage } from 'react-intl';
import { useState } from 'react';
import ErrorsTable from './components/ErrorsTable';
import BiTable from './components/BiTable';
import ManufacturerTranslationsManager from './components/ManufacturerTranslationsManager';
import ShipTranslationsManager from './components/ShipTranslationsManager';
import ShipSogModelsManager from './components/ShipSogModelsManager';
import GameShopsManager from './components/GameShopsManager';
import ShipItemIdMappingsManager from './components/ShipItemIdMappingsManager';
import WithdrawalRequestsManager from './components/WithdrawalRequestsManager';
import ShipImagesManager from './components/ShipImagesManager';
import WatermarkDebugTool from './components/WatermarkDebugTool';
import ConciergePaintsManager from './components/ConciergePaintsManager';
import TicketsManager from './components/TicketsManager';
import NewUserCouponSettingsManager from './components/NewUserCouponSettingsManager';
import OrdersManager from './components/OrdersManager';
import GoogleAdsAudienceManager from './components/GoogleAdsAudienceManager';
import MarketingOffersManager from './components/MarketingOffersManager';
import AdminGraphqlDebugger from './components/AdminGraphqlDebugger';
import AdminRsiOrderAutomation from './components/AdminRsiOrderAutomation';
import AdminCcuAutoCheckout from './components/AdminCcuAutoCheckout';
import SiteNotificationManager from './components/SiteNotificationManager';
import MarketHomeSettingsManager from './components/MarketHomeSettingsManager';
import AdminRecaptchaV3Tool from './components/AdminRecaptchaV3Tool';
import InvoiceSettingsManager from './components/InvoiceSettingsManager';
import AdminMaintenanceManager from './components/AdminMaintenanceManager';
import ResponsiveSectionLayout, { type ResponsiveSectionLayoutItem } from '@/components/ResponsiveSectionLayout';

enum Page {
  Errors = 'errors',
  Bi = 'bi',
  ShipTranslations = 'shipTranslations',
  ManufacturerTranslations = 'manufacturerTranslations',
  ShipSogModels = 'shipSogModels',
  ShipImages = 'shipImages',
  ShipItemIds = 'shipItemIds',
  WatermarkDebug = 'watermarkDebug',
  ConciergePaints = 'conciergePaints',
  GameShops = 'gameShops',
  MarketHome = 'marketHome',
  Withdrawals = 'withdrawals',
  Tickets = 'tickets',
  NewUserCoupon = 'newUserCoupon',
  InvoiceSettings = 'invoiceSettings',
  MarketingOffers = 'marketingOffers',
  GoogleAdsAudience = 'googleAdsAudience',
  Orders = 'orders',
  SiteNotification = 'siteNotification',
  GraphqlDebugger = 'graphqlDebugger',
  RsiOrderAutomation = 'rsiOrderAutomation',
  CcuAutoCheckout = 'ccuAutoCheckout',
  RecaptchaV3 = 'recaptchaV3',
  Maintenance = 'maintenance',
}

export default function Admin() {
  const [currentPage, setCurrentPage] = useState<Page>(Page.Errors);
  const groups = {
    monitoring: <FormattedMessage id="admin.group.monitoring" defaultMessage="监控" />,
    content: <FormattedMessage id="admin.group.content" defaultMessage="内容与资料" />,
    catalog: <FormattedMessage id="admin.group.catalog" defaultMessage="商品与目录" />,
    operations: <FormattedMessage id="admin.group.operations" defaultMessage="运营与订单" />,
    tools: <FormattedMessage id="admin.group.tools" defaultMessage="管理工具" />,
  } as const;
  const layoutItems: ResponsiveSectionLayoutItem[] = [
    {
      id: Page.Errors,
      title: <FormattedMessage id="admin.errors" defaultMessage="Catched Errors" />,
      description: <FormattedMessage id="admin.erroesDescription" defaultMessage="查看错误记录" />,
      groupId: 'monitoring',
      groupLabel: groups.monitoring,
      active: currentPage === Page.Errors,
      onSelect: () => setCurrentPage(Page.Errors),
    },
    {
      id: Page.Bi,
      title: <FormattedMessage id="admin.bi" defaultMessage="BI Reports" />,
      description: <FormattedMessage id="admin.biDescription" defaultMessage="查看 BI 报表" />,
      groupId: 'monitoring',
      groupLabel: groups.monitoring,
      active: currentPage === Page.Bi,
      onSelect: () => setCurrentPage(Page.Bi),
    },
    {
      id: Page.ShipTranslations,
      title: <FormattedMessage id="admin.shipTranslations.title" defaultMessage="Ship Translations" />,
      description: <FormattedMessage id="admin.shipTranslations.description" defaultMessage="管理舰船翻译。" />,
      groupId: 'content',
      groupLabel: groups.content,
      active: currentPage === Page.ShipTranslations,
      onSelect: () => setCurrentPage(Page.ShipTranslations),
    },
    {
      id: Page.ManufacturerTranslations,
      title: <FormattedMessage id="admin.manufacturerTranslations.title" defaultMessage="Manufacturer Translations" />,
      description: <FormattedMessage id="admin.manufacturerTranslations.description" defaultMessage="管理制造商翻译。" />,
      groupId: 'content',
      groupLabel: groups.content,
      active: currentPage === Page.ManufacturerTranslations,
      onSelect: () => setCurrentPage(Page.ManufacturerTranslations),
    },
    {
      id: Page.ShipSogModels,
      title: <FormattedMessage id="admin.shipSogModels.title" defaultMessage="Ship SOG Models" />,
      description: <FormattedMessage id="admin.shipSogModels.description" defaultMessage="管理 SOG 模型文件。" />,
      groupId: 'content',
      groupLabel: groups.content,
      active: currentPage === Page.ShipSogModels,
      onSelect: () => setCurrentPage(Page.ShipSogModels),
    },
    {
      id: Page.ShipImages,
      title: <FormattedMessage id="admin.shipImages.title" defaultMessage="Ship Images" />,
      description: <FormattedMessage id="admin.shipImages.description" defaultMessage="同步舰船图片。" />,
      groupId: 'content',
      groupLabel: groups.content,
      active: currentPage === Page.ShipImages,
      onSelect: () => setCurrentPage(Page.ShipImages),
    },
    {
      id: Page.ShipItemIds,
      title: <FormattedMessage id="admin.shipItemIds.title" defaultMessage="Ship Item IDs" />,
      description: <FormattedMessage id="admin.shipItemIds.description" defaultMessage="维护舰船 Item ID 映射。" />,
      groupId: 'content',
      groupLabel: groups.content,
      active: currentPage === Page.ShipItemIds,
      onSelect: () => setCurrentPage(Page.ShipItemIds),
    },
    {
      id: Page.ConciergePaints,
      title: <FormattedMessage id="admin.conciergePaints.title" defaultMessage="Concierge Paints" />,
      description: <FormattedMessage id="admin.conciergePaints.description" defaultMessage="管理礼宾部涂装目录。" />,
      groupId: 'catalog',
      groupLabel: groups.catalog,
      active: currentPage === Page.ConciergePaints,
      onSelect: () => setCurrentPage(Page.ConciergePaints),
    },
    {
      id: Page.MarketHome,
      title: <FormattedMessage id="admin.marketHome.title" defaultMessage="Market Home" />,
      description: <FormattedMessage id="admin.marketHome.navDescription" defaultMessage="配置市场主页 Hero。" />,
      groupId: 'catalog',
      groupLabel: groups.catalog,
      active: currentPage === Page.MarketHome,
      onSelect: () => setCurrentPage(Page.MarketHome),
    },
    {
      id: Page.GameShops,
      title: <FormattedMessage id="admin.gameShops.title" defaultMessage="Game Shops" />,
      description: <FormattedMessage id="admin.gameShops.description" defaultMessage="管理游戏内商店数据。" />,
      groupId: 'catalog',
      groupLabel: groups.catalog,
      active: currentPage === Page.GameShops,
      onSelect: () => setCurrentPage(Page.GameShops),
    },
    {
      id: Page.NewUserCoupon,
      title: <FormattedMessage id="admin.newUserCoupon.title" defaultMessage="New User Coupons" />,
      description: <FormattedMessage id="admin.newUserCoupon.description" defaultMessage="配置新用户优惠券。" />,
      groupId: 'operations',
      groupLabel: groups.operations,
      active: currentPage === Page.NewUserCoupon,
      onSelect: () => setCurrentPage(Page.NewUserCoupon),
    },
    {
      id: Page.InvoiceSettings,
      title: <FormattedMessage id="admin.invoiceSettings.title" defaultMessage="Invoice Settings" />,
      description: <FormattedMessage id="admin.invoiceSettings.description" defaultMessage="配置发票设置。" />,
      groupId: 'operations',
      groupLabel: groups.operations,
      active: currentPage === Page.InvoiceSettings,
      onSelect: () => setCurrentPage(Page.InvoiceSettings),
    },
    {
      id: Page.MarketingOffers,
      title: <FormattedMessage id="admin.marketingOffers.title" defaultMessage="Marketing Offers" />,
      description: <FormattedMessage id="admin.marketingOffers.description" defaultMessage="创建营销优惠。" />,
      groupId: 'operations',
      groupLabel: groups.operations,
      active: currentPage === Page.MarketingOffers,
      onSelect: () => setCurrentPage(Page.MarketingOffers),
    },
    {
      id: Page.GoogleAdsAudience,
      title: <FormattedMessage id="admin.googleAdsAudience.title" defaultMessage="Google Ads Customer Match" />,
      description: <FormattedMessage id="admin.googleAdsAudience.description" defaultMessage="管理 Google Ads 受众。" />,
      groupId: 'operations',
      groupLabel: groups.operations,
      active: currentPage === Page.GoogleAdsAudience,
      onSelect: () => setCurrentPage(Page.GoogleAdsAudience),
    },
    {
      id: Page.SiteNotification,
      title: <FormattedMessage id="admin.siteNotification.title" defaultMessage="Site Notification" />,
      description: <FormattedMessage id="admin.siteNotification.description" defaultMessage="发布全站通知。" />,
      groupId: 'operations',
      groupLabel: groups.operations,
      active: currentPage === Page.SiteNotification,
      onSelect: () => setCurrentPage(Page.SiteNotification),
    },
    {
      id: Page.Orders,
      title: <FormattedMessage id="admin.orders.title" defaultMessage="Order Management" />,
      description: <FormattedMessage id="admin.orders.description" defaultMessage="查看和处理订单。" />,
      groupId: 'operations',
      groupLabel: groups.operations,
      active: currentPage === Page.Orders,
      onSelect: () => setCurrentPage(Page.Orders),
    },
    {
      id: Page.Tickets,
      title: <FormattedMessage id="admin.tickets.title" defaultMessage="Support Tickets" />,
      description: <FormattedMessage id="admin.tickets.description" defaultMessage="处理售后工单。" />,
      groupId: 'operations',
      groupLabel: groups.operations,
      active: currentPage === Page.Tickets,
      onSelect: () => setCurrentPage(Page.Tickets),
    },
    {
      id: Page.Withdrawals,
      title: <FormattedMessage id="admin.withdrawals.title" defaultMessage="Withdrawal Requests" />,
      description: <FormattedMessage id="admin.withdrawals.description" defaultMessage="审核提现请求。" />,
      groupId: 'operations',
      groupLabel: groups.operations,
      active: currentPage === Page.Withdrawals,
      onSelect: () => setCurrentPage(Page.Withdrawals),
    },
    {
      id: Page.GraphqlDebugger,
      title: <FormattedMessage id="admin.graphqlDebugger.title" defaultMessage="GraphQL Debugger" />,
      description: <FormattedMessage id="admin.graphqlDebugger.description" defaultMessage="调试 GraphQL 请求。" />,
      groupId: 'tools',
      groupLabel: groups.tools,
      active: currentPage === Page.GraphqlDebugger,
      onSelect: () => setCurrentPage(Page.GraphqlDebugger),
    },
    {
      id: Page.WatermarkDebug,
      title: <FormattedMessage id="admin.watermarkDebug.title" defaultMessage="Watermark Debug Tool" />,
      description: <FormattedMessage id="admin.watermarkDebug.description" defaultMessage="检查导出图片水印。" />,
      groupId: 'tools',
      groupLabel: groups.tools,
      active: currentPage === Page.WatermarkDebug,
      onSelect: () => setCurrentPage(Page.WatermarkDebug),
    },
    {
      id: Page.RecaptchaV3,
      title: <FormattedMessage id="admin.recaptchaV3.title" defaultMessage="reCAPTCHA v3 Score Probe" />,
      description: <FormattedMessage id="admin.recaptchaV3.description" defaultMessage="检测 reCAPTCHA v3 评分。" />,
      groupId: 'tools',
      groupLabel: groups.tools,
      active: currentPage === Page.RecaptchaV3,
      onSelect: () => setCurrentPage(Page.RecaptchaV3),
    },
    {
      id: Page.Maintenance,
      title: <FormattedMessage id="admin.maintenance.title" defaultMessage="Task Runner & Cache Cleanup" />,
      description: <FormattedMessage id="admin.maintenance.description" defaultMessage="手动运行任务和清理缓存。" />,
      groupId: 'tools',
      groupLabel: groups.tools,
      active: currentPage === Page.Maintenance,
      onSelect: () => setCurrentPage(Page.Maintenance),
    },
    {
      id: Page.RsiOrderAutomation,
      title: <FormattedMessage id="admin.rsiOrderAutomation.title" defaultMessage="RSI Auto Checkout" />,
      description: <FormattedMessage id="admin.rsiOrderAutomation.description" defaultMessage="自动轮询并完成 RSI 结账。" />,
      groupId: 'tools',
      groupLabel: groups.tools,
      active: currentPage === Page.RsiOrderAutomation,
      onSelect: () => setCurrentPage(Page.RsiOrderAutomation),
    },
    {
      id: Page.CcuAutoCheckout,
      title: <FormattedMessage id="admin.ccuAutoCheckout.title" defaultMessage="CCU Bulk Checkout" />,
      description: <FormattedMessage id="admin.ccuAutoCheckout.description" defaultMessage="批量购买 CCU。" />,
      groupId: 'tools',
      groupLabel: groups.tools,
      active: currentPage === Page.CcuAutoCheckout,
      onSelect: () => setCurrentPage(Page.CcuAutoCheckout),
    },
  ];

  return (
    <ResponsiveSectionLayout
      items={layoutItems}
      mobileMenuLabel={<FormattedMessage id="admin.switchSection" defaultMessage="切换" />}
      mobileMenuTitle={<FormattedMessage id="admin.sections" defaultMessage="管理后台" />}
      contentClassName="min-h-0 flex-1 overflow-y-auto p-4"
    >
        {currentPage === Page.Errors && <ErrorsTable />}
        {currentPage === Page.Bi && <BiTable />}
        {currentPage === Page.ShipTranslations && <ShipTranslationsManager />}
        {currentPage === Page.ManufacturerTranslations && <ManufacturerTranslationsManager />}
        {currentPage === Page.ShipSogModels && <ShipSogModelsManager />}
        {currentPage === Page.ShipImages && <ShipImagesManager />}
        {currentPage === Page.ShipItemIds && <ShipItemIdMappingsManager />}
        {currentPage === Page.WatermarkDebug && <WatermarkDebugTool />}
        {currentPage === Page.ConciergePaints && <ConciergePaintsManager />}
        {currentPage === Page.MarketHome && <MarketHomeSettingsManager />}
        {currentPage === Page.GameShops && <GameShopsManager />}
        {currentPage === Page.NewUserCoupon && <NewUserCouponSettingsManager />}
        {currentPage === Page.InvoiceSettings && <InvoiceSettingsManager />}
        {currentPage === Page.MarketingOffers && <MarketingOffersManager />}
        {currentPage === Page.GoogleAdsAudience && <GoogleAdsAudienceManager />}
        {currentPage === Page.SiteNotification && <SiteNotificationManager />}
        {currentPage === Page.Orders && <OrdersManager />}
        {currentPage === Page.GraphqlDebugger && <AdminGraphqlDebugger />}
        {currentPage === Page.RecaptchaV3 && <AdminRecaptchaV3Tool />}
        {currentPage === Page.Maintenance && <AdminMaintenanceManager />}
        {currentPage === Page.RsiOrderAutomation && <AdminRsiOrderAutomation />}
        {currentPage === Page.CcuAutoCheckout && <AdminCcuAutoCheckout />}
        {currentPage === Page.Tickets && <TicketsManager />}
        {currentPage === Page.Withdrawals && <WithdrawalRequestsManager />}
    </ResponsiveSectionLayout>
  );
}
