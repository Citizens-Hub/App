import { 
  Typography, 
  Box,
  TablePagination,
  TextField,
  InputAdornment,
  Tooltip,
  IconButton,
  Badge,
  Fab,
  Button
} from '@mui/material';
import { Search, ReceiptLongOutlined } from '@mui/icons-material';
import Joyride, { TooltipRenderProps } from 'react-joyride';

// 导入自定义Hook
import useResourceData from './hooks/useResourceData';
import useSlideshow from './hooks/useSlideshow';
import useCart from './hooks/useCart';
import useSearch from './hooks/useSearch';
import useJoyride from './hooks/useJoyride';

// 导入自定义组件
import ResourceMobileView from './components/ResourceMobileView';
import ResourceDesktopView from './components/ResourceDesktopView';
import CartDrawer from './components/CartDrawer';
import CustomTooltip from './components/CustomTooltip';
import CustomBeacon from './components/CustomBeacon';
import { Link } from 'react-router';
import { useEffect } from 'react';
// import Navigation from '../../components/Navigation';

export default function ResourcesTable() {
  // 加载资源数据
  const { resources, loading, error, exchangeRate } = useResourceData();
  
  // 搜索和分页
  const { 
    page, 
    rowsPerPage, 
    searchTerm, 
    isMobile, 
    filteredResources, 
    paginatedResources,
    handleChangePage,
    handleChangeRowsPerPage,
    handleSearchChange
  } = useSearch(resources);

  useEffect(() => {
    document.title = '商店预览'
  }, [])
  
  // 幻灯片逻辑
  const { slideshowIndices, handlePrevSlide, handleNextSlide } = useSlideshow(
    resources, 
    true, 
    paginatedResources
  );
  
  // 购物车逻辑
  const { cart, cartOpen, addToCart, removeFromCart, openCart, closeCart } = useCart();

  // 新手引导逻辑
  const { run, steps, stepIndex, locale, handleJoyrideCallback } = useJoyride();

  if (loading) {
    return <Typography>加载中...</Typography>;
  }

  const allowedHosts = ['sc-sub.pages.dev', 'localhost', 'sc.oxdl.cn'];
  if (!allowedHosts.includes(window.location.hostname)) {
    return <Typography color="error">加载资源失败</Typography>;
  }

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }

  // 自定义的Tooltip渲染函数
  const tooltipComponent = (props: TooltipRenderProps) => <CustomTooltip {...props} locale={locale} />;

  return (
    <Box sx={{ width: '100%', overflow: 'hidden', px: isMobile ? 1 : 0 }}>
      {/* <Navigation /> */}
      <Joyride
        callback={handleJoyrideCallback}
        continuous
        hideCloseButton
        run={run}
        scrollToFirstStep
        showProgress
        showSkipButton
        stepIndex={stepIndex}
        steps={steps}
        locale={locale}
        tooltipComponent={tooltipComponent}
        beaconComponent={CustomBeacon}
        styles={{
          options: {
            zIndex: 10000,
          },
        }}
      />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }} className="app-header">
        <div className='flex flex-row items-center gap-4'>
          <Typography variant={isMobile ? "h6" : "h5"}>
            当前订阅商店商品列表
          </Typography>
          <Link to="/ccu-planner">
            <Button variant="text" color="primary">
              升级路线规划器
            </Button>
          </Link>
        </div>
        {!isMobile && (
          <Tooltip title="查看清单">
            <div className='p-2 pb-0 cart-button'>
              <IconButton onClick={openCart} color="primary">
                <Badge badgeContent={cart.length} color="secondary">
                  <ReceiptLongOutlined />
                </Badge>
              </IconButton>
            </div>
          </Tooltip>
        )}
      </Box>
      
      <Box sx={{ mb: 2 }} className="search-box">
        <TextField  
          fullWidth
          variant="outlined"
          placeholder="搜索商品名称..."
          value={searchTerm}
          onChange={handleSearchChange}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            },
          }}
          size="small"
        />
      </Box>
      
      <Box className="resource-card">
        {isMobile ? (
          <ResourceMobileView 
            resources={paginatedResources}
            slideshowIndices={slideshowIndices}
            exchangeRate={exchangeRate}
            cart={cart}
            onPrevSlide={handlePrevSlide}
            onNextSlide={handleNextSlide}
            onAddToCart={addToCart}
            onRemoveFromCart={removeFromCart}
          />
        ) : (
          <ResourceDesktopView 
            resources={paginatedResources}
            slideshowIndices={slideshowIndices}
            exchangeRate={exchangeRate}
            cart={cart}
            onPrevSlide={handlePrevSlide}
            onNextSlide={handleNextSlide}
            onAddToCart={addToCart}
            onRemoveFromCart={removeFromCart}
          />
        )}
      </Box>
      
      {!isMobile && (
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={filteredResources.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage={isMobile ? "每页:" : "每页行数:"}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / 共${count}项`}
        />
      )}

      {/* 移动端浮动购物清单按钮 */}
      {isMobile && (
        <Fab
          color="primary"
          aria-label="查看清单"
          onClick={openCart}
          className="cart-button"
          sx={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 1000
          }}
        >
          <Badge badgeContent={cart.length} color="secondary">
            <ReceiptLongOutlined />
          </Badge>
        </Fab>
      )}

      {/* 新手引导按钮 */}
      {/* <JoyrideButton startJoyride={startJoyride} locale={locale} /> */}

      <CartDrawer 
        open={cartOpen}
        cart={cart}
        exchangeRate={exchangeRate}
        onClose={closeCart}
        onRemoveFromCart={removeFromCart}
      />
    </Box>
  );
}