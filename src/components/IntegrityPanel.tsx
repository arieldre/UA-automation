"use client";

import { useState, useMemo } from "react";
import { useFilters } from "@/hooks/useFilters";

// ── Types ──

export interface IntegrityRow {
  campaign: string;
  os?: string;
  // Source A (GA or FB reported)
  aSpend: number;
  aInstalls: number;
  aRevenue?: number;
  // Source B (AF reported)
  bSpend: number;
  bInstalls: number;
  bRevenue?: number;
}

interface IntegrityPanelProps {
  title: string;
  sourceALabel: string;
  sourceBLabel: string;
  rows: IntegrityRow[];
  loading: boolean;
  threshold?: number;
}

// ── Delta helpers ──

function deltaPct(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1);
  return (a - b) / denom;
}

type ChipVariant = "red" | "green" | "gray";

function chipVariant(pct: number, threshold: number): ChipVariant {
  const abs = Math.abs(pct);
  if (abs >= threshold) return "red";
  if (abs >= 0.05) return "green";
  return "gray";
}

function DeltaChip({ pct, threshold }: { pct: number; threshold: number }) {
  const variant = chipVariant(pct, threshold);
  const label = `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`;

  const styles: Record<ChipVariant, React.CSSProperties> = {
    red: { background: "var(--red-bg)", color: "var(--red)" },
    green: { background: "var(--green-bg)", color: "var(--green)" },
    gray: { background: "var(--surface2)", color: "var(--muted)" },
  };

  return (
    <span
      style={{
        ...styles[variant],
        display: "inline-block",
        borderRadius: 9999,
        padding: "2px 8px",
        fontSize: 11,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ── Shimmer loading rows ──

function ShimmerRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2">
          <div
            className="animate-pulse rounded"
            style={{
              height: 14,
              background: "var(--surface2)",
              width: i === 0 ? "80%" : "60%",
            }}
          />
        </td>
      ))}
    </tr>
  );
}

// ── Currency/number formatters (inline to avoid import chain) ──

function fmt$(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtN(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n.toFixed(0)}`;
}

// ── OS segmented toggle ──

type OSFilter = "all" | "ios" | "android";

function SegmentedToggle({
  value,
  onChange,
}: {
  value: OSFilter;
  onChange: (v: OSFilter) => void;
}) {
  const options: { label: string; value: OSFilter }[] = [
    { label: "All", value: "all" },
    { label: "iOS", value: "ios" },
    { label: "Android", value: "android" },
  ];

  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid var(--border)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: value === opt.value ? 600 : 400,
            background: value === opt.value ? "var(--accent)" : "transparent",
            color: value === opt.value ? "#fff" : "var(--muted)",
            border: "none",
            cursor: "pointer",
            transition: "background 120ms, color 120ms",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Main component ──

export default function IntegrityPanel({
  title,
  sourceALabel,
  sourceBLabel,
  rows,
  loading,
  threshold = 0.1,
}: IntegrityPanelProps) {
  const { filters } = useFilters();
  const { from, to } = filters.dateRange;

  const [osFilter, setOsFilter] = useState<OSFilter>("all");
  const [mismatchOnly, setMismatchOnly] = useState(false);

  const hasRevenue = rows.some((r) => r.aRevenue != null || r.bRevenue != null);
  const colCount = hasRevenue ? 9 : 7;

  const filtered = useMemo(() => {
    let result = rows;

    if (osFilter !== "all") {
      result = result.filter(
        (r) => r.os?.toLowerCase() === osFilter
      );
    }

    if (mismatchOnly) {
      result = result.filter((r) => {
        const sd = Math.abs(deltaPct(r.aSpend, r.bSpend));
        const id = Math.abs(deltaPct(r.aInstalls, r.bInstalls));
        return sd >= threshold || id >= threshold;
      });
    }

    // Sort by |spendDelta| desc
    return [...result].sort((a, b) => {
      const da = Math.abs(deltaPct(a.aSpend, a.bSpend));
      const db = Math.abs(deltaPct(b.aSpend, b.bSpend));
      return db - da;
    });
  }, [rows, osFilter, mismatchOnly, threshold]);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius, 12px)",
        overflow: "hidden",
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
          {title}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            {from} – {to}
          </span>

          <SegmentedToggle value={osFilter} onChange={setOsFilter} />

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              color: "var(--muted)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={mismatchOnly}
              onChange={(e) => setMismatchOnly(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Mismatches only
          </label>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            fontSize: 13,
            color: "var(--text)",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  padding: "8px 12px",
                  textAlign: "left",
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--muted)",
                  whiteSpace: "nowrap",
                }}
              >
                Campaign
              </th>

              {/* Spend columns */}
              {[
                `${sourceALabel} Spend`,
                `${sourceBLabel} Spend`,
                "Delta Spend",
                `${sourceALabel} Installs`,
                `${sourceBLabel} Installs`,
                "Delta Installs",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "8px 12px",
                    textAlign: "right",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}

              {hasRevenue && (
                <>
                  <th
                    style={{
                      padding: "8px 12px",
                      textAlign: "right",
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sourceALabel} Rev
                  </th>
                  <th
                    style={{
                      padding: "8px 12px",
                      textAlign: "right",
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sourceBLabel} Rev
                  </th>
                  <th
                    style={{
                      padding: "8px 12px",
                      textAlign: "right",
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Delta Rev
                  </th>
                </>
              )}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <ShimmerRow key={i} cols={colCount} />
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  style={{
                    padding: "32px 12px",
                    textAlign: "center",
                    color: "var(--muted)",
                    fontSize: 13,
                  }}
                >
                  No data for this date range
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => {
                const spendDelta = deltaPct(row.aSpend, row.bSpend);
                const installsDelta = deltaPct(row.aInstalls, row.bInstalls);
                const revDelta =
                  hasRevenue && row.aRevenue != null && row.bRevenue != null
                    ? deltaPct(row.aRevenue, row.bRevenue)
                    : null;

                return (
                  <tr
                    key={i}
                    style={{ borderTop: "1px solid var(--border)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background =
                        "rgba(255,255,255,0.02)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background =
                        "transparent";
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 12px",
                        whiteSpace: "nowrap",
                        maxWidth: 220,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={row.campaign}
                    >
                      {row.campaign}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {fmt$(row.aSpend)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {fmt$(row.bSpend)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      <DeltaChip pct={spendDelta} threshold={threshold} />
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {fmtN(row.aInstalls)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {fmtN(row.bInstalls)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      <DeltaChip pct={installsDelta} threshold={threshold} />
                    </td>
                    {hasRevenue && (
                      <>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {row.aRevenue != null ? fmt$(row.aRevenue) : "—"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {row.bRevenue != null ? fmt$(row.bRevenue) : "—"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          {revDelta != null ? (
                            <DeltaChip pct={revDelta} threshold={threshold} />
                          ) : (
                            <span style={{ color: "var(--muted)" }}>—</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
