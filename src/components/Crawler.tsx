import { useCallback, useEffect, useRef, useState } from "react";
import { addCCU, addBuybackCCU, addShip, addUser, clearUpgrades, UserInfo, addBundle, OtherItem } from "../store/upgradesStore";
import { useDispatch } from "react-redux";
// import { Refresh } from "@mui/icons-material";
import { Button, LinearProgress, Snackbar, Alert } from "@mui/material";
import { createPortal } from "react-dom";
import { BiSlots, reportBi, reportError } from "../report";
import { Ship } from "../types";
import { FormattedMessage, useIntl } from "react-intl";

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

interface ExtensionResponseMessage {
  requestId?: string | number;
  value?: unknown;
  error?: unknown;
}

type InsuranceType = "LTI" | "Other"
type CrawlerShipSummary = {
  id: number;
  name: string;
  skus: {
    id: number;
  }[];
};
type BuybackPendingItem = {
  name: string;
  detailUrl: string;
  pageId: number;
  fallbackCategory: string;
  fallbackImageUrl: string;
};
type ParsedBuybackShip = {
  id?: number;
  name: string;
};
type ParsedBuybackOther = {
  name: string;
  type: string;
  withImage: boolean;
  image: string;
};
type ParsedBuybackDetail = {
  name: string;
  category: string;
  value: number;
  insurance: InsuranceType;
  ships: ParsedBuybackShip[];
  others: ParsedBuybackOther[];
};
const CRAWLER_SNACKBAR_TOP_OFFSET_PX = 72;

function formatCrawlerErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return fallbackMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getResponseData(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return value.data;
}

function extractAccountFromResponse(value: unknown): UserInfo | null {
  const responseData = getResponseData(value);

  if (!Array.isArray(responseData)) {
    return null;
  }

  const firstResult = responseData[0];

  if (!isRecord(firstResult) || !isRecord(firstResult.data) || !isRecord(firstResult.data.account)) {
    return null;
  }

  const account = firstResult.data.account;
  const { id, username, nickname, avatar, isAnonymous } = account as { 
    id: number | undefined, 
    username: string | undefined, 
    nickname: string | undefined, 
    avatar: string | undefined, 
    isAnonymous: boolean | undefined 
  };

  if (
    typeof isAnonymous !== "boolean"
  ) {
    return null;
  }

  return {
    id: id || -1,
    username: username || "",
    nickname: nickname || "",
    avatar: avatar || "",
    isAnonymous,
  };
}

function extractTextResponse(value: unknown): string | null {
  const responseData = getResponseData(value);

  return typeof responseData === "string" ? responseData : null;
}

function normalizeWhitespace(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function normalizeImageUrl(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  if (value.startsWith("https://") || value.startsWith("http://")) {
    return value;
  }

  return `https://robertsspaceindustries.com/${value.replace(/^\/+/, "")}`;
}

function extractBackgroundImageUrl(styleValue: string | null | undefined) {
  if (!styleValue) {
    return "";
  }

  const matchedUrl = styleValue.match(/url\((['"]?)(.*?)\1\)/i)?.[2];

  return normalizeImageUrl(matchedUrl);
}

function extractPriceValue(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const normalizedValue = value.replace(/,/g, "");
  const matchedNumber = normalizedValue.match(/-?\d+(?:\.\d+)?/);

  return matchedNumber ? Number(matchedNumber[0]) : 0;
}

function extractInsuranceType(value: string) {
  const normalizedValue = normalizeWhitespace(value).toLowerCase();

  if (!normalizedValue.includes("insurance")) {
    return null;
  }

  if (normalizedValue.includes("lifetime insurance")) {
    return "LTI" as const;
  }

  return "Other" as const;
}

function getBuybackCategory(name: string) {
  return normalizeWhitespace(name.split(" - ")[0]);
}

function stripBuybackCategory(name: string) {
  return normalizeWhitespace(name.replace(/^[^-]+-\s*/, ""));
}

function inferBuybackOtherType(category: string, itemName: string) {
  const normalizedValue = `${category} ${itemName}`.toLowerCase();

  if (normalizedValue.includes("paint")) {
    return "Skin";
  }

  return "Item";
}

function extractCrawlerShipsFromResponse(value: unknown): CrawlerShipSummary[] | null {
  const responseData = getResponseData(value);

  if (!Array.isArray(responseData)) {
    return null;
  }

  const firstResult = responseData[0];

  if (!isRecord(firstResult) || !isRecord(firstResult.data) || !Array.isArray(firstResult.data.ships)) {
    return null;
  }

  const crawlerShips = firstResult.data.ships
    .map((ship): CrawlerShipSummary | null => {
      if (!isRecord(ship) || !Array.isArray(ship.skus)) {
        return null;
      }

      const { id, name, skus } = ship;

      if (typeof id !== "number" || typeof name !== "string") {
        return null;
      }

      const normalizedSkus = skus
        .map((sku): { id: number } | null => {
          if (!isRecord(sku) || typeof sku.id !== "number") {
            return null;
          }

          return { id: sku.id };
        })
        .filter((sku): sku is { id: number } => sku !== null);

      return {
        id,
        name,
        skus: normalizedSkus,
      };
    })
    .filter((ship): ship is CrawlerShipSummary => ship !== null);

  return crawlerShips;
}

function extractCCUShipNameCandidates(packageName: string) {
  const normalizedPackageName = normalizeWhitespace(packageName);
  const supportedPatterns = [
    /^upgrade\s*-\s*(.*?)\s+to\s+(.*?)(?:\s+\w+\s+edition)?$/i,
    /^(.*?)\s+to\s+(.*?)\s+upgrade(?:\s+\w+\s+edition)?$/i,
  ];

  for (const pattern of supportedPatterns) {
    const match = normalizedPackageName.match(pattern);

    if (!match) {
      continue;
    }

    const fromCandidate = normalizeWhitespace(match[1]);
    const toCandidate = normalizeWhitespace(match[2]);

    if (fromCandidate && toCandidate) {
      return { fromCandidate, toCandidate };
    }
  }

  return null;
}

export default function Crawler({ ships }: { ships: Ship[] }) {
  const intl = useIntl();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const totalRequestsRef = useRef(0);
  const totalCCUsRef = useRef(0);
  const totalBuybacksRef = useRef(0);
  const totalBundlesRef = useRef(0)
  const totalShipsRef = useRef(0);
  const beginTime = useRef(0)
  const completedRequestsRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [notification, setNotification] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });
  const requestQueueRef = useRef<RequestItem[]>([]);
  const activeRequestsRef = useRef<Set<string | number>>(new Set());
  const shipsRef = useRef<CrawlerShipSummary[]>([])
  const buybackDetailRequestCounterRef = useRef(0);
  const buybackDetailRequestNamesRef = useRef<Record<string, string>>({});
  const requestedBuybackDetailNamesRef = useRef<Set<string>>(new Set());
  const pendingBuybackItemsRef = useRef<Record<string, BuybackPendingItem[]>>({});
  const parsedBuybackDetailsRef = useRef<Record<string, ParsedBuybackDetail>>({});
  const maxConcurrentRequests = 5;

  const userRef = useRef<UserInfo>({
    id: 0,
    username: "",
    nickname: "",
    avatar: "",
    isAnonymous: false,
  });

  // useEffect(() => {
  //   if (isRefreshing) {
  //     const timer = setTimeout(() => {
  //       setIsRefreshing(false);
  //     }, 1000);

  //     return () => clearTimeout(timer);
  //   }
  // }, [isRefreshing]);

  const dispatch = useDispatch();

  // MARK: Hangar

  const shipWithAlias = ships.filter(
    (ship): ship is Ship & { alias: string } => typeof ship.alias === "string" && ship.alias.length > 0
  )

  const normalizeShipName = useCallback((shipName: string) => shipName.toLowerCase().trim(), []);

  const resolveShipName = useCallback((shipName: string) => {
    const normalizedShipName = normalizeShipName(shipName);

    const exactMatch = ships.find(ship => normalizeShipName(ship.name) === normalizedShipName);
    if (exactMatch) return exactMatch.name;

    const aliasMatch = shipWithAlias.find(ship => {
      try {
        const aliases = JSON.parse(ship.alias);

        if (!Array.isArray(aliases)) return false;

        return aliases.some(alias =>
          typeof alias === "string" && normalizeShipName(alias) === normalizedShipName
        );
      } catch {
        return false;
      }
    });

    return aliasMatch?.name || "";
  }, [normalizeShipName, shipWithAlias, ships]);

  const tryResolveCCU = useCallback((content: { name: string, match_items: { name: string }[], target_items: { name: string }[] }) => {
    const name = content.name;

    let from = "";
    let to = "";

    try {
      const nameCandidates = extractCCUShipNameCandidates(name);
      const fallbackFrom = content.match_items[0]?.name?.trim() || "";
      const fallbackTo = content.target_items[0]?.name?.trim() || "";

      const fromCandidates = Array.from(new Set([
        nameCandidates?.fromCandidate || "",
        fallbackFrom,
      ].filter(Boolean)));

      const toCandidates = Array.from(new Set([
        nameCandidates?.toCandidate || "",
        fallbackTo,
      ].filter(Boolean)));

      from = fromCandidates.reduce((resolved, candidate) => {
        if (resolved) return resolved;
        return resolveShipName(candidate);
      }, "");

      to = toCandidates.reduce((resolved, candidate) => {
        if (resolved) return resolved;
        return resolveShipName(candidate);
      }, "");

      if (!from) {
        fromCandidates.forEach(candidate => {
          from = ships.find(ship => ship.id === Number(candidate))?.name || from
        })
      }

      if (!to) {
        toCandidates.forEach(candidate => {
          to = ships.find(ship => ship.id === Number(candidate))?.name || to
        })
      }

      const fromShip = ships.find(ship => normalizeShipName(ship.name) === normalizeShipName(from));
      const toShip = ships.find(ship => normalizeShipName(ship.name) === normalizeShipName(to));

      if (!fromShip || !toShip) {
        throw new Error(JSON.stringify({
          reason: "CCU_SHIP_NOT_FOUND",
          fromCandidates,
          toCandidates,
          resolvedFrom: from,
          resolvedTo: to,
        }));
      }

      return {
        from: fromShip.name,
        to: toShip.name,
        fromShipId: fromShip.id,
        toShipId: toShip.id,
      };
    } catch (error) {
      console.warn("error parsing ccu", name, "error >>>>", error, "reporting");
      reportError({
        errorType: "CCU_PARSING_ERROR",
        errorMessage: JSON.stringify({
          content,
          error: String(error),
        }),
        appVersion: __BUILD_TIME__
      });
      return false;
    }

  }, [normalizeShipName, resolveShipName, ships]);

  const getBuybackDetailKey = useCallback((name: string) => normalizeWhitespace(name).toLowerCase(), []);

  const parseBuybackDetailPage = useCallback((doc: Document, fallbackItem: BuybackPendingItem): ParsedBuybackDetail => {
    const title = normalizeWhitespace(doc.querySelector(".buy-back-title")?.textContent)
      || normalizeWhitespace(doc.querySelector(".content-block4 h1")?.textContent)
      || fallbackItem.name;
    const category = getBuybackCategory(title) || fallbackItem.fallbackCategory || "Item";
    const priceValue = Number(doc.querySelector(".price .final-price")?.getAttribute("data-value") || "0") / 100;
    const detailImageUrl = normalizeImageUrl(doc.querySelector(".lcol figure img")?.getAttribute("src")) || fallbackItem.fallbackImageUrl;
    let insurance: InsuranceType = "Other";

    const detailShips = Array.from(doc.querySelectorAll(".package-listing.ship ul > li"))
      .map((shipItem) => normalizeWhitespace(shipItem.querySelector(".info span")?.textContent))
      .filter(Boolean)
      .map((shipName): ParsedBuybackShip => {
        const resolvedShipName = resolveShipName(shipName);
        const matchedShip = ships.find(ship => normalizeShipName(ship.name) === normalizeShipName(resolvedShipName || shipName));

        if (matchedShip) {
          return {
            id: matchedShip.id,
            name: matchedShip.name,
          };
        }

        return {
          name: shipName,
        };
      });

    const detailOthers = Array.from(doc.querySelectorAll(".package-listing.item ul > li"))
      .map((item) => normalizeWhitespace(item.textContent))
      .filter(Boolean)
      .reduce<ParsedBuybackOther[]>((others, itemName) => {
        const insuranceType = extractInsuranceType(itemName);

        if (insuranceType) {
          if (insuranceType === "LTI") {
            insurance = "LTI";
          }

          return others;
        }

        others.push({
          name: itemName,
          type: inferBuybackOtherType(category, itemName),
          withImage: false,
          image: "",
        });

        return others;
      }, []);

    if (!detailShips.length && detailOthers.length > 0 && detailImageUrl) {
      detailOthers[0] = {
        ...detailOthers[0],
        withImage: true,
        image: detailImageUrl,
      };
    }

    if (!detailShips.length && !detailOthers.length) {
      detailOthers.push({
        name: stripBuybackCategory(title) || title,
        type: inferBuybackOtherType(category, title),
        withImage: !!detailImageUrl,
        image: detailImageUrl,
      });
    }

    return {
      name: title,
      category,
      value: priceValue,
      insurance,
      ships: detailShips,
      others: detailOthers,
    };
  }, [normalizeShipName, resolveShipName, ships]);

  const materializeBuybackItem = useCallback((buybackItem: BuybackPendingItem, detail: ParsedBuybackDetail) => {
    const isStandaloneShip = detail.category === "Standalone Ships"
      && detail.ships.length === 1
      && typeof detail.ships[0]?.id === "number";

    if (isStandaloneShip) {
      dispatch(addShip({
        id: detail.ships[0].id as number,
        name: detail.ships[0].name,
        insurance: detail.insurance,
        value: detail.value,
        isBuyBack: true,
        canGift: false,
        belongsTo: userRef.current?.id,
        pageId: buybackItem.pageId,
      }));

      totalShipsRef.current++
      totalBuybacksRef.current++

      return;
    }

    const bundleOthers = detail.others.length > 0
      ? detail.others.map((other, index) => ({
        id: buybackItem.pageId * 1000 + index + 1,
        name: other.name,
        withImage: other.withImage,
        image: other.image,
        type: other.type,
        value: detail.value,
        isBuyBack: true,
        canGift: false,
        belongsTo: userRef.current?.id,
        pageId: buybackItem.pageId,
      }))
      : [{
        id: buybackItem.pageId * 1000 + 1,
        name: stripBuybackCategory(detail.name) || detail.name,
        withImage: !!buybackItem.fallbackImageUrl,
        image: buybackItem.fallbackImageUrl,
        type: inferBuybackOtherType(detail.category, detail.name),
        value: detail.value,
        isBuyBack: true,
        canGift: false,
        belongsTo: userRef.current?.id,
        pageId: buybackItem.pageId,
      }];

    dispatch(addBundle({
      ships: detail.ships.map(ship => ({
        ...(typeof ship.id === "number" ? { id: ship.id } : {}),
        name: ship.name,
      })),
      others: bundleOthers,
      name: detail.name,
      insurance: detail.insurance,
      value: detail.value,
      isBuyBack: true,
      canGift: false,
      belongsTo: userRef.current?.id,
      pageId: buybackItem.pageId,
    }))

    totalBundlesRef.current++
    totalBuybacksRef.current++
  }, [dispatch]);

  const parseHangarItems = useCallback((doc: Document, pageId: number) => {
    const listItems = doc.body.querySelector('.list-items');

    listItems?.querySelectorAll('li').forEach((li, index) => {
      const value = li.querySelector('.js-pledge-value')?.getAttribute('value');
      const ccuData = li.querySelector('.js-upgrade-data')?.getAttribute('value');
      const parsedValue = extractPriceValue(value);
      const canGift = !!li.querySelector('.gift');

      const id = (pageId - 1) * 10 + index + 1;

      if (ccuData) {
        const content = JSON.parse(ccuData)

        const parsed = tryResolveCCU(content);

        if (!parsed) return;

        dispatch(addCCU({
          from: { id: parsed.fromShipId, name: parsed.from },
          to: { id: parsed.toShipId, name: parsed.to },
          name: content.name,
          value: parsedValue,
          parsed,
          isBuyBack: false,
          canGift,
          belongsTo: userRef.current?.id,
          pageId: id,
        }));

        totalCCUsRef.current++

        return;
      }

      const items = li.querySelectorAll('.item');
      const bundleName = normalizeWhitespace(li.querySelector('.js-pledge-name')?.getAttribute('value'));
      const bundleCategory = getBuybackCategory(bundleName);
      const fallbackImageUrl = extractBackgroundImageUrl(li.querySelector('.item-image-wrapper .image')?.getAttribute('style'));

      let currentInsurance: InsuranceType = "Other"
      const currentShips: Ship[] = []
      const currentOthers: OtherItem[] = []

      items.forEach((item, itemIndex) => {
        const itemType = normalizeWhitespace(item.querySelector('.kind')?.textContent);
        const itemName = normalizeWhitespace(item.querySelector('.title')?.textContent)
          || intl.formatMessage({ id: 'crawler.unknownItem', defaultMessage: 'Unknown Item' });
        const itemImage = extractBackgroundImageUrl(item.querySelector('.image')?.getAttribute('style'));
        const insuranceType = extractInsuranceType(`${itemType} ${itemName}`);

        if (insuranceType) {
          if (insuranceType === "LTI") {
            currentInsurance = "LTI";
          }

          return;
        }

        const resolvedShipName = resolveShipName(itemName);
        const matchedShip = ships.find(ship =>
          normalizeShipName(ship.name) === normalizeShipName(resolvedShipName || itemName)
        );
        const looksLikeShip = itemType === "Ship" || (!itemType && !!matchedShip);

        if (looksLikeShip && matchedShip) {
          currentShips.push(matchedShip);
          return;
        }

        currentOthers.push({
          id: id * 1000 + itemIndex + 1,
          name: itemName,
          withImage: !!itemImage,
          image: itemImage,
          type: itemType || inferBuybackOtherType(bundleCategory || "Item", itemName),
          value: parsedValue,
          isBuyBack: false,
          canGift,
          belongsTo: userRef.current?.id,
          pageId: id,
        })
      })

      if (!currentShips.length && currentOthers.length > 0 && fallbackImageUrl && !currentOthers.some(other => other.withImage)) {
        currentOthers[0] = {
          ...currentOthers[0],
          withImage: true,
          image: fallbackImageUrl,
        };
      }

      // bundle
      if (currentShips.length > 1 || currentOthers.length > 0) {
        dispatch(addBundle({
          ships: currentShips.map(ship => ({
            id: ship.id,
            name: ship.name
          })),
          others: currentOthers,
          name: bundleName || intl.formatMessage({ id: 'crawler.unknownBundle', defaultMessage: 'Unknown Bundle' }),
          insurance: currentInsurance,
          value: parsedValue,
          isBuyBack: false,
          canGift,
          belongsTo: userRef.current?.id,
          pageId: id,
        }))

        totalBundlesRef.current++

        return;
      }

      // standalone ship
      if (currentShips.length === 1) {
        dispatch(addShip({
          id: currentShips[0].id,
          name: currentShips[0].name,
          insurance: currentInsurance,
          value: parsedValue,
          isBuyBack: false,
          canGift,
          belongsTo: userRef.current?.id,
          pageId: id,
        }))

        totalShipsRef.current++

        return;
      }

    });
  }, [dispatch, intl, normalizeShipName, resolveShipName, ships, tryResolveCCU]);

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

  const queueBuybackDetailRequest = useCallback((buybackItem: BuybackPendingItem) => {
    const detailKey = getBuybackDetailKey(buybackItem.name);
    const cachedDetail = parsedBuybackDetailsRef.current[detailKey];

    if (cachedDetail) {
      materializeBuybackItem(buybackItem, cachedDetail);
      return;
    }

    pendingBuybackItemsRef.current[detailKey] = [
      ...(pendingBuybackItemsRef.current[detailKey] || []),
      buybackItem,
    ];

    if (requestedBuybackDetailNamesRef.current.has(detailKey)) {
      return;
    }

    requestedBuybackDetailNamesRef.current.add(detailKey);

    const requestId = `buyback-detail-${buybackDetailRequestCounterRef.current++}`;
    buybackDetailRequestNamesRef.current[requestId] = detailKey;

    addToQueue({
      type: 'ccuPlannerAppIntegrationRequest',
      message: {
        type: "httpRequest",
        request: {
          url: new URL(buybackItem.detailUrl, "https://robertsspaceindustries.com").toString(),
          responseType: "text",
          method: "get",
          data: null,
        },
        requestId,
      }
    });
  }, [addToQueue, getBuybackDetailKey, materializeBuybackItem]);

  const parseBuybackItems = useCallback((doc: Document, pageId: number) => {
    const listItems = doc.body.querySelectorAll('.available-pledges .pledges>li');

    listItems.forEach((li, index) => {
      const id = (pageId - 1) * 250 + index + 1;
      const buybackAction = li.querySelector("a.holosmallbtn");
      const name = normalizeWhitespace(li.querySelector("h1")?.textContent) || normalizeWhitespace(li.querySelector("img")?.getAttribute("alt"));
      const from = buybackAction?.getAttribute("data-fromshipid");
      const to = buybackAction?.getAttribute("data-toshipid");
      const toSku = buybackAction?.getAttribute("data-toskuid");

      if (!name) {
        return;
      }

      if (from && to && toSku) {
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
            from: { id: parsed.fromShipId, name: parsed.from },
            to: { id: parsed.toShipId, name: parsed.to },
            value: ccu.price / 100,
            parsed,
            isBuyBack: true,
            canGift: true,
            belongsTo: userRef.current?.id,
            pageId: id,
          }));

          totalBuybacksRef.current++
        }

        return;
      }

      const detailUrl = "/en" + buybackAction?.getAttribute("href");

      if (!detailUrl) {
        console.warn("missing buyback detail url", name, li);
        return;
      }

      queueBuybackDetailRequest({
        name,
        detailUrl,
        pageId: id,
        fallbackCategory: getBuybackCategory(name),
        fallbackImageUrl: normalizeImageUrl(li.querySelector("img")?.getAttribute("src")),
      });
    });
  }, [dispatch, queueBuybackDetailRequest, ships, tryResolveCCU]);

  const resetCrawlerState = useCallback(() => {
    setProgress(0);
    totalRequestsRef.current = 0;
    completedRequestsRef.current = 0;
    totalBundlesRef.current = 0;
    totalBuybacksRef.current = 0;
    totalCCUsRef.current = 0;
    totalShipsRef.current = 0;
    requestQueueRef.current = [];
    activeRequestsRef.current.clear();
    buybackDetailRequestCounterRef.current = 0;
    buybackDetailRequestNamesRef.current = {};
    requestedBuybackDetailNamesRef.current.clear();
    pendingBuybackItemsRef.current = {};
    parsedBuybackDetailsRef.current = {};
    shipsRef.current = [];
  }, []);

  const stopCrawlerSync = useCallback(() => {
    resetCrawlerState();
    setIsRefreshing(false);
  }, [resetCrawlerState]);

  const showCrawlerNotification = useCallback((message: string, severity: 'success' | 'error' | 'info' | 'warning') => {
    setNotification({
      open: true,
      message,
      severity,
    });
  }, []);

  const handleCrawlerFailure = useCallback((error: unknown) => {
    console.error("crawler sync failed", error);

    showCrawlerNotification(
      formatCrawlerErrorMessage(
        error,
        intl.formatMessage({
          id: 'crawler.requestFailed',
          defaultMessage: 'Failed to sync hangar data. Please confirm the Citizens Hub browser extension is enabled and try again.'
        })
      ),
      'error'
    );
    stopCrawlerSync();
  }, [intl, showCrawlerNotification, stopCrawlerSync]);

  const finishCrawlerSync = useCallback(() => {
    reportBi<{
      requests: number,
      ccus: number,
      buybacks: number,
      bundles: number,
      ships: number,
      timeCost: number
    }>({
      slot: BiSlots.CRAWLER_USE,
      data: {
        requests: totalRequestsRef.current,
        ccus: totalCCUsRef.current,
        buybacks: totalBuybacksRef.current,
        bundles: totalBundlesRef.current,
        ships: totalShipsRef.current,
        timeCost: new Date().getTime() - beginTime.current
      }
    });

    stopCrawlerSync();
  }, [stopCrawlerSync]);

  const startCrawlerSync = useCallback(() => {
    resetCrawlerState();
    setNotification(current => current.open ? { ...current, open: false } : current);
    setIsRefreshing(true);
    beginTime.current = new Date().getTime();

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
  }, [addToQueue, resetCrawlerState]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type !== 'ccuPlannerAppIntegrationResponse') return;

      const message = event.data.message as ExtensionResponseMessage | undefined;
      const requestId = message?.requestId;

      if (!message || requestId == null || !activeRequestsRef.current.has(requestId)) return;

      if (message.error) {
        activeRequestsRef.current.delete(requestId);
        handleCrawlerFailure(message.error);
        return;
      }

      try {
        if (requestId === "set-auth-token") {
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
        }

        if (requestId === "set-context-token") {
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
        }

        if (requestId === "user-info") {
          const account = extractAccountFromResponse(message.value);

          if (!account) {
            throw new Error("Invalid account response from browser extension");
          }

          userRef.current = account;

          if (userRef.current.isAnonymous) {
            showCrawlerNotification(
              intl.formatMessage({
                id: 'crawler.loginRequired',
                defaultMessage: 'Please log in at https://robertsspaceindustries.com/en/ to sync your hangar data'
              }),
              'warning'
            );
            stopCrawlerSync();
            return;
          }

          sessionStorage.setItem("currentRSIAccount", String(account.id));

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
                "url": "https://robertsspaceindustries.com/en/account/buy-back-pledges?page=1&pagesize=250",
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
          });
        }

        if (typeof requestId === 'string' && requestId.startsWith("ccus-")) {
          const pageId = requestId.split("-")[1];
          const htmlString = extractTextResponse(message.value);

          if (!htmlString) {
            throw new Error(`Invalid hangar response for request ${requestId}`);
          }

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
          const htmlString = extractTextResponse(message.value);

          if (!htmlString) {
            throw new Error(`Invalid buyback response for request ${requestId}`);
          }

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
                    "url": `https://robertsspaceindustries.com/en/account/buy-back-pledges?page=${i}&pagesize=250`,
                    "responseType": "text",
                    "method": "get",
                    "data": null
                  },
                  requestId: `buyback-ccus-${i}`
                }
              });
            }
          }

          parseBuybackItems(doc, Number(pageId));
        }

        if (typeof requestId === 'string' && requestId.startsWith("buyback-detail-")) {
          const detailKey = buybackDetailRequestNamesRef.current[requestId];
          const htmlString = extractTextResponse(message.value);

          if (!detailKey || !htmlString) {
            throw new Error(`Invalid buyback detail response for request ${requestId}`);
          }

          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlString, 'text/html');
          const pendingItems = pendingBuybackItemsRef.current[detailKey] || [];

          if (pendingItems.length === 0) {
            delete buybackDetailRequestNamesRef.current[requestId];
          } else {
            const parsedDetail = parseBuybackDetailPage(doc, pendingItems[0]);
            parsedBuybackDetailsRef.current[detailKey] = parsedDetail;
            pendingItems.forEach((buybackItem) => {
              materializeBuybackItem(buybackItem, parsedDetail);
            });

            delete pendingBuybackItemsRef.current[detailKey];
            delete buybackDetailRequestNamesRef.current[requestId];
          }
        }

        if (requestId === "init-ship-upgrade") {
          const crawlerShips = extractCrawlerShipsFromResponse(message.value);

          if (crawlerShips) {
            shipsRef.current = crawlerShips;
          }
        }

        activeRequestsRef.current.delete(requestId);

        completedRequestsRef.current++;
        setProgress(completedRequestsRef.current / totalRequestsRef.current * 100);

        if (completedRequestsRef.current >= totalRequestsRef.current) {
          setTimeout(() => {
            finishCrawlerSync();
          }, 500);
          return;
        }

        processNextRequests();
      } catch (error) {
        activeRequestsRef.current.delete(requestId);
        handleCrawlerFailure(error);
      }
    }

    window.addEventListener('message', handleMessage);

    return () => window.removeEventListener('message', handleMessage);
  }, [
    addToQueue,
    dispatch,
    finishCrawlerSync,
    handleCrawlerFailure,
    intl,
    materializeBuybackItem,
    parseBuybackDetailPage,
    parseBuybackItems,
    parseHangarItems,
    processNextRequests,
    showCrawlerNotification,
    stopCrawlerSync
  ]);

  //@ts-expect-error parser
  window.crawlerdebugtools = {}
  //@ts-expect-error parser
  window.crawlerdebugtools.parseHangar = (htmlString: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    parseHangarItems(doc, 1);
  }
  //@ts-expect-error parser
  window.crawlerdebugtools.parseBuybacks = (htmlString: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    // parseHangarItems(doc, 1);
    parseBuybackItems(doc, 1)
  }
  //@ts-expect-error parser
  window.crawlerdebugtools.addShip = (shipId: number) => {
    const ship = ships.find(ship => ship.id === shipId)

    if (!ship) return;

    console.log("added ship>>>>>", ship);

    dispatch(addShip({
      id: shipId,
      name: ship.name,
      insurance: "LTI",
      value: ship.msrp,
      isBuyBack: false,
      canGift: false,
      belongsTo: userRef.current?.id,
      pageId: 9999,
    }))
  }

  const progressBar = progress > 0 && typeof document !== "undefined"
    ? createPortal(
      <div
        className="pointer-events-none fixed top-0 left-0 right-0"
        style={{ zIndex: 9999 }}
      >
        <LinearProgress
          variant="determinate"
          sx={{ width: '100%' }}
          value={progress}
        />
      </div>,
      document.body
    )
    : null;

  return <>
    {progressBar}
    <Button
      variant="text"
      onClick={startCrawlerSync}
      disabled={ships.length === 0 || isRefreshing}
      aria-label={intl.formatMessage({ id: 'crawler.sync', defaultMessage: 'Sync Hangar' })}
    >
      <FormattedMessage id="crawler.sync" defaultMessage="Sync Hangar" />
    </Button>
    <Snackbar
      open={notification.open}
      autoHideDuration={6000}
      onClose={() => setNotification({ ...notification, open: false })}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      style={{
        top: `calc(env(safe-area-inset-top, 0px) + ${CRAWLER_SNACKBAR_TOP_OFFSET_PX}px)`,
      }}
    >
      <Alert
        onClose={() => setNotification({ ...notification, open: false })}
        severity={notification.severity}
        sx={{ width: '100%' }}
      >
        {notification.message}
      </Alert>
    </Snackbar>
    {/* <IconButton
      color="primary"
      size="small"
      onClick={() => {
        setIsRefreshing(true);
        setProgress(0);
        totalRequestsRef.current = 0;
        completedRequestsRef.current = 0;

        requestQueueRef.current = [];
        activeRequestsRef.current.clear();
        buybackDetailRequestCounterRef.current = 0;
        buybackDetailRequestNamesRef.current = {};
        requestedBuybackDetailNamesRef.current.clear();
        pendingBuybackItemsRef.current = {};
        parsedBuybackDetailsRef.current = {};
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
      }}
      disabled={ships.length === 0}
      aria-label={intl.formatMessage({ id: 'crawler.refetch', defaultMessage: 'Refetch My Hangar Data' })}
    >
      <Refresh className={isRefreshing ? 'animate-spin' : ''} />
    </IconButton> */}
  </>
}
