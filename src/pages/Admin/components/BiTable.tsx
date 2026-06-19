import { useMemo, useState, type ReactNode } from "react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  type ChartOptions,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { useDailyBiReports } from "@/hooks/swr/admin/useDailyBiReports";
import { BiSlots } from "@/report";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, Tooltip, Legend);

type JsonDialogState = {
  title: string;
  content: string;
} | null;

type SlotMetric = {
  slot: BiSlots;
  value: number;
};

type DimensionCategory = "deviceTag" | "errorType" | "appVersion";

type DimensionMetric = {
  category: DimensionCategory;
  label: string;
  value: number;
};

type LabeledMetric = {
  label: string;
  value: number;
};

type PlannerTargetRouteMetric = {
  label: string;
  total: number;
  valid: number;
  invalid: number;
  validRate: number;
};

type KpiMetric = {
  label: string;
  value: string;
  helper?: string;
};

type PlannerHourlyMetric = {
  hour: string;
  total: number;
  valid: number;
  invalid: number;
};

const BI_SLOT_VALUES = new Set<string>(Object.values(BiSlots));

const SLOT_LABEL_MESSAGES: Record<BiSlots, { id: string; defaultMessage: string }> = {
  [BiSlots.VIEW_SESSION]: { id: "admin.bi.slot.VS", defaultMessage: "View Session" },
  [BiSlots.VERSION_UPDATE]: { id: "admin.bi.slot.VU", defaultMessage: "Version Update" },
  [BiSlots.CRAWLER_USE]: { id: "admin.bi.slot.CU", defaultMessage: "Crawler Use" },
  [BiSlots.IMPORT_ROUTE]: { id: "admin.bi.slot.IR", defaultMessage: "Import Route" },
  [BiSlots.EXPORT_ROUTE]: { id: "admin.bi.slot.ER", defaultMessage: "Export Route" },
  [BiSlots.PLANNER_USE]: { id: "admin.bi.slot.PU", defaultMessage: "Planner Use" },
  [BiSlots.ADD_RSI_CART]: { id: "admin.bi.slot.ARC", defaultMessage: "Add RSI Cart" },
  [BiSlots.VIEW_GUIDE]: { id: "admin.bi.slot.VG", defaultMessage: "View Guide" },
  [BiSlots.MARKET_CCU_PLANNER_SELECTION]: { id: "admin.bi.slot.MCPS", defaultMessage: "Market CCU Planner Selection" },
  [BiSlots.MARKET_CCU_PLANNER_ROUTE_RESULT]: { id: "admin.bi.slot.MCPR", defaultMessage: "Market CCU Planner Route Result" },
  [BiSlots.MARKET_CCU_PLANNER_ADD_TO_CART]: { id: "admin.bi.slot.MCPA", defaultMessage: "Market CCU Planner Add to Cart" },
  [BiSlots.MARKET_CCU_PLANNER_CHECKOUT]: { id: "admin.bi.slot.MCPC", defaultMessage: "Market CCU Planner Checkout" },
  [BiSlots.NAVIGATE_RSI_HANGAR]: { id: "admin.bi.slot.NRH", defaultMessage: "Navigate RSI Hangar" },
};

const SUMMARY_FIELD_MESSAGES: Record<string, { id: string; defaultMessage: string }> = {
  type: { id: "admin.bi.field.type", defaultMessage: "Type" },
  version: { id: "admin.bi.field.version", defaultMessage: "Version" },
  reportDate: { id: "admin.bi.field.reportDate", defaultMessage: "Report Date" },
  timezone: { id: "admin.bi.field.timezone", defaultMessage: "Timezone" },
  window: { id: "admin.bi.field.window", defaultMessage: "Window" },
  generatedAt: { id: "admin.bi.field.generatedAt", defaultMessage: "Generated At" },
  summary: { id: "admin.bi.field.summary", defaultMessage: "Summary" },
};

const DIMENSION_COLORS: Record<DimensionCategory, string> = {
  deviceTag: "#2563eb",
  errorType: "#ef4444",
  appVersion: "#10b981",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getAtPath(root: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = root;

  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

function isBiSlotCode(value: string): value is BiSlots {
  return BI_SLOT_VALUES.has(value);
}

function formatSlotLabel(slot: BiSlots, intl: IntlShape): string {
  const message = SLOT_LABEL_MESSAGES[slot];
  return intl.formatMessage({ id: message.id, defaultMessage: message.defaultMessage });
}

function formatDimensionCategory(category: DimensionCategory, intl: IntlShape): string {
  switch (category) {
    case "deviceTag":
      return intl.formatMessage({ id: "admin.bi.category.deviceTag", defaultMessage: "Device Tag" });
    case "errorType":
      return intl.formatMessage({ id: "admin.bi.category.errorType", defaultMessage: "Error Type" });
    case "appVersion":
      return intl.formatMessage({ id: "admin.bi.category.appVersion", defaultMessage: "App Version" });
    default:
      return category;
  }
}

function safeStringify(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  if (value === undefined || value === null) {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatSummaryValue(value: unknown, intl: IntlShape): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    return intl.formatMessage(
      { id: "admin.bi.summary.arrayItems", defaultMessage: "[{count} items]" },
      { count: value.length },
    );
  }

  const keys = Object.keys(value as Record<string, unknown>);
  return intl.formatMessage(
    { id: "admin.bi.summary.objectKeys", defaultMessage: "{count} keys" },
    { count: keys.length },
  );
}

function formatReportSummary(report: unknown, intl: IntlShape): string {
  if (!isRecord(report)) {
    return "-";
  }

  return Object.entries(report)
    .map(([key, value]) => {
      const message = SUMMARY_FIELD_MESSAGES[key];
      const label = message
        ? intl.formatMessage({ id: message.id, defaultMessage: message.defaultMessage })
        : key;
      return `${label}: ${formatSummaryValue(value, intl)}`;
    })
    .join(" | ");
}

function findNumericValue(value: unknown, depth = 0): number | null {
  if (depth > 4) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findNumericValue(item, depth + 1);
      if (nested !== null) {
        return nested;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const candidateKeys = ["count", "total", "value", "times", "events", "eventCount"] as const;
  for (const key of candidateKeys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  for (const nested of Object.values(value)) {
    const nestedValue = findNumericValue(nested, depth + 1);
    if (nestedValue !== null) {
      return nestedValue;
    }
  }

  return null;
}

function getNumericAtPath(root: Record<string, unknown>, path: string[], fallback = 0): number {
  const value = getAtPath(root, path);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getArrayAtPath<T = unknown>(root: Record<string, unknown>, path: string[]): T[] {
  const value = getAtPath(root, path);
  return Array.isArray(value) ? value as T[] : [];
}

function formatInteger(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number, locale: string): string {
  return `${formatNumber(value, locale)}%`;
}

function formatUsd(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function parseSlotContainer(container: unknown): SlotMetric[] {
  const result = new Map<BiSlots, number>();

  if (isRecord(container)) {
    for (const [key, value] of Object.entries(container)) {
      if (!isBiSlotCode(key)) {
        continue;
      }

      const numericValue = findNumericValue(value);
      if (numericValue === null) {
        continue;
      }

      result.set(key, Math.max(result.get(key) ?? 0, numericValue));
    }
  }

  if (Array.isArray(container)) {
    for (const item of container) {
      if (!isRecord(item)) {
        continue;
      }

      const slot = [item.slot, item.slotCode, item.code, item.key, item.name, item.value].find(
        (candidate) => typeof candidate === "string" && isBiSlotCode(candidate),
      ) as BiSlots | undefined;

      if (!slot) {
        continue;
      }

      const numericValue = findNumericValue(item);
      if (numericValue === null) {
        continue;
      }

      result.set(slot, Math.max(result.get(slot) ?? 0, numericValue));
    }
  }

  return Array.from(result.entries())
    .map(([slot, value]) => ({ slot, value }))
    .sort((a, b) => b.value - a.value);
}

function extractSlotMetrics(report: Record<string, unknown>): SlotMetric[] {
  const candidates = [
    getAtPath(report, ["summary", "biEvents", "bySlot"]),
    getAtPath(report, ["summary", "biEvents", "slots"]),
    getAtPath(report, ["summary", "bySlot"]),
    getAtPath(report, ["summary", "slots"]),
    getAtPath(report, ["bySlot"]),
    getAtPath(report, ["slots"]),
  ];

  for (const candidate of candidates) {
    const parsed = parseSlotContainer(candidate);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return parseSlotContainer(report);
}

function parseNamedCountContainer(container: unknown, labelKeys: string[]): LabeledMetric[] {
  const output: LabeledMetric[] = [];

  if (isRecord(container)) {
    for (const [key, value] of Object.entries(container)) {
      const numericValue = findNumericValue(value);
      if (numericValue === null) {
        continue;
      }

      output.push({ label: key, value: numericValue });
    }
  }

  if (Array.isArray(container)) {
    for (const item of container) {
      if (!isRecord(item)) {
        continue;
      }

      const rawLabel = labelKeys
        .map((key) => item[key])
        .find((value) => typeof value === "string") as string | undefined;

      const numericValue = findNumericValue(item);
      if (!rawLabel || numericValue === null) {
        continue;
      }

      output.push({ label: rawLabel, value: numericValue });
    }
  }

  return output.sort((a, b) => b.value - a.value);
}

function parsePlannerTargetRouteMetrics(container: unknown): PlannerTargetRouteMetric[] {
  if (!Array.isArray(container)) {
    return [];
  }

  return container
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const rawLabel = [item.value, item.ship, item.name, item.label]
        .find((value) => typeof value === "string") as string | undefined;
      const total = getFiniteNumber(item.count) ?? getFiniteNumber(item.total) ?? 0;
      const valid = getFiniteNumber(item.validRouteCount) ?? getFiniteNumber(item.valid) ?? 0;
      const invalid = getFiniteNumber(item.invalidRouteCount) ?? getFiniteNumber(item.invalid) ?? Math.max(0, total - valid);
      const validRate = getFiniteNumber(item.validRate) ?? (total > 0 ? (valid / total) * 100 : 0);

      if (!rawLabel || total <= 0) {
        return null;
      }

      return {
        label: rawLabel,
        total,
        valid,
        invalid,
        validRate,
      };
    })
    .filter((item): item is PlannerTargetRouteMetric => item !== null)
    .sort((left, right) => {
      if (right.total !== left.total) return right.total - left.total;
      if (right.valid !== left.valid) return right.valid - left.valid;
      return left.label.localeCompare(right.label);
    });
}

function extractDimensionMetrics(report: Record<string, unknown>): DimensionMetric[] {
  const sources: Array<{
    category: DimensionCategory;
    paths: string[][];
    labelKeys: string[];
  }> = [
    {
      category: "deviceTag",
      paths: [
        ["summary", "biEvents", "topDeviceTags"],
        ["summary", "topDeviceTags"],
        ["topDeviceTags"],
      ],
      labelKeys: ["deviceTag", "tag", "name", "key", "value"],
    },
    {
      category: "errorType",
      paths: [
        ["summary", "errors", "byErrorType"],
        ["summary", "byErrorType"],
        ["byErrorType"],
      ],
      labelKeys: ["errorType", "type", "name", "key", "value"],
    },
    {
      category: "appVersion",
      paths: [
        ["summary", "errors", "byAppVersion"],
        ["summary", "biEvents", "byAppVersion"],
        ["summary", "errors", "appVersions"],
        ["summary", "byAppVersion"],
        ["byAppVersion"],
      ],
      labelKeys: ["appVersion", "version", "name", "key", "value"],
    },
  ];

  const merged: DimensionMetric[] = [];

  for (const source of sources) {
    let current: LabeledMetric[] = [];

    for (const path of source.paths) {
      current = parseNamedCountContainer(getAtPath(report, path), source.labelKeys);
      if (current.length > 0) {
        break;
      }
    }

    current.slice(0, 8).forEach((item) => {
      merged.push({
        category: source.category,
        label: item.label,
        value: item.value,
      });
    });
  }

  return merged;
}

function ellipsis(text: string, maxLength = 24): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

function chartCommonOptions(maxX: number): ChartOptions<"bar"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y",
    scales: {
      x: {
        beginAtZero: true,
        suggestedMax: maxX,
        ticks: {
          precision: 0,
        },
        grid: {
          color: "rgba(148, 163, 184, 0.15)",
        },
      },
      y: {
        grid: {
          display: false,
        },
        ticks: {
          autoSkip: false,
          padding: 6,
        },
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.parsed.x}`,
        },
      },
    },
  };
}

function KpiCard({ metric }: { metric: KpiMetric }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", p: 2, bgcolor: "background.paper", minHeight: 104, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {metric.label}
      </Typography>
      <Typography variant="h6" sx={{ mt: 0.75, fontWeight: 800, overflowWrap: "anywhere" }}>
        {metric.value}
      </Typography>
      {metric.helper ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, overflowWrap: "anywhere" }}>
          {metric.helper}
        </Typography>
      ) : null}
    </Box>
  );
}

function SectionPanel({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", p: 2, minWidth: 0 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {description ? (
        <Typography variant="caption" color="text.secondary">
          {description}
        </Typography>
      ) : null}
      <Box sx={{ mt: 1.5, minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  );
}

function TopList({ items, emptyLabel }: { items: LabeledMetric[]; emptyLabel: ReactNode }) {
  if (!items.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        {emptyLabel}
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "grid", gap: 0.75 }}>
      {items.slice(0, 8).map((item) => (
        <Box key={item.label} sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 1, alignItems: "center" }}>
          <Typography variant="body2" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.label}
          </Typography>
          <Chip size="small" label={item.value} />
        </Box>
      ))}
    </Box>
  );
}

function PlannerTargetRouteList({ items, emptyLabel }: { items: PlannerTargetRouteMetric[]; emptyLabel: ReactNode }) {
  const intl = useIntl();

  if (!items.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        {emptyLabel}
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "grid", gap: 0.75 }}>
      {items.slice(0, 8).map((item) => (
        <Box
          key={item.label}
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto auto auto",
            gap: 0.75,
            alignItems: "center",
          }}
        >
          <Typography variant="body2" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.label}
          </Typography>
          <Chip
            size="small"
            color={item.valid > 0 ? "success" : "default"}
            label={intl.formatMessage(
              { id: "admin.bi.planner.targetValidSummary", defaultMessage: "{valid}/{total} valid" },
              { valid: formatInteger(item.valid, intl.locale), total: formatInteger(item.total, intl.locale) },
            )}
          />
          <Chip
            size="small"
            color={item.invalid > 0 ? "warning" : "default"}
            variant="outlined"
            label={intl.formatMessage(
              { id: "admin.bi.planner.targetNoRouteSummary", defaultMessage: "{count} no route" },
              { count: formatInteger(item.invalid, intl.locale) },
            )}
          />
          <Chip size="small" variant="outlined" label={formatPercent(item.validRate, intl.locale)} />
        </Box>
      ))}
    </Box>
  );
}

function ChartFrame({
  height,
  minWidth,
  children,
}: {
  height: number;
  minWidth?: number;
  children: ReactNode;
}) {
  return (
    <Box sx={{ mt: 1, minWidth: 0, overflowX: minWidth ? "auto" : "visible", overflowY: "hidden", pb: minWidth ? 1 : 0 }}>
      <Box sx={{ height, minWidth: minWidth ? { xs: minWidth, lg: 0 } : 0, width: "100%", position: "relative" }}>
        {children}
      </Box>
    </Box>
  );
}

export default function BiTable() {
  const intl = useIntl();
  const [page, setPage] = useState(1);
  const [reportDateInput, setReportDateInput] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [jsonDialog, setJsonDialog] = useState<JsonDialogState>(null);

  const { isLoading, data } = useDailyBiReports(page, 1, reportDate || undefined);

  const total = data?.total ?? 0;
  const totalPages = Math.max(total, 1);
  const reportItem = data?.list?.[0];

  const report = useMemo(() => {
    if (!reportItem || !isRecord(reportItem.report)) {
      return null;
    }
    return reportItem.report;
  }, [reportItem]);

  const slotMetrics = useMemo(() => {
    if (!report) {
      return [];
    }
    return extractSlotMetrics(report);
  }, [report]);

  const dimensionMetrics = useMemo(() => {
    if (!report) {
      return [];
    }
    return extractDimensionMetrics(report);
  }, [report]);

  const titleDateText = useMemo(() => {
    if (!reportItem?.reportDate) {
      return reportDate || "-";
    }

    return intl.formatDate(new Date(`${reportItem.reportDate}T00:00:00Z`), {
      year: "numeric",
      month: "short",
      day: "2-digit",
      timeZone: "UTC",
    });
  }, [intl, reportDate, reportItem?.reportDate]);

  const slotChartData = useMemo(() => {
    return {
      labels: slotMetrics.map((item) => formatSlotLabel(item.slot, intl)),
      datasets: [
        {
          data: slotMetrics.map((item) => item.value),
          backgroundColor: "#3b82f6",
          borderRadius: 6,
          barThickness: 16,
        },
      ],
    };
  }, [intl, slotMetrics]);

  const dimensionLegend = useMemo(
    () => [
      {
        category: "deviceTag" as const,
        label: formatDimensionCategory("deviceTag", intl),
        color: DIMENSION_COLORS.deviceTag,
      },
      {
        category: "errorType" as const,
        label: formatDimensionCategory("errorType", intl),
        color: DIMENSION_COLORS.errorType,
      },
      {
        category: "appVersion" as const,
        label: formatDimensionCategory("appVersion", intl),
        color: DIMENSION_COLORS.appVersion,
      },
    ],
    [intl],
  );

  const dimensionChartData = useMemo(() => {
    return {
      labels: dimensionMetrics.map((item) => {
        const prefix = formatDimensionCategory(item.category, intl);
        return `${prefix} · ${ellipsis(item.label, 28)}`;
      }),
      datasets: [
        {
          data: dimensionMetrics.map((item) => item.value),
          backgroundColor: dimensionMetrics.map((item) => DIMENSION_COLORS[item.category]),
          borderRadius: 6,
          categoryPercentage: 0.72,
          barPercentage: 0.82,
        },
      ],
    };
  }, [dimensionMetrics, intl]);

  const slotChartHeight = Math.max(280, slotMetrics.length * 34 + 64);
  const dimensionChartHeight = Math.max(320, dimensionMetrics.length * 38 + 72);

  const slotChartOptions = useMemo(
    () => chartCommonOptions(Math.max(...slotMetrics.map((item) => item.value), 1)),
    [slotMetrics],
  );

  const dimensionChartOptions = useMemo<ChartOptions<"bar">>(() => {
    const options = chartCommonOptions(Math.max(...dimensionMetrics.map((item) => item.value), 1));

    options.plugins = {
      ...options.plugins,
      tooltip: {
        callbacks: {
          title: (items) => {
            const item = items[0];
            if (!item) {
              return "";
            }
            const metric = dimensionMetrics[item.dataIndex];
            if (!metric) {
              return item.label;
            }
            return `${formatDimensionCategory(metric.category, intl)} · ${metric.label}`;
          },
          label: (ctx) => `${ctx.parsed.x}`,
        },
      },
    };

    return options;
  }, [dimensionMetrics, intl]);

  const kpiMetrics = useMemo<KpiMetric[]>(() => {
    if (!report) {
      return [];
    }

    const biEventsTotal = getNumericAtPath(report, ["summary", "biEvents", "total"]);
    const paidOrders = getNumericAtPath(report, ["summary", "commerce", "paidOrders"]);
    const revenue = getNumericAtPath(report, ["summary", "commerce", "grossOrderRevenue"]);
    const newUsers = getNumericAtPath(report, ["summary", "acquisition", "newUsers"]);
    const referredSignups = getNumericAtPath(report, ["summary", "acquisition", "referredSignups"]);
    const plannerValidRate = getNumericAtPath(report, ["summary", "marketCcuPlanner", "routeResults", "validRate"]);
    const plannerCartRate = getNumericAtPath(report, ["summary", "marketCcuPlanner", "conversions", "addToCartRateFromValidRouteSessions"]);

    return [
      {
        label: intl.formatMessage({ id: "admin.bi.kpi.events", defaultMessage: "BI events" }),
        value: formatInteger(biEventsTotal, intl.locale),
      },
      {
        label: intl.formatMessage({ id: "admin.bi.kpi.revenue", defaultMessage: "Paid order revenue" }),
        value: formatUsd(revenue, intl.locale),
        helper: intl.formatMessage(
          { id: "admin.bi.kpi.paidOrders", defaultMessage: "{count} paid orders" },
          { count: formatInteger(paidOrders, intl.locale) },
        ),
      },
      {
        label: intl.formatMessage({ id: "admin.bi.kpi.newUsers", defaultMessage: "New users" }),
        value: formatInteger(newUsers, intl.locale),
        helper: intl.formatMessage(
          { id: "admin.bi.kpi.referredUsers", defaultMessage: "{count} referred signups" },
          { count: formatInteger(referredSignups, intl.locale) },
        ),
      },
      {
        label: intl.formatMessage({ id: "admin.bi.kpi.plannerValidRate", defaultMessage: "CCU route valid rate" }),
        value: formatPercent(plannerValidRate, intl.locale),
        helper: intl.formatMessage(
          { id: "admin.bi.kpi.plannerCartRate", defaultMessage: "{rate} add-to-cart from valid routes" },
          { rate: formatPercent(plannerCartRate, intl.locale) },
        ),
      },
    ];
  }, [intl, report]);

  const commerceKpis = useMemo<KpiMetric[]>(() => {
    if (!report) {
      return [];
    }

    return [
      {
        label: intl.formatMessage({ id: "admin.bi.commerce.ordersCreated", defaultMessage: "Orders created" }),
        value: formatInteger(getNumericAtPath(report, ["summary", "commerce", "ordersCreated"]), intl.locale),
      },
      {
        label: intl.formatMessage({ id: "admin.bi.commerce.averageOrderValue", defaultMessage: "Avg paid order" }),
        value: formatUsd(getNumericAtPath(report, ["summary", "commerce", "averagePaidOrderValue"]), intl.locale),
      },
      {
        label: intl.formatMessage({ id: "admin.bi.commerce.discounts", defaultMessage: "Discounts" }),
        value: formatUsd(getNumericAtPath(report, ["summary", "commerce", "discountTotal"]), intl.locale),
      },
      {
        label: intl.formatMessage({ id: "admin.bi.commerce.couponApplyRate", defaultMessage: "Coupon apply rate" }),
        value: formatPercent(getNumericAtPath(report, ["summary", "coupons", "appliedRate"]), intl.locale),
      },
      {
        label: intl.formatMessage({ id: "admin.bi.commerce.referralSignupRate", defaultMessage: "Referral signup rate" }),
        value: formatPercent(getNumericAtPath(report, ["summary", "acquisition", "referralSignupRate"]), intl.locale),
      },
      {
        label: intl.formatMessage({ id: "admin.bi.commerce.referralRewards", defaultMessage: "Referral rewards earned" }),
        value: formatUsd(getNumericAtPath(report, ["summary", "acquisition", "referralRewardAmount"]), intl.locale),
      },
    ];
  }, [intl, report]);

  const plannerRouteNumbers = useMemo(() => {
    if (!report) {
      return {
        total: 0,
        valid: 0,
        invalid: 0,
        addToCartSessions: 0,
        checkoutSessions: 0,
      };
    }

    return {
      total: getNumericAtPath(report, ["summary", "marketCcuPlanner", "routeResults", "total"]),
      valid: getNumericAtPath(report, ["summary", "marketCcuPlanner", "routeResults", "valid"]),
      invalid: getNumericAtPath(report, ["summary", "marketCcuPlanner", "routeResults", "invalid"]),
      addToCartSessions: getNumericAtPath(report, ["summary", "marketCcuPlanner", "conversions", "addToCartSessions"]),
      checkoutSessions: getNumericAtPath(report, ["summary", "marketCcuPlanner", "conversions", "checkoutSessions"]),
    };
  }, [report]);

  const plannerDoughnutData = useMemo(() => ({
    labels: [
      intl.formatMessage({ id: "admin.bi.planner.validRoutes", defaultMessage: "Valid routes" }),
      intl.formatMessage({ id: "admin.bi.planner.noRoutes", defaultMessage: "No route" }),
      intl.formatMessage({ id: "admin.bi.planner.addToCartSessions", defaultMessage: "Add-to-cart sessions" }),
      intl.formatMessage({ id: "admin.bi.planner.checkoutSessions", defaultMessage: "Checkout sessions" }),
    ],
    datasets: [
      {
        data: [
          plannerRouteNumbers.valid,
          plannerRouteNumbers.invalid,
          plannerRouteNumbers.addToCartSessions,
          plannerRouteNumbers.checkoutSessions,
        ],
        backgroundColor: ["#10b981", "#f59e0b", "#3b82f6", "#6366f1"],
        borderWidth: 0,
      },
    ],
  }), [intl, plannerRouteNumbers]);

  const plannerDoughnutOptions = useMemo<ChartOptions<"doughnut">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.label}: ${ctx.parsed}`,
        },
      },
    },
  }), []);

  const plannerHourlyMetrics = useMemo<PlannerHourlyMetric[]>(() => {
    if (!report) {
      return [];
    }

    return getArrayAtPath<Record<string, unknown>>(report, ["summary", "marketCcuPlanner", "routeResults", "byHour"])
      .map((item) => ({
        hour: typeof item.hour === "string" ? item.hour : "",
        total: findNumericValue(item.total) ?? 0,
        valid: findNumericValue(item.valid) ?? 0,
        invalid: findNumericValue(item.invalid) ?? 0,
      }))
      .filter((item) => item.hour);
  }, [report]);

  const plannerHourlyData = useMemo(() => ({
    labels: plannerHourlyMetrics.map((item) => item.hour),
    datasets: [
      {
        label: intl.formatMessage({ id: "admin.bi.planner.validRoutes", defaultMessage: "Valid routes" }),
        data: plannerHourlyMetrics.map((item) => item.valid),
        borderColor: "#10b981",
        backgroundColor: "rgba(16, 185, 129, 0.15)",
        tension: 0.25,
      },
      {
        label: intl.formatMessage({ id: "admin.bi.planner.noRoutes", defaultMessage: "No route" }),
        data: plannerHourlyMetrics.map((item) => item.invalid),
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245, 158, 11, 0.15)",
        tension: 0.25,
      },
    ],
  }), [intl, plannerHourlyMetrics]);

  const plannerHourlyOptions = useMemo<ChartOptions<"line">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
        },
        grid: {
          color: "rgba(148, 163, 184, 0.15)",
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
    plugins: {
      legend: {
        position: "bottom",
      },
    },
  }), []);

  const plannerTargetRouteMetrics = useMemo<PlannerTargetRouteMetric[]>(() => {
    if (!report) {
      return [];
    }

    return parsePlannerTargetRouteMetrics(
      getAtPath(report, ["summary", "marketCcuPlanner", "routeResults", "byTargetShip"]),
    );
  }, [report]);

  const plannerNoRouteTargetShips = useMemo<LabeledMetric[]>(() => {
    if (!report) {
      return [];
    }

    return parseNamedCountContainer(
      getAtPath(report, ["summary", "marketCcuPlanner", "routeResults", "noRouteTargetShips"]),
      ["value", "ship", "name"],
    );
  }, [report]);

  const couponSourceMetrics = useMemo<LabeledMetric[]>(() => {
    if (!report) {
      return [];
    }

    return parseNamedCountContainer(
      getAtPath(report, ["summary", "coupons", "bySource"]),
      ["value", "source", "name"],
    );
  }, [report]);

  const applyDateFilter = () => {
    setPage(1);
    setReportDate(reportDateInput.trim());
  };

  const clearDateFilter = () => {
    setPage(1);
    setReportDateInput("");
    setReportDate("");
  };

  const goPrevDay = () => {
    setPage((prev) => Math.max(prev - 1, 1));
  };

  const goNextDay = () => {
    setPage((prev) => Math.min(prev + 1, totalPages));
  };

  if (isLoading && !data) {
    return (
      <Typography align="center">
        <FormattedMessage id="loading" defaultMessage="Loading..." />
      </Typography>
    );
  }

  if (!reportItem || !report) {
    return (
      <Box sx={{ textAlign: "center", py: 4 }}>
        <Typography variant="h6">
          <FormattedMessage id="admin.noBiReports" defaultMessage="No BI reports found" />
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", gap: 2, minHeight: 0 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <TextField
            size="small"
            type="date"
            label={intl.formatMessage({ id: "admin.bi.filterDate", defaultMessage: "Report Date (UTC)" })}
            value={reportDateInput}
            onChange={(event) => setReportDateInput(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="contained" onClick={applyDateFilter}>
            <FormattedMessage id="admin.bi.filter" defaultMessage="Filter" />
          </Button>
          <Button variant="text" onClick={clearDateFilter} disabled={!reportDate && !reportDateInput}>
            <FormattedMessage id="admin.bi.clear" defaultMessage="Clear" />
          </Button>
        </Box>

        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Button size="small" variant="outlined" onClick={goPrevDay} disabled={page <= 1}>
            <FormattedMessage id="admin.bi.prevDay" defaultMessage="Previous Day" />
          </Button>
          <Typography variant="body2" color="text.secondary">
            <FormattedMessage id="admin.bi.dayPage" defaultMessage="Day {page} / {total}" values={{ page, total: totalPages }} />
          </Typography>
          <Button size="small" variant="outlined" onClick={goNextDay} disabled={page >= totalPages}>
            <FormattedMessage id="admin.bi.nextDay" defaultMessage="Next Day" />
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1 }}>
        <Box>
          <Typography variant="h6">
            <FormattedMessage id="admin.bi.dailyTitle" defaultMessage="Daily BI Report" />
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <FormattedMessage id="admin.bi.dailyDate" defaultMessage="Date: {date}" values={{ date: titleDateText }} />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 1000 }}>
            {formatReportSummary(report, intl)}
          </Typography>
        </Box>

        <Button
          size="small"
          onClick={() => {
            setJsonDialog({
              title: intl.formatMessage(
                { id: "admin.bi.dialog.reportJson", defaultMessage: "Report JSON #{id}" },
                { id: reportItem.id },
              ),
              content: safeStringify(report),
            });
          }}
        >
          <FormattedMessage id="admin.bi.action.report" defaultMessage="Report" />
        </Button>
      </Box>

      <Box sx={{ display: "grid", gap: 2, minWidth: 0 }}>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" }, minWidth: 0 }}>
          {kpiMetrics.map((metric) => (
            <KpiCard key={metric.label} metric={metric} />
          ))}
        </Box>

        <SectionPanel
          title={<FormattedMessage id="admin.bi.section.commerce" defaultMessage="Commerce and acquisition" />}
          description={<FormattedMessage id="admin.bi.section.commerceDescription" defaultMessage="Orders, coupon usage, signups, and referral growth for the report day." />}
        >
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "2fr minmax(220px, 1fr)" }, minWidth: 0 }}>
            <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" }, minWidth: 0 }}>
              {commerceKpis.map((metric) => (
                <KpiCard key={metric.label} metric={metric} />
              ))}
            </Box>
            <Box sx={{ borderLeft: { lg: 1 }, borderColor: "divider", pl: { lg: 2 }, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                <FormattedMessage id="admin.bi.coupons.bySource" defaultMessage="Coupons by source" />
              </Typography>
              <TopList
                items={couponSourceMetrics}
                emptyLabel={<FormattedMessage id="admin.bi.coupons.noSourceData" defaultMessage="No coupon source data" />}
              />
            </Box>
          </Box>
        </SectionPanel>

        <SectionPanel
          title={<FormattedMessage id="admin.bi.section.marketPlanner" defaultMessage="Market CCU planner funnel" />}
          description={<FormattedMessage id="admin.bi.section.marketPlannerDescription" defaultMessage="Target ship choices, route validity, and add-to-cart or checkout conversions." />}
        >
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", lg: "minmax(260px, 0.8fr) minmax(0, 1.2fr)" },
              minWidth: 0,
              "@media (min-width: 1800px)": {
                gridTemplateColumns: "320px minmax(0, 1fr) 320px",
              },
            }}
          >
            <Box sx={{ height: 300, minWidth: 0 }}>
              {plannerRouteNumbers.total > 0 || plannerRouteNumbers.addToCartSessions > 0 ? (
                <Doughnut data={plannerDoughnutData} options={plannerDoughnutOptions} />
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  <FormattedMessage id="admin.bi.planner.noFunnelData" defaultMessage="No Market CCU planner funnel data for this day" />
                </Typography>
              )}
            </Box>

            <Box sx={{ height: 300, minWidth: 0 }}>
              {plannerHourlyMetrics.length > 0 && plannerRouteNumbers.total > 0 ? (
                <Line data={plannerHourlyData} options={plannerHourlyOptions} />
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  <FormattedMessage id="admin.bi.planner.noHourlyData" defaultMessage="No hourly route data" />
                </Typography>
              )}
            </Box>

            <Box
              sx={{
                display: "grid",
                gap: 2,
                minWidth: 0,
                gridColumn: { lg: "1 / -1" },
                "@media (min-width: 1800px)": {
                  gridColumn: "auto",
                },
              }}
            >
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  <FormattedMessage id="admin.bi.planner.targetShipRouteResults" defaultMessage="Target ship route results" />
                </Typography>
                <PlannerTargetRouteList
                  items={plannerTargetRouteMetrics}
                  emptyLabel={<FormattedMessage id="admin.bi.planner.noTargetRouteData" defaultMessage="No target ship route data" />}
                />
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  <FormattedMessage id="admin.bi.planner.noRouteTargetShips" defaultMessage="No-route target ships" />
                </Typography>
                <TopList
                  items={plannerNoRouteTargetShips}
                  emptyLabel={<FormattedMessage id="admin.bi.planner.noTargetShipData" defaultMessage="No target ship data" />}
                />
              </Box>
            </Box>
          </Box>
        </SectionPanel>

        <SectionPanel
          title={<FormattedMessage id="admin.bi.section.eventQuality" defaultMessage="Event quality and errors" />}
          description={<FormattedMessage id="admin.bi.section.eventQualityDescription" defaultMessage="Raw BI slot volume, device tags, app versions, and caught error dimensions." />}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 3,
              alignItems: "start",
              minWidth: 0,
              "@media (min-width: 1800px)": {
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              },
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                <FormattedMessage id="admin.bi.chart.slot" defaultMessage="Slot Data" />
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <FormattedMessage id="admin.bi.chart.slotDescription" defaultMessage="Daily usage per BI slot" />
              </Typography>
              {slotMetrics.length > 0 ? (
                <ChartFrame height={slotChartHeight} minWidth={420}>
                  <Bar data={slotChartData} options={slotChartOptions} />
                </ChartFrame>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  <FormattedMessage id="admin.bi.chart.noSlotData" defaultMessage="No slot data for this day" />
                </Typography>
              )}
            </Box>

            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                <FormattedMessage id="admin.bi.chart.combined" defaultMessage="Device / Error / Version" />
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <FormattedMessage
                  id="admin.bi.chart.combinedDescription"
                  defaultMessage="Merged chart: topDeviceTags + byErrorType + byAppVersion"
                />
              </Typography>

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
                {dimensionLegend.map((legend) => (
                  <Chip key={legend.category} size="small" label={legend.label} sx={{ bgcolor: legend.color, color: "#fff" }} />
                ))}
              </Box>

              {dimensionMetrics.length > 0 ? (
                <ChartFrame height={dimensionChartHeight} minWidth={560}>
                  <Bar data={dimensionChartData} options={dimensionChartOptions} />
                </ChartFrame>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  <FormattedMessage id="admin.bi.chart.noDimensionData" defaultMessage="No topDeviceTags/byErrorType/byAppVersion data" />
                </Typography>
              )}
            </Box>
          </Box>
        </SectionPanel>
      </Box>

      <Dialog open={!!jsonDialog} onClose={() => setJsonDialog(null)} maxWidth="lg" fullWidth>
        <DialogTitle>{jsonDialog?.title}</DialogTitle>
        <DialogContent>
          <Box
            component="pre"
            sx={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              bgcolor: "#f5f5f5",
              p: 2,
              borderRadius: 1,
              fontFamily: "monospace",
              fontSize: 13,
              maxHeight: "70vh",
              overflow: "auto",
            }}
          >
            {jsonDialog?.content || ""}
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
