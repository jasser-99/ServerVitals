import {
  EPOCH,
  emptyCache,
  mergeObservation,
  normalizeSize,
  snowflakeTimestamp,
} from "./index";
import type {
  Cache,
  Confidence,
  Record as GuildRecord,
  Snapshot,
} from "./model";

export function readCache(raw: unknown, now = Date.now()): Cache {
  const count = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? value
      : 0;
  if (
    !raw ||
    typeof raw !== "object" ||
    !("schemaVersion" in raw) ||
    raw.schemaVersion !== 1
  )
    return emptyCache();
  const input = raw as Partial<Cache>;
  const keeps = Array.isArray(input.keeps)
    ? [
        ...new Set(
          input.keeps.filter(
            (id) => typeof id === "string" && /^\d+$/.test(id),
          ),
        ),
      ]
    : [];
  function snapshot(value: unknown): Snapshot | null {
    if (!value || typeof value !== "object") return null;
    const s = value as Partial<Snapshot>;
    if (
      !Array.isArray(s.records) ||
      typeof s.at !== "number" ||
      !Number.isFinite(s.at) ||
      s.at < EPOCH ||
      s.at > now
    )
      return null;
    const records: GuildRecord[] = [];
    const ids = new Set<string>();
    for (const candidate of s.records) {
      if (!candidate || typeof candidate !== "object") continue;
      const r = candidate as GuildRecord;
      if (
        typeof r.guildId !== "string" ||
        !/^\d+$/.test(r.guildId) ||
        typeof r.name !== "string" ||
        ids.has(r.guildId)
      )
        continue;
      if (
        typeof r.lastScanned !== "number" ||
        !Number.isFinite(r.lastScanned) ||
        r.lastScanned < EPOCH ||
        r.lastScanned > now
      )
        continue;
      ids.add(r.guildId);
      const timestamp = snowflakeTimestamp(r.newestMessageId, now);
      const rating: Confidence = ["HIGH", "MEDIUM", "LOW"].includes(
        r.observedConfidence,
      )
        ? r.observedConfidence
        : "LOW";
      const record = mergeObservation(
        {
          guildId: r.guildId,
          name: r.name,
          icon: null,
          size: normalizeSize(
            r.size?.value,
            r.size?.accuracy === "exact" ? "exact" : "approximate",
          ),
          newestMessageId: timestamp !== null ? r.newestMessageId : null,
          sourceChannelId:
            typeof r.sourceChannelId === "string" &&
            /^\d+$/.test(r.sourceChannelId)
              ? r.sourceChannelId
              : null,
          lastVisibleActivity: timestamp,
          lastScanned: r.lastScanned,
          evidence: {
            scanned: count(r.evidence?.scanned ?? r.evidence?.inspected),
            expected: count(r.evidence?.expected),
            inspected: count(r.evidence?.inspected),
            missing: count(r.evidence?.missing),
            threads: count(r.evidence?.threads),
            forums: count(r.evidence?.forums),
            threadCoverage: "loaded-only",
            issues: ["Restored from local cache"],
          },
        },
        undefined,
        keeps.includes(r.guildId),
      );
      record.observedConfidence = rating;
      record.size.cached = r.size?.cached === true;
      record.freshness =
        timestamp === null
          ? "UNKNOWN"
          : ["LIVE", "PARTIAL", "CACHED"].includes(r.freshness)
            ? r.freshness
            : "CACHED";
      record.confidence =
        timestamp === null
          ? "UNKNOWN"
          : ["HIGH", "MEDIUM", "LOW"].includes(r.confidence)
            ? r.confidence
            : "LOW";
      record.confidenceScore = Math.max(
        0,
        Math.min(100, Number(r.confidenceScore) || 0),
      );
      records.push(record);
    }
    return {
      at: s.at,
      durationMs:
        typeof s.durationMs === "number" && Number.isFinite(s.durationMs)
          ? Math.max(0, s.durationMs)
          : 0,
      records,
    };
  }
  return {
    schemaVersion: 1,
    keeps,
    current: snapshot(input.current),
    previous: snapshot(input.previous),
  };
}
