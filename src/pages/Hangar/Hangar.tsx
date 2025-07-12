import { Typography } from '@mui/material';
import { FormattedMessage } from 'react-intl';
import { useState } from 'react';
import HangarTable from './components/HangarTable';
import useHangarData from './hooks/useHangarData';
import ShipsTable from './components/ShipsTable';
import ShareTable from './components/ShareTable';
import StoreTable from './components/StoreTable';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { UserRole } from '../../store/userStore';
import { Button } from '@mui/material';
import { useNavigate } from 'react-router';

enum Page {
  Hangar = 'hangar',
  Ships = 'ships',
  Shared = 'shared',
  MyStore = 'myStore',
}

export default function Hangar() {
  const [currentPage, setCurrentPage] = useState<Page>(Page.Hangar);
  const { ships, loading, exchangeRates } = useHangarData();
  const { user } = useSelector((state: RootState) => state.user);
  const navigate = useNavigate();

  const isAuthenticated = user.role >= UserRole.User;
  const isReseller = [UserRole.Reseller, UserRole.Admin].includes(user.role);

  // 处理未登录用户点击共享标签页的情况
  const handlePageChange = (page: Page) => {
    if (page === Page.Shared && !isAuthenticated) {
      // 不切换页面，保持当前页面
      return;
    }
    setCurrentPage(page);
  };

  return (
    <div className='absolute top-[65px] h-[calc(100vh-65px)] left-0 right-0 bottom-0 flex text-left flex-col md:flex-row justify-start'>
      <div className='flex flex-col text-left min-w-[300px] border-r border-b border-gray-200 dark:border-gray-800'>

        <div className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.Hangar ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => handlePageChange(Page.Hangar)}>
          <FormattedMessage id="hangar.hangar" defaultMessage="Hangar" />
          <Typography variant='body2' color='text.secondary'>
            <FormattedMessage id="hangar.hangarDescription" defaultMessage="View items in your hangar here" />
          </Typography>
        </div>
        <div className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.Ships ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => handlePageChange(Page.Ships)}>
          <FormattedMessage id="hangar.ships" defaultMessage="Ships" />
          <Typography variant='body2' color='text.secondary'>
            <FormattedMessage id="hangar.shipsDescription" defaultMessage="View ships and set predictions here" />
          </Typography>
        </div>
        {isAuthenticated && <div className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.Shared ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => handlePageChange(Page.Shared)}>
          <FormattedMessage id="hangar.shared" defaultMessage="Shared" />
          <Typography variant='body2' color='text.secondary'>
            <FormattedMessage id="hangar.sharedDescription" defaultMessage="View shared content here" />
          </Typography>
        </div>}
        {isReseller && <div className={`text-lg flex flex-col gap-2 justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-4 py-2 ${currentPage === Page.MyStore ? 'bg-gray-100 dark:bg-gray-800' : ''}`} onClick={() => handlePageChange(Page.MyStore)}>
          <FormattedMessage id="hangar.myStore" defaultMessage="My Store" />
          <Typography variant='body2' color='text.secondary'>
            <FormattedMessage id="hangar.myStoreDescription" defaultMessage="View your store here" />
          </Typography>
        </div>}
      </div>

      <div className='p-4 w-full h-[calc(100vh-128px-65px)] overflow-y-auto sm:mt-28'>
        {loading ? <Typography align="center"><FormattedMessage id="loading" defaultMessage="Loading..." /></Typography> : (<>
          {currentPage === Page.Hangar && <HangarTable ships={ships} />}
          {currentPage === Page.Ships && <ShipsTable ships={ships} />}
          {currentPage === Page.MyStore && <StoreTable ships={ships} />}
          {currentPage === Page.Shared && isAuthenticated ? (
            <ShareTable ships={ships} exchangeRates={exchangeRates} />
          ) : currentPage === Page.Shared && (
            <div className="flex flex-col items-center justify-center h-full">
              <Typography variant="h6" align="center" gutterBottom>
                <FormattedMessage id="hangar.loginToAccess" defaultMessage="Please login to access shared content" />
              </Typography>
              <Button
                variant="contained"
                color="primary"
                onClick={() => navigate('/login')}
                sx={{ mt: 2 }}
              >
                <FormattedMessage id="hangar.login" defaultMessage="Login" />
              </Button>
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}
