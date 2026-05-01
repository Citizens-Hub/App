import { FormattedMessage } from 'react-intl';
import { useState } from 'react';
import ErrorsTable from './components/ErrorsTable';
import BiTable from './components/BiTable';
import ManufacturerTranslationsManager from './components/ManufacturerTranslationsManager';
import ShipTranslationsManager from './components/ShipTranslationsManager';
import ShipSogModelsManager from './components/ShipSogModelsManager';
import GameShopsManager from './components/GameShopsManager';
import WithdrawalRequestsManager from './components/WithdrawalRequestsManager';
import ShipImagesManager from './components/ShipImagesManager';
import WatermarkDebugTool from './components/WatermarkDebugTool';
import ResponsiveSectionLayout, { type ResponsiveSectionLayoutItem } from '@/components/ResponsiveSectionLayout';

enum Page {
  Errors = 'errors',
  Bi = 'bi',
  ShipTranslations = 'shipTranslations',
  ManufacturerTranslations = 'manufacturerTranslations',
  ShipSogModels = 'shipSogModels',
  ShipImages = 'shipImages',
  WatermarkDebug = 'watermarkDebug',
  GameShops = 'gameShops',
  Withdrawals = 'withdrawals',
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
      id: Page.WatermarkDebug,
      title: <FormattedMessage id="admin.watermarkDebug.title" defaultMessage="Watermark Debug Tool" />,
      description: <FormattedMessage id="admin.watermarkDebug.description" defaultMessage="Upload an exported image or a compressed copy to inspect anchor alignment, decode confidence, and recovered route summary." />,
      active: currentPage === Page.WatermarkDebug,
      onSelect: () => setCurrentPage(Page.WatermarkDebug),
    },
    {
      id: Page.GameShops,
      title: <FormattedMessage id="admin.gameShops.title" defaultMessage="Game Shops" />,
      description: <FormattedMessage id="admin.gameShops.description" defaultMessage="Manage imported in-game shop data independently from RSI ship and CCU data." />,
      active: currentPage === Page.GameShops,
      onSelect: () => setCurrentPage(Page.GameShops),
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
        {currentPage === Page.WatermarkDebug && <WatermarkDebugTool />}
        {currentPage === Page.GameShops && <GameShopsManager />}
        {currentPage === Page.Withdrawals && <WithdrawalRequestsManager />}
    </ResponsiveSectionLayout>
  );
}
