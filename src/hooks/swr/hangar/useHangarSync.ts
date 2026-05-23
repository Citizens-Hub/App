import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { RootState } from '@/store';
import {
  HANGAR_SYNC_PAYLOAD_VERSION,
  defaultCcuSourceTypePriority,
  getDefaultCurrency,
  type HangarItems,
  type Imported,
  type UserInfo,
  replaceUpgradesState,
  setHangarLastSyncedAt,
  setHangarLastSyncedVersion,
  setHangarRemoteVersion,
  setHangarSyncError,
  setHangarSyncRevision,
  setHangarSyncStatus,
  setHangarSyncUser,
} from '@/store/upgradesStore';
import {
  loadHangarState,
  loadLegacyHangarState,
  loadScopedHangarState,
  saveHangarState,
  setActiveHangarStorageKey,
} from '@/store/hangarStorage';
import { UserRole } from '@/types';

export interface HangarSyncRecordSummary {
  users: number;
  ccus: number;
  ships: number;
  bundles: number;
}

export interface HangarSyncRecord {
  revision: number;
  r2Key: string;
  payloadHash: string;
  updatedAt: string;
  hangarUpdatedAt: string;
  createdByDevice: string;
  payloadVersion: number;
  summary: HangarSyncRecordSummary;
}

interface HangarSyncSnapshot {
  version: string;
  items: {
    ccus: unknown[];
    ships: unknown[];
    bundles: unknown[];
    predicts: Record<number, number>;
  };
  imported: Record<number, { ccus: unknown[] }>;
  users: UserInfo[];
  selectedUser: number;
  currency: string;
  ccuSourceTypePriority: unknown[];
  syncUserId: string | null;
  syncRevision: number | null;
  hangarUpdatedAt: string | null;
  lastSyncedHangarUpdatedAt: string | null;
  remoteHangarUpdatedAt: string | null;
  lastSyncedAt: string | null;
  deviceId: string;
  syncPreferences: {
    hangar: boolean;
  };
}

interface HangarSyncResponse {
  success: boolean;
  code?: string;
  message?: string;
  data?: {
    current: HangarSyncRecord | null;
    payload: HangarSyncSnapshot | null;
    payloadVersion: number | null;
    unchanged?: boolean;
  };
}

interface HangarSyncMetadataResponse {
  success: boolean;
  message?: string;
  data?: {
    current: HangarSyncRecord | null;
  };
}

type PendingConflict = {
  current: HangarSyncRecord | null;
  payload: HangarSyncSnapshot | null;
  localPayload: HangarSyncSnapshot;
};

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
const AUTO_SYNC_DEBOUNCE_MS = 4000;

function isAuthenticatedUser(user: { role: UserRole; id: string }) {
  return user.role >= UserRole.User && Boolean(user.id);
}

function canSyncPayload(snapshot: HangarSyncSnapshot) {
  return snapshot.syncPreferences.hangar && Boolean(snapshot.hangarUpdatedAt);
}

function serializeHangarState(rawState: RootState['upgrades']): HangarSyncSnapshot {
  return {
    version: rawState.version,
    items: rawState.items,
    imported: rawState.imported,
    users: rawState.users,
    selectedUser: rawState.selectedUser,
    currency: rawState.currency,
    ccuSourceTypePriority: rawState.ccuSourceTypePriority,
    syncUserId: rawState.syncUserId,
    syncRevision: rawState.syncRevision,
    hangarUpdatedAt: rawState.hangarUpdatedAt,
    lastSyncedHangarUpdatedAt: rawState.lastSyncedHangarUpdatedAt,
    remoteHangarUpdatedAt: rawState.remoteHangarUpdatedAt,
    lastSyncedAt: rawState.lastSyncedAt,
    deviceId: rawState.deviceId,
    syncPreferences: rawState.syncPreferences,
  };
}

function getSnapshotSignature(snapshot: HangarSyncSnapshot) {
  return JSON.stringify(snapshot);
}

export default function useHangarSync() {
  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.user);
  const upgrades = useSelector((state: RootState) => state.upgrades);
  const snapshot = useMemo(() => serializeHangarState(upgrades), [upgrades]);
  const snapshotSignature = useMemo(() => getSnapshotSignature(snapshot), [snapshot]);

  const [status, setStatus] = useState<'idle' | 'bootstrapping' | 'syncing' | 'conflict' | 'error'>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [currentRecord, setCurrentRecord] = useState<HangarSyncRecord | null>(null);
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);

  const autoSyncTimerRef = useRef<number | null>(null);
  const skipNextAutoSyncRef = useRef(false);
  const lastUploadedSignatureRef = useRef<string | null>(null);
  const bootstrappedUserIdRef = useRef<string | null>(null);
  const latestSnapshotRef = useRef<HangarSyncSnapshot>(snapshot);

  const isAuthenticated = isAuthenticatedUser(user);
  const isSyncEnabled = upgrades.syncPreferences.hangar;

  useEffect(() => {
    latestSnapshotRef.current = snapshot;
  }, [snapshot]);

  const clearAutoSyncTimer = useCallback(() => {
    if (autoSyncTimerRef.current !== null) {
      window.clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    dispatch(setHangarSyncStatus(status));
  }, [dispatch, status]);

  useEffect(() => {
    dispatch(setHangarSyncError(lastError));
  }, [dispatch, lastError]);

  const applyRemoteSnapshot = useCallback((payload: HangarSyncSnapshot, record: HangarSyncRecord | null) => {
    skipNextAutoSyncRef.current = true;

    dispatch(replaceUpgradesState({
      nextState: {
        items: payload.items as HangarItems,
        imported: payload.imported as Imported,
        users: payload.users as UserInfo[],
        selectedUser: payload.selectedUser,
        currency: payload.currency,
        ccuSourceTypePriority: payload.ccuSourceTypePriority as never[],
      },
      sync: {
        syncUserId: user.id,
        syncRevision: record?.revision ?? null,
        hangarUpdatedAt: payload.hangarUpdatedAt ?? record?.hangarUpdatedAt ?? null,
        lastSyncedHangarUpdatedAt: record?.hangarUpdatedAt ?? payload.hangarUpdatedAt ?? null,
        remoteHangarUpdatedAt: record?.hangarUpdatedAt ?? payload.hangarUpdatedAt ?? null,
        lastSyncedAt: record?.updatedAt ?? null,
        deviceId: payload.deviceId || upgrades.deviceId,
        syncPreferences: payload.syncPreferences,
      },
    }));

    setCurrentRecord(record);

    lastUploadedSignatureRef.current = getSnapshotSignature({
      ...payload,
      syncUserId: user.id,
      syncRevision: record?.revision ?? null,
      hangarUpdatedAt: record?.hangarUpdatedAt ?? payload.hangarUpdatedAt ?? null,
      lastSyncedHangarUpdatedAt: record?.hangarUpdatedAt ?? payload.lastSyncedHangarUpdatedAt ?? null,
      remoteHangarUpdatedAt: record?.hangarUpdatedAt ?? payload.remoteHangarUpdatedAt ?? null,
      lastSyncedAt: record?.updatedAt ?? payload.lastSyncedAt ?? null,
    });
  }, [dispatch, upgrades.deviceId, user.id]);

  const applyLocalScopedSnapshot = useCallback((payload: HangarSyncSnapshot | null) => {
    skipNextAutoSyncRef.current = true;

    if (!payload) {
      dispatch(replaceUpgradesState({
        nextState: {
          items: {
            ccus: [],
            ships: [],
            bundles: [],
            accountIssues: [],
            predicts: {},
          },
          imported: {},
          users: [],
          selectedUser: -1,
          currency: getDefaultCurrency(),
          ccuSourceTypePriority: defaultCcuSourceTypePriority,
        },
        sync: {
          syncUserId: user.id,
          syncRevision: null,
          hangarUpdatedAt: null,
          lastSyncedHangarUpdatedAt: null,
          remoteHangarUpdatedAt: null,
          lastSyncedAt: null,
        },
      }));
      lastUploadedSignatureRef.current = null;
      return;
    }

    dispatch(replaceUpgradesState({
      nextState: {
        items: payload.items as HangarItems,
        imported: payload.imported as Imported,
        users: payload.users as UserInfo[],
        selectedUser: payload.selectedUser,
        currency: payload.currency,
        ccuSourceTypePriority: payload.ccuSourceTypePriority as never[],
      },
      sync: {
        syncUserId: user.id,
        syncRevision: payload.syncRevision,
        hangarUpdatedAt: payload.hangarUpdatedAt,
        lastSyncedHangarUpdatedAt: payload.lastSyncedHangarUpdatedAt,
        remoteHangarUpdatedAt: payload.remoteHangarUpdatedAt,
        lastSyncedAt: payload.lastSyncedAt,
        deviceId: payload.deviceId || upgrades.deviceId,
        syncPreferences: payload.syncPreferences,
      },
    }));
    lastUploadedSignatureRef.current = null;
  }, [dispatch, upgrades.deviceId, user.id]);

  const fetchMetadata = useCallback(async () => {
    if (!user.token) {
      return null;
    }

    const response = await fetch(`${API_BASE_URL}/api/user/sync/hangar/metadata`, {
      headers: {
        Authorization: `Bearer ${user.token}`,
      },
    });

    return response.json() as Promise<HangarSyncMetadataResponse>;
  }, [user.token]);

  const fetchCurrentSnapshot = useCallback(async () => {
    if (!user.token) {
      return null;
    }

    const response = await fetch(`${API_BASE_URL}/api/user/sync/hangar`, {
      headers: {
        Authorization: `Bearer ${user.token}`,
      },
    });

    return response.json() as Promise<HangarSyncResponse>;
  }, [user.token]);

  const saveSnapshot = useCallback(async (payload: HangarSyncSnapshot, options?: { force?: boolean }) => {
    if (!user.token) {
      return null;
    }

    const response = await fetch(`${API_BASE_URL}/api/user/sync/hangar`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        baseRevision: options?.force ? currentRecord?.revision ?? null : upgrades.syncRevision,
        baseHangarUpdatedAt: options?.force ? currentRecord?.hangarUpdatedAt ?? null : upgrades.remoteHangarUpdatedAt,
        payloadVersion: HANGAR_SYNC_PAYLOAD_VERSION,
        payload,
        deviceId: upgrades.deviceId,
        force: options?.force ?? false,
      }),
    });

    const result = await response.json() as HangarSyncResponse;
    if (!response.ok) {
      const error = new Error(result.message || 'Failed to save hangar sync') as Error & {
        info?: HangarSyncResponse;
        status?: number;
      };
      error.info = result;
      error.status = response.status;
      throw error;
    }

    return result;
  }, [currentRecord?.hangarUpdatedAt, currentRecord?.revision, upgrades.deviceId, upgrades.remoteHangarUpdatedAt, upgrades.syncRevision, user.token]);

  const resolveConflictUseRemote = useCallback(async () => {
    if (!pendingConflict) {
      return;
    }

    try {
      setStatus('syncing');

      let remotePayload = pendingConflict.payload;
      if (!remotePayload) {
        const fullResult = await fetchCurrentSnapshot();
        remotePayload = fullResult?.data?.payload ?? null;
      }

      if (!remotePayload) {
        throw new Error('Cloud hangar snapshot is unavailable');
      }

      applyRemoteSnapshot(remotePayload, pendingConflict.current);
      setPendingConflict(null);
      setStatus('idle');
      setLastError(null);
    } catch (error) {
      console.error('Failed to apply remote hangar snapshot after conflict:', error);
      setStatus('error');
      setLastError('Failed to load cloud hangar snapshot');
    }
  }, [applyRemoteSnapshot, fetchCurrentSnapshot, pendingConflict]);

  const resolveConflictKeepLocal = useCallback(async () => {
    if (!pendingConflict) {
      return;
    }

    try {
      setStatus('syncing');
      const result = await saveSnapshot(pendingConflict.localPayload, { force: true });

      if (result?.data?.current) {
        setCurrentRecord(result.data.current);
        dispatch(setHangarSyncRevision(result.data.current.revision));
        dispatch(setHangarRemoteVersion(result.data.current.hangarUpdatedAt));
        dispatch(setHangarLastSyncedVersion(pendingConflict.localPayload.hangarUpdatedAt ?? null));
        dispatch(setHangarLastSyncedAt(result.data.current.updatedAt));

        lastUploadedSignatureRef.current = getSnapshotSignature({
          ...pendingConflict.localPayload,
          syncUserId: user.id,
          syncRevision: result.data.current.revision,
          lastSyncedHangarUpdatedAt: result.data.current.hangarUpdatedAt,
          remoteHangarUpdatedAt: result.data.current.hangarUpdatedAt,
          lastSyncedAt: result.data.current.updatedAt,
        });
      }

      setPendingConflict(null);
      setStatus('idle');
      setLastError(null);
    } catch (error) {
      console.error('Failed to overwrite remote hangar sync after conflict:', error);
      setStatus('error');
      setLastError('Failed to overwrite remote hangar snapshot');
    }
  }, [dispatch, pendingConflict, saveSnapshot, user.id]);

  useEffect(() => {
    if (!isAuthenticated) {
      bootstrappedUserIdRef.current = null;
      clearAutoSyncTimer();
      setStatus('idle');
      setLastError(null);
      setCurrentRecord(null);
      setPendingConflict(null);
      lastUploadedSignatureRef.current = null;
      return;
    }

    if (bootstrappedUserIdRef.current === user.id) {
      return;
    }

    bootstrappedUserIdRef.current = user.id;
    dispatch(setHangarSyncUser(user.id));
    setActiveHangarStorageKey(user.id);

    const scopedState = loadScopedHangarState(user.id);
    const legacyState = loadLegacyHangarState();
    if (!scopedState && legacyState) {
      saveHangarState(legacyState, user.id);
    }

    const scopedSnapshot = JSON.parse(loadHangarState(user.id) || 'null') as HangarSyncSnapshot | null;
    applyLocalScopedSnapshot(scopedSnapshot);

    clearAutoSyncTimer();
    setCurrentRecord(null);
    setPendingConflict(null);
    setStatus('bootstrapping');
    setLastError(null);

    void (async () => {
      try {
        const metadata = await fetchMetadata();
        if (!metadata?.success || !metadata.data) {
          setStatus('idle');
          return;
        }

        const remoteRecord = metadata.data.current;
        setCurrentRecord(remoteRecord);
        dispatch(setHangarRemoteVersion(remoteRecord?.hangarUpdatedAt ?? null));

        if (remoteRecord?.revision) {
          dispatch(setHangarSyncRevision(remoteRecord.revision));
          dispatch(setHangarLastSyncedAt(remoteRecord.updatedAt));
        }

        const currentLocalSnapshot = JSON.parse(loadHangarState(user.id) || 'null') as HangarSyncSnapshot | null;
        const localSnapshot = currentLocalSnapshot ?? scopedSnapshot;
        const localHangarUpdatedAt = localSnapshot?.hangarUpdatedAt ?? null;
        const lastSyncedHangarUpdatedAt = localSnapshot?.lastSyncedHangarUpdatedAt ?? null;
        const remoteHangarUpdatedAt = remoteRecord?.hangarUpdatedAt ?? null;

        if (!remoteHangarUpdatedAt || remoteHangarUpdatedAt === lastSyncedHangarUpdatedAt) {
          setStatus('idle');
          return;
        }

        const hasLocalUnsyncedChanges = Boolean(
          localHangarUpdatedAt
          && localHangarUpdatedAt !== lastSyncedHangarUpdatedAt
          && localHangarUpdatedAt !== remoteHangarUpdatedAt,
        );

        if (hasLocalUnsyncedChanges) {
          const conflictLocalPayload = localSnapshot ?? {
            ...latestSnapshotRef.current,
            syncUserId: user.id,
          };

          setPendingConflict({
            current: remoteRecord,
            payload: null,
            localPayload: {
              ...conflictLocalPayload,
              syncUserId: user.id,
            },
          });
          setStatus('conflict');
          return;
        }

        const fullResult = await fetchCurrentSnapshot();
        if (fullResult?.success && fullResult.data?.payload && fullResult.data.current) {
          applyRemoteSnapshot(fullResult.data.payload, fullResult.data.current);
          dispatch(setHangarLastSyncedVersion(fullResult.data.current.hangarUpdatedAt));
          dispatch(setHangarRemoteVersion(fullResult.data.current.hangarUpdatedAt));
          dispatch(setHangarLastSyncedAt(fullResult.data.current.updatedAt));
        }

        setStatus('idle');
      } catch (error) {
        console.error('Failed to bootstrap hangar sync:', error);
        setStatus('error');
        setLastError('Failed to bootstrap hangar sync');
      }
    })();
  }, [
    applyLocalScopedSnapshot,
    applyRemoteSnapshot,
    clearAutoSyncTimer,
    dispatch,
    fetchCurrentSnapshot,
    fetchMetadata,
    isAuthenticated,
    user.id,
  ]);

  useEffect(() => {
    if (!isAuthenticated || bootstrappedUserIdRef.current !== user.id) {
      return;
    }

    if (!isSyncEnabled || !canSyncPayload(snapshot)) {
      clearAutoSyncTimer();
      return;
    }

    if (skipNextAutoSyncRef.current) {
      skipNextAutoSyncRef.current = false;
      return;
    }

    if (status === 'bootstrapping' || status === 'conflict') {
      return;
    }

    if (snapshot.hangarUpdatedAt === snapshot.lastSyncedHangarUpdatedAt) {
      return;
    }

    if (lastUploadedSignatureRef.current === snapshotSignature) {
      return;
    }

    clearAutoSyncTimer();
    autoSyncTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          setStatus('syncing');
          setLastError(null);

          const result = await saveSnapshot({
            ...snapshot,
            syncUserId: user.id,
          });

          if (!result?.data?.current) {
            setStatus('idle');
            return;
          }

          setCurrentRecord(result.data.current);
          dispatch(setHangarSyncRevision(result.data.current.revision));
          dispatch(setHangarRemoteVersion(result.data.current.hangarUpdatedAt));
          dispatch(setHangarLastSyncedVersion(snapshot.hangarUpdatedAt ?? null));
          dispatch(setHangarLastSyncedAt(result.data.current.updatedAt));

          lastUploadedSignatureRef.current = getSnapshotSignature({
            ...snapshot,
            syncUserId: user.id,
            syncRevision: result.data.current.revision,
            lastSyncedHangarUpdatedAt: result.data.current.hangarUpdatedAt,
            remoteHangarUpdatedAt: result.data.current.hangarUpdatedAt,
            lastSyncedAt: result.data.current.updatedAt,
          });

          setStatus('idle');
        } catch (error) {
          const conflict = error as Error & { info?: HangarSyncResponse; status?: number };
          if (conflict.status === 409 && conflict.info?.data) {
            setPendingConflict({
              current: conflict.info.data.current,
              payload: conflict.info.data.payload ?? null,
              localPayload: {
                ...snapshot,
                syncUserId: user.id,
              },
            });
            setStatus('conflict');
            return;
          }

          console.error('Automatic hangar sync failed:', error);
          setStatus('error');
          setLastError('Automatic hangar sync failed');
        }
      })();
    }, AUTO_SYNC_DEBOUNCE_MS);

    return clearAutoSyncTimer;
  }, [
    clearAutoSyncTimer,
    dispatch,
    isAuthenticated,
    isSyncEnabled,
    saveSnapshot,
    snapshot,
    snapshotSignature,
    status,
    user.id,
  ]);

  return {
    status,
    lastError,
    currentRecord,
    pendingConflict,
    isSyncEnabled,
    resolveConflictUseRemote,
    resolveConflictKeepLocal,
  };
}
