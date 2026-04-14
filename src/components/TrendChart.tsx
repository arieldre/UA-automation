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
import type { ChartMetric, Granularity, DayData } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent } from "@/components/ui/Formatters";

// ── Metric config ──
interface MetricConfig {
  key: ChartMetric;
  label: string;
  color: string;
  yAxisId: "left" | "right";
  formatter: (v: number) => string;
}

const METRICS: MetricConfig[] = [
  { key: "spend", label: "Spend", color: "#7c6fff", yAxisId: "left", formatter: formatCurrency },
  { key: "installs", label: "Installs", color: "#22c55e", yAxisId: "left", formatter: formatNumber },
  { key: "ecpi", label: "eCPI", color: "#f97316", yAxisId: "left", formatter: formatCurrency },
  { key: "arpuD0", label: "D0 ARPU", color: "#06b6d4", yAxisId: "left", formatter: formatCurrency },
  { key: "arpuD7", label: "D7 ARPU", color: "#8b5cf6", yAxisId: "left", formatter: formatCurrency },
  { key: "arpuD30", label: "D30 ARPU", color: "#ec4899", yAxisId: "left", formatter: formatCurrency },
  { key: "roasD7", label: "ROAS D7", color: "#eab308", yAxisId: "right", formatter: formatPercent },
  { key: "ipm", label: "IPM", color: "#14b8a6", yAxisId: "left", formatter: formatNumber },
];

// ── Extract metric from a day ──
function extractMetric(day: DayData, metric: ChartMetric, os: string[]): number {
  const slice =
    os.length === 1 && os[0] === "android"
      ? day.android
      : os.length === 1 && os[0] === "ios"
        ? day.ios
        : day.all;

  const af = slice.af;
  switch (metric) {
    case "spend": return af.cost;
    case "installs": return af.installs;
    case "ecpi": return af.installs > 0 ? af.cost / af.installs : 0;
    case "arpuD0": return af.installs > 0 ? af.revenue / af.installs : 0; // placeholder — D0 specific not in type
    case "arpuD7": return af.installs > 0 ? af.revenue / af.installs : 0;
    case "arpuD30": return af.installs > 0 ? af.revenue / af.installs : 0;
    case "roasD7": return af.cost > 0 ? (af.revenue / af.cost) * 100 : 0;
    case "ipm": return af.impressions > 0 ? (af.installs / af.impressions) * 1000 : 0;
    default: return 0;
  }
}

// ── Granularity grouping ──
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

function groupDays(
  days: DayData[],
  granularity: Granularity,
  activeMetrics: ChartMetric[],
  os: string[]
): Record<string, number | string>[] {
  if (granularity === "daily") {
    return days.map((day) => {
      const row: Record<string, number | string> = { date: day.date };
      for (const m of activeMetrics) {
        row[m] = extractMetric(day, m, os);
      }
      return row;
    });
  }

  // Group by week or month
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
      // Average for rate metrics, sum for absolute
      const values = groupDays.map((d) => extractMetric(d, m, os));
      const isRate = ["ecpi", "arpuD0", "arpuD7", "arpuD30", "roasD7", "ipm"].includes(m);
      if (isRate) {
        row[m] = values.reduce((a, b) => a + b, 0) / values.length;
      } else {
        row[m] = values.reduce((a, b) => a + b, 0);
      }
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
      className="rounded-lg p-3 text-xs shadow-lg"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <p className="font-medium mb-1.5" style={{ color: "var(--text)" }}>
        {label}
      </p>
      {payload.map((entry) => {
        const config = METRICS.find((m) => m.key === entry.dataKey);
        return (
          <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: entry.color }}
            />
            <span style={{ color: "var(--muted)" }}>{config?.label ?? entry.dataKey}:</span>
            <span style={{ color: "var(--text)" }}>
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
  const [activeMetrics, setActiveMetrics] = useState<ChartMetric[]>(["spend", "installs"]);
  const [granularity, setGranularity] = useState<Granularity>("daily");

  const toggleMetric = (m: ChartMetric) => {
    setActiveMetrics((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  };

  const chartData = useMemo(() => {
    if (!data?.days?.length) return [];
    return groupDays(data.days, granularity, activeMetrics, filters.os);
  }, [data, granularity, activeMetrics, filters.os]);

  const hasRightAxis = activeMetrics.some(
    (m) => METRICS.find((c) => c.key === m)?.yAxisId === "right"
  );

  return (
    <div
      className="rounded-xl p-4 mb-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* Header: metric toggles + granularity */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {/* Metric chips */}
        <div className="flex flex-wrap gap-1.5">
          {METRICS.map((m) => {
            const active = activeMetrics.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => toggleMetric(m.key)}
                className="rounded-full px-3 py-1 text-[11px] font-medium transition-all cursor-pointer"
                style={{
                  background: active ? m.color + "20" : "var(--surface2)",
                  color: active ? m.color : "var(--muted)",
                  border: `1px solid ${active ? m.color + "40" : "var(--border)"}`,
                }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5"
                  style={{ background: active ? m.color : "var(--muted)" }}
                />
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Granularity toggle */}
        <div
          className="flex rounded-lg overflow-hidden text-xs"
          style={{ border: "1px solid var(--border)" }}
        >
          {(["daily", "weekly", "monthly"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              className="px-3 py-1.5 text-xs transition-colors cursor-pointer capitalize"
              style={{
                background: granularity === g ? "var(--accent)" : "var(--surface2)",
                color: granularity === g ? "#fff" : "var(--text)",
              }}
            >
              {g}
            </button>
          ))}
        </div>
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
              const config = METRICS.find((c) => c.key === m)!;
              return (
                <Line
                  key={m}
                  type="monotone"
                  dataKey={m}
                  yAxisId={config.yAxisId}
                  stroke={config.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: config.color }}
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
