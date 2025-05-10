import { FormattedMessage, useIntl } from 'react-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Container, Typography, Box, Paper, Grid, Snackbar, Alert } from '@mui/material';
import { LoaderCircle, RefreshCw, ShipWheel } from 'lucide-react';
import { Ship, StoreShipsData } from '../../types';

export default function Admin() {
  const intl = useIntl();
  const [loading, setLoading] = useState({
    ships: false,
    ccus: false
  });
  const [notification, setNotification] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'info' | 'warning'
  });

  const shipsRef = useRef<Ship[]>([]);
  const requestsLeftRef = useRef(0);

  useEffect(() => {
    document.title = "Citizen's Hub - " + intl.formatMessage({ id: 'admin.title', defaultMessage: 'Admin Panel' });
  }, [intl]);

  const showNotification = useCallback((messageId: string, severity: 'success' | 'error' | 'info' | 'warning') => {
    setNotification({
      open: true,
      message: intl.formatMessage({ id: messageId }),
      severity
    });
  }, [intl]);

  const handleProcessStoreShips = useCallback((ships: StoreShipsData[]) => {
    ships.forEach(ship => {
      if (shipsRef.current.find(s => s.id === Number(ship.id))) {
        // console.log("ship already in list >>>>>>>>>>>>", ship);
        return;
      }

      console.log("found ship not in list >>>>>>>>>>>>", ship);

      shipsRef.current.push({
        id: Number(ship.id),
        name: ship.name,
        medias: {
          productThumbMediumAndSmall: "https://robertsspaceindustries.com" + ship.imageComposer[0].url,
          slideShow: "https://robertsspaceindustries.com" + ship.imageComposer[0].url
        },
        manufacturer: {
          id: ship.manufacturerId,
          name: ship.manufacturer.name
        },
        focus: ship.focus,
        type: ship.type,
        flyableStatus: ship.productionStatus === "flight-ready" ? "Flyable" : "Concept",
        owned: false,
        msrp: ship.msrp,
        link: ship.url,
        skus: []
      });
    });

    requestsLeftRef.current--;

    console.log("requestsLeftRef.current >>>>>>>>>>>>", requestsLeftRef.current)

    if (requestsLeftRef.current < 0) {
      showNotification('ships.updated', 'success');
      fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/ships`, {
        method: 'PUT',
        body: JSON.stringify({ data: { ships: shipsRef.current } }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
    }
  }, [showNotification]);

  useEffect(() => {
    setToken();

    function handleMessage(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type === 'ccuPlannerAppIntegrationResponse') {
        if (event.data.message.requestId < -1) {
          handleProcessStoreShips(event.data.message.value.data[0].data.store.search.resources);
        }
        if (event.data.message.requestId === -1) {
          // console.log(event.data.message.value.data[0].data.store);

          const totalCount = event.data.message.value.data[0].data.store.search.totalCount;
          const perPage = event.data.message.value.data[0].data.store.search.count;
          const pages = Math.ceil(totalCount / perPage);

          requestsLeftRef.current = pages - 1;

          for (let i = 1; i < pages; i++) {
            window.postMessage({
              type: 'ccuPlannerAppIntegrationRequest',
              message: {
                type: "httpRequest",
                request: {
                  url: "https://robertsspaceindustries.com/graphql",
                  responseType: "json",
                  method: "post",
                  data: [
                    {
                      operationName: "GetShipList",
                      variables: {
                        query: {
                          page: i + 1,
                          limit: 25,
                          sort: {
                            field: "name",
                            direction: "asc"
                          },
                          ships: {
                            imageComposer: [
                              {
                                name: "1000",
                                size: "SIZE_1000",
                                ratio: "RATIO_16_9",
                                extension: "JPG"
                              }
                            ],
                            all: true
                          }
                        }
                      },
                      query: "query GetShipList($query: SearchQuery!) {\n  store(name: \"pledge\", browse: true) {\n    search(query: $query) {\n      shipFiltersOptions {\n        classification {\n          label\n          value\n          __typename\n        }\n        sale {\n          label\n          value\n          __typename\n        }\n        msrp {\n          from\n          to\n          __typename\n        }\n        status {\n          label\n          value\n          __typename\n        }\n        maxCrew {\n          from\n          to\n          __typename\n        }\n        minCrew {\n          from\n          to\n          __typename\n        }\n        size\n        __typename\n      }\n      count\n      totalCount\n      resources {\n        ...RSIShipFragment\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment RSIShipFragment on RSIShip {\n  ...RSIShipBaseFragment\n  manufacturerId\n  featuredForShipList\n  minCrew\n  maxCrew\n  manufacturer {\n    ...RSIManufacturerMinimalFragment\n    __typename\n  }\n  imageComposer {\n    ...ImageComposerFragment\n    __typename\n  }\n  __typename\n}\n\nfragment RSIManufacturerMinimalFragment on RSIManufacturer {\n  name\n  __typename\n}\n\nfragment ImageComposerFragment on ImageComposer {\n  name\n  slot\n  url\n  __typename\n}\n\nfragment RSIShipBaseFragment on RSIShip {\n  id\n  title\n  name\n  url\n  slug\n  type\n  focus\n  msrp\n  purchasable\n  productionStatus\n  lastUpdate\n  publishStart\n  __typename\n}"
                    }
                  ]
                },
                requestId: -(i + 1)
              }
            }, '*');
          }

          handleProcessStoreShips(event.data.message.value.data[0].data.store.search.resources);
        }
        if (event.data.message.requestId === 0) {
          fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/ccus`, {
            method: 'PUT',
            body: JSON.stringify({ data: event.data.message.value.data[0].data }),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
        }
        if (event.data.message.requestId === 1) {
          shipsRef.current = event.data.message.value.data[0].data.ships;

          window.postMessage({
            type: 'ccuPlannerAppIntegrationRequest',
            message: {
              type: "httpRequest",
              request: {
                url: "https://robertsspaceindustries.com/graphql",
                responseType: "json",
                method: "post",
                data: [
                  {
                    operationName: "GetShipList",
                    variables: {
                      query: {
                        limit: 25,
                        sort: {
                          field: "name",
                          direction: "asc"
                        },
                        ships: {
                          imageComposer: [
                            {
                              name: "1000",
                              size: "SIZE_1000",
                              ratio: "RATIO_16_9",
                              extension: "JPG"
                            }
                          ],
                          all: true
                        }
                      }
                    },
                    query: "query GetShipList($query: SearchQuery!) {\n  store(name: \"pledge\", browse: true) {\n    search(query: $query) {\n      shipFiltersOptions {\n        classification {\n          label\n          value\n          __typename\n        }\n        sale {\n          label\n          value\n          __typename\n        }\n        msrp {\n          from\n          to\n          __typename\n        }\n        status {\n          label\n          value\n          __typename\n        }\n        maxCrew {\n          from\n          to\n          __typename\n        }\n        minCrew {\n          from\n          to\n          __typename\n        }\n        size\n        __typename\n      }\n      count\n      totalCount\n      resources {\n        ...RSIShipFragment\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment RSIShipFragment on RSIShip {\n  ...RSIShipBaseFragment\n  manufacturerId\n  featuredForShipList\n  minCrew\n  maxCrew\n  manufacturer {\n    ...RSIManufacturerMinimalFragment\n    __typename\n  }\n  imageComposer {\n    ...ImageComposerFragment\n    __typename\n  }\n  __typename\n}\n\nfragment RSIManufacturerMinimalFragment on RSIManufacturer {\n  name\n  __typename\n}\n\nfragment ImageComposerFragment on ImageComposer {\n  name\n  slot\n  url\n  __typename\n}\n\nfragment RSIShipBaseFragment on RSIShip {\n  id\n  title\n  name\n  url\n  slug\n  type\n  focus\n  msrp\n  purchasable\n  productionStatus\n  lastUpdate\n  publishStart\n  __typename\n}"
                  }
                ]
              },
              requestId: -1
            }
          }, '*');
        }
      }
    }

    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, [handleProcessStoreShips]);

  const setToken = () => {
    window.postMessage({
      type: 'ccuPlannerAppIntegrationRequest',
      message: {
        "type": "httpRequest",
        "request": {
          "url": "https://robertsspaceindustries.com/api/account/v2/setAuthToken",
          "data": null,
          "responseType": "json",
          "method": "post"
        },
        "requestId": 9999
      }
    }, '*');

    window.postMessage({
      type: 'ccuPlannerAppIntegrationRequest',
      message: {
        type: "httpRequest",
        request: {
          url: "https://robertsspaceindustries.com/api/ship-upgrades/setContextToken",
          data: {},
          responseType: "json",
          method: "post"
        },
        "requestId": 10000
      }
    }, '*');
  }

  const handleUpdateShips = () => {
    setLoading(prev => ({ ...prev, ships: true }));
    window.postMessage({
      type: 'ccuPlannerAppIntegrationRequest',
      message: {
        type: "httpRequest",
        request: {
          "url": "https://robertsspaceindustries.com/pledge-store/api/upgrade/graphql",
          // url: "https://robertsspaceindustries.com/graphql",
          "responseType": "json",
          "method": "post",
          "data": [
            {
              "operationName": "initShipUpgrade",
              "variables": {},
              "query": "query initShipUpgrade {\n  ships {\n    id\n    name\n    medias {\n      productThumbMediumAndSmall\n      slideShow\n    }\n    manufacturer {\n      id\n      name\n    }\n    focus\n    type\n    flyableStatus\n    owned\n    msrp\n    link\n    skus {\n      id\n      title\n      available\n      price\n      body\n      unlimitedStock\n      availableStock\n    }\n  }\n  manufacturers {\n    id\n    name\n  }\n  app {\n    version\n    env\n    cookieName\n    sentryDSN\n    pricing {\n      currencyCode\n      currencySymbol\n      exchangeRate\n      exponent\n      taxRate\n      isTaxInclusive\n    }\n    mode\n    isAnonymous\n    buyback {\n      credit\n    }\n  }\n}\n"
            }
          ]
        },
        requestId: 1
      }
    }, '*');

    setTimeout(() => {
      setLoading(prev => ({ ...prev, ships: false }));
      showNotification('ships.updated', 'success');
    }, 1000);
  };

  const handleUpdateCCUs = () => {
    setLoading(prev => ({ ...prev, ccus: true }));
    window.postMessage({
      type: 'ccuPlannerAppIntegrationRequest',
      message: {
        type: "httpRequest",
        request: {
          "url": "https://robertsspaceindustries.com/pledge-store/api/upgrade/graphql",
          "responseType": "json",
          "method": "post",
          "auth": true,
          "data": [
            {
              "operationName": "filterShips",
              "variables": {
                "fromFilters": [],
                "toFilters": []
              },
              "query": "query filterShips($fromId: Int, $toId: Int, $fromFilters: [FilterConstraintValues], $toFilters: [FilterConstraintValues]) {\n  from(to: $toId, filters: $fromFilters) {\n    ships {\n      id\n    }\n  }\n  to(from: $fromId, filters: $toFilters) {\n    featured {\n      reason\n      style\n      tagLabel\n      tagStyle\n      footNotes\n      shipId\n    }\n    ships {\n      id\n      skus {\n        id\n        price\n        upgradePrice\n        unlimitedStock\n        showStock\n        available\n        availableStock\n      }\n    }\n  }\n}\n"
            }
          ]
        },
        requestId: 0
      }
    }, '*');
    setTimeout(() => {
      setLoading(prev => ({ ...prev, ccus: false }));
      showNotification('ccus.updated', 'success');
    }, 1000);
  };

  const handleCloseNotification = () => {
    setNotification(prev => ({ ...prev, open: false }));
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 4 }}>
        <FormattedMessage id="admin.heading" defaultMessage="管理面板" />
      </Typography>

      <Grid container spacing={4}>
        <Grid sx={{
          xs: 12,
          md: 6
        }}>
          <Paper elevation={3} sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <ShipWheel className="w-6 h-6 mr-2" />
              <Typography variant="h5">
                <FormattedMessage id="admin.ships.title" defaultMessage="飞船数据" />
              </Typography>
            </Box>
            <Typography variant="body1" sx={{ mb: 3 }}>
              <FormattedMessage id="admin.ships.description" defaultMessage="更新飞船数据库信息，包括价格、规格和可用性" />
            </Typography>
            <Button
              variant="contained"
              fullWidth
              color="primary"
              onClick={handleUpdateShips}
              disabled={loading.ships}
              startIcon={loading.ships ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            >
              {loading.ships ? (
                <FormattedMessage id="admin.ships.updating" defaultMessage="更新中..." />
              ) : (
                <FormattedMessage id="admin.ships.update" defaultMessage="更新飞船数据" />
              )}
            </Button>
          </Paper>
        </Grid>

        <Grid sx={{
          xs: 12,
          md: 6
        }}>
          <Paper elevation={3} sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <RefreshCw className="w-6 h-6 mr-2" />
              <Typography variant="h5">
                <FormattedMessage id="admin.ccus.title" defaultMessage="CCU 数据" />
              </Typography>
            </Box>
            <Typography variant="body1" sx={{ mb: 3 }}>
              <FormattedMessage id="admin.ccus.description" defaultMessage="更新飞船升级（CCU）路径和价格数据" />
            </Typography>
            <Button
              variant="contained"
              fullWidth
              color="primary"
              onClick={handleUpdateCCUs}
              disabled={loading.ccus}
              startIcon={loading.ccus ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            >
              {loading.ccus ? (
                <FormattedMessage id="admin.ccus.updating" defaultMessage="更新中..." />
              ) : (
                <FormattedMessage id="admin.ccus.update" defaultMessage="更新CCU数据" />
              )}
            </Button>
          </Paper>
        </Grid>
      </Grid>

      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseNotification} severity={notification.severity} sx={{ width: '100%' }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
