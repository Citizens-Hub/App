import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, Button } from '@mui/material';
import { Close } from '@mui/icons-material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useCcuPlanner } from '../context/useCcuPlanner';
import { AutoPathBuildRequest } from '../services/PathBuilderService';

interface PathBuilderProps {
  open: boolean;
  onClose: () => void;
  onCreatePath: (request: AutoPathBuildRequest) => void;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateRangeToTs(startDate: string, endDate: string): { startTs: number; endTs: number } | null {
  const startTs = new Date(`${startDate}T00:00:00`).getTime();
  const endTs = new Date(`${endDate}T23:59:59`).getTime();

  if (Number.isNaN(startTs) || Number.isNaN(endTs)) {
    return null;
  }

  return { startTs, endTs };
}

export default function PathBuilder({ open, onClose, onCreatePath }: PathBuilderProps) {
  const intl = useIntl();
  const { ships, priceHistoryMap, showAlert } = useCcuPlanner();

  const [startShipId, setStartShipId] = useState<number | ''>('');
  const [targetShipId, setTargetShipId] = useState<number | ''>('');
  const [rangeStartDate, setRangeStartDate] = useState('');
  const [rangeEndDate, setRangeEndDate] = useState('');
  const [includeWarbond, setIncludeWarbond] = useState(true);
  const [includePriceIncrease, setIncludePriceIncrease] = useState(true);
  const [ignoreTargetAvailability, setIgnoreTargetAvailability] = useState(true);
  const [preferHangarCcu, setPreferHangarCcu] = useState(true);

  const selectableShips = useMemo(
    () => ships.filter(ship => ship.msrp > 0).sort((a, b) => a.msrp - b.msrp),
    [ships]
  );

  const startShip = useMemo(
    () => selectableShips.find(ship => ship.id === startShipId),
    [selectableShips, startShipId]
  );

  const targetShipOptions = useMemo(() => {
    if (!startShip) {
      return selectableShips;
    }

    return selectableShips.filter(ship => ship.msrp > startShip.msrp);
  }, [selectableShips, startShip]);

  useEffect(() => {
    if (!open) return;

    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setFullYear(now.getFullYear() - 1);

    setStartShipId('');
    setTargetShipId('');
    setRangeStartDate(toDateInputValue(defaultStart));
    setRangeEndDate(toDateInputValue(now));
    setIncludeWarbond(true);
    setIncludePriceIncrease(true);
    setIgnoreTargetAvailability(true);
    setPreferHangarCcu(true);
  }, [open]);

  useEffect(() => {
    if (!startShip) {
      return;
    }

    const target = selectableShips.find(ship => ship.id === targetShipId);
    if (target && target.msrp > startShip.msrp) {
      return;
    }

    setTargetShipId('');
  }, [startShip, targetShipId, selectableShips]);

  const handleCreatePath = () => {
    if (!startShipId || !targetShipId) {
      showAlert(
        intl.formatMessage({
          id: 'pathBuilder.error.selectShip',
          defaultMessage: 'Please select both starting ship and target ship.'
        }),
        'warning'
      );
      return;
    }

    if (!includeWarbond && !includePriceIncrease) {
      showAlert(
        intl.formatMessage({
          id: 'pathBuilder.error.optionRequired',
          defaultMessage: 'Please select at least one historical option.'
        }),
        'warning'
      );
      return;
    }

    const range = parseDateRangeToTs(rangeStartDate, rangeEndDate);
    if (!range || range.startTs > range.endTs) {
      showAlert(
        intl.formatMessage({
          id: 'pathBuilder.error.invalidDateRange',
          defaultMessage: 'Please enter a valid date range.'
        }),
        'warning'
      );
      return;
    }

    const request: AutoPathBuildRequest = {
      startShipId,
      targetShipId,
      rangeStartTs: range.startTs,
      rangeEndTs: range.endTs,
      includeWarbond,
      includePriceIncrease,
      ignoreTargetAvailability,
      preferHangarCcu
    };

    if (!ignoreTargetAvailability) {
      const targetHistory = priceHistoryMap[targetShipId]?.history || [];
      const hasValidSkuInRange = targetHistory.some(entry =>
        entry.change === '+' &&
        typeof entry.msrp === 'number' &&
        typeof entry.sku === 'number' &&
        entry.ts >= range.startTs &&
        entry.ts <= range.endTs
      );

      if (!hasValidSkuInRange) {
        showAlert(
          intl.formatMessage({
            id: 'pathBuilder.error.targetUnavailableInRange',
            defaultMessage: 'The target ship has no valid SKU in the selected date range. Enable "Ignore target availability" to continue.'
          }),
          'warning'
        );
        return;
      }
    }

    onCreatePath(request);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle className="flex justify-between items-center border-b border-gray-200">
        <div>
          <FormattedMessage id="pathBuilder.title" defaultMessage="Path Builder" />
        </div>
        <IconButton onClick={onClose} size="small" aria-label={intl.formatMessage({ id: 'pathBuilder.close', defaultMessage: 'Close' })}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent className="p-0">
        <div className="flex flex-col gap-4 p-4">
          <div className="text-sm text-gray-500">
            <FormattedMessage
              id="pathBuilder.autoHint"
              defaultMessage="Automatically generate a CCU path graph from your starting ship to your target ship using historical opportunities in the selected time range."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="auto-start-ship" className="text-sm font-medium">
                <FormattedMessage id="pathBuilder.startShip" defaultMessage="Starting Ship" />
              </label>
              <select
                id="auto-start-ship"
                value={startShipId}
                onChange={(e) => setStartShipId(e.target.value ? Number(e.target.value) : '')}
                className="border border-gray-300 rounded-md px-3 py-2 bg-white dark:bg-[#121212]"
              >
                <option value="">
                  {intl.formatMessage({ id: 'pathBuilder.selectStartShip', defaultMessage: 'Select starting ship' })}
                </option>
                {selectableShips.map(ship => (
                  <option key={ship.id} value={ship.id}>
                    {ship.name} ({(ship.msrp / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="auto-target-ship" className="text-sm font-medium">
                <FormattedMessage id="pathBuilder.targetShip" defaultMessage="Target Ship" />
              </label>
              <select
                id="auto-target-ship"
                value={targetShipId}
                onChange={(e) => setTargetShipId(e.target.value ? Number(e.target.value) : '')}
                className="border border-gray-300 rounded-md px-3 py-2 bg-white dark:bg-[#121212]"
              >
                <option value="">
                  {intl.formatMessage({ id: 'pathBuilder.selectTargetShip', defaultMessage: 'Select target ship' })}
                </option>
                {targetShipOptions.map(ship => (
                  <option key={ship.id} value={ship.id}>
                    {ship.name} ({(ship.msrp / 100).toLocaleString(intl.locale, { style: 'currency', currency: 'USD' })})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="auto-range-start" className="text-sm font-medium">
                <FormattedMessage id="pathBuilder.rangeStart" defaultMessage="Start Date" />
              </label>
              <input
                id="auto-range-start"
                type="date"
                value={rangeStartDate}
                onChange={(e) => setRangeStartDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 bg-white dark:bg-[#121212]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="auto-range-end" className="text-sm font-medium">
                <FormattedMessage id="pathBuilder.rangeEnd" defaultMessage="End Date" />
              </label>
              <input
                id="auto-range-end"
                type="date"
                value={rangeEndDate}
                onChange={(e) => setRangeEndDate(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 bg-white dark:bg-[#121212]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 border border-gray-200 rounded-md p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeWarbond}
                onChange={(e) => setIncludeWarbond(e.target.checked)}
              />
              <span className="text-sm">
                <FormattedMessage
                  id="pathBuilder.option.warbond"
                  defaultMessage="Use Warbond CCUs sold in this period"
                />
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includePriceIncrease}
                onChange={(e) => setIncludePriceIncrease(e.target.checked)}
              />
              <span className="text-sm">
                <FormattedMessage
                  id="pathBuilder.option.priceIncrease"
                  defaultMessage="Use price-increase CCUs (historical standard SKU price lower than current SKU price)"
                />
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ignoreTargetAvailability}
                onChange={(e) => setIgnoreTargetAvailability(e.target.checked)}
              />
              <span className="text-sm">
                <FormattedMessage
                  id="pathBuilder.option.ignoreTargetAvailability"
                  defaultMessage="Ignore target ship availability (recommended)"
                />
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={preferHangarCcu}
                onChange={(e) => setPreferHangarCcu(e.target.checked)}
              />
              <span className="text-sm">
                <FormattedMessage
                  id="pathBuilder.option.preferHangar"
                  defaultMessage="Prefer hangar CCUs when possible"
                />
              </span>
            </label>
          </div>
        </div>

        <div className="border-t border-gray-200 p-4 flex justify-end gap-2">
          <Button onClick={onClose} variant="outlined">
            <FormattedMessage id="pathBuilder.cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={handleCreatePath} variant="contained" color="primary">
            <FormattedMessage id="pathBuilder.createPath" defaultMessage="Create path" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
