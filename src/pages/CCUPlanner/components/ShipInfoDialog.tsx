import { Alert, Box, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Link } from '@mui/material';
import { Close, OpenInNew } from '@mui/icons-material';
import { FormattedMessage, useIntl } from 'react-intl';

import RsiIcon from '@/components/RsiIcon';
import { useApi } from '@/hooks';
import { MARKET_ITEM_PLACEHOLDER, toLargeRsiImage } from '@/components/marketItemDisplay';
import {
  ShipComponentSectionKey,
  getRsiIconPath,
  getShipComponentSectionIconPath,
  resolveShipComponentIconPath,
  resolveShipTypeIconPath,
} from '@/data/rsiIcons';
import { Ship, ShipDetailComponent, ShipResponse } from '@/types';

interface ShipInfoDialogProps {
  open: boolean;
  ship: Ship | null;
  onClose: () => void;
}

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

function titleCaseShipValue(value?: string | null) {
  if (!value) return '';

  return value
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
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

function formatShipStatus(ship?: Ship | null) {
  return ship?.flyableStatus || titleCaseShipValue(ship?.details?.productionStatus);
}

function resolveShipImage(ship?: Ship | null) {
  const detailImage = ship?.details?.imageComposer?.find((entry) => entry.slot === 'thumbnail')?.url;

  return toAbsoluteRsiUrl(detailImage)
    || toLargeRsiImage(ship?.medias?.productThumbMediumAndSmall)
    || toAbsoluteRsiUrl(ship?.medias?.slideShow)
    || MARKET_ITEM_PLACEHOLDER;
}

function DetailField({ label, value, iconSrc }: { label: string; value?: string | null; iconSrc?: string | null }) {
  if (!value || value === '-') return null;

  return (
    <div className="flex items-start gap-3 rounded border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <RsiIcon src={iconSrc} className="mt-0.5 h-5 w-5" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          {label}
        </div>
        <div className="text-sm text-slate-800 dark:text-slate-100">
          {value}
        </div>
      </div>
    </div>
  );
}

interface MergedShipDetailComponent extends ShipDetailComponent {
  showQuantity: boolean;
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

function mergeShipComponents(components: ShipDetailComponent[]): MergedShipDetailComponent[] {
  const merged: Array<MergedShipDetailComponent & { occurrenceCount: number; hasExplicitQuantity: boolean }> = [];
  const indexByKey = new Map<string, number>();

  components.forEach((component) => {
    const key = buildShipComponentKey(component);
    const existingIndex = indexByKey.get(key);
    const normalizedDetails = stripRichText(component.details) || undefined;

    if (existingIndex == null) {
      indexByKey.set(key, merged.length);
      merged.push({
        ...component,
        details: normalizedDetails,
        quantity: getComponentQuantity(component),
        showQuantity: false,
        occurrenceCount: 1,
        hasExplicitQuantity: component.quantity != null,
      });
      return;
    }

    const current = merged[existingIndex];
    current.quantity = (current.quantity || 0) + getComponentQuantity(component);
    current.occurrenceCount += 1;
    current.hasExplicitQuantity = current.hasExplicitQuantity || component.quantity != null;
  });

  return merged.map(({ occurrenceCount, hasExplicitQuantity, ...component }) => ({
    ...component,
    showQuantity: occurrenceCount > 1 || hasExplicitQuantity,
  }));
}

function ShipComponentSection({
  title,
  sectionKey,
  components,
}: {
  title: string;
  sectionKey: ShipComponentSectionKey;
  components?: ShipDetailComponent[];
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
          const metadata = [
            component.showQuantity && component.quantity ? `x${component.quantity}` : '',
            component.size || '',
            component.manufacturerName || '',
          ].filter(Boolean);
          const componentIconSrc = resolveShipComponentIconPath(sectionKey, component);

          return (
            <div
              key={`${title}-${component.name || 'component'}-${index}`}
              className="rounded border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <div className="flex items-start gap-3">
                <RsiIcon src={componentIconSrc} className="mt-0.5 h-5 w-5" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {component.name || '-'}
                  </div>
                  {metadata.length > 0 && (
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {metadata.join(' · ')}
                    </div>
                  )}
                  {component.details && (
                    <div className="mt-2 text-xs leading-6 text-slate-700 dark:text-slate-300">
                      {stripRichText(component.details)}
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
  const requestPath = open && ship ? `/api/ship?id=${ship.id}` : null;
  const { data, error } = useApi<ShipResponse>(requestPath, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    dedupingInterval: 60_000,
  });

  const detailedShip = data?.data.ship || ship;
  const isLoading = Boolean(requestPath && !data && !error);
  const detail = detailedShip?.details;
  const description = stripRichText(detail?.body || detail?.excerpt);
  const imageUrl = resolveShipImage(detailedShip);
  const externalShipUrl = toAbsoluteRsiUrl(detail?.url || detailedShip?.link);

  const metadata = [
    detailedShip?.manufacturer?.name,
    detailedShip?.focus,
    titleCaseShipValue(detailedShip?.type),
    titleCaseShipValue(detail?.size),
    formatShipStatus(detailedShip),
  ].filter(Boolean) as string[];

  const coreFields = [
    {
      label: intl.formatMessage({ id: 'market.detail.compare.manufacturer', defaultMessage: 'Manufacturer' }),
      value: detailedShip?.manufacturer?.name || '',
    },
    {
      label: intl.formatMessage({ id: 'market.detail.compare.focus', defaultMessage: 'Role / Focus' }),
      value: detailedShip?.focus || '',
    },
    {
      label: intl.formatMessage({ id: 'market.detail.compare.type', defaultMessage: 'Type' }),
      value: titleCaseShipValue(detailedShip?.type),
      iconSrc: resolveShipTypeIconPath(detailedShip?.type),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.compare.size', defaultMessage: 'Size' }),
      value: titleCaseShipValue(detail?.size),
      iconSrc: getRsiIconPath('shipSize'),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.compare.status', defaultMessage: 'Status' }),
      value: formatShipStatus(detailedShip),
      iconSrc: getRsiIconPath('gameStatus'),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.crew', defaultMessage: 'Crew' }),
      value: formatCrewRange(detail?.minCrew, detail?.maxCrew),
      iconSrc: getRsiIconPath('shipCrew'),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.cargo', defaultMessage: 'Cargo' }),
      value: detail?.cargoCapacity != null ? `${formatMetricValue(detail.cargoCapacity)} SCU` : '',
      iconSrc: getRsiIconPath('shipCapacity'),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.scmSpeed', defaultMessage: 'SCM Speed' }),
      value: detail?.maxScmSpeed != null ? `${formatMetricValue(detail.maxScmSpeed)} m/s` : '',
      iconSrc: getRsiIconPath('shipSpeed'),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.afterburner', defaultMessage: 'Afterburner' }),
      value: detail?.afterburnerSpeed != null ? `${formatMetricValue(detail.afterburnerSpeed)} m/s` : '',
      iconSrc: getRsiIconPath('shipSpeed'),
    },
    {
      label: intl.formatMessage({ id: 'market.detail.dimensions', defaultMessage: 'Dimensions' }),
      value: buildDimensionSummary(detailedShip),
      iconSrc: getRsiIconPath('shipSize'),
    },
    {
      label: intl.formatMessage({ id: 'ships.msrp', defaultMessage: 'MSRP' }),
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
                    <Chip key={`${detailedShip.id}-${entry}`} label={entry} size="small" variant="outlined" />
                  ))}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {coreFields.map((field) => (
                  <DetailField key={field.label} label={field.label} value={field.value} iconSrc={field.iconSrc} />
                ))}
              </div>

              <section className="flex flex-col gap-2">
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  <FormattedMessage id="ccuPlanner.shipInfo.description" defaultMessage="Description" />
                </div>
                <div className="rounded border border-black/10 bg-black/[0.02] p-4 text-sm leading-7 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">
                  {description || (
                    <span className="text-slate-500 dark:text-slate-400">
                      <FormattedMessage id="ccuPlanner.shipInfo.noDescription" defaultMessage="No ship description available." />
                    </span>
                  )}
                </div>
              </section>

              <ShipComponentSection
                sectionKey="weapons"
                title={intl.formatMessage({ id: 'ccuPlanner.shipInfo.weapons', defaultMessage: 'Weapons' })}
                components={detail?.weapons}
              />
              <ShipComponentSection
                sectionKey="avionics"
                title={intl.formatMessage({ id: 'ccuPlanner.shipInfo.avionics', defaultMessage: 'Avionics' })}
                components={detail?.avionics}
              />
              <ShipComponentSection
                sectionKey="modular"
                title={intl.formatMessage({ id: 'ccuPlanner.shipInfo.modular', defaultMessage: 'Modular' })}
                components={detail?.modular}
              />
              <ShipComponentSection
                sectionKey="propulsions"
                title={intl.formatMessage({ id: 'ccuPlanner.shipInfo.propulsions', defaultMessage: 'Propulsions' })}
                components={detail?.propulsions}
              />
              <ShipComponentSection
                sectionKey="thrusters"
                title={intl.formatMessage({ id: 'ccuPlanner.shipInfo.thrusters', defaultMessage: 'Thrusters' })}
                components={detail?.thrusters}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
