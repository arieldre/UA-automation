"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useFilters } from "@/hooks/useFilters";
import { useMetricSelection } from "@/hooks/useMetricSelection";
import type { ChartMetric } from "@/hooks/useMetricSelection";
import type { Granularity, DayData } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent } from "@/components/ui/Formatters";
import SegmentedToggle from "@/components/ui/SegmentedToggle";

// ── Resolve CSS variable to a color string ──
function getCSSVar(name: string): string {
  if (typeof window === "undefined") return "#888";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

// ── Metric config ──
interface MetricConfig {
  key: ChartMetric;
  label: string;
  cssVar: string;
  yAxisId: "left" | "right";
  formatter: (v: number) => string;
}

const METRICS: MetricConfig[] = [
  { key: "spend",    label: "Spend",    cssVar: "--pill-spend",    yAxisId: "left",  formatter: formatCurrency },
  { key: "installs", label: "Installs", cssVar: "--pill-installs", yAxisId: "left",  formatter: formatNumber },
  { key: "revenue",  label: "Revenue",  cssVar: "--pill-revenue",  yAxisId: "left",  formatter: formatCurrency },
  { key: "ecpi",     label: "eCPI",     cssVar: "--pill-ecpi",     yAxisId: "left",  formatter: formatCurrency },
  { key: "ipm",      label: "IPM",      cssVar: "--pill-ipm",      yAxisId: "left",  formatter: formatNumber },
  { key: "cvr",      label: "CVR",      cssVar: "--pill-cvr",      yAxisId: "right", formatter: formatPercent },
  { key: "ctr",      label: "CTR",      cssVar: "--pill-ctr",      yAxisId: "right", formatter: formatPercent },
  { key: "arpuD0",   label: "D0 ARPU",  cssVar: "--pill-arpu-d0",  yAxisId: "left",  formatter: formatCurrency },
  { key: "arpuD7",   label: "D7 ARPU",  cssVar: "--pill-arpu-d7",  yAxisId: "left",  formatter: formatCurrency },
  { key: "arpuD30",  label: "D30 ARPU", cssVar: "--pill-arpu-d30", yAxisId: "left",  formatter: formatCurrency },
  { key: "roasD0",   label: "ROAS D0",  cssVar: "--pill-roas-d0",  yAxisId: "right", formatter: formatPercent },
  { key: "roasD7",   label: "ROAS D7",  cssVar: "--pill-roas-d7",  yAxisId: "right", formatter: formatPercent },
  { key: "roasD30",  label: "ROAS D30", cssVar: "--pill-roas-d30", yAxisId: "right", formatter: formatPercent },
];

// ── Extract metric value from a day slice ──
function extractMetric(day: DayData, metric: ChartMetric, os: string[]): number {
  const slice =
    os.length === 1 && os[0] === "android"
      ? day.android
      : os.length === 1 && os[0] === "ios"
        ? day.ios
        : day.all;

  const af = slice.af;
  switch (metric) {
    case "spend":    return af.cost;
    case "installs": return af.installs;
    case "revenue":  return af.revenue;
    case "ecpi":     return af.installs > 0 ? af.cost / af.installs : 0;
    case "ipm":      return af.impressions > 0 ? (af.installs / af.impressions) * 1000 : 0;
    case "cvr":      return af.clicks > 0 ? (af.installs / af.clicks) * 100 : 0;
    case "ctr":      return af.impressions > 0 ? (af.clicks / af.impressions) * 100 : 0;
    case "arpuD0":   return af.installs > 0 ? af.revenue / af.installs : 0;
    case "arpuD7":   return af.installs > 0 ? af.revenue / af.installs : 0;
    case "arpuD30":  return af.installs > 0 ? af.revenue / af.installs : 0;
    case "roasD0":   return af.cost > 0 ? (af.revenue / af.cost) * 100 : 0;
    case "roasD7":   return af.cost > 0 ? (af.revenue / af.cost) * 100 : 0;
    case "roasD30":  return af.cost > 0 ? (af.revenue / af.cost) * 100 : 0;
    default:         return 0;
  }
}

// ── Granularity helpers ──
function weekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

const RATE_METRICS: ChartMetric[] = [
  "ecpi", "arpuD0", "arpuD7", "arpuD30",
  "roasD0", "roasD7", "roasD30", "ipm", "cvr", "ctr",
];

function groupDays(
  days: DayData[],
  granularity: Granularity,
  activeMetrics: ChartMetric[],
  os: string[]
): Record<string, number | string>[] {
  if (granularity === "daily") {
    return days.map((day) => {
      const row: Record<string, number | string> = { date: day.date };
      for (const m of activeMetrics) row[m] = extractMetric(day, m, os);
      return row;
    });
  }

  const keyFn = granularity === "weekly" ? weekKey : monthKey;
  const groups = new Map<string, DayData[]>();
  for (const day of days) {
    const k = keyFn(day.date);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(day);
  }

  return Array.from(groups.entries()).map(([key, groupDays]) => {
    const row: Record<string, number | string> = { date: key };
    for (const m of activeMetrics) {
      const values = groupDays.map((d) => extractMetric(d, m, os));
      const isRate = RATE_METRICS.includes(m);
      row[m] = isRate
        ? values.reduce((a, b) => a + b, 0) / values.length
        : values.reduce((a, b) => a + b, 0);
    }
    return row;
  });
}

// ── Custom tooltip ──
interface TooltipPayloadEntry {
  dataKey: string;
  value: number;
  color: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="rounded-lg p-3 text-xs"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <p className="font-medium mb-1.5" style={{ color: "var(--text)" }}>
        {label}
      </p>
      {payload.map((entry) => {
        const config = METRICS.find((m) => m.key === entry.dataKey);
        return (
          <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: entry.color }}
            />
            <span style={{ color: "var(--muted)" }}>{config?.label ?? entry.dataKey}:</span>
            <span style={{ color: "var(--text)", fontWeight: 500 }}>
              {config ? config.formatter(entry.value) : entry.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ──
export default function TrendChart() {
  const { data } = useDashboardData();
  const { filters } = useFilters();
  const { primary, secondary } = useMetricSelection();
  const [granularity, setGranularity] = useState<Granularity>("daily");

  // Derive active metrics from shared selection state
  const activeMetrics = useMemo(
    () => [primary, ...(secondary ? [secondary] : [])] as ChartMetric[],
    [primary, secondary]
  );

  // Resolve CSS vars to actual color strings once per render
  const metricColors = useMemo(() => {
    const result: Partial<Record<ChartMetric, string>> = {};
    for (const m of METRICS) {
      result[m.key] = getCSSVar(m.cssVar);
    }
    return result;
  }, []);

  const chartData = useMemo(() => {
    if (!data?.days?.length) return [];
    return groupDays(data.days, granularity, activeMetrics, filters.os);
  }, [data, granularity, activeMetrics, filters.os]);

  const hasRightAxis = activeMetrics.some(
    (m) => METRICS.find((c) => c.key === m)?.yAxisId === "right"
  );

  return (
    <div
      className="mb-4"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 20,
      }}
    >
      {/* Header: granularity only — metric selection is in KPIStrip */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
          {activeMetrics.map((m) => METRICS.find((c) => c.key === m)?.label).filter(Boolean).join(" · ")}
        </p>
        <SegmentedToggle
          options={[
            { value: "daily",   label: "Day" },
            { value: "weekly",  label: "Wk" },
            { value: "monthly", label: "Mo" },
          ]}
          value={granularity}
          onChange={(v) => setGranularity(v as Granularity)}
          size="sm"
        />
      </div>

      {/* Chart */}
      {chartData.length === 0 ? (
        <div
          className="flex items-center justify-center h-64 rounded-lg"
          style={{ background: "var(--surface2)" }}
        >
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No data to display. Select a date range and refresh.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            {hasRightAxis && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={50}
                tickFormatter={(v: number) => v.toFixed(0) + "%"}
              />
            )}
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, color: "var(--muted)" }}
            />
            {activeMetrics.map((m) => {
              const config = METRICS.find((c) => c.key === m);
              if (!config) return null;
              const color = metricColors[m] ?? "#888";
              return (
                <Line
                  key={m}
                  type="monotone"
                  dataKey={m}
                  yAxisId={config.yAxisId}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: color }}
                  name={config.label}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
