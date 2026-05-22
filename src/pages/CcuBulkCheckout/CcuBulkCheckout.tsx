import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, DeleteOutline, PlayArrow, Refresh } from '@mui/icons-material';
import { useIntl } from 'react-intl';

import { useApi } from '@/hooks';
import { requestTokenViaExtension, requestViaExtension } from '@/utils/extensionHttpRequest';
import { addManyRsiOfficialCcusToCartViaExtension } from '@/utils/rsiOfficialCcu';
import type { Ccu, Ship } from '@/types';

const RSI_GRAPHQL_URL = 'https://robertsspaceindustries.com/graphql';
const RESPONSE_TIMEOUT_MS = 20_000;
const TOKEN_REQUEST_TIMEOUT_MS = 50_000;
const STORE_FRONT = 'pledge';
const MAX_LOG_ENTRIES = 1000;
const PURCHASE_BATCH_SIZE = 5;
const BATCH_DELAY_MIN_MS = 200;
const BATCH_DELAY_MAX_MS = 600;

type CcusResponse = {
  data: {
    to: {
      ships: Ccu[];
    };
  };
};

type ShipsResponse = {
  data: {
    ships: Ship[];
  };
};

type CcuSku = Ccu['skus'][number];

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

type ManualCcuRow = {
  id: string;
  fromShipId: number | null;
  toShipId: number | null;
  selectedSkuId: number | null;
  quantityInput: string;
};

type ResolvedManualCcuRow = {
  row: ManualCcuRow;
  index: number;
  fromShip: Ship;
  toShip: Ship;
  sku: CcuSku;
  quantity: number;
  unitCreditAmount: number;
  unitCashAmount: number;
  isStoreCreditSku: boolean;
};

type ManualCcuRowError = {
  rowId: string;
  index: number;
  message: string;
};

type ManualCcuPreview = {
  resolvedRows: ResolvedManualCcuRow[];
  errors: ManualCcuRowError[];
  totalQuantity: number;
  totalCreditAmount: number;
  totalCashAmount: number;
  batchCount: number;
};

type FlattenedCcuEntry = {
  resolved: ResolvedManualCcuRow;
  copyIndex: number;
};

type CcuBulkCheckoutProps = {
  requestIdPrefix?: string;
};

type IntlShape = ReturnType<typeof useIntl>;
type IntlValues = Record<string, string | number>;

function text(intl: IntlShape, id: string, defaultMessage: string, values?: IntlValues) {
  const messageId = `ccuBulkCheckout.${id}`;
  return intl.formatMessage({ id: messageId, defaultMessage }, values);
}

function createManualCcuRow(overrides: Partial<ManualCcuRow> = {}): ManualCcuRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fromShipId: null,
    toShipId: null,
    selectedSkuId: null,
    quantityInput: '1',
    ...overrides,
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function formatGraphqlErrors(intl: IntlShape, errors?: GraphqlError[]) {
  const messages = (errors || [])
    .map((entry) => entry.message?.trim())
    .filter((value): value is string => Boolean(value));

  return messages.length
    ? messages.join('\n')
    : text(intl, 'error.graphqlFailed', 'The RSI GraphQL request failed.');
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

function formatShipOption(ship: Ship) {
  const displayName = ship.localizedName || ship.name;
  return `${displayName} (${formatUsd(ship.msrp / 100)})`;
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

function getAvailableTargetSkus(targetShipId: number | null, ccus: Ccu[]) {
  if (!targetShipId) {
    return [];
  }

  return ccus.find((entry) => entry.id === targetShipId)?.skus || [];
}

function getSelectableSkus(
  fromShipId: number | null,
  toShipId: number | null,
  shipMap: Map<number, Ship>,
  ccus: Ccu[],
): CcuSku[] {
  if (!fromShipId || !toShipId) {
    return [];
  }

  const fromShip = shipMap.get(fromShipId);
  const toShip = shipMap.get(toShipId);
  if (!fromShip || !toShip || fromShip.msrp < 2000 || toShip.msrp <= fromShip.msrp) {
    return [];
  }

  return getAvailableTargetSkus(toShip.id, ccus)
    .filter((sku) => sku.available && sku.price > fromShip.msrp)
    .sort((left, right) => {
      const leftOfficial = left.price === toShip.msrp ? 0 : 1;
      const rightOfficial = right.price === toShip.msrp ? 0 : 1;
      if (leftOfficial !== rightOfficial) {
        return leftOfficial - rightOfficial;
      }

      return left.price - right.price;
    });
}

function formatSkuLabel(intl: IntlShape, sku: CcuSku, fromShip: Ship | null, toShip: Ship | null) {
  const skuType = toShip && sku.price === toShip.msrp
    ? text(intl, 'sku.standard', 'Standard')
    : text(intl, 'sku.wb', 'WB');
  const upgradeAmount = fromShip ? Math.max(0, (sku.price - fromShip.msrp) / 100) : sku.upgradePrice / 100;
  const stockLabel = sku.unlimitedStock
    ? text(intl, 'stock.unlimited', 'unlimited')
    : text(intl, 'stock.count', '{count} stock', { count: Math.max(0, sku.availableStock) });

  return text(
    intl,
    'sku.optionLabel',
    '{type} SKU {skuId} | target {targetPrice} | upgrade {upgradePrice} | {stock}',
    {
      type: skuType,
      skuId: sku.id,
      targetPrice: formatUsd(sku.price / 100),
      upgradePrice: formatUsd(upgradeAmount),
      stock: stockLabel,
    },
  );
}

function buildManualPreview(
  rows: ManualCcuRow[],
  shipMap: Map<number, Ship>,
  ccus: Ccu[],
  intl: IntlShape,
): ManualCcuPreview {
  const resolvedRows: ResolvedManualCcuRow[] = [];
  const errors: ManualCcuRowError[] = [];

  rows.forEach((row, index) => {
    const rowLabel = text(intl, 'row.label', 'Row {index}', { index: index + 1 });
    const fromShip = row.fromShipId ? shipMap.get(row.fromShipId) : null;
    const toShip = row.toShipId ? shipMap.get(row.toShipId) : null;

    if (!fromShip || !toShip) {
      errors.push({
        rowId: row.id,
        index,
        message: text(intl, 'error.row.missingShips', '{row}: select both source and target ships.', { row: rowLabel }),
      });
      return;
    }

    if (fromShip.id === toShip.id) {
      errors.push({
        rowId: row.id,
        index,
        message: text(intl, 'error.row.sameShip', '{row}: source and target ships must be different.', { row: rowLabel }),
      });
      return;
    }

    if (fromShip.msrp < 2000) {
      errors.push({
        rowId: row.id,
        index,
        message: text(intl, 'error.row.sourceUnavailable', '{row}: the source ship cannot be upgraded from RSI checkout data.', { row: rowLabel }),
      });
      return;
    }

    if (toShip.msrp <= fromShip.msrp) {
      errors.push({
        rowId: row.id,
        index,
        message: text(intl, 'error.row.invalidPriceOrder', '{row}: CCUs can only upgrade from a lower priced ship to a higher priced ship.', { row: rowLabel }),
      });
      return;
    }

    const quantity = parseRequestedQuantity(row.quantityInput);
    if (!quantity) {
      errors.push({
        rowId: row.id,
        index,
        message: text(intl, 'error.row.invalidQuantity', '{row}: quantity must be an integer of at least 1.', { row: rowLabel }),
      });
      return;
    }

    const selectableSkus = getSelectableSkus(fromShip.id, toShip.id, shipMap, ccus);
    if (!selectableSkus.length) {
      errors.push({
        rowId: row.id,
        index,
        message: text(intl, 'error.row.noSku', '{row}: no current RSI CCU SKU is available for this source and target pair.', { row: rowLabel }),
      });
      return;
    }

    const sku = selectableSkus.find((entry) => entry.id === row.selectedSkuId) || selectableSkus[0];
    if (!sku) {
      errors.push({
        rowId: row.id,
        index,
        message: text(intl, 'error.row.selectSku', '{row}: select a current target SKU.', { row: rowLabel }),
      });
      return;
    }

    const upgradeAmount = Number(Math.max(0, (sku.price - fromShip.msrp) / 100).toFixed(2));
    const isStoreCreditSku = sku.price === toShip.msrp;

    resolvedRows.push({
      row,
      index,
      fromShip,
      toShip,
      sku,
      quantity,
      unitCreditAmount: isStoreCreditSku ? upgradeAmount : 0,
      unitCashAmount: isStoreCreditSku ? 0 : upgradeAmount,
      isStoreCreditSku,
    });
  });

  const totalQuantity = resolvedRows.reduce((sum, entry) => sum + entry.quantity, 0);
  const totalCreditAmount = Number(
    resolvedRows.reduce((sum, entry) => sum + entry.unitCreditAmount * entry.quantity, 0).toFixed(2),
  );
  const totalCashAmount = Number(
    resolvedRows.reduce((sum, entry) => sum + entry.unitCashAmount * entry.quantity, 0).toFixed(2),
  );

  return {
    resolvedRows,
    errors,
    totalQuantity,
    totalCreditAmount,
    totalCashAmount,
    batchCount: getBatchCount(totalQuantity),
  };
}

function flattenPreviewRows(preview: ManualCcuPreview): FlattenedCcuEntry[] {
  return preview.resolvedRows.flatMap((resolved) => (
    Array.from({ length: resolved.quantity }, (_, index) => ({
      resolved,
      copyIndex: index,
    }))
  ));
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

export default function CcuBulkCheckout({
  requestIdPrefix = 'ccu-bulk-checkout',
}: CcuBulkCheckoutProps) {
  const intl = useIntl();
  const {
    data: ccusData,
    error: ccusError,
    isLoading: ccusLoading,
    mutate: refreshCcus,
  } = useApi<CcusResponse>('/api/ccus');
  const {
    data: shipsData,
    error: shipsError,
    isLoading: shipsLoading,
    mutate: refreshShips,
  } = useApi<ShipsResponse>('/api/ships');

  const ccus = ccusData?.data?.to?.ships || [];
  const ships = useMemo(() => {
    if (!shipsData?.data?.ships) {
      return [];
    }

    return [...shipsData.data.ships].sort((left, right) => left.msrp - right.msrp);
  }, [shipsData]);
  const shipMap = useMemo(() => new Map(ships.map((ship) => [ship.id, ship])), [ships]);
  const loading = ccusLoading || shipsLoading;
  const dataError = ccusError || shipsError
    ? text(intl, 'error.dataLoadFailed', 'Failed to load current RSI CCU data.')
    : '';

  const [rows, setRows] = useState<ManualCcuRow[]>(() => [createManualCcuRow()]);
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [currentStep, setCurrentStep] = useState('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [flash, setFlash] = useState<{ severity: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [validateMark, setValidateMark] = useState('');
  const [refreshingData, setRefreshingData] = useState(false);
  const runIdRef = useRef(0);

  const preview = useMemo(
    () => buildManualPreview(rows, shipMap, ccus, intl),
    [rows, shipMap, ccus, intl],
  );

  const appendLog = useCallback((level: LogLevel, text: string) => {
    setLogs((current) => {
      const nextEntry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        level,
        text,
      };

      return [...current, nextEntry].slice(-MAX_LOG_ENTRIES);
    });
  }, []);

  const resolveSkuIdForSelection = useCallback((
    fromShipId: number | null,
    toShipId: number | null,
    currentSkuId: number | null,
  ) => {
    const selectableSkus = getSelectableSkus(fromShipId, toShipId, shipMap, ccus);
    if (!selectableSkus.length) {
      return null;
    }

    if (currentSkuId && selectableSkus.some((entry) => entry.id === currentSkuId)) {
      return currentSkuId;
    }

    const toShip = toShipId ? shipMap.get(toShipId) : null;
    const officialSku = toShip
      ? selectableSkus.find((entry) => entry.price === toShip.msrp)
      : null;

    return officialSku?.id || selectableSkus[0]?.id || null;
  }, [ccus, shipMap]);

  const refreshCurrentData = async () => {
    setRefreshingData(true);

    try {
      await Promise.all([
        refreshCcus(),
        refreshShips(),
      ]);
    } finally {
      setRefreshingData(false);
    }
  };

  const updateRowShip = (rowId: string, field: 'fromShipId' | 'toShipId', ship: Ship | null) => {
    setRows((currentRows) => currentRows.map((row) => {
      if (row.id !== rowId) {
        return row;
      }

      const nextRow = {
        ...row,
        [field]: ship?.id || null,
      };

      return {
        ...nextRow,
        selectedSkuId: resolveSkuIdForSelection(nextRow.fromShipId, nextRow.toShipId, row.selectedSkuId),
      };
    }));
  };

  const updateRowSku = (rowId: string, selectedSkuId: number | null) => {
    setRows((currentRows) => currentRows.map((row) => (
      row.id === rowId
        ? { ...row, selectedSkuId }
        : row
    )));
  };

  const updateRowQuantity = (rowId: string, quantityInput: string) => {
    setRows((currentRows) => currentRows.map((row) => (
      row.id === rowId
        ? { ...row, quantityInput }
        : row
    )));
  };

  const addRow = () => {
    setRows((currentRows) => [...currentRows, createManualCcuRow()]);
  };

  const duplicateRow = (row: ManualCcuRow) => {
    setRows((currentRows) => [...currentRows, createManualCcuRow({
      fromShipId: row.fromShipId,
      toShipId: row.toShipId,
      selectedSkuId: row.selectedSkuId,
      quantityInput: row.quantityInput,
    })]);
  };

  const removeRow = (rowId: string) => {
    setRows((currentRows) => {
      if (currentRows.length <= 1) {
        return currentRows;
      }

      return currentRows.filter((row) => row.id !== rowId);
    });
  };

  const requestCheckoutToken = async () => {
    const response = await requestTokenViaExtension({}, {
      timeoutMs: TOKEN_REQUEST_TIMEOUT_MS,
      timeoutMessage: text(intl, 'error.tokenTimeout', 'Token provider did not return a checkout token before the timeout expired.'),
      requestIdPrefix: `${requestIdPrefix}-token-provider`,
    });

    const token = typeof response?.token === 'string' ? response.token.trim() : '';
    if (!token) {
      throw new Error(text(intl, 'error.tokenEmpty', 'Token provider responded successfully, but no token was returned.'));
    }

    return token;
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
      timeoutMessage: text(intl, 'error.extensionTimeout', 'The browser extension request timed out. Make sure the Citizens Hub extension is installed, enabled, and logged in on robertsspaceindustries.com.'),
      requestIdPrefix: `${requestIdPrefix}-${operationName}`,
    }) as GraphqlResponseEnvelope;

    const batch = Array.isArray(response.data) ? response.data : [response.data];
    const item = batch[0] as GraphqlBatchItem<TData> | undefined;
    if (!item) {
      throw new Error(text(intl, 'error.emptyGraphqlBatch', '{operationName} returned an empty GraphQL batch response.', { operationName }));
    }

    if (item.errors?.length) {
      throw new Error(formatGraphqlErrors(intl, item.errors));
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
      throw new Error(text(intl, 'error.noAddress', 'No address is available for the RSI checkout.'));
    }

    return {
      selectedAddress,
      shippingRequired,
      billingRequired,
    };
  };

  const checkoutCurrentCart = async (
    batchOfficialCreditAmount: number,
    batchIndex: number,
    totalBatches: number,
    batchItemCount: number,
  ) => {
    const batchLabel = text(intl, 'batch.label', 'Batch {current}/{total}', { current: batchIndex + 1, total: totalBatches });
    let orderSlug: string | null = null;

    if (batchOfficialCreditAmount > 0) {
      setCurrentStep(`${batchLabel} addingCredit`);
      appendLog('info', text(intl, 'log.applyingCredit', '{batch}: applying store credit {amount}.', { batch: batchLabel, amount: formatUsd(batchOfficialCreditAmount) }));

      const creditItem = await sendRsiGraphql<AddCreditResponse>(
        'AddCreditMutation',
        {
          amount: batchOfficialCreditAmount,
          storeFront: STORE_FRONT,
        },
        ADD_CREDIT_QUERY,
      );

      if (!creditItem.data?.store?.cart?.mutations?.credit_update) {
        throw new Error(text(intl, 'error.creditUpdateFalse', '{batch}: RSI credit update returned false.', { batch: batchLabel }));
      }

      orderSlug = creditItem.data?.store?.order?.slug || orderSlug;
      appendLog('success', text(intl, 'log.creditApplied', '{batch}: store credit applied successfully.', { batch: batchLabel }));
    } else {
      appendLog('info', text(intl, 'log.noCreditApplied', '{batch}: no standard CCUs were selected, so no store credit was applied.', { batch: batchLabel }));
    }

    setCurrentStep(`${batchLabel} movingNext`);
    appendLog('info', text(intl, 'log.movingNext', '{batch}: advancing the RSI checkout flow for {count} CCU item(s).', { batch: batchLabel, count: batchItemCount }));
    const nextItem = await sendRsiGraphql<NextStepResponse>(
      'NextStepMutation',
      { storeFront: STORE_FRONT },
      NEXT_STEP_QUERY,
    );

    if (!nextItem.data?.store?.cart?.mutations?.flow?.moveNext) {
      throw new Error(text(intl, 'error.moveNextFalse', '{batch}: RSI checkout flow did not move to the next step.', { batch: batchLabel }));
    }

    orderSlug = nextItem.data?.store?.order?.slug || orderSlug;
    appendLog('success', text(intl, 'log.movedNext', '{batch}: checkout flow advanced successfully.', { batch: batchLabel }));

    setCurrentStep(`${batchLabel} loadingAddresses`);
    appendLog('info', text(intl, 'log.loadingAddresses', '{batch}: loading the RSI address book.', { batch: batchLabel }));
    const addressSelection = await loadAddressSelectionContext();

    if (addressSelection.selectedAddress?.id && (addressSelection.shippingRequired || addressSelection.billingRequired)) {
      setCurrentStep(`${batchLabel} assigningAddress`);
      appendLog('info', text(intl, 'log.assigningAddress', '{batch}: assigning address {addressId}: {address}.', {
        batch: batchLabel,
        addressId: addressSelection.selectedAddress.id,
        address: formatAddressLabel(addressSelection.selectedAddress),
      }));

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
        throw new Error(text(intl, 'error.addressAssignFalse', '{batch}: RSI address assignment returned false.', { batch: batchLabel }));
      }

      appendLog('success', text(intl, 'log.addressAssigned', '{batch}: address assignment completed successfully.', { batch: batchLabel }));
    } else {
      appendLog('info', text(intl, 'log.noAddressRequired', '{batch}: this checkout does not require billing or shipping addresses.', { batch: batchLabel }));
    }

    setCurrentStep(`${batchLabel} requestingToken`);
    appendLog('info', text(intl, 'log.requestingToken', '{batch}: requesting a checkout token from the browser token provider.', { batch: batchLabel }));
    const token = await requestCheckoutToken();
    appendLog('success', text(intl, 'log.tokenReceived', '{batch}: a checkout token was received successfully.', { batch: batchLabel }));

    setCurrentStep(`${batchLabel} validatingCart`);
    appendLog('info', text(intl, 'log.validatingCart', '{batch}: validating the RSI cart.', { batch: batchLabel }));
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
      throw new Error(text(intl, 'error.noOrderSlug', '{batch}: RSI cart validation did not return an order slug.', { batch: batchLabel }));
    }

    appendLog('success', text(intl, 'log.cartValidated', '{batch}: cart validation succeeded with order slug {orderSlug}.', { batch: batchLabel, orderSlug }));

    setCurrentStep(`${batchLabel} trackingPurchase`);
    appendLog('info', text(intl, 'log.trackingPurchase', '{batch}: fetching purchase tracking for order {orderSlug}.', { batch: batchLabel, orderSlug }));
    const trackingItem = await sendRsiGraphql<PurchaseTrackingResponse>(
      'PurchaseTrackingQuery',
      { orderSlug },
      PURCHASE_TRACKING_QUERY,
    );

    const trackedOrderSlug = trackingItem.data?.order?.order?.slug || orderSlug;
    appendLog(
      'success',
      text(intl, 'log.purchaseTracked', '{batch}: purchase tracking completed for order {orderSlug}. Total: {total}.', {
        batch: batchLabel,
        orderSlug: trackedOrderSlug,
        total: typeof trackingItem.data?.order?.totals?.total === 'number'
          ? formatUsd(trackingItem.data.order.totals.total / 100)
          : text(intl, 'notAvailable', 'N/A'),
      }),
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
      if (loading) {
        throw new Error(text(intl, 'error.dataStillLoading', 'Current RSI CCU data is still loading.'));
      }

      if (dataError) {
        throw new Error(dataError);
      }

      if (!validateMark.trim()) {
        throw new Error(text(intl, 'error.missingValidateMark', 'Please provide the validate mark value before starting CCU bulk checkout.'));
      }

      const latestPreview = buildManualPreview(rows, shipMap, ccus, intl);
      if (latestPreview.errors.length) {
        throw new Error(latestPreview.errors.map((entry) => entry.message).join('\n'));
      }

      if (!latestPreview.totalQuantity) {
        throw new Error(text(intl, 'error.noRows', 'Add at least one CCU before starting bulk checkout.'));
      }

      const flattenedEntries = flattenPreviewRows(latestPreview);
      const totalBatches = getBatchCount(flattenedEntries.length);

      appendLog('warning', text(intl, 'warning.cartNotCleared', 'This tool does not clear the existing RSI official cart. Start from an empty RSI cart to avoid checking out unrelated items.'));
      appendLog(
        'info',
        text(intl, 'log.prepared', 'Prepared {rowCount} manual CCU row(s) with {itemCount} total CCU item(s) across {batchCount} batch(es).', {
          rowCount: latestPreview.resolvedRows.length,
          itemCount: latestPreview.totalQuantity,
          batchCount: totalBatches,
        }),
      );

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
        const batchEntries = flattenedEntries.slice(
          batchIndex * PURCHASE_BATCH_SIZE,
          (batchIndex + 1) * PURCHASE_BATCH_SIZE,
        );
        const batchLabel = text(intl, 'batch.label', 'Batch {current}/{total}', { current: batchIndex + 1, total: totalBatches });
        const batchOfficialCreditAmount = Number(batchEntries.reduce(
          (sum, entry) => sum + entry.resolved.unitCreditAmount,
          0,
        ).toFixed(2));
        const batchCashAmount = Number(batchEntries.reduce(
          (sum, entry) => sum + entry.resolved.unitCashAmount,
          0,
        ).toFixed(2));

        appendLog(
          'info',
          text(intl, 'log.batchStarting', '{batch}: starting checkout for {count} CCU item(s) (estimated credit {credit}, estimated cash {cash}).', {
            batch: batchLabel,
            count: batchEntries.length,
            credit: formatUsd(batchOfficialCreditAmount),
            cash: formatUsd(batchCashAmount),
          }),
        );

        const batchCartEntries = batchEntries.map((entry, entryIndex) => {
          const { resolved } = entry;
          setCurrentStep(`${batchLabel} addingCcus`);
          appendLog(
            'info',
            text(intl, 'log.addingCcu', '{batch}, item {itemIndex}/{itemCount}: adding {fromShip} -> {toShip} ({type}, copy {copyIndex}/{copyCount}, SKU {skuId}).', {
              batch: batchLabel,
              itemIndex: entryIndex + 1,
              itemCount: batchEntries.length,
              fromShip: resolved.fromShip.name,
              toShip: resolved.toShip.name,
              type: resolved.isStoreCreditSku ? text(intl, 'sku.standard', 'Standard') : text(intl, 'sku.wb', 'WB'),
              copyIndex: entry.copyIndex + 1,
              copyCount: resolved.quantity,
              skuId: resolved.sku.id,
            }),
          );

          return {
            fromShipId: resolved.fromShip.id,
            toSkuId: resolved.sku.id,
          };
        });

        await addManyRsiOfficialCcusToCartViaExtension(
          batchCartEntries,
          {
            timeoutMs: RESPONSE_TIMEOUT_MS,
            requestIdPrefix: `${requestIdPrefix}-batch-${batchIndex + 1}`,
          },
        );

        appendLog('success', text(intl, 'log.addedToCart', '{batch}: added {count} CCU item(s) to the RSI cart.', { batch: batchLabel, count: batchCartEntries.length }));

        await checkoutCurrentCart(batchOfficialCreditAmount, batchIndex, totalBatches, batchCartEntries.length);

        if (runIdRef.current !== currentRunId) {
          return;
        }

        if (batchIndex < totalBatches - 1) {
          const delayMs = getRandomBatchDelayMs();
          setCurrentStep(`${batchLabel} waiting`);
          appendLog('info', text(intl, 'log.waitingNextBatch', '{batch}: waiting {delayMs}ms before the next batch.', { batch: batchLabel, delayMs }));
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
        text: text(intl, 'success.completed', 'CCU bulk checkout completed successfully for {count} CCU item(s) across {batchCount} batch(es).', {
          count: latestPreview.totalQuantity,
          batchCount: totalBatches,
        }),
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
    || refreshingData
    || phase === 'running'
    || Boolean(dataError)
    || preview.errors.length > 0
    || !preview.totalQuantity
    || !validateMark.trim();

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{text(intl, 'title', 'CCU Bulk Checkout')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {text(intl, 'description', 'Configure CCUs manually, add them to the RSI cart in batches of up to 5 items, and complete each checkout with the browser token provider.')}
          </Typography>

          <Alert severity="warning">
            {text(intl, 'warning.cartNotCleared', 'This tool does not clear the existing RSI official cart. Start from an empty RSI cart to avoid checking out unrelated items.')}
          </Alert>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap={2}>
            <TextField
              label={text(intl, 'field.validateMark', 'Validate mark')}
              value={validateMark}
              onChange={(event) => setValidateMark(event.target.value)}
              disabled={phase === 'running'}
              autoComplete="off"
              helperText={text(intl, 'field.validateMarkHelp', 'Provide the current validate mark manually for this run.')}
            />
            <TextField
              label={text(intl, 'field.tokenSource', 'Token source')}
              value={text(intl, 'field.tokenProvider', 'Browser token provider')}
              disabled
              helperText={text(intl, 'field.tokenSourceHelp', 'Uses the browser extension token provider for checkout validation.')}
            />
          </Box>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <Button
              variant="outlined"
              startIcon={refreshingData ? <CircularProgress size={16} color="inherit" /> : <Refresh />}
              onClick={refreshCurrentData}
              disabled={refreshingData || phase === 'running'}
            >
              {refreshingData
                ? text(intl, 'action.refreshingData', 'Refreshing data...')
                : text(intl, 'action.refreshData', 'Refresh current CCU data')}
            </Button>
            <Button
              variant="outlined"
              startIcon={<Add />}
              onClick={addRow}
              disabled={phase === 'running'}
            >
              {text(intl, 'action.addRow', 'Add CCU row')}
            </Button>
            <Button
              variant="contained"
              startIcon={phase === 'running' ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
              onClick={handleRun}
              disabled={runDisabled}
            >
              {phase === 'running'
                ? text(intl, 'action.running', 'Running CCU bulk checkout...')
                : text(intl, 'action.start', 'Start CCU bulk checkout')}
            </Button>
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={text(intl, 'chip.dataStatus', 'Data status: {status}', { status: loading ? text(intl, 'status.loading', 'Loading') : dataError ? text(intl, 'status.error', 'Error') : text(intl, 'status.ready', 'Ready') })} color={dataError ? 'error' : loading ? 'default' : 'success'} />
            <Chip label={text(intl, 'chip.runPhase', 'Run phase: {phase}', { phase })} color={phase === 'success' ? 'success' : phase === 'failure' ? 'error' : phase === 'running' ? 'info' : 'default'} />
            <Chip label={text(intl, 'chip.currentStep', 'Current step: {step}', { step: currentStep })} />
            <Chip label={text(intl, 'chip.manualRows', 'Manual rows {count}', { count: rows.length })} />
            <Chip label={text(intl, 'chip.validCcus', 'Valid CCUs {count}', { count: preview.totalQuantity })} color={preview.totalQuantity ? 'success' : 'default'} />
            <Chip label={text(intl, 'chip.batches', 'Batches {count}', { count: preview.batchCount })} />
            <Chip label={text(intl, 'chip.storeCredit', 'Store credit {amount}', { amount: formatUsd(preview.totalCreditAmount) })} />
            <Chip label={text(intl, 'chip.cash', 'Cash {amount}', { amount: formatUsd(preview.totalCashAmount) })} />
            <Chip label={text(intl, 'chip.invalidRows', 'Invalid rows {count}', { count: preview.errors.length })} color={preview.errors.length ? 'error' : 'default'} />
          </Stack>

          {flash ? <Alert severity={flash.severity} sx={{ whiteSpace: 'pre-line' }}>{flash.text}</Alert> : null}
          {dataError ? <Alert severity="error">{dataError}</Alert> : null}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{text(intl, 'manualSetup.title', 'Manual CCU Setup')}</Typography>

          {rows.map((row, index) => {
            const fromShip = row.fromShipId ? shipMap.get(row.fromShipId) || null : null;
            const toShip = row.toShipId ? shipMap.get(row.toShipId) || null : null;
            const skuOptions = getSelectableSkus(row.fromShipId, row.toShipId, shipMap, ccus);
            const selectedSku = skuOptions.find((entry) => entry.id === row.selectedSkuId) || skuOptions[0] || null;
            const rowError = preview.errors.find((entry) => entry.rowId === row.id);
            const resolvedRow = preview.resolvedRows.find((entry) => entry.row.id === row.id);

            return (
              <Paper key={row.id} variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', lg: 'flex-start' }}>
                    <Autocomplete
                      options={ships}
                      value={fromShip}
                      onChange={(_, value) => updateRowShip(row.id, 'fromShipId', value)}
                      getOptionLabel={formatShipOption}
                      isOptionEqualToValue={(option, value) => option.id === value.id}
                      disabled={phase === 'running' || loading}
                      sx={{ minWidth: { xs: '100%', lg: 260 }, flex: 1 }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label={text(intl, 'field.sourceShipWithRow', 'Row {index} source ship', { index: index + 1 })}
                          placeholder={text(intl, 'field.fromShip', 'From ship')}
                        />
                      )}
                    />
                    <Autocomplete
                      options={ships}
                      value={toShip}
                      onChange={(_, value) => updateRowShip(row.id, 'toShipId', value)}
                      getOptionLabel={formatShipOption}
                      isOptionEqualToValue={(option, value) => option.id === value.id}
                      disabled={phase === 'running' || loading}
                      sx={{ minWidth: { xs: '100%', lg: 260 }, flex: 1 }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label={text(intl, 'field.targetShip', 'Target ship')}
                          placeholder={text(intl, 'field.toShip', 'To ship')}
                        />
                      )}
                    />
                    <TextField
                      select
                      label={text(intl, 'field.targetSku', 'Target SKU')}
                      value={selectedSku?.id ?? ''}
                      onChange={(event) => updateRowSku(row.id, event.target.value ? Number(event.target.value) : null)}
                      disabled={phase === 'running' || loading || !skuOptions.length}
                      helperText={skuOptions.length
                        ? text(intl, 'field.targetSkuHelp', 'Standard uses store credit; WB stays cash.')
                        : text(intl, 'field.targetSkuSelectPair', 'Select a valid source and target pair first.')}
                      sx={{ minWidth: { xs: '100%', lg: 300 }, flex: 1 }}
                    >
                      {skuOptions.map((sku) => (
                        <MenuItem key={sku.id} value={sku.id}>
                          {formatSkuLabel(intl, sku, fromShip, toShip)}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      label={text(intl, 'field.quantity', 'Quantity')}
                      value={row.quantityInput}
                      onChange={(event) => updateRowQuantity(row.id, event.target.value)}
                      disabled={phase === 'running'}
                      type="number"
                      inputProps={{ min: 1, step: 1 }}
                      error={Boolean(row.quantityInput.trim()) && !parseRequestedQuantity(row.quantityInput)}
                      sx={{ width: { xs: '100%', lg: 120 } }}
                    />
                    <Stack direction="row" spacing={1}>
                      <Button
                        variant="outlined"
                        onClick={() => duplicateRow(row)}
                        disabled={phase === 'running'}
                        sx={{ whiteSpace: 'nowrap' }}
                      >
                        {text(intl, 'action.duplicate', 'Duplicate')}
                      </Button>
                      <Tooltip title={text(intl, 'action.removeRow', 'Remove row')}>
                        <span>
                          <IconButton
                            color="error"
                            onClick={() => removeRow(row.id)}
                            disabled={phase === 'running' || rows.length <= 1}
                          >
                            <DeleteOutline />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </Stack>

                  {resolvedRow ? (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip size="small" label={resolvedRow.isStoreCreditSku ? text(intl, 'sku.standard', 'Standard') : text(intl, 'sku.wb', 'WB')} color={resolvedRow.isStoreCreditSku ? 'info' : 'warning'} />
                      <Chip size="small" label={text(intl, 'chip.sku', 'SKU {skuId}', { skuId: resolvedRow.sku.id })} />
                      <Chip size="small" label={text(intl, 'chip.quantity', 'Quantity {count}', { count: resolvedRow.quantity })} />
                      <Chip size="small" label={text(intl, 'chip.unitCredit', 'Unit credit {amount}', { amount: formatUsd(resolvedRow.unitCreditAmount) })} />
                      <Chip size="small" label={text(intl, 'chip.unitCash', 'Unit cash {amount}', { amount: formatUsd(resolvedRow.unitCashAmount) })} />
                      <Chip size="small" label={text(intl, 'chip.lineTotal', 'Line total {amount}', { amount: formatUsd((resolvedRow.unitCreditAmount + resolvedRow.unitCashAmount) * resolvedRow.quantity) })} />
                    </Stack>
                  ) : null}

                  {rowError ? <Alert severity="error">{rowError.message}</Alert> : null}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{text(intl, 'preview.title', 'Purchase Preview')}</Typography>

          {!preview.resolvedRows.length && !preview.errors.length ? (
            <Typography variant="body2" color="text.secondary">
              {text(intl, 'preview.empty', 'Add a source ship, target ship, target SKU, and quantity to preview the batch.')}
            </Typography>
          ) : null}

          {preview.resolvedRows.length ? (
            <Stack spacing={1.5}>
              {preview.resolvedRows.map((entry) => (
                <Paper key={entry.row.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between">
                    <Typography variant="body2" fontWeight={600}>
                      {entry.index + 1}. {entry.fromShip.name} -&gt; {entry.toShip.name}
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip size="small" label={entry.isStoreCreditSku ? text(intl, 'sku.standard', 'Standard') : text(intl, 'sku.wb', 'WB')} color={entry.isStoreCreditSku ? 'info' : 'warning'} />
                      <Chip size="small" label={text(intl, 'chip.sku', 'SKU {skuId}', { skuId: entry.sku.id })} />
                      <Chip size="small" label={text(intl, 'chip.quantity', 'Quantity {count}', { count: entry.quantity })} />
                      <Chip size="small" label={text(intl, 'chip.target', 'Target {amount}', { amount: formatUsd(entry.sku.price / 100) })} />
                      <Chip size="small" label={text(intl, 'chip.unit', 'Unit {amount}', { amount: formatUsd((entry.sku.price - entry.fromShip.msrp) / 100) })} />
                    </Stack>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          ) : null}

          {preview.errors.length ? (
            <Alert severity="error" sx={{ whiteSpace: 'pre-line' }}>
              {preview.errors.map((entry) => entry.message).join('\n')}
            </Alert>
          ) : null}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">{text(intl, 'runLog.title', 'Run Log')}</Typography>
          {!logs.length ? (
            <Typography variant="body2" color="text.secondary">
              {text(intl, 'runLog.empty', 'No run logs yet.')}
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
                    whiteSpace: 'pre-line',
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
