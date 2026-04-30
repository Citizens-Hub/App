import {
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  useMediaQuery,
} from '@mui/material';
import { Close, OpenInNew } from '@mui/icons-material';
import { FormattedMessage, useIntl } from 'react-intl';

import RsiIcon from '@/components/RsiIcon';
import { useApi } from '@/hooks';
import { getRsiIconPath } from '@/data/rsiIcons';
import { Ship, ShipResponse } from '@/types';
import ShipInfoContent from './ShipInfoContent';

interface ShipInfoDialogProps {
  open: boolean;
  ship: Ship | null;
  onClose: () => void;
}

function toAbsoluteRsiUrl(url?: string | null) {
  if (!url) return '';
  return url.startsWith('http') ? url : `https://robertsspaceindustries.com${url}`;
}
export default function ShipInfoDialog({ open, ship, onClose }: ShipInfoDialogProps) {
  const intl = useIntl();
  const isMobile = useMediaQuery('(max-width: 644px)');
  const requestPath = open && ship?.id && ship.id > 0 ? `/api/ship?id=${ship.id}` : null;
  const { data: shipResponseData, error: shipResponseError } = useApi<ShipResponse>(requestPath, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    dedupingInterval: 60_000,
  });
  const detailedShip = shipResponseData?.data.ship || ship;
  const isLoading = Boolean(requestPath && !shipResponseData && !shipResponseError);
  const displayShipName = detailedShip?.name || ship?.name || '-';
  const displayManufacturerName = detailedShip?.manufacturer?.name || ship?.manufacturer?.name || '';
  const externalShipUrl = toAbsoluteRsiUrl(detailedShip?.details?.url || detailedShip?.link);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle className="flex items-start justify-between gap-4 border-b border-gray-200 dark:border-gray-800">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            <RsiIcon src={getRsiIconPath('ship')} className="h-5 w-5" toneClassName="bg-slate-700 dark:bg-slate-100" />
            <span className="truncate">{displayShipName}</span>
          </div>
          {displayManufacturerName && (
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {displayManufacturerName}
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
        <ShipInfoContent open={open} ship={ship} />
      </DialogContent>
    </Dialog>
  );
}
