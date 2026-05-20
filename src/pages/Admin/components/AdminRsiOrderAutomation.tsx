import { PlayArrow, Refresh, Stop } from '@mui/icons-material';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { useApi } from '@/hooks';
import type { ShipsData } from '@/types';
import {
  requestTokenProviderStatusViaExtension,
  requestTokenViaExtension,
  requestViaExtension,
} from '@/utils/extensionHttpRequest';

const RSI_GRAPHQL_URL = 'https://robertsspaceindustries.com/graphql';
const RESPONSE_TIMEOUT_MS = 20_000;
const STORE_FRONT = 'pledge';
const LISTING_PAGE_LIMIT = 20;
const DEFAULT_POLL_INTERVAL_MS = '2500';
const MAX_LOG_ENTRIES = 200;
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_PROVIDER_STATUS_TIMEOUT_MS = 4_000;
const TOKEN_PROVIDER_STATUS_POLL_INTERVAL_MS = 10_000;
const CHECKOUT_RECAPTCHA_SITE_KEY = '6LerBOgUAAAAAKPg6vsAFPTN66Woz-jBClxdQU-o';
const CHECKOUT_RECAPTCHA_ACTION = 'checkout';
// const CHECKOUT_TOKEN_SOURCE = 'grecaptcha.enterprise.execute(..., { action: "checkout" })';

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
type TokenProviderStatus = 'idle' | 'checking' | 'online' | 'offline' | 'error';
type RunInput = {
  shipName: string;
  mark: string;
  pollIntervalMs: number;
};

class StopRequestedError extends Error {
  constructor() {
    super('Automation stopped by user.');
    this.name = 'StopRequestedError';
  }
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
  const isMountedRef = useRef(true);
  const stopRequestedRef = useRef(false);
  const runningRef = useRef(false);
  const appendLogRef = useRef<((level: LogLevel, text: string) => void) | null>(null);
  const startAutomationRef = useRef<((trigger: AutomationTrigger) => Promise<void>) | null>(null);
  const checkTokenProviderStatusRef = useRef<((mode?: 'manual' | 'poll') => Promise<void>) | null>(null);
  const [targetShipName, setTargetShipName] = useState('');
  const [validateMark, setValidateMark] = useState('');
  const [pollIntervalInput, setPollIntervalInput] = useState(DEFAULT_POLL_INTERVAL_MS);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleTimeInput, setScheduleTimeInput] = useState('00:00');
  const [nextScheduledAt, setNextScheduledAt] = useState<string | null>(null);
  const [scheduleRevision, setScheduleRevision] = useState(0);
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
  const [tokenProviderStatus, setTokenProviderStatus] = useState<TokenProviderStatus>('idle');
  const [tokenProviderError, setTokenProviderError] = useState('');
  const [tokenProviderCount, setTokenProviderCount] = useState(0);
  const [lastProviderCheckAt, setLastProviderCheckAt] = useState<string | null>(null);
  const [lastTokenReceivedAt, setLastTokenReceivedAt] = useState<string | null>(null);
  const [lastTokenPreview, setLastTokenPreview] = useState('');

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
  const scheduleTimeValid = Boolean(parseDailyScheduleTime(scheduleTimeInput));
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || intl.formatMessage({
    id: 'admin.rsiOrderAutomation.localTimeZoneFallback',
    defaultMessage: 'local browser time',
  });
  const nextScheduledTimestamp = nextScheduledAt ? new Date(nextScheduledAt).getTime() : NaN;
  const scheduleCountdown = Number.isFinite(nextScheduledTimestamp)
    ? Math.max(0, nextScheduledTimestamp - countdownNow)
    : null;
  const scheduleCountdownLabel = scheduleCountdown === null ? null : formatDuration(scheduleCountdown);
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

  const requestCheckoutTokenFromBridge = async () => {
    ensureNotStopped();
    setTokenBridgeStatus('requesting');
    setTokenBridgeError('');

    try {
      const response = await requestTokenViaExtension({
        provider: 'grecaptcha.enterprise.execute',
        siteKey: CHECKOUT_RECAPTCHA_SITE_KEY,
        action: CHECKOUT_RECAPTCHA_ACTION,
        source: 'admin-rsi-order-automation',
      }, {
        timeoutMs: TOKEN_REQUEST_TIMEOUT_MS,
        timeoutMessage: intl.formatMessage({
          id: 'admin.rsiOrderAutomation.error.tokenRequestTimeout',
          defaultMessage: 'No checkout token was returned from the open RSI tab before the timeout expired.',
        }),
        requestIdPrefix: 'admin-rsi-order-automation-checkout-token',
      });

      const token = response?.token?.trim() || '';
      if (!token) {
        const message = intl.formatMessage({
          id: 'admin.rsiOrderAutomation.error.tokenProviderEmpty',
          defaultMessage: 'The checkout token provider responded, but no token was returned.',
        });
        setTokenBridgeStatus('error');
        setTokenBridgeError(message);
        throw new Error(message);
      }

      setTokenBridgeStatus('ready');
      setTokenBridgeError('');
      setLastTokenReceivedAt(new Date().toISOString());
      setLastTokenPreview(formatTokenPreview(token));
      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTokenBridgeStatus('error');
      setTokenBridgeError(message);
      throw error instanceof Error ? error : new Error(message);
    }
  };

  const checkTokenProviderStatus = async (mode: 'manual' | 'poll' = 'manual') => {
    if (mode === 'manual') {
      setTokenProviderStatus('checking');
    }
    setTokenProviderError('');

    try {
      const response = await requestTokenProviderStatusViaExtension({
        timeoutMs: TOKEN_PROVIDER_STATUS_TIMEOUT_MS,
        timeoutMessage: intl.formatMessage({
          id: 'admin.rsiOrderAutomation.error.tokenProviderStatusTimeout',
          defaultMessage: 'The token provider status check timed out. Reload the extension bridge or the RSI page and try again.',
        }),
        requestIdPrefix: 'admin-rsi-order-automation-token-provider-status',
      });

      const providerCount = typeof response?.providerCount === 'number' ? response.providerCount : 0;
      const available = Boolean(response?.available) && providerCount > 0;

      setTokenProviderCount(providerCount);
      setTokenProviderStatus(available ? 'online' : 'offline');
      setLastProviderCheckAt(new Date().toISOString());
      setTokenProviderError(available
        ? ''
        : intl.formatMessage({
          id: 'admin.rsiOrderAutomation.tokenProviderOffline',
          defaultMessage: 'No RSI tab responded to the token provider handshake. Re-run the provider snippet in an open RSI tab.',
        }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTokenProviderStatus('error');
      setTokenProviderError(message);
      setTokenProviderCount(0);
      setLastProviderCheckAt(new Date().toISOString());

      if (mode === 'manual') {
        appendLog('error', `Token provider status check failed: ${message}`);
      }
    }
  };
  checkTokenProviderStatusRef.current = checkTokenProviderStatus;

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

        const resourceTitle = pickString(resource.title?.replace(" - 10 Year", ""), resource.name);
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

  const runAutomation = async (input: {
    shipName: string;
    token: string;
    mark: string;
    pollIntervalMs: number;
  }) => {
    let attempt = 1;
    let matchedSku: MatchedSku | null = null;
    let appliedCreditsCents: number | null = null;

    while (true) {
      ensureNotStopped();
      setStep('matching');
      appendLog('info', `Attempt ${attempt}: searching RSI standalone ship listings for "${input.shipName}".`);

      matchedSku = await findMatchingSku(input.shipName);
      if (!matchedSku) {
        appendLog('warning', `Attempt ${attempt}: no matching non-warbond listing found.`);
        await sleep(input.pollIntervalMs);
        attempt += 1;
        continue;
      }

      updateSummary({
        matchedShipName: matchedSku.title,
        matchedSkuId: matchedSku.skuId,
        matchedSlug: matchedSku.slug,
        matchedPriceCents: matchedSku.priceCents,
      });
      appendLog('info', `Attempt ${attempt}: matched SKU ${matchedSku.skuId} at ${formatUsdCents(matchedSku.priceCents, intl.locale)}.`);

      ensureNotStopped();
      setStep('addingToCart');
      appendLog('info', `Attempt ${attempt}: adding SKU ${matchedSku.skuId} to the RSI cart.`);
      const addResult = await attemptAddToCart(matchedSku.skuId);
      if (addResult.added) {
        const resolvedPrice = addResult.priceCents ?? matchedSku.priceCents;
        matchedSku = { ...matchedSku, priceCents: resolvedPrice };
        updateSummary({
          matchedPriceCents: resolvedPrice,
        });
        appendLog('success', `Cart add succeeded for SKU ${matchedSku.skuId}${addResult.resourceName ? ` (${addResult.resourceName})` : ''}.`);
        break;
      }

      appendLog('warning', `Attempt ${attempt}: SKU ${matchedSku.skuId} is out of stock. Waiting ${input.pollIntervalMs}ms before retry.`);
      await sleep(input.pollIntervalMs);
      attempt += 1;
    }

    if (!matchedSku) {
      throw new Error('Failed to match a ship SKU.');
    }

    const creditAmount = Number((matchedSku.priceCents / 100).toFixed(2));
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

    updateSummary({
      orderSlug: creditItem.data?.store?.order?.slug || null,
      creditsAppliedCents: creditItem.data?.store?.cart?.totals?.credits?.amount ?? matchedSku.priceCents,
    });
    appliedCreditsCents = creditItem.data?.store?.cart?.totals?.credits?.amount ?? matchedSku.priceCents;
    appendLog('success', 'Checkout credit applied successfully.');

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

    updateSummary({
      orderSlug: nextItem.data?.store?.order?.slug || null,
    });
    appendLog('success', 'Checkout flow advanced successfully.');

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
    } else {
      appendLog('info', 'This checkout does not require billing or shipping addresses.');
    }

    ensureNotStopped();
    setStep('validatingCart');
    appendLog('info', 'Validating the cart with the provided token and mark.');
    const validateItem = await sendRsiGraphql<ValidateCartResponse>(
      'CartValidateCartMutation',
      {
        token: input.token,
        mark: input.mark,
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

    updateSummary({
      orderSlug,
    });
    appendLog('success', `Cart validation succeeded with order slug ${orderSlug}.`);

    ensureNotStopped();
    setStep('trackingPurchase');
    appendLog('info', `Fetching purchase tracking for order ${orderSlug}.`);
    const trackingItem = await sendRsiGraphql<PurchaseTrackingResponse>(
      'PurchaseTrackingQuery',
      {
        orderSlug,
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
      creditsAppliedCents: trackingItem.data?.order?.totals?.credits?.amount ?? appliedCreditsCents,
    });
    appendLog('success', `Purchase tracking completed for order ${trackedOrderSlug}.`);
  };

  const getRunInput = (): { input: RunInput; error: null } | { input: null; error: string } => {
    const shipName = targetShipName.trim();
    const mark = validateMark.trim();
    const pollIntervalMs = Number(pollIntervalInput.trim());

    if (!shipName) {
      return {
        input: null,
        error: intl.formatMessage({
          id: 'admin.rsiOrderAutomation.error.missingShip',
          defaultMessage: 'Please enter the English ship name to match in the RSI store listing.',
        }),
      };
    }

    if (!mark) {
      return {
        input: null,
        error: intl.formatMessage({
          id: 'admin.rsiOrderAutomation.error.missingValidateMark',
          defaultMessage: 'Please provide the validate mark value before starting the task.',
        }),
      };
    }

    if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 500) {
      return {
        input: null,
        error: intl.formatMessage({
          id: 'admin.rsiOrderAutomation.error.invalidPollInterval',
          defaultMessage: 'The poll interval must be a number greater than or equal to 500ms.',
        }),
      };
    }

    return {
      input: {
        shipName,
        mark,
        pollIntervalMs,
      },
      error: null,
    };
  };

  const startAutomation = async (trigger: AutomationTrigger) => {
    if (runningRef.current) {
      if (trigger === 'scheduled') {
        appendLog('warning', 'The scheduled run was skipped because another automation run is already in progress.');
      }
      return;
    }

    const result = getRunInput();
    if (result.error) {
      setFlash({
        severity: 'error',
        text: result.error,
      });

      if (trigger === 'scheduled') {
        appendLog('error', `The scheduled run could not start: ${result.error}`);
      }
      return;
    }

    const { shipName, mark, pollIntervalMs } = result.input as RunInput;
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
        ? `Starting RSI auto checkout for "${shipName}" from the daily schedule.`
        : `Starting RSI auto checkout for "${shipName}".`,
    );

    try {
      appendLog('info', 'Requesting a checkout reCAPTCHA token from the open RSI tab through the extension.');
      const token = await requestCheckoutTokenFromBridge();
      appendLog('success', `Received checkout reCAPTCHA token (${formatTokenPreview(token)}).`);

      await runAutomation({
        shipName,
        token,
        mark,
        pollIntervalMs,
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
      if (isMountedRef.current) {
        stopRequestedRef.current = false;
        setStopRequested(false);
      }
    }
  };
  startAutomationRef.current = startAutomation;

  const handleStart = async () => {
    await startAutomation('manual');
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
    appendLog('info', 'Requesting a checkout reCAPTCHA token from the open RSI tab through the extension.');

    try {
      const token = await requestCheckoutTokenFromBridge();
      appendLog('success', `Received checkout reCAPTCHA token (${formatTokenPreview(token)}).`);
      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.rsiOrderAutomation.success.tokenReceived',
          defaultMessage: 'A checkout reCAPTCHA token was received from the open RSI tab.',
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
    void checkTokenProviderStatusRef.current?.('poll');

    const timer = window.setInterval(() => {
      void checkTokenProviderStatusRef.current?.('poll');
    }, TOKEN_PROVIDER_STATUS_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!scheduleEnabled) {
      setNextScheduledAt(null);
      return undefined;
    }

    const nextRunAt = getNextScheduledRunAt(scheduleTimeInput);
    if (!nextRunAt) {
      setNextScheduledAt(null);
      return undefined;
    }

    setNextScheduledAt(nextRunAt.toISOString());

    const timeout = window.setTimeout(() => {
      if (!isMountedRef.current) {
        return;
      }

      if (runningRef.current) {
        appendLogRef.current?.('warning', `Scheduled run at ${scheduleTimeInput} was skipped because the automation is already running.`);
      } else {
        appendLogRef.current?.('info', `Scheduled run triggered at ${scheduleTimeInput}.`);
        void startAutomationRef.current?.('scheduled');
      }

      if (isMountedRef.current) {
        setScheduleRevision((current) => current + 1);
      }
    }, Math.max(0, nextRunAt.getTime() - Date.now()));

    return () => {
      window.clearTimeout(timeout);
    };
  }, [scheduleEnabled, scheduleTimeInput, scheduleRevision]);

  useEffect(() => {
    if (!scheduleEnabled || !nextScheduledAt) {
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
  }, [scheduleEnabled, nextScheduledAt]);

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
          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap={2}>
            <Autocomplete
              freeSolo
              value={targetShipName}
              options={shipOptions}
              onChange={(_, value) => setTargetShipName(value || '')}
              inputValue={targetShipName}
              onInputChange={(_, value) => setTargetShipName(value)}
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
              value={pollIntervalInput}
              onChange={(event) => setPollIntervalInput(event.target.value)}
              disabled={running}
              type="number"
              inputProps={{ min: 500, step: 100 }}
              helperText={intl.formatMessage({
                id: 'admin.rsiOrderAutomation.pollIntervalHelp',
                defaultMessage: 'Used between failed listing or add-to-cart attempts.',
              })}
            />
          </Box>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' }} gap={2}>
            <FormControlLabel
              control={(
                <Switch
                  checked={scheduleEnabled}
                  onChange={(event) => setScheduleEnabled(event.target.checked)}
                />
              )}
              label={intl.formatMessage({
                id: 'admin.rsiOrderAutomation.scheduleEnabled',
                defaultMessage: 'Enable daily schedule',
              })}
            />

            <TextField
              label={intl.formatMessage({
                id: 'admin.rsiOrderAutomation.scheduleTime',
                defaultMessage: 'Daily start time',
              })}
              type="time"
              value={scheduleTimeInput}
              onChange={(event) => setScheduleTimeInput(event.target.value)}
              disabled={!scheduleEnabled}
              error={scheduleEnabled && !scheduleTimeValid}
              inputProps={{ step: 60 }}
              helperText={scheduleEnabled
                ? intl.formatMessage({
                  id: 'admin.rsiOrderAutomation.scheduleTimeHelpEnabled',
                  defaultMessage: 'Uses the current browser time zone. 00:00 runs at the next local midnight.',
                })
                : intl.formatMessage({
                  id: 'admin.rsiOrderAutomation.scheduleTimeHelpDisabled',
                  defaultMessage: 'Turn on the daily schedule to arm a local browser timer.',
                })}
            />
          </Box>

          <Alert severity={scheduleEnabled && !scheduleTimeValid ? 'warning' : 'info'}>
            {scheduleEnabled && !scheduleTimeValid
              ? intl.formatMessage({
                id: 'admin.rsiOrderAutomation.scheduleInvalid',
                defaultMessage: 'The daily schedule is enabled, but the execution time is invalid. Enter a valid 24-hour time such as 00:00.',
              })
              : intl.formatMessage({
                id: 'admin.rsiOrderAutomation.scheduleInfo',
                defaultMessage: 'Scheduled runs happen only in this browser tab. Keep the admin page open until the task starts.',
              })}
          </Alert>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(2, auto)' }} gap={2} justifyContent="start">
            <Button
              variant="outlined"
              startIcon={tokenProviderStatus === 'checking' ? <CircularProgress size={16} color="inherit" /> : <Refresh />}
              disabled={tokenProviderStatus === 'checking'}
              onClick={() => void checkTokenProviderStatus('manual')}
            >
              {tokenProviderStatus === 'checking'
                ? intl.formatMessage({
                  id: 'admin.rsiOrderAutomation.checkingProvider',
                  defaultMessage: 'Checking provider...',
                })
                : intl.formatMessage({
                  id: 'admin.rsiOrderAutomation.checkProvider',
                  defaultMessage: 'Check provider',
                })}
            </Button>
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
              label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenProviderStatus', defaultMessage: 'Provider' })}: ${
                tokenProviderStatus === 'checking'
                  ? intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenProviderStatus.checking', defaultMessage: 'Checking' })
                  : tokenProviderStatus === 'online'
                    ? intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenProviderStatus.online', defaultMessage: 'Online' })
                    : tokenProviderStatus === 'offline'
                      ? intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenProviderStatus.offline', defaultMessage: 'Offline' })
                      : tokenProviderStatus === 'error'
                        ? intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenProviderStatus.error', defaultMessage: 'Error' })
                        : intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenProviderStatus.idle', defaultMessage: 'Idle' })
              }`}
              size="small"
              color={
                tokenProviderStatus === 'online'
                  ? 'success'
                  : tokenProviderStatus === 'offline' || tokenProviderStatus === 'error'
                    ? 'error'
                    : tokenProviderStatus === 'checking'
                      ? 'warning'
                      : 'default'
              }
            />
            <Chip
              label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenProviderCount', defaultMessage: 'Online tabs' })}: ${tokenProviderCount}`}
              size="small"
            />
            <Chip
              label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.tokenBridgeStatus', defaultMessage: 'Token bridge' })}: ${
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
            {lastProviderCheckAt ? (
              <Chip
                label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.lastProviderCheckAt', defaultMessage: 'Last check' })}: ${formatTimestamp(lastProviderCheckAt, intl.locale)}`}
                size="small"
              />
            ) : null}
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

          {tokenProviderError ? (
            <Alert severity={tokenProviderStatus === 'error' ? 'warning' : 'info'}>
              {tokenProviderError}
            </Alert>
          ) : null}

          <TextField
            label={intl.formatMessage({
              id: 'admin.rsiOrderAutomation.validateMark',
              defaultMessage: 'Validate mark',
            })}
            value={validateMark}
            onChange={(event) => setValidateMark(event.target.value)}
            disabled={running}
            autoComplete="off"
            helperText={intl.formatMessage({
              id: 'admin.rsiOrderAutomation.validateMarkHelp',
              defaultMessage: 'Provide the current mark value manually for this run only. It is not stored anywhere.',
            })}
          />

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
                scheduleEnabled
                  ? intl.formatMessage({ id: 'admin.rsiOrderAutomation.scheduleStatus.enabled', defaultMessage: 'Enabled' })
                  : intl.formatMessage({ id: 'admin.rsiOrderAutomation.scheduleStatus.disabled', defaultMessage: 'Disabled' })
              }`}
              size="small"
              color={scheduleEnabled ? 'success' : 'default'}
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
            {scheduleEnabled && nextScheduledAt ? (
              <Chip
                label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.nextRunAt', defaultMessage: 'Next run' })}: ${formatDateTime(nextScheduledAt, intl.locale)}`}
                size="small"
              />
            ) : null}
            {scheduleEnabled && scheduleCountdownLabel ? (
              <Chip
                label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.countdown', defaultMessage: 'Starts in' })}: ${scheduleCountdownLabel}`}
                size="small"
                color="warning"
              />
            ) : null}
            {scheduleEnabled ? (
              <Chip
                label={`${intl.formatMessage({ id: 'admin.rsiOrderAutomation.scheduleTimeZone', defaultMessage: 'Time zone' })}: ${localTimeZone}`}
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
