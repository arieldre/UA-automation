"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useFilters } from "@/hooks/useFilters";
import IntegrityPanel, { type IntegrityRow } from "@/components/IntegrityPanel";
import type { FacebookResponse } from "@/lib/types";
import { API_BASE } from "@/lib/apiBase";

// ── Build GA vs AF rows from report data ──

function buildGAvsAFRows(
  data: import("@/lib/types").ReportResponse,
  osFilter: ("android" | "ios")[]
): IntegrityRow[] {
  // Aggregate per campaign across all days
  const map = new Map<
    string,
    { aSpend: number; aInstalls: number; bSpend: number; bInstalls: number }
  >();

  for (const day of data.days) {
    for (const [campaign, metrics] of Object.entries(day.campaigns)) {
      // Each campaign has all/android/ios slices — pick based on OS filter
      const oses: ("all" | "android" | "ios")[] =
        osFilter.length === 0
          ? ["all"]
          : (osFilter as ("android" | "ios")[]);

      for (const osKey of oses) {
        const s = metrics[osKey];
        if (!s) continue;
        const existing = map.get(campaign) ?? {
          aSpend: 0,
          aInstalls: 0,
          bSpend: 0,
          bInstalls: 0,
        };

        map.set(campaign, {
          aSpend: existing.aSpend + (s.ga.spend ?? 0),
          aInstalls: existing.aInstalls + (s.ga.conversions ?? 0),
          bSpend: existing.bSpend + (s.af.spend ?? 0),
          bInstalls: existing.bInstalls + (s.af.installs ?? 0),
        });
      }
    }
  }

  return Array.from(map.entries()).map(([campaign, v]) => ({
    campaign,
    aSpend: v.aSpend,
    aInstalls: v.aInstalls,
    bSpend: v.bSpend,
    bInstalls: v.bInstalls,
  }));
}

// ── Build FB vs AF rows ──

function buildFBvsAFRows(
  fbData: FacebookResponse,
  reportData: import("@/lib/types").ReportResponse
): IntegrityRow[] {
  // Collect all FB campaigns from both accounts
  const allFBCampaigns = [
    ...fbData.titan.campaigns,
    ...fbData.hitzone.campaigns,
  ];

  if (allFBCampaigns.length === 0) return [];

  // Aggregate AF data for Facebook Ads media source across both OS
  const afAndroid = reportData.byMediaSource?.android ?? {};
  const afIos = reportData.byMediaSource?.ios ?? {};

  // Find the "Facebook Ads" key (case-insensitive)
  function findFBKey(record: Record<string, import("@/lib/types").AFChannelMetrics>): string | null {
    return (
      Object.keys(record).find((k) =>
        k.toLowerCase().includes("facebook")
      ) ?? null
    );
  }

  const fbKeyAndroid = findFBKey(afAndroid);
  const fbKeyIos = findFBKey(afIos);

  const afFB = {
    spend:
      (fbKeyAndroid ? afAndroid[fbKeyAndroid].cost : 0) +
      (fbKeyIos ? afIos[fbKeyIos].cost : 0),
    installs:
      (fbKeyAndroid ? afAndroid[fbKeyAndroid].installs : 0) +
      (fbKeyIos ? afIos[fbKeyIos].installs : 0),
    revenue:
      (fbKeyAndroid ? afAndroid[fbKeyAndroid].revenue : 0) +
      (fbKeyIos ? afIos[fbKeyIos].revenue : 0),
  };

  // Map FB campaigns to IntegrityRow. AF data is only available at the
  // media-source level, not per campaign — so we attribute the full AF totals
  // proportionally to the first campaign and zero for the rest (common pattern
  // when cross-source is available only at account level). Alternatively, show
  // total row only. Here we show each FB campaign with AF = 0 for drill-down,
  // plus a synthetic "Facebook Ads (AF Total)" row for the aggregate comparison.
  const rows: IntegrityRow[] = allFBCampaigns.map((c) => ({
    campaign: c.name,
    aSpend: c.spend,
    aInstalls: c.installs,
    aRevenue: c.purchaseRev,
    bSpend: 0,
    bInstalls: 0,
    bRevenue: 0,
  }));

  // Add aggregate comparison row
  const totalFBSpend = allFBCampaigns.reduce((s, c) => s + c.spend, 0);
  const totalFBInstalls = allFBCampaigns.reduce((s, c) => s + c.installs, 0);
  const totalFBRevenue = allFBCampaigns.reduce((s, c) => s + c.purchaseRev, 0);

  rows.unshift({
    campaign: "Facebook Ads (All campaigns — AF total)",
    aSpend: totalFBSpend,
    aInstalls: totalFBInstalls,
    aRevenue: totalFBRevenue,
    bSpend: afFB.spend,
    bInstalls: afFB.installs,
    bRevenue: afFB.revenue,
  });

  return rows;
}

// ── Page ──

export default function IntegrityPage() {
  const { data: reportData, loading: reportLoading } = useDashboardData();
  const { filters } = useFilters();
  const { from, to } = filters.dateRange;

  const [fbData, setFbData] = useState<FacebookResponse | null>(null);
  const [fbLoading, setFbLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchFB = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFbLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/facebook?from=${from}&to=${to}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Facebook API error: ${res.status}`);
      const json: FacebookResponse = await res.json();
      setFbData(json);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      setFbLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchFB();
    return () => abortRef.current?.abort();
  }, [fetchFB]);

  // Build rows
  const gaRows: IntegrityRow[] =
    reportData
      ? buildGAvsAFRows(reportData, filters.os)
      : [];

  const fbRows: IntegrityRow[] =
    fbData && reportData
      ? buildFBvsAFRows(fbData, reportData)
      : [];

  const hasByMediaSource =
    reportData?.byMediaSource != null &&
    (Object.keys(reportData.byMediaSource.android ?? {}).length > 0 ||
      Object.keys(reportData.byMediaSource.ios ?? {}).length > 0);

  return (
    <div className="space-y-6" style={{ marginTop: 24 }}>
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          Data Integrity
        </h1>
        <p className="text-sm" style={{ color: "var(--muted)", marginTop: 4 }}>
          Cross-source comparison — mismatches &ge;10% flagged in red.
        </p>
      </div>

      <IntegrityPanel
        title="Google Ads vs AppsFlyer"
        sourceALabel="Google Ads"
        sourceBLabel="AppsFlyer"
        rows={gaRows}
        loading={reportLoading}
      />

      {!hasByMediaSource && !reportLoading ? (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius, 12px)",
            padding: "24px 16px",
            textAlign: "center",
          }}
        >
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            <strong style={{ color: "var(--text)" }}>Facebook Ads vs AppsFlyer</strong>
            {" — "}AF media-source data not available for this date range. Run the AF backfill to populate it.
          </p>
        </div>
      ) : (
        <IntegrityPanel
          title="Facebook Ads vs AppsFlyer"
          sourceALabel="Facebook Ads"
          sourceBLabel="AppsFlyer"
          rows={fbRows}
          loading={reportLoading || fbLoading}
        />
      )}
    </div>
  );
}
