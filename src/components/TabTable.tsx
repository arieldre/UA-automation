"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useDrillDown, type DrillLevel } from "@/hooks/useDrillDown";
import {
  buildOSRows,
  buildCampaignRows,
  buildDateRows,
  buildChartData,
  type TableRow,
  type DateTableRow,
  type ChartPoint,
} from "@/lib/tab-builder";
import Breadcrumb from "@/components/Breadcrumb";
import CollapsibleSection from "@/components/CollapsibleSection";
import ColumnSettings, {
  DEFAULT_VISIBLE_COLUMNS,
  ALL_COLUMNS,
} from "@/components/ColumnSettings";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatROAS,
} from "@/components/ui/Formatters";
import type { Granularity } from "@/lib/types";

// ── Tab definition ──

interface TabDef {
  level: DrillLevel;
  label: string;
}

const TABS: TabDef[] = [
  { level: "os", label: "OS" },
  { level: "campaign", label: "Campaign" },
  { level: "date", label: "Date" },
];

// ── Column formatter map ──

function formatCell(key: string, value: number): { text: string; colorClass?: string } {
  switch (key) {
    case "spend":
    case "revenue":
    case "ecpi":
    case "arpu":
      return { text: formatCurrency(value) };
    case "installs":
      return { text: formatNumber(value) };
    case "ipm":
    case "cpm":
      return { text: value.toFixed(2) };
    case "ctr":
    case "cvr":
      return { text: formatPercent(value) };
    case "roas":
      return formatROAS(value);
    default:
      return { text: String(value) };
  }
}

// ── Chart tooltip ──

interface TooltipPayloadEntry {
  dataKey: string;
  value: number;
  color: string;
  name: string;
}

function MiniChartTooltip({
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
      className="rounded-lg p-2 text-[11px] shadow-lg"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <p className="font-medium mb-1" style={{ color: "var(--text)" }}>
        {label}
      </p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-1.5 py-0.5">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span style={{ color: "var(--muted)" }}>{entry.name}:</span>
          <span style={{ color: "var(--text)" }}>
            {entry.dataKey === "spend"
              ? formatCurrency(entry.value)
              : formatNumber(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ──

export default function TabTable() {
  const { data, loading, error } = useDashboardData();
  const drill = useDrillDown();
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE_COLUMNS);

  // ── Compute rows ──

  const rows = useMemo((): (TableRow | DateTableRow)[] => {
    if (!data) return [];

    switch (drill.state.level) {
      case "os":
        return buildOSRows(data);
      case "campaign":
        return buildCampaignRows(data, drill.state.selectedOS ?? "all");
      case "date":
        return buildDateRows(
          data,
          drill.state.selectedOS ?? "all",
          drill.state.selectedCampaign ?? "",
          granularity
        );
      default:
        return [];
    }
  }, [data, drill.state, granularity]);

  // ── Compute chart data ──

  const chartData = useMemo((): ChartPoint[] => {
    if (!data) return [];

    return buildChartData(
      data,
      drill.state.selectedOS ?? "all",
      drill.state.level === "date" ? drill.state.selectedCampaign : undefined
    );
  }, [data, drill.state]);

  // ── Tab click handler ──

  const handleTabClick = (level: DrillLevel) => {
    if (level === "os") {
      drill.goToOS();
    } else if (level === "campaign" && drill.state.selectedOS) {
      drill.goBack("campaign");
    }
    // date tab click doesn't navigate unless already at date level
  };

  const isTabEnabled = (level: DrillLevel): boolean => {
    switch (level) {
      case "os":
        return true;
      case "campaign":
        return !!drill.state.selectedOS;
      case "date":
        return !!drill.state.selectedCampaign;
    }
  };

  // ── Row click handler ──

  const handleRowClick = (row: TableRow) => {
    if (!row.clickable) return;

    if (drill.state.level === "os") {
      const osKey =
        row.name === "All Platforms"
          ? "all"
          : row.name === "Android"
            ? "android"
            : "ios";
      drill.selectOS(osKey);
    } else if (drill.state.level === "campaign") {
      drill.selectCampaign(row.name);
    }
  };

  // ── Visible column configs ──

  const visibleColumnConfigs = ALL_COLUMNS.filter((c) =>
    visibleColumns.includes(c.key)
  );

  // ── Loading / error states ──

  if (loading) {
    return (
      <div
        className="rounded-xl p-6"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Loading table data...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl p-6"
        style={{
          background: "var(--red-bg)",
          border: "1px solid var(--red)",
        }}
      >
        <p className="text-sm" style={{ color: "var(--red)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb + settings row */}
      <div className="flex items-center justify-between gap-4">
        <Breadcrumb segments={drill.breadcrumbs} onNavigate={drill.goBack} />
        <ColumnSettings
          visibleColumns={visibleColumns}
          onChange={setVisibleColumns}
        />
      </div>

      {/* Tabs bar */}
      <div className="flex items-center gap-1">
        {TABS.map((tab) => {
          const enabled = isTabEnabled(tab.level);
          const active = drill.state.level === tab.level;

          return (
            <button
              key={tab.level}
              type="button"
              onClick={() => enabled && handleTabClick(tab.level)}
              disabled={!enabled}
              className="px-4 py-2 text-xs font-medium rounded-lg transition-colors"
              style={{
                background: active ? "var(--accent)" : "var(--surface2)",
                color: active ? "#fff" : enabled ? "var(--text)" : "var(--muted)",
                opacity: enabled ? 1 : 0.4,
                cursor: enabled ? "pointer" : "default",
                border: "1px solid",
                borderColor: active ? "var(--accent)" : "var(--border)",
              }}
            >
              {tab.label}
            </button>
          );
        })}

        {/* Granularity toggle — date level only */}
        {drill.state.level === "date" && (
          <div
            className="flex rounded-lg overflow-hidden text-xs ml-auto"
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
        )}
      </div>

      {/* Inline chart */}
      {chartData.length > 0 && (
        <CollapsibleSection title="Trend" defaultOpen={true}>
          <div
            className="rounded-xl p-3"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart
                data={chartData}
                margin={{ top: 5, right: 10, bottom: 5, left: 10 }}
              >
                <XAxis
                  dataKey="date"
                  tick={{ fill: "var(--muted)", fontSize: 10 }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: "var(--muted)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "var(--muted)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  content={<MiniChartTooltip />}
                  cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
                />
                <Bar
                  yAxisId="right"
                  dataKey="installs"
                  fill="rgba(34, 197, 94, 0.3)"
                  stroke="var(--green)"
                  strokeWidth={1}
                  radius={[2, 2, 0, 0]}
                  name="Installs"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="spend"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3, fill: "var(--accent)" }}
                  name="Spend"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CollapsibleSection>
      )}

      {/* Data table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {visibleColumnConfigs.map((col) => (
                  <th
                    key={col.key}
                    className="py-2.5 px-3 font-medium"
                    style={{
                      color: "var(--muted)",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      textAlign: col.key === "name" ? "left" : "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColumnConfigs.length}
                    className="py-8 text-center text-sm"
                    style={{ color: "var(--muted)" }}
                  >
                    No data available
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr
                    key={row.name + idx}
                    onClick={() => handleRowClick(row)}
                    className="transition-colors"
                    style={{
                      borderBottom:
                        idx < rows.length - 1
                          ? "1px solid var(--border)"
                          : undefined,
                      cursor: row.clickable ? "pointer" : "default",
                    }}
                    onMouseEnter={(e) => {
                      if (row.clickable) {
                        e.currentTarget.style.background =
                          "rgba(124, 111, 255, 0.04)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {visibleColumnConfigs.map((col) => {
                      if (col.key === "name") {
                        return (
                          <td
                            key={col.key}
                            className="py-2.5 px-3"
                            style={{
                              fontSize: 13,
                              color: "var(--text)",
                              fontVariantNumeric: "tabular-nums",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <span className="flex items-center gap-2">
                              {row.name}
                              {row.clickable && (
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  style={{ color: "var(--muted)", opacity: 0.5 }}
                                >
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              )}
                            </span>
                          </td>
                        );
                      }

                      const value = row[col.key as keyof TableRow] as number;
                      const formatted = formatCell(col.key, value ?? 0);

                      return (
                        <td
                          key={col.key}
                          className={`py-2.5 px-3 ${formatted.colorClass ?? ""}`}
                          style={{
                            fontSize: 12,
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            color: formatted.colorClass
                              ? undefined
                              : "var(--text)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatted.text}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
