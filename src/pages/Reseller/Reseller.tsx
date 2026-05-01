import { Typography } from '@mui/material';
import { FormattedMessage } from 'react-intl';
import { useState } from 'react';
import StoreTable from './components/StoreTable';
import CreditInventoryCard from './components/CreditInventoryCard';
import SalesBalancePanel from './components/SalesBalancePanel';
import { useHangarData } from '@/hooks';
import OrdersTable from './components/OrdersTable';
import { useNavigate } from 'react-router';
import ResponsiveSectionLayout, { type ResponsiveSectionLayoutItem } from '@/components/ResponsiveSectionLayout';

enum Page {
  MyStore = 'myStore',
  MyOrders = 'myOrders',
  SalesBalance = 'salesBalance',
}

export default function Reseller() {
  const [currentPage, setCurrentPage] = useState<Page>(Page.MyStore);
  const { ships, loading } = useHangarData();
  const navigate = useNavigate();
  const layoutItems: ResponsiveSectionLayoutItem[] = [
    {
      id: Page.MyStore,
      title: <FormattedMessage id="hangar.myStore" defaultMessage="My Store" />,
      description: <FormattedMessage id="hangar.myStoreDescription" defaultMessage="View your store here" />,
      active: currentPage === Page.MyStore,
      onSelect: () => setCurrentPage(Page.MyStore),
    },
    {
      id: Page.SalesBalance,
      title: <FormattedMessage id="reseller.balance.navTitle" defaultMessage="Sales Balance" />,
      description: <FormattedMessage id="reseller.balance.navDescription" defaultMessage="Review available and pending balance from sold items." />,
      active: currentPage === Page.SalesBalance,
      onSelect: () => setCurrentPage(Page.SalesBalance),
    },
    {
      id: Page.MyOrders,
      title: <FormattedMessage id="hangar.myOrders" defaultMessage="My Orders" />,
      description: <FormattedMessage id="hangar.myOrdersDescription" defaultMessage="View your orders here" />,
      active: currentPage === Page.MyOrders,
      onSelect: () => setCurrentPage(Page.MyOrders),
    },
    {
      id: 'graphql-export',
      kind: 'action',
      title: <FormattedMessage id="reseller.graphqlExport.title" defaultMessage="GraphQL Export" />,
      description: (
        <FormattedMessage
          id="reseller.graphqlExport.description"
          defaultMessage="Request RSI GraphQL through the browser extension and download the JSON payload."
        />
      ),
      onSelect: () => navigate('/graphql-export'),
    },
  ];

  return (
    <ResponsiveSectionLayout
      items={layoutItems}
      mobileMenuLabel={<FormattedMessage id="reseller.switchSection" defaultMessage="切换" />}
      mobileMenuTitle={<FormattedMessage id="reseller.sections" defaultMessage="商家中心" />}
      contentClassName="min-h-0 flex-1 overflow-y-auto p-4"
    >
        {loading ? <Typography align="center"><FormattedMessage id="loading" defaultMessage="Loading..." /></Typography> : (<>
          {currentPage === Page.MyStore && (
            <div className='flex flex-col'>
              <CreditInventoryCard defaultExpanded={false} />
              <StoreTable ships={ships} />
            </div>
          )}
          {currentPage === Page.MyOrders && <OrdersTable />}
          {currentPage === Page.SalesBalance && <SalesBalancePanel />}
        </>)}
    </ResponsiveSectionLayout>
  );
}
