import type { ReportResponse, ReportMetrics, AFMetrics } from "@/lib/types";

// ── Tree node for the expandable table ──

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

export interface TableTreeNode {
  id: string;
  level: "platform" | "campaign" | "date";
  name: string;
  icon?: string;
  metrics: TreeMetrics;
  children: TableTreeNode[];
}

// ── Helpers ──

function computeMetrics(ga: ReportMetrics, af: AFMetrics): TreeMetrics {
  const spend = ga.spend;
  const installs = af.installs;
  const impressions = ga.impressions;
  const clicks = ga.clicks;
  const revenue = af.revenue;

  return {
    spend,
    installs,
    ecpi: installs > 0 ? spend / installs : 0,
    ipm: impressions > 0 ? (installs / impressions) * 1000 : 0,
    cpm: ga.cpm,
    ctr: ga.ctr,
    cvr: ga.cvr,
    roas: spend > 0 ? revenue / spend : 0,
    arpu: installs > 0 ? revenue / installs : 0,
    clicks,
    impressions,
    revenue,
  };
}

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

function addRaw(
  acc: { spend: number; installs: number; impressions: number; clicks: number; revenue: number },
  ga: ReportMetrics,
  af: AFMetrics
) {
  acc.spend += ga.spend;
  acc.installs += af.installs;
  acc.impressions += ga.impressions;
  acc.clicks += ga.clicks;
  acc.revenue += af.revenue;
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

// ── Campaign aggregation per platform ──

type PlatformKey = "all" | "android" | "ios";

function buildCampaignNodes(
  data: ReportResponse,
  platformKey: PlatformKey,
  parentId: string
): TableTreeNode[] {
  // Accumulate per-campaign totals across days, then build date children
  const campaignMap = new Map<
    string,
    {
      raw: { spend: number; installs: number; impressions: number; clicks: number; revenue: number };
      days: { date: string; ga: ReportMetrics; af: AFMetrics }[];
    }
  >();

  for (const day of data.days) {
    for (const [campaignName, campaignData] of Object.entries(day.campaigns)) {
      let entry = campaignMap.get(campaignName);
      if (!entry) {
        entry = {
          raw: { spend: 0, installs: 0, impressions: 0, clicks: 0, revenue: 0 },
          days: [],
        };
        campaignMap.set(campaignName, entry);
      }

      // For "all" platform, use campaign data directly.
      // For android/ios, we only have campaign-level data (not split by platform),
      // so for sub-platform nodes we still use the campaign data.
      // The platform split is reflected at the aggregate level (Level 1).
      const ga = campaignData.ga;
      const af = campaignData.af;

      addRaw(entry.raw, ga, af);
      entry.days.push({ date: day.date, ga, af });
    }
  }

  // Sort campaigns by spend descending
  const sorted = [...campaignMap.entries()].sort(
    (a, b) => b[1].raw.spend - a[1].raw.spend
  );

  return sorted.map(([name, entry]) => {
    const campaignId = `${parentId}/${name}`;
    const dateChildren: TableTreeNode[] = entry.days
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        id: `${campaignId}/${d.date}`,
        level: "date" as const,
        name: d.date,
        metrics: computeMetrics(d.ga, d.af),
        children: [],
      }));

    return {
      id: campaignId,
      level: "campaign" as const,
      name,
      metrics: deriveRatios(entry.raw),
      children: dateChildren,
    };
  });
}

// ── Main builder ──

export function buildTree(data: ReportResponse): TableTreeNode[] {
  if (!data || !data.aggregate) return [];

  const platforms: { key: PlatformKey; name: string; icon: string }[] = [
    { key: "all", name: "All Platforms", icon: "\uD83C\uDF10" },
    { key: "android", name: "Android", icon: "\uD83E\uDD16" },
    { key: "ios", name: "iOS", icon: "\uD83C\uDF4E" },
  ];

  return platforms.map(({ key, name, icon }) => {
    const agg = data.aggregate[key];
    const platformId = key;

    return {
      id: platformId,
      level: "platform" as const,
      name,
      icon,
      metrics: computeMetrics(agg.ga, agg.af),
      children: buildCampaignNodes(data, key, platformId),
    };
  });
}
