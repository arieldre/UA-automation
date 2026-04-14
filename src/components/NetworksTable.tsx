"use client";

import { useState } from "react";
import { useNetworks } from "@/hooks/useNetworks";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
} from "@/components/ui/Formatters";
import type { NetworkRow, NetworksCampaign } from "@/lib/types";

/* ── Column definitions ── */

const COLUMNS = [
  "Network",
  "Spend",
  "Clicks",
  "Impressions",
  "Conversions",
  "CTR",
  "CPM",
  "CPC",
] as const;

type Col = (typeof COLUMNS)[number];

function fmtCell(col: Col, row: NetworkRow): string {
  switch (col) {
    case "Network":
      return row.label || row.network;
    case "Spend":
      return formatCurrency(row.spend);
    case "Clicks":
      return formatNumber(row.clicks);
    case "Impressions":
      return formatNumber(row.impressions);
    case "Conversions":
      return formatNumber(row.conversions);
    case "CTR":
      return formatPercent(row.ctr);
    case "CPM":
      return formatCurrency(row.cpm);
    case "CPC":
      return formatCurrency(row.cpc);
  }
}

function isNumericCol(col: Col): boolean {
  return col !== "Network";
}

/* ── Chevron icon ── */

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`inline-block w-4 h-4 mr-1 transition-transform ${
        expanded ? "rotate-90" : ""
      }`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

/* ── Campaign row group ── */

interface CampaignGroupProps {
  campaign: NetworksCampaign;
}

function CampaignGroup({ campaign }: CampaignGroupProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* Campaign total row */}
      <tr
        className="border-b cursor-pointer hover:bg-white/[0.03] font-semibold"
        style={{ borderColor: "var(--border)" }}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-3 py-2 whitespace-nowrap text-left">
          <ChevronIcon expanded={expanded} />
          {campaign.campaignName}
        </td>
        {COLUMNS.slice(1).map((col) => (
          <td
            key={col}
            className="px-3 py-2 whitespace-nowrap text-right tabular-nums"
          >
            {fmtCell(col, campaign.total)}
          </td>
        ))}
      </tr>

      {/* Network breakdown rows */}
      {expanded &&
        campaign.networks.map((net, i) => (
          <tr
            key={i}
            className="border-b hover:bg-white/[0.02]"
            style={{ borderColor: "var(--border)" }}
          >
            <td
              className="px-3 py-2 whitespace-nowrap text-left pl-10"
              style={{ color: "var(--muted)" }}
            >
              {net.label || net.network}
            </td>
            {COLUMNS.slice(1).map((col) => (
              <td
                key={col}
                className="px-3 py-2 whitespace-nowrap text-right tabular-nums"
              >
                {fmtCell(col, net)}
              </td>
            ))}
          </tr>
        ))}

      {/* AF channel rows if present */}
      {expanded &&
        campaign.afChannelRows &&
        Object.entries(campaign.afChannelRows).map(([channel, row]) => (
          <tr
            key={`af-${channel}`}
            className="border-b hover:bg-white/[0.02]"
            style={{ borderColor: "var(--border)" }}
          >
            <td
              className="px-3 py-2 whitespace-nowrap text-left pl-10 italic"
              style={{ color: "var(--muted)" }}
            >
              AF: {channel}
            </td>
            <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
              {formatCurrency(row.cost)}
            </td>
            <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
              &mdash;
            </td>
            <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
              &mdash;
            </td>
            <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
              {formatNumber(row.installs)}
            </td>
            <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
              &mdash;
            </td>
            <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
              &mdash;
            </td>
            <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
              &mdash;
            </td>
          </tr>
        ))}
    </>
  );
}

/* ── Main table ── */

export default function NetworksTable() {
  const { data, loading, error } = useNetworks();

  if (loading) {
    return (
      <div
        className="rounded-xl border p-8 text-center text-sm animate-pulse"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          color: "var(--muted)",
        }}
      >
        Loading networks data...
      </div>
    );
  }

  if (error) {
    return (
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
    );
  }

  if (!data || !data.campaigns.length) {
    return (
      <div
        className="rounded-xl border p-8 text-center text-sm"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          color: "var(--muted)",
        }}
      >
        No networks data for selected period.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
          Networks
        </h2>
        <span
          className="text-xs px-3 py-1 rounded-md border"
          style={{
            borderColor: "var(--border)",
            color: "var(--muted)",
          }}
        >
          Graph coming soon
        </span>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
        }}
      >
        <div className="overflow-x-auto">
          <table
            className="w-full text-[13px]"
            style={{ color: "var(--text)" }}
          >
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
              {data.campaigns.map((c) => (
                <CampaignGroup key={c.campaignId} campaign={c} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
