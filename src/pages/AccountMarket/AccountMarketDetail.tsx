import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { Helmet } from 'react-helmet';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useParams } from 'react-router';
import { ShoppingBag } from 'lucide-react';

import { useAccountMarketItemData } from '@/hooks';
import { AccountMarketEntry } from '@/types';
import { formatMarketCcuResourceName } from '@/pages/Market/marketI18n';
import {
  buildAccountMarketSourceSections,
  getAccountEntryPreviewImage,
  getAccountEntryPrimaryLabel,
  getAccountMarketEntryShipDisplay,
} from '@/utils/accountMarketEntries';
import {
  getAccountMarketCheckoutPath,
  getAccountMarketDetailUrl,
  getAccountMarketListPath,
} from '@/utils/marketLinks';
import { getMarketImageAssetUrl, resolveMarketImageUrls } from '@/utils/marketImages';

function getEntryKindLabel(kind: string) {
  switch (kind) {
    case 'ship':
      return 'Ship';
    case 'ccu':
      return 'CCU';
    case 'bundle':
      return 'Bundle';
    default:
      return 'Extra';
  }
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className='border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-neutral-900'>
      <div className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400'>{label}</div>
      <div className='mt-2 text-3xl font-black text-slate-900 dark:text-white'>{value}</div>
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value) {
    return null;
  }

  return (
    <div className='border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-neutral-950'>
      <div className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400'>{label}</div>
      <div className='mt-2 text-sm leading-6 text-slate-800 dark:text-slate-100'>{value}</div>
    </div>
  );
}

function formatBooleanDetail(intl: ReturnType<typeof useIntl>, value?: boolean | null) {
  if (typeof value !== 'boolean') {
    return null;
  }

  return value
    ? intl.formatMessage({ id: 'accountMarket.detail.valueYes', defaultMessage: 'Yes' })
    : intl.formatMessage({ id: 'accountMarket.detail.valueNo', defaultMessage: 'No' });
}

function SourceLabel({ source }: { source: 'hangar' | 'buyback' }) {
  return source === 'buyback'
    ? <FormattedMessage id="accountMarket.entry.buyback" defaultMessage="Buyback" />
    : <FormattedMessage id="accountMarket.entry.hangar" defaultMessage="Hangar item" />;
}

function getAccountListingImages(item: NonNullable<ReturnType<typeof useAccountMarketItemData>['item']>) {
  const listingImages = resolveMarketImageUrls(item.imageUrl, item.imageUrls);
  if (listingImages.length > 0) {
    return listingImages;
  }

  const entryImage = item.entries.find((entry) => entry.imageUrl)?.imageUrl;
  return entryImage ? [entryImage] : ['/imgs/credit.webp'];
}

function AccountListingHeroGallery({
  item,
}: {
  item: NonNullable<ReturnType<typeof useAccountMarketItemData>['item']>;
}) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const images = getAccountListingImages(item);
  const selectedIndex = Math.min(activeImageIndex, images.length - 1);
  const selectedImage = images[selectedIndex] || '/imgs/credit.webp';

  return (
    <div className='overflow-hidden border border-gray-200 bg-white dark:border-gray-800 dark:bg-neutral-900'>
      <div className='relative h-[420px] bg-slate-100 dark:bg-neutral-800'>
        <img
          src={getMarketImageAssetUrl(selectedImage)}
          alt={item.name}
          className='h-full w-full object-cover'
        />
        {images.length > 1 && (
          <div className='absolute right-4 top-4 bg-black/60 px-2.5 py-1 text-xs font-semibold text-white'>
            {selectedIndex + 1}/{images.length}
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className='grid grid-cols-4 gap-2 border-t border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-neutral-950 md:grid-cols-6'>
          {images.map((imageUrl, index) => (
            <div
              key={`${imageUrl}-${index}`}
              onClick={() => setActiveImageIndex(index)}
              className={`h-16 overflow-hidden border bg-slate-100 p-0 dark:bg-neutral-800 ${selectedIndex === index ? 'border-amber-500' : 'border-gray-200 dark:border-gray-800'}`}
              aria-label={`Show account listing image ${index + 1}`}
            >
              <img
                src={getMarketImageAssetUrl(imageUrl)}
                alt={`${item.name} ${index + 1}`}
                className='h-full w-full object-cover'
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EntryChips({
  canGift,
  kind,
  quantity,
}: {
  canGift?: boolean | null;
  kind: string;
  quantity?: number;
}) {
  return (
    <div className='mt-2 flex flex-wrap gap-2'>
      <Chip size="small" label={getEntryKindLabel(kind)} />
      {typeof quantity === 'number' && quantity > 1 && (
        <Chip size="small" variant="outlined" label={`Qty ${quantity}`} />
      )}
      {typeof canGift === 'boolean' && (
        <Chip
          size="small"
          color={canGift === false ? 'warning' : 'success'}
          label={canGift === false ? 'Not giftable' : 'Giftable'}
        />
      )}
    </div>
  );
}

function GroupCard({
  title,
  subtitle,
  imageUrl,
  kind,
  canGift,
  quantity,
  nestedEntries,
  ships,
  intl,
}: {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  kind: string;
  canGift?: boolean | null;
  quantity?: number;
  nestedEntries?: AccountMarketEntry[];
  ships: NonNullable<ReturnType<typeof useAccountMarketItemData>['ships']>;
  intl: ReturnType<typeof useIntl>;
}) {
  return (
    <div className='border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-neutral-900'>
      <div className='flex flex-col gap-4 md:flex-row md:items-start'>
        {imageUrl ? (
          <div className='h-[120px] w-full overflow-hidden border border-gray-200 bg-slate-100 md:h-[92px] md:w-[164px] dark:border-gray-800 dark:bg-neutral-800'>
              <img
              src={getMarketImageAssetUrl(imageUrl)}
              alt={title}
              className='h-full w-full object-cover'
            />
          </div>
        ) : null}

        <div className='min-w-0 flex-1'>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
          <EntryChips canGift={canGift} kind={kind} quantity={quantity} />
        </div>
      </div>

      {nestedEntries && nestedEntries.length > 0 && (
        <div className='mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2'>
          {nestedEntries.map((nestedEntry) => {
            const previewImage = getAccountEntryPreviewImage(nestedEntry, [], ships);
            const ccuDisplay = nestedEntry.kind === 'ccu'
              ? getAccountMarketEntryShipDisplay(nestedEntry, ships)
              : null;
            const nestedSubtitle = nestedEntry.kind === 'ccu'
              ? formatMarketCcuResourceName(intl, ccuDisplay?.fromShipName || '-', ccuDisplay?.toShipName || '-')
              : undefined;

            return (
              <div key={nestedEntry.id} className='border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-neutral-950'>
                <div className='flex gap-3'>
                  {previewImage ? (
                    <div className='h-16 w-16 shrink-0 overflow-hidden bg-slate-100 dark:bg-neutral-800'>
                      <img src={getMarketImageAssetUrl(previewImage)} alt={nestedEntry.name} className='h-full w-full object-cover' />
                    </div>
                  ) : null}
                  <div className='min-w-0 flex-1'>
                    <div className='font-semibold text-slate-900 dark:text-white'>{getAccountEntryPrimaryLabel(nestedEntry)}</div>
                    {nestedSubtitle && (
                      <div className='mt-1 text-sm text-slate-500 dark:text-slate-400'>{nestedSubtitle}</div>
                    )}
                    <EntryChips canGift={undefined} kind={nestedEntry.kind} quantity={nestedEntry.quantity} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AccountMarketDetail() {
  const { skuId: routeSkuId = '' } = useParams();
  const intl = useIntl();
  const decodedSkuId = decodeURIComponent(routeSkuId);
  const { item, ships, loading, error, notFound } = useAccountMarketItemData(decodedSkuId);
  const [sourceTab, setSourceTab] = useState<'hangar' | 'buyback'>('hangar');

  const availableStock = Math.max((item?.stock || 0) - (item?.lockedStock || 0), 0);
  const sourceSections = useMemo(() => buildAccountMarketSourceSections(item?.entries || []), [item]);
  const activeSourceSection = sourceSections.find((section) => section.source === sourceTab) || sourceSections[0];
  const activeSourceTab = activeSourceSection?.source || sourceTab;

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (notFound || !item) {
    return (
      <div className='absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-y-auto bg-white px-4 py-4 text-left md:px-8 dark:bg-transparent'>
        <div className='mx-auto flex w-full max-w-[1120px] flex-col gap-4'>
          <Button component={Link} to={getAccountMarketListPath()} variant="text" sx={{ alignSelf: 'flex-start', px: 0 }}>
            <FormattedMessage id="accountMarket.detail.backToList" defaultMessage="Back to Account Market" />
          </Button>
          <Alert severity="warning">
            <FormattedMessage id="accountMarket.detail.notFoundDescription" defaultMessage="This account package may have sold out or been removed by the dealer." />
          </Alert>
        </div>
      </div>
    );
  }

  const pageUrl = typeof window !== 'undefined' ? window.location.href : getAccountMarketDetailUrl(item.skuId);
  const metaDescription = item.description || 'A Star Citizen account package with ships, CCUs, legacy rewards, and account-bound extras.';
  const formattedUpdatedAt = new Date(item.updatedAt).toLocaleString(intl.locale);
  const metadata = item.metadata || {};

  return (
    <>
      <Helmet>
        <title>{`${item.name} | Citizens' Hub Account Market`}</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:title" content={`${item.name} | Citizens' Hub Account Market`} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:type" content="product" />
        <link rel="canonical" href={getAccountMarketDetailUrl(item.skuId)} />
      </Helmet>

      <div className='absolute left-0 right-0 top-[65px] h-[calc(100vh-65px)] overflow-y-auto bg-white px-4 py-4 text-left md:px-8 dark:bg-transparent'>
        <div className='mx-auto flex w-full max-w-[1280px] flex-col gap-4'>
          {error && <Alert severity="error">{error}</Alert>}

          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              justifyContent: 'space-between',
              alignItems: { xs: 'stretch', md: 'flex-start' },
              gap: 2,
            }}
          >
            <div className='flex min-w-0 flex-1 flex-col gap-2'>
              <Button component={Link} to={getAccountMarketListPath()} variant="text" sx={{ alignSelf: 'flex-start', px: 0 }}>
                <FormattedMessage id="accountMarket.detail.backToList" defaultMessage="Back to Account Market" />
              </Button>
              <Typography variant="h5" className='break-words'>
                {item.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" className='break-words'>
                {item.description || intl.formatMessage({
                  id: 'accountMarket.detail.defaultDescription',
                  defaultMessage: 'Review the included hangar items, buyback items, and account-bound extras before purchasing.',
                })}
              </Typography>
            </div>

            <div className='flex shrink-0 flex-wrap items-center gap-3 self-start md:justify-end'>
              <Link to="/orders" className='rounded'>
                <FormattedMessage id="market.myOrders" defaultMessage="My Orders" />
              </Link>
              <Link to="/tickets" className='rounded'>
                <FormattedMessage id="market.myTickets" defaultMessage="My Tickets" />
              </Link>
            </div>
          </Box>

          <div className='grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,_1fr)_360px]'>
            <div className='flex flex-col gap-6'>
              <AccountListingHeroGallery item={item} />

              <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
                <MetricCard label={intl.formatMessage({ id: 'accountMarket.detail.metricShips', defaultMessage: 'Ships' })} value={item.shipCount} />
                <MetricCard label={intl.formatMessage({ id: 'accountMarket.detail.metricCcus', defaultMessage: 'CCUs' })} value={item.ccuCount} />
                <MetricCard label={intl.formatMessage({ id: 'accountMarket.detail.metricExtras', defaultMessage: 'Extras' })} value={item.extraCount + item.bundleCount} />
                <MetricCard label={intl.formatMessage({ id: 'accountMarket.detail.metricAvailable', defaultMessage: 'Available' })} value={availableStock} />
              </div>

              <div className='border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-neutral-900'>
                {Boolean(item.tags?.length) && (
                  <div className='flex flex-wrap gap-2'>
                  {item.tags?.map((tag) => (
                    <Chip key={`${item.skuId}-${tag}`} variant="outlined" label={tag.toUpperCase()} />
                  ))}
                  </div>
                )}

                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                  <FormattedMessage id="accountMarket.detail.overviewTitle" defaultMessage="Account Overview" />
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  {metaDescription}
                </Typography>

                <Divider sx={{ my: 3 }} />

                <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                  <DetailField
                    label={intl.formatMessage({ id: 'accountMarket.detail.typeLabel', defaultMessage: 'Listing Type' })}
                    value={intl.formatMessage({ id: 'accountMarket.detail.typeValue', defaultMessage: 'Account package' })}
                  />
                  <DetailField
                    label={intl.formatMessage({ id: 'accountMarket.detail.availableLabel', defaultMessage: 'Availability' })}
                    value={intl.formatMessage({ id: 'accountMarket.detail.availableValue', defaultMessage: '{count} available' }, { count: availableStock })}
                  />
                  {typeof item.cost === 'number' && item.cost > 0 && (
                    <DetailField
                      label={intl.formatMessage({ id: 'accountMarket.detail.exchangeValueLabel', defaultMessage: 'Exchange value' })}
                      value={intl.formatNumber(item.cost, { style: 'currency', currency: 'USD' })}
                    />
                  )}
                  <DetailField
                    label={intl.formatMessage({ id: 'accountMarket.detail.updatedLabel', defaultMessage: 'Updated' })}
                    value={formattedUpdatedAt}
                  />
                  <DetailField
                    label={intl.formatMessage({ id: 'accountMarket.detail.gameAccessLabel', defaultMessage: 'Game access' })}
                    value={formatBooleanDetail(intl, metadata.hasGamePackage)}
                  />
                  <DetailField
                    label={intl.formatMessage({ id: 'accountMarket.detail.squadron42Label', defaultMessage: 'Squadron 42 access' })}
                    value={formatBooleanDetail(intl, metadata.hasSquadron42)}
                  />
                  <DetailField
                    label={intl.formatMessage({ id: 'accountMarket.detail.conciergeLevelLabel', defaultMessage: 'Concierge level' })}
                    value={metadata.conciergeLevel}
                  />
                  {typeof metadata.spendAmount === 'number' && metadata.spendAmount > 0 && (
                    <DetailField
                      label={intl.formatMessage({ id: 'accountMarket.detail.spendAmountLabel', defaultMessage: 'Account spend' })}
                      value={intl.formatNumber(metadata.spendAmount, { style: 'currency', currency: 'USD' })}
                    />
                  )}
                </div>
              </div>

              {activeSourceSection && (
                <div className='border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-neutral-900'>
                  {sourceSections.length > 1 ? (
                    <Tabs
                      value={activeSourceTab}
                      onChange={(_event, nextValue) => setSourceTab(nextValue as 'hangar' | 'buyback')}
                      sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
                    >
                      {sourceSections.map((section) => (
                        <Tab
                          key={section.source}
                          value={section.source}
                          label={<SourceLabel source={section.source} />}
                        />
                      ))}
                    </Tabs>
                  ) : (
                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                      <SourceLabel source={activeSourceSection.source} />
                    </Typography>
                  )}

                  <div className='flex flex-col gap-4'>
                    {activeSourceSection.items.map((itemGroup) => {
                      const { entry, nestedEntries } = itemGroup.group;
                      const imageUrl = getAccountEntryPreviewImage(entry, nestedEntries, ships);
                      const ccuDisplay = entry.kind === 'ccu'
                        ? getAccountMarketEntryShipDisplay(entry, ships)
                        : null;
                      const title = entry.kind === 'ccu'
                        ? formatMarketCcuResourceName(intl, ccuDisplay?.fromShipName || '-', ccuDisplay?.toShipName || '-')
                        : getAccountEntryPrimaryLabel(entry);
                      const subtitle = entry.kind === 'bundle'
                        ? intl.formatMessage(
                          { id: 'accountMarket.detail.bundleSummary', defaultMessage: '{count} items included in this package' },
                          { count: nestedEntries.length },
                        )
                        : entry.kind === 'ccu' && itemGroup.group.totalQuantity > 1
                          ? intl.formatMessage(
                            { id: 'accountMarket.detail.quantitySummary', defaultMessage: '{count} upgrades included' },
                            { count: itemGroup.group.totalQuantity },
                          )
                          : undefined;

                      return (
                        <GroupCard
                          key={itemGroup.group.id}
                          title={title}
                          subtitle={subtitle}
                          imageUrl={imageUrl}
                          kind={entry.kind}
                          canGift={entry.canGift}
                          quantity={itemGroup.group.totalQuantity}
                          nestedEntries={nestedEntries}
                          ships={ships}
                          intl={intl}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className='flex flex-col gap-6 xl:sticky xl:top-4 xl:self-start'>
              <div className='border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-neutral-900'>
                <div className='text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300'>
                  <FormattedMessage id="accountMarket.detail.purchaseEyebrow" defaultMessage="Ready-made account" />
                </div>

                <Typography variant="h6" sx={{ mt: 1.5, fontWeight: 700 }}>
                  {item.name}
                </Typography>

                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                  <FormattedMessage
                    id="accountMarket.detail.purchaseSummary"
                    defaultMessage="After you place the order, we will contact you by email to help complete account delivery, binding changes, and credential handoff."
                  />
                </Typography>

                <div className='mt-5 flex flex-col gap-1'>
                  <div className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400'>
                    <FormattedMessage id="accountMarket.detail.priceLabel" defaultMessage="Account Price" />
                  </div>
                  <div className='text-4xl font-black text-slate-900 dark:text-white'>
                    {intl.formatNumber(item.price, { style: 'currency', currency: 'USD' })}
                  </div>
                  <div className='text-sm text-slate-500 dark:text-slate-400'>
                    <FormattedMessage id="accountMarket.detail.stockSummary" defaultMessage="{count} available" values={{ count: availableStock }} />
                  </div>
                </div>

                <Divider sx={{ my: 3 }} />

                <div className='flex flex-col gap-3'>
                  <Button
                    component={Link}
                    to={getAccountMarketCheckoutPath(item.skuId)}
                    variant="contained"
                    startIcon={<ShoppingBag size={18} />}
                    disabled={availableStock <= 0}
                    fullWidth
                  >
                    <FormattedMessage id="accountMarket.detail.buyNow" defaultMessage="Buy now" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
