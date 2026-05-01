import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useMediaQuery,
} from '@mui/material';
import { ChevronLeft, ChevronRight, Close, ViewInAr } from '@mui/icons-material';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type ReactNode, type SyntheticEvent, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import RsiIcon from '@/components/RsiIcon';
import { useLocale } from '@/contexts/LocaleContext';
import {
  ShipComponentSectionKey,
  getRsiIconPath,
  getShipComponentSectionIconPath,
  resolveShipComponentIconPath,
  resolveShipTypeIconPath,
} from '@/data/rsiIcons';
import {
  localizeShipComponentDetails,
  localizeShipComponentManufacturer,
  localizeShipComponentName,
  localizeShipComponentSize,
} from '@/data/shipComponentI18n';
import { localizeShipDataLabel } from '@/data/shipDetailLabelI18n';
import { getShipMetadataEntry, localizeShipFocus, localizeShipSize, localizeShipStatus, localizeShipType } from '@/data/shipMetadataI18n';
import { getManufacturerLogoPath } from '@/data/rsiManufacturers';
import { useApi } from '@/hooks';
import { Ship, ShipDetailComponent, ShipGameShopAvailabilityResponse, ShipResponse } from '@/types';
import { getShipDetailImageUrl, getShipSlideshowImage, getShipThumbLarge, getShipThumbSmall } from '@/utils/shipImage';
import ShipModelPreview from './ShipModelPreview';

interface ShipInfoContentProps {
  open: boolean;
  ship: Ship | null;
  extraSections?: ReactNode;
}

const TBD_STRIPED_BACKGROUND_IMAGE = 'repeating-linear-gradient(135deg, rgba(148, 163, 184, 0.18) 0px, rgba(148, 163, 184, 0.18) 12px, rgba(255, 255, 255, 0) 12px, rgba(255, 255, 255, 0) 24px)';

type DetailFieldVariant = 'default' | 'tbd';

function stripRichText(value?: string | null) {
  if (!value) return '';

  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*[*-]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCrewRange(minCrew?: number | null, maxCrew?: number | null, locale = 'en-US') {
  if (minCrew == null && maxCrew == null) return '';
  const numberFormatter = new Intl.NumberFormat(locale);
  if (minCrew != null && maxCrew != null) {
    return minCrew === maxCrew
      ? numberFormatter.format(minCrew)
      : `${numberFormatter.format(minCrew)}-${numberFormatter.format(maxCrew)}`;
  }

  return numberFormatter.format(minCrew ?? maxCrew ?? 0);
}

function formatMetricValue(value?: number | null, locale = 'en-US') {
  if (value == null || Number.isNaN(value)) return '';
  return value.toLocaleString(locale, {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}

function buildDimensionSummary(ship?: Ship | null, locale = 'en-US') {
  const length = formatMetricValue(ship?.details?.length, locale);
  const beam = formatMetricValue(ship?.details?.beam, locale);
  const height = formatMetricValue(ship?.details?.height, locale);

  if (!length && !beam && !height) return '';

  return `${[length, beam, height].filter(Boolean).join(' × ')} m`;
}

function formatUsdValue(value?: number | null, locale = 'en-US') {
  if (value == null) return '';
  return (value / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' });
}

function formatAuecValue(value?: number | null, locale = 'en-US') {
  if (value == null) return '-';
  return `${value.toLocaleString(locale)} aUEC`;
}

function formatTimestamp(value?: string | null, locale = 'en-US') {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(locale);
}

interface ResolvedShipImages {
  images: string[];
  previewImageUrl: string;
  blurredImageUrls: string[];
}

function unique (arr: string[]) {
  return Array.from(new Set(arr))
}

function resolveShipImages(detailedShip?: Ship | null, listShip?: Ship | null): ResolvedShipImages {
  const imageOwnerShip = detailedShip || listShip;
  const previewImages = [
    getShipThumbSmall(listShip),
    getShipThumbSmall(detailedShip),
  ].filter(Boolean) as string[];

  const detailImages = unique([
    ...(detailedShip?.details?.imageComposer?.filter(entry => entry.name === "1440") || []),
  ].map((entry, index) => getShipDetailImageUrl(imageOwnerShip, entry, index)).filter(Boolean) as string[]);

  const fallbackLargeImages = [
    getShipSlideshowImage(detailedShip),
    getShipThumbLarge(detailedShip),
    getShipSlideshowImage(listShip),
    getShipThumbLarge(listShip),
  ].filter(Boolean) as string[];

  const uniquePreviewImages = Array.from(new Set(previewImages));
  const uniqueDetailImages = Array.from(new Set(detailImages));
  const uniqueFallbackLargeImages = Array.from(new Set(fallbackLargeImages));
  const primaryImages = uniqueDetailImages.length > 0 ? uniqueDetailImages : uniqueFallbackLargeImages;

  return {
    images: primaryImages.length > 0 ? primaryImages : uniquePreviewImages,
    previewImageUrl: primaryImages.length > 0 ? (uniquePreviewImages[0] || '') : '',
    blurredImageUrls: uniquePreviewImages,
  };
}

function DetailField({
  label,
  value,
  iconSrc,
  variant = 'default',
}: {
  label: string;
  value?: string | null;
  iconSrc?: string | null;
  variant?: DetailFieldVariant;
}) {
  if (!value || value === '-') return null;

  const isTbd = variant === 'tbd';

  return (
    <div
      className={`flex items-start gap-3 rounded border p-3 ${isTbd
        ? 'border-slate-300 bg-slate-100/90 dark:border-slate-700 dark:bg-slate-900/70'
        : 'border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]'
        }`}
      style={isTbd ? { backgroundImage: TBD_STRIPED_BACKGROUND_IMAGE } : undefined}
    >
      <RsiIcon src={iconSrc} className="mt-0.5 h-5 w-5" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          {label}
        </div>
        <div className={`text-sm ${isTbd ? 'font-medium text-slate-700 dark:text-slate-100' : 'text-slate-800 dark:text-slate-100'}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

function FeaturedShipField({
  label,
  value,
  logoSrc,
}: {
  label: string;
  value?: string | null;
  logoSrc?: string | null;
}) {
  if (!value || value === '-') return null;

  return (
    <div className="relative min-h-[112px] overflow-hidden">
      {logoSrc && (
        <img
          src={logoSrc}
          alt=""
          aria-hidden
          className="pointer-events-none absolute right-0 top-1/2 max-h-[140%] w-auto max-w-[70%] -translate-y-1/2 object-contain opacity-[0.2] dark:invert dark:opacity-[0.2] px-10"
        />
      )}
      <div className="relative z-10 flex h-full flex-col justify-between gap-5 py-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          {label}
        </div>
        <div className="max-w-[22rem] text-lg font-semibold leading-tight text-slate-900 dark:text-slate-50">
          {value}
        </div>
      </div>
    </div>
  );
}

interface MergedShipDetailComponent extends ShipDetailComponent {
  showQuantity: boolean;
  occurrenceCount: number;
  unitQuantity: number;
}

interface CoreField {
  label: string;
  value?: string | null;
  iconSrc?: string | null;
  variant?: DetailFieldVariant;
}

function getComponentQuantity(component: ShipDetailComponent) {
  return typeof component.quantity === 'number' && !Number.isNaN(component.quantity)
    ? component.quantity
    : 1;
}

function buildShipComponentKey(component: ShipDetailComponent) {
  return [
    component.name?.trim().toLowerCase() || '',
    component.size?.trim().toLowerCase() || '',
    component.manufacturerName?.trim().toLowerCase() || '',
    stripRichText(component.details).toLowerCase(),
  ].join('|');
}

function isMannedTurretComponent(component: ShipDetailComponent) {
  return stripRichText(component.details).toLowerCase() === 'manned';
}

function formatWeaponQuantity(component: MergedShipDetailComponent) {
  if (component.occurrenceCount > 1 && component.unitQuantity > 1) {
    return `${component.occurrenceCount}x${component.unitQuantity}`;
  }

  if (component.showQuantity && component.quantity) {
    return `${component.quantity}x`;
  }

  return '';
}

function formatWeaponTitle(locale: string, component: MergedShipDetailComponent) {
  const quantityPrefix = formatWeaponQuantity(component);
  const localizedName = localizeShipComponentName(locale, component.name) || component.name || '-';
  const localizedSize = localizeShipComponentSize(locale, component.size);

  return `${quantityPrefix ? `${quantityPrefix} ` : ''}${localizedName}${localizedSize ? `(${localizedSize})` : ''}`;
}

function isWeaponStyleSection(sectionKey: ShipComponentSectionKey) {
  return sectionKey === 'weapons' || sectionKey === 'turrets';
}

function mergeShipComponents(components: ShipDetailComponent[]): MergedShipDetailComponent[] {
  const merged: Array<MergedShipDetailComponent & { hasExplicitQuantity: boolean }> = [];
  const indexByKey = new Map<string, number>();

  components.forEach((component) => {
    const key = buildShipComponentKey(component);
    const existingIndex = indexByKey.get(key);
    const normalizedDetails = stripRichText(component.details) || undefined;
    const unitQuantity = getComponentQuantity(component);

    if (existingIndex == null) {
      indexByKey.set(key, merged.length);
      merged.push({
        ...component,
        details: normalizedDetails,
        quantity: unitQuantity,
        showQuantity: false,
        occurrenceCount: 1,
        unitQuantity,
        hasExplicitQuantity: component.quantity != null,
      });
      return;
    }

    const current = merged[existingIndex];
    current.quantity = (current.quantity || 0) + unitQuantity;
    current.occurrenceCount += 1;
    current.hasExplicitQuantity = current.hasExplicitQuantity || component.quantity != null;
  });

  return merged.map(({ hasExplicitQuantity, ...component }) => ({
    ...component,
    showQuantity: component.occurrenceCount > 1 || hasExplicitQuantity,
  }));
}

function ShipComponentSection({
  title,
  sectionKey,
  components,
  locale,
}: {
  title: string;
  sectionKey: ShipComponentSectionKey;
  components?: ShipDetailComponent[];
  locale: string;
}) {
  const visibleComponents = (components || []).filter((component) => {
    return Boolean(component.name || component.details || component.manufacturerName);
  });
  const mergedComponents = mergeShipComponents(visibleComponents);
  const sectionIconSrc = getShipComponentSectionIconPath(sectionKey);

  if (mergedComponents.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        <RsiIcon src={sectionIconSrc} />
        <span>{title}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {mergedComponents.slice(0, 12).map((component, index) => {
          const isWeaponSection = isWeaponStyleSection(sectionKey);
          const metadata = [
            !isWeaponSection && component.showQuantity && component.quantity ? `x${component.quantity}` : '',
            !isWeaponSection ? localizeShipComponentSize(locale, component.size) : '',
            localizeShipComponentManufacturer(locale, component.manufacturerName),
          ].filter(Boolean);
          const componentIconSrc = resolveShipComponentIconPath(sectionKey, component);
          const localizedName = isWeaponSection
            ? formatWeaponTitle(locale, component)
            : localizeShipComponentName(locale, component.name) || component.name || '-';
          const detailText = isMannedTurretComponent(component) && sectionKey === 'turrets'
            ? ''
            : localizeShipComponentDetails(locale, stripRichText(component.details));

          return (
            <div
              key={`${title}-${component.name || 'component'}-${index}`}
              className="rounded border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <div className="flex items-start gap-3">
                <RsiIcon src={componentIconSrc} className="mt-0.5 h-5 w-5" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {localizedName}
                  </div>
                  {metadata.length > 0 && (
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {metadata.join(' · ')}
                    </div>
                  )}
                  {detailText && (
                    <div className="mt-2 text-xs leading-6 text-slate-700 dark:text-slate-300">
                      {detailText}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function ShipInfoContent({ open, ship, extraSections }: ShipInfoContentProps) {
  const intl = useIntl();
  const { locale } = useLocale();
  const isMobile = useMediaQuery('(max-width: 644px)');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isMobileModelViewerOpen, setIsMobileModelViewerOpen] = useState(false);
  const [loadedImageUrls, setLoadedImageUrls] = useState<Record<string, true>>({});
  const requestPath = open && ship?.id && ship.id > 0 ? `/api/ship?id=${ship.id}` : null;
  const gameShopRequestPath = open && ship?.id && ship.id > 0 ? `/api/ship/game-shops?id=${ship.id}` : null;
  const { data: shipResponseData, error: shipResponseError } = useApi<ShipResponse>(requestPath, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    dedupingInterval: 60_000,
  });
  const { data: shipGameShopData, error: shipGameShopError } = useApi<ShipGameShopAvailabilityResponse>(gameShopRequestPath, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    dedupingInterval: 60_000,
  });

  const detailedShip = shipResponseData?.data.ship || ship;
  const isGameShopLoading = Boolean(gameShopRequestPath && !shipGameShopData && !shipGameShopError);
  const detail = detailedShip?.details;
  const shipGameShops = shipGameShopData?.data || null;
  const descriptionMarkdown = (detail?.body || detail?.excerpt || '').trim();
  const shipImageSet = useMemo(() => resolveShipImages(detailedShip, ship), [detailedShip, ship]);
  const localizedType = localizeShipType(locale, detailedShip?.type);
  const localizedSize = localizeShipSize(locale, detail?.size);
  const localizedStatus = localizeShipStatus(locale, detailedShip);
  const localizedFocus = localizeShipFocus(locale, detailedShip?.focus);
  const statusEntry = getShipMetadataEntry('status', detailedShip?.flyableStatus || detail?.productionStatus);
  const isTbdStatus = statusEntry.canonicalKey === 'tbd';
  const weaponComponents = (detail?.weapons || []).filter((component) => !isMannedTurretComponent(component));
  const turretComponents = (detail?.weapons || []).filter((component) => isMannedTurretComponent(component));
  const displayShipName = detailedShip?.name || ship?.name || '-';
  const shipImages = shipImageSet.images;
  const previewImageUrl = shipImageSet.previewImageUrl;
  const blurredImageUrls = shipImageSet.blurredImageUrls;
  const currentImageIndex = Math.max(0, Math.min(selectedImageIndex, shipImages.length - 1));
  const imageUrl = shipImages[currentImageIndex] || previewImageUrl || null;
  const shouldBlurCurrentImage = imageUrl ? blurredImageUrls.includes(imageUrl) : false;
  const hasMultipleImages = shipImages.length > 1;
  const isCurrentImageLoaded = imageUrl ? Boolean(loadedImageUrls[imageUrl]) : false;
  const shouldShowSlideshowPreview = Boolean(
    previewImageUrl && imageUrl && previewImageUrl !== imageUrl && !shouldBlurCurrentImage && !isCurrentImageLoaded,
  );
  const hasModelPreview = Boolean(detail?.ctm && detailedShip?.id && detailedShip.id > 0);

  useEffect(() => {
    setSelectedImageIndex(0);
  }, [open, detailedShip?.id, shipImages.length]);

  useEffect(() => {
    setLoadedImageUrls({});
  }, [detailedShip?.id]);

  useEffect(() => {
    if (!open) {
      setIsMobileModelViewerOpen(false);
      return;
    }

    setIsMobileModelViewerOpen(false);
  }, [open, detailedShip?.id]);

  const metadata = [
    { key: 'type', value: localizedType },
    { key: 'size', value: localizedSize },
    { key: 'status', value: localizedStatus, isStriped: isTbdStatus },
  ].filter((entry) => Boolean(entry.value));

  const featuredFields = [
    {
      label: localizeShipDataLabel(locale, 'manufacturer'),
      value: detailedShip?.manufacturer?.name || '',
      logoSrc: getManufacturerLogoPath(detailedShip?.manufacturer),
    },
    {
      label: localizeShipDataLabel(locale, 'focus'),
      value: localizedFocus,
    },
  ];

  const showPreviousImage = () => {
    if (!hasMultipleImages) return;
    setSelectedImageIndex((current) => (current - 1 + shipImages.length) % shipImages.length);
  };

  const showNextImage = () => {
    if (!hasMultipleImages) return;
    setSelectedImageIndex((current) => (current + 1) % shipImages.length);
  };

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const loadedUrl = event.currentTarget.currentSrc || event.currentTarget.src;
    if (!loadedUrl) {
      return;
    }

    setLoadedImageUrls((current) => {
      if (current[loadedUrl]) {
        return current;
      }

      return {
        ...current,
        [loadedUrl]: true,
      };
    });
  };

  const coreFields: CoreField[] = [
    {
      label: localizeShipDataLabel(locale, 'type'),
      value: localizedType,
      iconSrc: resolveShipTypeIconPath(detailedShip?.type),
    },
    {
      label: localizeShipDataLabel(locale, 'size'),
      value: localizedSize,
      iconSrc: getRsiIconPath('shipSize'),
    },
    {
      label: localizeShipDataLabel(locale, 'status'),
      value: localizedStatus,
      iconSrc: getRsiIconPath('gameStatus'),
      variant: isTbdStatus ? 'tbd' : 'default',
    },
    {
      label: localizeShipDataLabel(locale, 'crew'),
      value: formatCrewRange(detail?.minCrew, detail?.maxCrew, intl.locale),
      iconSrc: getRsiIconPath('shipCrew'),
    },
    {
      label: localizeShipDataLabel(locale, 'cargo'),
      value: detail?.cargoCapacity != null ? `${formatMetricValue(detail.cargoCapacity, intl.locale)} SCU` : '',
      iconSrc: getRsiIconPath('shipCapacity'),
    },
    {
      label: localizeShipDataLabel(locale, 'scmSpeed'),
      value: detail?.maxScmSpeed != null ? `${formatMetricValue(detail.maxScmSpeed, intl.locale)} m/s` : '',
      iconSrc: getRsiIconPath('shipSpeed'),
    },
    {
      label: localizeShipDataLabel(locale, 'afterburner'),
      value: detail?.afterburnerSpeed != null ? `${formatMetricValue(detail.afterburnerSpeed, intl.locale)} m/s` : '',
      iconSrc: getRsiIconPath('shipSpeed'),
    },
    {
      label: localizeShipDataLabel(locale, 'dimensions'),
      value: buildDimensionSummary(detailedShip, intl.locale),
      iconSrc: getRsiIconPath('shipSize'),
    },
    {
      label: localizeShipDataLabel(locale, 'msrp'),
      value: formatUsdValue(detailedShip?.msrp, intl.locale),
      iconSrc: getRsiIconPath('uec'),
    },
  ];

  // const { priceHistoryMap, loading: priceHistoryLoading, error: priceHistoryError } = usePriceHistoryData();

  // const selectedPriceHistory = ship?.id ? priceHistoryMap[ship?.id] : null;

  return (
    <>
      {!detailedShip ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <CircularProgress size={28} />
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="relative overflow-hidden border-b border-black/10 bg-slate-100 dark:border-white/10 dark:bg-slate-950">
            {shouldShowSlideshowPreview && (
              <Box
                component="img"
                sx={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: { xs: 360, md: 480 },
                  objectFit: 'cover',
                  filter: 'blur(20px) saturate(0.9)',
                  transform: 'scale(1.08)',
                  opacity: 0.92,
                }}
                src={previewImageUrl}
                alt=""
                aria-hidden
              />
            )}
            {shouldShowSlideshowPreview && (
              <div className="pointer-events-none absolute inset-0 bg-slate-950/18 backdrop-brightness-90" />
            )}
            <Box
              component="img"
              sx={{
                position: 'relative',
                width: '100%',
                height: { xs: 360, md: 480 },
                objectFit: 'cover',
                filter: shouldBlurCurrentImage ? 'blur(20px) saturate(0.9)' : 'none',
                transform: shouldBlurCurrentImage ? 'scale(1.08)' : 'none',
                opacity: shouldShowSlideshowPreview ? 0 : 1,
                transition: 'opacity 240ms ease, filter 240ms ease, transform 240ms ease',
              }}
              src={imageUrl || undefined}
              alt={`${detailedShip.name} ${currentImageIndex + 1}`}
              onLoad={handleImageLoad}
            />
            {hasMultipleImages && (
              <>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end p-3">
                  <div className="rounded-full border border-white/20 bg-slate-950/45 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
                    {currentImageIndex + 1} / {shipImages.length}
                  </div>
                </div>
                <IconButton
                  onClick={showPreviousImage}
                  aria-label={intl.formatMessage({
                    id: 'ccuPlanner.shipInfo.previousImage',
                    defaultMessage: 'Previous image',
                  })}
                  sx={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: (theme) => theme.palette.mode === 'dark' ? theme.palette.common.white : theme.palette.grey[800],
                    border: '1px solid',
                    borderColor: 'rgba(255, 255, 255, 0.18)',
                    backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.56)' : 'rgba(255, 255, 255, 0.82)',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.18)',
                    '&:hover': {
                      backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.72)' : 'rgba(255, 255, 255, 0.94)',
                    },
                  }}
                >
                  <ChevronLeft />
                </IconButton>
                <IconButton
                  onClick={showNextImage}
                  aria-label={intl.formatMessage({
                    id: 'ccuPlanner.shipInfo.nextImage',
                    defaultMessage: 'Next image',
                  })}
                  sx={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: (theme) => theme.palette.mode === 'dark' ? theme.palette.common.white : theme.palette.grey[800],
                    border: '1px solid',
                    borderColor: 'rgba(255, 255, 255, 0.18)',
                    backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.56)' : 'rgba(255, 255, 255, 0.82)',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 10px 24px rgba(15, 23, 42, 0.18)',
                    '&:hover': {
                      backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.72)' : 'rgba(255, 255, 255, 0.94)',
                    },
                  }}
                >
                  <ChevronRight />
                </IconButton>
              </>
            )}
          </div>

          <div className="flex flex-col gap-5 p-6">
            {shipResponseError && (
              <Alert severity="warning">
                <FormattedMessage
                  id="ccuPlanner.shipInfo.loadFailed"
                  defaultMessage="Ship detail API request failed. Displaying the basic ship data currently available."
                />
              </Alert>
            )}

            {metadata.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {metadata.map((entry) => (
                  <Chip
                    key={`${detailedShip.id}-${entry.key}`}
                    label={entry.value}
                    size="small"
                    variant={entry.isStriped ? 'filled' : 'outlined'}
                    sx={entry.isStriped ? (theme) => ({
                      border: '1px solid',
                      borderColor: theme.palette.mode === 'dark' ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.28)',
                      backgroundColor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.78)' : 'rgba(241, 245, 249, 0.95)',
                      backgroundImage: TBD_STRIPED_BACKGROUND_IMAGE,
                      color: theme.palette.mode === 'dark' ? theme.palette.grey[100] : theme.palette.grey[800],
                      '& .MuiChip-label': {
                        fontWeight: 600,
                      },
                    }) : undefined}
                  />
                ))}
              </div>
            )}

            {extraSections}

            <div className="grid gap-6 border-y border-black/10 py-5 md:grid-cols-2 md:gap-0 dark:border-white/10">
              {featuredFields.reverse().map((field, index) => (
                <div
                  key={field.label}
                  className={index === 0 ? 'md:pr-8' : 'md:border-l md:border-black/10 md:pl-8 dark:md:border-white/10'}
                >
                  <FeaturedShipField
                    label={field.label}
                    value={field.value}
                    logoSrc={field.logoSrc}
                  />
                </div>
              ))}
            </div>

            {hasModelPreview && !isMobile && (
              <ShipModelPreview
                open={open}
                shipId={detailedShip.id}
              />
            )}

            {hasModelPreview && isMobile && (
              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    <FormattedMessage id="ccuPlanner.shipInfo.modelPreview" defaultMessage="3D Preview" />
                  </div>
                </div>
                <div className="rounded border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <Button
                    fullWidth
                    variant="outlined"
                    size="large"
                    startIcon={<ViewInAr />}
                    onClick={() => setIsMobileModelViewerOpen(true)}
                  >
                    <FormattedMessage
                      id="ccuPlanner.shipInfo.openModelViewer"
                      defaultMessage="Open 3D Viewer"
                    />
                  </Button>
                </div>
              </section>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {coreFields.map((field) => (
                <DetailField
                  key={field.label}
                  label={field.label}
                  value={field.value}
                  iconSrc={field.iconSrc}
                  variant={field.variant}
                />
              ))}
            </div>

            <section className="flex flex-col gap-2">
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                <FormattedMessage id="ccuPlanner.shipInfo.description" defaultMessage="Description" />
              </div>
              <div className="ship-info-description-markdown rounded border border-black/10 bg-black/[0.02] p-4 text-sm leading-7 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">
                {descriptionMarkdown ? (
                  <MarkdownPreview
                    source={descriptionMarkdown}
                    skipHtml={false}
                    style={{
                      backgroundColor: 'transparent',
                      color: 'inherit',
                      fontSize: '0.875rem',
                      lineHeight: '1.75',
                    }}
                    wrapperElement={{
                      'data-color-mode': typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
                    }}
                  />
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">
                    <FormattedMessage id="ccuPlanner.shipInfo.noDescription" defaultMessage="No ship description available." />
                  </span>
                )}
              </div>
            </section>

            {!!shipGameShops?.summary.shopCount && (
              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    <FormattedMessage id="ccuPlanner.shipInfo.gameShops" defaultMessage="In-Game Shops" />
                  </div>
                  {isGameShopLoading && <CircularProgress size={18} />}
                </div>

                {shipGameShopError && (
                  <Alert severity="warning">
                    <FormattedMessage
                      id="ccuPlanner.shipInfo.gameShopsLoadFailed"
                      defaultMessage="Failed to load the in-game shop purchase data for this ship."
                    />
                  </Alert>
                )}

                {!isGameShopLoading && shipGameShops && shipGameShops.summary.shopCount > 0 && (
                  <TableContainer className="rounded border border-black/10 dark:border-white/10">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>
                            <FormattedMessage id="ccuPlanner.shipInfo.gameShops.shop" defaultMessage="Shop" />
                          </TableCell>
                          <TableCell>
                            <FormattedMessage id="ccuPlanner.shipInfo.gameShops.price" defaultMessage="Price" />
                          </TableCell>
                          <TableCell align="right">
                            <FormattedMessage id="ccuPlanner.shipInfo.gameShops.updated" defaultMessage="Updated" />
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {shipGameShops.list.map((entry) => (
                          <TableRow key={`${entry.shopId}-${entry.sourceRef}`}>
                            <TableCell>
                              <div className="flex min-w-0 flex-col gap-1">
                                <div className="font-medium text-slate-900 dark:text-slate-100">
                                  {entry.shopName}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {[entry.system, entry.location].filter(Boolean).join(' / ') || '-'}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {entry.isRental ? (
                                <div>
                                  <Chip
                                    size="small"
                                    label={intl.formatMessage({
                                      id: 'ccuPlanner.shipInfo.gameShops.rental',
                                      defaultMessage: 'Rental',
                                    })}
                                  />
                                </div>
                              ) : formatAuecValue(entry.price, intl.locale)}
                            </TableCell>
                            <TableCell align="right">{formatTimestamp(entry.lastSeenAt, intl.locale)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </section>
            )}

            {/* <section className='h-[600px]'>
              {priceHistoryError ? <></> : priceHistoryLoading ? <></> : <PriceHistoryChart
                history={selectedPriceHistory?.history || null}
                currentMsrp={ship?.msrp || 0}
                shipName={ship?.name || ''}
              />}
            </section> */}

            <ShipComponentSection
              sectionKey="turrets"
              title={localizeShipDataLabel(locale, 'turrets')}
              components={turretComponents}
              locale={locale}
            />
            <ShipComponentSection
              sectionKey="weapons"
              title={localizeShipDataLabel(locale, 'weapons')}
              components={weaponComponents}
              locale={locale}
            />
            <ShipComponentSection
              sectionKey="avionics"
              title={localizeShipDataLabel(locale, 'avionics')}
              components={detail?.avionics}
              locale={locale}
            />
            <ShipComponentSection
              sectionKey="modular"
              title={localizeShipDataLabel(locale, 'modular')}
              components={detail?.modular}
              locale={locale}
            />
            <ShipComponentSection
              sectionKey="propulsions"
              title={localizeShipDataLabel(locale, 'propulsions')}
              components={detail?.propulsions}
              locale={locale}
            />
            <ShipComponentSection
              sectionKey="thrusters"
              title={localizeShipDataLabel(locale, 'thrusters')}
              components={detail?.thrusters}
              locale={locale}
            />
          </div>
        </div>
      )}

      {hasModelPreview && isMobile && (
        <Dialog
          open={open && isMobileModelViewerOpen}
          onClose={() => setIsMobileModelViewerOpen(false)}
          fullScreen
        >
          <DialogTitle className="flex items-start justify-between gap-4 border-b border-gray-200 dark:border-gray-800">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                <ViewInAr fontSize="small" />
                <span className="truncate">{displayShipName}</span>
              </div>
            </div>
            <IconButton
              onClick={() => setIsMobileModelViewerOpen(false)}
              size="small"
              aria-label={intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}
            >
              <Close />
            </IconButton>
          </DialogTitle>

          <DialogContent
            className="!flex !min-h-0 !flex-col !p-0"
            sx={{ p: 0, overflow: 'hidden', flex: 1, minHeight: 0 }}
          >
            <ShipModelPreview
              open={open && isMobileModelViewerOpen}
              shipId={detailedShip?.id}
              showHeader={false}
              variant="fullscreen"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
