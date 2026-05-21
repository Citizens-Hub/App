import { Add, DeleteOutline, PlayArrow, Refresh, Stop } from '@mui/icons-material';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useSelector } from 'react-redux';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { useApi } from '@/hooks';
import type { RootState } from '@/store';
import type { ShipsData } from '@/types';
import { requestViaExtension } from '@/utils/extensionHttpRequest';

const RSI_GRAPHQL_URL = 'https://robertsspaceindustries.com/graphql';
const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
const TOKEN_MANAGER_REQUEST_API_PATH = '/api/admin/rsi/token-manager/request';
const TOKEN_MANAGER_TOKEN_API_PATH = '/api/admin/rsi/token-manager/token';
const RESPONSE_TIMEOUT_MS = 20_000;
const STORE_FRONT = 'pledge';
const LISTING_PAGE_LIMIT = 20;
const DEFAULT_POLL_INTERVAL_MS = '2500';
const MAX_LOG_ENTRIES = 200;
const TOKEN_REQUEST_TIMEOUT_MS = 50_000;
const TOKEN_MANAGER_POLL_INTERVAL_MS = 500;
const SCHEDULED_TOKEN_PREFETCH_LEAD_MS = 5_000;
const PREFETCHED_TOKEN_TTL_MS = 60_000;
const SCHEDULED_TASKS_STORAGE_KEY = 'admin-rsi-order-automation-scheduled-tasks-v1';
const TOKEN_MANAGER_SECRET_STORAGE_KEY = 'admin-rsi-order-automation-token-manager-secret-v1';
const PREFETCHED_TOKEN_STORAGE_KEY = 'admin-rsi-order-automation-prefetched-token-v1';

type FlashState = {
  severity: 'success' | 'error' | 'warning';
  text: string;
} | null;

type AutomationPhase = 'idle' | 'running' | 'success' | 'failure' | 'stopped';
type AutomationTrigger = 'manual' | 'scheduled';
type AutomationStep =
  | 'idle'
  | 'requestingToken'
  | 'matching'
  | 'addingToCart'
  | 'addingCredit'
  | 'movingNext'
  | 'loadingAddresses'
  | 'assigningAddress'
  | 'validatingCart'
  | 'trackingPurchase';
type AutomationExecutionStep = Exclude<AutomationStep, 'idle' | 'requestingToken'>;
type AutomationStartStep = Exclude<AutomationExecutionStep, 'trackingPurchase'>;

type LogLevel = 'info' | 'success' | 'warning' | 'error';

type LogEntry = {
  id: string;
  at: string;
  level: LogLevel;
  text: string;
};

type RunSummary = {
  targetShipName: string;
  matchedShipName: string | null;
  matchedSkuId: string | null;
  matchedSlug: string | null;
  matchedPriceCents: number | null;
  creditsAppliedCents: number | null;
  addressId: string | null;
  addressLabel: string | null;
  orderSlug: string | null;
  trackingTotalCents: number | null;
};

type GraphqlResponseEnvelope = {
  ok?: boolean;
  status?: number;
  statusText?: string;
  data?: unknown;
};

type GraphqlError = {
  message?: string;
  code?: string;
};

type TokenManagerResponse = {
  status?: number;
  request?: string;
};

type GraphqlBatchItem<TData> = {
  data?: TData;
  errors?: GraphqlError[];
};

type BrowseListingResponse = {
  store?: {
    listing?: {
      resources?: Array<BrowseShipResource | null> | null;
      totalCount?: number | null;
    } | null;
  } | null;
};

type BrowseShipResource = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  title?: string | null;
  isWarbond?: boolean | null;
  nativePrice?: {
    amount?: number | null;
  } | null;
  price?: {
    amount?: number | null;
  } | null;
};

type AddCartResponse = {
  store?: {
    cart?: {
      mutations?: {
        addMany?: {
          count?: number | null;
          resources?: Array<{
            id?: string | null;
            name?: string | null;
            title?: string | null;
            nativePrice?: {
              amount?: number | null;
            } | null;
          } | null> | null;
        } | null;
      } | null;
    } | null;
  } | null;
};

type AddCreditResponse = {
  store?: {
    cart?: {
      mutations?: {
        credit_update?: boolean | null;
      } | null;
      totals?: {
        credits?: {
          amount?: number | null;
        } | null;
      } | null;
    } | null;
    order?: {
      slug?: string | null;
    } | null;
  } | null;
};

type NextStepResponse = {
  store?: {
    cart?: {
      mutations?: {
        flow?: {
          moveNext?: boolean | null;
        } | null;
      } | null;
    } | null;
    order?: {
      slug?: string | null;
    } | null;
  } | null;
};

type AddressBookResponse = {
  store?: {
    addressBook?: Array<AddressRecord | null> | null;
    cart?: {
      shippingRequired?: boolean | null;
      billingRequired?: boolean | null;
    } | null;
  } | null;
};

type AddressRecord = {
  id?: string | null;
  defaultBilling?: boolean | null;
  firstname?: string | null;
  lastname?: string | null;
  addressLine?: string | null;
  city?: string | null;
  country?: {
    name?: string | null;
  } | null;
  region?: {
    name?: string | null;
  } | null;
};

type AssignAddressResponse = {
  store?: {
    cart?: {
      mutations?: {
        assignAddresses?: boolean | null;
      } | null;
    } | null;
  } | null;
};

type ValidateCartResponse = {
  store?: {
    cart?: {
      mutations?: {
        validate?: string | null;
      } | null;
    } | null;
    order?: {
      slug?: string | null;
    } | null;
  } | null;
};

type PurchaseTrackingResponse = {
  order?: {
    totals?: {
      total?: number | null;
      credits?: {
        amount?: number | null;
      } | null;
    } | null;
    order?: {
      slug?: string | null;
    } | null;
  } | null;
};

type MatchedSku = {
  skuId: string;
  slug: string | null;
  title: string;
  priceCents: number;
};

type TokenBridgeStatus = 'idle' | 'requesting' | 'ready' | 'error';
type PrefetchedTokenState = {
  token: string;
  receivedAt: string;
};
type AutomationPlanFields = {
  shipName: string;
  mark: string;
  pollIntervalInput: string;
  startStep: AutomationStartStep;
  endStep: AutomationExecutionStep;
};
type AutomationRunPlan = {
  shipName: string;
  mark: string;
  pollIntervalMs: number | null;
  startStep: AutomationStartStep;
  endStep: AutomationExecutionStep;
};
type RunPlanBuildResult =
  | {
    ok: true;
    input: AutomationRunPlan;
  }
  | {
    ok: false;
    error: string;
  };
type ScheduledTask = AutomationPlanFields & {
  id: string;
  name: string;
  enabled: boolean;
  scheduleTimeInput: string;
  updatedAt: string;
};
type AddressSelectionContext = {
  selectedAddress: AddressRecord | null;
  shippingRequired: boolean;
  billingRequired: boolean;
};
type AutomationRuntimeContext = {
  matchedSku: MatchedSku | null;
  appliedCreditsCents: number | null;
  orderSlug: string | null;
  addressSelection: AddressSelectionContext | null;
};
type StartAutomationRequest = {
  trigger: AutomationTrigger;
  plan: AutomationRunPlan;
  label?: string | null;
  scheduledTaskContext?: {
    taskId: string;
    laterTaskIds: string[];
  } | null;
};

class StopRequestedError extends Error {
  constructor() {
    super('Automation stopped by user.');
    this.name = 'StopRequestedError';
  }
}

const EXECUTION_STEPS: AutomationExecutionStep[] = [
  'matching',
  'addingToCart',
  'addingCredit',
  'movingNext',
  'loadingAddresses',
  'assigningAddress',
  'validatingCart',
  'trackingPurchase',
];
const DEFAULT_START_STEP: AutomationStartStep = 'matching';
const DEFAULT_END_STEP: AutomationExecutionStep = 'trackingPurchase';

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isAutomationExecutionStep(value: unknown): value is AutomationExecutionStep {
  return typeof value === 'string' && EXECUTION_STEPS.includes(value as AutomationExecutionStep);
}

function isAutomationStartStep(value: unknown): value is AutomationStartStep {
  return isAutomationExecutionStep(value) && value !== 'trackingPurchase';
}

function getAutomationStepIndex(step: AutomationExecutionStep): number {
  return EXECUTION_STEPS.indexOf(step);
}

function rangeIncludesStep(
  startStep: AutomationStartStep,
  endStep: AutomationExecutionStep,
  step: AutomationExecutionStep,
): boolean {
  const startIndex = getAutomationStepIndex(startStep);
  const endIndex = getAutomationStepIndex(endStep);
  const targetIndex = getAutomationStepIndex(step);
  return targetIndex >= startIndex && targetIndex <= endIndex;
}

function planNeedsShipName(startStep: AutomationStartStep): boolean {
  return getAutomationStepIndex(startStep) <= getAutomationStepIndex('addingCredit');
}

function planNeedsPollInterval(startStep: AutomationStartStep): boolean {
  return getAutomationStepIndex(startStep) <= getAutomationStepIndex('addingToCart');
}

function planNeedsValidateInputs(endStep: AutomationExecutionStep): boolean {
  return getAutomationStepIndex(endStep) >= getAutomationStepIndex('validatingCart');
}

function normalizeEndStep(startStep: AutomationStartStep, endStep: unknown): AutomationExecutionStep {
  if (!isAutomationExecutionStep(endStep)) {
    return DEFAULT_END_STEP;
  }

  return getAutomationStepIndex(endStep) < getAutomationStepIndex(startStep)
    ? DEFAULT_END_STEP
    : endStep;
}

function isPrefetchedTokenFresh(prefetchedToken: PrefetchedTokenState, nowMs: number = Date.now()): boolean {
  const receivedAtMs = new Date(prefetchedToken.receivedAt).getTime();
  if (!Number.isFinite(receivedAtMs)) {
    return false;
  }

  return nowMs - receivedAtMs <= PREFETCHED_TOKEN_TTL_MS;
}

function readStoredSecretKey(): string {
  try {
    return localStorage.getItem(TOKEN_MANAGER_SECRET_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeStoredSecretKey(secretKey: string) {
  try {
    const trimmed = secretKey.trim();
    if (!trimmed) {
      localStorage.removeItem(TOKEN_MANAGER_SECRET_STORAGE_KEY);
      return;
    }

    localStorage.setItem(TOKEN_MANAGER_SECRET_STORAGE_KEY, trimmed);
  } catch {
    // Ignore localStorage failures and keep the current session usable.
  }
}

function readStoredPrefetchedToken(): PrefetchedTokenState | null {
  try {
    const raw = localStorage.getItem(PREFETCHED_TOKEN_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      localStorage.removeItem(PREFETCHED_TOKEN_STORAGE_KEY);
      return null;
    }

    const token = typeof parsed.token === 'string' ? parsed.token.trim() : '';
    const receivedAt = typeof parsed.receivedAt === 'string' ? parsed.receivedAt : '';
    if (!token || !receivedAt) {
      localStorage.removeItem(PREFETCHED_TOKEN_STORAGE_KEY);
      return null;
    }

    const prefetchedToken = { token, receivedAt };
    if (!isPrefetchedTokenFresh(prefetchedToken)) {
      localStorage.removeItem(PREFETCHED_TOKEN_STORAGE_KEY);
      return null;
    }

    return prefetchedToken;
  } catch {
    return null;
  }
}

function writeStoredPrefetchedToken(prefetchedToken: PrefetchedTokenState | null) {
  try {
    if (!prefetchedToken) {
      localStorage.removeItem(PREFETCHED_TOKEN_STORAGE_KEY);
      return;
    }

    localStorage.setItem(PREFETCHED_TOKEN_STORAGE_KEY, JSON.stringify(prefetchedToken));
  } catch {
    // Ignore localStorage failures and keep the current session usable.
  }
}

function parseScheduledTasks(): ScheduledTask[] {
  try {
    const raw = localStorage.getItem(SCHEDULED_TASKS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }

      const id = typeof entry.id === 'string' ? entry.id : '';
      const name = typeof entry.name === 'string' ? entry.name : '';
      const enabled = typeof entry.enabled === 'boolean' ? entry.enabled : true;
      const scheduleTimeInput = typeof entry.scheduleTimeInput === 'string' ? entry.scheduleTimeInput : '00:00';
      const shipName = typeof entry.shipName === 'string' ? entry.shipName : '';
      const mark = typeof entry.mark === 'string' ? entry.mark : '';
      const pollIntervalInput = typeof entry.pollIntervalInput === 'string' ? entry.pollIntervalInput : DEFAULT_POLL_INTERVAL_MS;
      const startStep = isAutomationStartStep(entry.startStep) ? entry.startStep : DEFAULT_START_STEP;
      const endStep = normalizeEndStep(startStep, entry.endStep);
      const updatedAt = typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date(0).toISOString();

      if (!id || !name) {
        return [];
      }

      return [{
        id,
        name,
        enabled,
        scheduleTimeInput,
        shipName,
        mark,
        pollIntervalInput,
        startStep,
        endStep,
        updatedAt,
      }];
    });
  } catch {
    return [];
  }
}

function writeScheduledTasks(tasks: ScheduledTask[]) {
  try {
    localStorage.setItem(SCHEDULED_TASKS_STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // Ignore localStorage failures and keep the current session usable.
  }
}

function getTaskNextRunAt(task: ScheduledTask, now: Date = new Date()): Date | null {
  if (!task.enabled) {
    return null;
  }

  return getNextScheduledRunAt(task.scheduleTimeInput, now);
}

function getSubsequentScheduledTaskIds(
  entries: Array<{
    task: ScheduledTask;
    nextRunAtIso: string | null;
  }>,
  currentTaskId: string,
): string[] {
  const queue = entries
    .map((entry, index) => ({
      taskId: entry.task.id,
      sortIndex: index,
      nextRunAtMs: entry.nextRunAtIso ? new Date(entry.nextRunAtIso).getTime() : NaN,
    }))
    .filter((entry) => Number.isFinite(entry.nextRunAtMs))
    .sort((left, right) => left.nextRunAtMs - right.nextRunAtMs || left.sortIndex - right.sortIndex);

  const currentIndex = queue.findIndex((entry) => entry.taskId === currentTaskId);
  if (currentIndex < 0) {
    return [];
  }

  return queue.slice(currentIndex + 1).map((entry) => entry.taskId);
}

function createDefaultScheduledTask(index: number): ScheduledTask {
  return {
    id: createId(),
    name: `Task ${index}`,
    enabled: true,
    scheduleTimeInput: '00:00',
    shipName: '',
    mark: '',
    pollIntervalInput: DEFAULT_POLL_INTERVAL_MS,
    startStep: DEFAULT_START_STEP,
    endStep: DEFAULT_END_STEP,
    updatedAt: new Date().toISOString(),
  };
}

function formatStepLabel(step: AutomationExecutionStep | AutomationStartStep, intl: ReturnType<typeof useIntl>) {
  switch (step) {
    case 'matching':
      return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.matching', defaultMessage: 'Matching listing' });
    case 'addingToCart':
      return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.addingToCart', defaultMessage: 'Adding to cart' });
    case 'addingCredit':
      return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.addingCredit', defaultMessage: 'Adding credit' });
    case 'movingNext':
      return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.movingNext', defaultMessage: 'Advancing checkout' });
    case 'loadingAddresses':
      return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.loadingAddresses', defaultMessage: 'Loading addresses' });
    case 'assigningAddress':
      return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.assigningAddress', defaultMessage: 'Assigning address' });
    case 'validatingCart':
      return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.validatingCart', defaultMessage: 'Validating cart' });
    case 'trackingPurchase':
      return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.trackingPurchase', defaultMessage: 'Purchase tracking' });
    default:
      return step;
  }
}

function normalizeShipName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeLooseShipName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function pickString(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function formatTimestamp(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatUsdCents(value: number | null | undefined, locale: string): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
  }).format(value / 100);
}

function getPhaseColor(phase: AutomationPhase): 'default' | 'success' | 'warning' | 'error' {
  switch (phase) {
    case 'success':
      return 'success';
    case 'failure':
      return 'error';
    case 'running':
    case 'stopped':
      return 'warning';
    default:
      return 'default';
  }
}

function getLogColor(level: LogLevel): string {
  switch (level) {
    case 'success':
      return 'success.main';
    case 'warning':
      return 'warning.main';
    case 'error':
      return 'error.main';
    default:
      return 'text.secondary';
  }
}

function formatGraphqlErrors(errors: GraphqlError[] | undefined): string {
  if (!errors || errors.length === 0) {
    return 'Unknown GraphQL error.';
  }

  return errors.map((entry) => {
    const code = entry.code?.trim();
    const message = entry.message?.trim();
    if (code && message) {
      return `${code}: ${message}`;
    }
    return message || code || 'Unknown GraphQL error.';
  }).join(' | ');
}

function isOutOfStockError(errors: GraphqlError[] | undefined): boolean {
  return (errors || []).some((entry) => {
    const message = entry.message?.toLowerCase() || '';
    return entry.code === 'TyOutOfStockException' || message.includes('out of stock');
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function parseDailyScheduleTime(value: string): { hours: number; minutes: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) {
    return null;
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
  };
}

function getNextScheduledRunAt(value: string, now: Date = new Date()): Date | null {
  const parsed = parseDailyScheduleTime(value);
  if (!parsed) {
    return null;
  }

  const next = new Date(now);
  next.setHours(parsed.hours, parsed.minutes, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
}

function chooseAddress(addresses: AddressRecord[]): AddressRecord | null {
  if (addresses.length === 0) {
    return null;
  }

  const defaultBilling = addresses.find((entry) => entry.defaultBilling);
  return defaultBilling || addresses[0];
}

function formatAddressLabel(address: AddressRecord): string {
  const fullName = [address.firstname, address.lastname].filter(Boolean).join(' ').trim();
  const location = [
    address.addressLine,
    address.city,
    address.region?.name,
    address.country?.name,
  ].filter((value): value is string => Boolean(value && value.trim())).join(' | ');

  return [fullName, location].filter(Boolean).join(' | ');
}

function formatTokenPreview(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length <= 16) {
    return trimmed;
  }

  return `${trimmed.slice(0, 8)}...${trimmed.slice(-6)}`;
}

async function fetchTokenManagerResponse(
  input: RequestInfo | URL,
  token: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<TokenManagerResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('Content-Type', 'application/json');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
      headers,
    });

    if (!response.ok) {
      let message = `Token manager proxy request failed with HTTP ${response.status}.`;
      try {
        const errorPayload = await response.json() as { message?: string };
        if (typeof errorPayload?.message === 'string' && errorPayload.message.trim()) {
          message = errorPayload.message.trim();
        }
      } catch {
        // Ignore JSON parsing errors and use the default message.
      }

      throw new Error(message);
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload)) {
      throw new Error('Token manager returned an invalid response payload.');
    }

    return {
      status: typeof payload.status === 'number' ? payload.status : undefined,
      request: typeof payload.request === 'string' ? payload.request : undefined,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Token manager request timed out.');
    }

    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    window.clearTimeout(timeout);
  }
}

const BROWSE_STANDALONE_SHIPS_QUERY = `
query GetBrowseSkusStandaloneShipByFilter($query: SearchQuery, $storeFront: String = "pledge") {
  store(browse: true, name: $storeFront) {
    listing: search(query: $query) {
      resources {
        id
        name
        title
        ... on TySku {
          slug
          isWarbond
          nativePrice {
            amount
          }
          price {
            amount
          }
        }
      }
      totalCount
    }
  }
}
`;

const ADD_CART_QUERY = `
mutation AddCartMultiItemMutation($query: [CartAddInput!], $storeFront: String = "pledge") {
  store(name: $storeFront) {
    cart {
      mutations {
        addMany(query: $query) {
          count
          resources {
            id
            ... on TySku {
              name
              title
              nativePrice {
                amount
              }
            }
          }
        }
      }
    }
  }
}
`;

const ADD_CREDIT_QUERY = `
mutation AddCreditMutation($amount: Float!, $storeFront: String) {
  store(name: $storeFront) {
    cart {
      mutations {
        credit_update(amount: $amount)
      }
      totals {
        credits {
          amount
        }
      }
    }
    order {
      slug
    }
  }
}
`;

const NEXT_STEP_QUERY = `
mutation NextStepMutation($storeFront: String) {
  store(name: $storeFront) {
    cart {
      mutations {
        flow {
          moveNext
        }
      }
    }
    order {
      slug
    }
  }
}
`;

const ADDRESS_BOOK_QUERY = `
query AddressBookQuery($storeFront: String) {
  store(name: $storeFront) {
    addressBook {
      id
      defaultBilling
      firstname
      lastname
      addressLine
      city
      country {
        name
      }
      region {
        name
      }
    }
    cart {
      shippingRequired
      billingRequired
    }
  }
}
`;

const ASSIGN_ADDRESS_QUERY = `
mutation CartAddressAssignMutation($billing: ID, $shipping: ID, $storeFront: String) {
  store(name: $storeFront) {
    cart {
      mutations {
        assignAddresses(assign: {billing: $billing, shipping: $shipping})
      }
    }
  }
}
`;

const VALIDATE_CART_QUERY = `
mutation CartValidateCartMutation($storeFront: String, $token: String, $mark: String) {
  store(name: $storeFront) {
    cart {
      mutations {
        validate(mark: $mark, token: $token)
      }
    }
    order {
      slug
    }
  }
}
`;

const PURCHASE_TRACKING_QUERY = `
query PurchaseTrackingQuery($orderSlug: String!) {
  order(slug: $orderSlug) {
    totals {
      total
      credits {
        amount
      }
    }
    order {
      slug
    }
  }
}
`;

export default function AdminRsiOrderAutomation() {
  const intl = useIntl();
  const { user } = useSelector((state: RootState) => state.user);
  const isMountedRef = useRef(true);
  const stopRequestedRef = useRef(false);
  const runningRef = useRef(false);
  const scheduledPrefetchRunKeysRef = useRef(new Set<string>());
  const scheduledExecutionRunKeysRef = useRef(new Set<string>());
  const appendLogRef = useRef<((level: LogLevel, text: string) => void) | null>(null);
  const updatePrefetchedTokenRef = useRef<((nextToken: PrefetchedTokenState | null) => void) | null>(null);
  const requestCheckoutTokenFromTokenManagerRef = useRef<((secretKeyInput?: string) => Promise<string>) | null>(null);
  const startAutomationRef = useRef<((request: StartAutomationRequest) => Promise<void>) | null>(null);
  const buildRunPlanRef = useRef<((fields: AutomationPlanFields) => RunPlanBuildResult) | null>(null);
  const [manualPlanFields, setManualPlanFields] = useState<AutomationPlanFields>({
    shipName: '',
    mark: '',
    pollIntervalInput: DEFAULT_POLL_INTERVAL_MS,
    startStep: DEFAULT_START_STEP,
    endStep: DEFAULT_END_STEP,
  });
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>(() => parseScheduledTasks());
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [phase, setPhase] = useState<AutomationPhase>('idle');
  const [step, setStep] = useState<AutomationStep>('idle');
  const [stopRequested, setStopRequested] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<string | null>(null);
  const [tokenBridgeStatus, setTokenBridgeStatus] = useState<TokenBridgeStatus>('idle');
  const [tokenBridgeError, setTokenBridgeError] = useState('');
  const [tokenManagerSecret, setTokenManagerSecret] = useState(() => readStoredSecretKey());
  const [prefetchedToken, setPrefetchedToken] = useState<PrefetchedTokenState | null>(() => readStoredPrefetchedToken());
  const [lastTokenReceivedAt, setLastTokenReceivedAt] = useState<string | null>(null);
  const [lastTokenPreview, setLastTokenPreview] = useState('');
  const [lastScheduledTaskId, setLastScheduledTaskId] = useState<string | null>(null);

  const {
    data: shipsData,
    error: shipsError,
  } = useApi<ShipsData>('/api/ships', {
    revalidateOnFocus: false,
  });

  const shipOptions = useMemo(() => {
    const names = (shipsData?.data.ships || [])
      .map((ship) => ship.name.trim())
      .filter((name) => name.length > 0);

    return [...new Set(names)].sort((left, right) => left.localeCompare(right));
  }, [shipsData?.data.ships]);

  const running = phase === 'running';
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || intl.formatMessage({
    id: 'admin.rsiOrderAutomation.localTimeZoneFallback',
    defaultMessage: 'local browser time',
  });
  const taskScheduleSnapshots = useMemo(() => scheduledTasks.map((task) => {
    const nextRunAt = getTaskNextRunAt(task);
    const nextRunAtIso = nextRunAt ? nextRunAt.toISOString() : null;
    const countdownMs = nextRunAt ? Math.max(0, nextRunAt.getTime() - countdownNow) : null;

    return {
      task,
      nextRunAtIso,
      countdownMs,
      countdownLabel: countdownMs === null ? null : formatDuration(countdownMs),
    };
  }), [countdownNow, scheduledTasks]);
  const nextScheduledTaskSnapshot = taskScheduleSnapshots
    .filter((entry) => entry.nextRunAtIso)
    .sort((left, right) => new Date(left.nextRunAtIso || 0).getTime() - new Date(right.nextRunAtIso || 0).getTime())[0] || null;
  const scheduledTasksEnabled = scheduledTasks.some((task) => task.enabled);
  runningRef.current = running;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopRequestedRef.current = true;
    };
  }, []);

  const appendLog = (level: LogLevel, text: string) => {
    if (!isMountedRef.current) {
      return;
    }

    setLogs((current) => [
      ...current.slice(-(MAX_LOG_ENTRIES - 1)),
      {
        id: createId(),
        at: new Date().toISOString(),
        level,
        text,
      },
    ]);
  };
  appendLogRef.current = appendLog;

  const updatePrefetchedToken = (nextToken: PrefetchedTokenState | null) => {
    if (!isMountedRef.current) {
      return;
    }

    setPrefetchedToken(nextToken);
    writeStoredPrefetchedToken(nextToken);

    if (nextToken) {
      setLastTokenReceivedAt(nextToken.receivedAt);
      setLastTokenPreview(formatTokenPreview(nextToken.token));
      return;
    }

    setLastTokenPreview('');
  };
  updatePrefetchedTokenRef.current = updatePrefetchedToken;

  const updateSummary = (patch: Partial<RunSummary>) => {
    if (!isMountedRef.current) {
      return;
    }

    setSummary((current) => current ? { ...current, ...patch } : current);
  };

  const ensureNotStopped = () => {
    if (stopRequestedRef.current) {
      throw new StopRequestedError();
    }
  };

  const requestCheckoutTokenFromTokenManager = async (secretKeyInput?: string) => {
    ensureNotStopped();
    setTokenBridgeStatus('requesting');
    setTokenBridgeError('');

    try {
      const secretKey = (secretKeyInput ?? tokenManagerSecret).trim();
      if (!secretKey) {
        const message = intl.formatMessage({
          id: 'admin.rsiOrderAutomation.error.missingTokenManagerSecret',
          defaultMessage: 'Please enter the token manager secret key before requesting a checkout token.',
        });
        setTokenBridgeStatus('error');
        setTokenBridgeError(message);
        throw new Error(message);
      }

      const deadline = Date.now() + TOKEN_REQUEST_TIMEOUT_MS;
      const getRemainingTimeoutMs = () => Math.max(250, deadline - Date.now());

      if (!user.token) {
        throw new Error(intl.formatMessage({
          id: 'admin.rsiOrderAutomation.error.unauthorized',
          defaultMessage: 'Your admin session is missing. Please log in again and retry.',
        }));
      }

      const createResponse = await fetchTokenManagerResponse(
        `${API_BASE_URL}${TOKEN_MANAGER_REQUEST_API_PATH}`,
        user.token,
        getRemainingTimeoutMs(),
        {
          method: 'POST',
          body: JSON.stringify({ secretKey }),
        },
      );
      const requestId = createResponse.request?.trim() || '';

      if (createResponse.status !== 1 || !requestId) {
        const message = intl.formatMessage({
          id: 'admin.rsiOrderAutomation.error.tokenManagerCreateFailed',
          defaultMessage: 'Token manager did not accept the token request. Please verify the secret key and try again.',
        });
        setTokenBridgeStatus('error');
        setTokenBridgeError(message);
        throw new Error(message);
      }

      let token = '';

      while (!token) {
        ensureNotStopped();

        if (Date.now() > deadline) {
          throw new Error(intl.formatMessage({
            id: 'admin.rsiOrderAutomation.error.tokenRequestTimeout',
            defaultMessage: 'Token manager did not return a checkout token before the timeout expired.',
          }));
        }

        const tokenResponse = await fetchTokenManagerResponse(
          `${API_BASE_URL}${TOKEN_MANAGER_TOKEN_API_PATH}`,
          user.token,
          getRemainingTimeoutMs(),
          {
            method: 'POST',
            body: JSON.stringify({
              id: requestId,
              secretKey,
            }),
          },
        );

        if (tokenResponse.status === 1) {
          token = tokenResponse.request?.trim() || '';
          break;
        }

        await sleep(TOKEN_MANAGER_POLL_INTERVAL_MS);
      }

      if (!token) {
        const message = intl.formatMessage({
          id: 'admin.rsiOrderAutomation.error.tokenProviderEmpty',
          defaultMessage: 'Token manager responded successfully, but no token was returned.',
        });
        setTokenBridgeStatus('error');
        setTokenBridgeError(message);
        throw new Error(message);
      }

      setTokenBridgeStatus('ready');
      setTokenBridgeError('');
      const receivedAt = new Date().toISOString();
      setLastTokenReceivedAt(receivedAt);
      setLastTokenPreview(formatTokenPreview(token));
      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTokenBridgeStatus('error');
      setTokenBridgeError(message);
      throw error instanceof Error ? error : new Error(message);
    }
  };
  requestCheckoutTokenFromTokenManagerRef.current = requestCheckoutTokenFromTokenManager;

  const getFreshPrefetchedToken = () => {
    if (!prefetchedToken) {
      return null;
    }

    if (!isPrefetchedTokenFresh(prefetchedToken)) {
      updatePrefetchedToken(null);
      return null;
    }

    return prefetchedToken;
  };

  const consumeTokenForAutomation = async () => {
    const cachedToken = getFreshPrefetchedToken();
    if (cachedToken) {
      setTokenBridgeStatus('ready');
      setTokenBridgeError('');
      appendLog('info', `Reusing a locally cached checkout token from ${formatTimestamp(cachedToken.receivedAt, intl.locale)}.`);
      return {
        token: cachedToken.token,
        reused: true,
      };
    }

    appendLog('info', 'Requesting a checkout token from token manager.');
    const token = await requestCheckoutTokenFromTokenManager();
    return {
      token,
      reused: false,
    };
  };

  const updateManualPlanField = <TKey extends keyof AutomationPlanFields>(key: TKey, value: AutomationPlanFields[TKey]) => {
    setManualPlanFields((current) => {
      const next = { ...current, [key]: value };
      if (key === 'startStep' && getAutomationStepIndex(next.endStep) < getAutomationStepIndex(value as AutomationStartStep)) {
        next.endStep = DEFAULT_END_STEP;
      }
      return next;
    });
  };

  const updateScheduledTask = (taskId: string, patch: Partial<ScheduledTask>) => {
    setScheduledTasks((current) => current.map((task) => task.id === taskId
      ? {
        ...task,
        ...patch,
        endStep: patch.startStep
          ? normalizeEndStep(patch.startStep, patch.endStep ?? task.endStep)
          : patch.endStep
            ? normalizeEndStep(task.startStep, patch.endStep)
            : task.endStep,
        updatedAt: new Date().toISOString(),
      }
      : task));
  };

  const handleAddScheduledTask = () => {
    setScheduledTasks((current) => [...current, createDefaultScheduledTask(current.length + 1)]);
  };

  const handleDeleteScheduledTask = (taskId: string) => {
    setScheduledTasks((current) => current.filter((task) => task.id !== taskId));
    if (lastScheduledTaskId === taskId) {
      setLastScheduledTaskId(null);
    }
  };

  const sendRsiGraphql = async <TData,>(
    operationName: string,
    variables: Record<string, unknown>,
    query: string,
    options: {
      allowGraphqlErrors?: boolean;
    } = {},
  ): Promise<GraphqlBatchItem<TData>> => {
    const response = await requestViaExtension({
      url: RSI_GRAPHQL_URL,
      responseType: 'json',
      method: 'post',
      data: [
        {
          operationName,
          variables,
          query,
        },
      ],
    }, {
      timeoutMs: RESPONSE_TIMEOUT_MS,
      timeoutMessage: intl.formatMessage({
        id: 'admin.rsiOrderAutomation.error.timeout',
        defaultMessage: 'The browser extension request timed out. Make sure the Citizens Hub extension is installed, enabled, and logged in on robertsspaceindustries.com.',
      }),
      requestIdPrefix: `admin-rsi-order-automation-${operationName}`,
    }) as GraphqlResponseEnvelope;

    const batch = Array.isArray(response.data) ? response.data : [response.data];
    const item = batch[0] as GraphqlBatchItem<TData> | undefined;

    if (!item) {
      throw new Error(`${operationName} returned an empty GraphQL batch response.`);
    }

    if (!options.allowGraphqlErrors && item.errors?.length) {
      throw new Error(formatGraphqlErrors(item.errors));
    }

    return item;
  };

  const findMatchingSku = async (shipName: string): Promise<MatchedSku | null> => {
    const exactName = normalizeShipName(shipName);
    const looseName = normalizeLooseShipName(shipName);
    let page = 1;
    let totalCount = 0;

    while (true) {
      ensureNotStopped();

      const item = await sendRsiGraphql<BrowseListingResponse>(
        'GetBrowseSkusStandaloneShipByFilter',
        {
          storeFront: STORE_FRONT,
          query: {
            page,
            limit: LISTING_PAGE_LIMIT,
            skus: {
              filtersFromTags: {
                tagIdentifiers: [],
                facetIdentifiers: ['extras-standalone-ships'],
              },
              keywords: exactName,
              products: [72],
            },
            sort: {
              field: 'weight',
              direction: 'desc',
            },
          },
        },
        BROWSE_STANDALONE_SHIPS_QUERY,
      );

      const listing = item.data?.store?.listing;
      const resources = (listing?.resources || []).filter((entry): entry is BrowseShipResource => Boolean(entry));
      totalCount = listing?.totalCount || 0;

      for (const resource of resources) {
        if (resource.isWarbond !== false) {
          continue;
        }

        const trimPackName = (name: string) => {
          const nameInSplit = name.split("-");
          const tail = nameInSplit[nameInSplit.length-1];

          return name.replace(` -${tail}`, "")
        }

        const resourceTitle = trimPackName(pickString(resource.title, resource.name));
        if (!resource.id || !resourceTitle) {
          continue;
        }

        const resourceExact = normalizeShipName(resourceTitle);
        const resourceLoose = normalizeLooseShipName(resourceTitle);
        if (resourceExact !== exactName && resourceLoose !== looseName) {
          continue;
        }

        const priceCents = resource.price?.amount ?? resource.nativePrice?.amount ?? null;
        if (typeof priceCents !== 'number' || Number.isNaN(priceCents)) {
          continue;
        }

        return {
          skuId: resource.id,
          slug: resource.slug || null,
          title: resourceTitle,
          priceCents,
        };
      }

      if (page * LISTING_PAGE_LIMIT >= totalCount) {
        break;
      }

      page += 1;
    }

    return null;
  };

  const attemptAddToCart = async (skuId: string) => {
    const item = await sendRsiGraphql<AddCartResponse>(
      'AddCartMultiItemMutation',
      {
        storeFront: STORE_FRONT,
        query: [{ qty: 1, skuId }],
      },
      ADD_CART_QUERY,
      { allowGraphqlErrors: true },
    );

    if (item.errors?.length) {
      if (isOutOfStockError(item.errors)) {
        return {
          added: false,
          outOfStock: true,
          resourceName: null,
          priceCents: null,
        };
      }

      throw new Error(formatGraphqlErrors(item.errors));
    }

    const resource = item.data?.store?.cart?.mutations?.addMany?.resources?.[0];
    return {
      added: Boolean(item.data?.store?.cart?.mutations?.addMany?.count),
      outOfStock: false,
      resourceName: pickString(resource?.title, resource?.name) || null,
      priceCents: resource?.nativePrice?.amount ?? null,
    };
  };

  const resolveMatchedSkuOnce = async (shipName: string) => {
    ensureNotStopped();
    setStep('matching');
    appendLog('info', `Searching RSI standalone ship listings for "${shipName}".`);

    const matchedSku = await findMatchingSku(shipName);
    if (!matchedSku) {
      throw new Error(`No matching non-warbond listing was found for "${shipName}".`);
    }

    updateSummary({
      matchedShipName: matchedSku.title,
      matchedSkuId: matchedSku.skuId,
      matchedSlug: matchedSku.slug,
      matchedPriceCents: matchedSku.priceCents,
    });
    appendLog('success', `Matched SKU ${matchedSku.skuId} at ${formatUsdCents(matchedSku.priceCents, intl.locale)}.`);
    return matchedSku;
  };

  const pollForMatchedSku = async (shipName: string, pollIntervalMs: number) => {
    let attempt = 1;

    while (true) {
      ensureNotStopped();
      setStep('matching');
      appendLog('info', `Attempt ${attempt}: searching RSI standalone ship listings for "${shipName}".`);

      const matchedSku = await findMatchingSku(shipName);
      if (matchedSku) {
        updateSummary({
          matchedShipName: matchedSku.title,
          matchedSkuId: matchedSku.skuId,
          matchedSlug: matchedSku.slug,
          matchedPriceCents: matchedSku.priceCents,
        });
        appendLog('success', `Attempt ${attempt}: matched SKU ${matchedSku.skuId} at ${formatUsdCents(matchedSku.priceCents, intl.locale)}.`);
        return matchedSku;
      }

      appendLog('warning', `Attempt ${attempt}: no matching non-warbond listing found.`);
      await sleep(pollIntervalMs);
      attempt += 1;
    }
  };

  const addMatchedSkuToCartWithRetry = async (matchedSku: MatchedSku, pollIntervalMs: number) => {
    let attempt = 1;

    while (true) {
      ensureNotStopped();
      setStep('addingToCart');
      appendLog('info', `Attempt ${attempt}: adding SKU ${matchedSku.skuId} to the RSI cart.`);
      const addResult = await attemptAddToCart(matchedSku.skuId);
      if (addResult.added) {
        const resolvedPrice = addResult.priceCents ?? matchedSku.priceCents;
        const resolvedSku = { ...matchedSku, priceCents: resolvedPrice };
        updateSummary({
          matchedPriceCents: resolvedPrice,
        });
        appendLog('success', `Cart add succeeded for SKU ${resolvedSku.skuId}${addResult.resourceName ? ` (${addResult.resourceName})` : ''}.`);
        return resolvedSku;
      }

      appendLog('warning', `Attempt ${attempt}: SKU ${matchedSku.skuId} is out of stock. Waiting ${pollIntervalMs}ms before retry.`);
      await sleep(pollIntervalMs);
      attempt += 1;
    }
  };

  const loadAddressSelectionContext = async () => {
    ensureNotStopped();
    setStep('loadingAddresses');
    appendLog('info', 'Loading the RSI address book.');
    const addressItem = await sendRsiGraphql<AddressBookResponse>(
      'AddressBookQuery',
      {
        storeFront: STORE_FRONT,
      },
      ADDRESS_BOOK_QUERY,
    );

    const shippingRequired = Boolean(addressItem.data?.store?.cart?.shippingRequired);
    const billingRequired = Boolean(addressItem.data?.store?.cart?.billingRequired);
    const selectedAddress = chooseAddress(
      (addressItem.data?.store?.addressBook || []).filter((entry): entry is AddressRecord => Boolean(entry)),
    );

    if ((shippingRequired || billingRequired) && !selectedAddress?.id) {
      throw new Error('No address is available for the RSI checkout.');
    }

    if (selectedAddress?.id && (shippingRequired || billingRequired)) {
      const addressLabel = formatAddressLabel(selectedAddress);
      updateSummary({
        addressId: selectedAddress.id,
        addressLabel,
      });
      appendLog('info', `Using address ${selectedAddress.id}: ${addressLabel}.`);
    } else {
      appendLog('info', 'This checkout does not require billing or shipping addresses.');
    }

    return {
      selectedAddress,
      shippingRequired,
      billingRequired,
    } satisfies AddressSelectionContext;
  };

  const runAutomation = async (input: {
    plan: AutomationRunPlan;
    token: string | null;
  }) => {
    const runtime: AutomationRuntimeContext = {
      matchedSku: null,
      appliedCreditsCents: null,
      orderSlug: null,
      addressSelection: null,
    };
    const { plan } = input;

    if (plan.startStep === 'matching') {
      runtime.matchedSku = await pollForMatchedSku(plan.shipName, plan.pollIntervalMs ?? 0);
      if (plan.endStep === 'matching') {
        return;
      }
    }

    if (plan.startStep === 'addingToCart') {
      runtime.matchedSku = await resolveMatchedSkuOnce(plan.shipName);
    }

    if (rangeIncludesStep(plan.startStep, plan.endStep, 'addingToCart')) {
      if (!runtime.matchedSku || plan.pollIntervalMs === null) {
        throw new Error('Adding to cart requires a matched SKU and poll interval.');
      }

      runtime.matchedSku = await addMatchedSkuToCartWithRetry(runtime.matchedSku, plan.pollIntervalMs);
      if (plan.endStep === 'addingToCart') {
        return;
      }
    }

    if (plan.startStep === 'addingCredit' && !runtime.matchedSku) {
      runtime.matchedSku = await resolveMatchedSkuOnce(plan.shipName);
    }

    if (rangeIncludesStep(plan.startStep, plan.endStep, 'addingCredit')) {
      if (!runtime.matchedSku) {
        throw new Error('Adding credit requires a matched ship SKU.');
      }

      const creditAmount = Number((runtime.matchedSku.priceCents / 100).toFixed(2));
      setStep('addingCredit');
      appendLog('info', `Applying checkout credit ${creditAmount.toFixed(2)}.`);
      const creditItem = await sendRsiGraphql<AddCreditResponse>(
        'AddCreditMutation',
        {
          amount: creditAmount,
          storeFront: STORE_FRONT,
        },
        ADD_CREDIT_QUERY,
      );

      if (!creditItem.data?.store?.cart?.mutations?.credit_update) {
        throw new Error('RSI credit update returned false.');
      }

      runtime.appliedCreditsCents = creditItem.data?.store?.cart?.totals?.credits?.amount ?? runtime.matchedSku.priceCents;
      runtime.orderSlug = creditItem.data?.store?.order?.slug || runtime.orderSlug;
      updateSummary({
        orderSlug: runtime.orderSlug,
        creditsAppliedCents: runtime.appliedCreditsCents,
      });
      appendLog('success', 'Checkout credit applied successfully.');
      if (plan.endStep === 'addingCredit') {
        return;
      }
    }

    if (rangeIncludesStep(plan.startStep, plan.endStep, 'movingNext')) {
      ensureNotStopped();
      setStep('movingNext');
      appendLog('info', 'Advancing the checkout flow to the address step.');
      const nextItem = await sendRsiGraphql<NextStepResponse>(
        'NextStepMutation',
        {
          storeFront: STORE_FRONT,
        },
        NEXT_STEP_QUERY,
      );

      if (!nextItem.data?.store?.cart?.mutations?.flow?.moveNext) {
        throw new Error('RSI checkout flow did not move to the next step.');
      }

      runtime.orderSlug = nextItem.data?.store?.order?.slug || runtime.orderSlug;
      updateSummary({
        orderSlug: runtime.orderSlug,
      });
      appendLog('success', 'Checkout flow advanced successfully.');
      if (plan.endStep === 'movingNext') {
        return;
      }
    }

    if (plan.startStep === 'loadingAddresses' || plan.startStep === 'assigningAddress') {
      runtime.addressSelection = await loadAddressSelectionContext();
      if (plan.endStep === 'loadingAddresses') {
        return;
      }
    }

    if (rangeIncludesStep(plan.startStep, plan.endStep, 'assigningAddress')) {
      if (!runtime.addressSelection) {
        runtime.addressSelection = await loadAddressSelectionContext();
      }

      const { selectedAddress, shippingRequired, billingRequired } = runtime.addressSelection;
      if (selectedAddress?.id && (shippingRequired || billingRequired)) {
        ensureNotStopped();
        setStep('assigningAddress');
        const assignItem = await sendRsiGraphql<AssignAddressResponse>(
          'CartAddressAssignMutation',
          {
            billing: billingRequired ? selectedAddress.id : null,
            shipping: shippingRequired ? selectedAddress.id : null,
            storeFront: STORE_FRONT,
          },
          ASSIGN_ADDRESS_QUERY,
        );

        if (!assignItem.data?.store?.cart?.mutations?.assignAddresses) {
          throw new Error('RSI address assignment returned false.');
        }

        appendLog('success', 'Address assignment completed successfully.');
      }

      if (plan.endStep === 'assigningAddress') {
        return;
      }
    }

    if (rangeIncludesStep(plan.startStep, plan.endStep, 'validatingCart')) {
      if (!input.token || !plan.mark.trim()) {
        throw new Error('Cart validation requires a checkout token and validate mark.');
      }

      ensureNotStopped();
      setStep('validatingCart');
      appendLog('info', 'Validating the cart with the provided token and mark.');
      const validateItem = await sendRsiGraphql<ValidateCartResponse>(
        'CartValidateCartMutation',
        {
          token: input.token,
          mark: plan.mark,
          storeFront: STORE_FRONT,
        },
        VALIDATE_CART_QUERY,
      );

      const orderSlug = validateItem.data?.store?.cart?.mutations?.validate
        || validateItem.data?.store?.order?.slug
        || null;

      if (!orderSlug) {
        throw new Error('RSI cart validation did not return an order slug.');
      }

      runtime.orderSlug = orderSlug;
      updateSummary({
        orderSlug,
      });
      appendLog('success', `Cart validation succeeded with order slug ${orderSlug}.`);
      if (plan.endStep === 'validatingCart') {
        return;
      }
    }

    if (rangeIncludesStep(plan.startStep, plan.endStep, 'trackingPurchase')) {
      if (!runtime.orderSlug) {
        throw new Error('Purchase tracking requires an order slug from an earlier step.');
      }

      ensureNotStopped();
      setStep('trackingPurchase');
      appendLog('info', `Fetching purchase tracking for order ${runtime.orderSlug}.`);
      const trackingItem = await sendRsiGraphql<PurchaseTrackingResponse>(
        'PurchaseTrackingQuery',
        {
          orderSlug: runtime.orderSlug,
        },
        PURCHASE_TRACKING_QUERY,
      );

      const trackedOrderSlug = trackingItem.data?.order?.order?.slug || null;
      if (!trackedOrderSlug) {
        throw new Error('Purchase tracking did not return an order slug.');
      }

      updateSummary({
        orderSlug: trackedOrderSlug,
        trackingTotalCents: trackingItem.data?.order?.totals?.total ?? null,
        creditsAppliedCents: trackingItem.data?.order?.totals?.credits?.amount ?? runtime.appliedCreditsCents,
      });
      appendLog('success', `Purchase tracking completed for order ${trackedOrderSlug}.`);
    }
  };

  const buildRunPlan = (fields: AutomationPlanFields): RunPlanBuildResult => {
    const shipName = fields.shipName.trim();
    const mark = fields.mark.trim();
    const startStep = fields.startStep;
    const endStep = fields.endStep;
    const requiresShipName = planNeedsShipName(startStep);
    const requiresPollInterval = planNeedsPollInterval(startStep);
    const requiresValidateInputs = planNeedsValidateInputs(endStep);

    if (requiresShipName && !shipName) {
      return {
        ok: false,
        error: intl.formatMessage({
          id: 'admin.rsiOrderAutomation.error.missingShip',
          defaultMessage: 'Please enter the English ship name to match in the RSI store listing.',
        }),
      };
    }

    if (requiresValidateInputs && !mark) {
      return {
        ok: false,
        error: intl.formatMessage({
          id: 'admin.rsiOrderAutomation.error.missingValidateMark',
          defaultMessage: 'Please provide the validate mark value before starting the task.',
        }),
      };
    }

    const rawPollIntervalMs = Number(fields.pollIntervalInput.trim());
    const pollIntervalMs = requiresPollInterval ? rawPollIntervalMs : null;
    if (requiresPollInterval && (!Number.isFinite(rawPollIntervalMs) || rawPollIntervalMs < 500)) {
      return {
        ok: false,
        error: intl.formatMessage({
          id: 'admin.rsiOrderAutomation.error.invalidPollInterval',
          defaultMessage: 'The poll interval must be a number greater than or equal to 500ms.',
        }),
      };
    }

    return {
      ok: true,
      input: {
        shipName,
        mark,
        pollIntervalMs,
        startStep,
        endStep,
      },
    };
  };
  buildRunPlanRef.current = buildRunPlan;

  const startAutomation = async ({ trigger, plan, label, scheduledTaskContext = null }: StartAutomationRequest) => {
    if (runningRef.current) {
      if (trigger === 'scheduled') {
        appendLog('warning', 'The scheduled run was skipped because another automation run is already in progress.');
      }
      return;
    }

    runningRef.current = true;
    const { shipName } = plan;
    stopRequestedRef.current = false;
    setStopRequested(false);
    setFlash(null);
    setPhase('running');
    setStep('requestingToken');
    setLogs([]);
    setRunStartedAt(new Date().toISOString());
    setSummary({
      targetShipName: shipName,
      matchedShipName: null,
      matchedSkuId: null,
      matchedSlug: null,
      matchedPriceCents: null,
      creditsAppliedCents: null,
      addressId: null,
      addressLabel: null,
      orderSlug: null,
      trackingTotalCents: null,
    });
    appendLog(
      'info',
      trigger === 'scheduled'
        ? `Starting RSI auto checkout for "${label || shipName || 'scheduled task'}" from the daily schedule.`
        : `Starting RSI auto checkout for "${label || shipName || 'manual task'}".`,
    );

    try {
      const needsCheckoutToken = rangeIncludesStep(plan.startStep, plan.endStep, 'validatingCart');
      const tokenResult = needsCheckoutToken ? await consumeTokenForAutomation() : null;
      if (tokenResult) {
        appendLog(
          'success',
          tokenResult.reused
            ? `Reused checkout token (${formatTokenPreview(tokenResult.token)}).`
            : `Received checkout token (${formatTokenPreview(tokenResult.token)}).`,
        );
      } else {
        appendLog('info', 'This run does not include cart validation, so no checkout token is required.');
      }

      await runAutomation({
        plan,
        token: tokenResult?.token || null,
      });

      if (!isMountedRef.current) {
        return;
      }

      setPhase('success');
      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.rsiOrderAutomation.success.completed',
          defaultMessage: 'The RSI checkout automation completed successfully.',
        }),
      });

      if (trigger === 'scheduled' && scheduledTaskContext?.laterTaskIds.length) {
        const laterTaskIdSet = new Set(scheduledTaskContext.laterTaskIds);
        let removedCount = 0;

        setScheduledTasks((current) => current.filter((task) => {
          if (!laterTaskIdSet.has(task.id)) {
            return true;
          }

          removedCount += 1;
          return false;
        }));

        if (removedCount > 0) {
          appendLog('info', `Cleared ${removedCount} later scheduled task${removedCount === 1 ? '' : 's'} after the successful scheduled run.`);
        }
      }
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      if (error instanceof StopRequestedError) {
        setPhase('stopped');
        setFlash({
          severity: 'warning',
          text: intl.formatMessage({
            id: 'admin.rsiOrderAutomation.success.stopped',
            defaultMessage: 'The RSI checkout automation stopped after the current request finished.',
          }),
        });
        appendLog('warning', 'Automation stopped by the operator.');
      } else {
        const message = error instanceof Error ? error.message : String(error);
        setPhase('failure');
        setFlash({
          severity: 'error',
          text: message,
        });
        appendLog('error', message);
      }
    } finally {
      runningRef.current = false;
      if (isMountedRef.current) {
        stopRequestedRef.current = false;
        setStopRequested(false);
      }
    }
  };
  startAutomationRef.current = startAutomation;

  const handleStart = async () => {
    const result = buildRunPlan(manualPlanFields);
    if (!result.ok) {
      setFlash({
        severity: 'error',
        text: result.error,
      });
      return;
    }

    const plan = result.input;
    await startAutomation({
      trigger: 'manual',
      plan,
      label: plan.shipName || 'manual task',
    });
  };

  const handleStop = () => {
    if (!running || stopRequestedRef.current) {
      return;
    }

    stopRequestedRef.current = true;
    setStopRequested(true);
    appendLog('warning', 'Stop requested. The automation will stop after the current RSI request finishes.');
  };

  const handleRequestTokenNow = async () => {
    if (running || tokenBridgeStatus === 'requesting') {
      return;
    }

    setFlash(null);
    appendLog('info', 'Requesting a checkout token from token manager.');

    try {
      const token = await requestCheckoutTokenFromTokenManager();
      const nextToken = {
        token,
        receivedAt: new Date().toISOString(),
      };
      updatePrefetchedToken(nextToken);
      appendLog('success', `Received checkout token (${formatTokenPreview(token)}).`);
      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.rsiOrderAutomation.success.tokenReceived',
          defaultMessage: 'A checkout token was received from token manager and will be reused for up to 1 minute.',
        }),
      });
    } catch (error) {
      if (error instanceof StopRequestedError) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      appendLog('error', message);
      setFlash({
        severity: 'error',
        text: message,
      });
    }
  };

  useEffect(() => {
    writeScheduledTasks(scheduledTasks);
  }, [scheduledTasks]);

  useEffect(() => {
    writeStoredSecretKey(tokenManagerSecret);
  }, [tokenManagerSecret]);

  useEffect(() => {
    writeStoredPrefetchedToken(prefetchedToken);
  }, [prefetchedToken]);

  useEffect(() => {
    const cachedToken = readStoredPrefetchedToken();
    if (!cachedToken) {
      return;
    }

    setLastTokenReceivedAt(cachedToken.receivedAt);
    setLastTokenPreview(formatTokenPreview(cachedToken.token));
    setTokenBridgeStatus('ready');
  }, []);

  useEffect(() => {
    if (!scheduledTasksEnabled) {
      return undefined;
    }

    setCountdownNow(Date.now());
    const timer = window.setInterval(() => {
      if (!isMountedRef.current) {
        return;
      }

      setCountdownNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [scheduledTasksEnabled]);

  useEffect(() => {
    const timeouts = taskScheduleSnapshots.flatMap((entry) => {
      if (!entry.task.enabled || !entry.nextRunAtIso) {
        return [];
      }

      const planResult = buildRunPlanRef.current?.(entry.task);
      if (!planResult) {
        return [];
      }

      if (!planResult.ok) {
        return [];
      }

      const plan = planResult.input;
      const laterTaskIds = getSubsequentScheduledTaskIds(taskScheduleSnapshots, entry.task.id);
      const nextRunAtMs = new Date(entry.nextRunAtIso).getTime();
      const scheduledRunKey = `${entry.task.id}:${entry.nextRunAtIso}`;
      const prefetchTimeout = window.setTimeout(() => {
        if (!isMountedRef.current) {
          return;
        }

        if (!rangeIncludesStep(plan.startStep, plan.endStep, 'validatingCart')) {
          return;
        }

        if (runningRef.current) {
          return;
        }

        if (scheduledPrefetchRunKeysRef.current.has(scheduledRunKey)) {
          return;
        }
        scheduledPrefetchRunKeysRef.current.add(scheduledRunKey);

        appendLogRef.current?.('info', `Scheduled task "${entry.task.name}" is prefetching a checkout token 5 seconds before ${entry.task.scheduleTimeInput}.`);
        void requestCheckoutTokenFromTokenManagerRef.current?.(tokenManagerSecret)
          .then((token) => {
            if (!token) {
              return;
            }
            const nextToken = {
              token,
              receivedAt: new Date().toISOString(),
            };
            updatePrefetchedTokenRef.current?.(nextToken);
            appendLogRef.current?.('success', `Prefetched checkout token for scheduled task "${entry.task.name}" (${formatTokenPreview(token)}).`);
          })
          .catch((error) => {
            scheduledPrefetchRunKeysRef.current.delete(scheduledRunKey);
            if (error instanceof StopRequestedError) {
              return;
            }

            const message = error instanceof Error ? error.message : String(error);
            appendLogRef.current?.('error', `Scheduled token prefetch failed for "${entry.task.name}": ${message}`);
          });
      }, Math.max(0, nextRunAtMs - Date.now() - SCHEDULED_TOKEN_PREFETCH_LEAD_MS));

      const runTimeout = window.setTimeout(() => {
        if (!isMountedRef.current) {
          return;
        }

        if (scheduledExecutionRunKeysRef.current.has(scheduledRunKey)) {
          return;
        }
        scheduledExecutionRunKeysRef.current.add(scheduledRunKey);

        if (runningRef.current) {
          appendLogRef.current?.('warning', `Scheduled task "${entry.task.name}" at ${entry.task.scheduleTimeInput} was skipped because another automation run is already in progress.`);
        } else {
          appendLogRef.current?.('info', `Scheduled task "${entry.task.name}" triggered at ${entry.task.scheduleTimeInput}.`);
          setLastScheduledTaskId(entry.task.id);
          void startAutomationRef.current?.({
            trigger: 'scheduled',
            plan,
            label: entry.task.name,
            scheduledTaskContext: {
              taskId: entry.task.id,
              laterTaskIds,
            },
          });
        }
      }, Math.max(0, nextRunAtMs - Date.now()));

      return [prefetchTimeout, runTimeout];
    });

    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, [taskScheduleSnapshots, tokenManagerSecret]);

  const phaseLabel = (() => {
    switch (phase) {
      case 'running':
        return intl.formatMessage({ id: 'admin.rsiOrderAutomation.phase.running', defaultMessage: 'Running' });
      case 'success':
        return intl.formatMessage({ id: 'admin.rsiOrderAutomation.phase.success', defaultMessage: 'Success' });
      case 'failure':
        return intl.formatMessage({ id: 'admin.rsiOrderAutomation.phase.failure', defaultMessage: 'Failed' });
      case 'stopped':
        return intl.formatMessage({ id: 'admin.rsiOrderAutomation.phase.stopped', defaultMessage: 'Stopped' });
      default:
        return intl.formatMessage({ id: 'admin.rsiOrderAutomation.phase.idle', defaultMessage: 'Idle' });
    }
  })();

  const stepLabel = (() => {
    switch (step) {
      case 'requestingToken':
        return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.requestingToken', defaultMessage: 'Requesting token' });
      case 'matching':
        return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.matching', defaultMessage: 'Matching listing' });
      case 'addingToCart':
        return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.addingToCart', defaultMessage: 'Adding to cart' });
      case 'addingCredit':
        return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.addingCredit', defaultMessage: 'Adding credit' });
      case 'movingNext':
        return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.movingNext', defaultMessage: 'Advancing checkout' });
      case 'loadingAddresses':
        return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.loadingAddresses', defaultMessage: 'Loading addresses' });
      case 'assigningAddress':
        return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.assigningAddress', defaultMessage: 'Assigning address' });
      case 'validatingCart':
        return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.validatingCart', defaultMessage: 'Validating cart' });
      case 'trackingPurchase':
        return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.trackingPurchase', defaultMessage: 'Purchase tracking' });
      default:
        return intl.formatMessage({ id: 'admin.rsiOrderAutomation.step.idle', defaultMessage: 'Idle' });
    }
  })();

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5" gutterBottom>
          {intl.formatMessage({
            id: 'admin.rsiOrderAutomation.title',
            defaultMessage: 'RSI Auto Checkout',
          })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'admin.rsiOrderAutomation.description',
            defaultMessage: 'Poll RSI standalone ship listings through the browser extension, retry add-to-cart when the ship is out of stock, and complete the remaining checkout steps with per-run validate inputs.',
          })}
        </Typography>
      </Box>

      <Alert severity="info">
        {intl.formatMessage({
          id: 'admin.rsiOrderAutomation.requirements',
          defaultMessage: 'This tool runs entirely in the admin browser through the Citizens Hub extension. Make sure the extension is installed, enabled, and logged in on robertsspaceindustries.com before starting.',
        })}
      </Alert>

      <Alert severity="warning">
        {intl.formatMessage({
          id: 'admin.rsiOrderAutomation.warning.cart',
          defaultMessage: 'Use an empty RSI cart before starting. The automation applies credit based on the matched ship price and does not clear or roll back existing cart contents when you stop it.',
        })}
      </Alert>

      {flash ? <Alert severity={flash.severity}>{flash.text}</Alert> : null}
      {shipsError ? (
        <Alert severity="warning">
          {intl.formatMessage({
            id: 'admin.rsiOrderAutomation.warning.shipList',
            defaultMessage: 'The ship suggestion list failed to load. You can still enter the English ship name manually.',
          })}
        </Alert>
      ) : null}

      <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }} elevation={0}>
        <Stack spacing={2.5}>
          <Typography variant="h6">
            {intl.formatMessage({
              id: 'admin.rsiOrderAutomation.manualPlanTitle',
              defaultMessage: 'Manual run configuration',
            })}
          </Typography>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap={2}>
            <Autocomplete
              freeSolo
              value={manualPlanFields.shipName}
              options={shipOptions}
              onChange={(_, value) => updateManualPlanField('shipName', value || '')}
              inputValue={manualPlanFields.shipName}
              onInputChange={(_, value) => updateManualPlanField('shipName', value)}
              disabled={running}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={intl.formatMessage({
                    id: 'admin.rsiOrderAutomation.shipName',
                    defaultMessage: 'English ship name',
                  })}
                  placeholder={intl.formatMessage({
                    id: 'admin.rsiOrderAutomation.shipNamePlaceholder',
                    defaultMessage: 'e.g. Kraken',
                  })}
                  helperText={intl.formatMessage({
                    id: 'admin.rsiOrderAutomation.shipNameHelp',
                    defaultMessage: 'The RSI listing match is exact on the English ship title/name and ignores stock in the browse step.',
                  })}
                />
              )}
            />

            <TextField
              label={intl.formatMessage({
                id: 'admin.rsiOrderAutomation.pollInterval',
                defaultMessage: 'Poll interval (ms)',
              })}
              value={manualPlanFields.pollIntervalInput}
              onChange={(event) => updateManualPlanField('pollIntervalInput', event.target.value)}
              disabled={running}
              type="number"
              inputProps={{ min: 500, step: 100 }}
              helperText={intl.formatMessage({
                id: 'admin.rsiOrderAutomation.pollIntervalHelp',
                defaultMessage: 'Used between failed listing or add-to-cart attempts.',
              })}
            />
          </Box>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }} gap={2}>
            <TextField
              select
              label={intl.formatMessage({
                id: 'admin.rsiOrderAutomation.startStep',
                defaultMessage: 'Start step',
              })}
              value={manualPlanFields.startStep}
              onChange={(event) => updateManualPlanField('startStep', event.target.value as AutomationStartStep)}
              disabled={running}
            >
              {EXECUTION_STEPS.filter((step) => step !== 'trackingPurchase').map((step) => (
                <MenuItem key={step} value={step}>
                  {formatStepLabel(step, intl)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label={intl.formatMessage({
                id: 'admin.rsiOrderAutomation.endStep',
                defaultMessage: 'End step',
              })}
              value={manualPlanFields.endStep}
              onChange={(event) => updateManualPlanField('endStep', event.target.value as AutomationExecutionStep)}
              disabled={running}
            >
              {EXECUTION_STEPS.filter((step) => getAutomationStepIndex(step) >= getAutomationStepIndex(manualPlanFields.startStep)).map((step) => (
                <MenuItem key={step} value={step}>
                  {formatStepLabel(step, intl)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label={intl.formatMessage({
                id: 'admin.rsiOrderAutomation.validateMark',
                defaultMessage: 'Validate mark',
              })}
              value={manualPlanFields.mark}
              onChange={(event) => updateManualPlanField('mark', event.target.value)}
              disabled={running}
              autoComplete="off"
              helperText={intl.formatMessage({
                id: 'admin.rsiOrderAutomation.validateMarkHelp',
                defaultMessage: 'Provide the current mark value manually for this run only. It is not stored anywhere.',
              })}
            />
          </Box>

          <Alert severity="info">
            {intl.formatMessage({
              id: 'admin.rsiOrderAutomation.planRangeInfo',
              defaultMessage: 'Each run executes a continuous step range. Mid-flow ranges only work when the selected start step can rebuild the context it needs.',
            })}
          </Alert>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'minmax(0, 520px)' }} gap={2}>
            <TextField
              label={intl.formatMessage({
                id: 'admin.rsiOrderAutomation.tokenManagerSecret',
                defaultMessage: 'Token manager secret key',
              })}
              value={tokenManagerSecret}
              onChange={(event) => setTokenManagerSecret(event.target.value)}
              disabled={running}
              autoComplete="off"
              helperText={intl.formatMessage({
                id: 'admin.rsiOrderAutomation.tokenManagerSecretHelp',
                defaultMessage: 'Set manually by an admin. The secret key and the latest valid token are both stored in localStorage on this browser.',
              })}
            />
          </Box>

          <Paper sx={{ p: 2, border: '1px dashed', borderColor: 'divider' }} elevation={0}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                <Box>
                  <Typography variant="h6">
                    {intl.formatMessage({
                      id: 'admin.rsiOrderAutomation.scheduledTasksTitle',
                      defaultMessage: 'Scheduled tasks',
                    })}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {intl.formatMessage({
                      id: 'admin.rsiOrderAutomation.scheduledTasksHelp',
                      defaultMessage: 'Each task uses the local browser time zone and runs only while this page stays open.',
                    })}
                  </Typography>
                </Box>
                <Button variant="outlined" startIcon={<Add />} onClick={handleAddScheduledTask} disabled={running}>
                  {intl.formatMessage({
                    id: 'admin.rsiOrderAutomation.addScheduledTask',
                    defaultMessage: 'Add scheduled task',
                  })}
                </Button>
              </Stack>

              {scheduledTasks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {intl.formatMessage({
                    id: 'admin.rsiOrderAutomation.scheduledTasksEmpty',
                    defaultMessage: 'No scheduled tasks yet.',
                  })}
                </Typography>
              ) : (
                <Stack spacing={2}>
                  {taskScheduleSnapshots.map((entry, index) => (
                    <Paper key={entry.task.id} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }} elevation={0}>
                      <Stack spacing={2}>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                          <FormControlLabel
                            control={(
                              <Switch
                                checked={entry.task.enabled}
                                onChange={(event) => updateScheduledTask(entry.task.id, { enabled: event.target.checked })}
                              />
                            )}
                            label={entry.task.name}
                          />
                          <Button
                            variant="outlined"
                            color="inherit"
                            startIcon={<DeleteOutline />}
                            onClick={() => handleDeleteScheduledTask(entry.task.id)}
                            disabled={running}
                          >
                            {intl.formatMessage({
                              id: 'delete',
                              defaultMessage: 'Delete',
                            })}
                          </Button>
                        </Stack>

                        <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }} gap={2}>
                          <TextField
                            label={intl.formatMessage({
                              id: 'admin.rsiOrderAutomation.taskName',
                              defaultMessage: 'Task name',
                            })}
                            value={entry.task.name}
                            onChange={(event) => updateScheduledTask(entry.task.id, { name: event.target.value || `Task ${index + 1}` })}
                            disabled={running}
                          />
                          <TextField
                            label={intl.formatMessage({
                              id: 'admin.rsiOrderAutomation.scheduleTime',
                              defaultMessage: 'Daily start time',
                            })}
                            type="time"
                            value={entry.task.scheduleTimeInput}
                            onChange={(event) => updateScheduledTask(entry.task.id, { scheduleTimeInput: event.target.value })}
                            disabled={running}
                            error={!parseDailyScheduleTime(entry.task.scheduleTimeInput)}
                            inputProps={{ step: 60 }}
                          />
                          <TextField
                            label={intl.formatMessage({
                              id: 'admin.rsiOrderAutomation.pollInterval',
                              defaultMessage: 'Poll interval (ms)',
                            })}
                            value={entry.task.pollIntervalInput}
                            onChange={(event) => updateScheduledTask(entry.task.id, { pollIntervalInput: event.target.value })}
                            disabled={running}
                            type="number"
                            inputProps={{ min: 500, step: 100 }}
                          />
                        </Box>

                        <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }} gap={2}>
                          <Autocomplete
                            freeSolo
                            value={entry.task.shipName}
                            options={shipOptions}
                            onChange={(_, value) => updateScheduledTask(entry.task.id, { shipName: value || '' })}
                            inputValue={entry.task.shipName}
                            onInputChange={(_, value) => updateScheduledTask(entry.task.id, { shipName: value })}
                            disabled={running}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label={intl.formatMessage({
                                  id: 'admin.rsiOrderAutomation.shipName',
                                  defaultMessage: 'English ship name',
                                })}
                              />
                            )}
                          />
                          <TextField
                            select
                            label={intl.formatMessage({
                              id: 'admin.rsiOrderAutomation.startStep',
                              defaultMessage: 'Start step',
                            })}
                            value={entry.task.startStep}
                            onChange={(event) => updateScheduledTask(entry.task.id, { startStep: event.target.value as AutomationStartStep })}
                            disabled={running}
                          >
                            {EXECUTION_STEPS.filter((step) => step !== 'trackingPurchase').map((step) => (
                              <MenuItem key={step} value={step}>
                                {formatStepLabel(step, intl)}
                              </MenuItem>
                            ))}
                          </TextField>
                          <TextField
                            select
                            label={intl.formatMessage({
                              id: 'admin.rsiOrderAutomation.endStep',
                              defaultMessage: 'End step',
                            })}
                            value={entry.task.endStep}
                            onChange={(event) => updateScheduledTask(entry.task.id, { endStep: event.target.value as AutomationExecutionStep })}
                            disabled={running}
                          >
                            {EXECUTION_STEPS.filter((step) => getAutomationStepIndex(step) >= getAutomationStepIndex(entry.task.startStep)).map((step) => (
                              <MenuItem key={step} value={step}>
                                {formatStepLabel(step, intl)}
                              </MenuItem>
                            ))}
                          </TextField>
                        </Box>

                        <TextField
                          label={intl.formatMessage({
                            id: 'admin.rsiOrderAutomation.validateMark',
                            defaultMessage: 'Validate mark',
                          })}
                          value={entry.task.mark}
                          onChange={(event) => updateScheduledTask(entry.task.id, { mark: event.target.value })}
                          disabled={running}
                          autoComplete="off"
                        />

                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Chip
                            label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.scheduleStatus', defaultMessage: 'Schedule' })}: ${
                              entry.task.enabled
                                ? intl.formatMessage({ id: 'admin.rsiOrderAutomation.scheduleStatus.enabled', defaultMessage: 'Enabled' })
                                : intl.formatMessage({ id: 'admin.rsiOrderAutomation.scheduleStatus.disabled', defaultMessage: 'Disabled' })
                            }`}
                            size="small"
                            color={entry.task.enabled ? 'success' : 'default'}
                          />
                          {entry.nextRunAtIso ? (
                            <Chip
                              label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.nextRunAt', defaultMessage: 'Next run' })}: ${formatDateTime(entry.nextRunAtIso, intl.locale)}`}
                              size="small"
                            />
                          ) : null}
                          {entry.countdownLabel ? (
                            <Chip
                              label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.countdown', defaultMessage: 'Starts in' })}: ${entry.countdownLabel}`}
                              size="small"
                              color="warning"
                            />
                          ) : null}
                        </Stack>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'auto' }} gap={2} justifyContent="start">
            <Button
              variant="outlined"
              startIcon={tokenBridgeStatus === 'requesting' ? <CircularProgress size={16} color="inherit" /> : <Refresh />}
              disabled={running || tokenBridgeStatus === 'requesting'}
              onClick={() => void handleRequestTokenNow()}
            >
              {tokenBridgeStatus === 'requesting'
                ? intl.formatMessage({
                  id: 'admin.rsiOrderAutomation.requestingToken',
                  defaultMessage: 'Requesting token...',
                })
                : intl.formatMessage({
                  id: 'admin.rsiOrderAutomation.requestToken',
                  defaultMessage: 'Request token now',
                })}
            </Button>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenManagerSecretStatus', defaultMessage: 'Secret key' })}: ${
                tokenManagerSecret.trim()
                  ? intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenManagerSecretStatus.saved', defaultMessage: 'Saved' })
                  : intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenManagerSecretStatus.missing', defaultMessage: 'Missing' })
              }`}
              size="small"
              color={
                tokenManagerSecret.trim()
                  ? 'success'
                  : 'warning'
              }
            />
            <Chip
              label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenBridgeStatus', defaultMessage: 'Token manager' })}: ${
                tokenBridgeStatus === 'requesting'
                  ? intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenBridgeStatus.requesting', defaultMessage: 'Requesting' })
                  : tokenBridgeStatus === 'ready'
                    ? intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenBridgeStatus.ready', defaultMessage: 'Ready' })
                    : tokenBridgeStatus === 'error'
                      ? intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenBridgeStatus.error', defaultMessage: 'Error' })
                      : intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenBridgeStatus.idle', defaultMessage: 'Idle' })
              }`}
              size="small"
              color={
                tokenBridgeStatus === 'ready'
                  ? 'success'
                  : tokenBridgeStatus === 'error'
                    ? 'error'
                    : tokenBridgeStatus === 'requesting'
                      ? 'warning'
                    : 'default'
              }
            />
            {lastTokenReceivedAt ? (
              <Chip
                label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.lastTokenAt', defaultMessage: 'Last token' })}: ${formatTimestamp(lastTokenReceivedAt, intl.locale)}`}
                size="small"
              />
            ) : null}
            {lastTokenPreview ? (
              <Chip
                label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenPreview', defaultMessage: 'Preview' })}: ${lastTokenPreview}`}
                size="small"
              />
            ) : null}
          </Stack>

          {tokenBridgeError ? (
            <Alert severity="warning">
              {tokenBridgeError}
            </Alert>
          ) : null}

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <Button
              variant="contained"
              startIcon={running ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
              onClick={() => void handleStart()}
              disabled={running}
            >
              {running
                ? intl.formatMessage({
                  id: 'admin.rsiOrderAutomation.starting',
                  defaultMessage: 'Running...',
                })
                : intl.formatMessage({
                  id: 'admin.rsiOrderAutomation.start',
                  defaultMessage: 'Start automation',
                })}
            </Button>

            <Button
              variant="outlined"
              color="warning"
              startIcon={<Stop />}
              onClick={handleStop}
              disabled={!running || stopRequested}
            >
              {stopRequested
                ? intl.formatMessage({
                  id: 'admin.rsiOrderAutomation.stopRequested',
                  defaultMessage: 'Stop requested',
                })
                : intl.formatMessage({
                  id: 'admin.rsiOrderAutomation.stop',
                  defaultMessage: 'Stop after current request',
                })}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }} elevation={0}>
        <Stack spacing={2}>
          <Typography variant="h6">
            {intl.formatMessage({
              id: 'admin.rsiOrderAutomation.statusTitle',
              defaultMessage: 'Task status',
            })}
          </Typography>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.phase', defaultMessage: 'Phase' })}: ${phaseLabel}`}
              size="small"
              color={getPhaseColor(phase)}
            />
            <Chip
              label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.scheduleStatus', defaultMessage: 'Schedule' })}: ${
                scheduledTasksEnabled
                  ? intl.formatMessage({ id: 'admin.rsiOrderAutomation.scheduleStatus.enabled', defaultMessage: 'Enabled' })
                  : intl.formatMessage({ id: 'admin.rsiOrderAutomation.scheduleStatus.disabled', defaultMessage: 'Disabled' })
              }`}
              size="small"
              color={scheduledTasksEnabled ? 'success' : 'default'}
            />
            <Chip
              label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.step', defaultMessage: 'Step' })}: ${stepLabel}`}
              size="small"
            />
            {runStartedAt ? (
              <Chip
                label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.startedAt', defaultMessage: 'Started' })}: ${formatTimestamp(runStartedAt, intl.locale)}`}
                size="small"
              />
            ) : null}
            {nextScheduledTaskSnapshot?.nextRunAtIso ? (
              <Chip
                label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.nextRunAt', defaultMessage: 'Next run' })}: ${nextScheduledTaskSnapshot.task.name} · ${formatDateTime(nextScheduledTaskSnapshot.nextRunAtIso, intl.locale)}`}
                size="small"
              />
            ) : null}
            {nextScheduledTaskSnapshot?.countdownLabel ? (
              <Chip
                label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.countdown', defaultMessage: 'Starts in' })}: ${nextScheduledTaskSnapshot.countdownLabel}`}
                size="small"
                color="warning"
              />
            ) : null}
            {scheduledTasksEnabled ? (
              <Chip
                label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.scheduleTimeZone', defaultMessage: 'Time zone' })}: ${localTimeZone}`}
                size="small"
              />
            ) : null}
            {lastScheduledTaskId ? (
              <Chip
                label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.lastScheduledTask', defaultMessage: 'Last triggered task' })}: ${scheduledTasks.find((task) => task.id === lastScheduledTaskId)?.name || '-'}`}
                size="small"
              />
            ) : null}
          </Stack>

          {stopRequested ? (
            <Alert severity="warning">
              {intl.formatMessage({
                id: 'admin.rsiOrderAutomation.stopPending',
                defaultMessage: 'Stop has been requested. The current RSI request will finish, and no further requests will be sent afterward.',
              })}
            </Alert>
          ) : null}

          {summary ? (
            <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap={1.5}>
              <Typography variant="body2">
                <strong>{intl.formatMessage({ id: 'admin.rsiOrderAutomation.summary.targetShip', defaultMessage: 'Target ship' })}:</strong> {summary.targetShipName}
              </Typography>
              <Typography variant="body2">
                <strong>{intl.formatMessage({ id: 'admin.rsiOrderAutomation.summary.matchedSku', defaultMessage: 'Matched SKU' })}:</strong> {summary.matchedSkuId || '-'}
              </Typography>
              <Typography variant="body2">
                <strong>{intl.formatMessage({ id: 'admin.rsiOrderAutomation.summary.matchedShip', defaultMessage: 'Matched listing' })}:</strong> {summary.matchedShipName || '-'}
              </Typography>
              <Typography variant="body2">
                <strong>{intl.formatMessage({ id: 'admin.rsiOrderAutomation.summary.price', defaultMessage: 'Ship price' })}:</strong> {formatUsdCents(summary.matchedPriceCents, intl.locale)}
              </Typography>
              <Typography variant="body2">
                <strong>{intl.formatMessage({ id: 'admin.rsiOrderAutomation.summary.credits', defaultMessage: 'Applied credit' })}:</strong> {formatUsdCents(summary.creditsAppliedCents, intl.locale)}
              </Typography>
              <Typography variant="body2">
                <strong>{intl.formatMessage({ id: 'admin.rsiOrderAutomation.summary.address', defaultMessage: 'Chosen address' })}:</strong> {summary.addressLabel || '-'}
              </Typography>
              <Typography variant="body2">
                <strong>{intl.formatMessage({ id: 'admin.rsiOrderAutomation.summary.orderSlug', defaultMessage: 'Order slug' })}:</strong> {summary.orderSlug || '-'}
              </Typography>
              <Typography variant="body2">
                <strong>{intl.formatMessage({ id: 'admin.rsiOrderAutomation.summary.trackingTotal', defaultMessage: 'Tracking total' })}:</strong> {formatUsdCents(summary.trackingTotalCents, intl.locale)}
              </Typography>
            </Box>
          ) : null}
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }} elevation={0}>
        <Stack spacing={2}>
          <Typography variant="h6">
            {intl.formatMessage({
              id: 'admin.rsiOrderAutomation.logTitle',
              defaultMessage: 'Activity log',
            })}
          </Typography>

          {logs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({
                id: 'admin.rsiOrderAutomation.logEmpty',
                defaultMessage: 'No activity yet.',
              })}
            </Typography>
          ) : (
            <Stack
              spacing={0.75}
              sx={{
                maxHeight: 360,
                overflowY: 'auto',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                p: 1.5,
                backgroundColor: 'background.default',
              }}
            >
              {logs.map((entry) => (
                <Typography
                  key={entry.id}
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    color: getLogColor(entry.level),
                  }}
                >
                  [{formatTimestamp(entry.at, intl.locale)}] {entry.text}
                </Typography>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
