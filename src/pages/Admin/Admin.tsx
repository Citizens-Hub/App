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
  Withdrawals = 'withdrawals',
  Tickets = 'tickets',
  NewUserCoupon = 'newUserCoupon',
  GoogleAdsAudience = 'googleAdsAudience',
  Orders = 'orders',
}

export default function Admin() {
  const [currentPage, setCurrentPage] = useState<Page>(Page.Errors);
  const layoutItems: ResponsiveSectionLayoutItem[] = [
    {
      id: Page.Errors,
      title: <FormattedMessage id="admin.errors" defaultMessage="Catched Errors" />,
      description: <FormattedMessage id="admin.erroesDescription" defaultMessage="View all catched errors" />,
      active: currentPage === Page.Errors,
      onSelect: () => setCurrentPage(Page.Errors),
    },
    {
      id: Page.Bi,
      title: <FormattedMessage id="admin.bi" defaultMessage="BI Reports" />,
      description: <FormattedMessage id="admin.biDescription" defaultMessage="View BI report data" />,
      active: currentPage === Page.Bi,
      onSelect: () => setCurrentPage(Page.Bi),
    },
    {
      id: Page.ShipTranslations,
      title: <FormattedMessage id="admin.shipTranslations.title" defaultMessage="Ship Translations" />,
      description: <FormattedMessage id="admin.shipTranslations.description" defaultMessage="Manage ship name and ship detail translations." />,
      active: currentPage === Page.ShipTranslations,
      onSelect: () => setCurrentPage(Page.ShipTranslations),
    },
    {
      id: Page.ManufacturerTranslations,
      title: <FormattedMessage id="admin.manufacturerTranslations.title" defaultMessage="Manufacturer Translations" />,
      description: <FormattedMessage id="admin.manufacturerTranslations.description" defaultMessage="Manage reusable manufacturer translations separately." />,
      active: currentPage === Page.ManufacturerTranslations,
      onSelect: () => setCurrentPage(Page.ManufacturerTranslations),
    },
    {
      id: Page.ShipSogModels,
      title: <FormattedMessage id="admin.shipSogModels.title" defaultMessage="Ship SOG Models" />,
      description: <FormattedMessage id="admin.shipSogModels.description" defaultMessage="Upload and configure SOG Gaussian model files." />,
      active: currentPage === Page.ShipSogModels,
      onSelect: () => setCurrentPage(Page.ShipSogModels),
    },
    {
      id: Page.ShipImages,
      title: <FormattedMessage id="admin.shipImages.title" defaultMessage="Ship Images" />,
      description: <FormattedMessage id="admin.shipImages.description" defaultMessage="Sync RSI ship images into the images R2 bucket." />,
      active: currentPage === Page.ShipImages,
      onSelect: () => setCurrentPage(Page.ShipImages),
    },
    {
      id: Page.ShipItemIds,
      title: <FormattedMessage id="admin.shipItemIds.title" defaultMessage="Ship Item IDs" />,
      description: <FormattedMessage id="admin.shipItemIds.description" defaultMessage="Maintain crawler item ID fallback mappings for ship matching." />,
      active: currentPage === Page.ShipItemIds,
      onSelect: () => setCurrentPage(Page.ShipItemIds),
    },
    {
      id: Page.WatermarkDebug,
      title: <FormattedMessage id="admin.watermarkDebug.title" defaultMessage="Watermark Debug Tool" />,
      description: <FormattedMessage id="admin.watermarkDebug.description" defaultMessage="Upload an exported image or a compressed copy to inspect anchor alignment, decode confidence, and recovered route summary." />,
      active: currentPage === Page.WatermarkDebug,
      onSelect: () => setCurrentPage(Page.WatermarkDebug),
    },
    {
      id: Page.ConciergePaints,
      title: <FormattedMessage id="admin.conciergePaints.title" defaultMessage="Concierge Paints" />,
      description: <FormattedMessage id="admin.conciergePaints.description" defaultMessage="Use the browser extension to read RSI paint listings, filter concierge items by isVip, then batch list, update, or delist the managed paint catalog." />,
      active: currentPage === Page.ConciergePaints,
      onSelect: () => setCurrentPage(Page.ConciergePaints),
    },
    {
      id: Page.GameShops,
      title: <FormattedMessage id="admin.gameShops.title" defaultMessage="Game Shops" />,
      description: <FormattedMessage id="admin.gameShops.description" defaultMessage="Manage imported in-game shop data independently from RSI ship and CCU data." />,
      active: currentPage === Page.GameShops,
      onSelect: () => setCurrentPage(Page.GameShops),
    },
    {
      id: Page.NewUserCoupon,
      title: <FormattedMessage id="admin.newUserCoupon.title" defaultMessage="New User Coupons" />,
      description: <FormattedMessage id="admin.newUserCoupon.description" defaultMessage="Configure signup coupons and referral reward behavior." />,
      active: currentPage === Page.NewUserCoupon,
      onSelect: () => setCurrentPage(Page.NewUserCoupon),
    },
    {
      id: Page.GoogleAdsAudience,
      title: <FormattedMessage id="admin.googleAdsAudience.title" defaultMessage="Google Ads Customer Match" />,
      description: <FormattedMessage id="admin.googleAdsAudience.description" defaultMessage="Manually build or refresh a Google Customer Match audience from consented paid buyers." />,
      active: currentPage === Page.GoogleAdsAudience,
      onSelect: () => setCurrentPage(Page.GoogleAdsAudience),
    },
    {
      id: Page.Orders,
      title: <FormattedMessage id="admin.orders.title" defaultMessage="Order Management" />,
      description: <FormattedMessage id="admin.orders.description" defaultMessage="Review all orders, inspect buyer information, and manually resend receipts." />,
      active: currentPage === Page.Orders,
      onSelect: () => setCurrentPage(Page.Orders),
    },
    {
      id: Page.Tickets,
      title: <FormattedMessage id="admin.tickets.title" defaultMessage="Support Tickets" />,
      description: <FormattedMessage id="admin.tickets.description" defaultMessage="Review user support tickets, reply to messages, and close resolved requests." />,
      active: currentPage === Page.Tickets,
      onSelect: () => setCurrentPage(Page.Tickets),
    },
    {
      id: Page.Withdrawals,
      title: <FormattedMessage id="admin.withdrawals.title" defaultMessage="Withdrawal Requests" />,
      description: <FormattedMessage id="admin.withdrawals.description" defaultMessage="Review reseller withdrawal requests, confirm payouts, or reject invalid requests." />,
      active: currentPage === Page.Withdrawals,
      onSelect: () => setCurrentPage(Page.Withdrawals),
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
        {currentPage === Page.GameShops && <GameShopsManager />}
        {currentPage === Page.NewUserCoupon && <NewUserCouponSettingsManager />}
        {currentPage === Page.GoogleAdsAudience && <GoogleAdsAudienceManager />}
        {currentPage === Page.Orders && <OrdersManager />}
        {currentPage === Page.Tickets && <TicketsManager />}
        {currentPage === Page.Withdrawals && <WithdrawalRequestsManager />}
    </ResponsiveSectionLayout>
  );
}
