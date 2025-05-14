import { useCallback, useEffect, useRef, useState } from "react";
import { addCCU, addUser, clearUpgrades, UserInfo } from "../store/upgradesStore";
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
      
      // 处理响应
      if (event.data?.type === 'ccuPlannerAppIntegrationResponse') {
        const requestId = event.data.message.requestId;
        
        // 用户信息响应
        if (requestId === "user-info") {
          userRef.current = event.data.message.value.data[0].data.account;

          dispatch(addUser(userRef.current));
          dispatch(clearUpgrades(userRef.current.id));

          // 获取第一页CCU
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
        }
        
        // CCU页面响应
        if (typeof requestId === 'string' && requestId.startsWith("ccus-")) {
          const pageId = requestId.split("-")[1];

          const htmlString = event.data.message.value.data;
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlString, 'text/html');

          // 第一页时，处理分页
          if (pageId === "1") {
            const totalPages = parseInt(new URL("https://robertsspaceindustries.com" + doc.querySelector(".raquo")?.getAttribute("href") as string).searchParams.get("page") || "1");

            // 将后续页面加入请求队列
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
  }, [dispatch, parseHangarItems, processNextRequests, addToQueue]);

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
