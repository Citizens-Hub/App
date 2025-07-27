import { useCallback, useEffect, useRef, useState } from "react";
import { addCCU, addBuybackCCU, addShip, addUser, clearUpgrades, UserInfo, addBundle, OtherItem } from "../store/upgradesStore";
import { useDispatch } from "react-redux";
import { Refresh } from "@mui/icons-material";
import { IconButton, LinearProgress } from "@mui/material";
import { reportError } from "../report";
import { Ship } from "../types";

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

type ItemType = "Insurance" | "Ship" | "Skin" | "FPS Equipment" | "Credits" | "Hangar pass" | undefined;
type InsuranceType = "LTI" | "Other"

export default function Crawler({ ships }: { ships: Ship[] }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const totalRequestsRef = useRef(0);
  const completedRequestsRef = useRef(0);
  const [progress, setProgress] = useState(0);
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
    toSku: string;
    price: number;
  }[]>([]);
  const maxConcurrentRequests = 5;

  const userRef = useRef<UserInfo>({
    id: 0,
    username: "",
    nickname: "",
    avatar: "",
    isAnonymous: false,
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

  const tryResolveCCU = useCallback((content: { name: string, match_items: { name: string }[], target_items: { name: string }[] }) => {
    const name = content.name;

    let from = "";
    let to = "";

    try {
      const regExp = /upgrade\s*-\s*(.*?)\s+to\s+(.*?)(?:\s+\w+\s+edition)/
      const match = name.toLowerCase().match(regExp);

      if (match) {
        from = match[1].trim()
        to = match[2].trim()
      } else {
        from = content.match_items[0].name
        to = content.target_items[0].name
      }

      if (!ships.find(ship => ship.name.toLowerCase().trim() === from.toLowerCase().trim())) {
        from = content.match_items[0].name
      }

      if (!ships.find(ship => ship.name.toLowerCase().trim() === to.toLowerCase().trim())) {
        to = content.target_items[0].name
      }

      if (!from || !to) {
        throw new Error("invalid ccu");
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
  }, [ships]);

  const parseHangarItems = useCallback((doc: Document, pageId: number) => {
    const listItems = doc.body.querySelector('.list-items');

    listItems?.querySelectorAll('li').forEach((li, index) => {
      const value = li.querySelector('.js-pledge-value')?.getAttribute('value');
      const ccuData = li.querySelector('.js-upgrade-data')?.getAttribute('value');

      const id = (pageId - 1) * 10 + index + 1;

      if (ccuData) {
        const content = JSON.parse(ccuData)

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
          pageId: id,
        }));

        return;
      }

      const items = li.querySelectorAll('.item');
      const bundleName = li.querySelector('.js-pledge-name')?.getAttribute('value');

      let currentInsurance: InsuranceType = "Other"
      const currentShips: Ship[] = []
      const currentOthers: OtherItem[] = []

      items.forEach(item => {
        const itemType: ItemType = item.querySelector('.kind')?.textContent as ItemType;
        const itemName = item.querySelector('.title')?.textContent;
        const itemImage = item.querySelector('.image')?.getAttribute('style')?.slice(22, -3).replace(/"/g, "");

        switch (itemType) {
          case "Insurance":
            if (itemName === "Lifetime Insurance") currentInsurance = "LTI"
            break;
          case "Ship":
            {
              const ship = ships.find(ship => ship.name.toLowerCase().trim() === itemName?.toLowerCase().trim())
              if (ship) currentShips.push(ship)
              break;
            }
          default:
            currentOthers.push({
              id: id,
              name: itemName || "Unknown Item",
              withImage: !!item.querySelectorAll(".image").length,
              image: itemImage?.startsWith("https://") ? itemImage : `https://robertsspaceindustries.com/${itemImage}`,
              type: itemType || "",
              value: parseInt((value as string).replace("$", "").replace(" USD", "")),
              isBuyBack: false,
              canGift: !!li.querySelector('.gift'),
              belongsTo: userRef.current?.id,
              pageId: id,
            })
            break;
        }
      })

      // bundle
      if (currentShips.length > 1 || currentOthers.filter(other => other.withImage).length > 0) {
        dispatch(addBundle({
          ships: currentShips.map(ship => ({
            id: ship.id,
            name: ship.name
          })),
          others: currentOthers,
          name: bundleName || "Unknown Bundle",
          insurance: currentInsurance,
          value: parseInt((value as string).replace("$", "").replace(" USD", "")),
          isBuyBack: false,
          canGift: !!li.querySelector('.gift'),
          belongsTo: userRef.current?.id,
          pageId: id,
        }))

        return;
      }

      // standalone ship
      if (currentShips.length === 1) {
        dispatch(addShip({
          id: currentShips[0].id,
          name: currentShips[0].name,
          insurance: currentInsurance,
          value: parseInt((value as string).replace("$", "").replace(" USD", "")),
          isBuyBack: false,
          canGift: !!li.querySelector('.gift'),
          belongsTo: userRef.current?.id,
          pageId: id,
        }))

        return;
      }

    });
  }, [dispatch, ships, tryResolveCCU]);

  const parseBuybackCCUs = useCallback((doc: Document, pageId: number) => {
    const listItems = doc.body.querySelectorAll('.available-pledges .pledges>li');

    listItems.forEach((li, index) => {
      const name = li.querySelector("h1")?.textContent;
      const from = li.querySelector("a")?.getAttribute("data-fromshipid");
      const to = li.querySelector("a")?.getAttribute("data-toshipid");
      const toSku = li.querySelector("a")?.getAttribute("data-toskuid");

      const id = (pageId - 1) * 250 + index + 1;

      if (!from || !to || !name || !toSku) {
        console.warn("error parsing buyback ccu", name, "reporting");
        reportError({
          errorType: "BUYBACK_CCU_PARSING_ERROR",
          errorMessage: JSON.stringify({
            name,
            from,
            to,
            toSku,
            li: li.outerHTML,
          }),
        });
        return;
      }

      const fromShip = ships.find(ship => ship.id === Number(from))
      const toShip = ships.find(ship => ship.id === Number(to))

      const ccu = {
        name,
        from,
        to,
        toSku,
        price: (toShip?.msrp && fromShip?.msrp) ? toShip?.msrp - fromShip?.msrp : 0,
      }

      const parsed = tryResolveCCU({
        name: ccu.name,
        match_items: [{ name: ccu.from }],
        target_items: [{ name: ccu.to }],
      });

      if (parsed) {
        dispatch(addBuybackCCU({
          name: ccu.name,
          from: { id: Number(ccu.from), name: parsed.from },
          to: { id: Number(ccu.to), name: parsed.to },
          value: ccu.price / 100,
          parsed,
          isBuyBack: true,
          canGift: true,
          belongsTo: userRef.current?.id,
          pageId: id,
        }));
      }
    });
  }, [dispatch, ships, tryResolveCCU]);

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
    totalRequestsRef.current++;
    processNextRequests();

    console.log("added to queue", request.message?.requestId);
  }, [processNextRequests]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window) return;

      if (event.data?.type === 'ccuPlannerAppIntegrationResponse') {
        const requestId = event.data.message.requestId;

        if (requestId === "user-info") {
          userRef.current = event.data.message.value.data[0].data.account;

          sessionStorage.setItem("currentRSIAccount", event.data.message.value.data[0].data.account.id)

          dispatch(addUser(userRef.current));
          dispatch(clearUpgrades(userRef.current.id));

          addToQueue({
            type: 'ccuPlannerAppIntegrationRequest',
            message: {
              type: "httpRequest",
              request: {
                "url": "https://robertsspaceindustries.com/en/account/pledges?page=1&pagesize=10",
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
                "url": "https://robertsspaceindustries.com/en/account/buy-back-pledges?page=1&product-type=upgrade&pagesize=250",
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
                    "url": `https://robertsspaceindustries.com/en/account/pledges?page=${i}&pagesize=10`,
                    "responseType": "text",
                    "method": "get",
                    "data": null
                  },
                  requestId: `ccus-${i}`
                }
              });
            }
          }

          parseHangarItems(doc, Number(pageId));
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
                    "url": `https://robertsspaceindustries.com/en/account/buy-back-pledges?page=${i}&product-type=upgrade&pagesize=250`,
                    "responseType": "text",
                    "method": "get",
                    "data": null
                  },
                  requestId: `buyback-ccus-${i}`
                }
              });
            }
          }

          parseBuybackCCUs(doc, Number(pageId));
        }

        if (typeof requestId === 'string' && requestId.startsWith("init-ship-upgrade-")) {
          const ships = event.data.message.value.data[0].data.ships;

          shipsRef.current = ships;
        }

        if (requestId) {
          activeRequestsRef.current.delete(requestId);
        }

        console.log("completed", requestId);

        completedRequestsRef.current++;
        setProgress(completedRequestsRef.current / totalRequestsRef.current * 100);
        if (completedRequestsRef.current >= totalRequestsRef.current) {
          setTimeout(() => {
            setProgress(0);
          }, 500);
        }

        processNextRequests();
      }
    }

    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, [dispatch, parseHangarItems, processNextRequests, addToQueue, parseBuybackCCUs, totalRequestsRef, tryResolveCCU]);

  return <>
    <div className="w-full flex flex-col items-center justify-center fixed top-0 left-0 right-0">
      {progress > 0 && (
        <LinearProgress
          variant="determinate"
          sx={{ width: '100%' }}
          value={progress}
        />
      )}
    </div>
    <IconButton
      color="primary"
      size="small"
      onClick={() => {
        setIsRefreshing(true);
        setProgress(0);
        totalRequestsRef.current = 0;
        completedRequestsRef.current = 0;

        requestQueueRef.current = [];
        activeRequestsRef.current.clear();
        buybackCCUsRef.current = [];
        buybackCCUsProcessedRef.current = 0;
        shipsRef.current = [];

        addToQueue({
          type: "ccuPlannerAppIntegrationRequest",
          message: {
            type: "httpRequest",
            request: {
              url: "https://robertsspaceindustries.com/api/account/v2/setAuthToken",
              data: null,
              responseType: "json",
              method: "post"
            },
            requestId: "set-auth-token"
          }
        });

        // 添加上下文请求到队列
        addToQueue({
          type: "ccuPlannerAppIntegrationRequest",
          message: {
            type: "httpRequest",
            request: {
              url: "https://robertsspaceindustries.com/api/ship-upgrades/setContextToken",
              data: {},
              responseType: "json",
              method: "post"
            },
            requestId: "set-context-token"
          }
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
      disabled={ships.length === 0}
    >
      <Refresh className={isRefreshing ? 'animate-spin' : ''} />
    </IconButton>
  </>
}
