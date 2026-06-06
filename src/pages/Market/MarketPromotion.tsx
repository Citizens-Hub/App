import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Snackbar,
  Typography,
} from '@mui/material';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate, useParams } from 'react-router';
import { Helmet } from 'react-helmet';
import { ArrowLeft, Minus, Plus, ShoppingCart, Timer } from 'lucide-react';

import {
  buildMarketCartItem,
  buildMarketResource,
  getMarketItemVisual,
  MARKET_ITEM_PLACEHOLDER,
  resolveMarketImageBadgeKind,
} from '@/components/marketItemDisplay';
import { useApi } from '@/hooks';
import { useCartStore } from '@/hooks/useCartStore';
import { useLocale } from '@/contexts/LocaleContext';
import {
  CartItem as CartItemType,
  ListingItem,
  PromotionPriceInfo,
  Resource,
  Ship,
  ShipsData,
} from '@/types';
import { getDirectCheckoutPath, saveDirectCheckoutItems } from '@/utils/directCheckout';
import { getAbsoluteAssetUrl } from '@/utils/marketLinks';
import { getMarketImageDisplayUrl } from '@/utils/marketImages';
import { getShipDisplayName } from '@/utils/shipDisplay';
import CartDrawer from './components/CartDrawer';
import MarketImageBadge from './components/MarketImageBadge';
import MarketItemMedia from './components/MarketItemMedia';
import {
  getAvailableStock,
  getListingPriceDisplay,
} from './marketUtils';
import {
  formatMarketDiscount,
  formatMarketOfficialSavings,
  formatPackageContentsSummary,
  formatUsdPrice,
  getMarketBrowseCategoryLabel,
  // getMarketItemTypeLabel,
} from './marketI18n';
import { getMarketItemDisplayName, getMarketItemSummary } from './marketDisplayI18n';

type LocalizedText = Record<string, string | undefined>;

interface PromotionHeroContent {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  imageUrl?: string;
  mobileImageUrl?: string;
  imageAlt?: string;
}

interface PromotionSeoContent {
  title?: string;
  description?: string;
  imageUrl?: string;
}

interface PromotionItemContent {
  translations?: Record<string, {
    title?: string;
    description?: string;
    badge?: string;
    buttonLabel?: string;
    imageAlt?: string;
  }>;
  imageUrl?: string;
}

interface PromotionItem {
  id: string;
  originalSkuId: string;
  discountSkuId?: string | null;
  sortOrder: number;
  originalUnitPrice: number;
  discountUnitPrice: number;
  itemContent?: PromotionItemContent;
  active: boolean;
  originalItem?: ListingItem | null;
  discountItem?: ListingItem | null;
  promotion?: PromotionPriceInfo | null;
}

interface PromotionSection {
  id: string;
  type: 'media_text' | 'product_group' | 'benefits' | string;
  translations?: Record<string, LocalizedText>;
  imageUrl?: string;
  imageAlt?: string;
  imageSide?: 'left' | 'right';
  itemSkuIds?: string[];
  items?: Array<{
    id: string;
    translations?: Record<string, LocalizedText>;
  }>;
}

interface PromotionResponse {
  promotion: {
    id: string;
    slug: string;
    title: string;
    status: string;
    startsAt: string;
    expiresAt: string;
    heroContent: Record<string, PromotionHeroContent>;
    seoContent: Record<string, PromotionSeoContent>;
    sections: PromotionSection[];
    promotionUrl: string;
    items: PromotionItem[];
  };
}

function nonEmptyText(value?: string | null) {
  return value && value.trim() ? value : '';
}

function localizedText(translations: Record<string, LocalizedText> | undefined, locale: string, key: string) {
  return nonEmptyText(translations?.[locale]?.[key]) || nonEmptyText(translations?.en?.[key]);
}

function localizedRecord<T extends object>(record: Record<string, T> | undefined, locale: string): T {
  const localized = (record?.[locale] || {}) as Record<string, string | undefined>;
  const english = (record?.en || {}) as Record<string, string | undefined>;
  return Object.fromEntries(
    Array.from(new Set([...Object.keys(english), ...Object.keys(localized)])).map((key) => [
      key,
      nonEmptyText(localized[key]) || nonEmptyText(english[key]),
    ]),
  ) as T;
}

function getPromotionItemListing(item: PromotionItem): ListingItem | null {
  const listing = item.discountItem || item.originalItem || null;
  if (!listing) {
    return null;
  }

  const inventoryListing = item.originalItem || listing;
  return {
    ...listing,
    promotion: item.promotion || listing.promotion || null,
    stock: inventoryListing.stock,
    lockedStock: inventoryListing.lockedStock,
  };
}

function getPromotionItemDisplay(item: PromotionItem, locale: string) {
  const translations = item.itemContent?.translations;
  return {
    title: localizedText(translations, locale, 'title'),
    description: localizedText(translations, locale, 'description'),
    badge: localizedText(translations, locale, 'badge'),
    buttonLabel: localizedText(translations, locale, 'buttonLabel'),
    imageAlt: localizedText(translations, locale, 'imageAlt'),
    imageUrl: item.itemContent?.imageUrl || '',
  };
}

function getCountdownParts(expiresAt: string) {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return null;
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return { days, hours, minutes };
}

function PromotionProductCard({
  item,
  ships,
  onOpenDetails,
  onAddToCart,
  onBuyNow,
  cartQuantity,
  onRemoveFromCart,
  onUpdateQuantity,
}: {
  item: PromotionItem;
  ships: Ship[];
  onOpenDetails: (item: ListingItem) => void;
  onAddToCart: (item: PromotionItem) => void;
  onBuyNow: (item: PromotionItem) => void;
  cartQuantity: number;
  onRemoveFromCart: (resourceId: string) => void;
  onUpdateQuantity: (resourceId: string, quantity: number) => void;
}) {
  const intl = useIntl();
  const { locale } = useLocale();
  const listing = getPromotionItemListing(item);
  if (!listing) {
    return null;
  }

  const override = getPromotionItemDisplay(item, locale);
  const priceDisplay = getListingPriceDisplay(listing, ships, {
    originalPrice: item.originalUnitPrice || item.promotion?.originalPrice,
    msrpItem: item.originalItem || listing,
  });
  const discount = priceDisplay.promotionDiscountPercent;
  const availableStock = getAvailableStock(listing);
  const imageBadgeKind = resolveMarketImageBadgeKind(listing);
  const packageShips = listing.packageShips || [];
  const packageItems = listing.packageItems || [];
  const displayName = override.title || getMarketItemDisplayName(intl, listing, ships);
  const summary = override.description || getMarketItemSummary(intl, listing, ships);

  return (
    <div className="flex h-full flex-col overflow-hidden border border-gray-200 bg-white dark:border-gray-800 dark:bg-neutral-900">
      <Box
        component="button"
        type="button"
        onClick={() => onOpenDetails(listing)}
        sx={{
          appearance: 'none',
          background: 'transparent',
          border: 0,
          color: 'inherit',
          cursor: 'pointer',
          display: 'block',
          font: 'inherit',
          m: 0,
          p: 0,
          textAlign: 'left',
          width: '100%',
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
          },
        }}
      >
        {override.imageUrl ? (
          <Box sx={{ position: 'relative', width: '100%', height: 220, overflow: 'hidden', backgroundColor: 'grey.100' }}>
            <img
              src={getMarketImageDisplayUrl(override.imageUrl, { ships, variant: 'thumbLarge' })}
              alt={override.imageAlt || displayName}
              className="h-full w-full object-cover"
            />
            {discount ? (
              <div className='absolute right-3 top-3 border border-black/10 bg-white/95 px-2 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-900/95 dark:text-slate-200'>
                {formatMarketDiscount(intl, discount)}
              </div>
            ) : null}
            {imageBadgeKind && <MarketImageBadge kind={imageBadgeKind} />}
          </Box>
        ) : (
          <MarketItemMedia
            item={listing}
            ships={ships}
            height={220}
            badgeText={discount ? formatMarketDiscount(intl, discount) : null}
          />
        )}
      </Box>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap gap-2">
          {override.badge ? <Chip size="small" color="primary" label={override.badge} /> : null}
          {listing.browseCategory ? <Chip size="small" variant="outlined" label={getMarketBrowseCategoryLabel(intl, listing.browseCategory)} /> : null}
          {/* <Chip size="small" label={getMarketItemTypeLabel(intl, listing.itemType)} /> */}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <Box
            component="button"
            type="button"
            onClick={() => onOpenDetails(listing)}
            sx={{
              appearance: 'none',
              background: 'transparent',
              border: 0,
              color: 'inherit',
              cursor: 'pointer',
              display: 'block',
              font: 'inherit',
              m: 0,
              p: 0,
              textAlign: 'left',
              width: '100%',
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: 'primary.main',
                outlineOffset: 2,
              },
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.35, fontSize: '1.05rem' }}>
              {displayName}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ minHeight: 42 }}>
            {summary}
          </Typography>
          {listing.itemType === 'package' && (packageShips.length > 0 || packageItems.length > 0) ? (
            <Typography variant="caption" color="text.secondary">
              {formatPackageContentsSummary(intl, packageShips.filter((entry) => entry.shipId !== null).length, packageItems.length)}
            </Typography>
          ) : null}
        </div>

        <div className="mt-auto flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              {formatUsdPrice(intl.locale, listing.price)}
            </div>
            {priceDisplay.marketPrice > 0 ? (
              <div className="text-sm text-slate-500 line-through dark:text-slate-400">
                {formatUsdPrice(intl.locale, priceDisplay.marketPrice)}
              </div>
            ) : null}
            {priceDisplay.officialSavingsAmount > 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {formatMarketOfficialSavings(intl, priceDisplay.officialSavingsAmount)}
              </div>
            ) : null}
          </div>

          <Divider />

          <div className="flex items-center justify-between gap-3">
            {cartQuantity > 0 ? (
              <ButtonGroup size="small" aria-label={intl.formatMessage({ id: 'market.quantityControls', defaultMessage: 'Quantity controls' })}>
                <IconButton
                  size="small"
                  onClick={() => {
                    if (cartQuantity <= 1) {
                      onRemoveFromCart(listing.skuId);
                    } else {
                      onUpdateQuantity(listing.skuId, cartQuantity - 1);
                    }
                  }}
                >
                  <Minus className="h-4 w-4" />
                </IconButton>
                <Button disabled>{cartQuantity}</Button>
                <IconButton
                  size="small"
                  disabled={cartQuantity >= availableStock}
                  onClick={() => onUpdateQuantity(listing.skuId, cartQuantity + 1)}
                >
                  <Plus className="h-4 w-4" />
                </IconButton>
              </ButtonGroup>
            ) : (
              <Button variant="outlined" onClick={() => onAddToCart(item)} disabled={availableStock <= 0} size="small">
                {override.buttonLabel || <FormattedMessage id="market.addToCart" defaultMessage="Add to cart" />}
              </Button>
            )}
            <Button variant="contained" onClick={() => onBuyNow(item)} disabled={availableStock <= 0} size="small">
              <FormattedMessage id="market.buyNow" defaultMessage="Buy now" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketPromotion() {
  const intl = useIntl();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const { slug = '' } = useParams();
  const decodedSlug = decodeURIComponent(slug);
  const { cart, cartOpen, addToCart, removeFromCart, replaceCartItem, closeCart, updateItemQuantity } = useCartStore();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  const { data, isLoading, error } = useApi<PromotionResponse>(
    decodedSlug ? `/api/promotions/${encodeURIComponent(decodedSlug)}` : null,
  );
  const { data: shipsResponse } = useApi<ShipsData>('/api/ships');
  const ships = useMemo(() => shipsResponse?.data.ships || [], [shipsResponse]);
  const promotion = data?.promotion;
  const hero = localizedRecord<PromotionHeroContent>(promotion?.heroContent, locale);
  const seo = localizedRecord<PromotionSeoContent>(promotion?.seoContent, locale);
  const activeItems = useMemo(() => (
    (promotion?.items || [])
      .filter((item) => item.active && getPromotionItemListing(item))
      .sort((left, right) => left.sortOrder - right.sortOrder)
  ), [promotion?.items]);
  const itemBySkuId = useMemo(() => {
    const map = new Map<string, PromotionItem>();
    activeItems.forEach((item) => {
      if (item.originalSkuId) map.set(item.originalSkuId, item);
      if (item.discountSkuId) map.set(item.discountSkuId, item);
    });
    return map;
  }, [activeItems]);
  const countdown = promotion ? getCountdownParts(promotion.expiresAt) : null;
  const isAvailable = promotion?.status === 'active' || promotion?.status === 'scheduled';
  const heroImage = hero.mobileImageUrl || hero.imageUrl || activeItems
    .map((item) => getPromotionItemListing(item)?.imageUrl)
    .find(Boolean)
    || MARKET_ITEM_PLACEHOLDER;

  const getCartQuantity = (listing: ListingItem | null) => {
    if (!listing) return 0;
    return cart.find((cartItem: CartItemType) => cartItem.resource.id === listing.skuId)?.quantity || 0;
  };

  const handleOpenDetails = (listing: ListingItem) => {
    navigate(`/market/${encodeURIComponent(listing.skuId)}`);
  };

  const handleAddToCart = (promotionItem: PromotionItem) => {
    const listing = getPromotionItemListing(promotionItem);
    if (!listing) return;

    const existingCartItem = cart.find((cartItem: CartItemType) => cartItem.resource.id === listing.skuId);
    const availableStock = getAvailableStock(listing);
    if (existingCartItem) {
      const currentQuantity = existingCartItem.quantity || 1;
      if (currentQuantity < availableStock) {
        updateItemQuantity(listing.skuId, currentQuantity + 1);
      }
      return;
    }

    const resource: Resource = buildMarketResource(listing, ships);
    addToCart(resource);
    setSnackbarMessage(intl.formatMessage({ id: 'market.addedToCart', defaultMessage: 'Added to cart' }));
    setSnackbarSeverity('success');
    setSnackbarOpen(true);
  };

  const handleBuyNow = (promotionItem: PromotionItem) => {
    const listing = getPromotionItemListing(promotionItem);
    if (!listing || getAvailableStock(listing) <= 0) {
      return;
    }

    saveDirectCheckoutItems([buildMarketCartItem(listing, 1, ships)]);
    navigate(getDirectCheckoutPath());
  };

  const getAvailableStockByResourceId = (resourceId: string) => {
    const promotionItem = itemBySkuId.get(resourceId);
    const listing = promotionItem ? getPromotionItemListing(promotionItem) : null;
    if (listing) {
      return getAvailableStock(listing);
    }

    return cart.find((cartItem) => cartItem.resource.id === resourceId)?.resource.marketAvailableStock ?? 0;
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !promotion) {
    return (
      <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-y-auto bg-white px-4 py-6 dark:bg-neutral-950">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-4">
          <Button variant="text" onClick={() => navigate('/market')} sx={{ alignSelf: 'flex-start' }}>
            <FormattedMessage id="market.backToMarket" defaultMessage="Back to market" />
          </Button>
          <Alert severity="warning">
            <FormattedMessage id="promotion.notFound" defaultMessage="This promotion does not exist or is no longer available." />
          </Alert>
        </div>
      </div>
    );
  }

  const pageTitle = seo.title || hero.title || promotion.title;
  const pageDescription = seo.description || hero.subtitle || promotion.title;
  const socialImage = getAbsoluteAssetUrl(seo.imageUrl || heroImage);

  return (
    <>
      <Helmet>
        <title>{pageTitle} | Citizens' Hub</title>
        <meta name="description" content={pageDescription} />
        {promotion.status === 'canceled' ? <meta name="robots" content="noindex,follow" /> : null}
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:image" content={socialImage} />
      </Helmet>

      <div className="absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-y-auto bg-white text-slate-950 dark:bg-neutral-950 dark:text-slate-50 text-left">
        <section className="relative min-h-[72vh] overflow-hidden border-b border-gray-200 dark:border-gray-800">
          <img
            src={getMarketImageDisplayUrl(heroImage, { ships, variant: 'slideshow' }) || heroImage}
            alt={hero.imageAlt || hero.title || promotion.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/10" />
          <div className="relative z-10 mx-auto flex min-h-[72vh] max-w-[1280px] flex-col justify-end gap-6 px-4 pb-10 pt-8 md:px-8">
            <Button
              variant="text"
              startIcon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => navigate('/market')}
              sx={{
                alignSelf: 'flex-start',
                color: 'white',
              }}
            >
              <FormattedMessage id="market.backToMarket" defaultMessage="Back to market" />
            </Button>

            <div className="max-w-3xl">
              {hero.eyebrow ? (
                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
                  {hero.eyebrow}
                </div>
              ) : null}
              <h1 className="text-4xl font-semibold leading-tight text-white md:text-6xl">
                {hero.title || promotion.title}
              </h1>
              {hero.subtitle ? (
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-100 md:text-lg">
                  {hero.subtitle}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* <Button
                variant="contained"
                size="large"
                onClick={() => document.getElementById('promotion-products')?.scrollIntoView({ behavior: 'smooth' })}
              >
                {hero.ctaLabel || <FormattedMessage id="promotion.shopDeals" defaultMessage="Shop deals" />}
              </Button> */}
              {countdown ? (
                <div className="inline-flex items-center gap-2 border border-white/25 bg-black/35 px-4 py-2 text-sm font-semibold text-white">
                  <Timer className="h-4 w-4" />
                  <FormattedMessage
                    id="promotion.countdown"
                    defaultMessage="{days}d {hours}h {minutes}m left"
                    values={countdown}
                  />
                </div>
              ) : (
                <div className="border border-white/25 bg-black/35 px-4 py-2 text-sm font-semibold text-white">
                  <FormattedMessage id="promotion.ended" defaultMessage="Promotion ended" />
                </div>
              )}
            </div>
          </div>
        </section>

        <main className="mx-auto flex max-w-[1280px] flex-col gap-12 px-4 py-10 md:px-8">
          {!isAvailable ? (
            <Alert severity="warning">
              <FormattedMessage id="promotion.unavailableNotice" defaultMessage="This promotion has ended. Discount SKUs cannot be used for new orders." />
            </Alert>
          ) : null}

          {/* <section id="promotion-products" className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                <FormattedMessage id="promotion.featuredDeals" defaultMessage="Featured deals" />
              </div>
              <Typography variant="h4" sx={{ fontWeight: 750 }}>
                <FormattedMessage id="promotion.productsTitle" defaultMessage="Promotion products" />
              </Typography>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {activeItems.map((item) => {
                const listing = getPromotionItemListing(item);
                return (
                  <PromotionProductCard
                    key={item.id}
                    item={item}
                    ships={ships}
                    cartQuantity={getCartQuantity(listing)}
                    onOpenDetails={handleOpenDetails}
                    onAddToCart={handleAddToCart}
                    onBuyNow={handleBuyNow}
                    onRemoveFromCart={removeFromCart}
                    onUpdateQuantity={updateItemQuantity}
                  />
                );
              })}
            </div>
          </section> */}

          {(promotion.sections || []).map((section) => {
            const title = localizedText(section.translations, locale, 'title');
            const subtitle = localizedText(section.translations, locale, 'subtitle');
            const body = localizedText(section.translations, locale, 'body');
            const sectionItems = (section.itemSkuIds || [])
              .map((skuId) => itemBySkuId.get(skuId))
              .filter((item): item is PromotionItem => Boolean(item));

            if (section.type === 'product_group') {
              return (
                <section key={section.id} className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    {title ? <Typography variant="h4" sx={{ fontWeight: 750 }}>{title}</Typography> : null}
                    {subtitle ? <Typography color="text.secondary">{subtitle}</Typography> : null}
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {(sectionItems.length ? sectionItems : activeItems).map((item) => {
                      const listing = getPromotionItemListing(item);
                      return (
                        <PromotionProductCard
                          key={`${section.id}-${item.id}`}
                          item={item}
                          ships={ships}
                          cartQuantity={getCartQuantity(listing)}
                          onOpenDetails={handleOpenDetails}
                          onAddToCart={handleAddToCart}
                          onBuyNow={handleBuyNow}
                          onRemoveFromCart={removeFromCart}
                          onUpdateQuantity={updateItemQuantity}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            }

            if (section.type === 'benefits') {
              const benefits = section.items || [];
              return (
                <section key={section.id} className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    {title ? <Typography variant="h4" sx={{ fontWeight: 750 }}>{title}</Typography> : null}
                    {subtitle ? <Typography color="text.secondary">{subtitle}</Typography> : null}
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {benefits.map((benefit) => {
                      const benefitTitle = localizedText(benefit.translations, locale, 'title');
                      const benefitBody = localizedText(benefit.translations, locale, 'body');
                      return (
                        <div key={benefit.id} className="border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-neutral-900">
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>{benefitTitle}</Typography>
                          {benefitBody ? <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{benefitBody}</Typography> : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            }

            return (
              <section
                key={section.id}
                className={`grid grid-cols-1 gap-6 md:grid-cols-2 ${section.imageSide === 'right' ? '' : 'md:[&>*:first-child]:order-2'}`}
              >
                {section.imageUrl ? (
                  <img
                    src={getMarketImageDisplayUrl(section.imageUrl, { ships, variant: 'slideshow' }) || section.imageUrl}
                    alt={section.imageAlt || title}
                    className="h-full min-h-[320px] w-full object-cover"
                  />
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center bg-neutral-100 dark:bg-neutral-900">
                    <ShoppingCart className="h-10 w-10 text-slate-400" />
                  </div>
                )}
                <div className="flex flex-col justify-center gap-4">
                  {title ? <Typography variant="h4" sx={{ fontWeight: 750 }}>{title}</Typography> : null}
                  {subtitle ? <Typography color="text.secondary">{subtitle}</Typography> : null}
                  {body ? (
                    <div className="promotion-markdown text-sm leading-7 text-slate-700 dark:text-slate-200">
                      <MarkdownPreview
                        source={body}
                        skipHtml={false}
                        style={{ backgroundColor: 'transparent', color: 'inherit', fontSize: '0.95rem', lineHeight: 1.8 }}
                        wrapperElement={{ 'data-color-mode': document.documentElement.classList.contains('dark') ? 'dark' : 'light' }}
                      />
                    </div>
                  ) : null}
                  {sectionItems.length ? (
                    <div className="flex flex-wrap gap-2">
                      {sectionItems.map((item) => {
                        const listing = getPromotionItemListing(item);
                        const visual = listing ? getMarketItemVisual(listing, ships) : null;
                        return listing ? (
                          <Chip
                            key={`${section.id}-linked-${item.id}`}
                            label={getShipDisplayName(visual?.ship) || getMarketItemDisplayName(intl, listing, ships)}
                            onClick={() => handleOpenDetails(listing)}
                          />
                        ) : null;
                      })}
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </main>

        <CartDrawer
          open={cartOpen}
          cart={cart}
          ships={ships}
          onClose={closeCart}
          onRemoveFromCart={removeFromCart}
          onReplaceCartItem={replaceCartItem}
          onUpdateQuantity={updateItemQuantity}
          getAvailableStock={getAvailableStockByResourceId}
        />

        <Snackbar
          open={snackbarOpen}
          autoHideDuration={3000}
          onClose={() => setSnackbarOpen(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} variant="filled">
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </div>
    </>
  );
}
