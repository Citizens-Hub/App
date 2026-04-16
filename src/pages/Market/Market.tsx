import React, { useDeferredValue, useMemo, useState } from 'react';
import {
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Box,
  CircularProgress,
  Snackbar,
  Alert,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Badge,
  ButtonGroup,
  Chip,
  MenuItem,
  Button,
  Divider,
  TablePagination,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import { FormattedMessage, useIntl } from 'react-intl';
import CartDrawer from './components/CartDrawer';
import MarketItemMedia from './components/MarketItemMedia';
import {
  ListingItem,
  CartItem as CartItemType,
  MarketItemType,
  MarketPackageKind,
  MarketSortMode,
  Resource,
} from '@/types';
import { Plus, ShoppingCart, Minus } from 'lucide-react';
import { useMarketData } from '@/hooks';
import { Link } from 'react-router';
import { useCartStore } from '@/hooks/useCartStore';
import { buildMarketResource, getMarketItemVisual } from '@/components/marketItemDisplay';
import {
  getAvailableStock,
  getListingBasePrice,
  getListingDiscountPercent,
} from './marketUtils';

const Market: React.FC = () => {
  const intl = useIntl();
  const { cart, cartOpen, addToCart, removeFromCart, openCart, closeCart, updateItemQuantity } = useCartStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(12);
  const [showInStock, setShowInStock] = useState(true);
  const [showCcus, setShowCcus] = useState(true);
  const [showPackages, setShowPackages] = useState(true);
  const [showMisc, setShowMisc] = useState(true);
  const [showCredit, setShowCredit] = useState(true);
  const [showStandaloneShips, setShowStandaloneShips] = useState(true);
  const [showBundles, setShowBundles] = useState(true);
  const [sortBy, setSortBy] = useState<MarketSortMode>('recommended');
  const [showAlert, setShowAlert] = useState(import.meta.env.VITE_PUBLIC_ENV !== 'development');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const marketQuery = useMemo(() => {
    const itemTypes: MarketItemType[] = [];
    const packageKinds: MarketPackageKind[] = [];

    if (showCcus) itemTypes.push('ccu');
    if (showPackages && (showStandaloneShips || showBundles)) itemTypes.push('package');
    if (showMisc) itemTypes.push('misc');
    if (showCredit) itemTypes.push('credit');
    if (showStandaloneShips) packageKinds.push('standalone_ship');
    if (showBundles) packageKinds.push('bundle');

    return {
      search: deferredSearchTerm,
      inStockOnly: showInStock,
      itemTypes,
      packageKinds,
      sortBy,
      page,
      limit: rowsPerPage,
    };
  }, [
    deferredSearchTerm,
    page,
    rowsPerPage,
    showBundles,
    showCcus,
    showCredit,
    showInStock,
    showMisc,
    showPackages,
    showStandaloneShips,
    sortBy,
  ]);
  const { ships, listingItems, pagination, loading, error } = useMarketData(marketQuery);

  const handleAddToCart = (item: ListingItem) => {
    const existingCartItem = cart.find((cartItem: CartItemType) => cartItem.resource.id === item.skuId);
    const availableStock = getAvailableStock(item);

    if (existingCartItem) {
      const currentQuantity = existingCartItem.quantity || 1;
      if (currentQuantity < availableStock) {
        updateItemQuantity(item.skuId, currentQuantity + 1);
        setSnackbarMessage(intl.formatMessage({ id: 'market.quantityUpdated', defaultMessage: 'Quantity updated' }));
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      }
      return;
    }

    const cartItem: Resource = buildMarketResource(item, ships);
    addToCart(cartItem);

    setSnackbarMessage(intl.formatMessage({ id: 'market.addedToCart', defaultMessage: 'Added to cart' }));
    setSnackbarSeverity('success');
    setSnackbarOpen(true);
  };

  const getAvailableStockByResourceId = (resourceId: string) => {
    if (resourceId.startsWith('credit-pool:')) {
      return Number.MAX_SAFE_INTEGER;
    }

    const item = listingItems.find((listingItem) => listingItem.skuId === resourceId);
    if (item) return getAvailableStock(item);

    return cart.find((cartItem) => cartItem.resource.id === resourceId)?.resource.marketAvailableStock ?? 0;
  };

  const getItemTypeLabel = (item: ListingItem) => {
    if (item.itemType === 'ccu') return 'CCU';
    if (item.itemType === 'package') {
      return intl.formatMessage({ id: 'market.filter.package', defaultMessage: 'Package' });
    }
    if (item.itemType === 'credit') {
      return intl.formatMessage({ id: 'market.filter.credit', defaultMessage: 'Credit' });
    }

    return intl.formatMessage({ id: 'market.filter.misc', defaultMessage: 'Misc' });
  };

  const getPackageKindLabel = (item: ListingItem) => {
    if (!item.packageKind) return null;

    if (item.packageKind === 'standalone_ship') {
      return intl.formatMessage({ id: 'market.filter.standaloneShip', defaultMessage: 'Standalone Ship' });
    }

    if (item.packageKind === 'bundle') {
      return intl.formatMessage({ id: 'market.filter.bundle', defaultMessage: 'Bundle' });
    }

    return item.packageKind;
  };

  const getItemSummary = (item: ListingItem) => {
    const visual = getMarketItemVisual(item, ships);

    if (item.itemType === 'ccu') {
      return `${visual.fromShipName || item.fromShipName || '-'} → ${visual.toShipName || item.toShipName || '-'}`;
    }

    if (item.itemType === 'package') {
      const parts = [
        visual.shipName || item.shipName,
        getPackageKindLabel(item),
        item.insuranceType,
      ].filter(Boolean);

      if (parts.length > 0) {
        return parts.join(' · ');
      }

      const shipCount = item.packageShips?.length || 0;
      const extraCount = item.packageItems?.length || 0;
      if (shipCount || extraCount) {
        return `${shipCount} ships · ${extraCount} extras`;
      }
    }

    if (item.itemType === 'credit') {
      const minAmount = item.creditOptions?.[0]?.amount;
      const maxAmount = item.creditOptions?.[item.creditOptions.length - 1]?.amount;
      const parts = [
        minAmount && maxAmount ? `Supported face values US$${minAmount}-US$${maxAmount}` : null,
        item.creditOptions?.length ? `${item.creditOptions.length} amount${item.creditOptions.length === 1 ? '' : 's'}` : null,
      ].filter(Boolean);

      if (parts.length > 0) {
        return parts.join(' · ');
      }
    }

    return item.description || item.externalRef || item.sourceKind || '';
  };

  if (loading && listingItems.length === 0 && pagination.total === 0) {
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
    <div className='absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-y-auto bg-white px-4 py-4 text-left md:px-8 dark:bg-transparent'>
      {showAlert && (
        <Alert
          severity="warning"
          sx={{ zIndex: 1000, position: 'fixed', top: 65, left: 0, right: 0, width: '100%', borderRadius: 0 }}
          onClose={() => {
            setShowAlert(false);
          }}
        >
          <div className="text-sm text-left">
            <FormattedMessage
              id="market.betaNotice"
              defaultMessage="This page is a test deployment and the order is run in the test environment. All the items listed are test items. Please do not place an order."
            />
          </div>
        </Alert>
      )}

      <div className='mx-auto flex w-full max-w-[1280px] flex-col gap-4'>
        <Box sx={{ display: 'flex', justifyContent: 'end', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
          <div className='flex items-center gap-3'>
            <Link to="/orders" className='rounded border border-black/10 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:text-slate-200 dark:hover:bg-neutral-800'>
              <FormattedMessage id="market.myOrders" defaultMessage="My Orders" />
            </Link>
            <IconButton
              onClick={openCart}
              sx={{ border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', borderRadius: 1 }}
            >
              <Badge badgeContent={cart.length} color="secondary" overlap="circular">
                <ShoppingCart className='h-6 w-6' />
              </Badge>
            </IconButton>
          </div>
        </Box>

        <div className='grid items-start grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,_1fr)]'>
          <div className='lg:sticky lg:top-4 lg:self-start'>
            <Box sx={{ borderRadius: 1, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                <FormattedMessage id="market.filter.availability" defaultMessage="Availability" />
              </Typography>
              <FormGroup>
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={showInStock}
                      onChange={(event) => {
                        setShowInStock(event.target.checked);
                        setPage(0);
                      }}
                      size="small"
                    />
                  )}
                  label={intl.formatMessage({ id: 'market.filter.showInStock', defaultMessage: 'In stock only' })}
                />
              </FormGroup>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                <FormattedMessage id="market.filter.type" defaultMessage="Item Type" />
              </Typography>
              <FormGroup>
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={showCcus}
                      onChange={(event) => {
                        setShowCcus(event.target.checked);
                        setPage(0);
                      }}
                      size="small"
                    />
                  )}
                  label={intl.formatMessage({ id: 'market.filter.ccu', defaultMessage: 'CCU' })}
                />
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={showPackages}
                      onChange={(event) => {
                        setShowPackages(event.target.checked);
                        setPage(0);
                      }}
                      size="small"
                    />
                  )}
                  label={intl.formatMessage({ id: 'market.filter.package', defaultMessage: 'Package' })}
                />
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={showMisc}
                      onChange={(event) => {
                        setShowMisc(event.target.checked);
                        setPage(0);
                      }}
                      size="small"
                    />
                  )}
                  label={intl.formatMessage({ id: 'market.filter.misc', defaultMessage: 'Misc' })}
                />
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={showCredit}
                      onChange={(event) => {
                        setShowCredit(event.target.checked);
                        setPage(0);
                      }}
                      size="small"
                    />
                  )}
                  label={intl.formatMessage({ id: 'market.filter.credit', defaultMessage: 'Credit' })}
                />
              </FormGroup>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                <FormattedMessage id="market.filter.packageKindSection" defaultMessage="Package Kind" />
              </Typography>
              <FormGroup>
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={showStandaloneShips}
                      onChange={(event) => {
                        setShowStandaloneShips(event.target.checked);
                        setPage(0);
                      }}
                      size="small"
                    />
                  )}
                  label={intl.formatMessage({ id: 'market.filter.standaloneShip', defaultMessage: 'Standalone Ship' })}
                />
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={showBundles}
                      onChange={(event) => {
                        setShowBundles(event.target.checked);
                        setPage(0);
                      }}
                      size="small"
                    />
                  )}
                  label={intl.formatMessage({ id: 'market.filter.bundle', defaultMessage: 'Bundle' })}
                />
              </FormGroup>
            </Box>
          </div>

          <div className='min-w-0'>
            <Box
              sx={{
                mb: 3,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 220px' },
                gap: 2,
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'background.paper',
                p: 2,
              }}
            >
              <TextField
                fullWidth
                variant="outlined"
                placeholder={intl.formatMessage({ id: 'market.searchPlaceholder', defaultMessage: 'Search products, ships, bundles...' })}
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(0);
                }}
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

              <TextField
                select
                fullWidth
                size="small"
                label={intl.formatMessage({ id: 'market.sort', defaultMessage: 'Sort' })}
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value as MarketSortMode);
                  setPage(0);
                }}
              >
                <MenuItem value="recommended">
                  {intl.formatMessage({ id: 'market.sort.recommended', defaultMessage: 'Recommended' })}
                </MenuItem>
                <MenuItem value="newest">
                  {intl.formatMessage({ id: 'market.sort.newest', defaultMessage: 'Newest' })}
                </MenuItem>
                <MenuItem value="priceDesc">
                  {intl.formatMessage({ id: 'market.sort.priceDesc', defaultMessage: 'Price: High to Low' })}
                </MenuItem>
                <MenuItem value="priceAsc">
                  {intl.formatMessage({ id: 'market.sort.priceAsc', defaultMessage: 'Price: Low to High' })}
                </MenuItem>
              </TextField>
            </Box>

            {listingItems.length === 0 ? (
              <Box sx={{ borderRadius: 1, border: '1px dashed', borderColor: 'divider', backgroundColor: 'background.paper', p: 6, textAlign: 'center' }}>
                <Typography variant="h6">
                  <FormattedMessage id="market.noResults" defaultMessage="No products found" />
                </Typography>
              </Box>
            ) : (
              <>
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3'>
                  {listingItems.map((item) => {
                    const availableStock = getAvailableStock(item);
                    const inCartItem = cart.find((cartItem: CartItemType) => cartItem.resource.id === item.skuId);
                    const inCartQuantity = inCartItem?.quantity || 0;
                    const basePrice = getListingBasePrice(item, ships);
                    const discount = getListingDiscountPercent(item, ships);
                    const isCredit = item.itemType === 'credit';
                    const packageShips = item.packageShips || [];
                    const packageItems = item.packageItems || [];

                    return (
                      <div
                        key={`${item.skuId}-${item.belongsTo}`}
                        className='flex h-full flex-col overflow-hidden rounded border border-gray-200 bg-white transition hover:border-gray-300 dark:border-gray-800 dark:bg-neutral-900 dark:hover:border-gray-700'
                      >
                        <Link to={`/market/${encodeURIComponent(item.skuId)}`} className='block'>
                          <MarketItemMedia
                            item={item}
                            ships={ships}
                            height={240}
                            badgeText={!isCredit && discount ? `${discount}% off` : null}
                          />
                        </Link>

                        <div className='flex flex-1 flex-col gap-4 p-5'>
                          <div className='flex flex-wrap gap-2'>
                            {getItemTypeLabel(item) !== "Package" && <Chip size="small" label={getItemTypeLabel(item)} />}
                            {item.packageKind && <Chip size="small" variant="outlined" label={getPackageKindLabel(item)} />}
                            {item.isBuyBack && (
                              <Chip
                                size="small"
                                color="warning"
                                label={intl.formatMessage({ id: 'market.filter.buyback', defaultMessage: 'Buyback' })}
                              />
                            )}
                          </div>

                          <div className='flex flex-1 flex-col gap-2'>
                            <Link to={`/market/${encodeURIComponent(item.skuId)}`} className='text-inherit no-underline'>
                              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.35 }}>
                                {item.name}
                              </Typography>
                            </Link>
                            <Typography variant="body2" color="text.secondary" sx={{ minHeight: 42 }}>
                              {getItemSummary(item)}
                            </Typography>
                            {item.itemType === 'package' && (packageShips.length > 0 || packageItems.length > 0) && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}
                              >
                                {[
                                  packageShips.length > 0 ? `${packageShips.length} ships` : null,
                                  packageItems.length > 0 ? `${packageItems.length} extras` : null,
                                ].filter(Boolean).join(' · ')}
                              </Typography>
                            )}
                          </div>

                          <div className='mt-auto flex flex-col gap-4'>
                            <div className='flex items-end justify-between gap-3'>
                              <div className='flex flex-col gap-1'>
                                <div className='text-xl font-semibold text-slate-900 dark:text-slate-100'>
                                  {isCredit ? `From US$${item.price.toFixed(2)}` : `US$${item.price.toFixed(2)}`}
                                </div>
                                {discount && Number(discount) > 0 && (
                                  <div className='text-sm text-slate-500 line-through dark:text-slate-400'>
                                    US${basePrice.toFixed(2)}
                                  </div>
                                )}
                              </div>
                              <div className='text-right text-sm text-slate-500 dark:text-slate-400'>
                                <div>
                                  {isCredit
                                    ? <FormattedMessage id="market.credit.amountCount" defaultMessage="Available Amounts" />
                                    : <FormattedMessage id="market.available" defaultMessage="Available Stock" />}
                                </div>
                                <div className='font-semibold text-[#1d4ed8]'>
                                  {isCredit ? (item.creditOptions?.length || 0) : availableStock}
                                </div>
                              </div>
                            </div>

                            <Divider />

                            <div className='flex items-center justify-between gap-3'>
                              <Link
                                to={`/market/${encodeURIComponent(item.skuId)}`}
                                className='text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300'
                              >
                                <FormattedMessage id="market.viewDetails" defaultMessage="View details" />
                              </Link>

                              {isCredit ? (
                                <Button
                                  variant="outlined"
                                  component={Link}
                                  to={`/market/${encodeURIComponent(item.skuId)}`}
                                  size="small"
                                >
                                  <FormattedMessage id="market.credit.chooseAmount" defaultMessage="Choose amount" />
                                </Button>
                              ) : inCartItem ? (
                                <ButtonGroup size="small" aria-label="quantity">
                                  <IconButton
                                    size="small"
                                    onClick={() => {
                                      if (inCartQuantity > 1) {
                                        updateItemQuantity(item.skuId, inCartQuantity - 1);
                                      } else {
                                        removeFromCart(item.skuId);
                                      }
                                    }}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </IconButton>
                                  <Typography sx={{ px: 2, display: 'flex', alignItems: 'center', border: '1px solid', borderColor: 'divider' }}>
                                    {inCartQuantity}
                                  </Typography>
                                  <IconButton
                                    size="small"
                                    disabled={inCartQuantity >= availableStock}
                                    onClick={() => {
                                      if (inCartQuantity < availableStock) {
                                        updateItemQuantity(item.skuId, inCartQuantity + 1);
                                      }
                                    }}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </IconButton>
                                </ButtonGroup>
                              ) : (
                                <Button
                                  variant="outlined"
                                  onClick={() => handleAddToCart(item)}
                                  disabled={availableStock <= 0}
                                  size="small"
                                >
                                  <FormattedMessage id="market.addToCart" defaultMessage="Add to cart" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Box sx={{ mt: 2, borderRadius: 1, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper' }}>
                  <TablePagination
                    rowsPerPageOptions={[12, 24, 36]}
                    component="div"
                    count={pagination.total}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={(_event, newPage) => setPage(newPage)}
                    onRowsPerPageChange={(event) => {
                      setRowsPerPage(parseInt(event.target.value, 10));
                      setPage(0);
                    }}
                    labelRowsPerPage={intl.formatMessage({ id: 'pagination.rowsPerPage', defaultMessage: 'Rows per page:' })}
                    labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${intl.formatMessage({ id: 'pagination.total', defaultMessage: 'Total' })} ${count}`}
                  />
                </Box>
              </>
            )}
          </div>
        </div>
      </div>

      <CartDrawer
        open={cartOpen}
        cart={cart}
        onClose={closeCart}
        onRemoveFromCart={removeFromCart}
        onUpdateQuantity={updateItemQuantity}
        getAvailableStock={getAvailableStockByResourceId}
      />

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
    </div>
  );
};

export default Market;
