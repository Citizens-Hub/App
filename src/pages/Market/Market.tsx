import React, { useState } from 'react';
import {
  Typography,
  Button,
  TextField,
  InputAdornment,
  IconButton,
  Badge,
  Box,
  CircularProgress,
  Snackbar,
  Alert,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TablePagination,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Tooltip,
  Fab
} from '@mui/material';
import { Search, ReceiptLongOutlined, Add, Remove } from '@mui/icons-material';
import { FormattedMessage, useIntl } from 'react-intl';
import useMarketData from './hooks/useMarketData';
import useCart from './hooks/useCart';
import CartDrawer from './components/CartDrawer';
import { ListingItem, CartItem as CartItemType, Resource } from '../../types';
import { ChevronsRight } from 'lucide-react';

const Market: React.FC = () => {
  const intl = useIntl();
  const { ships, listingItems, loading, error } = useMarketData();
  const { cart, cartOpen, addToCart, removeFromCart, openCart, closeCart } = useCart();
  const [searchTerm, setSearchTerm] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [showInStock, setShowInStock] = useState(true);
  const isMobile = window.innerWidth < 768;

  // 过滤商品
  const filteredItems = listingItems.filter(item =>
    (item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.item.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (showInStock ? item.stock > 0 : true)
  );

  // 排序商品：先按库存状态排序（有库存的在前），然后按价格排序（价格高的在前）
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (a.stock > 0 && b.stock === 0) return -1;
    if (a.stock === 0 && b.stock > 0) return 1;
    return b.price - a.price;
  });

  // 分页
  const paginatedItems = sortedItems.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  // 处理分页
  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // 处理筛选器变化
  const handleStockFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setShowInStock(event.target.checked);
    setPage(0); // 重置页码
  };

  // 获取对应的船只信息
  const getShipDetails = (id: number) => {
    // 这里可以根据skuId查找对应的ship信息
    return ships.find(ship => ship.id === id);
  };

  // 添加到购物车
  const handleAddToCart = (item: ListingItem) => {
    const itemDetails = JSON.parse(item.item);
    const fromShip = getShipDetails(itemDetails.from);
    const toShip = getShipDetails(itemDetails.to);

    // 创建购物车项目
    const cartItem: Resource = {
      id: item.skuId,
      name: item.name,
      title: item.name,
      subtitle: item.item,
      excerpt: '',
      type: 'ship',
      media: {
        thumbnail: {
          storeSmall: toShip?.medias?.productThumbMediumAndSmall || fromShip?.medias?.productThumbMediumAndSmall || ''
        },
        list: [
          { slideshow: fromShip?.medias?.productThumbMediumAndSmall || '' },
          { slideshow: toShip?.medias?.productThumbMediumAndSmall || '' }
        ]
      },
      nativePrice: {
        amount: item.price * 100, // 价格单位转换
        discounted: item.price * 100,
        taxDescription: []
      },
      stock: {
        available: item.stock > 0,
        level: item.stock > 5 ? 'high' : item.stock > 0 ? 'low' : 'none'
      },
      isPackage: false
    };

    addToCart(cartItem);

    // 显示成功消息
    setSnackbarMessage(intl.formatMessage({ id: 'market.addedToCart', defaultMessage: 'Added to cart' }));
    setSnackbarSeverity('success');
    setSnackbarOpen(true);
  };

  // 搜索框变更
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setPage(0); // 重置页码
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 px-8 py-4 overflow-auto max-w-[1280px] mx-auto'>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, md: { mt: 0 } }} className="app-header">
        <div className='flex flex-row items-center gap-4'>
          <Typography variant={isMobile ? "h6" : "h5"}>
            <FormattedMessage id="market.title" defaultMessage="Market" />
          </Typography>
        </div>

        {!isMobile && (
          <Tooltip title={intl.formatMessage({ id: 'cart.view', defaultMessage: 'View Cart' })}>
            <div className='p-2 pb-0 cart-button'>
              <IconButton color="primary" onClick={openCart}>
                <Badge badgeContent={cart.length} color="secondary">
                  <ReceiptLongOutlined />
                </Badge>
              </IconButton>
            </div>
          </Tooltip>
        )}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
        <Box sx={{ flexGrow: 1, flexBasis: { xs: '100%', md: '60%' } }} className="search-box">
          <TextField
            fullWidth
            variant="outlined"
            placeholder={intl.formatMessage({ id: 'market.searchPlaceholder', defaultMessage: 'Search products...' })}
            value={searchTerm}
            onChange={handleSearchChange}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                )
              }
            }}
            size="small"
          />
        </Box>
        <Box sx={{ flexGrow: 1, flexBasis: { xs: '100%', md: '40%' } }}>
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 2, py: 1, display: 'flex', alignItems: 'center' }}>
            <FormGroup row sx={{ width: '100%', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showInStock}
                      onChange={handleStockFilterChange}
                      size="small"
                      color="primary"
                    />
                  }
                  label={intl.formatMessage({ id: 'market.filter.showInStock', defaultMessage: 'Show in stock only' })}
                  sx={{ minWidth: 'auto', mr: 0 }}
                />
              </Box>
            </FormGroup>
          </Box>
        </Box>
      </Box>

      {paginatedItems.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h6">
            <FormattedMessage id="market.noResults" defaultMessage="No products found" />
          </Typography>
        </Box>
      ) : (
        <Box sx={{ width: '100%', overflow: 'auto' }} className="resource-card">
          <TableContainer sx={{ mb: 2 }}>
            <Table aria-label="products list table">
              <TableHead>
                <TableRow>
                  <TableCell width="320px">
                    <FormattedMessage id="market.image" defaultMessage="Image" />
                  </TableCell>
                  <TableCell>
                    <FormattedMessage id="market.details" defaultMessage="Details" />
                  </TableCell>
                  <TableCell width="180px">
                    <FormattedMessage id="market.price" defaultMessage="Price" />
                  </TableCell>
                  {/* <TableCell width="120px">
                    <FormattedMessage id="market.stock" defaultMessage="Stock" />
                  </TableCell> */}
                  <TableCell width="170px">
                    <FormattedMessage id="market.action" defaultMessage="Action" />
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedItems.map((item) => {
                  const itemDetails = JSON.parse(item.item);

                  const fromShip = getShipDetails(itemDetails.from);
                  const toShip = getShipDetails(itemDetails.to);
                  const isCCU = fromShip && toShip && fromShip.id !== toShip.id;

                  const inCart = cart.some((cartItem: CartItemType) => cartItem.resource.id === item.skuId);
                  const msrpDiff = isCCU && toShip && fromShip ? (toShip.msrp - fromShip.msrp) / 100 : 0;
                  const discount = msrpDiff > 0 ? ((msrpDiff - item.price) / msrpDiff * 100).toFixed(2) : '0.00';

                  return (
                    <TableRow hover key={`${item.skuId}-${item.belongsTo}`}>
                      <TableCell>
                        {isCCU ? (
                          <Box sx={{ position: 'relative', width: 320, height: 180, overflow: 'hidden' }}>
                            <Box
                              component="img"
                              sx={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                width: '35%',
                                height: '100%',
                                objectFit: 'cover',
                              }}
                              src={fromShip?.medias?.productThumbMediumAndSmall.replace('medium_and_small', 'large') || 'https://via.placeholder.com/280x160?text=No+Image'}
                              alt={fromShip?.name || ''}
                            />
                            <Box
                              component="img"
                              sx={{
                                position: 'absolute',
                                right: 0,
                                top: 0,
                                width: '65%',
                                height: '100%',
                                objectFit: 'cover',
                                boxShadow: '0 0 20px 0 rgba(0, 0, 0, 0.2)'
                              }}
                              src={toShip?.medias?.productThumbMediumAndSmall.replace('medium_and_small', 'large') || 'https://via.placeholder.com/280x160?text=No+Image'}
                              alt={toShip?.name || ''}
                            />
                            <div className='absolute bottom-0 left-0 right-0 p-2 bg-black/50 flex items-center justify-center'>
                              <span className='text-white text-sm'>{item.name}</span>
                            </div>
                            <div className='absolute top-[50%] left-[35%] -translate-y-[50%] -translate-x-[50%] text-white text-2xl font-bold'>
                              <ChevronsRight className='w-8 h-8' />
                            </div>
                            <div className='absolute top-2 right-2 p-2 bg-orange-400 flex items-center justify-center'>
                              <span className='text-white text-sm'>{discount}% Off</span>
                            </div>
                          </Box>
                        ) : (
                          <Box
                            component="img"
                            sx={{ width: 280, height: 160, objectFit: 'cover' }}
                            src={toShip?.medias?.productThumbMediumAndSmall || 'https://via.placeholder.com/280x160?text=No+Image'}
                            alt={item.name}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-col gap-2'>
                          <Typography variant="h6">{item.name}</Typography>
                          {isCCU && (
                            <>
                              <div className='flex items-center gap-1 text-gray-500'>
                                <Typography variant="body2">{fromShip?.name} - {toShip?.name}</Typography>
                              </div>
                              <Typography variant="body2" color="text.secondary">
                                <FormattedMessage id="market.officialPrice" defaultMessage="Official Price" />:
                                <span className='text-blue-500 ml-1'>US${(fromShip.msrp / 100).toFixed(2)} - US${(toShip.msrp / 100).toFixed(2)}</span>
                              </Typography>
                            </>
                          )}
                          <div className='flex items-center gap-1'>
                            <div className='text-gray-500 mr-2 dark:text-gray-400'>
                              <FormattedMessage id="market.available" defaultMessage="Available Stock" />:
                            </div>
                            <span className='text-blue-500'>{item.stock}</span>
                          </div>
                          {/* <Typography variant="caption" color="text.secondary">
                            <FormattedMessage id="market.seller" defaultMessage="Seller" />: {item.belongsTo}
                          </Typography> */}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isCCU && toShip && fromShip && (
                          <div className='flex flex-col gap-1'>
                            <div className='text-blue-500 text-2xl'>US${item.price.toFixed(2)}</div>
                            <div className='text-gray-500 line-through text-md'>US${(toShip.msrp - fromShip.msrp) / 100}</div>
                          </div>
                        )}
                        {!isCCU && (
                          <Typography variant="h6" color="primary">US${item.price.toFixed(2)}</Typography>
                        )}
                      </TableCell>
                      {/* <TableCell>
                        <Chip
                          label={item.stock > 0 ? item.stock.toString() : intl.formatMessage({ id: 'market.outOfStock', defaultMessage: 'Out of stock' })}
                          color={item.stock > 5 ? 'success' : item.stock > 0 ? 'warning' : 'error'}
                          size="small"
                        />
                      </TableCell> */}
                      <TableCell>
                        {inCart ? (
                          <Button
                            fullWidth
                            variant="contained"
                            color="secondary"
                            startIcon={<Remove />}
                            onClick={() => removeFromCart(item.skuId)}
                            size="small"
                          >
                            <FormattedMessage id="market.removeFromCart" defaultMessage="Remove" />
                          </Button>
                        ) : (
                          <Button
                            fullWidth
                            variant="contained"
                            color="primary"
                            startIcon={<Add />}
                            onClick={() => handleAddToCart(item)}
                            disabled={item.stock <= 0}
                            size="small"
                          >
                            <FormattedMessage id="market.addToCart" defaultMessage="Add to cart" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {!isMobile && (
            <TablePagination
              rowsPerPageOptions={[5, 10, 25]}
              component="div"
              count={filteredItems.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              labelRowsPerPage={intl.formatMessage({ id: 'pagination.rowsPerPage', defaultMessage: 'Rows per page:' })}
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${intl.formatMessage({ id: 'pagination.total', defaultMessage: 'Total' })} ${count} ${intl.formatMessage({ id: 'pagination.items', defaultMessage: 'items' })}`}
            />
          )}
        </Box>
      )}

      {/* 购物车抽屉 */}
      <CartDrawer
        open={cartOpen}
        cart={cart}
        onClose={closeCart}
        onRemoveFromCart={removeFromCart}
      />

      {/* 通知 */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          variant="filled"
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>

      {/* 移动端浮动购物按钮 */}
      {isMobile && (
        <Fab
          color="primary"
          aria-label="View Cart"
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
    </div>
  );
};

export default Market;
