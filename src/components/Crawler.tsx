import { useCallback, useEffect, useRef, useState } from "react";
import { addCCU, addBuybackCCU, addUser, clearUpgrades, UserInfo } from "../store/upgradesStore";
import { useDispatch } from "react-redux";
import { Refresh } from "@mui/icons-material";
import { IconButton } from "@mui/material";

// 定义请求类型接口
interface RequestItem {
  type: string;
  message?: {
    type: string;
    request: {
      url: string;
      responseType: string;
      method: string;
      data: null | object | object[];
    };
    requestId: string;
  };
  request?: {
    url: string;
    data: null | object | object[];
    responseType: string;
    method: string;
  };
  requestId?: number | string;
}

export default function Crawler() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const requestQueueRef = useRef<RequestItem[]>([]);
  const activeRequestsRef = useRef<Set<string | number>>(new Set());
  const shipsRef = useRef<{
    id: number;
    name: string;
    skus: {
      id: number;
    }[]
  }[]>([])
  
  const buybackCCUsProcessedRef = useRef<number>(0);
  const buybackCCUsRef = useRef<{
    name: string;
    from: string;
    to: string;
    price: number;
  }[]>([]);
  const maxConcurrentRequests = 5;

  const userRef = useRef<UserInfo>({
    id: 0,
    username: "",
    nickname: "",
    avatar: "",
  });

  useEffect(() => {
    if (isRefreshing) {
      const timer = setTimeout(() => {
        setIsRefreshing(false);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [isRefreshing]);

  const dispatch = useDispatch();

  // MARK: Hangar

  const tryResolveCCU = (content: { name: string, match_items: { name: string }[], target_items: { name: string }[] }) => {
    const name = content.name;

    let from = "";
    let to = "";

    try {
      const regExp = /Upgrade\s*-\s*(.*?)\s+to\s+(.*?)(?:\s+\w+\s+Edition)/
      const match = name.match(regExp);

      if (!match) {
        from = content.match_items[0].name
        to = content.target_items[0].name
      } else {
        from = match[1].trim() || name.split("to")[0].split("-")[1].trim()
        to = match[2].trim() || (name.split("to")[1]).trim().split(" ").slice(0, -2).join(" ")
      }

      if (!from || !to) {
        from = name.split("to")[0].split("-")[1].trim()
        to = (name.split("to")[1]).trim().split(" ").slice(0, -2).join(" ")
      }
    } catch (error) {
      console.warn("error parsing ccu", name, "error >>>>", error, "reporting");
      reportError({
        errorType: "CCU_PARSING_ERROR",
        errorMessage: JSON.stringify({
          content,
          error: String(error),
        }),
      });
      return false;
    }

    return { from, to };
  }

  const parseHangarItems = useCallback((doc: Document) => {
    const listItems = doc.body.querySelector('.list-items');

    listItems?.querySelectorAll('li').forEach(li => {
      const content = JSON.parse(li.querySelector('.js-upgrade-data')?.getAttribute('value') || "{}")
      const value = li.querySelector('.js-pledge-value')?.getAttribute('value');

      const parsed = tryResolveCCU(content);

      if (!parsed) return;

      dispatch(addCCU({
        from: content.match_items[0],
        to: content.target_items[0],
        name: content.name,
        value: parseInt((value as string).replace("$", "").replace(" USD", "")),
        parsed,
        isBuyBack: false,
        canGift: !!li.querySelector('.gift'),
        belongsTo: userRef.current?.id,
      }));
    });
  }, [dispatch]);

  const parseBuybackCCUs = useCallback((doc: Document) => {
    const listItems = doc.body.querySelectorAll('.available-pledges .pledges>li');

    listItems.forEach(li => {
      const name = li.querySelector("h1")?.textContent;
      const from = li.querySelector("a")?.getAttribute("data-fromshipid");
      const to = li.querySelector("a")?.getAttribute("data-toshipid");

      if (!from || !to || !name) {
        console.warn("error parsing buyback ccu", name, "reporting");
        reportError({
          errorType: "BUYBACK_CCU_PARSING_ERROR",
          errorMessage: JSON.stringify({
            name,
            from,
            to,
            li: li.outerHTML,
          }),
        });
        return;
      }

      buybackCCUsRef.current.push({
        name,
        from,
        to,
        price: -1,
      });
    });
  }, []);

  // 处理请求队列
  const processNextRequests = useCallback(() => {
    while (activeRequestsRef.current.size < maxConcurrentRequests && requestQueueRef.current.length > 0) {
      const requestItem = requestQueueRef.current.shift()!;
      const requestId = requestItem.requestId || (requestItem.message?.requestId);

      if (requestId) {
        activeRequestsRef.current.add(requestId);
      }

      window.postMessage(requestItem, '*');
    }
  }, []);

  // 添加请求到队列
  const addToQueue = useCallback((request: RequestItem) => {
    requestQueueRef.current.push(request);
    processNextRequests();
  }, [processNextRequests]);

  // MARK: Buybacks

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window) return;

      if (event.data?.type === 'ccuPlannerAppIntegrationResponse') {
        const requestId = event.data.message.requestId;

        if (requestId === "user-info") {
          userRef.current = event.data.message.value.data[0].data.account;

          dispatch(addUser(userRef.current));
          dispatch(clearUpgrades(userRef.current.id));

          addToQueue({
            type: 'ccuPlannerAppIntegrationRequest',
            message: {
              type: "httpRequest",
              request: {
                "url": "https://robertsspaceindustries.com/en/account/pledges?page=1&product-type=upgrade",
                "responseType": "text",
                "method": "get",
                "data": null
              },
              requestId: "ccus-1"
            }
          });

          addToQueue({
            type: 'ccuPlannerAppIntegrationRequest',
            message: {
              type: "httpRequest",
              request: {
                "url": "https://robertsspaceindustries.com/en/account/buy-back-pledges?page=1&product-type=upgrade&pageSize=100",
                "responseType": "text",
                "method": "get",
                "data": null
              },
              requestId: "buyback-ccus-1"
            }
          });

          addToQueue({
            type: 'ccuPlannerAppIntegrationRequest',
            message: {
              type: "httpRequest",
              request: {
                "url": "https://robertsspaceindustries.com/pledge-store/api/upgrade/graphql",
                "responseType": "json",
                "method": "post",
                "data": [{
                  "operationName": "initShipUpgrade",
                  "variables": {},
                  "query": "query initShipUpgrade {\n  ships {\n    id\n    name\n    medias {\n      productThumbMediumAndSmall\n      slideShow\n    }\n    manufacturer {\n      id\n      name\n    }\n    focus\n    type\n    flyableStatus\n    owned\n    msrp\n    link\n    skus {\n      id\n      title\n      available\n      price\n      body\n      unlimitedStock\n      availableStock\n    }\n  }\n  manufacturers {\n    id\n    name\n  }\n  app {\n    version\n    env\n    cookieName\n    sentryDSN\n    pricing {\n      currencyCode\n      currencySymbol\n      exchangeRate\n      exponent\n      taxRate\n      isTaxInclusive\n    }\n    mode\n    isAnonymous\n    buyback {\n      credit\n    }\n  }\n}\n"
                }]
              },
              requestId: "init-ship-upgrade"
            }
          })
        }

        if (typeof requestId === 'string' && requestId.startsWith("ccus-")) {
          const pageId = requestId.split("-")[1];

          const htmlString = event.data.message.value.data;
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlString, 'text/html');

          if (pageId === "1") {
            const totalPages = parseInt(new URL("https://robertsspaceindustries.com" + doc.querySelector(".raquo")?.getAttribute("href") as string).searchParams.get("page") || "1");

            for (let i = 2; i <= totalPages; i++) {
              addToQueue({
                type: 'ccuPlannerAppIntegrationRequest',
                message: {
                  type: "httpRequest",
                  request: {
                    "url": `https://robertsspaceindustries.com/en/account/pledges?page=${i}&product-type=upgrade`,
                    "responseType": "text",
                    "method": "get",
                    "data": null
                  },
                  requestId: `ccus-${i}`
                }
              });
            }
          }

          parseHangarItems(doc);
        }

        if (typeof requestId === 'string' && requestId.startsWith("buyback-ccus-")) {
          const pageId = requestId.split("-")[2];

          const htmlString = event.data.message.value.data;
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlString, 'text/html');

          if (pageId === "1") {
            const totalPages = parseInt(new URL("https://robertsspaceindustries.com" + doc.querySelector(".raquo")?.getAttribute("href") as string).searchParams.get("page") || "1");

            buybackCCUsProcessedRef.current = totalPages;

            for (let i = 2; i <= totalPages; i++) {
              addToQueue({
                type: 'ccuPlannerAppIntegrationRequest',
                message: {
                  type: "httpRequest",
                  request: {
                    "url": `https://robertsspaceindustries.com/en/account/buy-back-pledges?page=${i}&product-type=upgrade&pageSize=100`,
                    "responseType": "text",
                    "method": "get",
                    "data": null
                  },
                  requestId: `buyback-ccus-${i}`
                }
              });
            }
          }

          parseBuybackCCUs(doc);

          buybackCCUsProcessedRef.current--;
          if (buybackCCUsProcessedRef.current === 0) {
            // fetch price list
            addToQueue({
              type: 'ccuPlannerAppIntegrationRequest',
              message: {
                type: "httpRequest",
                request: {
                  "url": "https://robertsspaceindustries.com/pledge-store/api/upgrade/graphql",
                  "responseType": "json",
                  "method": "post",
                  "data": buybackCCUsRef.current.map(ccu => ({
                      "operationName": "getPrice",
                      "variables": {
                        "from": Number(ccu.from),
                        "to": shipsRef.current.find(ship => ship.id === Number(ccu.to))?.skus[0].id
                      },
                      "query": "query getPrice($from: Int!, $to: Int!) {\n  price(from: $from, to: $to) {\n    amount\n    nativeAmount\n  }\n}\n"
                  }))
                },
                requestId: "buyback-ccus-price-list"
              }
            })
          }
        }

        if (typeof requestId === 'string' && requestId.startsWith("init-ship-upgrade")) {
          const ships = event.data.message.value.data[0].data.ships;

          shipsRef.current = ships;
        }

        if (typeof requestId === 'string' && requestId.startsWith("buyback-ccus-price-list")) {
          const priceList = event.data.message.value.data;

          buybackCCUsRef.current.forEach((ccu, i) => {
            const value = priceList[i].data.price.amount / 100

            const parsed = tryResolveCCU({
              name: ccu.name,
              match_items: [{ name: ccu.from }],
              target_items: [{ name: ccu.to }],
            });

            if (!parsed) return;

            dispatch(addBuybackCCU({
              name: ccu.name,
              from: { id: Number(ccu.from), name: parsed.from },
              to: { id: Number(ccu.to), name: parsed.to },
              value,
              parsed,
              isBuyBack: true,
              canGift: true,
              belongsTo: userRef.current?.id,
            }));

            // {
            //   from: content.match_items[0],
            //   to: content.target_items[0],
            //   name: content.name,
            //   value: parseInt((value as string).replace("$", "").replace(" USD", "")),
            //   parsed,
            //   isBuyBack: false,
            //   canGift: !!li.querySelector('.gift'),
            //   belongsTo: userRef.current?.id,
            // }
          })
        }

        // 请求完成，从活跃请求中移除
        if (requestId) {
          activeRequestsRef.current.delete(requestId);
          // 处理下一批请求
          processNextRequests();
        }
      }
    }

    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, [dispatch, parseHangarItems, processNextRequests, addToQueue, parseBuybackCCUs]);

  return <IconButton
    color="primary"
    size="small"
    onClick={() => {
      setIsRefreshing(true);

      // 清空请求队列和活跃请求集合
      requestQueueRef.current = [];
      activeRequestsRef.current.clear();

      // 添加认证请求到队列
      addToQueue({
        type: "httpRequest",
        request: {
          url: "https://robertsspaceindustries.com/api/account/v2/setAuthToken",
          data: null,
          responseType: "json",
          method: "post"
        },
        requestId: 9999
      });

      // 添加上下文请求到队列
      addToQueue({
        type: "httpRequest",
        request: {
          url: "https://robertsspaceindustries.com/api/ship-upgrades/setContextToken",
          data: {},
          responseType: "json",
          method: "post"
        },
        requestId: 10000
      });

      // 添加用户信息请求到队列
      addToQueue({
        type: 'ccuPlannerAppIntegrationRequest',
        message: {
          type: "httpRequest",
          request: {
            url: "https://robertsspaceindustries.com/graphql",
            responseType: "json",
            method: "post",
            data: [
              {
                "operationName": "account",
                "variables": {},
                "query": "query account {\n  account {\n    isAnonymous\n    ... on RsiAuthenticatedAccount {\n      avatar\n      badges {\n        id\n        title\n        __typename\n      }\n      badgeIcons {\n        favorite {\n          name\n          icon\n          __typename\n        }\n        organization {\n          name\n          icon\n          url\n          __typename\n        }\n        __typename\n      }\n      displayname\n      id\n      nickname\n      profileUrl\n      roles {\n        name\n        __typename\n      }\n      updatedAt\n      username\n      email\n      status\n      referral_code\n      __typename\n    }\n    __typename\n  }\n}"
              }
            ]
          },
          requestId: "user-info"
        }
      });
    }}
  >
    <Refresh className={isRefreshing ? 'animate-spin' : ''} />
  </IconButton>;
}
