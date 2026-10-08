import type {
  Cache,
  Category,
  Change,
  Confidence,
  Evidence,
  Observation,
  Record as GuildRecord,
  Settings,
  Size,
  Snapshot,
} from "./model";
export type * from "./model";
export const VERSION = "0.1.0-alpha.6";
export const DAY = 86_400_000;
export const EPOCH = 1420070400000;
export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  thresholds: [7, 30, 180, 365],
  debug: false,
  hideKeep: false,
  showSize: true,
};
export const emptyCache = (): Cache => ({
  schemaVersion: 1,
  current: null,
  previous: null,
  keeps: [],
});

export function snowflakeTimestamp(
  id: unknown,
  now = Date.now(),
): number | null {
  if (typeof id !== "string" || !/^[1-9]\d{0,19}$/.test(id)) return null;
  try {
    const value = BigInt(id);
    if (value > (1n << 64n) - 1n) return null;
    const timestamp = Number((value >> 22n) + BigInt(EPOCH));
    return timestamp >= EPOCH && timestamp <= now ? timestamp : null;
  } catch {
    return null;
  }
}
export function newestActivity(
  ids: unknown[],
  now = Date.now(),
): { id: string; timestamp: number } | null {
  let best: { id: string; timestamp: number } | null = null;
  for (const id of ids) {
    const timestamp = snowflakeTimestamp(id, now);
    if (timestamp !== null && (!best || BigInt(id as string) > BigInt(best.id)))
      best = { id: id as string, timestamp };
  }
  return best;
}
export function daysSince(
  timestamp: number | null,
  now = Date.now(),
): number | null {
  return timestamp === null ? null : Math.max(0, (now - timestamp) / DAY);
}
export function category(
  timestamp: number | null,
  now = Date.now(),
  thresholds = DEFAULT_SETTINGS.thresholds,
): Category {
  const days = daysSince(timestamp, now);
  if (days === null) return "Unknown";
  return days < thresholds[0]
    ? "Active"
    : days < thresholds[1]
      ? "Quiet"
      : days < thresholds[2]
        ? "Inactive"
        : days <= thresholds[3]
          ? "Very Inactive"
          : "Dormant";
}
export function relativeTime(
  timestamp: number | null,
  now = Date.now(),
): string {
  if (timestamp === null) return "Unknown";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  const days = Math.floor(seconds / 86400);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
export function normalizeSize(
  value: unknown,
  accuracy: Size["accuracy"],
): Size {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    accuracy !== "unavailable"
    ? { value, accuracy }
    : { value: null, accuracy: "unavailable" };
}
export function formatSize(size: Size): string {
  if (size.value === null) return "Unavailable";
  if (size.accuracy === "exact")
    return `${size.value.toLocaleString("en-US")} members`;
  return `~${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(size.value)} members`;
}
export function confidence(
  evidence: Evidence,
  known: boolean,
  cached: boolean,
  previous: Confidence = "UNKNOWN",
): { level: Confidence; score: number } {
  if (!known) return { level: "UNKNOWN", score: 0 };
  if (cached)
    return {
      level: previous === "HIGH" || previous === "MEDIUM" ? "MEDIUM" : "LOW",
      score: previous === "HIGH" || previous === "MEDIUM" ? 60 : 25,
    };
  const ratio =
    evidence.expected > 0 ? evidence.inspected / evidence.expected : 0;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(100 * ratio) -
        (evidence.threadCoverage === "loaded-only" ? 20 : 0) -
        (evidence.issues.length ? 20 : 0),
    ),
  );
  return {
    level: score >= 90 ? "HIGH" : score >= 60 ? "MEDIUM" : "LOW",
    score,
  };
}
export function mergeObservation(
  observation: Observation,
  previous: GuildRecord | undefined,
  keep: boolean,
  settings = DEFAULT_SETTINGS,
): GuildRecord {
  const retained =
    previous?.lastVisibleActivity !== null &&
    previous?.lastVisibleActivity !== undefined &&
    (observation.lastVisibleActivity === null ||
      previous.lastVisibleActivity > observation.lastVisibleActivity);
  const lastVisibleActivity = retained
    ? previous!.lastVisibleActivity
    : observation.lastVisibleActivity;
  const freshness =
    lastVisibleActivity === null
      ? "UNKNOWN"
      : retained
        ? "CACHED"
        : observation.evidence.missing > 0 ||
            observation.evidence.threadCoverage !== "complete" ||
            observation.evidence.issues.length > 0
          ? "PARTIAL"
          : "LIVE";
  const rating = confidence(
    observation.evidence,
    lastVisibleActivity !== null,
    !!retained,
    previous?.observedConfidence,
  );
  return {
    ...observation,
    lastVisibleActivity,
    newestMessageId: retained
      ? previous!.newestMessageId
      : observation.newestMessageId,
    sourceChannelId: retained
      ? previous!.sourceChannelId
      : observation.sourceChannelId,
    size:
      observation.size.value === null && previous
        ? { ...previous.size, cached: true }
        : { ...observation.size, cached: false },
    freshness,
    confidence: rating.level,
    confidenceScore: rating.score,
    observedConfidence: retained ? previous!.observedConfidence : rating.level,
    category: category(
      lastVisibleActivity,
      observation.lastScanned,
      settings.thresholds,
    ),
    keep,
  };
}
export function migrateSettings(raw: unknown): Settings {
  const input =
    raw && typeof raw === "object" ? (raw as Partial<Settings>) : {};
  const t = input.thresholds;
  const valid =
    Array.isArray(t) &&
    t.length === 4 &&
    t.every(
      (x, i) =>
        Number.isFinite(x) && x >= 1 && x <= 36500 && (i === 0 || x > t[i - 1]),
    );
  return {
    schemaVersion: 1,
    thresholds: valid
      ? ([...t] as Settings["thresholds"])
      : [...DEFAULT_SETTINGS.thresholds],
    debug: input.debug === true,
    hideKeep: input.hideKeep === true,
    showSize: input.showSize !== false,
  };
}
export function compareScans(
  previous: Snapshot | null,
  current: Snapshot | null,
  settings = DEFAULT_SETTINGS,
): Change[] {
  if (!previous || !current) return [];
  const old = new Map(previous.records.map((r) => [r.guildId, r]));
  const changes: Change[] = [];
  const rank: Confidence[] = ["UNKNOWN", "LOW", "MEDIUM", "HIGH"];
  for (const r of current.records) {
    const p = old.get(r.guildId);
    const add = (kind: Change["kind"], label: string) =>
      changes.push({ kind, label, guildId: r.guildId, name: r.name });
    if (!p) {
      add("new", "New server detected");
      continue;
    }
    old.delete(r.guildId);
    const before = category(
      p.lastVisibleActivity,
      previous.at,
      settings.thresholds,
    );
    const after = category(
      r.lastVisibleActivity,
      current.at,
      settings.thresholds,
    );
    if (p.lastVisibleActivity === null && r.lastVisibleActivity !== null)
      add("known", "Unknown activity became known");
    if (p.lastVisibleActivity !== null && r.lastVisibleActivity === null)
      add("unavailable", "Known activity became unavailable");
    if (
      p.lastVisibleActivity !== null &&
      r.lastVisibleActivity !== null &&
      r.lastVisibleActivity > p.lastVisibleActivity
    )
      add("activity", "New visible activity detected");
    if (before !== after) add("category", `Moved from ${before} to ${after}`);
    if (before !== "Unknown" && after !== "Unknown") {
      for (const threshold of [7, 30, 90, 180, 365]) {
        if (
          daysSince(p.lastVisibleActivity, previous.at)! < threshold &&
          daysSince(r.lastVisibleActivity, current.at)! >= threshold
        )
          add("threshold", `Crossed ${threshold} days of inactivity`);
      }
    }
    if (p.freshness !== r.freshness)
      add("freshness", `Data changed from ${p.freshness} to ${r.freshness}`);
    if (p.confidence !== r.confidence)
      add(
        "confidence",
        `Activity confidence ${rank.indexOf(r.confidence) > rank.indexOf(p.confidence) ? "improved" : "worsened"}`,
      );
    if (
      !p.size.cached &&
      !r.size.cached &&
      p.size.value !== null &&
      r.size.value !== null &&
      p.size.accuracy === r.size.accuracy &&
      Math.abs(r.size.value - p.size.value) >=
        Math.max(10, p.size.value * (r.size.accuracy === "exact" ? 0.05 : 0.1))
    )
      add("size", "Server size meaningfully changed");
  }
  for (const p of old.values())
    changes.push({
      kind: "removed",
      label: "Server no longer present",
      guildId: p.guildId,
      name: p.name,
    });
  return changes;
}
export const SORTS = {
  oldest: "Oldest Activity First",
  newest: "Newest Activity First",
  az: "Server Name A to Z",
  za: "Server Name Z to A",
  largest: "Largest Server First",
  smallest: "Smallest Server First",
  confidence: "Lowest Confidence First",
};
export const FILTERS = [
  "All",
  "Active Today",
  "Active This Week",
  "Inactive 7+ Days",
  "Inactive 30+ Days",
  "Inactive 90+ Days",
  "Inactive 6+ Months",
  "Inactive 1+ Year",
  "Unknown",
  "Freshness: LIVE",
  "Freshness: CACHED",
  "Freshness: PARTIAL",
  "Confidence: HIGH",
  "Confidence: MEDIUM",
  "Confidence: LOW",
  "Keep",
];
export function selectRecords(
  records: GuildRecord[],
  options: {
    search?: string;
    filters?: string[];
    sort?: keyof typeof SORTS;
    hideKeep?: boolean;
    ids?: string[];
  } = {},
  now = Date.now(),
): GuildRecord[] {
  const rank: Confidence[] = ["UNKNOWN", "LOW", "MEDIUM", "HIGH"];
  const result = records.filter((r) => {
    if (
      (options.hideKeep && r.keep) ||
      (options.ids && !options.ids.includes(r.guildId)) ||
      !r.name
        .toLowerCase()
        .includes((options.search ?? "").trim().toLowerCase())
    )
      return false;
    const days = daysSince(r.lastVisibleActivity, now);
    return (options.filters ?? []).every((f) => {
      if (f === "All") return true;
      if (f === "Keep") return r.keep;
      if (f === "Unknown") return days === null;
      if (f.startsWith("Freshness: ")) return r.freshness === f.slice(11);
      if (f.startsWith("Confidence: ")) return r.confidence === f.slice(12);
      if (days === null) return false;
      if (f === "Active Today") return days < 1;
      if (f === "Active This Week") return days < 7;
      const threshold = f.includes("6+ Months")
        ? 180
        : f.includes("1+ Year")
          ? 365
          : Number(f.match(/\d+/)?.[0]);
      return Number.isFinite(threshold) && days >= threshold;
    });
  });
  return result.sort((a, b) => {
    let delta = 0;
    const sort = options.sort ?? "oldest";
    if (sort === "az" || sort === "za")
      delta = a.name.localeCompare(b.name) * (sort === "za" ? -1 : 1);
    else if (sort === "confidence")
      delta = rank.indexOf(a.confidence) - rank.indexOf(b.confidence);
    else {
      const size = sort === "largest" || sort === "smallest";
      const x = size ? a.size.value : a.lastVisibleActivity;
      const y = size ? b.size.value : b.lastVisibleActivity;
      if (x === null || y === null) delta = x === y ? 0 : x === null ? 1 : -1;
      else delta = (x - y) * (sort === "newest" || sort === "largest" ? -1 : 1);
    }
    return (
      delta ||
      a.name.localeCompare(b.name) ||
      a.guildId.localeCompare(b.guildId)
    );
  });
}
export function statistics(records: GuildRecord[], now = Date.now()) {
  const days = records
    .map((r) => daysSince(r.lastVisibleActivity, now))
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  const count = (predicate: (r: GuildRecord) => boolean) =>
    records.filter(predicate).length;
  return {
    "Total Servers": records.length,
    "Active Today": days.filter((d) => d < 1).length,
    "Active This Week": days.filter((d) => d < 7).length,
    "Inactive 7+ Days": days.filter((d) => d >= 7).length,
    "Inactive 30+ Days": days.filter((d) => d >= 30).length,
    "Inactive 90+ Days": days.filter((d) => d >= 90).length,
    "Inactive 6+ Months": days.filter((d) => d >= 180).length,
    "Dormant 1+ Year": days.filter((d) => d > 365).length,
    "Unknown Activity": records.length - days.length,
    "Keep Servers": count((r) => r.keep),
    "Cached Results": count((r) => r.freshness === "CACHED"),
    "Partial Results": count((r) => r.freshness === "PARTIAL"),
    "Visible Channels Scanned": records.reduce(
      (sum, r) => sum + (r.evidence.scanned ?? r.evidence.inspected),
      0,
    ),
    "Average Days Since Activity": days.length
      ? Math.round(days.reduce((a, b) => a + b, 0) / days.length)
      : null,
    "Median Days Since Activity": days.length
      ? Math.round(
          (days[Math.floor((days.length - 1) / 2)] +
            days[Math.floor(days.length / 2)]) /
            2,
        )
      : null,
  };
}
export function exportRows(records: GuildRecord[], now = Date.now()) {
  return records.map((r) => ({
    "Server Name": r.name,
    "Guild ID": r.guildId,
    "Server Size": r.size.value,
    "Server Size Accuracy": r.size.accuracy,
    "Last Visible Activity":
      r.lastVisibleActivity === null
        ? null
        : new Date(r.lastVisibleActivity).toISOString(),
    "Last Scanned": new Date(r.lastScanned).toISOString(),
    "Days Since Activity": daysSince(r.lastVisibleActivity, now),
    Status: r.category,
    "Data Freshness": r.freshness,
    "Activity Confidence": r.confidence,
    "Visible Channels Scanned": r.evidence.inspected,
    Keep: r.keep,
  }));
}
export function exportJSON(records: GuildRecord[], now = Date.now()): string {
  return JSON.stringify(
    {
      version: VERSION,
      exportedAt: new Date(now).toISOString(),
      servers: exportRows(records, now),
    },
    null,
    2,
  );
}
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function exportCSV(records: GuildRecord[], now = Date.now()): string {
  const rows = exportRows(records, now);
  const headers = [
    "Server Name",
    "Guild ID",
    "Server Size",
    "Server Size Accuracy",
    "Last Visible Activity",
    "Last Scanned",
    "Days Since Activity",
    "Status",
    "Data Freshness",
    "Activity Confidence",
    "Visible Channels Scanned",
    "Keep",
  ];
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => Object.values(row).map(csvCell).join(",")),
  ].join("\r\n");
}
