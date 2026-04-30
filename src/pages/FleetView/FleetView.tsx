import { type KeyboardEvent, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Drawer, IconButton, InputAdornment, TextField, useMediaQuery } from '@mui/material';
import { Theme, alpha, useTheme } from '@mui/material/styles';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ViewInArRoundedIcon from '@mui/icons-material/ViewInArRounded';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';

import Crawler from '@/components/Crawler';
import { useApi } from '@/hooks/swr/useApi';
import { getRsiIconPath } from '@/data/rsiIcons';
import ShipInfoContent from '@/components/ShipInfoContent';
import FleetModelViewer from '@/pages/FleetView/FleetModelViewer';
import type {
  FleetModelViewerRotationState,
  FleetModelViewerTransformMode,
  FleetModelViewerTransformState,
} from '@/pages/FleetView/FleetModelViewer';
import { formatUsdPrice } from '@/pages/Market/marketI18n';
import { BiSlots, reportBi } from '@/report';
import RsiIcon from '@/components/RsiIcon';
import type { RootState } from '@/store';
import { BundleItem, ShipItem, selectUsersHangarItems } from '@/store/upgradesStore';
import type { Ship, ShipDimensionsResponse, ShipsData } from '@/types';
import { getShipThumbLarge } from '@/utils/shipImage';

interface FleetShipSourceEntry {
  key: string;
  kind: 'standalone' | 'bundle';
  label: string;
  ownerId: number | null;
  ownerName: string;
  quantity: number;
  insuranceLabel: string;
  pageId: number | null;
  hangarUrl: string | null;
}

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
  sources: FleetShipSourceEntry[];
  searchIndex: string;
}

interface FleetPickerShipEntry extends Omit<FleetShipEntry, 'shipId'> {
  shipId: number;
  isOwned: boolean;
}

interface FleetStagedShipEntry extends FleetPickerShipEntry {
  sourceShipKey: string;
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
  sourceEntries: Map<string, FleetShipSourceEntry>;
  firstSeenOrder: number;
}

const FALLBACK_SHIP_IMAGE = '/rsi-icons/shipEmpty.svg';
const MODEL_PICKER_DRAG_TYPE = 'application/citizenshub-fleet-ship-key';
const FLEET_VIEW_SCENE_STORAGE_KEY = 'fleetViewSceneState';
const FLEET_VIEW_SCENE_STORAGE_VERSION = 2;
const FLEET_VIEW_SHIP_INSTANCE_KEY_DELIMITER = '::instance:';

interface FleetViewSceneState {
  version: number;
  stagedShipKeys: string[];
  selectedShipKey: string | null;
  viewerTransformMode: FleetModelViewerTransformMode | null;
  shipTransforms: Record<string, FleetModelViewerTransformState>;
}

function getDefaultFleetViewSceneState(): FleetViewSceneState {
  return {
    version: FLEET_VIEW_SCENE_STORAGE_VERSION,
    stagedShipKeys: [],
    selectedShipKey: null,
    viewerTransformMode: null,
    shipTransforms: {},
  };
}

function getRsiHangarDetailUrl(pageId?: number | null, isBuyBack = false) {
  if (!pageId) {
    return null;
  }

  if (isBuyBack) {
    return `https://robertsspaceindustries.com/en/account/buy-back-pledges?page=${pageId}&pagesize=1`;
  }

  return `https://robertsspaceindustries.com/en/account/pledges?page=${Math.ceil(pageId / 10)}`;
}

function toAbsoluteRsiUrl(url?: string | null) {
  if (!url) {
    return '';
  }

  return url.startsWith('http') ? url : `https://robertsspaceindustries.com${url}`;
}

function createFallbackShipFromFleetEntry(ship: FleetShipEntry): Ship {
  const imageUrl = ship.imageUrl === FALLBACK_SHIP_IMAGE ? '' : ship.imageUrl;

  return {
    id: ship.shipId ?? 0,
    name: ship.shipName || ship.displayName || '-',
    localizedName: ship.displayName || ship.shipName || '',
    medias: {
      productThumbMediumAndSmall: imageUrl,
      slideShow: imageUrl,
    },
    imageUrls: {
      thumbSmall: imageUrl,
      thumbLarge: imageUrl,
      slideshow: imageUrl,
    },
    manufacturer: {
      id: 0,
      name: ship.manufacturerName || '',
    },
    focus: '',
    type: '',
    flyableStatus: '',
    owned: true,
    msrp: ship.msrpCents ?? 0,
    link: '',
    skus: null,
    details: {
      length: ship.lengthMeters,
      beam: ship.beamMeters,
      height: ship.heightMeters,
    },
  };
}

function getFleetViewShipInstanceSourceKey(instanceKey: string) {
  const delimiterIndex = instanceKey.indexOf(FLEET_VIEW_SHIP_INSTANCE_KEY_DELIMITER);
  if (delimiterIndex === -1) {
    return instanceKey;
  }

  return instanceKey.slice(0, delimiterIndex);
}

function createFleetViewShipInstanceKey(shipKey: string) {
  const instanceSuffix = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return `${shipKey}${FLEET_VIEW_SHIP_INSTANCE_KEY_DELIMITER}${instanceSuffix}`;
}

function createLegacyFleetViewShipInstanceKey(shipKey: string, index: number) {
  return `${shipKey}${FLEET_VIEW_SHIP_INSTANCE_KEY_DELIMITER}legacy-${index}`;
}

function migrateFleetViewSceneStateV1(parsed: Partial<FleetViewSceneState>): FleetViewSceneState {
  const legacyShipKeys = Array.isArray(parsed.stagedShipKeys)
    ? parsed.stagedShipKeys.filter((value): value is string => typeof value === 'string')
    : [];
  const migratedShipTransforms: Record<string, FleetModelViewerTransformState> = {};
  const migratedShipKeys = legacyShipKeys.map((shipKey, index) => {
    const instanceKey = createLegacyFleetViewShipInstanceKey(shipKey, index + 1);
    const legacyTransform = parsed.shipTransforms?.[shipKey];
    if (legacyTransform) {
      migratedShipTransforms[instanceKey] = legacyTransform;
    }
    return instanceKey;
  });
  const selectedShipIndex = legacyShipKeys.findIndex((shipKey) => shipKey === parsed.selectedShipKey);

  return {
    version: FLEET_VIEW_SCENE_STORAGE_VERSION,
    stagedShipKeys: migratedShipKeys,
    selectedShipKey: selectedShipIndex >= 0 ? migratedShipKeys[selectedShipIndex] : null,
    viewerTransformMode: null,
    shipTransforms: migratedShipTransforms,
  };
}

function loadFleetViewSceneState(): FleetViewSceneState {
  if (typeof window === 'undefined') {
    return getDefaultFleetViewSceneState();
  }

  try {
    const raw = window.localStorage.getItem(FLEET_VIEW_SCENE_STORAGE_KEY);
    if (!raw) {
      return getDefaultFleetViewSceneState();
    }

    const parsed = JSON.parse(raw) as Partial<FleetViewSceneState>;
    if (parsed.version === 1) {
      return migrateFleetViewSceneStateV1(parsed);
    }

    if (parsed.version !== FLEET_VIEW_SCENE_STORAGE_VERSION) {
      return getDefaultFleetViewSceneState();
    }

    return {
      version: FLEET_VIEW_SCENE_STORAGE_VERSION,
      stagedShipKeys: Array.isArray(parsed.stagedShipKeys)
        ? parsed.stagedShipKeys.filter((value): value is string => typeof value === 'string')
        : [],
      selectedShipKey: typeof parsed.selectedShipKey === 'string' ? parsed.selectedShipKey : null,
      viewerTransformMode: parsed.viewerTransformMode === 'translate' || parsed.viewerTransformMode === 'rotate'
        ? parsed.viewerTransformMode
        : null,
      shipTransforms: parsed.shipTransforms && typeof parsed.shipTransforms === 'object'
        ? parsed.shipTransforms
        : {},
    };
  } catch (error) {
    console.error('Failed to load fleet view scene state', error);
    return getDefaultFleetViewSceneState();
  }
}

function saveFleetViewSceneState(state: FleetViewSceneState) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(FLEET_VIEW_SCENE_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save fleet view scene state', error);
  }
}

const fleetTextFieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    backgroundColor: (theme: Theme) => (theme.palette.mode === 'dark' ? '#121212' : alpha('#ffffff', 0.78)),
    color: (theme: Theme) => (theme.palette.mode === 'dark' ? '#f5f5f5' : '#18181b'),
    // boxShadow: (theme: Theme) => (theme.palette.mode === 'dark' ? 'none' : '0 12px 36px rgba(148, 163, 184, 0.12)'),
    backdropFilter: 'blur(16px)',
    '& fieldset': {
      borderColor: (theme: Theme) => (theme.palette.mode === 'dark' ? '#404040' : alpha('#94a3b8', 0.34)),
    },
    '&:hover fieldset': {
      borderColor: (theme: Theme) => (theme.palette.mode === 'dark' ? '#737373' : alpha('#64748b', 0.56)),
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

const viewerIconButtonSx = {
  border: '1px solid',
  borderColor: (theme: Theme) => (theme.palette.mode === 'dark' ? alpha('#ffffff', 0.12) : alpha('#0f172a', 0.12)),
  backgroundColor: (theme: Theme) => (theme.palette.mode === 'dark' ? alpha('#ffffff', 0.03) : alpha('#ffffff', 0.78)),
  color: (theme: Theme) => (theme.palette.mode === 'dark' ? '#e5e5e5' : '#0f172a'),
  borderRadius: '999px',
  // boxShadow: (theme: Theme) => (theme.palette.mode === 'dark' ? 'none' : '0 14px 36px rgba(148, 163, 184, 0.22)'),
  backdropFilter: 'blur(16px)',
  '&:hover': {
    borderColor: (theme: Theme) => (theme.palette.mode === 'dark' ? alpha('#60a5fa', 0.7) : alpha('#2563eb', 0.3)),
    backgroundColor: (theme: Theme) => (theme.palette.mode === 'dark' ? alpha('#2563eb', 0.16) : alpha('#dbeafe', 0.92)),
    color: (theme: Theme) => (theme.palette.mode === 'dark' ? '#dbeafe' : '#1d4ed8'),
  },
};

function viewerTransformButtonSx(active: boolean) {
  return {
    borderRadius: '999px',
    px: 1.5,
    minHeight: 34,
    minWidth: 0,
    textTransform: 'none',
    fontWeight: 600,
    border: '1px solid',
    borderColor: (theme: Theme) => {
      if (theme.palette.mode === 'dark') {
        return active ? alpha('#7dd3fc', 0.36) : alpha('#ffffff', 0.1);
      }

      return active ? alpha('#2563eb', 0.22) : alpha('#0f172a', 0.08);
    },
    backgroundColor: (theme: Theme) => {
      if (theme.palette.mode === 'dark') {
        return active ? alpha('#38bdf8', 0.12) : alpha('#ffffff', 0.02);
      }

      return active ? alpha('#dbeafe', 0.82) : alpha('#ffffff', 0.72);
    },
    color: (theme: Theme) => {
      if (theme.palette.mode === 'dark') {
        return active ? '#e0f2fe' : '#e5e7eb';
      }

      return active ? '#1d4ed8' : '#334155';
    },
    // boxShadow: (theme: Theme) => (theme.palette.mode === 'dark' ? 'none' : '0 10px 24px rgba(148, 163, 184, 0.16)'),
    backdropFilter: 'blur(14px)',
    '&:hover': {
      borderColor: (theme: Theme) => (theme.palette.mode === 'dark' ? alpha('#7dd3fc', 0.52) : alpha('#2563eb', 0.3)),
      backgroundColor: (theme: Theme) => (theme.palette.mode === 'dark' ? alpha('#38bdf8', 0.16) : alpha('#eff6ff', 0.94)),
    },
  };
}

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

  return getShipThumbLarge(ship);
}

function getShipDisplayName(ship?: Ship | null, fallbackName?: string | null) {
  return ship?.localizedName || ship?.name || fallbackName || '';
}

function getShipManufacturerName(ship?: Ship | null) {
  return ship?.manufacturer?.name || '';
}

export default function FleetView() {
  const intl = useIntl();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const isMobileDialog = useMediaQuery('(max-width: 644px)');
  const initialSceneState = useMemo(() => loadFleetViewSceneState(), []);
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  const [isViewerDrawerOpen, setIsViewerDrawerOpen] = useState(false);
  const [selectedShipDetailKey, setSelectedShipDetailKey] = useState<string | null>(null);
  const [selectedShipKey, setSelectedShipKey] = useState<string | null>(initialSceneState.selectedShipKey);
  const [viewerTransformMode, setViewerTransformMode] = useState<FleetModelViewerTransformMode | null>(null);
  const [selectedShipRotation, setSelectedShipRotation] = useState<FleetModelViewerRotationState | null>(null);
  const [stagedShipKeys, setStagedShipKeys] = useState<string[]>(initialSceneState.stagedShipKeys);
  const [isSceneDragOver, setIsSceneDragOver] = useState(false);
  const savedShipTransformsRef = useRef<Record<string, FleetModelViewerTransformState>>(initialSceneState.shipTransforms);
  const selectedShipKeyRef = useRef<string | null>(initialSceneState.selectedShipKey);
  const stagedShipKeysRef = useRef<string[]>(initialSceneState.stagedShipKeys);
  const selectedHangarItems = useSelector(selectUsersHangarItems);
  const users = useSelector((state: RootState) => state.upgrades.users);
  // const selectedUser = useSelector((state: RootState) => state.upgrades.selectedUser);
  // const users = useSelector((state: RootState) => state.upgrades.users);
  const { data: shipsResponse, error: shipsError, isLoading: shipsLoading } = useApi<ShipsData>('/api/ships');
  const { data: shipDimensionsResponse } = useApi<ShipDimensionsResponse>('/api/ships/dimensions', {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    dedupingInterval: 60_000,
  });

  const ships = useMemo(() => shipsResponse?.data?.ships || [], [shipsResponse?.data?.ships]);
  const catalogShipById = useMemo(
    () => new Map(ships.map((ship) => [ship.id, ship])),
    [ships],
  );
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
    const ownerNameById = new Map(users.map((user) => [user.id, user.nickname || user.username]));
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
          sourceEntries: new Map<string, FleetShipSourceEntry>(),
          firstSeenOrder: order++,
        });
      }

      return entryMap.get(key) || null;
    };

    const addSourceEntry = (
      entry: MutableFleetShipEntry,
      source: Omit<FleetShipSourceEntry, 'key'>,
    ) => {
      const normalizedLabel = source.label.trim().toLowerCase();
      const normalizedInsurance = source.insuranceLabel.trim().toLowerCase();
      const sourceKey = [
        source.kind,
        source.ownerId ?? 'unknown',
        source.pageId ?? 'na',
        normalizedLabel,
        normalizedInsurance,
      ].join('|');

      const existing = entry.sourceEntries.get(sourceKey);
      if (existing) {
        existing.quantity += source.quantity;
        return;
      }

      entry.sourceEntries.set(sourceKey, {
        ...source,
        key: sourceKey,
      });
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

        addSourceEntry(entry, {
          kind: 'standalone',
          label: item.name?.trim() || entry.displayName,
          ownerId: item.belongsTo ?? null,
          ownerName: ownerNameById.get(item.belongsTo) || '',
          quantity,
          insuranceLabel: item.insurance?.trim() || '',
          pageId: item.pageId ?? null,
          hangarUrl: getRsiHangarDetailUrl(item.pageId ?? null),
        });
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

          addSourceEntry(entry, {
            kind: 'bundle',
            label: bundle.name?.trim() || intl.formatMessage({
              id: 'fleetview.source.unknownBundle',
              defaultMessage: 'Unknown bundle',
            }),
            ownerId: bundle.belongsTo ?? null,
            ownerName: ownerNameById.get(bundle.belongsTo) || '',
            quantity,
            insuranceLabel: bundle.insurance?.trim() || '',
            pageId: bundle.pageId ?? null,
            hangarUrl: getRsiHangarDetailUrl(bundle.pageId ?? null),
          });
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
        sources: Array.from(entry.sourceEntries.values()).sort((left, right) => {
          if (right.quantity !== left.quantity) {
            return right.quantity - left.quantity;
          }

          if (left.kind !== right.kind) {
            return left.kind === 'standalone' ? -1 : 1;
          }

          return left.label.localeCompare(right.label, intl.locale, {
            numeric: true,
            sensitivity: 'base',
          });
        }),
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
  }, [intl, selectedHangarItems.bundles, selectedHangarItems.ships, shipDimensionsById, ships, users]);

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
        sources: ownedShip?.sources || [],
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

  const selectedDetailShip = useMemo(
    () => ownedShips.find((ship) => ship.key === selectedShipDetailKey) || null,
    [ownedShips, selectedShipDetailKey],
  );
  const selectedDetailShipInfo = useMemo(() => {
    if (!selectedDetailShip) {
      return null;
    }

    if (selectedDetailShip.shipId !== null) {
      return catalogShipById.get(selectedDetailShip.shipId) || createFallbackShipFromFleetEntry(selectedDetailShip);
    }

    return createFallbackShipFromFleetEntry(selectedDetailShip);
  }, [catalogShipById, selectedDetailShip]);
  const selectedDetailShipExternalUrl = useMemo(
    () => toAbsoluteRsiUrl(selectedDetailShipInfo?.details?.url || selectedDetailShipInfo?.link),
    [selectedDetailShipInfo],
  );

  const pickerShipByKey = useMemo(
    () => new Map(modelPickerShips.map((ship) => [ship.key, ship])),
    [modelPickerShips],
  );

  useEffect(() => {
    if (selectedShipDetailKey && !ownedShips.some((ship) => ship.key === selectedShipDetailKey)) {
      setSelectedShipDetailKey(null);
    }
  }, [ownedShips, selectedShipDetailKey]);

  useEffect(() => {
    setStagedShipKeys((current) => {
      const nextShipKeys = current.filter((shipKey) => pickerShipByKey.has(getFleetViewShipInstanceSourceKey(shipKey)));
      if (nextShipKeys.length === current.length) {
        return current;
      }

      const nextShipKeySet = new Set(nextShipKeys);
      savedShipTransformsRef.current = Object.fromEntries(
        Object.entries(savedShipTransformsRef.current)
          .filter(([shipKey]) => nextShipKeySet.has(shipKey)),
      );

      return nextShipKeys;
    });
  }, [pickerShipByKey]);

  const stagedViewerShips = useMemo(
    () => stagedShipKeys
      .map((shipKey) => {
        const sourceShipKey = getFleetViewShipInstanceSourceKey(shipKey);
        const sourceShip = pickerShipByKey.get(sourceShipKey);
        if (!sourceShip) {
          return undefined;
        }

        return {
          ...sourceShip,
          key: shipKey,
          sourceShipKey,
        };
      })
      .filter((ship): ship is FleetStagedShipEntry => ship !== undefined),
    [pickerShipByKey, stagedShipKeys],
  );

  // const stagedShipCountBySourceKey = useMemo(() => {
  //   const counts = new Map<string, number>();

  //   stagedShipKeys.forEach((shipKey) => {
  //     const sourceShipKey = getFleetViewShipInstanceSourceKey(shipKey);
  //     counts.set(sourceShipKey, (counts.get(sourceShipKey) || 0) + 1);
  //   });

  //   return counts;
  // }, [stagedShipKeys]);

  useEffect(() => {
    if (stagedViewerShips.length === 0) {
      if (selectedShipKey !== null) {
        setSelectedShipKey(null);
      }
      return;
    }

    if (selectedShipKey && !stagedViewerShips.some((ship) => ship.key === selectedShipKey)) {
      setSelectedShipKey(null);
    }
  }, [selectedShipKey, stagedViewerShips]);

  useEffect(() => {
    if (selectedShipKey !== null) {
      return;
    }

    setViewerTransformMode(null);
    setSelectedShipRotation(null);
  }, [selectedShipKey]);

  useEffect(() => {
    selectedShipKeyRef.current = selectedShipKey;
  }, [selectedShipKey]);

  useEffect(() => {
    stagedShipKeysRef.current = stagedShipKeys;
  }, [stagedShipKeys]);

  const persistSceneState = useCallback(() => {
    saveFleetViewSceneState({
      version: FLEET_VIEW_SCENE_STORAGE_VERSION,
      stagedShipKeys: stagedShipKeysRef.current,
      selectedShipKey: selectedShipKeyRef.current,
      viewerTransformMode: null,
      shipTransforms: savedShipTransformsRef.current,
    });
  }, []);

  useEffect(() => {
    persistSceneState();
  }, [persistSceneState, selectedShipKey, stagedShipKeys]);

  const selectedViewerShip = stagedViewerShips.find((ship) => ship.key === selectedShipKey) || null;
  const totalHullCount = useMemo(
    () => ownedShips.reduce((sum, ship) => sum + ship.quantity, 0),
    [ownedShips],
  );

  const addShipToScene = useCallback((ship: FleetPickerShipEntry) => {
    const instanceKey = createFleetViewShipInstanceKey(ship.key);

    startTransition(() => {
      setStagedShipKeys((current) => [...current, instanceKey]);
      setSelectedShipKey(instanceKey);
    });
  }, []);

  const toggleViewerTransformMode = (nextMode: FleetModelViewerTransformMode) => {
    setViewerTransformMode((current) => (current === nextMode ? null : nextMode));
  };

  const handleSelectedShipRotationChange = useCallback((rotation: FleetModelViewerRotationState | null) => {
    setSelectedShipRotation((current) => {
      if (current === rotation) {
        return current;
      }

      if (!current || !rotation) {
        return rotation;
      }

      if (current.x === rotation.x && current.y === rotation.y && current.z === rotation.z) {
        return current;
      }

      return rotation;
    });
  }, []);

  const handleShipTransformChange = useCallback((shipKey: string, transform: FleetModelViewerTransformState) => {
    savedShipTransformsRef.current = {
      ...savedShipTransformsRef.current,
      [shipKey]: transform,
    };

    persistSceneState();
  }, [persistSceneState]);

  const handleDeleteShip = useCallback((shipKey: string) => {
    setStagedShipKeys((current) => current.filter((entryKey) => entryKey !== shipKey));
    setSelectedShipKey((current) => (current === shipKey ? null : current));

    if (savedShipTransformsRef.current[shipKey]) {
      const nextTransforms = { ...savedShipTransformsRef.current };
      delete nextTransforms[shipKey];
      savedShipTransformsRef.current = nextTransforms;
    }
  }, []);

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

    const sourceShipKey = event.dataTransfer.getData(MODEL_PICKER_DRAG_TYPE);
    const ship = pickerShipByKey.get(sourceShipKey);
    if (!ship) {
      return;
    }

    addShipToScene(ship);
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

  const handleOpenShipDetail = useCallback((shipKey: string) => {
    setSelectedShipDetailKey(shipKey);
  }, []);

  const handleShipCardKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>, shipKey: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setSelectedShipDetailKey(shipKey);
    }
  }, []);

  const handleOpenHangarSource = useCallback((ship: FleetShipEntry, source: FleetShipSourceEntry) => {
    if (!source.hangarUrl || typeof window === 'undefined') {
      return;
    }

    reportBi({
      slot: BiSlots.NAVIGATE_RSI_HANGAR,
      data: {
        shipId: ship.shipId,
        shipName: ship.shipName,
        sourceKind: source.kind,
        sourceLabel: source.label,
        pageId: source.pageId,
        quantity: source.quantity,
      },
    });

    window.open(source.hangarUrl, '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <div className="absolute inset-x-0 bottom-0 top-[65px] overflow-hidden">
      <div className="flex h-full flex-col gap-4 p-4 text-left md:p-5">
        <section className="mx-auto w-full max-w-[1800px] border border-slate-200/80 bg-white/82 p-4 backdrop-blur-sm dark:border-neutral-700 dark:bg-[#121212]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2 mt-2">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="border border-slate-200/80 bg-slate-50/78 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-gray-400">
                    <FormattedMessage id="fleetview.stat.uniqueShips" defaultMessage="{count} unique ships" values={{ count: ownedShips.length }} />
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{ownedShips.length}</div>
                </div>
                <div className="border border-slate-200/80 bg-slate-50/78 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-gray-400">
                    <FormattedMessage id="fleetview.stat.totalHulls" defaultMessage="{count} hulls tracked" values={{ count: totalHullCount }} />
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{totalHullCount}</div>
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
            </div>
          </div>

          {shipsError && (
            <div className="mt-4 border border-amber-200/80 bg-amber-50/86 px-3 py-2 text-sm text-amber-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200">
              <FormattedMessage
                id="fleetview.catalogWarning"
                defaultMessage="Ship catalog data is temporarily unavailable. Fleet entries are still shown from your local hangar data, but some images and 3D matches may be missing."
              />
            </div>
          )}
        </section>

        {ownedShips.length === 0 ? (
          <section className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 items-center justify-center border border-dashed border-slate-300 bg-white/78 p-8 backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900">
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
          <section className="mx-auto min-h-0 w-full max-w-[1800px] flex-1 overflow-y-auto border border-slate-200/80 bg-white/78 p-4 backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900">
            {filteredOwnedShips.length === 0 ? (
              <div className="flex h-full items-center justify-center border border-dashed border-slate-300 bg-white/40 dark:border-neutral-700 dark:bg-transparent">
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
                  return (
                    <div
                      key={ship.key}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpenShipDetail(ship.key)}
                      onKeyDown={(event) => handleShipCardKeyDown(event, ship.key)}
                      className={`cursor-pointer overflow-hidden border text-left transition-all border-slate-200/80 bg-white/88 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/60 dark:border-neutral-700 dark:bg-transparent dark:hover:border-neutral-500`}
                    >
                      <div className="relative aspect-[16/8.6] overflow-hidden bg-slate-200 dark:bg-[#1b1b1b]">
                        <img
                          src={ship.imageUrl}
                          alt={ship.displayName}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

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

                      <div className="flex flex-col gap-3 bg-white/94 p-4 dark:bg-neutral-900">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-slate-500 dark:text-gray-400">
                            <FormattedMessage id="fleetview.card.msrp" defaultMessage="MSRP" />
                          </span>
                          <span className="font-medium text-slate-900 dark:text-white">
                            {ship.msrpCents !== null
                              ? formatUsdPrice(intl.locale, ship.msrpCents / 100)
                              : '-'}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-3 text-sm">
                          <span className="pt-1 text-slate-500 dark:text-gray-400">
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
              backgroundColor: isDarkMode ? '#121212' : '#f8fafc',
              backgroundImage: 'none',
              overflow: 'hidden',
            },
          },
        }}
      >
        <div className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,#eff6ff_0%,#f8fafc_44%,#edf2f7_100%)] text-slate-900 dark:bg-[#121212] dark:text-gray-100">
          <div className="border-b border-slate-200/80 bg-white/72 px-4 py-3 backdrop-blur-xl dark:border-neutral-700 dark:bg-[#121212]/92">
            <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-300 dark:bg-neutral-700 lg:hidden" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-gray-400">
                  <FormattedMessage id="fleetview.mode.viewer" defaultMessage="3D View" />
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-950 dark:text-gray-100">
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
                <h2 className="text-2xl font-semibold text-slate-950 dark:text-gray-100">
                  <FormattedMessage id="fleetview.viewer.emptyTitle" defaultMessage="No 3D models available in this filter" />
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-gray-400">
                  <FormattedMessage
                    id="fleetview.viewer.emptyDescription"
                    defaultMessage="The current filtered fleet entries cannot be matched to ship catalog models yet, so the shared 3D viewer cannot be staged."
                  />
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <aside className="flex w-full shrink-0 flex-col border-b border-slate-200/80 bg-white/68 backdrop-blur-xl dark:border-neutral-700 dark:bg-neutral-900 lg:w-[360px] lg:border-b-0 lg:border-r">
                <div className="border-b border-slate-200/80 p-4 dark:border-neutral-700">
                  <div className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-gray-400">
                    <FormattedMessage id="fleetview.viewer.pickerTitle" defaultMessage="Model Picker" />
                  </div>

                  <TextField
                    fullWidth
                    size="small"
                    variant="outlined"
                    className="mt-4"
                    sx={fleetTextFieldSx}
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
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {filteredPickerShips.length === 0 ? (
                    <div className="border border-dashed border-slate-300 bg-white/66 p-5 text-center dark:border-neutral-700 dark:bg-[#121212]">
                      <div className="text-base font-semibold text-slate-900 dark:text-gray-100">
                        <FormattedMessage id="fleetview.viewer.pickerEmptyTitle" defaultMessage="No ships match this picker search" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-gray-400">
                        <FormattedMessage
                          id="fleetview.viewer.pickerEmptyDescription"
                          defaultMessage="Try a different ship name or manufacturer. The picker includes every ship with a published 3D model."
                        />
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredPickerShips.map((ship) => {
                        // const stagedCount = stagedShipCountBySourceKey.get(ship.key) || 0;
                        // const isStaged = stagedCount > 0;

                        return (
                          <div
                            key={ship.key}
                            draggable
                            onDragStart={(event) => handlePickerDragStart(event, ship)}
                            className={`cursor-grab border p-3 transition-all ${ship.isOwned
                              ? 'border-slate-200/80 bg-white/88 hover:border-slate-300 dark:border-neutral-700 dark:bg-[#121212] dark:hover:border-neutral-500'
                              : 'border-slate-200/70 bg-slate-50/84 hover:border-slate-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-500'
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
                                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">
                                      {ship.displayName}
                                    </div>
                                    <div className="mt-1 truncate text-xs text-slate-500 dark:text-gray-400">
                                      {ship.manufacturerName || <FormattedMessage id="fleetview.card.unknownManufacturer" defaultMessage="Unknown manufacturer" />}
                                    </div>
                                  </div>

                                  {ship.isOwned && (
                                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200">
                                      <FormattedMessage id="fleetview.card.quantity" defaultMessage="x{count}" values={{ count: ship.quantity }} />
                                    </span>
                                  )}
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                                  {ship.msrpCents !== null && (
                                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600 dark:border-neutral-700 dark:bg-[#121212] dark:text-gray-200">
                                      {formatUsdPrice(intl.locale, ship.msrpCents / 100)}
                                    </span>
                                  )}
                                </div>
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
                    transformMode={viewerTransformMode}
                    savedTransforms={savedShipTransformsRef.current}
                    onSelectedShipKeyChange={setSelectedShipKey}
                    onSelectedShipRotationChange={handleSelectedShipRotationChange}
                    onShipTransformChange={handleShipTransformChange}
                    onDeleteShip={handleDeleteShip}
                  />

                  <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-blue-200/90 bg-white/86 px-3 py-1 text-blue-700 backdrop-blur-md dark:border-neutral-700 dark:bg-neutral-900/85 dark:text-gray-100">
                      <FormattedMessage
                        id="fleetview.viewer.stagedCount"
                        defaultMessage="{count} ships staged"
                        values={{ count: stagedViewerShips.length }}
                      />
                    </span>
                  </div>

                  {selectedViewerShip && (
                    <div className="pointer-events-auto absolute right-4 top-4 w-[min(92vw,20rem)] border border-white/80 bg-white/78 p-4 text-slate-900 backdrop-blur-xl dark:border-neutral-700 dark:bg-neutral-900/85 dark:text-gray-100">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-gray-400">
                        <FormattedMessage id="fleetview.viewer.shipLabel" defaultMessage="Selected Entry" />
                      </div>
                      <div className="mt-2 text-lg font-semibold text-slate-950 dark:text-gray-100">
                        {selectedViewerShip.displayName}
                      </div>
                      <div className="mt-1 text-sm text-slate-600 dark:text-gray-300">
                        {selectedViewerShip.manufacturerName || <FormattedMessage id="fleetview.card.unknownManufacturer" defaultMessage="Unknown manufacturer" />}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          onClick={() => toggleViewerTransformMode('translate')}
                          variant="text"
                          sx={viewerTransformButtonSx(viewerTransformMode === 'translate')}
                        >
                          <FormattedMessage
                            id="fleetview.viewer.transformTranslate"
                            defaultMessage="Move"
                          />
                        </Button>
                        <Button
                          onClick={() => toggleViewerTransformMode('rotate')}
                          variant="text"
                          sx={viewerTransformButtonSx(viewerTransformMode === 'rotate')}
                        >
                          <FormattedMessage
                            id="fleetview.viewer.transformRotate"
                            defaultMessage="Rotate"
                          />
                        </Button>
                      </div>
                      <div className="mt-3 border border-slate-200/80 bg-slate-100/76 px-3 py-2 dark:border-neutral-700 dark:bg-black/20">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-gray-400">
                          <FormattedMessage
                            id="fleetview.viewer.rotationAngleLabel"
                            defaultMessage="Rotation"
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold tabular-nums text-cyan-700 dark:text-cyan-100">
                            {selectedShipRotation ? `X ${selectedShipRotation.x}°  Y ${selectedShipRotation.y}°  Z ${selectedShipRotation.z}°` : '--'}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-gray-500">
                            <FormattedMessage
                              id="fleetview.viewer.rotationAngleSnapHint"
                              defaultMessage="1° snap"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Drawer>

      <Dialog
        open={Boolean(selectedDetailShip)}
        onClose={() => setSelectedShipDetailKey(null)}
        maxWidth="lg"
        fullWidth
        fullScreen={isMobileDialog}
      >
        <DialogTitle className="flex items-start justify-between gap-4 border-b border-gray-200 dark:border-gray-800">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              <RsiIcon src={getRsiIconPath('ship')} className="h-5 w-5" toneClassName="bg-slate-700 dark:bg-slate-100" />
              <span className="truncate">{selectedDetailShip?.displayName || '-'}</span>
            </div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {selectedDetailShip?.manufacturerName || intl.formatMessage({
                id: 'fleetview.card.unknownManufacturer',
                defaultMessage: 'Unknown manufacturer',
              })}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {selectedDetailShipExternalUrl && (
              <Button
                variant="text"
                size="small"
                startIcon={<OpenInNewRoundedIcon fontSize="small" />}
                onClick={() => {
                  if (typeof window === 'undefined') {
                    return;
                  }

                  window.open(selectedDetailShipExternalUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                <FormattedMessage id="ccuPlanner.shipInfo.openOnRsi" defaultMessage="Open on RSI" />
              </Button>
            )}
            <IconButton
              onClick={() => setSelectedShipDetailKey(null)}
              size="small"
              aria-label={intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </div>
        </DialogTitle>

        <DialogContent className="!p-0">
          <ShipInfoContent
            open={Boolean(selectedDetailShip)}
            ship={selectedDetailShipInfo}
            extraSections={selectedDetailShip ? (
              <section className="flex flex-col gap-3">
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  <FormattedMessage id="fleetview.source.title" defaultMessage="Sources" />
                </div>

                {selectedDetailShip.sources.length === 0 ? (
                  <div className="rounded border border-black/10 bg-black/[0.02] p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
                    <FormattedMessage
                      id="fleetview.source.empty"
                      defaultMessage="No hangar source records are available for this ship yet."
                    />
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {selectedDetailShip.sources.map((source) => (
                      <div
                        key={source.key}
                        className="rounded border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {source.label}
                            </div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {source.kind === 'standalone'
                                ? intl.formatMessage({
                                  id: 'fleetview.source.kind.standalone',
                                  defaultMessage: 'Standalone ship',
                                })
                                : intl.formatMessage({
                                  id: 'fleetview.source.kind.bundle',
                                  defaultMessage: 'Bundle',
                                })}
                              {source.ownerName ? ` · ${source.ownerName}` : ''}
                            </div>
                          </div>

                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200">
                            <FormattedMessage id="fleetview.card.quantity" defaultMessage="x{count}" values={{ count: source.quantity }} />
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                          {source.insuranceLabel && (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-300">
                              {source.insuranceLabel}
                            </span>
                          )}
                        </div>

                        <div className="mt-4">
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<OpenInNewRoundedIcon fontSize="small" />}
                            disabled={!source.hangarUrl}
                            onClick={() => handleOpenHangarSource(selectedDetailShip, source)}
                          >
                            <FormattedMessage id="hangar.viewInHangar" defaultMessage="RSI Hangar" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
