import type { ReportResponse, ReportMetrics, AFMetrics, AFChannelMetrics } from "@/lib/types";

// ── Exported types ──

export interface TreeMetrics {
  spend: number;
  installs: number;
  ecpi: number;
  ipm: number;
  cpm: number;
  ctr: number;
  cvr: number;
  roas: number;
  arpu: number;
  clicks: number;
  impressions: number;
  revenue: number;
}

export type DashboardLevel = "app" | "os" | "mediaSource" | "campaign";

export interface DashboardTreeNode {
  id: string;
  level: DashboardLevel;
  name: string;
  metrics: TreeMetrics;
  children: DashboardTreeNode[];
  hasMore?: boolean;
  totalChildren?: number;
  mediaSource?: string; // raw AF key, used for Google detection
}

/** @deprecated use DashboardTreeNode */
export type TableTreeNode = DashboardTreeNode & { level: DashboardLevel };

// ── Helpers ──

function emptyMetrics(): TreeMetrics {
  return {
    spend: 0,
    installs: 0,
    ecpi: 0,
    ipm: 0,
    cpm: 0,
    ctr: 0,
    cvr: 0,
    roas: 0,
    arpu: 0,
    clicks: 0,
    impressions: 0,
    revenue: 0,
  };
}

function deriveRatios(raw: {
  spend: number;
  installs: number;
  impressions: number;
  clicks: number;
  revenue: number;
}): TreeMetrics {
  const { spend, installs, impressions, clicks, revenue } = raw;
  return {
    spend,
    installs,
    ecpi: installs > 0 ? spend / installs : 0,
    ipm: impressions > 0 ? (installs / impressions) * 1000 : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cvr: clicks > 0 ? (installs / clicks) * 100 : 0,
    roas: spend > 0 ? revenue / spend : 0,
    arpu: installs > 0 ? revenue / installs : 0,
    clicks,
    impressions,
    revenue,
  };
}

function computeMetricsFromGAAF(ga: ReportMetrics, af: AFMetrics): TreeMetrics {
  return deriveRatios({
    spend: ga.spend,
    installs: af.installs,
    impressions: ga.impressions,
    clicks: ga.clicks,
    revenue: af.revenue,
  });
}

const TOP_N = 10;

function isGoogleSource(key: string): boolean {
  return /googleads|googleadwords/i.test(key);
}

// ── Media Source nodes (Level 2) ──

function buildMediaSourceNodes(
  data: ReportResponse,
  osKey: "android" | "ios",
  osAgg: { ga: ReportMetrics; af: AFMetrics },
  parentId: string
): DashboardTreeNode[] {
  const byMS = data.byMediaSource?.[osKey];

  if (!byMS || Object.keys(byMS).length === 0) {
    // Fallback: single Google Ads row using GA aggregate
    const gaMet: ReportMetrics = osAgg.ga;
    const afMet: AFMetrics = osAgg.af;
    const metrics = deriveRatios({
      spend: gaMet.spend,
      installs: afMet.installs,
      impressions: gaMet.impressions,
      clicks: gaMet.clicks,
      revenue: afMet.revenue,
    });
    const campaignNodes = buildCampaignNodes(data, parentId);
    return [
      {
        id: `${parentId}/google-ads`,
        level: "mediaSource",
        name: "Google Ads",
        metrics,
        mediaSource: "googleadwords_int",
        children: campaignNodes.slice(0, TOP_N),
        hasMore: campaignNodes.length > TOP_N,
        totalChildren: campaignNodes.length,
      },
    ];
  }

  // Build from byMediaSource data
  const entries = Object.entries(byMS) as [string, AFChannelMetrics][];

  // ACI_* keys are Google UAC sub-channels (Search/Display/YouTube) from AF's channel_by_date_report.
  // Collapse them into a single Google Ads row to avoid showing $0-spend sub-channel rows.
  const ACI_PATTERN = /^ACI_/i;
  const allGoogleUACChannels =
    entries.length > 0 && entries.every(([k]) => ACI_PATTERN.test(k));
  if (allGoogleUACChannels) {
    const totalInstalls = entries.reduce((sum, [, ms]) => sum + ms.installs, 0);
    const totalRevenue  = entries.reduce((sum, [, ms]) => sum + ms.revenue, 0);
    const metrics = deriveRatios({
      spend:       osAgg.ga.spend,
      installs:    totalInstalls > 0 ? totalInstalls : osAgg.af.installs,
      impressions: osAgg.ga.impressions,
      clicks:      osAgg.ga.clicks,
      revenue:     totalRevenue > 0 ? totalRevenue : osAgg.af.revenue,
    });
    const campaignNodes = buildCampaignNodes(data, parentId);
    return [
      {
        id: `${parentId}/google-ads`,
        level: "mediaSource" as const,
        name: "Google Ads",
        metrics,
        mediaSource: "googleadwords_int",
        children: campaignNodes.slice(0, TOP_N),
        hasMore: campaignNodes.length > TOP_N,
        totalChildren: campaignNodes.length,
      },
    ];
  }

  const nodes: DashboardTreeNode[] = entries.map(([msKey, ms]) => {
    let spend: number;
    let clicks: number;
    let impressions: number;

    if (isGoogleSource(msKey)) {
      // Use GA aggregate values for Google rows
      spend = osAgg.ga.spend;
      clicks = osAgg.ga.clicks;
      impressions = osAgg.ga.impressions;
    } else {
      spend = ms.cost;
      clicks = ms.clicks ?? 0;
      impressions = ms.impressions ?? 0;
    }

    const installs = ms.installs;
    const revenue = ms.revenue;

    const metrics = deriveRatios({ spend, installs, impressions, clicks, revenue });
    const campaignNodes = buildCampaignNodes(data, `${parentId}/${msKey}`);
    const displayName = friendlyMediaSourceName(msKey);

    return {
      id: `${parentId}/${msKey}`,
      level: "mediaSource" as const,
      name: displayName,
      metrics,
      mediaSource: msKey,
      children: campaignNodes.slice(0, TOP_N),
      hasMore: campaignNodes.length > TOP_N,
      totalChildren: campaignNodes.length,
    };
  });

  // Sort by spend desc
  nodes.sort((a, b) => b.metrics.spend - a.metrics.spend);

  const total = nodes.length;
  if (total > TOP_N) {
    return nodes.slice(0, TOP_N).map((n, i) => ({
      ...n,
      hasMore: i === TOP_N - 1 ? true : n.hasMore,
      totalChildren: i === TOP_N - 1 ? total : n.totalChildren,
    }));
  }
  return nodes;
}

// Friendly display names for known AF media source keys
function friendlyMediaSourceName(key: string): string {
  const lower = key.toLowerCase();
  if (/googleadwords|googleads/.test(lower)) return "Google Ads";
  if (lower.includes("facebook") || lower.includes("meta")) return "Meta";
  if (lower.includes("tiktok")) return "TikTok";
  if (lower.includes("applovin")) return "AppLovin";
  if (lower.includes("unity")) return "Unity Ads";
  if (lower.includes("snapchat")) return "Snapchat";
  if (lower.includes("apple")) return "Apple Search Ads";
  if (lower.includes("ironsource")) return "IronSource";
  // Fallback: title-case the key, strip suffixes like _int
  return key
    .replace(/_int$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Campaign nodes (Level 3) ──

function buildCampaignNodes(
  data: ReportResponse,
  parentId: string,
  opts?: { showPaused?: boolean }
): DashboardTreeNode[] {
  const showPaused = opts?.showPaused ?? false;

  const campaignMap = new Map<
    string,
    { spend: number; installs: number; impressions: number; clicks: number; revenue: number }
  >();

  for (const day of data.days) {
    for (const [campaignName, campaignData] of Object.entries(day.campaigns)) {
      const existing = campaignMap.get(campaignName) ?? {
        spend: 0,
        installs: 0,
        impressions: 0,
        clicks: 0,
        revenue: 0,
      };
      existing.spend += campaignData.all.ga.spend ?? 0;
      existing.installs += campaignData.all.af.installs ?? 0;
      existing.impressions += campaignData.all.ga.impressions ?? 0;
      existing.clicks += campaignData.all.ga.clicks ?? 0;
      existing.revenue += campaignData.all.af.revenue ?? 0;
      campaignMap.set(campaignName, existing);
    }
  }

  let entries = [...campaignMap.entries()];

  // Filter paused (zero spend) unless showPaused
  if (!showPaused) {
    entries = entries.filter(([, raw]) => raw.spend > 0);
  }

  // Sort by spend desc
  entries.sort((a, b) => b[1].spend - a[1].spend);

  const total = entries.length;
  const visible = entries.slice(0, TOP_N);

  return visible.map(([name, raw], i) => ({
    id: `${parentId}/${name}`,
    level: "campaign" as const,
    name,
    metrics: deriveRatios(raw),
    children: [],
    hasMore: i === visible.length - 1 && total > TOP_N ? true : undefined,
    totalChildren: i === visible.length - 1 && total > TOP_N ? total : undefined,
  }));
}

// ── Main builder ──

export interface BuildTreeOpts {
  showPaused?: boolean;
}

export function buildTree(data: ReportResponse, opts?: BuildTreeOpts): DashboardTreeNode[] {
  if (!data?.aggregate) return [];

  const showPaused = opts?.showPaused ?? false;

  // Level 1 — OS nodes
  const osNodes: DashboardTreeNode[] = (["android", "ios"] as const).map((osKey) => {
    const agg = data.aggregate[osKey];
    const rawMetrics = deriveRatios({
      spend: agg.ga.spend,
      installs: agg.af.installs,
      impressions: agg.ga.impressions,
      clicks: agg.ga.clicks,
      revenue: agg.af.revenue,
    });

    const mediaSourceChildren = buildMediaSourceNodes(data, osKey, agg, osKey);

    return {
      id: osKey,
      level: "os" as const,
      name: osKey === "android" ? "Android" : "iOS",
      metrics: rawMetrics,
      children: mediaSourceChildren,
    };
  });

  // Sort android first (by id lexicographically android < ios, already correct)

  // Level 0 — App row (Urban Heat)
  const allAgg = data.aggregate.all;
  const appMetrics = deriveRatios({
    spend: allAgg.ga.spend,
    installs: allAgg.af.installs,
    impressions: allAgg.ga.impressions,
    clicks: allAgg.ga.clicks,
    revenue: allAgg.af.revenue,
  });

  const appNode: DashboardTreeNode = {
    id: "urban-heat",
    level: "app",
    name: "Urban Heat",
    metrics: appMetrics,
    children: osNodes,
  };

  return [appNode];
}

// Keep old export alias working
export { buildTree as default };
