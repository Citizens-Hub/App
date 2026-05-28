import {
  Add,
  ArrowDownward,
  ArrowUpward,
  AutoFixHigh,
  CloudDownload,
  ContentCopy,
  DeleteOutline,
  PlayArrow,
  Save,
} from '@mui/icons-material';
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
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import { requestViaExtension } from '@/utils/extensionHttpRequest';

const RESPONSE_TIMEOUT_MS = 20_000;
const DEFAULT_ENDPOINT = 'https://robertsspaceindustries.com/graphql';
const UPGRADE_ENDPOINT = 'https://robertsspaceindustries.com/pledge-store/api/upgrade/graphql';
const DEFAULT_PAYLOAD_TEXT = '[]';
const DRAFT_STORAGE_KEY = 'admin-graphql-debugger-draft-v1';
const SAVED_REQUESTS_STORAGE_KEY = 'admin-graphql-debugger-saved-requests-v1';
const CHAIN_STORAGE_KEY = 'admin-graphql-debugger-chain-v1';

type FlashState = {
  severity: 'success' | 'error';
  text: string;
} | null;

type RequestStatus = 'idle' | 'requesting' | 'success' | 'failure';

type ResponseSnapshot = {
  status: number | null;
  statusText: string;
  receivedAt: string;
  value: unknown;
};

type SavedRequest = {
  id: string;
  name: string;
  url: string;
  payload: string;
  updatedAt: string;
  responseSnapshot: ResponseSnapshot | null;
};

type DraftState = {
  selectedEndpoint: string;
  selectedSavedRequestId: string | null;
  requestName: string;
  payloadText: string;
};

type GraphqlResponseEnvelope = {
  status?: number;
  statusText?: string;
  data?: unknown;
};

const ENDPOINT_OPTIONS = [
  {
    value: DEFAULT_ENDPOINT,
    labelId: 'admin.graphqlDebugger.endpoint.store',
    defaultMessage: 'RSI Store GraphQL',
  },
  {
    value: UPGRADE_ENDPOINT,
    labelId: 'admin.graphqlDebugger.endpoint.upgrade',
    defaultMessage: 'RSI Upgrade GraphQL',
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isValidEndpoint(value: unknown): value is string {
  return typeof value === 'string' && ENDPOINT_OPTIONS.some((option) => option.value === value);
}

function normalizeEndpoint(value: unknown): string {
  return isValidEndpoint(value) ? value : DEFAULT_ENDPOINT;
}

function readSavedRequests(): SavedRequest[] {
  try {
    const raw = localStorage.getItem(SAVED_REQUESTS_STORAGE_KEY);
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
      const url = normalizeEndpoint(entry.url);
      const payload = typeof entry.payload === 'string' ? entry.payload : DEFAULT_PAYLOAD_TEXT;
      const updatedAt = typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date(0).toISOString();
      const responseSnapshot = parseResponseSnapshot(entry.responseSnapshot);

      if (!id || !name) {
        return [];
      }

      return [{
        id,
        name,
        url,
        payload,
        updatedAt,
        responseSnapshot,
      }];
    });
  } catch {
    return [];
  }
}

function parseResponseSnapshot(value: unknown): ResponseSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const receivedAt = typeof value.receivedAt === 'string' ? value.receivedAt : null;
  if (!receivedAt) {
    return null;
  }

  return {
    status: typeof value.status === 'number' ? value.status : null,
    statusText: typeof value.statusText === 'string' ? value.statusText : '',
    receivedAt,
    value: 'value' in value ? value.value : null,
  };
}

function readDraft(): DraftState {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
      return {
        selectedEndpoint: DEFAULT_ENDPOINT,
        selectedSavedRequestId: null,
        requestName: '',
        payloadText: DEFAULT_PAYLOAD_TEXT,
      };
    }

    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      throw new Error('Invalid draft state');
    }

    return {
      selectedEndpoint: normalizeEndpoint(parsed.selectedEndpoint),
      selectedSavedRequestId: typeof parsed.selectedSavedRequestId === 'string' ? parsed.selectedSavedRequestId : null,
      requestName: typeof parsed.requestName === 'string' ? parsed.requestName : '',
      payloadText: typeof parsed.payloadText === 'string' ? parsed.payloadText : DEFAULT_PAYLOAD_TEXT,
    };
  } catch {
    return {
      selectedEndpoint: DEFAULT_ENDPOINT,
      selectedSavedRequestId: null,
      requestName: '',
      payloadText: DEFAULT_PAYLOAD_TEXT,
    };
  }
}

function writeSavedRequests(savedRequests: SavedRequest[]) {
  try {
    localStorage.setItem(SAVED_REQUESTS_STORAGE_KEY, JSON.stringify(savedRequests));
  } catch {
    // Ignore localStorage failures and keep the current session usable.
  }
}

function writeDraft(draft: DraftState) {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore localStorage failures and keep the current session usable.
  }
}

function readChainRequestIds(): string[] {
  try {
    const raw = localStorage.getItem(CHAIN_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

function writeChainRequestIds(requestIds: string[]) {
  try {
    localStorage.setItem(CHAIN_STORAGE_KEY, JSON.stringify(requestIds));
  } catch {
    // Ignore localStorage failures and keep the current session usable.
  }
}

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildRequestFingerprint(url: string, payloadText: string) {
  return JSON.stringify([url, payloadText]);
}

function formatTimestamp(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(locale);
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function formatErrorMessage(intl: ReturnType<typeof useIntl>, error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return intl.formatMessage({
    id: 'admin.graphqlDebugger.error.generic',
    defaultMessage: 'The browser extension request failed.',
  });
}

function parsePayloadText(intl: ReturnType<typeof useIntl>, payloadText: string): Record<string, unknown> | Array<unknown> {
  const trimmed = payloadText.trim();
  if (!trimmed) {
    throw new Error(intl.formatMessage({
      id: 'admin.graphqlDebugger.error.emptyPayload',
      defaultMessage: 'Please enter a GraphQL JSON payload before sending the request.',
    }));
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (!parsed || typeof parsed !== 'object') {
      throw new Error(intl.formatMessage({
        id: 'admin.graphqlDebugger.error.invalidPayloadType',
        defaultMessage: 'The GraphQL payload must be a JSON object or array.',
      }));
    }

    return parsed as Record<string, unknown> | Array<unknown>;
  } catch (error) {
    if (error instanceof Error && error.message) {
      throw error;
    }

    throw new Error(intl.formatMessage({
      id: 'admin.graphqlDebugger.error.invalidJson',
      defaultMessage: 'The payload is not valid JSON.',
    }));
  }
}

function buildRequestName(
  intl: ReturnType<typeof useIntl>,
  payloadText: string,
  fallbackIndex: number,
): string {
  try {
    const parsed = JSON.parse(payloadText) as unknown;
    const candidate = Array.isArray(parsed)
      ? parsed.find((entry) => isRecord(entry) && typeof entry.operationName === 'string')
      : parsed;

    if (isRecord(candidate) && typeof candidate.operationName === 'string' && candidate.operationName.trim()) {
      return candidate.operationName.trim();
    }
  } catch {
    // Ignore parse errors and fall back to a generated name.
  }

  return intl.formatMessage(
    {
      id: 'admin.graphqlDebugger.defaultName',
      defaultMessage: 'Request {index}',
    },
    { index: fallbackIndex },
  );
}

function buildDownloadFilename(prefix: string) {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([formatJson(value)], {
    type: 'application/json;charset=utf-8',
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = href;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(href);
}

function getStatusChipColor(statusCode: number | null): 'default' | 'success' | 'warning' | 'error' {
  if (statusCode === null) {
    return 'default';
  }

  if (statusCode >= 200 && statusCode < 300) {
    return 'success';
  }

  if (statusCode >= 400 && statusCode < 500) {
    return 'warning';
  }

  if (statusCode >= 500) {
    return 'error';
  }

  return 'default';
}

export default function AdminGraphqlDebugger() {
  const intl = useIntl();
  const initialDraft = readDraft();
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>(() => readSavedRequests());
  const [chainRequestIds, setChainRequestIds] = useState<string[]>(() => readChainRequestIds());
  const [selectedEndpoint, setSelectedEndpoint] = useState(initialDraft.selectedEndpoint);
  const [selectedSavedRequestId, setSelectedSavedRequestId] = useState<string | null>(initialDraft.selectedSavedRequestId);
  const [requestName, setRequestName] = useState(initialDraft.requestName);
  const [payloadText, setPayloadText] = useState(initialDraft.payloadText);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle');
  const [requestError, setRequestError] = useState('');
  const [flash, setFlash] = useState<FlashState>(null);
  const [sending, setSending] = useState(false);
  const [responseValue, setResponseValue] = useState<unknown>(null);
  const [responseText, setResponseText] = useState('');
  const [responseStatusCode, setResponseStatusCode] = useState<number | null>(null);
  const [responseStatusText, setResponseStatusText] = useState('');
  const [responseReceivedAt, setResponseReceivedAt] = useState<string | null>(null);

  const selectedSavedRequest = savedRequests.find((item) => item.id === selectedSavedRequestId) || null;
  const selectedSavedRequestFingerprint = selectedSavedRequest
    ? buildRequestFingerprint(selectedSavedRequest.url, selectedSavedRequest.payload)
    : null;
  const currentDraftFingerprint = buildRequestFingerprint(selectedEndpoint, payloadText);
  const hasUnsavedChanges = Boolean(
    selectedSavedRequest
    && (
      selectedSavedRequest.name !== requestName
      || selectedSavedRequest.url !== selectedEndpoint
      || selectedSavedRequest.payload !== payloadText
    )
  );
  const chainRequests = chainRequestIds
    .map((requestId) => savedRequests.find((item) => item.id === requestId) || null)
    .filter((item): item is SavedRequest => item !== null);
  const availableChainRequests = savedRequests.filter((item) => !chainRequestIds.includes(item.id));

  useEffect(() => {
    writeSavedRequests(savedRequests);
  }, [savedRequests]);

  useEffect(() => {
    setChainRequestIds((current) => current.filter((requestId) => savedRequests.some((item) => item.id === requestId)));
  }, [savedRequests]);

  useEffect(() => {
    writeChainRequestIds(chainRequestIds);
  }, [chainRequestIds]);

  useEffect(() => {
    writeDraft({
      selectedEndpoint,
      selectedSavedRequestId,
      requestName,
      payloadText,
    });
  }, [selectedEndpoint, selectedSavedRequestId, requestName, payloadText]);

  const statusText = (() => {
    switch (requestStatus) {
      case 'requesting':
        return intl.formatMessage(
          {
            id: 'admin.graphqlDebugger.status.requesting',
            defaultMessage: 'Requesting {url} through the browser extension...',
          },
          { url: selectedEndpoint },
        );
      case 'success':
        return intl.formatMessage({
          id: 'admin.graphqlDebugger.status.success',
          defaultMessage: 'The GraphQL request completed successfully.',
        });
      case 'failure':
        return intl.formatMessage({
          id: 'admin.graphqlDebugger.status.failure',
          defaultMessage: 'The GraphQL request failed.',
        });
      default:
        return intl.formatMessage({
          id: 'admin.graphqlDebugger.status.idle',
          defaultMessage: 'Edit the payload, choose one of the two RSI GraphQL endpoints, then send the request through the browser extension.',
        });
    }
  })();

  const handleLoadSavedRequest = (requestId: string) => {
    if (!requestId) {
      setSelectedSavedRequestId(null);
      return;
    }

    const matched = savedRequests.find((item) => item.id === requestId);
    if (!matched) {
      return;
    }

    setSelectedSavedRequestId(matched.id);
    setSelectedEndpoint(matched.url);
    setRequestName(matched.name);
    setPayloadText(matched.payload);
    setRequestError('');
    setFlash(null);
  };

  const handleNewDraft = () => {
    setSelectedSavedRequestId(null);
    setSelectedEndpoint(DEFAULT_ENDPOINT);
    setRequestName('');
    setPayloadText(DEFAULT_PAYLOAD_TEXT);
    setRequestStatus('idle');
    setRequestError('');
    setFlash(null);
    setResponseValue(null);
    setResponseText('');
    setResponseStatusCode(null);
    setResponseStatusText('');
    setResponseReceivedAt(null);
  };

  const handleSaveRequest = () => {
    setRequestError('');
    setFlash(null);

    const normalizedName = requestName.trim() || buildRequestName(intl, payloadText, savedRequests.length + 1);
    const nextEntry: SavedRequest = {
      id: selectedSavedRequestId || createRequestId(),
      name: normalizedName,
      url: selectedEndpoint,
      payload: payloadText,
      updatedAt: new Date().toISOString(),
      responseSnapshot: selectedSavedRequestFingerprint === currentDraftFingerprint
        ? selectedSavedRequest?.responseSnapshot || null
        : null,
    };

    setSavedRequests((current) => {
      const filtered = current.filter((item) => item.id !== nextEntry.id);
      return [nextEntry, ...filtered].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    });
    setSelectedSavedRequestId(nextEntry.id);
    setRequestName(normalizedName);
    setFlash({
      severity: 'success',
      text: intl.formatMessage({
        id: 'admin.graphqlDebugger.saveSuccess',
        defaultMessage: 'The request has been saved to local storage.',
      }),
    });
  };

  const handleDeleteRequest = () => {
    if (!selectedSavedRequest) {
      return;
    }

    const confirmed = window.confirm(
      intl.formatMessage(
        {
          id: 'admin.graphqlDebugger.deleteConfirm',
          defaultMessage: 'Delete the saved request "{name}" from local storage?',
        },
        { name: selectedSavedRequest.name },
      ),
    );

    if (!confirmed) {
      return;
    }

    setSavedRequests((current) => current.filter((item) => item.id !== selectedSavedRequest.id));
    setChainRequestIds((current) => current.filter((requestId) => requestId !== selectedSavedRequest.id));
    setSelectedSavedRequestId(null);
    setFlash({
      severity: 'success',
      text: intl.formatMessage({
        id: 'admin.graphqlDebugger.deleteSuccess',
        defaultMessage: 'The saved request has been removed from local storage.',
      }),
    });
  };

  const handleFormatPayload = () => {
    try {
      const parsed = parsePayloadText(intl, payloadText);
      setPayloadText(formatJson(parsed));
      setRequestError('');
    } catch (error) {
      setRequestError(formatErrorMessage(intl, error));
    }
  };

  const handleSendRequest = async () => {
    if (sending) {
      return;
    }

    setSending(true);
    setRequestStatus('requesting');
    setRequestError('');
    setFlash(null);

    try {
      const parsedPayload = parsePayloadText(intl, payloadText);
      const response = await requestViaExtension(
        {
          url: selectedEndpoint,
          responseType: 'json',
          method: 'post',
          data: parsedPayload,
          headers: {
            'content-type': 'application/json',
          },
        },
        {
          timeoutMs: RESPONSE_TIMEOUT_MS,
          timeoutMessage: intl.formatMessage({
            id: 'admin.graphqlDebugger.error.timeout',
            defaultMessage: "The browser extension request timed out. Make sure the Citizens' Hub extension is installed, enabled, and that you are logged in on robertsspaceindustries.com.",
          }),
          requestIdPrefix: 'admin-graphql-debugger',
        },
      );

      const envelope = isRecord(response) ? response as GraphqlResponseEnvelope : {};
      const receivedAt = new Date().toISOString();
      const responseSnapshot: ResponseSnapshot = {
        status: typeof envelope.status === 'number' ? envelope.status : null,
        statusText: typeof envelope.statusText === 'string' ? envelope.statusText : '',
        receivedAt,
        value: response,
      };

      setResponseValue(response);
      setResponseText(formatJson(response));
      setResponseStatusCode(responseSnapshot.status);
      setResponseStatusText(responseSnapshot.statusText);
      setResponseReceivedAt(receivedAt);
      setRequestStatus('success');

      if (selectedSavedRequest && selectedSavedRequestFingerprint === currentDraftFingerprint) {
        setSavedRequests((current) => current.map((item) => (
          item.id === selectedSavedRequest.id
            ? {
              ...item,
              responseSnapshot,
            }
            : item
        )));
      }
    } catch (error) {
      setRequestStatus('failure');
      setRequestError(formatErrorMessage(intl, error));
    } finally {
      setSending(false);
    }
  };

  const handleCopyResponse = async () => {
    if (!responseText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(responseText);
      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.graphqlDebugger.copySuccess',
          defaultMessage: 'The response JSON has been copied.',
        }),
      });
    } catch {
      setFlash({
        severity: 'error',
        text: intl.formatMessage({
          id: 'admin.graphqlDebugger.copyFailure',
          defaultMessage: 'Failed to copy the response JSON.',
        }),
      });
    }
  };

  const handleDownloadResponse = () => {
    if (responseValue === null) {
      return;
    }

    downloadJson(buildDownloadFilename('admin-graphql-response'), responseValue);
  };

  const handleAddRequestToChain = (requestId: string) => {
    if (!requestId || chainRequestIds.includes(requestId)) {
      return;
    }

    setChainRequestIds((current) => [...current, requestId]);
  };

  const handleRemoveRequestFromChain = (requestId: string) => {
    setChainRequestIds((current) => current.filter((item) => item !== requestId));
  };

  const handleMoveChainRequest = (requestId: string, direction: -1 | 1) => {
    setChainRequestIds((current) => {
      const index = current.indexOf(requestId);
      if (index === -1) {
        return current;
      }

      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const handleExportChain = () => {
    if (chainRequests.length === 0) {
      setFlash({
        severity: 'error',
        text: intl.formatMessage({
          id: 'admin.graphqlDebugger.chain.exportEmpty',
          defaultMessage: 'Select at least one saved request before exporting a request chain.',
        }),
      });
      return;
    }

    const exportedAt = new Date().toISOString();
    const chainPayload = {
      version: 1,
      exportedAt,
      requestCount: chainRequests.length,
      requests: chainRequests.map((item, index) => ({
        order: index + 1,
        id: item.id,
        name: item.name,
        url: item.url,
        payload: tryParseJson(item.payload) ?? item.payload,
        payloadText: item.payload,
        updatedAt: item.updatedAt,
        responseSnapshot: item.responseSnapshot,
      })),
    };

    downloadJson(buildDownloadFilename('admin-graphql-request-chain'), chainPayload);
    setFlash({
      severity: 'success',
      text: intl.formatMessage(
        {
          id: 'admin.graphqlDebugger.chain.exportSuccess',
          defaultMessage: 'Exported a request chain with {count} saved requests.',
        },
        { count: chainRequests.length },
      ),
    });
  };

  return (
    <Stack spacing={2.5}>
      {flash ? <Alert severity={flash.severity}>{flash.text}</Alert> : null}
      {requestError ? <Alert severity="error">{requestError}</Alert> : null}

      <Alert severity="info">
        <Typography variant="body2">
          {intl.formatMessage({
            id: 'admin.graphqlDebugger.requirements',
            defaultMessage: "This tool sends requests through the Citizens' Hub browser extension. Make sure the extension is installed and that the same browser is logged in on robertsspaceindustries.com.",
          })}
        </Typography>
      </Alert>

      <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }} elevation={0}>
        <Stack spacing={2.5}>
          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap={2}>
            <TextField
              select
              label={intl.formatMessage({
                id: 'admin.graphqlDebugger.savedRequests',
                defaultMessage: 'Saved Requests',
              })}
              value={selectedSavedRequestId ?? ''}
              onChange={(event) => handleLoadSavedRequest(event.target.value)}
              fullWidth
            >
              <MenuItem value="">
                {intl.formatMessage({
                  id: 'admin.graphqlDebugger.savedRequests.none',
                  defaultMessage: 'Current Draft',
                })}
              </MenuItem>
              {savedRequests.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label={intl.formatMessage({
                id: 'admin.graphqlDebugger.endpoint',
                defaultMessage: 'GraphQL Endpoint',
              })}
              value={selectedEndpoint}
              onChange={(event) => setSelectedEndpoint(normalizeEndpoint(event.target.value))}
              fullWidth
            >
              {ENDPOINT_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {intl.formatMessage({
                    id: option.labelId,
                    defaultMessage: option.defaultMessage,
                  })}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              label={selectedSavedRequest
                ? intl.formatMessage(
                  {
                    id: 'admin.graphqlDebugger.selectedSavedRequest',
                    defaultMessage: 'Saved: {name}',
                  },
                  { name: selectedSavedRequest.name },
                )
                : intl.formatMessage({
                  id: 'admin.graphqlDebugger.currentDraft',
                  defaultMessage: 'Current Draft',
                })}
            />
            {selectedSavedRequest ? (
              <Chip
                size="small"
                color={hasUnsavedChanges ? 'warning' : 'success'}
                label={hasUnsavedChanges
                  ? intl.formatMessage({
                    id: 'admin.graphqlDebugger.unsavedChanges',
                    defaultMessage: 'Unsaved Changes',
                  })
                  : intl.formatMessage({
                    id: 'admin.graphqlDebugger.savedState',
                    defaultMessage: 'Saved',
                  })}
              />
            ) : null}
            {selectedSavedRequest ? (
              <Chip
                size="small"
                label={intl.formatMessage(
                  {
                    id: 'admin.graphqlDebugger.lastSaved',
                    defaultMessage: 'Last Saved {time}',
                  },
                  { time: formatTimestamp(selectedSavedRequest.updatedAt, intl.locale) },
                )}
              />
            ) : null}
            {responseStatusCode !== null ? (
              <Chip
                size="small"
                color={getStatusChipColor(responseStatusCode)}
                label={intl.formatMessage(
                  {
                    id: 'admin.graphqlDebugger.httpStatus',
                    defaultMessage: 'HTTP {status}{suffix}',
                  },
                  {
                    status: responseStatusCode,
                    suffix: responseStatusText ? ` ${responseStatusText}` : '',
                  },
                )}
              />
            ) : null}
          </Stack>

          <TextField
            label={intl.formatMessage({
              id: 'admin.graphqlDebugger.requestName',
              defaultMessage: 'Request Name',
            })}
            value={requestName}
            onChange={(event) => setRequestName(event.target.value)}
            fullWidth
          />

          <TextField
            label={intl.formatMessage({
              id: 'admin.graphqlDebugger.payload',
              defaultMessage: 'GraphQL Payload',
            })}
            value={payloadText}
            onChange={(event) => setPayloadText(event.target.value)}
            multiline
            minRows={18}
            maxRows={28}
            fullWidth
            helperText={intl.formatMessage({
              id: 'admin.graphqlDebugger.payloadHelper',
              defaultMessage: 'Paste a JSON object or a batch array copied from the browser network panel, then edit it manually as needed.',
            })}
            sx={{
              '& .MuiInputBase-inputMultiline': {
                fontFamily: 'monospace',
                fontSize: 13,
                lineHeight: 1.5,
              },
            }}
          />

          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              startIcon={<Add />}
              onClick={handleNewDraft}
            >
              {intl.formatMessage({
                id: 'admin.graphqlDebugger.newDraft',
                defaultMessage: 'New Draft',
              })}
            </Button>
            <Button
              variant="outlined"
              startIcon={<Save />}
              onClick={handleSaveRequest}
            >
              {intl.formatMessage({
                id: 'admin.graphqlDebugger.saveRequest',
                defaultMessage: 'Save to Local Storage',
              })}
            </Button>
            <Button
              variant="outlined"
              color="warning"
              startIcon={<DeleteOutline />}
              onClick={handleDeleteRequest}
              disabled={!selectedSavedRequest}
            >
              {intl.formatMessage({
                id: 'admin.graphqlDebugger.deleteRequest',
                defaultMessage: 'Delete Saved Request',
              })}
            </Button>
            <Button
              variant="outlined"
              startIcon={<AutoFixHigh />}
              onClick={handleFormatPayload}
            >
              {intl.formatMessage({
                id: 'admin.graphqlDebugger.formatPayload',
                defaultMessage: 'Format JSON',
              })}
            </Button>
            <Button
              variant="contained"
              startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
              onClick={() => {
                void handleSendRequest();
              }}
              disabled={sending}
            >
              {sending
                ? intl.formatMessage({
                  id: 'admin.graphqlDebugger.sending',
                  defaultMessage: 'Requesting...',
                })
                : intl.formatMessage({
                  id: 'admin.graphqlDebugger.sendRequest',
                  defaultMessage: 'Send GraphQL Request',
                })}
            </Button>
          </Stack>

          <Typography variant="body2" color="text.secondary">
            {statusText}
          </Typography>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }} elevation={0}>
        <Stack spacing={2}>
          <Box display="flex" justifyContent="space-between" alignItems="center" gap={2} flexWrap="wrap">
            <Box>
              <Typography variant="h6">
                {intl.formatMessage({
                  id: 'admin.graphqlDebugger.responseTitle',
                  defaultMessage: 'Response',
                })}
              </Typography>
              {responseReceivedAt ? (
                <Typography variant="body2" color="text.secondary">
                  {intl.formatMessage(
                    {
                      id: 'admin.graphqlDebugger.responseReceivedAt',
                      defaultMessage: 'Received at {time}',
                    },
                    { time: formatTimestamp(responseReceivedAt, intl.locale) },
                  )}
                </Typography>
              ) : null}
            </Box>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                variant="outlined"
                startIcon={<ContentCopy />}
                onClick={() => {
                  void handleCopyResponse();
                }}
                disabled={!responseText}
              >
                {intl.formatMessage({
                  id: 'admin.graphqlDebugger.copyResponse',
                  defaultMessage: 'Copy Response',
                })}
              </Button>
              <Button
                variant="outlined"
                startIcon={<CloudDownload />}
                onClick={handleDownloadResponse}
                disabled={responseValue === null}
              >
                {intl.formatMessage({
                  id: 'admin.graphqlDebugger.downloadResponse',
                  defaultMessage: 'Download JSON',
                })}
              </Button>
            </Stack>
          </Box>

          {responseText ? (
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 2,
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.default',
                color: 'text.primary',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 640,
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {responseText}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({
                id: 'admin.graphqlDebugger.responseEmpty',
                defaultMessage: 'The response JSON will appear here after you send a request.',
              })}
            </Typography>
          )}
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }} elevation={0}>
        <Stack spacing={2.5}>
          <Box display="flex" justifyContent="space-between" alignItems="center" gap={2} flexWrap="wrap">
            <Box>
              <Typography variant="h6">
                {intl.formatMessage({
                  id: 'admin.graphqlDebugger.chain.title',
                  defaultMessage: 'Request Chain Export',
                })}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {intl.formatMessage({
                  id: 'admin.graphqlDebugger.chain.description',
                  defaultMessage: 'Choose multiple saved requests, sort them manually, then export one JSON file containing the ordered chain and each request\'s latest response snapshot.',
                })}
              </Typography>
            </Box>

            <Button
              variant="contained"
              startIcon={<CloudDownload />}
              onClick={handleExportChain}
              disabled={chainRequests.length === 0}
            >
              {intl.formatMessage({
                id: 'admin.graphqlDebugger.chain.export',
                defaultMessage: 'Export Request Chain',
              })}
            </Button>
          </Box>

          <TextField
            select
            label={intl.formatMessage({
              id: 'admin.graphqlDebugger.chain.addRequest',
              defaultMessage: 'Add Saved Request to Chain',
            })}
            value=""
            onChange={(event) => handleAddRequestToChain(event.target.value)}
            fullWidth
            helperText={intl.formatMessage({
              id: 'admin.graphqlDebugger.chain.addRequestHelper',
              defaultMessage: 'Only saved requests can be added to the exported chain.',
            })}
          >
            <MenuItem value="" disabled>
              {intl.formatMessage({
                id: 'admin.graphqlDebugger.chain.addRequestPlaceholder',
                defaultMessage: 'Select a saved request',
              })}
            </MenuItem>
            {availableChainRequests.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.name}
              </MenuItem>
            ))}
          </TextField>

          {chainRequests.length > 0 ? (
            <Stack spacing={1.5}>
              {chainRequests.map((item, index) => (
                <Paper
                  key={item.id}
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 1.5,
                  }}
                >
                  <Stack spacing={1.5}>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap">
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {intl.formatMessage(
                            {
                              id: 'admin.graphqlDebugger.chain.itemTitle',
                              defaultMessage: '{order}. {name}',
                            },
                            {
                              order: index + 1,
                              name: item.name,
                            },
                          )}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                          {item.url}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<ArrowUpward />}
                          onClick={() => handleMoveChainRequest(item.id, -1)}
                          disabled={index === 0}
                        >
                          {intl.formatMessage({
                            id: 'admin.graphqlDebugger.chain.moveUp',
                            defaultMessage: 'Move Up',
                          })}
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<ArrowDownward />}
                          onClick={() => handleMoveChainRequest(item.id, 1)}
                          disabled={index === chainRequests.length - 1}
                        >
                          {intl.formatMessage({
                            id: 'admin.graphqlDebugger.chain.moveDown',
                            defaultMessage: 'Move Down',
                          })}
                        </Button>
                        <Button
                          variant="outlined"
                          color="warning"
                          size="small"
                          startIcon={<DeleteOutline />}
                          onClick={() => handleRemoveRequestFromChain(item.id)}
                        >
                          {intl.formatMessage({
                            id: 'admin.graphqlDebugger.chain.remove',
                            defaultMessage: 'Remove',
                          })}
                        </Button>
                      </Stack>
                    </Box>

                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip
                        size="small"
                        label={intl.formatMessage(
                          {
                            id: 'admin.graphqlDebugger.lastSaved',
                            defaultMessage: 'Last Saved {time}',
                          },
                          { time: formatTimestamp(item.updatedAt, intl.locale) },
                        )}
                      />
                      <Chip
                        size="small"
                        color={item.responseSnapshot ? 'success' : 'warning'}
                        label={item.responseSnapshot
                          ? intl.formatMessage(
                            {
                              id: 'admin.graphqlDebugger.chain.snapshotAvailable',
                              defaultMessage: 'Snapshot {time}',
                            },
                            { time: formatTimestamp(item.responseSnapshot.receivedAt, intl.locale) },
                          )
                          : intl.formatMessage({
                            id: 'admin.graphqlDebugger.chain.snapshotMissing',
                            defaultMessage: 'No Snapshot Yet',
                          })}
                      />
                      {item.responseSnapshot && item.responseSnapshot.status !== null ? (
                        <Chip
                          size="small"
                          color={getStatusChipColor(item.responseSnapshot.status)}
                          label={intl.formatMessage(
                            {
                              id: 'admin.graphqlDebugger.httpStatus',
                              defaultMessage: 'HTTP {status}{suffix}',
                            },
                            {
                              status: item.responseSnapshot.status,
                              suffix: item.responseSnapshot.statusText ? ` ${item.responseSnapshot.statusText}` : '',
                            },
                          )}
                        />
                      ) : null}
                    </Stack>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({
                id: 'admin.graphqlDebugger.chain.empty',
                defaultMessage: 'No saved requests have been added to the export chain yet.',
              })}
            </Typography>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
