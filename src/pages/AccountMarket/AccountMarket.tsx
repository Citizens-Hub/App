import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Snackbar,
  TablePagination,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ContentCopy, InfoOutlined, Search } from '@mui/icons-material';
import { Helmet } from 'react-helmet';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useSearchParams } from 'react-router';
import { ShoppingBag } from 'lucide-react';

import { useAccountMarketData } from '@/hooks';
import { AccountListingItem } from '@/types';
import {
  getAccountMarketCheckoutPath,
  getAccountMarketDetailPath,
  getAccountMarketListUrl,
  getMarketListPath,
} from '@/utils/marketLinks';
import { getMarketImageAssetUrl, resolveMarketImageUrls } from '@/utils/marketImages';
import {
  ACCOUNT_MARKET_COUPON_PERCENT_OFF,
  getMonthlyAccountCouponCode,
} from '@/utils/accountMarketCoupon';

const ACCOUNT_MARKET_DEFAULT_ROWS_PER_PAGE = 12;
const ACCOUNT_MARKET_ROWS_PER_PAGE_OPTIONS = [12, 24, 36] as const;
const ACCOUNT_MARKET_SEARCH_DEBOUNCE_MS = 300;

function parseNonNegativeInteger(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseRowsPerPage(value: string | null) {
  const parsed = Number.parseInt(value || '', 10);
  return ACCOUNT_MARKET_ROWS_PER_PAGE_OPTIONS.includes(parsed as typeof ACCOUNT_MARKET_ROWS_PER_PAGE_OPTIONS[number])
    ? parsed
    : ACCOUNT_MARKET_DEFAULT_ROWS_PER_PAGE;
}

function getAccountListingImages(item: AccountListingItem) {
  const listingImages = resolveMarketImageUrls(item.imageUrl, item.imageUrls);
  if (listingImages.length > 0) {
    return listingImages;
  }

  const entryImage = item.entries.find((entry) => entry.imageUrl)?.imageUrl;
  return entryImage ? [entryImage] : ['/imgs/credit.webp'];
}

function AccountListingCardImage({
  item,
}: {
  item: AccountListingItem;
}) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const images = getAccountListingImages(item);
  const selectedIndex = Math.min(activeImageIndex, images.length - 1);
  const selectedImage = images[selectedIndex] || '/imgs/credit.webp';

  return (
    <div className='relative h-[240px] w-full overflow-hidden bg-slate-100 dark:bg-neutral-800'>
      <img
        src={getMarketImageAssetUrl(selectedImage)}
        alt={item.name}
        className='h-full w-full object-cover'
      />
      {images.length > 1 && (
        <>
          <div className='absolute right-3 top-3 bg-black/60 px-2 py-1 text-xs font-semibold text-white'>
            {selectedIndex + 1}/{images.length}
          </div>
          <div className='absolute bottom-3 left-0 right-0 flex justify-center gap-1.5'>
            {images.map((imageUrl, index) => (
              <div
                key={`${imageUrl}-${index}`}
                aria-label={`Show account listing image ${index + 1}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setActiveImageIndex(index);
                }}
                className={`h-1.5 rounded-full border-0 transition-all ${selectedIndex === index ? 'w-5 bg-white' : 'w-1.5 bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function GuideItem({
  title,
  body,
}: {
  title: string;
  body: ReactNode;
}) {
  return (
    <div className='border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-neutral-950'>
      <div className='text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400'>
        {title}
      </div>
      <div className='mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200'>
        {body}
      </div>
    </div>
  );
}

function getAccountListingMetadataLabels(
  intl: ReturnType<typeof useIntl>,
  metadata?: AccountListingItem['metadata'],
) {
  if (!metadata) {
    return [];
  }

  const labels: string[] = [];

  if (typeof metadata.hasGamePackage === 'boolean') {
    labels.push(intl.formatMessage(
      metadata.hasGamePackage
        ? { id: 'accountMarket.card.gameAccessYes', defaultMessage: 'Includes game access' }
        : { id: 'accountMarket.card.gameAccessNo', defaultMessage: 'No game access' },
    ));
  }

  if (typeof metadata.hasSquadron42 === 'boolean') {
    labels.push(intl.formatMessage(
      metadata.hasSquadron42
        ? { id: 'accountMarket.card.squadron42Yes', defaultMessage: 'Includes Squadron 42' }
        : { id: 'accountMarket.card.squadron42No', defaultMessage: 'No Squadron 42' },
    ));
  }

  if (metadata.conciergeLevel) {
    labels.push(intl.formatMessage(
      { id: 'accountMarket.card.conciergeLevel', defaultMessage: 'Concierge {value}' },
      { value: metadata.conciergeLevel },
    ));
  }

  if (typeof metadata.spendAmount === 'number' && Number.isFinite(metadata.spendAmount) && metadata.spendAmount >= 0) {
    labels.push(intl.formatMessage(
      { id: 'accountMarket.card.spendAmount', defaultMessage: 'Spent {value}' },
      { value: intl.formatNumber(metadata.spendAmount, { style: 'currency', currency: 'USD' }) },
    ));
  }

  return labels;
}

export default function AccountMarket() {
  const intl = useIntl();
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(() => searchParams.get('search') || '');
  const [copyFeedbackOpen, setCopyFeedbackOpen] = useState(false);

  const searchTerm = searchParams.get('search') || '';
  const page = parseNonNegativeInteger(searchParams.get('page'), 0);
  const rowsPerPage = parseRowsPerPage(searchParams.get('limit'));
  const accountCouponCode = getMonthlyAccountCouponCode();
  const hasActiveFilters = Boolean(searchTerm.trim() || page > 0 || rowsPerPage !== ACCOUNT_MARKET_DEFAULT_ROWS_PER_PAGE);
  const pageUrl = typeof window !== 'undefined' ? window.location.href : getAccountMarketListUrl();
  const canonicalUrl = getAccountMarketListUrl();

  const { listingItems, pagination, loading, refreshing, error } = useAccountMarketData({
    search: searchTerm,
    page,
    limit: rowsPerPage,
  });

  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    if (searchInput === searchTerm) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete('page');

      if (searchInput.trim()) {
        nextSearchParams.set('search', searchInput.trim());
      } else {
        nextSearchParams.delete('search');
      }

      setSearchParams(nextSearchParams, { replace: true });
    }, ACCOUNT_MARKET_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput, searchParams, searchTerm, setSearchParams]);

  useEffect(() => {
    pageContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page, rowsPerPage, searchTerm]);

  const handleUpdateSearchParams = (updater: (nextSearchParams: URLSearchParams) => void) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    updater(nextSearchParams);
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleCopyCouponCode = async () => {
    try {
      await navigator.clipboard.writeText(accountCouponCode);
      setCopyFeedbackOpen(true);
    } catch (error) {
      console.error('Failed to copy account coupon code:', error);
    }
  };

  const metaTitle = hasActiveFilters
    ? 'Account Market Search Results | Citizens\' Hub'
    : 'Star Citizen Account Market | Citizens\' Hub';
  const metaDescription = hasActiveFilters
    ? 'Browse filtered Star Citizen account listings with ships, legacy rewards, CCUs, and account-bound extras.'
    : 'Browse Star Citizen account listings with rare ships, legacy rewards, buyback items, and account-bound extras on Citizens\' Hub.';

  if (loading && listingItems.length === 0 && pagination.total === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error && listingItems.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta name="robots" content={hasActiveFilters ? 'noindex,follow' : 'index,follow'} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={canonicalUrl} />
      </Helmet>

      <div
        ref={pageContainerRef}
        className='absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-y-auto bg-white px-4 py-4 text-left md:px-8 dark:bg-transparent'
      >
        <div className='mx-auto flex w-full max-w-[1280px] flex-col gap-4'>
          <Box sx={{ display: 'flex', justifyContent: 'end', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
            <div className='flex items-center gap-3'>
              <Link to="/orders" className='text-slate-700 transition dark:text-slate-200'>
                <FormattedMessage id="market.myOrders" defaultMessage="My Orders" />
              </Link>
              <Link to="/tickets" className='text-slate-700 transition dark:text-slate-200'>
                <FormattedMessage id="market.myTickets" defaultMessage="My Tickets" />
              </Link>
            </div>
          </Box>

          <div className='rounded border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-neutral-900 md:p-5'>
            <div className='grid gap-4 lg:grid-cols-[minmax(0,_1fr)_360px] lg:items-center'>
              <div className='flex flex-col gap-2'>
                <div className='text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300'>
                  <FormattedMessage id="accountMarket.hero.eyebrow" defaultMessage="Looking for a Star Citizen account?" />
                </div>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.35 }}>
                  <FormattedMessage id="accountMarket.hero.title" defaultMessage="Premium Star Citizen accounts on sale now" />
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <FormattedMessage
                    id="accountMarket.hero.description"
                    defaultMessage="Browse our accounts for sale, including limited ships, retired items, buyback access, and extras. If you need something specific, contact us about a custom account."
                  />
                </Typography>
              </div>

              <div className='border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20'>
                <div className='text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300'>
                  <FormattedMessage id="accountMarket.discount.label" defaultMessage="Discount code" />
                </div>
                <div className='mt-2 flex items-start gap-1'>
                  <div className='min-w-0 break-all text-2xl font-black leading-tight text-slate-900 dark:text-white'>
                    {accountCouponCode}
                  </div>
                  <Tooltip title={intl.formatMessage({ id: 'common.copy', defaultMessage: 'Copy' })} arrow>
                    <IconButton size="small" sx={{ flexShrink: 0, mt: '2px' }} onClick={() => void handleCopyCouponCode()}>
                      <ContentCopy fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </div>
                <div className='mt-2 text-sm text-slate-600 dark:text-slate-300'>
                  <FormattedMessage
                    id="accountMarket.discount.body"
                    defaultMessage="Use the monthly account code at checkout to claim {percent}% off eligible account listings."
                    values={{ percent: ACCOUNT_MARKET_COUPON_PERCENT_OFF }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className='grid items-start grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,_1fr)]'>
            <div className='lg:sticky lg:top-4 lg:self-start'>
              <Box sx={{ borderRadius: 0, border: '1px solid', borderColor: 'divider', backgroundColor: 'background.paper', p: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  <FormattedMessage id="accountMarket.sidebar.title" defaultMessage="Account Buying Guide" />
                </Typography>

                <div className='flex flex-col gap-3'>
                  <GuideItem
                    title={intl.formatMessage({ id: 'accountMarket.sidebar.uniqueTitle', defaultMessage: 'Unique' })}
                    body={intl.formatMessage({ id: 'accountMarket.sidebar.uniqueBody', defaultMessage: 'Each account is unique, so once it is sold, that exact mix of ships, rewards, and extras is gone.' })}
                  />
                  <GuideItem
                    title={intl.formatMessage({ id: 'accountMarket.sidebar.protectionTitle', defaultMessage: 'Buyer Protection' })}
                    body={(
                      <FormattedMessage
                        id="accountMarket.sidebar.protectionBody"
                        defaultMessage="We provide 100% account purchase protection and take <lifetime>lifetime responsibility</lifetime> for sold accounts. If anything comes up, contact us anytime."
                        values={{
                          lifetime: (chunks: ReactNode) => (
                            <span className='inline-flex items-center gap-1 align-baseline'>
                              <span>{chunks}</span>
                              <Tooltip
                                title={intl.formatMessage({
                                  id: 'accountMarket.sidebar.protectionLifetimeTooltip',
                                  defaultMessage: '"Lifetime" refers to Star Citizen\'s service lifetime.',
                                })}
                                arrow
                              >
                                <span className='inline-flex cursor-help align-middle text-slate-400 dark:text-slate-500'>
                                  <InfoOutlined sx={{ fontSize: 14 }} />
                                </span>
                              </Tooltip>
                            </span>
                          ),
                        }}
                      />
                    )}
                  />
                  <GuideItem
                    title={intl.formatMessage({ id: 'accountMarket.sidebar.reviewTitle', defaultMessage: 'Delivery Process' })}
                    body={intl.formatMessage({ id: 'accountMarket.sidebar.reviewBody', defaultMessage: 'After you place the order, we will contact you by email. You can also reach us through Discord or a support ticket, and we will help with account binding changes and transfer credentials.' })}
                  />
                </div>

                <Divider sx={{ my: 2 }} />

                <div className='flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300'>
                  <div>
                    <FormattedMessage id="accountMarket.sidebar.total" defaultMessage="{count} account listings" values={{ count: pagination.total }} />
                  </div>
                  <div>
                    <FormattedMessage id="accountMarket.sidebar.pageStock" defaultMessage="{count} available on this page" values={{ count: listingItems.filter((item) => (item.stock - item.lockedStock) > 0).length }} />
                  </div>
                </div>

                <Button component={Link} to={getMarketListPath()} variant="outlined" size="small" fullWidth sx={{ mt: 2 }}>
                  <FormattedMessage id="accountMarket.sidebar.backToMarket" defaultMessage="Browse Ship Market" />
                </Button>
              </Box>
            </div>

            <div className='min-w-0'>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              <Box
                sx={{
                  mb: 3,
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
                  placeholder={intl.formatMessage({ id: 'accountMarket.searchPlaceholder', defaultMessage: 'Search accounts or included items...' })}
                  value={searchInput}
                  onChange={(event) => {
                    setSearchInput(event.target.value);
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
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
                      <FormattedMessage id="accountMarket.noResults" defaultMessage="No account listings found" />
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3'>
                      {listingItems.map((item) => {
                        const detailPath = getAccountMarketDetailPath(item.skuId);
                        const availableStock = Math.max(item.stock - item.lockedStock, 0);
                        const extraSummaryCount = item.extraCount + item.bundleCount + item.highlightCount;
                        const metadataLabels = getAccountListingMetadataLabels(intl, item.metadata);

                        return (
                          <div
                            key={item.skuId}
                            className='flex h-full flex-col overflow-hidden border border-gray-200 bg-white transition hover:border-gray-300 dark:border-gray-800 dark:bg-neutral-900 dark:hover:border-gray-700'
                          >
                            <Link to={detailPath} className='block'>
                              <AccountListingCardImage item={item} />
                            </Link>

                              <div className='flex flex-1 flex-col gap-4 p-5'>
                              <div className='flex flex-wrap gap-2'>
                                {item.tags?.slice(0, 2).map((tag) => (
                                  <Chip key={`${item.skuId}-${tag}`} size="small" variant="outlined" label={tag.toUpperCase()} />
                                ))}
                              </div>

                              <div className='flex flex-wrap gap-2 text-xs font-medium text-slate-500 dark:text-slate-400'>
                                <span>{intl.formatMessage({ id: 'accountMarket.card.ships', defaultMessage: '{count} ships' }, { count: item.shipCount })}</span>
                                <span>{intl.formatMessage({ id: 'accountMarket.card.ccus', defaultMessage: '{count} CCUs' }, { count: item.ccuCount })}</span>
                                <span>{intl.formatMessage({ id: 'accountMarket.card.extras', defaultMessage: '{count} extras' }, { count: extraSummaryCount })}</span>
                              </div>

                              <div className='flex flex-1 flex-col gap-2'>
                                <Link to={detailPath} className='w-full text-left text-inherit no-underline'>
                                  <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.35 }}>
                                    {item.name}
                                  </Typography>
                                </Link>

                                <Typography variant="body2" color="text.secondary" sx={{ minHeight: 42 }}>
                                  {item.description || intl.formatMessage({
                                    id: 'accountMarket.card.defaultDescription',
                                    defaultMessage: 'Rare ships, legacy rewards, and account-bound extras in one account package.',
                                  })}
                                </Typography>

                                {item.highlights.length > 0 && (
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
                                    {item.highlights.join(' · ')}
                                  </Typography>
                                )}

                                {metadataLabels.length > 0 && (
                                  <div className='flex flex-wrap gap-2'>
                                    {metadataLabels.map((label) => (
                                      <Chip
                                        key={`${item.skuId}-${label}`}
                                        size="small"
                                        variant="outlined"
                                        label={label}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className='mt-auto flex flex-col gap-4'>
                                <div className='flex flex-col gap-1'>
                                  <div className='text-xl font-semibold text-slate-900 dark:text-slate-100'>
                                    {intl.formatNumber(item.price, { style: 'currency', currency: 'USD' })}
                                  </div>
                                  {typeof item.cost === 'number' && item.cost > 0 && (
                                    <div className='text-sm text-slate-500 dark:text-slate-400'>
                                      <FormattedMessage
                                        id="accountMarket.card.exchangeValue"
                                        defaultMessage="Exchange value: {value}"
                                        values={{
                                          value: intl.formatNumber(item.cost, { style: 'currency', currency: 'USD' }),
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>

                                <Divider />

                                <div className='flex items-center justify-between gap-3'>
                                  <div className='text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400'>
                                    <FormattedMessage id="accountMarket.card.stock" defaultMessage="{count} available" values={{ count: availableStock }} />
                                  </div>

                                  <Button
                                    component={Link}
                                    to={getAccountMarketCheckoutPath(item.skuId)}
                                    variant="outlined"
                                    disabled={availableStock <= 0}
                                    size="small"
                                    startIcon={<ShoppingBag size={16} />}
                                  >
                                    <FormattedMessage id="accountMarket.card.buyNow" defaultMessage="Buy now" />
                                  </Button>
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
                        onPageChange={(_event, newPage) => {
                          handleUpdateSearchParams((nextSearchParams) => {
                            if (newPage > 0) {
                              nextSearchParams.set('page', String(newPage));
                            } else {
                              nextSearchParams.delete('page');
                            }
                          });
                        }}
                        onRowsPerPageChange={(event) => {
                          const nextRowsPerPage = Number.parseInt(event.target.value, 10);
                          handleUpdateSearchParams((nextSearchParams) => {
                            nextSearchParams.delete('page');

                            if (nextRowsPerPage === ACCOUNT_MARKET_DEFAULT_ROWS_PER_PAGE) {
                              nextSearchParams.delete('limit');
                            } else {
                              nextSearchParams.set('limit', String(nextRowsPerPage));
                            }
                          });
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

          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 1.5,
              flexWrap: 'wrap',
              borderTop: '1px solid',
              borderColor: 'divider',
              pt: 3,
              mt: 1,
              color: 'text.secondary',
            }}
          >
            <Link to="/terms-of-service" className='text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'>
              <FormattedMessage id="navigate.terms" defaultMessage="Terms of Service" />
            </Link>
            <span className='text-slate-400'>|</span>
            <Link to="/refund-policy" className='text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'>
              <FormattedMessage id="navigate.refund" defaultMessage="Refund Policy" />
            </Link>
            <span className='text-slate-400'>|</span>
            <Link to="/privacy" className='text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'>
              <FormattedMessage id="navigate.privacy" defaultMessage="Privacy Policy" />
            </Link>
          </Box>
        </div>

      </div>

      <Snackbar
        open={copyFeedbackOpen}
        autoHideDuration={2000}
        onClose={() => setCopyFeedbackOpen(false)}
        message={intl.formatMessage({ id: 'common.copied', defaultMessage: 'Copied to clipboard' })}
      />
    </>
  );
}
