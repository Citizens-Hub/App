import { UserRole } from '@/types';

const LEGACY_HANGAR_STORAGE_KEY = 'state';
const HANGAR_STORAGE_PREFIX = 'hangar-state';
const ACTIVE_HANGAR_STORAGE_KEY = 'active-hangar-storage-key';

type NullableString = string | null | undefined;

function sanitizeUserId(userId: NullableString): string | null {
  if (!userId) {
    return null;
  }

  const normalizedUserId = userId.trim();
  return normalizedUserId ? normalizedUserId : null;
}

export function getHangarStorageKey(userId?: NullableString): string {
  const normalizedUserId = sanitizeUserId(userId);
  return normalizedUserId ? `${HANGAR_STORAGE_PREFIX}:${normalizedUserId}` : LEGACY_HANGAR_STORAGE_KEY;
}

export function setActiveHangarStorageKey(userId?: NullableString): string {
  const storageKey = getHangarStorageKey(userId);

  try {
    localStorage.setItem(ACTIVE_HANGAR_STORAGE_KEY, storageKey);
  } catch (error) {
    console.error('Failed to persist active hangar storage key:', error);
  }

  return storageKey;
}

export function getActiveHangarStorageKey(): string {
  try {
    return localStorage.getItem(ACTIVE_HANGAR_STORAGE_KEY) || LEGACY_HANGAR_STORAGE_KEY;
  } catch (error) {
    console.error('Failed to read active hangar storage key:', error);
    return LEGACY_HANGAR_STORAGE_KEY;
  }
}

export function getHangarStorageKeyForCurrentUser(user?: { id?: string; role?: UserRole }): string {
  if (user?.role && user.role >= UserRole.User && user.id) {
    return getHangarStorageKey(user.id);
  }

  return getActiveHangarStorageKey();
}

function readHangarStateByKey(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch (error) {
    console.error('Failed to load hangar state from localStorage:', error);
    return null;
  }
}

export function loadLegacyHangarState(): string | null {
  return readHangarStateByKey(LEGACY_HANGAR_STORAGE_KEY);
}

export function loadHangarState(userId?: NullableString): string | null {
  const storageKey = sanitizeUserId(userId)
    ? getHangarStorageKey(userId)
    : getActiveHangarStorageKey();

  try {
    const scopedState = readHangarStateByKey(storageKey);
    if (scopedState !== null) {
      return scopedState;
    }

    if (storageKey !== LEGACY_HANGAR_STORAGE_KEY) {
      return loadLegacyHangarState();
    }

    return null;
  } catch (error) {
    console.error('Failed to load hangar state from localStorage:', error);
    return null;
  }
}

export function loadScopedHangarState(userId?: NullableString): string | null {
  const storageKey = getHangarStorageKey(userId);

  try {
    return localStorage.getItem(storageKey);
  } catch (error) {
    console.error('Failed to load scoped hangar state from localStorage:', error);
    return null;
  }
}

export function saveHangarState(serializedState: string, userId?: NullableString): void {
  const storageKey = getHangarStorageKey(userId);

  try {
    localStorage.setItem(storageKey, serializedState);
    localStorage.setItem(ACTIVE_HANGAR_STORAGE_KEY, storageKey);
  } catch (error) {
    console.error('Failed to save hangar state to localStorage:', error);
  }
}

export function removeHangarState(userId?: NullableString): void {
  const storageKey = getHangarStorageKey(userId);

  try {
    localStorage.removeItem(storageKey);
    if (getActiveHangarStorageKey() === storageKey) {
      localStorage.setItem(ACTIVE_HANGAR_STORAGE_KEY, LEGACY_HANGAR_STORAGE_KEY);
    }
  } catch (error) {
    console.error('Failed to remove hangar state from localStorage:', error);
  }
}

export function resolveHangarStateUserId(state: { syncUserId?: string | null }, fallbackUserId?: NullableString): string | null {
  return sanitizeUserId(state.syncUserId) || sanitizeUserId(fallbackUserId);
}
