import { Typography } from '@mui/material';
import { FormattedMessage } from 'react-intl';
import { useState } from 'react';
import StoreTable from './components/StoreTable';
import { useHangarData } from '@/hooks';
import OrdersTable from './components/OrdersTable';

enum Page {
  MyStore = 'myStore',
  MyOrders = 'myOrders',
}

export default function Hangar() {
  const [currentPage, setCurrentPage] = useState<Page>(Page.MyOrders);
  const { ships, loading } = useHangarData();

  return (
    <div className='absolute top-[65px] h-[calc(100vh-65px)] left-0 right-0 bottom-0 flex text-left flex-col md:flex-row justify-start'>
      <div className='flex flex-col text-left min-w-[300px] border-r border-b border-gray-200 dark:border-gray-800'>
        <div className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.MyStore ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => setCurrentPage(Page.MyStore)}>
          <FormattedMessage id="hangar.myStore" defaultMessage="My Store" />
          <Typography variant='body2' color='text.secondary'>
            <FormattedMessage id="hangar.myStoreDescription" defaultMessage="View your store here" />
          </Typography>
        </div>
        <div className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.MyOrders ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => setCurrentPage(Page.MyOrders)}>
          <FormattedMessage id="hangar.myOrders" defaultMessage="My Orders" />
          <Typography variant='body2' color='text.secondary'>
            <FormattedMessage id="hangar.myOrdersDescription" defaultMessage="View your orders here" />
          </Typography>
        </div>
      </div>

      <div className='p-4 w-full h-[calc(100vh-128px-65px)] overflow-y-auto sm:mt-28'>
        {loading ? <Typography align="center"><FormattedMessage id="loading" defaultMessage="Loading..." /></Typography> : (<>
          {currentPage === Page.MyStore && <StoreTable ships={ships} />}
          {currentPage === Page.MyOrders && <OrdersTable />}
        </>)}
      </div>
    </div>
  );
}
