import { Typography } from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useState } from 'react';
import HangarTable from './components/HangarTable';
import ShipsTable from './components/ShipsTable';
import ShareTable from './components/ShareTable';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { Button } from '@mui/material';
import { useNavigate } from 'react-router';
import { useHangarData } from '@/hooks';
import { UserRole } from '@/types';
import ResponsiveSectionLayout, { type ResponsiveSectionLayoutItem } from '@/components/ResponsiveSectionLayout';

enum Page {
  Hangar = 'hangar',
  Ships = 'ships',
  Shared = 'shared',
  MyStore = 'myStore',
}

export default function Hangar() {
  const intl = useIntl();
  const [currentPage, setCurrentPage] = useState<Page>(Page.Hangar);
  const { ships, loading, exchangeRates } = useHangarData();
  const { user } = useSelector((state: RootState) => state.user);
  const navigate = useNavigate();

  const isAuthenticated = user.role >= UserRole.User;
  // const isReseller = [UserRole.Reseller, UserRole.Admin].includes(user.role);

  // 处理未登录用户点击共享标签页的情况
  const handlePageChange = (page: Page) => {
    if (page === Page.Shared && !isAuthenticated) {
      // 不切换页面，保持当前页面
      return;
    }
    setCurrentPage(page);
  };

  const layoutItems: ResponsiveSectionLayoutItem[] = [
    {
      id: Page.Hangar,
      title: <FormattedMessage id="hangar.hangar" defaultMessage="Hangar" />,
      description: <FormattedMessage id="hangar.hangarDescription" defaultMessage="View items in your hangar here" />,
      ariaLabel: intl.formatMessage({ id: "hangar.hangar", defaultMessage: "Hangar" }),
      active: currentPage === Page.Hangar,
      onSelect: () => handlePageChange(Page.Hangar),
    },
  ];

  if (isAuthenticated) {
    layoutItems.push({
      id: Page.Shared,
      title: <FormattedMessage id="hangar.shared" defaultMessage="Shared" />,
      description: <FormattedMessage id="hangar.sharedDescription" defaultMessage="View shared content here" />,
      ariaLabel: intl.formatMessage({ id: "hangar.shared", defaultMessage: "Shared" }),
      active: currentPage === Page.Shared,
      onSelect: () => handlePageChange(Page.Shared),
    });
  }

  return (
    <ResponsiveSectionLayout
      items={layoutItems}
      mobileMenuLabel={<FormattedMessage id="hangar.switchSection" defaultMessage="切换" />}
      mobileMenuTitle={<FormattedMessage id="hangar.sections" defaultMessage="机库分组" />}
      contentClassName="min-h-0 flex-1 overflow-y-auto p-4"
    >
      {loading ? <Typography align="center"><FormattedMessage id="loading" defaultMessage="Loading..." /></Typography> : (<>
        {currentPage === Page.Hangar && <HangarTable ships={ships} />}
        {currentPage === Page.Ships && <ShipsTable ships={ships} />}
        {/* {currentPage === Page.MyStore && <StoreTable ships={ships} />} */}
        {currentPage === Page.Shared && isAuthenticated ? (
          <ShareTable ships={ships} exchangeRates={exchangeRates} />
        ) : currentPage === Page.Shared && (
          <div className="flex h-full flex-col items-center justify-center">
            <Typography variant="h6" align="center" gutterBottom>
              <FormattedMessage id="hangar.loginToAccess" defaultMessage="Please login to access shared content" />
            </Typography>
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('/login')}
              sx={{ mt: 2 }}
              aria-label={intl.formatMessage({ id: "hangar.login", defaultMessage: "Login" })}
            >
              <FormattedMessage id="hangar.login" defaultMessage="Login" />
            </Button>
          </div>
        )}
      </>)}
    </ResponsiveSectionLayout>
  );
}
