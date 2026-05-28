import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import { Alert, Button, CircularProgress, Paper, Typography } from '@mui/material';
import { useState } from 'react';
import { type IntlShape, useIntl } from 'react-intl';

import { requestViaExtension } from '@/utils/extensionHttpRequest';

const RSI_GRAPHQL_URL = 'https://robertsspaceindustries.com/graphql';
const RESPONSE_TIMEOUT_MS = 20000;

type ExportStatus = 'idle' | 'requesting' | 'success' | 'failure';

function formatError(intl: IntlShape, error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return intl.formatMessage({
    id: 'reseller.graphqlExport.error.generic',
    defaultMessage: 'Browser extension request failed',
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
  const intl = useIntl();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [errorText, setErrorText] = useState('');

  const statusText = (() => {
    switch (status) {
      case 'requesting':
        return intl.formatMessage(
          {
            id: 'reseller.graphqlExport.status.requesting',
            defaultMessage: 'Requesting {url} ...',
          },
          { url: RSI_GRAPHQL_URL },
        );
      case 'success':
        return intl.formatMessage({
          id: 'reseller.graphqlExport.status.success',
          defaultMessage: 'Request succeeded and the JSON file has been downloaded.',
        });
      case 'failure':
        return intl.formatMessage({
          id: 'reseller.graphqlExport.status.failure',
          defaultMessage: 'Request failed.',
        });
      default:
        return intl.formatMessage({
          id: 'reseller.graphqlExport.status.idle',
          defaultMessage: 'Click the button to request RSI GraphQL through the browser extension and download the JSON payload.',
        });
    }
  })();

  const handleExport = async () => {
    if (loading) return;

    setLoading(true);
    setErrorText('');
    setStatus('requesting');

    try {
      const response = await requestViaExtension({
        url: RSI_GRAPHQL_URL,
        responseType: 'json',
        method: 'post',
        data: [
          {
            operationName: 'GetBrowseSkusByFilter',
            variables: {
              query: {
                page: 1,
                limit: 99999,
                skus: {
                  filtersFromTags: {
                    tagIdentifiers: [],
                    facetIdentifiers: [
                      'extras-subscribers-store',
                    ],
                  },
                  products: [
                    65,
                  ],
                },
                sort: {
                  field: 'weight',
                  direction: 'desc',
                },
              },
            },
            query: 'query GetBrowseSkusByFilter($query: SearchQuery) {\n  store(browse: true) {\n    listing: search(query: $query) {\n      resources {\n        ...TyItemBrowseFragment\n        __typename\n      }\n      count\n      totalCount\n      heapTagFiltersOptions {\n        ...StoreListingHeapTagFiltersOptionsFragment\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment TyItemBrowseFragment on TyItem {\n  id\n  slug\n  name\n  title\n  subtitle\n  url\n  body\n  excerpt\n  type\n  media {\n    thumbnail {\n      slideshow\n      storeSmall\n      __typename\n    }\n    list {\n      slideshow\n      __typename\n    }\n    __typename\n  }\n  nativePrice {\n    amount\n    discounted\n    discountDescription\n    __typename\n  }\n  price {\n    amount\n    discounted\n    taxDescription\n    discountDescription\n    __typename\n  }\n  stock {\n    ...TyStockFragment\n    __typename\n  }\n  tags {\n    ...TyHeapTagFragment\n    __typename\n  }\n  ... on TySku {\n    imageComposer {\n      ...ImageComposerFragment\n      __typename\n    }\n    ...TySkuBrowseFragment\n    __typename\n  }\n  ... on TyProduct {\n    imageComposer {\n      ...ImageComposerFragment\n      __typename\n    }\n    ...TyProductBrowseFragment\n    __typename\n  }\n  __typename\n}\n\nfragment TySkuBrowseFragment on TySku {\n  label\n  customizable\n  isWarbond\n  isPackage\n  isVip\n  isDirectCheckout\n  __typename\n}\n\nfragment TyProductBrowseFragment on TyProduct {\n  skus {\n    id\n    title\n    isDirectCheckout\n    __typename\n  }\n  isVip\n  __typename\n}\n\nfragment TyStockFragment on TyStock {\n  unlimited\n  show\n  available\n  backOrder\n  qty\n  backOrderQty\n  level\n  __typename\n}\n\nfragment TyHeapTagFragment on HeapTag {\n  name\n  __typename\n}\n\nfragment ImageComposerFragment on ImageComposer {\n  name\n  slot\n  url\n  __typename\n}\n\nfragment StoreListingHeapTagFiltersOptionsFragment on HeapTagGroup {\n  groupIdentifier\n  facets {\n    facet\n    tagIdentifiers {\n      identifier\n      name\n      __typename\n    }\n    __typename\n  }\n  __typename\n}',
          },
        ],
      }, {
        timeoutMs: RESPONSE_TIMEOUT_MS,
        timeoutMessage: intl.formatMessage({
          id: 'reseller.graphqlExport.error.timeout',
          defaultMessage: "The extension request timed out. Make sure the Citizens' Hub browser extension is installed and enabled.",
        }),
        requestIdPrefix: 'reseller-graphql-export',
      });
      downloadJson(response);
      setStatus('success');
    } catch (error) {
      setStatus('failure');
      setErrorText(formatError(intl, error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute left-[50%] top-[50%] -translate-x-[50%] -translate-y-[50%] overflow-y-auto p-4 sm:p-8">
      <Paper className="max-w-3xl p-4 sm:p-6">
        <Typography variant="h5" gutterBottom>
          {intl.formatMessage({
            id: 'reseller.graphqlExport.title',
            defaultMessage: 'GraphQL Export',
          })}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {intl.formatMessage({
            id: 'reseller.graphqlExport.pageDescription',
            defaultMessage: 'This page uses the browser extension to issue the cross-origin request, capture the RSI GraphQL response, and download it as a JSON file.',
          })}
        </Typography>

        {/* <Button
          onClick={() => {
            window.postMessage({
              type: 'ccuPlannerAppIntegrationRequest',
              message: {
                type: 'httpRequest',
                request: {
                  url: "https://robertsspaceindustries.com/api/store/buyBackPledge",
                  responseType: 'json',
                  method: 'post',
                  data: { id },
                },
                requestId: "bbk",
              },
            }, '*');
          }}
        >
          add buy back to cart
        </Button> */}

        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <CloudDownloadIcon />}
          onClick={handleExport}
          disabled={loading}
          sx={{ mt: 2 }}
        >
          <span>
            {loading
              ? intl.formatMessage({
                id: 'reseller.graphqlExport.action.loading',
                defaultMessage: 'Requesting...',
              })
              : intl.formatMessage({
                id: 'reseller.graphqlExport.action.default',
                defaultMessage: 'Request and Download JSON',
              })}
          </span>
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
