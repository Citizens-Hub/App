import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import { Alert, Button, CircularProgress, Paper, Typography } from '@mui/material';
import { useState } from 'react';

const RSI_GRAPHQL_URL = 'https://robertsspaceindustries.com/graphql';
const RESPONSE_TIMEOUT_MS = 20000;

type ExtensionResponseMessage = {
  requestId?: string;
  value?: unknown;
  error?: unknown;
};

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return '浏览器扩展请求失败';
}

function requestGraphqlViaExtension(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const requestId = `reseller-graphql-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const cleanup = (timeoutId: number, listener: (event: MessageEvent) => void) => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', listener);
    };

    const listener = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type !== 'ccuPlannerAppIntegrationResponse') return;

      const message = event.data?.message as ExtensionResponseMessage | undefined;
      if (!message || message.requestId !== requestId) return;

      cleanup(timeoutId, listener);

      if (message.error) {
        reject(new Error(formatError(message.error)));
        return;
      }

      resolve(message.value ?? null);
    };

    const timeoutId = window.setTimeout(() => {
      cleanup(timeoutId, listener);
      reject(new Error('扩展请求超时，请确认已安装并启用 Citizens Hub 浏览器扩展'));
    }, RESPONSE_TIMEOUT_MS);

    window.addEventListener('message', listener);

    window.postMessage({
      type: 'ccuPlannerAppIntegrationRequest',
      message: {
        type: 'httpRequest',
        request: {
          url: RSI_GRAPHQL_URL,
          responseType: 'json',
          method: 'post',
          data: [
            {
              "operationName": "GetBrowseSkusByFilter",
              "variables": {
                "query": {
                  "page": 1,
                  "limit": 99999,
                  "skus": {
                    "filtersFromTags": {
                      "tagIdentifiers": [],
                      "facetIdentifiers": [
                        "extras-subscribers-store"
                      ]
                    },
                    "products": [
                      65
                    ]
                  },
                  "sort": {
                    "field": "weight",
                    "direction": "desc"
                  }
                }
              },
              "query": "query GetBrowseSkusByFilter($query: SearchQuery) {\n  store(browse: true) {\n    listing: search(query: $query) {\n      resources {\n        ...TyItemBrowseFragment\n        __typename\n      }\n      count\n      totalCount\n      heapTagFiltersOptions {\n        ...StoreListingHeapTagFiltersOptionsFragment\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment TyItemBrowseFragment on TyItem {\n  id\n  slug\n  name\n  title\n  subtitle\n  url\n  body\n  excerpt\n  type\n  media {\n    thumbnail {\n      slideshow\n      storeSmall\n      __typename\n    }\n    list {\n      slideshow\n      __typename\n    }\n    __typename\n  }\n  nativePrice {\n    amount\n    discounted\n    discountDescription\n    __typename\n  }\n  price {\n    amount\n    discounted\n    taxDescription\n    discountDescription\n    __typename\n  }\n  stock {\n    ...TyStockFragment\n    __typename\n  }\n  tags {\n    ...TyHeapTagFragment\n    __typename\n  }\n  ... on TySku {\n    imageComposer {\n      ...ImageComposerFragment\n      __typename\n    }\n    ...TySkuBrowseFragment\n    __typename\n  }\n  ... on TyProduct {\n    imageComposer {\n      ...ImageComposerFragment\n      __typename\n    }\n    ...TyProductBrowseFragment\n    __typename\n  }\n  __typename\n}\n\nfragment TySkuBrowseFragment on TySku {\n  label\n  customizable\n  isWarbond\n  isPackage\n  isVip\n  isDirectCheckout\n  __typename\n}\n\nfragment TyProductBrowseFragment on TyProduct {\n  skus {\n    id\n    title\n    isDirectCheckout\n    __typename\n  }\n  isVip\n  __typename\n}\n\nfragment TyStockFragment on TyStock {\n  unlimited\n  show\n  available\n  backOrder\n  qty\n  backOrderQty\n  level\n  __typename\n}\n\nfragment TyHeapTagFragment on HeapTag {\n  name\n  __typename\n}\n\nfragment ImageComposerFragment on ImageComposer {\n  name\n  slot\n  url\n  __typename\n}\n\nfragment StoreListingHeapTagFiltersOptionsFragment on HeapTagGroup {\n  groupIdentifier\n  facets {\n    facet\n    tagIdentifiers {\n      identifier\n      name\n      __typename\n    }\n    __typename\n  }\n  __typename\n}"
            }
          ],
        },
        requestId,
      },
    }, '*');
  });
}

function downloadJson(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = href;
  anchor.download = `rsi-graphql-response-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  anchor.click();

  URL.revokeObjectURL(href);
}

export default function ResellerGraphqlExport() {
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('点击按钮后将通过浏览器扩展请求 RSI GraphQL 并下载 JSON。');
  const [errorText, setErrorText] = useState('');

  const handleExport = async () => {
    if (loading) return;

    setLoading(true);
    setErrorText('');
    setStatusText('正在请求 https://robertsspaceindustries.com/graphql ...');

    try {
      const response = await requestGraphqlViaExtension();
      downloadJson(response);
      setStatusText('请求成功，JSON 已下载。');
    } catch (error) {
      setStatusText('请求失败。');
      setErrorText(formatError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute left-[50%] top-[50%] -translate-x-[50%] -translate-y-[50%] overflow-y-auto p-4 sm:p-8">
      <Paper className="max-w-3xl p-4 sm:p-6">
        <Typography variant="h5" gutterBottom>
          GraphQL 导出
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          该页面会调用浏览器扩展发起跨域请求，抓取 RSI GraphQL 响应并下载为 JSON 文件。
        </Typography>

        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <CloudDownloadIcon />}
          onClick={handleExport}
          disabled={loading}
          sx={{ mt: 2 }}
        >
          {loading ? '请求中...' : '请求并下载 JSON'}
        </Button>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {statusText}
        </Typography>

        {errorText && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errorText}
          </Alert>
        )}
      </Paper>
    </div>
  );
}
