import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
import MarketDetailDrawer, { type MarketDetailDrawerTab } from './components/MarketDetailDrawer';
import MarketItemMedia from './components/MarketItemMedia';
import {
  ListingItem,
  CartItem as CartItemType,
  MarketBrowseCategory,
  MarketItemType,
  MarketSortMode,
  Resource,
} from '@/types';
import { Plus, ShoppingCart, Minus } from 'lucide-react';
import { useMarketData } from '@/hooks';
import { Link } from 'react-router';
import { useCartStore } from '@/hooks/useCartStore';
import { buildMarketResource } from '@/components/marketItemDisplay';
import {
  getAvailableStock,
  getListingBasePrice,
  getListingDiscountPercent,
} from './marketUtils';
import {
  formatMarketDiscount,
  formatMarketPriceFrom,
  formatPackageContentsSummary,
  formatUsdPrice,
  getMarketBrowseCategoryLabel,
  getMarketItemTypeLabel,
  getMarketTagLabel,
} from './marketI18n';
import { getMarketItemDisplayName, getMarketItemSummary } from './marketDisplayI18n';

const Market: React.FC = () => {
  const intl = useIntl();
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const { cart, cartOpen, addToCart, removeFromCart, openCart, closeCart, updateItemQuantity } = useCartStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(12);
  const [showCcus, setShowCcus] = useState(false);
  const [showCredit, setShowCredit] = useState(false);
  const [showStandaloneShips, setShowStandaloneShips] = useState(false);
  const [showShipPackages, setShowShipPackages] = useState(false);
  const [showPaints, setShowPaints] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [showOcOnly, setShowOcOnly] = useState(false);
  const [sortBy, setSortBy] = useState<MarketSortMode>('recommended');
  const [detailTabs, setDetailTabs] = useState<MarketDetailDrawerTab[]>([]);
  const [activeDetailSkuId, setActiveDetailSkuId] = useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [detailDrawerCollapsed, setDetailDrawerCollapsed] = useState(false);
  // const [showAlert, setShowAlert] = useState(import.meta.env.VITE_PUBLIC_ENV !== 'development');
  const [showAlert, setShowAlert] = useState(false);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const marketQuery = useMemo(() => {
    const itemTypes: MarketItemType[] = [];
    const browseCategories: MarketBrowseCategory[] = [];

    if (showCcus) itemTypes.push('ccu');
    if (showCredit) itemTypes.push('credit');
    if (showStandaloneShips) browseCategories.push('standalone_ship');
    if (showShipPackages) browseCategories.push('ship_package');
    if (showPaints) browseCategories.push('paint');
    if (showOthers) browseCategories.push('other');

    return {
      search: deferredSearchTerm,
      itemTypes,
      browseCategories,
      tags: showOcOnly ? ['oc'] : [],
      sortBy,
      page,
      limit: rowsPerPage,
    };
  }, [
    deferredSearchTerm,
    page,
    rowsPerPage,
    showCcus,
    showCredit,
    showOcOnly,
    showOthers,
    showPaints,
    showShipPackages,
    showStandaloneShips,
    sortBy,
  ]);
  const { ships, listingItems, pagination, loading, refreshing, error } = useMarketData(marketQuery);

  useEffect(() => {
    pageContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [marketQuery]);

  const handleAddToCart = (item: ListingItem) => {
    if (item.itemType === 'ccu') {
      return;
    }

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

  const handleOpenDetails = (item: ListingItem) => {
    const label = getMarketItemDisplayName(intl, item, ships);

    setDetailTabs((prevTabs) => {
      const existingTabIndex = prevTabs.findIndex((tab) => tab.skuId === item.skuId);

      if (existingTabIndex >= 0) {
        const nextTabs = [...prevTabs];
        nextTabs[existingTabIndex] = { ...nextTabs[existingTabIndex], label };
        return nextTabs;
      }

      return [...prevTabs, { skuId: item.skuId, label }];
    });
    setActiveDetailSkuId(item.skuId);
    setDetailDrawerOpen(true);
    setDetailDrawerCollapsed(false);
  };

  const handleCloseAllDetailTabs = () => {
    setDetailTabs([]);
    setActiveDetailSkuId(null);
    setDetailDrawerOpen(false);
    setDetailDrawerCollapsed(false);
  };

  const handleCloseDetailTab = (skuId: string) => {
    setDetailTabs((prevTabs) => {
      const closingIndex = prevTabs.findIndex((tab) => tab.skuId === skuId);
      if (closingIndex === -1) return prevTabs;

      const nextTabs = prevTabs.filter((tab) => tab.skuId !== skuId);

      setActiveDetailSkuId((currentActiveSkuId) => {
        if (currentActiveSkuId !== skuId) return currentActiveSkuId;

        const fallbackTab = nextTabs[Math.max(0, closingIndex - 1)] || nextTabs[0] || null;
        return fallbackTab?.skuId || null;
      });

      if (nextTabs.length === 0) {
        setDetailDrawerOpen(false);
        setDetailDrawerCollapsed(false);
      }

      return nextTabs;
    });
  };

  const handleCollapseDetailDrawer = () => {
    setDetailDrawerOpen(false);
    setDetailDrawerCollapsed(detailTabs.length > 0);
  };

  const handleExpandDetailDrawer = () => {
    if (!detailTabs.length) return;

    setDetailDrawerOpen(true);
    setDetailDrawerCollapsed(false);
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
    <div
      ref={pageContainerRef}
      className='absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-y-auto bg-white px-4 py-4 text-left md:px-8 dark:bg-transparent'
    >
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
            <Link to="/orders" className='text-slate-700 transition dark:text-slate-200'>
              <FormattedMessage id="market.myOrders" defaultMessage="My Orders" />
            </Link>
            <Link to="/tickets" className='text-slate-700 transition dark:text-slate-200'>
              <FormattedMessage id="market.myTickets" defaultMessage="My Tickets" />
            </Link>
            <IconButton
              onClick={openCart}
              sx={{ border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', borderRadius: 0 }}
            >
              <Badge badgeContent={cart.length} color="secondary" overlap="circular">
                <ShoppingCart className='h-6 w-6' />
              </Badge>
            </IconButton>
          </div>
        </Box>

        <div className='grid items-start grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,_1fr)]'>
          <div className='lg:sticky lg:top-4 lg:self-start'>
            <Box sx={{ borderRadius: 0, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', p: 2 }}>
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
                      checked={showShipPackages}
                      onChange={(event) => {
                        setShowShipPackages(event.target.checked);
                        setPage(0);
                      }}
                      size="small"
                    />
                  )}
                  label={intl.formatMessage({ id: 'market.filter.shipPackage', defaultMessage: 'Ship Package' })}
                />
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={showPaints}
                      onChange={(event) => {
                        setShowPaints(event.target.checked);
                        setPage(0);
                      }}
                      size="small"
                    />
                  )}
                  label={intl.formatMessage({ id: 'market.filter.paint', defaultMessage: 'Paint' })}
                />
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={showOthers}
                      onChange={(event) => {
                        setShowOthers(event.target.checked);
                        setPage(0);
                      }}
                      size="small"
                    />
                  )}
                  label={intl.formatMessage({ id: 'market.filter.other', defaultMessage: 'Other' })}
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
                <FormattedMessage id="market.filter.tags" defaultMessage="Special Tags" />
              </Typography>
              <FormGroup>
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={showOcOnly}
                      onChange={(event) => {
                        setShowOcOnly(event.target.checked);
                        setPage(0);
                      }}
                      size="small"
                    />
                  )}
                  label={intl.formatMessage({ id: 'market.tag.oc', defaultMessage: 'OC' })}
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
                borderRadius: 0,
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
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: 0 }
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
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: 0 }
                }}
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

            <Box sx={{ position: 'relative' }}>
              {refreshing && (
                <Box
                  sx={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    mb: 2,
                    display: 'flex',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.5,
                      py: 0.75,
                      border: '1px solid',
                      borderColor: 'divider',
                      backgroundColor: 'background.paper',
                      boxShadow: 2,
                    }}
                  >
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                      <FormattedMessage id="market.loading" defaultMessage="Loading..." />
                    </Typography>
                  </Box>
                </Box>
              )}

            {listingItems.length === 0 ? (
              <Box sx={{ borderRadius: 0, border: '1px dashed', borderColor: 'divider', backgroundColor: 'background.paper', p: 6, textAlign: 'center' }}>
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
                    const isCcu = item.itemType === 'ccu';
                    const isVariantPriceRange = isCcu && (item.variantCount || 0) > 1;
                    const packageShips = item.packageShips || [];
                    const packageItems = item.packageItems || [];
                    const displayName = getMarketItemDisplayName(intl, item, ships);

                    return (
                      <div
                        key={`${item.skuId}-${item.belongsTo}`}
                        className='flex h-full flex-col overflow-hidden border border-gray-200 bg-white transition hover:border-gray-300 dark:border-gray-800 dark:bg-neutral-900 dark:hover:border-gray-700'
                      >
                        <div
                          className='block w-full cursor-pointer text-left'
                          onClick={() => handleOpenDetails(item)}
                        >
                          <MarketItemMedia
                            item={item}
                            ships={ships}
                            height={240}
                            badgeText={!isCredit && discount ? formatMarketDiscount(intl, discount) : null}
                          />
                        </div>

                        <div className='flex flex-1 flex-col gap-4 p-5'>
                          <div className='flex flex-wrap gap-2'>
                            {item.browseCategory && <Chip size="small" variant="outlined" label={getMarketBrowseCategoryLabel(intl, item.browseCategory)} />}
                            {item.itemType === 'ccu' && <Chip size="small" label={getMarketItemTypeLabel(intl, item.itemType)} />}
                            {item.itemType === 'credit' && <Chip size="small" label={getMarketItemTypeLabel(intl, item.itemType)} />}
                            {(item.tags || []).map((tag) => (
                              <Chip key={`${item.skuId}-${tag}`} size="small" color="warning" label={getMarketTagLabel(intl, tag)} />
                            ))}
                          </div>

                          <div className='flex flex-1 flex-col gap-2'>
                            <div
                              className='w-full cursor-pointer text-left text-inherit no-underline'
                              onClick={() => handleOpenDetails(item)}
                            >
                              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.35 }}>
                                {displayName}
                              </Typography>
                            </div>
                            <Typography variant="body2" color="text.secondary" sx={{ minHeight: 42 }}>
                              {getMarketItemSummary(intl, item, ships)}
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
                                {formatPackageContentsSummary(intl, packageShips.filter(ship => ship.shipId !== null).length, packageItems.length)}
                              </Typography>
                            )}
                          </div>

                          <div className='mt-auto flex flex-col gap-4'>
                            <div className='flex items-end justify-between gap-3'>
                              <div className='flex flex-col gap-1'>
                                <div className='text-xl font-semibold text-slate-900 dark:text-slate-100'>
                                  {isCredit || isVariantPriceRange
                                    ? formatMarketPriceFrom(intl, item.price)
                                    : formatUsdPrice(intl.locale, item.price)}
                                </div>
                                {discount && Number(discount) > 0 && (
                                  <div className='text-sm text-slate-500 line-through dark:text-slate-400'>
                                    {formatUsdPrice(intl.locale, basePrice)}
                                  </div>
                                )}
                                {typeof item.cost === 'number' && (
                                  <div className='text-sm text-slate-500 dark:text-slate-400'>
                                    {intl.formatMessage(
                                      { id: 'market.detail.meltValueSummary', defaultMessage: 'Exchange value: {value}' },
                                      { value: formatUsdPrice(intl.locale, item.cost) },
                                    )}
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
                                  {isCredit ? (item.creditOptions?.length || 0) : availableStock > 10 ? "A lot" : availableStock}
                                </div>
                              </div>
                            </div>

                            <Divider />

                            <div className='flex items-center justify-between gap-3'>
                              {/* <Link
                                to={`/market/${encodeURIComponent(item.skuId)}`}
                                className='text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300'
                              >
                                {isCcu ? (
                                  <FormattedMessage
                                    id="market.viewDetails"
                                    defaultMessage="View details"
                                  />
                                ) : (
                                  <FormattedMessage id="market.viewDetails" defaultMessage="View details" />
                                )}
                              </Link> */}

                              {isCredit ? (
                                <Button
                                  variant="outlined"
                                  onClick={() => handleOpenDetails(item)}
                                  size="small"
                                >
                                  <FormattedMessage id="market.credit.chooseAmount" defaultMessage="Choose amount" />
                                </Button>
                              ) : isCcu ? (
                                <Button
                                  variant="outlined"
                                  onClick={() => handleOpenDetails(item)}
                                  size="small"
                                >
                                  <FormattedMessage
                                    id="market.viewDetails"
                                    defaultMessage="View details"
                                  />
                                </Button>
                              ) : inCartItem ? (
                                <ButtonGroup
                                  size="small"
                                  aria-label={intl.formatMessage({ id: 'market.quantityControls', defaultMessage: 'Quantity controls' })}
                                >
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

                <Box sx={{ mt: 2, borderRadius: 0, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper' }}>
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
            </Box>
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

      <MarketDetailDrawer
        open={detailDrawerOpen}
        collapsed={detailDrawerCollapsed}
        tabs={detailTabs}
        activeSkuId={activeDetailSkuId}
        onChangeTab={setActiveDetailSkuId}
        onCloseAll={handleCloseAllDetailTabs}
        onCloseTab={handleCloseDetailTab}
        onCollapse={handleCollapseDetailDrawer}
        onExpand={handleExpandDetailDrawer}
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
