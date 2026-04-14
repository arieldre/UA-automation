"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useFilters } from "@/hooks/useFilters";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
} from "@/components/ui/Formatters";
import type { FacebookResponse, FBAccountData, FBCampaign } from "@/lib/types";

/* ── Account table for a single FB account ── */

const COLUMNS = [
  "Campaign",
  "Spend",
  "Clicks",
  "Impressions",
  "Installs",
  "Purchases",
  "Purchase Rev",
  "CPM",
  "CPC",
  "CTR",
  "eCPI",
] as const;

function fmtCell(col: (typeof COLUMNS)[number], row: FBCampaign): string {
  switch (col) {
    case "Campaign":
      return row.name;
    case "Spend":
      return formatCurrency(row.spend);
    case "Clicks":
      return formatNumber(row.clicks);
    case "Impressions":
      return formatNumber(row.impressions);
    case "Installs":
      return formatNumber(row.installs);
    case "Purchases":
      return formatNumber(row.purchases);
    case "Purchase Rev":
      return formatCurrency(row.purchaseRev);
    case "CPM":
      return formatCurrency(row.cpm);
    case "CPC":
      return formatCurrency(row.cpc);
    case "CTR":
      return formatPercent(row.ctr);
    case "eCPI":
      return formatCurrency(row.ecpi);
  }
}

function isNumericCol(col: (typeof COLUMNS)[number]): boolean {
  return col !== "Campaign";
}

interface AccountTableProps {
  label: string;
  badgeColor: string;
  account: FBAccountData;
}

function AccountTable({ label, badgeColor, account }: AccountTableProps) {
  if (account.error) {
    return (
      <div
        className="rounded-xl border p-4"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
        }}
      >
        <span
          className="inline-block rounded-md px-2 py-0.5 text-xs font-semibold text-white mb-2"
          style={{ background: badgeColor }}
        >
          {label}
        </span>
        <p className="text-sm" style={{ color: "var(--red)" }}>
          {account.error}
        </p>
      </div>
    );
  }

  if (!account.campaigns.length) {
    return (
      <div
        className="rounded-xl border p-4"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
        }}
      >
        <span
          className="inline-block rounded-md px-2 py-0.5 text-xs font-semibold text-white mb-2"
          style={{ background: badgeColor }}
        >
          {label}
        </span>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No campaign data for selected period.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
      }}
    >
      {/* Header badge */}
      <div className="px-4 pt-3 pb-2">
        <span
          className="inline-block rounded-md px-2 py-0.5 text-xs font-semibold text-white"
          style={{ background: badgeColor }}
        >
          {label}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]" style={{ color: "var(--text)" }}>
          <thead>
            <tr
              className="border-b"
              style={{ borderColor: "var(--border)" }}
            >
              {COLUMNS.map((col) => (
                <th
                  key={col}
                  className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap ${
                    isNumericCol(col) ? "text-right" : "text-left"
                  }`}
                  style={{ color: "var(--muted)" }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {account.campaigns.map((c, i) => (
              <tr
                key={i}
                className="border-b hover:bg-white/[0.02]"
                style={{ borderColor: "var(--border)" }}
              >
                {COLUMNS.map((col) => (
                  <td
                    key={col}
                    className={`px-3 py-2 whitespace-nowrap ${
                      isNumericCol(col) ? "text-right tabular-nums" : "text-left"
                    }`}
                  >
                    {fmtCell(col, c)}
                  </td>
                ))}
              </tr>
            ))}
            {/* Total row */}
            <tr
              className="border-t-2 font-bold"
              style={{ borderColor: "var(--border)" }}
            >
              {COLUMNS.map((col) => (
                <td
                  key={col}
                  className={`px-3 py-2 whitespace-nowrap ${
                    isNumericCol(col) ? "text-right tabular-nums" : "text-left"
                  }`}
                >
                  {fmtCell(col, account.total)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main section ── */

export default function FacebookSection() {
  const { filters } = useFilters();
  const { from, to } = filters.dateRange;

  const [data, setData] = useState<FacebookResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/facebook?from=${from}&to=${to}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Facebook API error: ${res.status} ${res.statusText}`);
      }
      const json: FacebookResponse = await res.json();
      setData(json);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown fetch error");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
          Facebook Ads
        </h2>
        <div
          className="rounded-xl border p-8 text-center text-sm animate-pulse"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
            color: "var(--muted)",
          }}
        >
          Loading Facebook data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
          Facebook Ads
        </h2>
        <div
          className="rounded-xl border p-4 text-sm"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
            color: "var(--red)",
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
        Facebook Ads
      </h2>
      <AccountTable
        label="Titan"
        badgeColor="#7c6fff"
        account={data.titan}
      />
      <AccountTable
        label="Hitzone"
        badgeColor="#22c55e"
        account={data.hitzone}
      />
    </div>
  );
}
