"use client";

import { useState, useCallback, useMemo } from "react";
import { useDashboardData } from "@/hooks/useDashboardData";
import { buildTree, type TableTreeNode } from "@/lib/tree-builder";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatROAS,
} from "@/components/ui/Formatters";

// ── Column definitions ──

interface Column {
  key: string;
  label: string;
  align: "left" | "right";
  render: (node: TableTreeNode) => React.ReactNode;
}

function renderMetricCell(
  value: number,
  formatter: (n: number) => string
): React.ReactNode {
  return <span>{formatter(value)}</span>;
}

function renderROASCell(value: number): React.ReactNode {
  const { text, colorClass } = formatROAS(value);
  return <span className={colorClass}>{text}</span>;
}

const COLUMNS: Column[] = [
  {
    key: "spend",
    label: "Spend",
    align: "right",
    render: (n) => renderMetricCell(n.metrics.spend, formatCurrency),
  },
  {
    key: "installs",
    label: "Installs",
    align: "right",
    render: (n) => renderMetricCell(n.metrics.installs, formatNumber),
  },
  {
    key: "ecpi",
    label: "eCPI",
    align: "right",
    render: (n) => renderMetricCell(n.metrics.ecpi, formatCurrency),
  },
  {
    key: "ipm",
    label: "IPM",
    align: "right",
    render: (n) =>
      renderMetricCell(n.metrics.ipm, (v) =>
        v.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      ),
  },
  {
    key: "cpm",
    label: "CPM",
    align: "right",
    render: (n) => renderMetricCell(n.metrics.cpm, formatCurrency),
  },
  {
    key: "ctr",
    label: "CTR",
    align: "right",
    render: (n) => renderMetricCell(n.metrics.ctr, formatPercent),
  },
  {
    key: "cvr",
    label: "CVR",
    align: "right",
    render: (n) => renderMetricCell(n.metrics.cvr, formatPercent),
  },
  {
    key: "roas",
    label: "ROAS",
    align: "right",
    render: (n) => renderROASCell(n.metrics.roas),
  },
  {
    key: "arpu",
    label: "ARPU",
    align: "right",
    render: (n) => renderMetricCell(n.metrics.arpu, formatCurrency),
  },
  {
    key: "revenue",
    label: "Revenue",
    align: "right",
    render: (n) => renderMetricCell(n.metrics.revenue, formatCurrency),
  },
];

// ── Indent & level styles ──

const INDENT_PX: Record<string, number> = {
  platform: 0,
  campaign: 20,
  date: 40,
};

const FONT_WEIGHT: Record<string, number> = {
  platform: 600,
  campaign: 500,
  date: 400,
};

// ── Component ──

export default function TreeTable() {
  const { data, loading, error } = useDashboardData();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [tableCollapsed, setTableCollapsed] = useState(false);

  const tree = useMemo(() => {
    if (!data) return [];
    return buildTree(data);
  }, [data]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleTableCollapse = useCallback(() => {
    setTableCollapsed((prev) => !prev);
  }, []);

  // Flatten visible rows based on expanded state
  const visibleRows = useMemo(() => {
    const rows: TableTreeNode[] = [];

    function walk(nodes: TableTreeNode[]) {
      for (const node of nodes) {
        rows.push(node);
        if (node.children.length > 0 && expandedIds.has(node.id)) {
          walk(node.children);
        }
      }
    }

    walk(tree);
    return rows;
  }, [tree, expandedIds]);

  // ── Loading state ──
  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-20"
        style={{ color: "var(--muted)" }}
      >
        Loading dashboard data...
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div
        className="flex items-center justify-center py-20"
        style={{ color: "var(--red)" }}
      >
        {error}
      </div>
    );
  }

  // ── Empty state ──
  if (!data || visibleRows.length === 0) {
    return (
      <div
        className="flex items-center justify-center py-20"
        style={{ color: "var(--muted)" }}
      >
        No data to display
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between">
        <h2
          className="text-sm font-semibold"
          style={{ color: "var(--text)" }}
        >
          Campaign Performance
        </h2>
        <button
          onClick={toggleTableCollapse}
          className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer"
          style={{
            background: "var(--surface2)",
            color: "var(--muted)",
            border: "1px solid var(--border)",
          }}
        >
          {tableCollapsed ? "Expand Table" : "Collapse Table"}
        </button>
      </div>

      {/* ── Table ── */}
      <div
        className="overflow-x-auto"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
        }}
      >
        <table className="w-full border-collapse" style={{ minWidth: "960px" }}>
          {/* ── Header ── */}
          <thead>
            <tr
              style={{
                borderBottom: "1px solid var(--border)",
              }}
            >
              <th
                className="text-left px-4 py-3 sticky top-0"
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--muted)",
                  background: "var(--surface)",
                  fontWeight: 600,
                }}
              >
                Name
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 sticky top-0"
                  style={{
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--muted)",
                    background: "var(--surface)",
                    fontWeight: 600,
                    textAlign: col.align,
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
              {visibleRows.map((node) => {
                const hasChildren = node.children.length > 0;
                const isExpanded = expandedIds.has(node.id);
                const indent = INDENT_PX[node.level] ?? 0;
                const weight = FONT_WEIGHT[node.level] ?? 400;

                return (
                  <tr
                    key={node.id}
                    onClick={hasChildren ? () => toggleExpand(node.id) : undefined}
                    className="transition-colors"
                    style={{
                      borderBottom: "1px solid var(--border)",
                      cursor: hasChildren ? "pointer" : "default",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "rgba(124, 111, 255, 0.04)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {/* Name cell */}
                    <td
                      className="px-4 py-2.5 whitespace-nowrap"
                      style={{
                        fontSize: "13px",
                        fontWeight: weight,
                        color: "var(--text)",
                        paddingLeft: `${16 + indent}px`,
                      }}
                    >
                      <span className="inline-flex items-center gap-2">
                        {hasChildren && (
                          <span
                            className="inline-block text-xs transition-transform"
                            style={{
                              color: "var(--muted)",
                              transform: isExpanded
                                ? "rotate(90deg)"
                                : "rotate(0deg)",
                              width: "12px",
                            }}
                          >
                            &#9654;
                          </span>
                        )}
                        {!hasChildren && (
                          <span style={{ width: "12px", display: "inline-block" }} />
                        )}
                        {node.icon && <span>{node.icon}</span>}
                        <span>{node.name}</span>
                      </span>
                    </td>

                    {/* Metric cells */}
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className="px-4 py-2.5 whitespace-nowrap"
                        style={{
                          fontSize: "12px",
                          fontVariantNumeric: "tabular-nums",
                          textAlign: col.align,
                          color: "var(--text)",
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
