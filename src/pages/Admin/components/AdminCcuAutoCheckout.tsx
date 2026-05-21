import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Refresh, PlayArrow } from '@mui/icons-material';
import { useIntl } from 'react-intl';
import { useSelector } from 'react-redux';
import type { Edge } from 'reactflow';

import { useCcuPlannerData } from '@/hooks';
import { requestTokenViaExtension, requestViaExtension } from '@/utils/extensionHttpRequest';
import { addManyRsiOfficialCcusToCartViaExtension, resolveCurrentRsiCcuSkuForEdge } from '@/utils/rsiOfficialCcu';
import type {
  CcuEdgeData,
  CcuSourceType,
  Ccu,
  HangarItem,
} from '@/types';
import { CcuSourceType as CcuSourceTypeEnum } from '@/types';
import type { RootState } from '@/store';
import { selectUsersHangarItems } from '@/store/upgradesStore';
import ImportExportService, { type PlannerWorkspaceTab } from '@/pages/CCUPlanner/services/ImportExportService';

const RSI_GRAPHQL_URL = 'https://robertsspaceindustries.com/graphql';
const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
const TOKEN_MANAGER_REQUEST_API_PATH = '/api/admin/rsi/token-manager/request';
const TOKEN_MANAGER_TOKEN_API_PATH = '/api/admin/rsi/token-manager/token';
const RESPONSE_TIMEOUT_MS = 20_000;
const TOKEN_REQUEST_TIMEOUT_MS = 50_000;
const TOKEN_MANAGER_POLL_INTERVAL_MS = 500;
const STORE_FRONT = 'pledge';
const MAX_LOG_ENTRIES = 1000;
const TOKEN_SOURCE_STORAGE_KEY = 'admin-rsi-order-automation-token-source-v1';
const TOKEN_MANAGER_SECRET_STORAGE_KEY = 'admin-rsi-order-automation-token-manager-secret-v1';
const PURCHASE_BATCH_SIZE = 5;
const BATCH_DELAY_MIN_MS = 200;
const BATCH_DELAY_MAX_MS = 600;

type CheckoutTokenSource = 'tokenProvider' | 'tokenManager';
type LogLevel = 'info' | 'success' | 'warning' | 'error';
type RunPhase = 'idle' | 'running' | 'success' | 'failure';

type LogEntry = {
  id: string;
  at: string;
  level: LogLevel;
  text: string;
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

type TokenManagerResponse = {
  status?: number;
  request?: string;
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

type AddressSelectionContext = {
  selectedAddress: AddressRecord | null;
  shippingRequired: boolean;
  billingRequired: boolean;
};

type ResolvedPurchasableCcuEdge = {
  edge: Edge<CcuEdgeData>;
  skuId: number;
  targetPriceCents: number;
  cashCost: number;
};

type SkippedRouteEdge = {
  edge: Edge<CcuEdgeData>;
  reason: string;
};

type RoutePreview = {
  tabId: string;
  tabName: string;
  orderedEdges: Edge<CcuEdgeData>[];
  purchasableEdges: ResolvedPurchasableCcuEdge[];
  skippedEdges: SkippedRouteEdge[];
  officialCreditAmount: number;
  cashAmount: number;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatGraphqlErrors(errors?: GraphqlError[]) {
  const messages = (errors || [])
    .map((entry) => entry.message?.trim())
    .filter((value): value is string => Boolean(value));

  return messages.length ? messages.join('\n') : 'The RSI GraphQL request failed.';
}

function chooseAddress(addresses: AddressRecord[]): AddressRecord | null {
  if (!addresses.length) {
    return null;
  }

  return addresses.find((entry) => entry.defaultBilling) || addresses[0];
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

function formatUsd(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function formatStepType(sourceType: CcuSourceType | undefined) {
  return sourceType || CcuSourceTypeEnum.OFFICIAL;
}

function parseRequestedQuantity(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function getBatchCount(quantity: number) {
  return Math.ceil(quantity / PURCHASE_BATCH_SIZE);
}

function getRandomBatchDelayMs() {
  return BATCH_DELAY_MIN_MS + Math.floor(Math.random() * (BATCH_DELAY_MAX_MS - BATCH_DELAY_MIN_MS + 1));
}

function readStoredTokenSource(): CheckoutTokenSource {
  try {
    const value = localStorage.getItem(TOKEN_SOURCE_STORAGE_KEY);
    return value === 'tokenProvider' || value === 'tokenManager' ? value : 'tokenManager';
  } catch {
    return 'tokenManager';
  }
}

function writeStoredTokenSource(value: CheckoutTokenSource) {
  try {
    localStorage.setItem(TOKEN_SOURCE_STORAGE_KEY, value);
  } catch {
    // Ignore localStorage failures in admin tooling.
  }
}

function readStoredSecretKey() {
  try {
    return localStorage.getItem(TOKEN_MANAGER_SECRET_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeStoredSecretKey(value: string) {
  try {
    localStorage.setItem(TOKEN_MANAGER_SECRET_STORAGE_KEY, value);
  } catch {
    // Ignore localStorage failures in admin tooling.
  }
}

function getOfficialCreditAmount(edge: Edge<CcuEdgeData>) {
  const sourceShip = edge.data?.sourceShip;
  const targetShip = edge.data?.targetShip;
  if (!sourceShip || !targetShip) {
    return 0;
  }

  return Math.max(0, (targetShip.msrp - sourceShip.msrp) / 100);
}

function getPurchasableEdgeCashCost(edge: Edge<CcuEdgeData>, targetPriceCents: number) {
  const sourceShip = edge.data?.sourceShip;
  if (!sourceShip) {
    return 0;
  }

  return Math.max(0, (targetPriceCents - sourceShip.msrp) / 100);
}

function getCurrentPurchasableSourceTypes() {
  return new Set<CcuSourceType>([
    CcuSourceTypeEnum.OFFICIAL,
    CcuSourceTypeEnum.AVAILABLE_WB,
  ]);
}

function extractLinearRouteEdges(tab: PlannerWorkspaceTab): Edge<CcuEdgeData>[] {
  const nodeIds = new Set(tab.flowData.nodes.map((node) => node.id));
  const edges = tab.flowData.edges.filter((edge): edge is Edge<CcuEdgeData> => (
    Boolean(edge.data?.sourceShip && edge.data?.targetShip)
    && nodeIds.has(edge.source)
    && nodeIds.has(edge.target)
  ));

  if (!edges.length) {
    throw new Error('The active CCU Planner tab has no valid route edges.');
  }

  const indegree = new Map<string, number>();
  const outdegree = new Map<string, number>();
  tab.flowData.nodes.forEach((node) => {
    indegree.set(node.id, 0);
    outdegree.set(node.id, 0);
  });

  const outgoingBySource = new Map<string, Edge<CcuEdgeData>>();
  edges.forEach((edge) => {
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
    outdegree.set(edge.source, (outdegree.get(edge.source) || 0) + 1);

    if (outgoingBySource.has(edge.source)) {
      throw new Error('The active CCU Planner tab contains a branch. Please keep only one linear route in the current tab.');
    }

    outgoingBySource.set(edge.source, edge);
  });

  const involvedNodeIds = tab.flowData.nodes
    .filter((node) => (indegree.get(node.id) || 0) > 0 || (outdegree.get(node.id) || 0) > 0)
    .map((node) => node.id);

  if (involvedNodeIds.length !== tab.flowData.nodes.length) {
    throw new Error('The active CCU Planner tab contains extra disconnected nodes. Please keep only the route you want to automate.');
  }

  const startNodes = tab.flowData.nodes.filter((node) => (indegree.get(node.id) || 0) === 0 && (outdegree.get(node.id) || 0) === 1);
  const endNodes = tab.flowData.nodes.filter((node) => (indegree.get(node.id) || 0) === 1 && (outdegree.get(node.id) || 0) === 0);

  if (startNodes.length !== 1 || endNodes.length !== 1) {
    throw new Error('The active CCU Planner tab must contain exactly one start node and one end node.');
  }

  const invalidNode = tab.flowData.nodes.find((node) => {
    const incoming = indegree.get(node.id) || 0;
    const outgoing = outdegree.get(node.id) || 0;
    return incoming > 1 || outgoing > 1;
  });

  if (invalidNode) {
    throw new Error('The active CCU Planner tab contains a node with multiple incoming or outgoing edges.');
  }

  const orderedEdges: Edge<CcuEdgeData>[] = [];
  const visitedEdgeIds = new Set<string>();
  let currentNodeId = startNodes[0].id;

  while (outgoingBySource.has(currentNodeId)) {
    const nextEdge = outgoingBySource.get(currentNodeId);
    if (!nextEdge) {
      break;
    }

    if (visitedEdgeIds.has(nextEdge.id)) {
      throw new Error('The active CCU Planner tab contains a cycle, which is not supported for auto checkout.');
    }

    visitedEdgeIds.add(nextEdge.id);
    orderedEdges.push(nextEdge);
    currentNodeId = nextEdge.target;
  }

  if (visitedEdgeIds.size !== edges.length || currentNodeId !== endNodes[0].id) {
    throw new Error('The active CCU Planner tab must contain one continuous linear route.');
  }

  return orderedEdges;
}

function buildRoutePreview(tab: PlannerWorkspaceTab, ccus: Ccu[]): RoutePreview {
  const orderedEdges = extractLinearRouteEdges(tab);
  const currentPurchasableTypes = getCurrentPurchasableSourceTypes();
  const purchasableEdges: ResolvedPurchasableCcuEdge[] = [];
  const skippedEdges: SkippedRouteEdge[] = [];

  orderedEdges.forEach((edge) => {
    const sourceType = edge.data?.sourceType ?? CcuSourceTypeEnum.OFFICIAL;

    if (!currentPurchasableTypes.has(sourceType)) {
      skippedEdges.push({
        edge,
        reason: 'Not a current RSI-purchasable official/WB edge.',
      });
      return;
    }

    const resolvedSku = resolveCurrentRsiCcuSkuForEdge(edge.data, ccus);
    if (!resolvedSku) {
      skippedEdges.push({
        edge,
        reason: 'No current RSI SKU matches this edge right now.',
      });
      return;
    }

    purchasableEdges.push({
      edge,
      skuId: resolvedSku.skuId,
      targetPriceCents: resolvedSku.targetPriceCents,
      cashCost: getPurchasableEdgeCashCost(edge, resolvedSku.targetPriceCents),
    });
  });

  const officialCreditAmount = Number(
    purchasableEdges
      .filter((entry) => (entry.edge.data?.sourceType ?? CcuSourceTypeEnum.OFFICIAL) === CcuSourceTypeEnum.OFFICIAL)
      .reduce((sum, entry) => sum + getOfficialCreditAmount(entry.edge), 0)
      .toFixed(2),
  );

  const cashAmount = Number(
    purchasableEdges
      .filter((entry) => {
        const sourceType = entry.edge.data?.sourceType ?? CcuSourceTypeEnum.OFFICIAL;
        return sourceType === CcuSourceTypeEnum.AVAILABLE_WB;
      })
      .reduce((sum, entry) => sum + entry.cashCost, 0)
      .toFixed(2),
  );

  return {
    tabId: tab.id,
    tabName: tab.name,
    orderedEdges,
    purchasableEdges,
    skippedEdges,
    officialCreditAmount,
    cashAmount,
  };
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
        const payload = await response.json() as { message?: string };
        if (typeof payload?.message === 'string' && payload.message.trim()) {
          message = payload.message.trim();
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

export default function AdminCcuAutoCheckout() {
  const intl = useIntl();
  const importExportService = useMemo(() => new ImportExportService(), []);
  const { ccus, ships, loading } = useCcuPlannerData();
  const { user } = useSelector((state: RootState) => state.user);
  const upgrades = useSelector(selectUsersHangarItems);

  const [routePreview, setRoutePreview] = useState<RoutePreview | null>(null);
  const [routeError, setRouteError] = useState('');
  const [refreshingRoute, setRefreshingRoute] = useState(false);
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [currentStep, setCurrentStep] = useState('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [flash, setFlash] = useState<{ severity: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [validateMark, setValidateMark] = useState('');
  const [purchaseQuantityInput, setPurchaseQuantityInput] = useState('1');
  const [tokenSource, setTokenSource] = useState<CheckoutTokenSource>(() => readStoredTokenSource());
  const [tokenManagerSecret, setTokenManagerSecret] = useState(() => readStoredSecretKey());

  const runIdRef = useRef(0);

  const appendLog = (level: LogLevel, text: string) => {
    setLogs((current) => {
      const nextEntry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        level,
        text,
      };

      return [...current, nextEntry].slice(-MAX_LOG_ENTRIES);
    });
  };

  const hangarItems = useMemo<HangarItem[]>(() => upgrades.ccus.map((upgrade, index) => ({
    id: index + 1,
    name: upgrade.name,
    type: 'ccu',
    fromShip: upgrade.parsed.from,
    toShip: upgrade.parsed.to,
    price: upgrade.value,
  })), [upgrades.ccus]);

  useEffect(() => {
    writeStoredTokenSource(tokenSource);
  }, [tokenSource]);

  useEffect(() => {
    writeStoredSecretKey(tokenManagerSecret);
  }, [tokenManagerSecret]);

  const requestedQuantity = useMemo(
    () => parseRequestedQuantity(purchaseQuantityInput),
    [purchaseQuantityInput],
  );

  const requestedBatchCount = requestedQuantity ? getBatchCount(requestedQuantity) : 0;

  const totalRequestedPurchasableCcus = routePreview && requestedQuantity
    ? routePreview.purchasableEdges.length * requestedQuantity
    : 0;

  const totalRequestedOfficialCredit = routePreview && requestedQuantity
    ? Number((routePreview.officialCreditAmount * requestedQuantity).toFixed(2))
    : 0;

  const totalRequestedCash = routePreview && requestedQuantity
    ? Number((routePreview.cashAmount * requestedQuantity).toFixed(2))
    : 0;

  const refreshRoutePreview = async () => {
    if (loading) {
      return;
    }

    setRefreshingRoute(true);
    setRouteError('');

    try {
      const workspace = importExportService.loadWorkspaceFromLocalStorage(ships, hangarItems, [], ccus);
      if (!workspace?.tabs.length) {
        throw new Error('No saved CCU Planner workspace was found in local storage.');
      }

      const activeTab = workspace.tabs.find((tab) => tab.id === workspace.activeTabId) || workspace.tabs[0];
      if (!activeTab) {
        throw new Error('No active CCU Planner tab is available.');
      }

      const nextPreview = buildRoutePreview(activeTab, ccus);
      setRoutePreview(nextPreview);
    } catch (error) {
      setRoutePreview(null);
      setRouteError(error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshingRoute(false);
    }
  };

  useEffect(() => {
    void refreshRoutePreview();
  }, [loading, ships, ccus, hangarItems]);

  const requestCheckoutToken = async () => {
    if (tokenSource === 'tokenProvider') {
      const response = await requestTokenViaExtension({}, {
        timeoutMs: TOKEN_REQUEST_TIMEOUT_MS,
        timeoutMessage: 'Token provider did not return a checkout token before the timeout expired.',
        requestIdPrefix: 'admin-ccu-auto-checkout-token-provider',
      });

      const token = typeof response?.token === 'string' ? response.token.trim() : '';
      if (!token) {
        throw new Error('Token provider responded successfully, but no token was returned.');
      }

      return token;
    }

    const secretKey = tokenManagerSecret.trim();
    if (!secretKey) {
      throw new Error('Please enter the token manager secret key before starting CCU auto checkout.');
    }

    if (!user.token) {
      throw new Error('Your admin session is missing. Please log in again and retry.');
    }

    const deadline = Date.now() + TOKEN_REQUEST_TIMEOUT_MS;
    const getRemainingTimeoutMs = () => Math.max(250, deadline - Date.now());

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
      throw new Error('Token manager did not accept the token request. Please verify the secret key and try again.');
    }

    while (Date.now() <= deadline) {
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
        const token = tokenResponse.request?.trim() || '';
        if (!token) {
          throw new Error('Token manager responded successfully, but no token was returned.');
        }

        return token;
      }

      await sleep(TOKEN_MANAGER_POLL_INTERVAL_MS);
    }

    throw new Error('Token manager did not return a checkout token before the timeout expired.');
  };

  const sendRsiGraphql = async <TData,>(
    operationName: string,
    variables: Record<string, unknown>,
    query: string,
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
      timeoutMessage: 'The browser extension request timed out. Make sure the Citizens Hub extension is installed, enabled, and logged in on robertsspaceindustries.com.',
      requestIdPrefix: `admin-ccu-auto-checkout-${operationName}`,
    }) as GraphqlResponseEnvelope;

    const batch = Array.isArray(response.data) ? response.data : [response.data];
    const item = batch[0] as GraphqlBatchItem<TData> | undefined;
    if (!item) {
      throw new Error(`${operationName} returned an empty GraphQL batch response.`);
    }

    if (item.errors?.length) {
      throw new Error(formatGraphqlErrors(item.errors));
    }

    return item;
  };

  const loadAddressSelectionContext = async (): Promise<AddressSelectionContext> => {
    const addressItem = await sendRsiGraphql<AddressBookResponse>(
      'AddressBookQuery',
      { storeFront: STORE_FRONT },
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

    return {
      selectedAddress,
      shippingRequired,
      billingRequired,
    };
  };

  const checkoutCurrentCart = async (
    latestRoutePreview: RoutePreview,
    batchIndex: number,
    totalBatches: number,
    batchQuantity: number,
  ) => {
    const batchLabel = `Batch ${batchIndex + 1}/${totalBatches}`;
    const batchOfficialCreditAmount = Number((latestRoutePreview.officialCreditAmount * batchQuantity).toFixed(2));
    let orderSlug: string | null = null;

    if (batchOfficialCreditAmount > 0) {
      setCurrentStep(`${batchLabel} addingCredit`);
      appendLog('info', `${batchLabel}: applying store credit ${formatUsd(batchOfficialCreditAmount)}.`);

      const creditItem = await sendRsiGraphql<AddCreditResponse>(
        'AddCreditMutation',
        {
          amount: batchOfficialCreditAmount,
          storeFront: STORE_FRONT,
        },
        ADD_CREDIT_QUERY,
      );

      if (!creditItem.data?.store?.cart?.mutations?.credit_update) {
        throw new Error(`${batchLabel}: RSI credit update returned false.`);
      }

      orderSlug = creditItem.data?.store?.order?.slug || orderSlug;
      appendLog('success', `${batchLabel}: store credit applied successfully.`);
    } else {
      appendLog('info', `${batchLabel}: no standard official CCU steps were selected, so no store credit was applied.`);
    }

    setCurrentStep(`${batchLabel} movingNext`);
    appendLog('info', `${batchLabel}: advancing the RSI checkout flow.`);
    const nextItem = await sendRsiGraphql<NextStepResponse>(
      'NextStepMutation',
      { storeFront: STORE_FRONT },
      NEXT_STEP_QUERY,
    );

    if (!nextItem.data?.store?.cart?.mutations?.flow?.moveNext) {
      throw new Error(`${batchLabel}: RSI checkout flow did not move to the next step.`);
    }

    orderSlug = nextItem.data?.store?.order?.slug || orderSlug;
    appendLog('success', `${batchLabel}: checkout flow advanced successfully.`);

    setCurrentStep(`${batchLabel} loadingAddresses`);
    appendLog('info', `${batchLabel}: loading the RSI address book.`);
    const addressSelection = await loadAddressSelectionContext();

    if (addressSelection.selectedAddress?.id && (addressSelection.shippingRequired || addressSelection.billingRequired)) {
      setCurrentStep(`${batchLabel} assigningAddress`);
      appendLog('info', `${batchLabel}: assigning address ${addressSelection.selectedAddress.id}: ${formatAddressLabel(addressSelection.selectedAddress)}.`);

      const assignItem = await sendRsiGraphql<AssignAddressResponse>(
        'CartAddressAssignMutation',
        {
          billing: addressSelection.billingRequired ? addressSelection.selectedAddress.id : null,
          shipping: addressSelection.shippingRequired ? addressSelection.selectedAddress.id : null,
          storeFront: STORE_FRONT,
        },
        ASSIGN_ADDRESS_QUERY,
      );

      if (!assignItem.data?.store?.cart?.mutations?.assignAddresses) {
        throw new Error(`${batchLabel}: RSI address assignment returned false.`);
      }

      appendLog('success', `${batchLabel}: address assignment completed successfully.`);
    } else {
      appendLog('info', `${batchLabel}: this checkout does not require billing or shipping addresses.`);
    }

    setCurrentStep(`${batchLabel} requestingToken`);
    appendLog(
      'info',
      tokenSource === 'tokenProvider'
        ? `${batchLabel}: requesting a checkout token from token provider.`
        : `${batchLabel}: requesting a checkout token from token manager.`,
    );
    const token = await requestCheckoutToken();
    appendLog('success', `${batchLabel}: a checkout token was received successfully.`);

    setCurrentStep(`${batchLabel} validatingCart`);
    appendLog('info', `${batchLabel}: validating the RSI cart.`);
    const validateItem = await sendRsiGraphql<ValidateCartResponse>(
      'CartValidateCartMutation',
      {
        token,
        mark: validateMark.trim(),
        storeFront: STORE_FRONT,
      },
      VALIDATE_CART_QUERY,
    );

    orderSlug = validateItem.data?.store?.cart?.mutations?.validate
      || validateItem.data?.store?.order?.slug
      || orderSlug;

    if (!orderSlug) {
      throw new Error(`${batchLabel}: RSI cart validation did not return an order slug.`);
    }

    appendLog('success', `${batchLabel}: cart validation succeeded with order slug ${orderSlug}.`);

    setCurrentStep(`${batchLabel} trackingPurchase`);
    appendLog('info', `${batchLabel}: fetching purchase tracking for order ${orderSlug}.`);
    const trackingItem = await sendRsiGraphql<PurchaseTrackingResponse>(
      'PurchaseTrackingQuery',
      { orderSlug },
      PURCHASE_TRACKING_QUERY,
    );

    const trackedOrderSlug = trackingItem.data?.order?.order?.slug || orderSlug;
    appendLog(
      'success',
      `${batchLabel}: purchase tracking completed for order ${trackedOrderSlug}. Total: ${
        typeof trackingItem.data?.order?.totals?.total === 'number'
          ? formatUsd(trackingItem.data.order.totals.total / 100)
          : 'N/A'
      }.`,
    );
  };

  const handleRun = async () => {
    const currentRunId = Date.now();
    runIdRef.current = currentRunId;

    setFlash(null);
    setPhase('running');
    setCurrentStep('preparing');
    setLogs([]);

    try {
      const workspace = importExportService.loadWorkspaceFromLocalStorage(ships, hangarItems, [], ccus);
      if (!workspace?.tabs.length) {
        throw new Error('No saved CCU Planner workspace was found in local storage.');
      }

      const activeTab = workspace.tabs.find((tab) => tab.id === workspace.activeTabId) || workspace.tabs[0];
      if (!activeTab) {
        throw new Error('No active CCU Planner tab is available.');
      }

      const latestRoutePreview = buildRoutePreview(activeTab, ccus);
      setRoutePreview(latestRoutePreview);

      if (!validateMark.trim()) {
        throw new Error('Please provide the validate mark value before starting CCU auto checkout.');
      }

      const nextRequestedQuantity = parseRequestedQuantity(purchaseQuantityInput);
      if (!nextRequestedQuantity) {
        throw new Error('Please provide a valid integer quantity of at least 1 before starting CCU auto checkout.');
      }

      if (!latestRoutePreview.purchasableEdges.length) {
        throw new Error('The active CCU Planner tab does not contain any current official/WB CCUs that can be purchased from RSI right now.');
      }

      appendLog('warning', 'This tool does not clear the existing RSI official cart. Start from an empty RSI cart to avoid checking out unrelated items.');
      appendLog('info', `Loaded route "${latestRoutePreview.tabName}" with ${latestRoutePreview.orderedEdges.length} steps.`);
      appendLog(
        'info',
        `Purchasing ${latestRoutePreview.purchasableEdges.length} current official/WB CCU steps per route copy, quantity ${nextRequestedQuantity}, across ${getBatchCount(nextRequestedQuantity)} batch(es).`,
      );

      let processedQuantity = 0;
      const totalBatches = getBatchCount(nextRequestedQuantity);

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
        const batchQuantity = Math.min(PURCHASE_BATCH_SIZE, nextRequestedQuantity - processedQuantity);
        const batchLabel = `Batch ${batchIndex + 1}/${totalBatches}`;
        const batchCashAmount = Number((latestRoutePreview.cashAmount * batchQuantity).toFixed(2));
        const batchOfficialCreditAmount = Number((latestRoutePreview.officialCreditAmount * batchQuantity).toFixed(2));

        appendLog(
          'info',
          `${batchLabel}: starting checkout for ${batchQuantity} route ${batchQuantity === 1 ? 'copy' : 'copies'} (estimated credit ${formatUsd(batchOfficialCreditAmount)}, estimated cash ${formatUsd(batchCashAmount)}).`,
        );

        const batchCartEntries: Array<{ fromShipId: number; toSkuId: number }> = [];

        for (let copyIndex = 0; copyIndex < batchQuantity; copyIndex += 1) {
          for (const [edgeIndex, entry] of latestRoutePreview.purchasableEdges.entries()) {
            const fromShip = entry.edge.data?.sourceShip;
            const toShip = entry.edge.data?.targetShip;
            if (!fromShip?.id || !toShip?.id) {
              throw new Error('A route edge is missing ship metadata.');
            }

            setCurrentStep(`${batchLabel} addingCcus`);
            appendLog(
              'info',
              `${batchLabel}, copy ${copyIndex + 1}/${batchQuantity}, step ${edgeIndex + 1}/${latestRoutePreview.purchasableEdges.length}: adding ${fromShip.name} -> ${toShip.name} (${formatStepType(entry.edge.data?.sourceType)}, SKU ${entry.skuId}).`,
            );

            batchCartEntries.push({
              fromShipId: fromShip.id,
              toSkuId: entry.skuId,
            });
          }
        }

        await addManyRsiOfficialCcusToCartViaExtension(
          batchCartEntries,
          {
            timeoutMs: RESPONSE_TIMEOUT_MS,
            requestIdPrefix: `admin-ccu-auto-checkout-batch-${batchIndex + 1}`,
          },
        );

        appendLog('success', `${batchLabel}: added ${batchCartEntries.length} CCU item${batchCartEntries.length === 1 ? '' : 's'} to the RSI cart.`);

        await checkoutCurrentCart(latestRoutePreview, batchIndex, totalBatches, batchQuantity);
        processedQuantity += batchQuantity;

        if (batchIndex < totalBatches - 1) {
          const delayMs = getRandomBatchDelayMs();
          setCurrentStep(`${batchLabel} waiting`);
          appendLog('info', `${batchLabel}: waiting ${delayMs}ms before the next batch.`);
          await sleep(delayMs);
        }
      }

      if (runIdRef.current !== currentRunId) {
        return;
      }

      setPhase('success');
      setCurrentStep('done');
      setFlash({
        severity: 'success',
        text: `CCU auto checkout completed successfully for route "${latestRoutePreview.tabName}" with quantity ${nextRequestedQuantity} across ${totalBatches} batch(es).`,
      });
    } catch (error) {
      if (runIdRef.current !== currentRunId) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      appendLog('error', message);
      setPhase('failure');
      setCurrentStep('failed');
      setFlash({
        severity: 'error',
        text: message,
      });
    }
  };

  const runDisabled = loading
    || refreshingRoute
    || phase === 'running'
    || !routePreview
    || !routePreview.purchasableEdges.length
    || !requestedQuantity;

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">CCU Auto Checkout</Typography>
          <Typography variant="body2" color="text.secondary">
            Load the active CCU Planner tab from local storage, extract one linear route, and repeatedly buy that route in batches of up to 5 copies per order until the requested quantity is completed.
          </Typography>

          <Alert severity="warning">
            Start from an empty RSI official cart. This tool places repeated batch orders for the current route&apos;s official/WB CCUs and does not clear unrelated items already in the RSI cart.
          </Alert>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap={2}>
            <TextField
              label="Validate mark"
              value={validateMark}
              onChange={(event) => setValidateMark(event.target.value)}
              disabled={phase === 'running'}
              autoComplete="off"
              helperText="Provide the current validate mark manually for this run."
            />
            <TextField
              label="Quantity"
              value={purchaseQuantityInput}
              onChange={(event) => setPurchaseQuantityInput(event.target.value)}
              disabled={phase === 'running'}
              autoComplete="off"
              type="number"
              inputProps={{ min: 1, step: 1 }}
              error={Boolean(purchaseQuantityInput.trim()) && !requestedQuantity}
              helperText={requestedQuantity
                ? `Will place ${requestedBatchCount} batch(es), with up to ${PURCHASE_BATCH_SIZE} route copies per batch and a random ${BATCH_DELAY_MIN_MS}-${BATCH_DELAY_MAX_MS}ms delay between batches.`
                : 'Enter an integer quantity of at least 1.'}
            />
            <TextField
              select
              label="Token source"
              value={tokenSource}
              onChange={(event) => setTokenSource(event.target.value as CheckoutTokenSource)}
              disabled={phase === 'running'}
              helperText="Choose whether checkout tokens come from an open RSI tab token provider or from token manager."
            >
              <MenuItem value="tokenProvider">Token provider</MenuItem>
              <MenuItem value="tokenManager">Token manager</MenuItem>
            </TextField>
            <TextField
              label="Token manager secret"
              value={tokenManagerSecret}
              onChange={(event) => setTokenManagerSecret(event.target.value)}
              disabled={phase === 'running' || tokenSource !== 'tokenManager'}
              helperText="Only required when token source is token manager."
            />
          </Box>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <Button
              variant="outlined"
              startIcon={refreshingRoute ? <CircularProgress size={16} color="inherit" /> : <Refresh />}
              onClick={refreshRoutePreview}
              disabled={loading || refreshingRoute || phase === 'running'}
            >
              {refreshingRoute ? 'Refreshing route...' : 'Refresh active planner route'}
            </Button>
            <Button
              variant="contained"
              startIcon={phase === 'running' ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
              onClick={handleRun}
              disabled={runDisabled}
            >
              {phase === 'running' ? 'Running CCU auto checkout...' : 'Start CCU auto checkout'}
            </Button>
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={`Route status: ${routePreview ? 'Loaded' : routeError ? 'Error' : loading ? 'Loading' : 'Idle'}`} color={routePreview ? 'success' : routeError ? 'error' : 'default'} />
            <Chip label={`Run phase: ${phase}`} color={phase === 'success' ? 'success' : phase === 'failure' ? 'error' : phase === 'running' ? 'info' : 'default'} />
            <Chip label={`Current step: ${currentStep}`} />
            {routePreview ? <Chip label={`Active tab: ${routePreview.tabName}`} /> : null}
          </Stack>

          {flash ? <Alert severity={flash.severity}>{flash.text}</Alert> : null}
          {routeError ? <Alert severity="error">{routeError}</Alert> : null}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">Route Preview</Typography>

          {!routePreview && !routeError ? (
            <Typography variant="body2" color="text.secondary">
              {loading ? 'Loading CCU planner data...' : 'No active CCU Planner route is currently available.'}
            </Typography>
          ) : null}

          {routePreview ? (
            <>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label={`Total steps ${routePreview.orderedEdges.length}`} />
                <Chip label={`Current RSI CCUs per route ${routePreview.purchasableEdges.length}`} color={routePreview.purchasableEdges.length ? 'success' : 'default'} />
                <Chip label={`Requested quantity ${requestedQuantity ?? 'Invalid'}`} color={requestedQuantity ? 'info' : 'error'} />
                <Chip label={`Batches ${requestedBatchCount}`} />
                <Chip label={`Total CCUs ${totalRequestedPurchasableCcus}`} />
                <Chip label={`Skipped ${routePreview.skippedEdges.length}`} color={routePreview.skippedEdges.length ? 'warning' : 'default'} />
                <Chip label={`Total store credit ${formatUsd(totalRequestedOfficialCredit)}`} />
                <Chip label={`Total cash ${formatUsd(totalRequestedCash)}`} />
              </Stack>

              <Stack spacing={1.5}>
                {routePreview.orderedEdges.map((edge, index) => {
                  const sourceShip = edge.data?.sourceShip;
                  const targetShip = edge.data?.targetShip;
                  const purchasable = routePreview.purchasableEdges.find((entry) => entry.edge.id === edge.id);
                  const skipped = routePreview.skippedEdges.find((entry) => entry.edge.id === edge.id);

                  return (
                    <Paper key={edge.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between">
                        <Typography variant="body2" fontWeight={600}>
                          {index + 1}. {sourceShip?.name || 'Unknown'} -&gt; {targetShip?.name || 'Unknown'}
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Chip size="small" label={formatStepType(edge.data?.sourceType)} />
                          {purchasable ? (
                            <>
                              <Chip size="small" color="success" label={`Current SKU ${purchasable.skuId}`} />
                              <Chip size="small" label={`Cash ${formatUsd(purchasable.cashCost)}`} />
                            </>
                          ) : skipped ? (
                            <Chip size="small" color="warning" label={skipped.reason} />
                          ) : null}
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            </>
          ) : null}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">Run Log</Typography>
          {!logs.length ? (
            <Typography variant="body2" color="text.secondary">
              No run logs yet.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {logs.map((entry) => (
                <Box
                  key={entry.id}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    px: 1.5,
                    py: 1,
                    borderRadius: 1,
                    fontFamily: 'monospace',
                    fontSize: 13,
                    color: entry.level === 'error'
                      ? 'error.main'
                      : entry.level === 'warning'
                        ? 'warning.main'
                        : entry.level === 'success'
                          ? 'success.main'
                          : 'text.primary',
                  }}
                >
                  [{new Date(entry.at).toLocaleTimeString(intl.locale)}] {entry.text}
                </Box>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
