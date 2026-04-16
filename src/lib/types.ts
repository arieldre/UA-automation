// ── Filter State ──
export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;
  preset: "7d" | "14d" | "30d" | "thisMonth" | "lastMonth" | "custom";
}

export interface FilterState {
  dateRange: DateRange;
  games: string[]; // app names, empty = all
  os: ("android" | "ios")[];
  mediaSources: string[];
  geos: string[];
  campaignSearch: string;
}

// ── API Response types (matching existing /api/report) ──
export interface ReportMetrics {
  spend: number;
  clicks: number;
  impressions: number;
  cpm: number;
  conversions: number;
  cpa: number;
  ctr: number;
  cvr: number;
  purchases?: number;
  purchaseRevenue?: number;
}

export interface AFMetrics {
  installs: number;
  clicks: number;
  impressions: number;
  /** The API returns this field as "spend" (not "cost"). */
  spend: number;
  revenue: number;
  ecpi: number;
  cpm: number;
  ctr: number;
  cvr: number;
  roas: number;
  arpu: number;
}

export interface AFChannelMetrics {
  mediaSource: string;
  installs: number;
  clicks: number;
  impressions: number;
  cost: number;
  revenue: number;
  ecpi: number;
  ipm: number;
  roas: number;
}

export interface DayData {
  date: string;
  all: { ga: ReportMetrics; af: AFMetrics };
  android: { ga: ReportMetrics; af: AFMetrics };
  ios: { ga: ReportMetrics; af: AFMetrics };
  campaigns: Record<string, {
    all: { ga: ReportMetrics; af: AFMetrics };
    android: { ga: ReportMetrics; af: AFMetrics };
    ios: { ga: ReportMetrics; af: AFMetrics };
  }>;
  byMediaSource?: {
    android: Record<string, AFChannelMetrics>;
    ios: Record<string, AFChannelMetrics>;
  };
}

export interface ReportResponse {
  from: string;
  to: string;
  campaignNames: string[];
  aggregate: {
    all: { ga: ReportMetrics; af: AFMetrics };
    android: { ga: ReportMetrics; af: AFMetrics };
    ios: { ga: ReportMetrics; af: AFMetrics };
  };
  days: DayData[];
  _fromDB: boolean;
  byMediaSource?: {
    android: Record<string, AFChannelMetrics>;
    ios: Record<string, AFChannelMetrics>;
  };
  gaps?: string[];
}

// ── Facebook API types ──
export interface FBCampaign {
  name: string;
  spend: number;
  clicks: number;
  impressions: number;
  installs: number;
  purchases: number;
  purchaseRev: number;
  cpm: number;
  cpc: number;
  ctr: number;
  ecpi: number;
}

export interface FBAccountData {
  campaigns: FBCampaign[];
  total: FBCampaign;
  error?: string;
}

export interface FacebookResponse {
  titan: FBAccountData;
  hitzone: FBAccountData;
}

// ── Networks API types ──
export interface NetworkRow {
  network: string;
  label: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
  cpm: number;
  cpc: number;
}

export interface NetworksCampaign {
  campaignId: string;
  campaignName: string;
  networks: NetworkRow[];
  total: NetworkRow;
  afChannelRows?: Record<string, { installs: number; cost: number; revenue: number }>;
}

export interface NetworksResponse {
  from: string;
  to: string;
  campaigns: NetworksCampaign[];
}

// ── Tree Table types ──
export type DrillLevel = "app" | "os" | "mediaSource" | "campaign" | "geo" | "creative" | "source";

export interface TreeNode {
  level: DrillLevel;
  name: string;
  icon?: string;
  metrics: {
    spend: number;
    installs: number;
    ecpi: number;
    ipm: number;
    arpuD0?: number;
    arpuD7?: number;
    arpuD30?: number;
    roasD0?: number;
    roasD1?: number;
    roasD2?: number;
    roasD7?: number;
    roasD14?: number;
    roasD21?: number;
    roasD30?: number;
    roasD45?: number;
    roasD60?: number;
  };
  children: TreeNode[];
}

// ── Tab Table types ──
export type TabLevel = "app" | "os" | "mediaSource" | "campaign";

export interface DrillPath {
  app?: string;
  os?: string;
  mediaSource?: string;
  campaign?: string;
}

export interface TabRow {
  name: string;
  icon?: string;
  spend: number;
  installs: number;
  revenue: number;
  ecpi: number;
  ipm: number;
  arpuD0?: number;
  arpuD7?: number;
  arpuD30?: number;
  roasD0?: number;
  roasD7?: number;
  roasD14?: number;
  roasD30?: number;
}

// ── KPI types ──
export interface KPIData {
  totalSpend: number;
  totalInstalls: number;
  blendedROAS: number;
  avgD7ARPU: number;
  avgIPM: number;
  ecpi: number;
}

// ── Granularity ──
export type Granularity = "daily" | "weekly" | "monthly";

// ── Chart metric options ──
export type ChartMetric =
  | "spend"
  | "installs"
  | "revenue"
  | "ecpi"
  | "ipm"
  | "arpuD0"
  | "arpuD7"
  | "arpuD30"
  | "roasD0"
  | "roasD7"
  | "roasD30"
  | "cvr"
  | "ctr";
