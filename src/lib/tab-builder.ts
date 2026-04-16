import type { ReportResponse, DayData, AFMetrics, Granularity } from "@/lib/types";

// ── Row shape for the tab table ──

export interface TableRow {
  name: string;
  spend: number;
  installs: number;
  revenue: number;
  ecpi: number;
  ipm: number;
  cpm: number;
  ctr: number;
  cvr: number;
  roas: number;
  arpu: number;
  clickable: boolean;
}

// ── Helpers ──

function metricsFromAF(af: AFMetrics): Omit<TableRow, "name" | "clickable"> {
  return {
    spend: af.spend,
    installs: af.installs,
    revenue: af.revenue,
    ecpi: af.installs > 0 ? af.spend / af.installs : 0,
    ipm: af.impressions > 0 ? (af.installs / af.impressions) * 1000 : 0,
    cpm: af.cpm,
    ctr: af.ctr,
    cvr: af.cvr,
    roas: af.roas,
    arpu: af.arpu,
  };
}

function sumAFMetrics(days: { af: AFMetrics }[]): AFMetrics {
  const sum: AFMetrics = {
    installs: 0,
    clicks: 0,
    impressions: 0,
    spend: 0,
    revenue: 0,
    ecpi: 0,
    cpm: 0,
    ctr: 0,
    cvr: 0,
    roas: 0,
    arpu: 0,
  };

  for (const d of days) {
    sum.installs += d.af.installs;
    sum.clicks += d.af.clicks;
    sum.impressions += d.af.impressions;
    sum.spend += d.af.spend;
    sum.revenue += d.af.revenue;
  }

  // Derived
  sum.ecpi = sum.installs > 0 ? sum.spend / sum.installs : 0;
  sum.cpm = sum.impressions > 0 ? (sum.spend / sum.impressions) * 1000 : 0;
  sum.ctr = sum.impressions > 0 ? (sum.clicks / sum.impressions) * 100 : 0;
  sum.cvr = sum.clicks > 0 ? (sum.installs / sum.clicks) * 100 : 0;
  sum.roas = sum.spend > 0 ? sum.revenue / sum.spend : 0;
  sum.arpu = sum.installs > 0 ? sum.revenue / sum.installs : 0;

  return sum;
}

// ── OS Level ──

export function buildOSRows(data: ReportResponse): TableRow[] {
  const rows: TableRow[] = [];

  const slices: { name: string; key: "all" | "android" | "ios" }[] = [
    { name: "All Platforms", key: "all" },
    { name: "Android", key: "android" },
    { name: "iOS", key: "ios" },
  ];

  for (const slice of slices) {
    const af = data.aggregate[slice.key].af;
    rows.push({
      name: slice.name,
      ...metricsFromAF(af),
      clickable: true,
    });
  }

  return rows;
}

// ── Campaign Level ──

function getOSSlice(day: DayData, os: string): { af: AFMetrics } {
  if (os === "android") return day.android;
  if (os === "ios") return day.ios;
  return day.all;
}

export function buildCampaignRows(data: ReportResponse, os: string): TableRow[] {
  // Build per-campaign aggregation from days
  const campaignMap = new Map<string, { af: AFMetrics }[]>();

  for (const day of data.days) {
    for (const [campaignName, campaignData] of Object.entries(day.campaigns)) {
      const slice = os === "android" ? campaignData.android
        : os === "ios" ? campaignData.ios
        : campaignData.all;
      if (!campaignMap.has(campaignName)) {
        campaignMap.set(campaignName, []);
      }
      campaignMap.get(campaignName)!.push(slice);
    }
  }

  const rows: TableRow[] = [];
  for (const [name, daySlices] of campaignMap.entries()) {
    const summed = sumAFMetrics(daySlices);
    rows.push({
      name,
      ...metricsFromAF(summed),
      clickable: true,
    });
  }

  // Sort by spend descending
  rows.sort((a, b) => b.spend - a.spend);
  return rows;
}

// ── Date Level ──

function weekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `Wk ${months[monday.getMonth()]} ${monday.getDate()}`;
}

function weekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
}

function monthLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export interface DateTableRow extends TableRow {
  date: string; // raw date for chart data
}

export function buildDateRows(
  data: ReportResponse,
  _os: string,
  campaign: string,
  granularity: Granularity
): DateTableRow[] {
  // Extract per-day data for the campaign
  const dailyData: { date: string; af: AFMetrics }[] = [];

  for (const day of data.days) {
    const campaignData = day.campaigns[campaign];
    if (campaignData?.all) {
      dailyData.push({ date: day.date, af: campaignData.all.af });
    }
  }

  if (granularity === "daily") {
    return dailyData.map((d) => ({
      name: d.date,
      date: d.date,
      ...metricsFromAF(d.af),
      clickable: false,
    }));
  }

  // Group by week or month
  const keyFn = granularity === "weekly" ? weekKey : monthKey;
  const labelFn = granularity === "weekly" ? weekLabel : monthLabel;

  const groups = new Map<string, { label: string; items: { af: AFMetrics }[] }>();

  for (const d of dailyData) {
    const k = keyFn(d.date);
    if (!groups.has(k)) {
      groups.set(k, { label: labelFn(d.date), items: [] });
    }
    groups.get(k)!.items.push(d);
  }

  const rows: DateTableRow[] = [];
  for (const [key, group] of groups.entries()) {
    const summed = sumAFMetrics(group.items);
    rows.push({
      name: group.label,
      date: key,
      ...metricsFromAF(summed),
      clickable: false,
    });
  }

  return rows;
}

// ── Chart data helper ──

export interface ChartPoint {
  date: string;
  spend: number;
  installs: number;
}

export function buildChartData(data: ReportResponse, os: string, campaign?: string): ChartPoint[] {
  return data.days.map((day) => {
    if (campaign) {
      const cd = day.campaigns[campaign]?.all;
      return {
        date: day.date,
        spend: cd?.af.spend ?? 0,
        installs: cd?.af.installs ?? 0,
      };
    }

    const slice = getOSSlice(day, os);
    return {
      date: day.date,
      spend: slice.af.spend,
      installs: slice.af.installs,
    };
  });
}
