import { CcuSourceType } from '../../../types';

export const LEGACY_COMPLETED_PATHS_STORAGE_KEY = 'completedPaths';
const ACTIVE_COMPLETED_PATHS_STORAGE_KEY = 'ccu-planner-active-completed-paths-key';
const COMPLETED_PATHS_STORAGE_KEY_PREFIX = 'completedPaths:';

export interface StoredCompletedPathUsageEdge {
  sourceShipId: number;
  targetShipId: number;
  sourceType: CcuSourceType;
}

export interface StoredCompletedPathUsageItem {
  path: {
    edges?: StoredCompletedPathUsageEdge[];
  };
}

export function getCompletedPathsStorageKeyForTab(tabId: string): string {
  const normalizedTabId = tabId.trim();
  if (!normalizedTabId) {
    return LEGACY_COMPLETED_PATHS_STORAGE_KEY;
  }
  return `completedPaths:${normalizedTabId}`;
}

export function setActiveCompletedPathsStorageKey(storageKey: string): void {
  try {
    localStorage.setItem(ACTIVE_COMPLETED_PATHS_STORAGE_KEY, storageKey);
  } catch (error) {
    console.error('Failed to persist active completed-path storage key:', error);
  }
}

export function getActiveCompletedPathsStorageKey(): string {
  try {
    return localStorage.getItem(ACTIVE_COMPLETED_PATHS_STORAGE_KEY) || LEGACY_COMPLETED_PATHS_STORAGE_KEY;
  } catch (error) {
    console.error('Failed to read active completed-path storage key:', error);
    return LEGACY_COMPLETED_PATHS_STORAGE_KEY;
  }
}

export function parseStoredCompletedPaths(rawData: string | null): StoredCompletedPathUsageItem[] {
  if (!rawData) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawData) as StoredCompletedPathUsageItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to parse completed paths from storage:', error);
    return [];
  }
}

export function readStoredCompletedPathsByStorageKey(storageKey: string): StoredCompletedPathUsageItem[] {
  return parseStoredCompletedPaths(localStorage.getItem(storageKey));
}

export function readStoredCompletedPathsForActiveTab(): StoredCompletedPathUsageItem[] {
  const activeStorageKey = getActiveCompletedPathsStorageKey();
  const activeRaw = localStorage.getItem(activeStorageKey);
  const activePaths = parseStoredCompletedPaths(activeRaw);

  if (activeRaw !== null || activeStorageKey === LEGACY_COMPLETED_PATHS_STORAGE_KEY) {
    return activePaths;
  }

  return readStoredCompletedPathsByStorageKey(LEGACY_COMPLETED_PATHS_STORAGE_KEY);
}

export function cleanupCompletedPathsStorageForTabIds(tabIds: string[]): void {
  try {
    const validStorageKeys = new Set(
      tabIds
        .map(getCompletedPathsStorageKeyForTab)
        .filter(storageKey => storageKey.startsWith(COMPLETED_PATHS_STORAGE_KEY_PREFIX))
    );

    const staleKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(COMPLETED_PATHS_STORAGE_KEY_PREFIX)) {
        continue;
      }

      if (!validStorageKeys.has(key)) {
        staleKeys.push(key);
      }
    }

    staleKeys.forEach(key => {
      localStorage.removeItem(key);
    });

    const activeStorageKey = localStorage.getItem(ACTIVE_COMPLETED_PATHS_STORAGE_KEY);
    if (activeStorageKey?.startsWith(COMPLETED_PATHS_STORAGE_KEY_PREFIX) && !validStorageKeys.has(activeStorageKey)) {
      const firstValidKey = validStorageKeys.values().next().value;
      localStorage.setItem(
        ACTIVE_COMPLETED_PATHS_STORAGE_KEY,
        firstValidKey || LEGACY_COMPLETED_PATHS_STORAGE_KEY
      );
    }
  } catch (error) {
    console.error('Failed to cleanup stale completed-path storage keys:', error);
  }
}
