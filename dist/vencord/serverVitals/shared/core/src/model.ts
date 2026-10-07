export type Freshness = "LIVE" | "CACHED" | "PARTIAL" | "UNKNOWN";
export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type Category =
  "Active" | "Quiet" | "Inactive" | "Very Inactive" | "Dormant" | "Unknown";
export interface Size {
  value: number | null;
  accuracy: "exact" | "approximate" | "unavailable";
  cached?: boolean;
}
export interface Evidence {
  scanned?: number;
  expected: number;
  inspected: number;
  missing: number;
  threads: number;
  forums: number;
  threadCoverage: "loaded-only" | "complete";
  issues: string[];
}
export interface Observation {
  guildId: string;
  name: string;
  icon: string | null;
  size: Size;
  newestMessageId: string | null;
  sourceChannelId: string | null;
  lastVisibleActivity: number | null;
  lastScanned: number;
  evidence: Evidence;
}
export interface Record extends Observation {
  freshness: Freshness;
  confidence: Confidence;
  confidenceScore: number;
  category: Category;
  keep: boolean;
  observedConfidence: Confidence;
}
export interface Snapshot {
  at: number;
  durationMs: number;
  records: Record[];
}
export interface Settings {
  schemaVersion: 1;
  thresholds: [number, number, number, number];
  autoRefresh: number;
  debug: boolean;
  hideKeep: boolean;
  showSize: boolean;
}
export interface Cache {
  schemaVersion: 1;
  current: Snapshot | null;
  previous: Snapshot | null;
  keeps: string[];
}
export type ChangeKind =
  | "new"
  | "removed"
  | "activity"
  | "category"
  | "threshold"
  | "freshness"
  | "confidence"
  | "known"
  | "unavailable"
  | "size";
export interface Change {
  kind: ChangeKind;
  guildId: string;
  name: string;
  label: string;
}
