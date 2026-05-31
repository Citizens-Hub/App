import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { RootState } from '.';
import { CcuSourceType } from '../types';
import { loadHangarState, resolveHangarStateUserId, saveHangarState } from './hangarStorage';
import { AccountMarketSyncIssue } from '@/types';

const version = '1.0.0';
export const HANGAR_SYNC_PAYLOAD_VERSION = 1;

interface HangarItem {
  name: string,
  value: number,
  isBuyBack: boolean,
  canGift: boolean,
  belongsTo: number,
  quantity?: number,
  pageId?: number,
  pageIds?: number[],
}

export interface CCUItem extends HangarItem {
  from: { id: number, name: string },
  to: { id: number, name: string },
  parsed: {
    from: string,
    to: string
  },
  isSubscription?: boolean,
}

export interface ShipItem extends HangarItem {
  id: number,
  insurance: string,
}

export interface OtherItem extends HangarItem {
  id: number,
  withImage: boolean,
  image: string,
  type: string,
}

export interface BundleItem extends HangarItem {
  ships?: Partial<ShipItem>[],
  others?: OtherItem[],
  insurance?: string,
}

export interface HangarItems {
  ccus: CCUItem[],
  ships: ShipItem[],
  bundles: BundleItem[],
  accountIssues: AccountMarketSyncIssue[],
  predicts: {
    [shipId: number]: number,
  },
}

export interface Imported {
  [userID: number]: {
    ccus: CCUItem[]
  },
}

export interface UserInfo {
  isAnonymous: boolean,
  id: number,
  username: string,
  nickname: string,
  avatar: string,
}

export const getDefaultCurrency = () => {
  const locale = navigator.language;
  if (locale.includes('zh')) {
    return 'CNY';
  }
  if (locale.includes('jp')) {
    return 'JPY';
  }
  return 'USD';
}

export const defaultCcuSourceTypePriority: CcuSourceType[] = [
  CcuSourceType.HANGER,
  CcuSourceType.AVAILABLE_WB,
  CcuSourceType.EXPECTED_WB,
  CcuSourceType.HISTORICAL,
  CcuSourceType.PRICE_INCREASE,
  CcuSourceType.SUBSCRIPTION,
  CcuSourceType.OFFICIAL,
  CcuSourceType.THIRD_PARTY,
  CcuSourceType.OFFICIAL_WB,
];

const normalizeCcuSourceTypePriority = (priority: CcuSourceType[] | undefined): CcuSourceType[] => {
  if (!priority?.length) return defaultCcuSourceTypePriority;

  const normalized: CcuSourceType[] = [];
  priority.forEach(type => {
    if (!normalized.includes(type) && defaultCcuSourceTypePriority.includes(type)) {
      normalized.push(type);
    }
  });

  defaultCcuSourceTypePriority.forEach(type => {
    if (!normalized.includes(type)) {
      normalized.push(type);
    }
  });

  return normalized;
}

function normalizeShipNameKey(name?: string | null) {
  return name?.trim().toUpperCase() || '';
}

function getCcuShipMatchKey(item: Pick<CCUItem, 'parsed'>) {
  return `name:${normalizeShipNameKey(item.parsed?.from)}->${normalizeShipNameKey(item.parsed?.to)}`;
}

function normalizeOptionalTextKey(value?: string | null) {
  return value?.trim().replace(/\s+/g, ' ').toUpperCase() || '';
}

function normalizeOptionalNumberKey(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function getBaseHangarItemMatchKey(item: Pick<HangarItem, 'belongsTo' | 'canGift' | 'isBuyBack' | 'name' | 'value'>) {
  return [
    `owner:${item.belongsTo}`,
    `gift:${item.canGift ? 'yes' : 'no'}`,
    `source:${item.isBuyBack ? 'buyback' : 'hangar'}`,
    `name:${normalizeOptionalTextKey(item.name)}`,
    `value:${normalizeOptionalNumberKey(item.value)}`,
  ].join('|');
}

function getShipMatchKey(item: ShipItem) {
  return [
    getBaseHangarItemMatchKey(item),
    `ship:${item.id}`,
    `shipName:${normalizeOptionalTextKey(item.name)}`,
    `insurance:${normalizeOptionalTextKey(item.insurance)}`,
  ].join('|');
}

function getOtherItemContentKey(item: Partial<OtherItem>) {
  return [
    `name:${normalizeOptionalTextKey(item.name)}`,
    `type:${normalizeOptionalTextKey(item.type)}`,
    `image:${normalizeOptionalTextKey(item.image)}`,
    `withImage:${item.withImage ? 'yes' : 'no'}`,
    `value:${normalizeOptionalNumberKey(item.value)}`,
    `gift:${item.canGift ? 'yes' : 'no'}`,
    `source:${item.isBuyBack ? 'buyback' : 'hangar'}`,
  ].join('|');
}

function getBundleShipContentKey(item: Partial<ShipItem>) {
  return [
    `id:${normalizeOptionalNumberKey(item.id)}`,
    `name:${normalizeOptionalTextKey(item.name)}`,
    `insurance:${normalizeOptionalTextKey(item.insurance)}`,
  ].join('|');
}

function getCountedContentKey(key: string, quantity?: number) {
  return `${key}#${Math.max(1, quantity || 1)}`;
}

function getBundleMatchKey(item: BundleItem) {
  const shipsKey = (item.ships || [])
    .map(ship => getCountedContentKey(getBundleShipContentKey(ship), ship.quantity))
    .sort()
    .join('||');
  const othersKey = (item.others || [])
    .map(other => getCountedContentKey(getOtherItemContentKey(other), other.quantity))
    .sort()
    .join('||');

  return [
    getBaseHangarItemMatchKey(item),
    `insurance:${normalizeOptionalTextKey(item.insurance)}`,
    `ships:${shipsKey}`,
    `others:${othersKey}`,
  ].join('|');
}

function mergeHangarItemQuantity<T extends HangarItem>(target: T, source: T) {
  target.quantity = (target.quantity || 1) + (source.quantity || 1);
  target.pageIds = Array.from(new Set([
    ...(target.pageIds || []),
    ...(target.pageId ? [target.pageId] : []),
    ...(source.pageIds || []),
    ...(source.pageId ? [source.pageId] : []),
  ])).sort((left, right) => left - right);
}

export interface HangarSyncPreferences {
  hangar: boolean;
}

export interface HangarSyncMetadata {
  syncUserId: string | null;
  syncRevision: number | null;
  hangarUpdatedAt: string | null;
  lastSyncedHangarUpdatedAt: string | null;
  remoteHangarUpdatedAt: string | null;
  lastSyncedAt: string | null;
  deviceId: string;
  syncPreferences: HangarSyncPreferences;
  syncStatus: 'idle' | 'bootstrapping' | 'syncing' | 'conflict' | 'error';
  syncError: string | null;
}

function getNowIsoString(): string {
  return new Date().toISOString();
}

function touchHangarContent(state: {
  hangarUpdatedAt: string | null;
}) {
  state.hangarUpdatedAt = getNowIsoString();
}

function createDefaultSyncPreferences(): HangarSyncPreferences {
  return {
    hangar: true,
  };
}

function generateHangarSyncDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `device-${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateDeviceId() {
  const rawState = loadHangarState();

  if (rawState) {
    try {
      const parsed = JSON.parse(rawState) as { deviceId?: string };
      if (parsed.deviceId) {
        return parsed.deviceId;
      }
    } catch (error) {
      console.error('Failed to parse hangar state while resolving device id:', error);
    }
  }

  return generateHangarSyncDeviceId();
}

function createDefaultHangarItems(): HangarItems {
  return {
    ccus: [],
    ships: [],
    bundles: [],
    accountIssues: [],
    predicts: {},
  };
}

function normalizeHangarItems(items?: Partial<HangarItems> | null): HangarItems {
  const defaults = createDefaultHangarItems();

  return {
    ccus: Array.isArray(items?.ccus) ? items.ccus : defaults.ccus,
    ships: Array.isArray(items?.ships) ? items.ships : defaults.ships,
    bundles: Array.isArray(items?.bundles) ? items.bundles : defaults.bundles,
    accountIssues: Array.isArray(items?.accountIssues) ? items.accountIssues : defaults.accountIssues,
    predicts: items?.predicts && typeof items.predicts === 'object' && !Array.isArray(items.predicts)
      ? items.predicts
      : defaults.predicts,
  };
}

function persistUpgradesState(state: {
  syncUserId: string | null;
  version: string;
  items?: Partial<HangarItems> | null;
}) {
  const serializedState = JSON.stringify({
    ...state,
    items: normalizeHangarItems(state.items),
  });
  saveHangarState(serializedState, resolveHangarStateUserId(state));
}

const getInitialState = (): {
  items: HangarItems,
  imported: Imported,
  users: UserInfo[],
  version: string,
  selectedUser: number,
  currency: string,
  ccuSourceTypePriority: CcuSourceType[],
  syncUserId: string | null,
  syncRevision: number | null,
  hangarUpdatedAt: string | null,
  lastSyncedHangarUpdatedAt: string | null,
  remoteHangarUpdatedAt: string | null,
  lastSyncedAt: string | null,
  deviceId: string,
  syncPreferences: HangarSyncPreferences,
  syncStatus: 'idle' | 'bootstrapping' | 'syncing' | 'conflict' | 'error',
  syncError: string | null
} => {
  const localState = loadHangarState();

  if (localState && JSON.parse(localState).version === version) {
    const state =  JSON.parse(localState);
    state.ccuSourceTypePriority = normalizeCcuSourceTypePriority(state.ccuSourceTypePriority);

    return {
      ...state,
      currency: state.currency || getDefaultCurrency(),
      items: normalizeHangarItems(state.items),
      imported: state.imported || {},
      ccuSourceTypePriority: normalizeCcuSourceTypePriority(state.ccuSourceTypePriority),
      syncUserId: typeof state.syncUserId === 'string' ? state.syncUserId : null,
      syncRevision: typeof state.syncRevision === 'number' ? state.syncRevision : null,
      hangarUpdatedAt: typeof state.hangarUpdatedAt === 'string' ? state.hangarUpdatedAt : null,
      lastSyncedHangarUpdatedAt: typeof state.lastSyncedHangarUpdatedAt === 'string' ? state.lastSyncedHangarUpdatedAt : null,
      remoteHangarUpdatedAt: typeof state.remoteHangarUpdatedAt === 'string' ? state.remoteHangarUpdatedAt : null,
      lastSyncedAt: typeof state.lastSyncedAt === 'string' ? state.lastSyncedAt : null,
      deviceId: typeof state.deviceId === 'string' && state.deviceId.trim() ? state.deviceId : getOrCreateDeviceId(),
      syncPreferences: {
        ...createDefaultSyncPreferences(),
        ...(state.syncPreferences || {}),
      },
      syncStatus: state.syncStatus || 'idle',
      syncError: typeof state.syncError === 'string' ? state.syncError : null,
    };
  }

  return {
    items: createDefaultHangarItems(),
    imported: {},
    users: [],
    selectedUser: -1,
    currency: getDefaultCurrency(),
    ccuSourceTypePriority: defaultCcuSourceTypePriority,
    version,
    syncUserId: null,
    syncRevision: null,
    hangarUpdatedAt: null,
    lastSyncedHangarUpdatedAt: null,
    remoteHangarUpdatedAt: null,
    lastSyncedAt: null,
    deviceId: getOrCreateDeviceId(),
    syncPreferences: createDefaultSyncPreferences(),
    syncStatus: 'idle',
    syncError: null,
  };
};

export const upgradesSlice = createSlice({
  name: 'upgrades',
  initialState: getInitialState(),
  reducers: {
    addCCU: (state, action: PayloadAction<CCUItem>) => {
      const ccuShipMatchKey = getCcuShipMatchKey(action.payload);
      if (!state.items.ccus.find(item => item.belongsTo === action.payload.belongsTo && item.canGift === action.payload.canGift && getCcuShipMatchKey(item) === ccuShipMatchKey && item.name === action.payload.name && item.value === action.payload.value && item.isBuyBack === action.payload.isBuyBack)) {
        state.items.ccus.push({
          ...action.payload,
          quantity: 1,
          pageIds: action.payload.pageId ? [action.payload.pageId] : [],
        });
      } else {
        const item = state.items.ccus.find(item => item.belongsTo === action.payload.belongsTo && item.canGift === action.payload.canGift && getCcuShipMatchKey(item) === ccuShipMatchKey && item.name === action.payload.name && item.value === action.payload.value && item.isBuyBack === action.payload.isBuyBack);
        if (item) {
          item.quantity = (item.quantity || 1) + 1;
          item.pageIds = item.pageIds || [];
          if (action.payload.pageId && !item.pageIds.includes(action.payload.pageId)) {
            item.pageIds.push(action.payload.pageId);
          }
        }
      }
      touchHangarContent(state);
      persistUpgradesState(state);
    },
    addShip: (state, action: PayloadAction<ShipItem>) => {
      const incoming = {
        ...action.payload,
        pageIds: action.payload.pageIds || (action.payload.pageId ? [action.payload.pageId] : []),
      };
      const shipMatchKey = getShipMatchKey(incoming);
      const item = state.items.ships.find(item => getShipMatchKey(item) === shipMatchKey);

      if (item) {
        mergeHangarItemQuantity(item, incoming);
      } else {
        state.items.ships.push(incoming);
      }
      touchHangarContent(state);
      persistUpgradesState(state);
    },
    addBundle: (state, action: PayloadAction<BundleItem>) => {
      const incoming = {
        ...action.payload,
        pageIds: action.payload.pageIds || (action.payload.pageId ? [action.payload.pageId] : []),
      };
      const bundleMatchKey = getBundleMatchKey(incoming);
      const item = state.items.bundles.find(item => getBundleMatchKey(item) === bundleMatchKey);

      if (item) {
        mergeHangarItemQuantity(item, incoming);
      } else {
        state.items.bundles.push(incoming);
      }
      touchHangarContent(state);
      persistUpgradesState(state);
    },
    addAccountIssue: (state, action: PayloadAction<AccountMarketSyncIssue>) => {
      state.items.accountIssues.push(action.payload);
      touchHangarContent(state);
      persistUpgradesState(state);
    },
    addBuybackCCU: (state, action: PayloadAction<CCUItem>) => {
      const ccuShipMatchKey = getCcuShipMatchKey(action.payload);
      if (!state.items.ccus.find(item => item.belongsTo === action.payload.belongsTo && item.canGift === action.payload.canGift && getCcuShipMatchKey(item) === ccuShipMatchKey && item.name === action.payload.name && item.value === action.payload.value && item.isBuyBack === action.payload.isBuyBack)) {
        state.items.ccus.push({
          ...action.payload,
          quantity: 1,
          pageIds: action.payload.pageId ? [action.payload.pageId] : [],
        });
      } else {
        const item = state.items.ccus.find(item => item.belongsTo === action.payload.belongsTo && item.canGift === action.payload.canGift && getCcuShipMatchKey(item) === ccuShipMatchKey && item.name === action.payload.name && item.value === action.payload.value && item.isBuyBack === action.payload.isBuyBack);
        if (item) {
          item.quantity = (item.quantity || 1) + 1;
          item.pageIds = item.pageIds || [];
          if (action.payload.pageId && !item.pageIds.includes(action.payload.pageId)) {
            item.pageIds.push(action.payload.pageId);
          }
        }
      }
      touchHangarContent(state);
      persistUpgradesState(state);
    },
    addUser: (state, action: PayloadAction<UserInfo>) => {
      if (!state.users.find(user => user.id === action.payload.id)) {
        state.users.push(action.payload);
        touchHangarContent(state);
      }
      persistUpgradesState(state);
    },
    addPredict: (state, action: PayloadAction<{ shipId: number, price: number }>) => {
      state.items.predicts[action.payload.shipId] = action.payload.price;
      touchHangarContent(state);
      persistUpgradesState(state);
    },
    removePredict: (state, action: PayloadAction<number>) => {
      delete state.items.predicts[action.payload];
      touchHangarContent(state);
      persistUpgradesState(state);
    },
    clearUpgrades: (state, action: PayloadAction<number>) => {
      const currentUser = action.payload;
      const items = normalizeHangarItems(state.items);
      state.items = {
        ccus: items.ccus.filter(item => item.belongsTo !== currentUser),
        ships: items.ships.filter(item => item.belongsTo !== currentUser),
        bundles: items.bundles.filter(item => item.belongsTo !== currentUser),
        accountIssues: items.accountIssues.filter(item => item.belongsTo !== currentUser),
        predicts: items.predicts,
      };
      touchHangarContent(state);
      persistUpgradesState(state);
    },
    setSelectedUser: (state, action: PayloadAction<number>) => {
      state.selectedUser = action.payload;
      touchHangarContent(state);
      persistUpgradesState(state);
    },
    setCurrency: (state, action: PayloadAction<string>) => {
      state.currency = action.payload;
      touchHangarContent(state);
      persistUpgradesState(state);
    },
    setCcuSourceTypePriority: (state, action: PayloadAction<CcuSourceType[]>) => {
      state.ccuSourceTypePriority = action.payload;
      touchHangarContent(state);
      persistUpgradesState(state);
    },
    setHangarSyncUser: (state, action: PayloadAction<string | null>) => {
      state.syncUserId = action.payload;
      persistUpgradesState(state);
    },
    setHangarSyncRevision: (state, action: PayloadAction<number | null>) => {
      state.syncRevision = action.payload;
      persistUpgradesState(state);
    },
    setHangarUpdatedAt: (state, action: PayloadAction<string | null>) => {
      state.hangarUpdatedAt = action.payload;
      persistUpgradesState(state);
    },
    setHangarLastSyncedVersion: (state, action: PayloadAction<string | null>) => {
      state.lastSyncedHangarUpdatedAt = action.payload;
      persistUpgradesState(state);
    },
    setHangarRemoteVersion: (state, action: PayloadAction<string | null>) => {
      state.remoteHangarUpdatedAt = action.payload;
      persistUpgradesState(state);
    },
    setHangarLastSyncedAt: (state, action: PayloadAction<string | null>) => {
      state.lastSyncedAt = action.payload;
      persistUpgradesState(state);
    },
    setHangarSyncPreferences: (state, action: PayloadAction<Partial<HangarSyncPreferences>>) => {
      state.syncPreferences = {
        ...state.syncPreferences,
        ...action.payload,
      };
      persistUpgradesState(state);
    },
    setHangarSyncStatus: (state, action: PayloadAction<HangarSyncMetadata['syncStatus']>) => {
      state.syncStatus = action.payload;
      persistUpgradesState(state);
    },
    setHangarSyncError: (state, action: PayloadAction<string | null>) => {
      state.syncError = action.payload;
      persistUpgradesState(state);
    },
    replaceUpgradesState: (state, action: PayloadAction<{
      nextState: {
        items: HangarItems;
        imported: Imported;
        users: UserInfo[];
        selectedUser: number;
        currency: string;
        ccuSourceTypePriority: CcuSourceType[];
      };
      sync: Partial<HangarSyncMetadata>;
    }>) => {
      state.items = normalizeHangarItems(action.payload.nextState.items);
      state.imported = action.payload.nextState.imported || {};
      state.users = Array.isArray(action.payload.nextState.users) ? action.payload.nextState.users : [];
      state.selectedUser = typeof action.payload.nextState.selectedUser === 'number' ? action.payload.nextState.selectedUser : -1;
      state.currency = action.payload.nextState.currency || getDefaultCurrency();
      state.ccuSourceTypePriority = normalizeCcuSourceTypePriority(action.payload.nextState.ccuSourceTypePriority);
      state.syncUserId = action.payload.sync.syncUserId ?? state.syncUserId;
      state.syncRevision = action.payload.sync.syncRevision ?? state.syncRevision;
      state.hangarUpdatedAt = action.payload.sync.hangarUpdatedAt ?? state.hangarUpdatedAt;
      state.lastSyncedHangarUpdatedAt = action.payload.sync.lastSyncedHangarUpdatedAt ?? state.lastSyncedHangarUpdatedAt;
      state.remoteHangarUpdatedAt = action.payload.sync.remoteHangarUpdatedAt ?? state.remoteHangarUpdatedAt;
      state.lastSyncedAt = action.payload.sync.lastSyncedAt ?? state.lastSyncedAt;
      state.deviceId = action.payload.sync.deviceId ?? state.deviceId;
      state.syncPreferences = {
        ...state.syncPreferences,
        ...(action.payload.sync.syncPreferences || {}),
      };
      state.syncStatus = action.payload.sync.syncStatus ?? state.syncStatus;
      state.syncError = action.payload.sync.syncError ?? state.syncError;
      persistUpgradesState(state);
    }
  }
});

export const selectUsersHangarItems = createSelector(
  (state: RootState) => state.upgrades.items?.ccus ?? [],
  (state: RootState) => state.upgrades.items?.ships ?? [],
  (state: RootState) => state.upgrades.items?.bundles ?? [],
  (state: RootState) => state.upgrades.items?.accountIssues ?? [],
  (state: RootState) => state.upgrades.selectedUser,
  (ccus, ships, bundles, accountIssues, selectedUser) => {
    return {
      ccus: ccus.filter(item => item.belongsTo === selectedUser || selectedUser === -1),
      ships: ships.filter(item => item.belongsTo === selectedUser || selectedUser === -1),
      bundles: bundles.filter(item => item.belongsTo === selectedUser || selectedUser === -1),
      accountIssues: accountIssues.filter(item => item.belongsTo === selectedUser || selectedUser === -1),
    };
  }
);

export const { 
  addCCU,
  addShip,
  addBundle,
  addAccountIssue,
  addBuybackCCU,
  addUser, 
  clearUpgrades, 
  setSelectedUser, 
  setCurrency, 
  addPredict, 
  removePredict,
  setCcuSourceTypePriority,
  setHangarSyncUser,
  setHangarSyncRevision,
  setHangarUpdatedAt,
  setHangarLastSyncedVersion,
  setHangarRemoteVersion,
  setHangarLastSyncedAt,
  setHangarSyncPreferences,
  setHangarSyncStatus,
  setHangarSyncError,
  replaceUpgradesState,
} = upgradesSlice.actions;

export default upgradesSlice.reducer
