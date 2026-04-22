import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Button, Drawer, IconButton, InputAdornment, TextField } from '@mui/material';
import { Theme, alpha } from '@mui/material/styles';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ViewInArRoundedIcon from '@mui/icons-material/ViewInArRounded';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';

import Crawler from '@/components/Crawler';
import UserSelector from '@/components/UserSelector';
import { useApi } from '@/hooks/swr/useApi';
import FleetModelViewer from '@/pages/FleetView/FleetModelViewer';
import { formatUsdPrice } from '@/pages/Market/marketI18n';
import { RootState } from '@/store';
import { BundleItem, ShipItem, selectUsersHangarItems } from '@/store/upgradesStore';
import type { Ship, ShipDimensionsResponse, ShipsData } from '@/types';

interface FleetShipEntry {
  key: string;
  shipId: number | null;
  shipName: string;
  displayName: string;
  manufacturerName: string;
  imageUrl: string;
  msrpCents: number | null;
  quantity: number;
  standaloneQuantity: number;
  bundleQuantity: number;
  lengthMeters: number | null;
  beamMeters: number | null;
  heightMeters: number | null;
  insuranceLabels: string[];
  bundleNames: string[];
  searchIndex: string;
}

interface FleetPickerShipEntry extends Omit<FleetShipEntry, 'shipId'> {
  shipId: number;
  isOwned: boolean;
}

interface MutableFleetShipEntry {
  key: string;
  shipId: number | null;
  shipName: string;
  displayName: string;
  manufacturerName: string;
  imageUrl: string;
  msrpCents: number | null;
  quantity: number;
  standaloneQuantity: number;
  bundleQuantity: number;
  lengthMeters: number | null;
  beamMeters: number | null;
  heightMeters: number | null;
  insuranceLabels: Set<string>;
  bundleNames: Set<string>;
  firstSeenOrder: number;
}

const FALLBACK_SHIP_IMAGE = '/rsi-icons/shipEmpty.svg';
const MODEL_PICKER_DRAG_TYPE = 'application/citizenshub-fleet-ship-key';

const fleetTextFieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '4px',
    backgroundColor: (theme: Theme) => (theme.palette.mode === 'dark' ? '#121212' : '#ffffff'),
    color: (theme: Theme) => (theme.palette.mode === 'dark' ? '#f5f5f5' : '#18181b'),
    '& fieldset': {
      borderColor: (theme: Theme) => (theme.palette.mode === 'dark' ? '#404040' : '#d4d4d8'),
    },
    '&:hover fieldset': {
      borderColor: (theme: Theme) => (theme.palette.mode === 'dark' ? '#737373' : '#a1a1aa'),
    },
    '&.Mui-focused fieldset': {
      borderColor: '#2563eb',
    },
  },
  '& .MuiInputBase-input::placeholder': {
    color: (theme: Theme) => (theme.palette.mode === 'dark' ? '#a3a3a3' : '#71717a'),
    opacity: 1,
  },
  '& .MuiInputAdornment-root .MuiSvgIcon-root': {
    color: (theme: Theme) => (theme.palette.mode === 'dark' ? '#a3a3a3' : '#71717a'),
  },
};

const viewerTextFieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '4px',
    backgroundColor: '#121212',
    color: '#f5f5f5',
    '& fieldset': {
      borderColor: '#404040',
    },
    '&:hover fieldset': {
      borderColor: '#737373',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#2563eb',
    },
  },
  '& .MuiInputBase-input::placeholder': {
    color: '#a3a3a3',
    opacity: 1,
  },
  '& .MuiInputAdornment-root .MuiSvgIcon-root': {
    color: '#a3a3a3',
  },
};

const viewerIconButtonSx = {
  border: '1px solid',
  borderColor: '#404040',
  backgroundColor: alpha('#ffffff', 0.03),
  color: '#e5e5e5',
  borderRadius: '4px',
  '&:hover': {
    borderColor: alpha('#60a5fa', 0.7),
    backgroundColor: alpha('#2563eb', 0.16),
    color: '#dbeafe',
  },
};

function normalizeShipName(value?: string | null) {
  return value?.trim().toUpperCase() || '';
}

function hasShipModel(ship?: Ship | null) {
  return Boolean(ship?.ctm?.trim() || ship?.details?.ctm?.trim());
}

function getShipImageUrl(ship?: Ship | null) {
  if (!ship) {
    return '';
  }

  return ship.medias?.productThumbMediumAndSmall?.replace('medium_and_small', 'large')
    || ship.medias?.slideShow
    || '';
}

function getShipDisplayName(ship?: Ship | null, fallbackName?: string | null) {
  return ship?.localizedName || ship?.name || fallbackName || '';
}

function getShipManufacturerName(ship?: Ship | null) {
  return ship?.manufacturer?.name || '';
}

export default function FleetView() {
  const intl = useIntl();
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  const [isViewerDrawerOpen, setIsViewerDrawerOpen] = useState(false);
  const [selectedShipKey, setSelectedShipKey] = useState<string | null>(null);
  const [stagedShipKeys, setStagedShipKeys] = useState<string[]>([]);
  const [isSceneDragOver, setIsSceneDragOver] = useState(false);
  const selectedHangarItems = useSelector(selectUsersHangarItems);
  const selectedUser = useSelector((state: RootState) => state.upgrades.selectedUser);
  const users = useSelector((state: RootState) => state.upgrades.users);
  const { data: shipsResponse, error: shipsError, isLoading: shipsLoading } = useApi<ShipsData>('/api/ships');
  const { data: shipDimensionsResponse } = useApi<ShipDimensionsResponse>('/api/ships/dimensions', {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    dedupingInterval: 60_000,
  });

  const ships = useMemo(() => shipsResponse?.data?.ships || [], [shipsResponse?.data?.ships]);
  const shipDimensionsById = useMemo(
    () => new Map(
      (shipDimensionsResponse?.data?.ships || []).map((ship) => [
        ship.shipId,
        {
          length: ship.length,
          beam: ship.beam,
          height: ship.height,
        },
      ]),
    ),
    [shipDimensionsResponse?.data?.ships],
  );

  const ownedShips = useMemo(() => {
    const shipById = new Map<number, Ship>();
    const shipByName = new Map<string, Ship>();
    const entryMap = new Map<string, MutableFleetShipEntry>();
    let order = 0;

    ships.forEach((ship) => {
      shipById.set(ship.id, ship);
      shipByName.set(normalizeShipName(ship.name), ship);
    });

    const resolveShip = (item: Partial<ShipItem>) => {
      if (typeof item.id === 'number' && shipById.has(item.id)) {
        return shipById.get(item.id);
      }

      if (item.name) {
        return shipByName.get(normalizeShipName(item.name));
      }

      return undefined;
    };

    const ensureEntry = (itemName: string | undefined, catalogShip?: Ship) => {
      const resolvedName = catalogShip?.name || itemName || '';
      if (!resolvedName) {
        return null;
      }

      const key = catalogShip?.id
        ? `ship:${catalogShip.id}`
        : `name:${normalizeShipName(resolvedName)}`;
      const dimensions = catalogShip?.id ? shipDimensionsById.get(catalogShip.id) : null;

      if (!entryMap.has(key)) {
        entryMap.set(key, {
          key,
          shipId: catalogShip?.id ?? null,
          shipName: catalogShip?.name || resolvedName,
          displayName: getShipDisplayName(catalogShip, resolvedName),
          manufacturerName: getShipManufacturerName(catalogShip),
          imageUrl: getShipImageUrl(catalogShip),
          msrpCents: typeof catalogShip?.msrp === 'number' ? catalogShip.msrp : null,
          quantity: 0,
          standaloneQuantity: 0,
          bundleQuantity: 0,
          lengthMeters: dimensions?.length ?? catalogShip?.details?.length ?? null,
          beamMeters: dimensions?.beam ?? catalogShip?.details?.beam ?? null,
          heightMeters: dimensions?.height ?? catalogShip?.details?.height ?? null,
          insuranceLabels: new Set<string>(),
          bundleNames: new Set<string>(),
          firstSeenOrder: order++,
        });
      }

      return entryMap.get(key) || null;
    };

    selectedHangarItems.ships
      .filter((item) => !item.isBuyBack)
      .forEach((item) => {
        const catalogShip = resolveShip(item);
        const entry = ensureEntry(item.name, catalogShip);
        if (!entry) {
          return;
        }

        const quantity = item.quantity || 1;

        entry.quantity += quantity;
        entry.standaloneQuantity += quantity;

        if (item.insurance?.trim()) {
          entry.insuranceLabels.add(item.insurance.trim());
        }
      });

    selectedHangarItems.bundles
      .filter((bundle) => !bundle.isBuyBack)
      .forEach((bundle: BundleItem) => {
        const bundleMultiplier = bundle.quantity || 1;

        (bundle.ships || []).forEach((bundleShip) => {
          const catalogShip = resolveShip(bundleShip);
          const entry = ensureEntry(bundleShip.name, catalogShip);
          if (!entry) {
            return;
          }

          const quantity = (bundleShip.quantity || 1) * bundleMultiplier;

          entry.quantity += quantity;
          entry.bundleQuantity += quantity;

          if (bundle.insurance?.trim()) {
            entry.insuranceLabels.add(bundle.insurance.trim());
          }

          if (bundle.name?.trim()) {
            entry.bundleNames.add(bundle.name.trim());
          }
        });
      });

    return Array.from(entryMap.values())
      .map<FleetShipEntry>((entry) => ({
        key: entry.key,
        shipId: entry.shipId,
        shipName: entry.shipName,
        displayName: entry.displayName,
        manufacturerName: entry.manufacturerName,
        imageUrl: entry.imageUrl || FALLBACK_SHIP_IMAGE,
        msrpCents: entry.msrpCents,
        quantity: entry.quantity,
        standaloneQuantity: entry.standaloneQuantity,
        bundleQuantity: entry.bundleQuantity,
        lengthMeters: entry.lengthMeters,
        beamMeters: entry.beamMeters,
        heightMeters: entry.heightMeters,
        insuranceLabels: Array.from(entry.insuranceLabels),
        bundleNames: Array.from(entry.bundleNames),
        searchIndex: [
          entry.displayName,
          entry.shipName,
          entry.manufacturerName,
          ...Array.from(entry.insuranceLabels),
          ...Array.from(entry.bundleNames),
        ].join(' ').toLowerCase(),
      }))
      .sort((left, right) => {
        if (right.quantity !== left.quantity) {
          return right.quantity - left.quantity;
        }

        const leftMsrp = left.msrpCents || 0;
        const rightMsrp = right.msrpCents || 0;
        if (rightMsrp !== leftMsrp) {
          return rightMsrp - leftMsrp;
        }

        const leftOrder = entryMap.get(left.key)?.firstSeenOrder || 0;
        const rightOrder = entryMap.get(right.key)?.firstSeenOrder || 0;
        return leftOrder - rightOrder;
      });
  }, [selectedHangarItems.bundles, selectedHangarItems.ships, shipDimensionsById, ships]);

  const ownedShipsById = useMemo(
    () => new Map(
      ownedShips
        .filter((ship): ship is FleetShipEntry & { shipId: number } => ship.shipId !== null)
        .map((ship) => [ship.shipId, ship]),
    ),
    [ownedShips],
  );

  const modelPickerShips = useMemo(() => ships
    .filter((ship) => hasShipModel(ship))
    .map<FleetPickerShipEntry>((ship) => {
      const ownedShip = ownedShipsById.get(ship.id);
      const dimensions = shipDimensionsById.get(ship.id);

      return {
        key: `ship:${ship.id}`,
        shipId: ship.id,
        shipName: ship.name,
        displayName: getShipDisplayName(ship, ship.name),
        manufacturerName: getShipManufacturerName(ship),
        imageUrl: getShipImageUrl(ship) || FALLBACK_SHIP_IMAGE,
        msrpCents: typeof ship.msrp === 'number' ? ship.msrp : null,
        quantity: ownedShip?.quantity || 0,
        standaloneQuantity: ownedShip?.standaloneQuantity || 0,
        bundleQuantity: ownedShip?.bundleQuantity || 0,
        lengthMeters: dimensions?.length ?? ship.details?.length ?? null,
        beamMeters: dimensions?.beam ?? ship.details?.beam ?? null,
        heightMeters: dimensions?.height ?? ship.details?.height ?? null,
        insuranceLabels: ownedShip?.insuranceLabels || [],
        bundleNames: ownedShip?.bundleNames || [],
        searchIndex: [
          getShipDisplayName(ship, ship.name),
          ship.name,
          getShipManufacturerName(ship),
          ...(ownedShip?.insuranceLabels || []),
          ...(ownedShip?.bundleNames || []),
        ].join(' ').toLowerCase(),
        isOwned: Boolean(ownedShip),
      };
    })
    .sort((left, right) => {
      if (left.isOwned !== right.isOwned) {
        return left.isOwned ? -1 : 1;
      }

      if (right.quantity !== left.quantity) {
        return right.quantity - left.quantity;
      }

      const leftMsrp = left.msrpCents || 0;
      const rightMsrp = right.msrpCents || 0;
      if (rightMsrp !== leftMsrp) {
        return rightMsrp - leftMsrp;
      }

      return left.displayName.localeCompare(right.displayName, intl.locale, {
        numeric: true,
        sensitivity: 'base',
      });
    }), [intl.locale, ownedShipsById, shipDimensionsById, ships]);

  const normalizedSearch = deferredSearchText.trim().toLowerCase();
  const filteredOwnedShips = useMemo(() => {
    if (!normalizedSearch) {
      return ownedShips;
    }

    return ownedShips.filter((ship) => ship.searchIndex.includes(normalizedSearch));
  }, [normalizedSearch, ownedShips]);

  const filteredPickerShips = useMemo(() => {
    if (!normalizedSearch) {
      return modelPickerShips;
    }

    return modelPickerShips.filter((ship) => ship.searchIndex.includes(normalizedSearch));
  }, [modelPickerShips, normalizedSearch]);

  const pickerShipByKey = useMemo(
    () => new Map(modelPickerShips.map((ship) => [ship.key, ship])),
    [modelPickerShips],
  );

  useEffect(() => {
    setStagedShipKeys((current) => current.filter((shipKey) => pickerShipByKey.has(shipKey)));
  }, [pickerShipByKey]);

  const stagedViewerShips = useMemo(
    () => stagedShipKeys
      .map((shipKey) => pickerShipByKey.get(shipKey))
      .filter((ship): ship is FleetPickerShipEntry => ship !== undefined),
    [pickerShipByKey, stagedShipKeys],
  );

  const stagedShipKeySet = useMemo(() => new Set(stagedShipKeys), [stagedShipKeys]);

  useEffect(() => {
    if (stagedViewerShips.length === 0) {
      if (selectedShipKey !== null) {
        setSelectedShipKey(null);
      }
      return;
    }

    if (!selectedShipKey || !stagedViewerShips.some((ship) => ship.key === selectedShipKey)) {
      setSelectedShipKey(stagedViewerShips[0].key);
    }
  }, [selectedShipKey, stagedViewerShips]);

  const selectedViewerShip = stagedViewerShips.find((ship) => ship.key === selectedShipKey) || null;
  const totalHullCount = useMemo(
    () => ownedShips.reduce((sum, ship) => sum + ship.quantity, 0),
    [ownedShips],
  );
  const totalBundleHullCount = useMemo(
    () => ownedShips.reduce((sum, ship) => sum + ship.bundleQuantity, 0),
    [ownedShips],
  );
  const selectedUserLabel = useMemo(() => {
    if (selectedUser === -1) {
      return intl.formatMessage({ id: 'navigation.hangar.allUsers', defaultMessage: 'All Users' });
    }

    const activeUser = users.find((user) => user.id === selectedUser);
    return activeUser?.nickname
      || activeUser?.username
      || intl.formatMessage({ id: 'navigation.hangar.selectUser', defaultMessage: 'Select User' });
  }, [intl, selectedUser, users]);

  const addShipToScene = (ship: FleetPickerShipEntry) => {
    startTransition(() => {
      setStagedShipKeys((current) => (current.includes(ship.key) ? current : [...current, ship.key]));
    });
  };

  const handlePickerDragStart = (event: React.DragEvent<HTMLDivElement>, ship: FleetPickerShipEntry) => {
    event.dataTransfer.setData(MODEL_PICKER_DRAG_TYPE, ship.key);
    event.dataTransfer.effectAllowed = 'copy';
  };

  const handleSceneDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!isSceneDragOver) {
      setIsSceneDragOver(true);
    }
  };

  const handleSceneDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setIsSceneDragOver(false);
    }
  };

  const handleSceneDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsSceneDragOver(false);

    const shipKey = event.dataTransfer.getData(MODEL_PICKER_DRAG_TYPE);
    const ship = pickerShipByKey.get(shipKey);
    if (!ship) {
      return;
    }

    addShipToScene(ship);
  };

  const renderSourceSummary = (ship: Pick<FleetShipEntry, 'standaloneQuantity' | 'bundleQuantity'>) => {
    const segments: string[] = [];

    if (ship.standaloneQuantity > 0) {
      segments.push(
        intl.formatMessage(
          { id: 'fleetview.source.standalone', defaultMessage: 'Standalone {count}' },
          { count: ship.standaloneQuantity },
        ),
      );
    }

    if (ship.bundleQuantity > 0) {
      segments.push(
        intl.formatMessage(
          { id: 'fleetview.source.bundle', defaultMessage: 'Bundle {count}' },
          { count: ship.bundleQuantity },
        ),
      );
    }

    return segments.join(' · ');
  };

  const renderInsuranceBadges = (ship: FleetShipEntry) => {
    const visibleLabels = ship.insuranceLabels.filter(Boolean).slice(0, 3);

    if (visibleLabels.length === 0) {
      return (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          -
        </span>
      );
    }

    return (
      <>
        {visibleLabels.map((label) => (
          <span
            key={label}
            className="rounded-sm border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200"
          >
            {label}
          </span>
        ))}
        {ship.insuranceLabels.length > visibleLabels.length && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            +{ship.insuranceLabels.length - visibleLabels.length}
          </span>
        )}
      </>
    );
  };

  return (
    <div className="absolute inset-x-0 bottom-0 top-[65px] overflow-hidden bg-gray-50 dark:bg-[#121212]">
      <div className="flex h-full flex-col gap-4 p-4 text-left">
        <section className="mx-auto w-full max-w-[1800px] rounded-none border border-gray-200 bg-white p-4 dark:border-neutral-700 dark:bg-[#121212]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2 mt-2">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                  <FormattedMessage id="fleetview.title" defaultMessage="Fleet View" />
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  <FormattedMessage
                    id="fleetview.subtitle"
                    defaultMessage="Browse the ships in your current hangar scope, then open the 3D viewer to stage only the catalog ships you want to inspect."
                  />
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-none border border-gray-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    <FormattedMessage id="fleetview.stat.uniqueShips" defaultMessage="{count} unique ships" values={{ count: ownedShips.length }} />
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{ownedShips.length}</div>
                </div>
                <div className="rounded-none border border-gray-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    <FormattedMessage id="fleetview.stat.totalHulls" defaultMessage="{count} hulls tracked" values={{ count: totalHullCount }} />
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{totalHullCount}</div>
                </div>
                <div className="rounded-none border border-gray-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    <FormattedMessage id="fleetview.stat.bundleHulls" defaultMessage="{count} ships from bundles" values={{ count: totalBundleHullCount }} />
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{totalBundleHullCount}</div>
                </div>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 xl:max-w-[560px]">
              <TextField
                fullWidth
                size="small"
                variant="outlined"
                sx={fleetTextFieldSx}
                placeholder={intl.formatMessage({ id: 'fleetview.searchPlaceholder', defaultMessage: 'Search ships, manufacturers, insurance, or bundle names' })}
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRoundedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => setIsViewerDrawerOpen(true)}
                  disableElevation
                  variant="outlined"
                  startIcon={<ViewInArRoundedIcon fontSize="small" />}
                  disabled={modelPickerShips.length === 0}
                >
                  <FormattedMessage id="fleetview.viewer.openDrawer" defaultMessage="Open 3D Viewer" />
                </Button>

                <Crawler ships={ships} />
              </div>

              <div className="w-full border border-gray-200 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900">
                {/* <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                  <FormattedMessage id="fleetview.userScopeTitle" defaultMessage="User Scope" />
                </div> */}
                <UserSelector variant="embedded" align="start" preserveSpace minHeight={52} />
              </div>
            </div>
          </div>

          {shipsError && (
            <div className="mt-4 rounded-none border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200">
              <FormattedMessage
                id="fleetview.catalogWarning"
                defaultMessage="Ship catalog data is temporarily unavailable. Fleet entries are still shown from your local hangar data, but some images and 3D matches may be missing."
              />
            </div>
          )}
        </section>

        {ownedShips.length === 0 ? (
          <section className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 items-center justify-center rounded-none border border-dashed border-gray-300 bg-white p-8 dark:border-neutral-700 dark:bg-neutral-900">
            <div className="max-w-xl text-center">
              {shipsLoading ? (
                <div className="mb-4 flex justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500 dark:border-neutral-700 dark:border-t-blue-400" />
                </div>
              ) : null}
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                <FormattedMessage id="fleetview.empty.title" defaultMessage="No owned ships in the current scope" />
              </h2>
              <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
                <FormattedMessage
                  id="fleetview.empty.description"
                  defaultMessage="Sync your RSI hangar first, or change the selected user scope above. List View only shows ships in hangar, but the 3D viewer can still open the full model picker."
                />
              </p>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                <FormattedMessage id="fleetview.empty.hint" defaultMessage="Tip: bundle-contained ships will be merged into this list automatically." />
              </p>
            </div>
          </section>
        ) : (
          <section className="mx-auto min-h-0 w-full max-w-[1800px] flex-1 overflow-y-auto rounded-none border border-gray-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
            {filteredOwnedShips.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-none border border-dashed border-gray-300 dark:border-neutral-700">
                <div className="text-center">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    <FormattedMessage id="fleetview.searchEmpty.title" defaultMessage="No ships match this search" />
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    <FormattedMessage id="fleetview.searchEmpty.description" defaultMessage="Try a different ship name, manufacturer, insurance tag, or bundle name." />
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                {filteredOwnedShips.map((ship) => {
                  const isStaged = stagedShipKeySet.has(ship.key);

                  return (
                    <div
                      key={ship.key}
                      // onClick={() => {
                      //   setIsViewerDrawerOpen(true);
                      //   if (isStaged) {
                      //     setSelectedShipKey(ship.key);
                      //   }
                      // }}
                      className={`overflow-hidden rounded-none border text-left transition-colors ${isStaged
                        ? 'border-blue-400 dark:border-neutral-600'
                        : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-500'
                      }`}
                    >
                      <div className="relative aspect-[16/8.6] overflow-hidden bg-gray-200 dark:bg-[#1b1b1b]">
                        <img
                          src={ship.imageUrl}
                          alt={ship.displayName}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                          {ship.bundleQuantity > 0 && (
                            <span className="rounded-sm border border-blue-200/70 bg-blue-50/90 px-2 py-1 text-[11px] text-blue-900 backdrop-blur-sm dark:border-neutral-600 dark:bg-neutral-900/85 dark:text-gray-100">
                              <FormattedMessage id="fleetview.source.bundleShort" defaultMessage="Bundle" />
                            </span>
                          )}
                          {ship.standaloneQuantity > 0 && (
                            <span className="rounded-sm border border-white/50 bg-white/90 px-2 py-1 text-[11px] text-gray-900 backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/85 dark:text-gray-100">
                              <FormattedMessage id="fleetview.source.standaloneShort" defaultMessage="Hangar" />
                            </span>
                          )}
                        </div>

                        <div className="absolute right-3 top-3 rounded-sm border border-neutral-700/70 bg-neutral-950/70 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                          <FormattedMessage id="fleetview.card.quantity" defaultMessage="x{count}" values={{ count: ship.quantity }} />
                        </div>

                        <div className="absolute inset-x-3 bottom-3">
                          <div className="text-xl font-semibold text-white">{ship.displayName}</div>
                          <div className="mt-1 text-sm text-white/75">
                            {ship.manufacturerName || <FormattedMessage id="fleetview.card.unknownManufacturer" defaultMessage="Unknown manufacturer" />}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 bg-white p-4 dark:bg-neutral-900">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-gray-500 dark:text-gray-400">
                            <FormattedMessage id="fleetview.card.msrp" defaultMessage="MSRP" />
                          </span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {ship.msrpCents !== null
                              ? formatUsdPrice(intl.locale, ship.msrpCents / 100)
                              : '-'}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-3 text-sm">
                          <span className="pt-1 text-gray-500 dark:text-gray-400">
                            <FormattedMessage id="fleetview.card.insurance" defaultMessage="Insurance" />
                          </span>
                          <div className="flex flex-wrap justify-end gap-2">
                            {renderInsuranceBadges(ship)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      <Drawer
        anchor="bottom"
        open={isViewerDrawerOpen}
        onClose={() => {
          setIsViewerDrawerOpen(false);
          setIsSceneDragOver(false);
        }}
        ModalProps={{ keepMounted: true }}
        slotProps={{
          paper: {
            sx: {
              height: '100vh',
              backgroundColor: '#121212',
              color: '#f5f5f5',
              backgroundImage: 'none',
              overflow: 'hidden',
            },
          },
        }}
      >
        <div className="flex h-full min-h-0 flex-col bg-[#121212] text-gray-100">
          <div className="border-b border-neutral-700 px-4 py-3">
            <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-neutral-700 lg:hidden" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                  <FormattedMessage id="fleetview.mode.viewer" defaultMessage="3D View" />
                </div>
                <div className="mt-1 text-lg font-semibold text-gray-100">
                  <FormattedMessage id="fleetview.viewer.title" defaultMessage="Fleet Overview" />
                </div>
              </div>

              <IconButton
                onClick={() => {
                  setIsViewerDrawerOpen(false);
                  setIsSceneDragOver(false);
                }}
                size="small"
                sx={viewerIconButtonSx}
                aria-label={intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}
              >
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </div>
          </div>

          {modelPickerShips.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center p-8">
              <div className="max-w-xl text-center">
                <h2 className="text-2xl font-semibold text-gray-100">
                  <FormattedMessage id="fleetview.viewer.emptyTitle" defaultMessage="No 3D models available in this filter" />
                </h2>
                <p className="mt-3 text-sm leading-7 text-gray-400">
                  <FormattedMessage
                    id="fleetview.viewer.emptyDescription"
                    defaultMessage="The current filtered fleet entries cannot be matched to ship catalog models yet, so the shared 3D viewer cannot be staged."
                  />
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <aside className="flex w-full shrink-0 flex-col border-b border-neutral-700 bg-neutral-900 lg:w-[360px] lg:border-b-0 lg:border-r">
                <div className="border-b border-neutral-700 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400 mb-4">
                    <FormattedMessage id="fleetview.viewer.pickerTitle" defaultMessage="Model Picker" />
                  </div>
                  {/* <p className="mt-2 text-sm leading-6 text-gray-400">
                    <FormattedMessage
                      id="fleetview.viewer.pickerDescription"
                      defaultMessage="Drag ships into the scene to load them. Ships from the current hangar scope are listed first."
                    />
                  </p> */}

                  <TextField
                    fullWidth
                    size="small"
                    variant="outlined"
                    className="mt-4"
                    sx={viewerTextFieldSx}
                    placeholder={intl.formatMessage({
                      id: 'fleetview.viewer.pickerSearchPlaceholder',
                      defaultMessage: 'Search 3D-capable ships',
                    })}
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchRoundedIcon fontSize="small" />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />

                  {/* <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-200">
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700 dark:border-neutral-700 dark:bg-[#121212] dark:text-gray-200">
                      <FormattedMessage
                        id="fleetview.viewer.pickerOwnedCount"
                        defaultMessage="{count} in hangar"
                        values={{ count: ownedModelCount }}
                      />
                    </span>
                    <span className="rounded-full border border-neutral-700 bg-[#121212] px-3 py-1 text-gray-200">
                      <FormattedMessage
                        id="fleetview.viewer.pickerCatalogCount"
                        defaultMessage="{count} ships with 3D models"
                        values={{ count: modelPickerShips.length }}
                      />
                    </span>
                  </div> */}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {filteredPickerShips.length === 0 ? (
                    <div className="rounded-none border border-dashed border-neutral-700 bg-[#121212] p-5 text-center">
                      <div className="text-base font-semibold text-gray-100">
                        <FormattedMessage id="fleetview.viewer.pickerEmptyTitle" defaultMessage="No ships match this picker search" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-gray-400">
                        <FormattedMessage
                          id="fleetview.viewer.pickerEmptyDescription"
                          defaultMessage="Try a different ship name or manufacturer. The picker includes every ship with a published 3D model."
                        />
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredPickerShips.map((ship) => {
                        const isStaged = stagedShipKeySet.has(ship.key);

                        return (
                          <div
                            key={ship.key}
                            draggable
                            onDragStart={(event) => handlePickerDragStart(event, ship)}
                            className={`cursor-grab rounded-none border p-3 transition ${isStaged
                              ? 'border-blue-400/60 bg-blue-50/80 dark:border-neutral-600 dark:bg-[#121212]'
                              : ship.isOwned
                                ? 'border-neutral-700 bg-[#121212] hover:border-neutral-500'
                                : 'border-neutral-700 bg-neutral-900 hover:border-neutral-500'
                            }`}
                          >
                            <div className="flex gap-3">
                              <img
                                src={ship.imageUrl}
                                alt={ship.displayName}
                                className="h-20 w-28 shrink-0 rounded-[2px] object-cover"
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-gray-100">
                                      {ship.displayName}
                                    </div>
                                    <div className="mt-1 truncate text-xs text-gray-400">
                                      {ship.manufacturerName || <FormattedMessage id="fleetview.card.unknownManufacturer" defaultMessage="Unknown manufacturer" />}
                                    </div>
                                  </div>

                                  {ship.isOwned && (
                                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200">
                                      <FormattedMessage id="fleetview.card.quantity" defaultMessage="x{count}" values={{ count: ship.quantity }} />
                                    </span>
                                  )}
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-200">
                                  <span className={`rounded-full px-2 py-0.5 ${ship.isOwned
                                    ? 'border border-blue-200 bg-blue-50 text-blue-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200'
                                    : 'border border-neutral-700 bg-[#121212] text-gray-200'
                                  }`}
                                  >
                                    {ship.isOwned
                                      ? (renderSourceSummary(ship) || intl.formatMessage({
                                        id: 'fleetview.viewer.catalogOnly',
                                        defaultMessage: 'Catalog only',
                                      }))
                                      : intl.formatMessage({
                                        id: 'fleetview.viewer.catalogOnly',
                                        defaultMessage: 'Catalog only',
                                      })}
                                  </span>
                                  {ship.msrpCents !== null && (
                                    <span className="rounded-full border border-neutral-700 bg-[#121212] px-2 py-0.5 text-gray-200">
                                      {formatUsdPrice(intl.locale, ship.msrpCents / 100)}
                                    </span>
                                  )}
                                </div>

                                {/* <div className="mt-3 flex items-center justify-between gap-3">
                                  <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500">
                                    <FormattedMessage id="fleetview.viewer.dragToStage" defaultMessage="Drag to stage" />
                                  </div>

                                  <Button
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (!isStaged) {
                                        addShipToScene(ship);
                                        return;
                                      }

                                      setSelectedShipKey(ship.key);
                                    }}
                                    disableElevation
                                    variant={isStaged ? 'outlined' : 'contained'}
                                    size="small"
                                    sx={isStaged ? viewerOutlinedButtonSx : viewerContainedButtonSx}
                                  >
                                    {isStaged ? (
                                      <FormattedMessage id="fleetview.viewer.addedToScene" defaultMessage="In scene" />
                                    ) : (
                                      <FormattedMessage id="fleetview.viewer.addToScene" defaultMessage="Add" />
                                    )}
                                  </Button>
                                </div> */}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </aside>

              <div className="flex min-h-0 flex-1 flex-col">
                <div
                  className={`relative min-h-0 flex-1 overflow-hidden ${isSceneDragOver ? 'ring-2 ring-inset ring-blue-400/80' : ''}`}
                  onDragOver={handleSceneDragOver}
                  onDragLeave={handleSceneDragLeave}
                  onDrop={handleSceneDrop}
                >
                  <FleetModelViewer
                    open={isViewerDrawerOpen}
                    ships={stagedViewerShips}
                    selectedShipKey={selectedViewerShip?.key ?? null}
                  />

                  <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2 text-xs text-gray-100">
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700 dark:border-neutral-700 dark:bg-neutral-900/85 dark:text-gray-100">
                      <FormattedMessage
                        id="fleetview.viewer.stagedCount"
                        defaultMessage="{count} ships staged"
                        values={{ count: stagedViewerShips.length }}
                      />
                    </span>
                    <span className="rounded-full border border-neutral-700 bg-neutral-900/85 px-3 py-1 text-gray-100">
                      <FormattedMessage
                        id="fleetview.scope"
                        defaultMessage="Current scope: {scope}"
                        values={{ scope: selectedUserLabel }}
                      />
                    </span>
                  </div>

                  {selectedViewerShip && (
                    <div className="pointer-events-none absolute right-4 top-4 hidden max-w-sm rounded-none border border-neutral-700 bg-neutral-900/85 p-4 text-gray-100 shadow-2xl shadow-black/30 backdrop-blur-md xl:block">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                        <FormattedMessage id="fleetview.viewer.shipLabel" defaultMessage="Selected Entry" />
                      </div>
                      <div className="mt-2 text-lg font-semibold text-gray-100">
                        {selectedViewerShip.displayName}
                      </div>
                      <div className="mt-1 text-sm text-gray-300">
                        {selectedViewerShip.manufacturerName || <FormattedMessage id="fleetview.card.unknownManufacturer" defaultMessage="Unknown manufacturer" />}
                      </div>
                      <div className="mt-3 text-xs text-gray-400">
                        {renderSourceSummary(selectedViewerShip) || intl.formatMessage({
                          id: 'fleetview.viewer.catalogOnly',
                          defaultMessage: 'Catalog only',
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* <div className="border-t border-neutral-700 bg-neutral-900 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-300">
                      <FormattedMessage id="fleetview.viewer.stagedTitle" defaultMessage="Staged Ships" />
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="hidden text-xs text-gray-400 md:block">
                        <FormattedMessage
                          id="fleetview.viewer.sceneHint"
                          defaultMessage="Drag to orbit · Scroll to zoom · Shift-drag or right-drag to pan"
                        />
                      </div>
                      <Button
                        onClick={clearScene}
                        disabled={stagedViewerShips.length === 0}
                        variant="outlined"
                        size="small"
                        sx={viewerOutlinedButtonSx}
                      >
                        <FormattedMessage id="fleetview.viewer.clearScene" defaultMessage="Clear scene" />
                      </Button>
                    </div>
                  </div>

                  {stagedViewerShips.length === 0 ? (
                    <div className="rounded-none border border-dashed border-neutral-700 bg-[#121212] p-5 text-center">
                      <div className="text-sm font-semibold text-gray-100">
                        <FormattedMessage id="fleetview.viewer.stagedEmptyTitle" defaultMessage="No ships staged yet" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-gray-400">
                        <FormattedMessage
                          id="fleetview.viewer.stagedEmptyDescription"
                          defaultMessage="Drag from the picker above to start loading ships into the shared 3D scene."
                        />
                      </p>
                    </div>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {stagedViewerShips.map((ship) => (
                        <div
                          key={ship.key}
                          onClick={() => setSelectedShipKey(ship.key)}
                          className={`min-w-[220px] max-w-[240px] shrink-0 overflow-hidden rounded-none border text-left transition-colors ${selectedShipKey === ship.key
                            ? 'border-blue-400 bg-[#121212]'
                            : 'border-neutral-700 bg-neutral-900 hover:border-neutral-500'
                          }`}
                        >
                          <div className="relative">
                            <img
                              src={ship.imageUrl}
                              alt={ship.displayName}
                              className="h-24 w-full object-cover"
                            />
                            <IconButton
                              onClick={(event) => {
                                event.stopPropagation();
                                removeShipFromScene(ship.key);
                              }}
                              size="small"
                              sx={{
                                ...viewerIconButtonSx,
                                position: 'absolute',
                                right: 8,
                                top: 8,
                              }}
                              aria-label={intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}
                            >
                              <CloseRoundedIcon fontSize="small" />
                            </IconButton>
                          </div>

                          <div className="p-3">
                            <div className="truncate text-sm font-semibold text-gray-100">
                              {ship.displayName}
                            </div>
                            <div className="mt-1 truncate text-xs text-gray-400">
                              {ship.manufacturerName || <FormattedMessage id="fleetview.card.unknownManufacturer" defaultMessage="Unknown manufacturer" />}
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-300">
                              <span className="truncate">
                                {renderSourceSummary(ship) || intl.formatMessage({
                                  id: 'fleetview.viewer.catalogOnly',
                                  defaultMessage: 'Catalog only',
                                })}
                              </span>
                              <span className="rounded-full border border-neutral-700 bg-[#121212] px-2 py-0.5 text-[11px] text-white">
                                {ship.quantity > 0 ? ship.quantity : '1'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div> */}
              </div>
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}
