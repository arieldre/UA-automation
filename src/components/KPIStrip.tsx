"use client";

import { useDashboardData } from "@/hooks/useDashboardData";
import { useFilters } from "@/hooks/useFilters";
import { formatCurrency, formatNumber, formatPercent, formatROAS } from "@/components/ui/Formatters";
import type { AFMetrics, ReportResponse } from "@/lib/types";

interface KPICard {
  label: string;
  icon: string;
  value: string;
  colorClass?: string;
}

function computeKPIs(data: ReportResponse | null, os: string[]): KPICard[] {
  if (!data) {
    return [
      { label: "Total Spend", icon: "\uD83D\uDCB0", value: "--" },
      { label: "Total Installs", icon: "\uD83D\uDCF2", value: "--" },
      { label: "Blended ROAS", icon: "\uD83D\uDCC8", value: "--" },
      { label: "Avg D7 ARPU", icon: "\uD83D\uDCB5", value: "--" },
      { label: "Avg IPM", icon: "\uD83C\uDFAF", value: "--" },
      { label: "eCPI", icon: "\uD83C\uDFF7\uFE0F", value: "--" },
    ];
  }

  // Determine which aggregate slice to use based on OS filter
  let agg: { af: AFMetrics };
  if (os.length === 1 && os[0] === "android") {
    agg = data.aggregate.android;
  } else if (os.length === 1 && os[0] === "ios") {
    agg = data.aggregate.ios;
  } else {
    agg = data.aggregate.all;
  }

  const af = agg.af;
  const totalSpend = af.cost;
  const totalInstalls = af.installs;
  const blendedROAS = totalSpend > 0 ? af.revenue / totalSpend : 0;
  const avgD7ARPU = totalInstalls > 0 ? af.revenue / totalInstalls : 0;
  // IPM: installs per mille (impressions)
  const avgIPM = af.impressions > 0 ? (af.installs / af.impressions) * 1000 : 0;
  const ecpi = totalInstalls > 0 ? totalSpend / totalInstalls : 0;

  const roas = formatROAS(blendedROAS);

  return [
    { label: "Total Spend", icon: "\uD83D\uDCB0", value: formatCurrency(totalSpend) },
    { label: "Total Installs", icon: "\uD83D\uDCF2", value: formatNumber(totalInstalls) },
    { label: "Blended ROAS", icon: "\uD83D\uDCC8", value: roas.text, colorClass: roas.colorClass },
    { label: "Avg D7 ARPU", icon: "\uD83D\uDCB5", value: formatCurrency(avgD7ARPU) },
    { label: "Avg IPM", icon: "\uD83C\uDFAF", value: formatPercent(avgIPM) },
    { label: "eCPI", icon: "\uD83C\uDFF7\uFE0F", value: formatCurrency(ecpi) },
  ];
}

export default function KPIStrip() {
  const { data, loading } = useDashboardData();
  const { filters } = useFilters();
  const kpis = computeKPIs(data, filters.os);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 px-4 py-3">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="rounded-xl p-3 flex flex-col gap-1"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{kpi.icon}</span>
            <span className="text-[11px] font-medium" style={{ color: "var(--muted)" }}>
              {kpi.label}
            </span>
          </div>
          <span
            className={`text-lg font-bold ${kpi.colorClass ?? ""}`}
            style={kpi.colorClass ? undefined : { color: "var(--text)" }}
          >
            {loading ? (
              <span
                className="inline-block w-16 h-5 rounded animate-pulse"
                style={{ background: "var(--surface2)" }}
              />
            ) : (
              kpi.value
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
