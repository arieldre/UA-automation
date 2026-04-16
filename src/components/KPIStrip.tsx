"use client";

import { useDashboardData } from "@/hooks/useDashboardData";
import { useFilters } from "@/hooks/useFilters";
import { useMetricSelection } from "@/hooks/useMetricSelection";
import type { ChartMetric } from "@/hooks/useMetricSelection";
import MetricPill from "@/components/ui/MetricPill";
import { formatCurrency, formatCompact, formatROAS } from "@/components/ui/Formatters";
import type { ReportResponse, AFMetrics } from "@/lib/types";

// ── Pill config ──
interface PillConfig {
  metric: ChartMetric;
  label: string;
  cssVar: string;
}

const PILLS: PillConfig[] = [
  { metric: "spend",   label: "Spend",    cssVar: "var(--pill-spend)" },
  { metric: "installs",label: "Installs", cssVar: "var(--pill-installs)" },
  { metric: "revenue", label: "Revenue",  cssVar: "var(--pill-revenue)" },
  { metric: "ecpi",    label: "eCPI",     cssVar: "var(--pill-ecpi)" },
  { metric: "ipm",     label: "IPM",      cssVar: "var(--pill-ipm)" },
  { metric: "cvr",     label: "CVR",      cssVar: "var(--pill-cvr)" },
  { metric: "arpuD0",  label: "D0 ARPU",  cssVar: "var(--pill-arpu-d0)" },
  { metric: "arpuD7",  label: "D7 ARPU",  cssVar: "var(--pill-arpu-d7)" },
  { metric: "arpuD30", label: "D30 ARPU", cssVar: "var(--pill-arpu-d30)" },
  { metric: "roasD0",  label: "ROAS D0",  cssVar: "var(--pill-roas-d0)" },
  { metric: "roasD7",  label: "ROAS D7",  cssVar: "var(--pill-roas-d7)" },
  { metric: "roasD30", label: "ROAS D30", cssVar: "var(--pill-roas-d30)" },
];

// ── Headline summary from aggregate ──
interface Headlines {
  spend: string;
  installs: string;
  roasD7: { text: string; colorClass: string };
}

function computeHeadlines(data: ReportResponse | null, os: string[]): Headlines | null {
  if (!data) return null;

  let agg: { af: AFMetrics };
  if (os.length === 1 && os[0] === "android") {
    agg = data.aggregate.android;
  } else if (os.length === 1 && os[0] === "ios") {
    agg = data.aggregate.ios;
  } else {
    agg = data.aggregate.all;
  }

  const af = agg.af;
  const roasRaw = af.cost > 0 ? af.revenue / af.cost : 0;

  return {
    spend: "$" + formatCompact(af.cost),
    installs: formatCompact(af.installs),
    roasD7: formatROAS(roasRaw),
  };
}

export default function KPIStrip() {
  const { data, loading } = useDashboardData();
  const { filters } = useFilters();
  const { primary, secondary, toggle } = useMetricSelection();

  const headlines = computeHeadlines(data, filters.os);

  const handlePillClick = (metric: ChartMetric, e: React.MouseEvent) => {
    toggle(metric, e.shiftKey);
  };

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "10px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* Pill row */}
      <div
        style={{
          display: "flex",
          flexWrap: "nowrap",
          overflowX: "auto",
          gap: 6,
          scrollbarWidth: "none",
        }}
      >
        {loading
          ? PILLS.map((p) => (
              <span
                key={p.metric}
                className="animate-pulse"
                style={{
                  display: "inline-block",
                  width: 72,
                  height: 26,
                  borderRadius: "var(--radius-full)",
                  backgroundColor: "var(--surface2)",
                  flexShrink: 0,
                }}
              />
            ))
          : PILLS.map((p) => (
              // Outer div captures the MouseEvent for shift-key detection;
              // MetricPill.onClick is typed as () => void so we pass a noop there.
              <div
                key={p.metric}
                style={{ flexShrink: 0 }}
                onClick={(e) => handlePillClick(p.metric, e)}
              >
                <MetricPill
                  label={p.label}
                  dotColor={p.cssVar}
                  active={primary === p.metric || secondary === p.metric}
                  onClick={() => {}}
                />
              </div>
            ))}
      </div>

      {/* Summary strip */}
      <div
        style={{
          display: "flex",
          gap: 16,
          fontSize: 12,
          color: "var(--muted)",
          alignItems: "center",
        }}
      >
        {loading || !headlines ? (
          <>
            {[80, 72, 80].map((w, i) => (
              <span
                key={i}
                className="animate-pulse"
                style={{
                  display: "inline-block",
                  width: w,
                  height: 14,
                  borderRadius: 4,
                  backgroundColor: "var(--surface2)",
                }}
              />
            ))}
          </>
        ) : (
          <>
            <span>
              Spend:{" "}
              <span style={{ color: "var(--text)", fontWeight: 600 }}>{headlines.spend}</span>
            </span>
            <span style={{ color: "var(--border)" }}>·</span>
            <span>
              Installs:{" "}
              <span style={{ color: "var(--text)", fontWeight: 600 }}>{headlines.installs}</span>
            </span>
            <span style={{ color: "var(--border)" }}>·</span>
            <span>
              ROAS D7:{" "}
              <span className={headlines.roasD7.colorClass} style={{ fontWeight: 600 }}>
                {headlines.roasD7.text}
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
