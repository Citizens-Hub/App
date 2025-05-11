import { useCallback, useEffect, useRef, useState } from "react";
import { addCCU, addUser, clearUpgrades, UserInfo } from "../store";
import { useDispatch } from "react-redux";
import { Refresh } from "@mui/icons-material";
import { IconButton } from "@mui/material";

export default function Crawler() {
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // MARK: Buybacks



  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type === 'ccuPlannerAppIntegrationResponse') {
        if (event.data.message.requestId === "user-info") {
          userRef.current = event.data.message.value.data[0].data.account

          dispatch(addUser(userRef.current));
          dispatch(clearUpgrades(userRef.current.id));

          window.postMessage({
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
          }, '*');
        }
        if (event.data.message.requestId.startsWith("ccus-")) {
          const requestId = Number(event.data.message.requestId.split("-")[1]);

          const htmlString = event.data.message.value.data;
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlString, 'text/html');

          if (requestId === 1) {
            const totalPages = parseInt(new URL("https://robertsspaceindustries.com" + doc.querySelector(".raquo")?.getAttribute("href") as string).searchParams.get("page") || "1");

            for (let i = 2; i <= totalPages; i++) {
              window.postMessage({
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
              }, '*');
            }
          }

          parseHangarItems(doc);
        }
      }
    }

    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, [dispatch, parseHangarItems]);

  return <IconButton
    color="primary"
    size="small"
    onClick={() => {
      setIsRefreshing(true);

      window.postMessage({
        "type": "httpRequest",
        "request": {
          "url": "https://robertsspaceindustries.com/api/account/v2/setAuthToken",
          "data": null,
          "responseType": "json",
          "method": "post"
        },
        "requestId": 9999
      }, '*');

      window.postMessage({
        type: "httpRequest",
        request: {
          url: "https://robertsspaceindustries.com/api/ship-upgrades/setContextToken",
          data: {},
          responseType: "json",
          method: "post"
        },
        "requestId": 10000
      }, '*');

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
                "operationName": "account",
                "variables": {},
                "query": "query account {\n  account {\n    isAnonymous\n    ... on RsiAuthenticatedAccount {\n      avatar\n      badges {\n        id\n        title\n        __typename\n      }\n      badgeIcons {\n        favorite {\n          name\n          icon\n          __typename\n        }\n        organization {\n          name\n          icon\n          url\n          __typename\n        }\n        __typename\n      }\n      displayname\n      id\n      nickname\n      profileUrl\n      roles {\n        name\n        __typename\n      }\n      updatedAt\n      username\n      email\n      status\n      referral_code\n      __typename\n    }\n    __typename\n  }\n}"
              }
            ]
          },
          requestId: "user-info"
        }
      }, '*');
    }}
  >
    <Refresh className={isRefreshing ? 'animate-spin' : ''} />
  </IconButton>;
}
