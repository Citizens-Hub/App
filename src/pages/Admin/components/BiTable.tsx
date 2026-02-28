import { useMemo, useState } from "react";
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
  Title,
  Tooltip,
  Legend,
  type ChartOptions,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { useDailyBiReports } from "@/hooks/swr/admin/useDailyBiReports";
import { BiSlots } from "@/report";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

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
          barThickness: 16,
        },
      ],
    };
  }, [dimensionMetrics, intl]);

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

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" },
          gap: 2,
        }}
      >
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            <FormattedMessage id="admin.bi.chart.slot" defaultMessage="Slot Data" />
          </Typography>
          <Typography variant="caption" color="text.secondary">
            <FormattedMessage id="admin.bi.chart.slotDescription" defaultMessage="Daily usage per BI slot" />
          </Typography>

          <Box sx={{ flex: 1, minHeight: 280, mt: 1 }}>
            {slotMetrics.length > 0 ? (
              <Bar data={slotChartData} options={slotChartOptions} />
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                <FormattedMessage id="admin.bi.chart.noSlotData" defaultMessage="No slot data for this day" />
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
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

          <Box sx={{ flex: 1, minHeight: 280, mt: 1 }}>
            {dimensionMetrics.length > 0 ? (
              <Bar data={dimensionChartData} options={dimensionChartOptions} />
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                <FormattedMessage id="admin.bi.chart.noDimensionData" defaultMessage="No topDeviceTags/byErrorType/byAppVersion data" />
              </Typography>
            )}
          </Box>
        </Box>
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
