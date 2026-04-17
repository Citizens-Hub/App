import { Alert, Box, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Link } from '@mui/material';
import { Close, OpenInNew } from '@mui/icons-material';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { FormattedMessage, useIntl } from 'react-intl';

import RsiIcon from '@/components/RsiIcon';
import { useLocale } from '@/contexts/LocaleContext';
import { useApi } from '@/hooks';
import { MARKET_ITEM_PLACEHOLDER, toLargeRsiImage } from '@/components/marketItemDisplay';
import {
  ShipComponentSectionKey,
  getRsiIconPath,
  getShipComponentSectionIconPath,
  resolveShipComponentIconPath,
  resolveShipTypeIconPath,
} from '@/data/rsiIcons';
import {
  localizeShipComponentManufacturer,
  localizeShipComponentName,
  localizeShipComponentSize,
} from '@/data/shipComponentI18n';
import { localizeShipDataLabel } from '@/data/shipDetailLabelI18n';
import { getShipMetadataEntry, localizeShipFocus, localizeShipSize, localizeShipStatus, localizeShipType } from '@/data/shipMetadataI18n';
import { getManufacturerLogoPath } from '@/data/rsiManufacturers';
import { Ship, ShipDetailComponent, ShipResponse } from '@/types';

interface ShipInfoDialogProps {
  open: boolean;
  ship: Ship | null;
  onClose: () => void;
}

const TBD_STRIPED_BACKGROUND_IMAGE = 'repeating-linear-gradient(135deg, rgba(148, 163, 184, 0.18) 0px, rgba(148, 163, 184, 0.18) 12px, rgba(255, 255, 255, 0) 12px, rgba(255, 255, 255, 0) 24px)';

type DetailFieldVariant = 'default' | 'tbd';

function toAbsoluteRsiUrl(url?: string | null) {
  if (!url) return '';
  return url.startsWith('http') ? url : `https://robertsspaceindustries.com${url}`;
}

function stripRichText(value?: string | null) {
  if (!value) return '';

  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*[*-]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCrewRange(minCrew?: number | null, maxCrew?: number | null) {
  if (minCrew == null && maxCrew == null) return '';
  if (minCrew != null && maxCrew != null) {
    return minCrew === maxCrew ? `${minCrew}` : `${minCrew}-${maxCrew}`;
  }

  return `${minCrew ?? maxCrew ?? ''}`;
}

function formatMetricValue(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '';
  return Number.isInteger(value) ? `${value}` : `${value}`;
}

function buildDimensionSummary(ship?: Ship | null) {
  const length = formatMetricValue(ship?.details?.length);
  const beam = formatMetricValue(ship?.details?.beam);
  const height = formatMetricValue(ship?.details?.height);

  if (!length && !beam && !height) return '';

  return `${[length, beam, height].filter(Boolean).join(' × ')} m`;
}

function formatUsdValue(value?: number | null, locale = 'en-US') {
  if (value == null) return '';
  return (value / 100).toLocaleString(locale, { style: 'currency', currency: 'USD' });
}

function resolveShipImage(ship?: Ship | null) {
  const detailImage = ship?.details?.imageComposer?.find((entry) => entry.slot === 'thumbnail')?.url;

  return toAbsoluteRsiUrl(detailImage)
    || toLargeRsiImage(ship?.medias?.productThumbMediumAndSmall)
    || toAbsoluteRsiUrl(ship?.medias?.slideShow)
    || MARKET_ITEM_PLACEHOLDER;
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
      className={`flex items-start gap-3 rounded border p-3 ${
        isTbd
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
          className="pointer-events-none absolute right-0 top-1/2 max-h-[140%] w-auto max-w-[70%] -translate-y-1/2 object-contain opacity-[0.2] dark:invert dark:opacity-[0.2]"
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
        {title}
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
            : stripRichText(component.details);

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

export default function ShipInfoDialog({ open, ship, onClose }: ShipInfoDialogProps) {
  const intl = useIntl();
  const { locale } = useLocale();
  const requestPath = open && ship ? `/api/ship?id=${ship.id}` : null;
  const { data, error } = useApi<ShipResponse>(requestPath, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    dedupingInterval: 60_000,
  });

  const detailedShip = data?.data.ship || ship;
  const isLoading = Boolean(requestPath && !data && !error);
  const detail = detailedShip?.details;
  const descriptionMarkdown = (detail?.body || detail?.excerpt || '').trim();
  const imageUrl = resolveShipImage(detailedShip);
  const externalShipUrl = toAbsoluteRsiUrl(detail?.url || detailedShip?.link);
  const manufacturerLogoSrc = getManufacturerLogoPath(detailedShip?.manufacturer);
  const localizedType = localizeShipType(locale, detailedShip?.type);
  const localizedSize = localizeShipSize(locale, detail?.size);
  const localizedStatus = localizeShipStatus(locale, detailedShip);
  const localizedFocus = localizeShipFocus(locale, detailedShip?.focus);
  const statusEntry = getShipMetadataEntry('status', detailedShip?.flyableStatus || detail?.productionStatus);
  const isTbdStatus = statusEntry.canonicalKey === 'tbd';
  const weaponComponents = (detail?.weapons || []).filter((component) => !isMannedTurretComponent(component));
  const turretComponents = (detail?.weapons || []).filter((component) => isMannedTurretComponent(component));

  const metadata = [
    { key: 'type', value: localizedType },
    { key: 'size', value: localizedSize },
    { key: 'status', value: localizedStatus, isStriped: isTbdStatus },
  ].filter((entry) => Boolean(entry.value));

  const featuredFields = [
    {
      label: localizeShipDataLabel(locale, 'manufacturer'),
      value: detailedShip?.manufacturer?.name || '',
      logoSrc: manufacturerLogoSrc,
    },
    {
      label: localizeShipDataLabel(locale, 'focus'),
      value: localizedFocus,
    },
  ];

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
      value: formatCrewRange(detail?.minCrew, detail?.maxCrew),
      iconSrc: getRsiIconPath('shipCrew'),
    },
    {
      label: localizeShipDataLabel(locale, 'cargo'),
      value: detail?.cargoCapacity != null ? `${formatMetricValue(detail.cargoCapacity)} SCU` : '',
      iconSrc: getRsiIconPath('shipCapacity'),
    },
    {
      label: localizeShipDataLabel(locale, 'scmSpeed'),
      value: detail?.maxScmSpeed != null ? `${formatMetricValue(detail.maxScmSpeed)} m/s` : '',
      iconSrc: getRsiIconPath('shipSpeed'),
    },
    {
      label: localizeShipDataLabel(locale, 'afterburner'),
      value: detail?.afterburnerSpeed != null ? `${formatMetricValue(detail.afterburnerSpeed)} m/s` : '',
      iconSrc: getRsiIconPath('shipSpeed'),
    },
    {
      label: localizeShipDataLabel(locale, 'dimensions'),
      value: buildDimensionSummary(detailedShip),
      iconSrc: getRsiIconPath('shipSize'),
    },
    {
      label: localizeShipDataLabel(locale, 'msrp'),
      value: formatUsdValue(detailedShip?.msrp, intl.locale),
      iconSrc: getRsiIconPath('uec'),
    },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle className="flex items-start justify-between gap-4 border-b border-gray-200 dark:border-gray-800">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            <RsiIcon src={getRsiIconPath('ship')} className="h-5 w-5" toneClassName="bg-slate-700 dark:bg-slate-100" />
            <span className="truncate">{detailedShip?.name || ship?.name || '-'}</span>
          </div>
          {detailedShip?.manufacturer?.name && (
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {detailedShip.manufacturer.name}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isLoading && <CircularProgress size={18} />}
          {externalShipUrl && (
            <Link
              href={externalShipUrl}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              className="inline-flex items-center gap-1 text-sm"
            >
              <FormattedMessage id="ccuPlanner.shipInfo.openOnRsi" defaultMessage="Open on RSI" />
              <OpenInNew fontSize="inherit" />
            </Link>
          )}
          <IconButton onClick={onClose} size="small" aria-label={intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}>
            <Close />
          </IconButton>
        </div>
      </DialogTitle>

      <DialogContent className="!p-0">
        {!detailedShip ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <CircularProgress size={28} />
          </div>
        ) : (
          <div className="flex flex-col">
            <Box
              component="img"
              sx={{ width: '100%', height: { xs: 240, md: 360 }, objectFit: 'cover' }}
              src={imageUrl}
              alt={detailedShip.name}
            />

            <div className="flex flex-col gap-5 p-6">
              {error && (
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
                <div className="rounded border border-black/10 bg-black/[0.02] p-4 text-sm leading-7 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">
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
                        'data-color-mode': document.documentElement.classList.contains('dark') ? 'dark' : 'light',
                      }}
                    />
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">
                      <FormattedMessage id="ccuPlanner.shipInfo.noDescription" defaultMessage="No ship description available." />
                    </span>
                  )}
                </div>
              </section>

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
      </DialogContent>
    </Dialog>
  );
}
