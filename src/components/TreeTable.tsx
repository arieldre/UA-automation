"use client";

import { useState, useCallback, useMemo } from "react";
import { useDashboardData } from "@/hooks/useDashboardData";
import { buildTree, type DashboardTreeNode, type TableTreeNode } from "@/lib/tree-builder";
import {
  formatCurrency,
  formatCompact,
  formatPercent,
  formatROAS,
} from "@/components/ui/Formatters";
import AppIcon from "@/components/ui/AppIcon";
import SourceIcon from "@/components/ui/SourceIcon";
import SegmentedToggle from "@/components/ui/SegmentedToggle";

// ── Chevron SVG ──

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      style={{
        flexShrink: 0,
        transition: "transform 150ms ease",
        transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
        color: "var(--muted)",
      }}
    >
      <path
        d="M3.5 2L6.5 5L3.5 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Icon for a row ──

function RowIcon({ node }: { node: DashboardTreeNode }) {
  if (node.level === "app") {
    return <AppIcon appName={node.name} size={24} />;
  }
  if (node.level === "os") {
    return <SourceIcon source={node.id} size={20} />;
  }
  if (node.level === "mediaSource") {
    const sourceKey = node.mediaSource ?? node.name;
    return <SourceIcon source={sourceKey} size={20} />;
  }
  return null;
}

// ── Visual constants ──

const INDENT_PX: Record<string, number> = {
  app: 0,
  os: 20,
  mediaSource: 40,
  campaign: 60,
};

const FONT_WEIGHT: Record<string, number> = {
  app: 700,
  os: 600,
  mediaSource: 500,
  campaign: 400,
};

// ── Column definitions ──

interface Column {
  key: string;
  label: string;
  render: (node: DashboardTreeNode) => React.ReactNode;
}

function fmtCurrencyCompact(n: number): string {
  if (n === 0) return "--";
  if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtArpu(n: number): string {
  if (!n || n === 0) return "--";
  return formatCurrency(n);
}

function ROASCell({ value }: { value: number }) {
  const { text, colorClass } = formatROAS(value);
  return <span className={colorClass}>{text}</span>;
}

const COLUMNS: Column[] = [
  {
    key: "spend",
    label: "Spend",
    render: (n) => <span>{fmtCurrencyCompact(n.metrics.spend)}</span>,
  },
  {
    key: "installs",
    label: "Installs",
    render: (n) => <span>{formatCompact(n.metrics.installs)}</span>,
  },
  {
    key: "revenue",
    label: "Revenue",
    render: (n) => <span>{fmtCurrencyCompact(n.metrics.revenue)}</span>,
  },
  {
    key: "ecpi",
    label: "eCPI",
    render: (n) => <span>{n.metrics.ecpi > 0 ? formatCurrency(n.metrics.ecpi) : "--"}</span>,
  },
  {
    key: "ipm",
    label: "IPM",
    render: (n) => (
      <span>
        {n.metrics.ipm > 0
          ? n.metrics.ipm.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : "--"}
      </span>
    ),
  },
  {
    key: "cvr",
    label: "CVR",
    render: (n) => <span>{n.metrics.cvr > 0 ? formatPercent(n.metrics.cvr) : "--"}</span>,
  },
  {
    key: "arpuD0",
    label: "D0 ARPU",
    render: (n) => <span>{fmtArpu(n.metrics.arpu)}</span>,
  },
  {
    key: "arpuD7",
    label: "D7 ARPU",
    render: () => <span>--</span>,
  },
  {
    key: "arpuD30",
    label: "D30 ARPU",
    render: () => <span>--</span>,
  },
  {
    key: "roasD0",
    label: "ROAS D0",
    render: (n) => <ROASCell value={n.metrics.roas} />,
  },
  {
    key: "roasD7",
    label: "ROAS D7",
    render: () => <span style={{ color: "var(--muted)" }}>--</span>,
  },
  {
    key: "roasD30",
    label: "ROAS D30",
    render: () => <span style={{ color: "var(--muted)" }}>--</span>,
  },
];

// ── Flatten visible rows ──

interface FlatRow {
  node: DashboardTreeNode;
  isShowMore?: boolean;
  showMoreParentId?: string;
  showMoreCount?: number;
}

function flattenVisible(
  nodes: DashboardTreeNode[],
  expandedIds: Set<string>,
  shownAll: Set<string>
): FlatRow[] {
  const rows: FlatRow[] = [];

  function walk(list: DashboardTreeNode[]) {
    for (const node of list) {
      rows.push({ node });
      const hasChildren = node.children.length > 0 || node.hasMore;
      if (hasChildren && expandedIds.has(node.id)) {
        walk(node.children);
        // Show "Show more" row if truncated and not already showing all
        if (node.hasMore && !shownAll.has(node.id)) {
          const remaining = (node.totalChildren ?? 0) - node.children.length;
          rows.push({
            node,
            isShowMore: true,
            showMoreParentId: node.id,
            showMoreCount: remaining,
          });
        }
      }
    }
  }

  walk(nodes);
  return rows;
}

// ── CSV export ──

function exportCSV(visibleRows: FlatRow[]) {
  const headers = ["Level", "Name", "Spend", "Installs", "Revenue", "eCPI", "IPM", "CVR", "D0 ARPU", "D7 ARPU", "D30 ARPU", "ROAS D0", "ROAS D7", "ROAS D30"];
  const dataRows = visibleRows
    .filter((r) => !r.isShowMore)
    .map((r) => {
      const n = r.node;
      return [
        n.level,
        `"${n.name.replace(/"/g, '""')}"`,
        n.metrics.spend.toFixed(2),
        n.metrics.installs,
        n.metrics.revenue.toFixed(2),
        n.metrics.ecpi.toFixed(2),
        n.metrics.ipm.toFixed(2),
        n.metrics.cvr.toFixed(2),
        (n.metrics.arpu || 0).toFixed(2),
        "0",
        "0",
        (n.metrics.roas * 100).toFixed(1) + "%",
        "0%",
        "0%",
      ];
    });
  const csv = [headers, ...dataRows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ua-report.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ──

export default function TreeTable() {
  const { data, loading, error } = useDashboardData();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(["urban-heat"]));
  const [shownAll, setShownAll] = useState<Set<string>>(new Set());
  const [showPaused, setShowPaused] = useState(false);
  const [tableCollapsed, setTableCollapsed] = useState(false);

  const tree = useMemo(() => {
    if (!data) return [];
    return buildTree(data, { showPaused });
  }, [data, showPaused]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    function collectIds(nodes: DashboardTreeNode[]): string[] {
      return nodes.flatMap((n) => [n.id, ...collectIds(n.children)]);
    }
    setExpandedIds(new Set(collectIds(tree)));
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set(["urban-heat"]));
  }, []);

  const visibleRows = useMemo(
    () => flattenVisible(tree, expandedIds, shownAll),
    [tree, expandedIds, shownAll]
  );

  // Count media sources for the toolbar
  const mediaSourceCount = useMemo(() => {
    let count = 0;
    function walk(nodes: DashboardTreeNode[]) {
      for (const n of nodes) {
        if (n.level === "mediaSource") count++;
        walk(n.children);
      }
    }
    walk(tree);
    return count;
  }, [tree]);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <div
            className="animate-pulse"
            style={{
              height: "16px",
              width: "200px",
              borderRadius: "4px",
              background: "var(--surface2)",
            }}
          />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{
              display: "flex",
              gap: "16px",
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              opacity: 1 - i * 0.08,
            }}
          >
            <div style={{ height: "14px", width: "160px", borderRadius: "4px", background: "var(--surface2)" }} />
            {COLUMNS.map((c) => (
              <div
                key={c.key}
                style={{ height: "14px", width: "70px", borderRadius: "4px", background: "var(--surface2)", marginLeft: "auto" }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "40px",
          textAlign: "center",
          color: "var(--red)",
          fontSize: "13px",
        }}
      >
        {error}
      </div>
    );
  }

  // ── Empty state ──
  if (!data || visibleRows.length === 0) {
    return (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "40px",
          textAlign: "center",
          color: "var(--muted)",
          fontSize: "13px",
        }}
      >
        No data to display
      </div>
    );
  }

  const allIds = new Set(
    visibleRows.filter((r) => !r.isShowMore && r.node.children.length > 0).map((r) => r.node.id)
  );
  const allExpanded = allIds.size > 0 && [...allIds].every((id) => expandedIds.has(id));

  return (
    <div className="flex flex-col gap-3">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap" }}>
        <div className="flex items-center gap-3">
          <SegmentedToggle
            size="sm"
            options={[
              { value: "active", label: "Active" },
              { value: "all", label: "All" },
            ]}
            value={showPaused ? "all" : "active"}
            onChange={(v) => setShowPaused(v === "all")}
          />
          {mediaSourceCount > 0 && (
            <span style={{ fontSize: "11px", color: "var(--muted)" }}>
              {mediaSourceCount} media source{mediaSourceCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportCSV(visibleRows)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            style={{
              background: "var(--surface2)",
              color: "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            &#8595; CSV
          </button>
          <button
            onClick={allExpanded ? collapseAll : expandAll}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            style={{
              background: "var(--surface2)",
              color: "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            {allExpanded ? "Collapse All" : "Expand All"}
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div
        style={{
          overflowX: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: "1100px",
          }}
        >
          {/* ── Header ── */}
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th
                style={{
                  textAlign: "left",
                  padding: "10px 16px",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--muted)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                APP / SOURCE
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: "right",
                    padding: "10px 16px",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--muted)",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* ── Body ── */}
          {!tableCollapsed && (
            <tbody>
              {visibleRows.map((row, rowIdx) => {
                // Show More row
                if (row.isShowMore) {
                  return (
                    <tr key={`showmore-${row.showMoreParentId}-${rowIdx}`}>
                      <td
                        colSpan={COLUMNS.length + 1}
                        style={{
                          textAlign: "center",
                          padding: "8px 16px",
                          fontSize: "11px",
                          color: "var(--muted)",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          if (row.showMoreParentId) {
                            setShownAll((prev) => new Set([...prev, row.showMoreParentId!]));
                          }
                        }}
                      >
                        Show more (+{row.showMoreCount})
                      </td>
                    </tr>
                  );
                }

                const node = row.node;
                const hasChildren = node.children.length > 0;
                const isExpanded = expandedIds.has(node.id);
                const indent = INDENT_PX[node.level] ?? 0;
                const weight = FONT_WEIGHT[node.level] ?? 400;
                const isAppRow = node.level === "app";

                return (
                  <tr
                    key={node.id}
                    role="row"
                    aria-expanded={hasChildren ? isExpanded : undefined}
                    onClick={hasChildren ? () => toggleExpand(node.id) : undefined}
                    onKeyDown={
                      hasChildren
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleExpand(node.id);
                            }
                          }
                        : undefined
                    }
                    tabIndex={hasChildren ? 0 : -1}
                    style={{
                      background: isAppRow ? "var(--surface2)" : "transparent",
                      cursor: hasChildren ? "pointer" : "default",
                      outline: "none",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--surface2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isAppRow ? "var(--surface2)" : "transparent";
                    }}
                  >
                    {/* Name cell */}
                    <td
                      style={{
                        padding: "0 16px",
                        paddingLeft: `${16 + indent}px`,
                        height: "44px",
                        fontSize: "13px",
                        fontWeight: weight,
                        color: "var(--text)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        {/* Chevron or spacer */}
                        {hasChildren ? (
                          <Chevron expanded={isExpanded} />
                        ) : (
                          <span style={{ width: "10px", flexShrink: 0 }} />
                        )}
                        {/* Icon */}
                        <RowIcon node={node} />
                        {/* Name */}
                        <span>{node.name}</span>
                      </span>
                    </td>

                    {/* Metric cells */}
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        style={{
                          padding: "0 16px",
                          height: "44px",
                          fontSize: "12px",
                          fontVariantNumeric: "tabular-nums",
                          textAlign: "right",
                          color: "var(--text)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col.render(node)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}

// Keep the old named export so any remaining import of TableTreeNode still works
export type { TableTreeNode };
