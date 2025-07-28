import { LoaderCircle } from 'lucide-react'
// import useCcuPlannerData from './hooks/useCcuPlannerData'
import CcuCanvas from './components/CcuCanvas'
import { FormattedMessage } from 'react-intl'
import NewsModal from './components/NewsModal'
import { useCcuPlannerData } from '@/hooks'
import { useEffect } from 'react'

export default function CCUPlanner() {
  const { ships, ccus, wbHistory, exchangeRates, loading, showNewsModal, closeNewsModal } = useCcuPlannerData()

  useEffect(() => {
    const queuedRequests: { from: number, to: number }[] = [];

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) return;

      if (event.data?.type === 'addToCartRequest') {
        if (queuedRequests.length > 0) return;

        queuedRequests.push({
          from: event.data.message.from,
          to: event.data.message.to
        })

        window.postMessage({
          type: "ccuPlannerAppIntegrationRequest",
          message: {
            type: "httpRequest",
            request: {
              url: "https://robertsspaceindustries.com/api/account/v2/setAuthToken",
              data: null,
              responseType: "json",
              method: "post"
            },
            requestId: "cart-set-auth-token"
          }
        }, "*");
      }

      if (event.data?.type === 'ccuPlannerAppIntegrationResponse') {
        if (event.data.message.requestId === "cart-set-auth-token") {
          window.postMessage({
            type: "ccuPlannerAppIntegrationRequest",
            message: {
              type: "httpRequest",
              request: {
                url: "https://robertsspaceindustries.com/api/ship-upgrades/setContextToken",
                data: {},
                responseType: "json",
                method: "post"
              },
              requestId: "cart-set-context-token"
            }
          }, "*");
        }

        if (event.data.message.requestId === "cart-set-context-token") {
          window.postMessage({
            type: 'ccuPlannerAppIntegrationRequest',
            message: {
              type: "httpRequest",
              request: {
                "url": "https://robertsspaceindustries.com/pledge-store/api/upgrade/graphql",
                "responseType": "json",
                "method": "post",
                "data": [{
                  "operationName": "addToCart",
                  "variables": {
                    "from": queuedRequests[0].from,
                    "to": queuedRequests[0].to
                  },
                  "query": "mutation addToCart($from: Int!, $to: Int!) {\n  addToCart(from: $from, to: $to) {\n    jwt\n  }\n}\n"
                }]
              },
              requestId: "init-add-to-cart"
            }
          }, '*');
        }

        if (event.data.message.requestId === "init-add-to-cart") {
          // console.log("event.data", event.data.message.value.data[0].data.addToCart.jwt);
          const jwt = event.data.message.value.data[0].data.addToCart.jwt;

          window.postMessage({
            type: 'ccuPlannerAppIntegrationRequest',
            message: {
              type: "httpRequest",
              request: {
                "url": "https://robertsspaceindustries.com/api/store/v2/cart/token",
                "responseType": "json",
                "method": "post",
                "data": {
                  jwt
                }
              },
              requestId: "add-to-cart"
            }
          }, '*');
        }

        if (event.data.message.requestId === "add-to-cart") {
          window.open("https://robertsspaceindustries.com/en/store/pledge/cart", "_blank");
        }
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  if (loading) return (
    <div>
      <h1 className="flex items-center gap-4 px-8">
        <LoaderCircle className="w-8 h-8 animate-spin" />
        <FormattedMessage id="ccuPlanner.loading" defaultMessage="Loading CCU Planner..." />
      </h1>
    </div>
  )

  return (
    <div className="h-[calc(100vh-65px)] w-[calc(100vw-4px)] md:w-full flex flex-col absolute top-[65px] left-0">
      <div className="flex-1 relative w-full h-full">
        <CcuCanvas ships={ships} ccus={ccus} exchangeRates={exchangeRates} wbHistory={wbHistory} />
      </div>

      <NewsModal open={showNewsModal} onClose={closeNewsModal} />
    </div>
  )
}
