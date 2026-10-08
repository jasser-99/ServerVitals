/**
 * @name ServerVitals
 * @author ServerVitals contributors
 * @version 0.1.0-alpha.3
 * @description Find the servers that have gone quiet. Independent alpha. Initial implementation 100% AI generated.
 * @license GPL-3.0-or-later
 */
"use strict";

// packages/core/src/index.ts
var VERSION = "0.1.0-alpha.3";
var DAY = 864e5;
var EPOCH = 14200704e5;
var DEFAULT_SETTINGS = {
  schemaVersion: 1,
  thresholds: [7, 30, 180, 365],
  debug: false,
  hideKeep: false,
  showSize: true
};
var emptyCache = () => ({
  schemaVersion: 1,
  current: null,
  previous: null,
  keeps: []
});
function snowflakeTimestamp(id, now = Date.now()) {
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
function newestActivity(ids, now = Date.now()) {
  let best = null;
  for (const id of ids) {
    const timestamp = snowflakeTimestamp(id, now);
    if (timestamp !== null && (!best || BigInt(id) > BigInt(best.id)))
      best = { id, timestamp };
  }
  return best;
}
function daysSince(timestamp, now = Date.now()) {
  return timestamp === null ? null : Math.max(0, (now - timestamp) / DAY);
}
function category(timestamp, now = Date.now(), thresholds = DEFAULT_SETTINGS.thresholds) {
  const days = daysSince(timestamp, now);
  if (days === null) return "Unknown";
  return days < thresholds[0] ? "Active" : days < thresholds[1] ? "Quiet" : days < thresholds[2] ? "Inactive" : days <= thresholds[3] ? "Very Inactive" : "Dormant";
}
function relativeTime(timestamp, now = Date.now()) {
  if (timestamp === null) return "Unknown";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1e3));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  const days = Math.floor(seconds / 86400);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
function normalizeSize(value, accuracy) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && accuracy !== "unavailable" ? { value, accuracy } : { value: null, accuracy: "unavailable" };
}
function formatSize(size) {
  if (size.value === null) return "Unavailable";
  if (size.accuracy === "exact")
    return `${size.value.toLocaleString("en-US")} members`;
  return `~${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(size.value)} members`;
}
function confidence(evidence, known, cached, previous = "UNKNOWN") {
  if (!known) return { level: "UNKNOWN", score: 0 };
  if (cached)
    return {
      level: previous === "HIGH" || previous === "MEDIUM" ? "MEDIUM" : "LOW",
      score: previous === "HIGH" || previous === "MEDIUM" ? 60 : 25
    };
  const ratio = evidence.expected > 0 ? evidence.inspected / evidence.expected : 0;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(100 * ratio) - (evidence.threadCoverage === "loaded-only" ? 20 : 0) - (evidence.issues.length ? 20 : 0)
    )
  );
  return {
    level: score >= 90 ? "HIGH" : score >= 60 ? "MEDIUM" : "LOW",
    score
  };
}
function mergeObservation(observation, previous, keep, settings = DEFAULT_SETTINGS) {
  const retained = previous?.lastVisibleActivity !== null && previous?.lastVisibleActivity !== void 0 && (observation.lastVisibleActivity === null || previous.lastVisibleActivity > observation.lastVisibleActivity);
  const lastVisibleActivity = retained ? previous.lastVisibleActivity : observation.lastVisibleActivity;
  const freshness = lastVisibleActivity === null ? "UNKNOWN" : retained ? "CACHED" : observation.evidence.missing > 0 || observation.evidence.threadCoverage !== "complete" || observation.evidence.issues.length > 0 ? "PARTIAL" : "LIVE";
  const rating = confidence(
    observation.evidence,
    lastVisibleActivity !== null,
    !!retained,
    previous?.observedConfidence
  );
  return {
    ...observation,
    lastVisibleActivity,
    newestMessageId: retained ? previous.newestMessageId : observation.newestMessageId,
    sourceChannelId: retained ? previous.sourceChannelId : observation.sourceChannelId,
    size: observation.size.value === null && previous ? { ...previous.size, cached: true } : { ...observation.size, cached: false },
    freshness,
    confidence: rating.level,
    confidenceScore: rating.score,
    observedConfidence: retained ? previous.observedConfidence : rating.level,
    category: category(
      lastVisibleActivity,
      observation.lastScanned,
      settings.thresholds
    ),
    keep
  };
}
function migrateSettings(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const t = input.thresholds;
  const valid = Array.isArray(t) && t.length === 4 && t.every(
    (x, i) => Number.isFinite(x) && x >= 1 && x <= 36500 && (i === 0 || x > t[i - 1])
  );
  return {
    schemaVersion: 1,
    thresholds: valid ? [...t] : [...DEFAULT_SETTINGS.thresholds],
    debug: input.debug === true,
    hideKeep: input.hideKeep === true,
    showSize: input.showSize !== false
  };
}
function compareScans(previous, current, settings = DEFAULT_SETTINGS) {
  if (!previous || !current) return [];
  const old = new Map(previous.records.map((r) => [r.guildId, r]));
  const changes = [];
  const rank = ["UNKNOWN", "LOW", "MEDIUM", "HIGH"];
  for (const r of current.records) {
    const p = old.get(r.guildId);
    const add = (kind, label) => changes.push({ kind, label, guildId: r.guildId, name: r.name });
    if (!p) {
      add("new", "New server detected");
      continue;
    }
    old.delete(r.guildId);
    const before = category(
      p.lastVisibleActivity,
      previous.at,
      settings.thresholds
    );
    const after = category(
      r.lastVisibleActivity,
      current.at,
      settings.thresholds
    );
    if (p.lastVisibleActivity === null && r.lastVisibleActivity !== null)
      add("known", "Unknown activity became known");
    if (p.lastVisibleActivity !== null && r.lastVisibleActivity === null)
      add("unavailable", "Known activity became unavailable");
    if (p.lastVisibleActivity !== null && r.lastVisibleActivity !== null && r.lastVisibleActivity > p.lastVisibleActivity)
      add("activity", "New visible activity detected");
    if (before !== after) add("category", `Moved from ${before} to ${after}`);
    if (before !== "Unknown" && after !== "Unknown") {
      for (const threshold of [7, 30, 90, 180, 365]) {
        if (daysSince(p.lastVisibleActivity, previous.at) < threshold && daysSince(r.lastVisibleActivity, current.at) >= threshold)
          add("threshold", `Crossed ${threshold} days of inactivity`);
      }
    }
    if (p.freshness !== r.freshness)
      add("freshness", `Data changed from ${p.freshness} to ${r.freshness}`);
    if (p.confidence !== r.confidence)
      add(
        "confidence",
        `Activity confidence ${rank.indexOf(r.confidence) > rank.indexOf(p.confidence) ? "improved" : "worsened"}`
      );
    if (!p.size.cached && !r.size.cached && p.size.value !== null && r.size.value !== null && p.size.accuracy === r.size.accuracy && Math.abs(r.size.value - p.size.value) >= Math.max(10, p.size.value * (r.size.accuracy === "exact" ? 0.05 : 0.1)))
      add("size", "Server size meaningfully changed");
  }
  for (const p of old.values())
    changes.push({
      kind: "removed",
      label: "Server no longer present",
      guildId: p.guildId,
      name: p.name
    });
  return changes;
}
var SORTS = {
  oldest: "Oldest Activity First",
  newest: "Newest Activity First",
  az: "Server Name A to Z",
  za: "Server Name Z to A",
  largest: "Largest Server First",
  smallest: "Smallest Server First",
  confidence: "Lowest Confidence First"
};
var FILTERS = [
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
  "Keep"
];
function selectRecords(records, options = {}, now = Date.now()) {
  const rank = ["UNKNOWN", "LOW", "MEDIUM", "HIGH"];
  const result = records.filter((r) => {
    if (options.hideKeep && r.keep || options.ids && !options.ids.includes(r.guildId) || !r.name.toLowerCase().includes((options.search ?? "").trim().toLowerCase()))
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
      const threshold = f.includes("6+ Months") ? 180 : f.includes("1+ Year") ? 365 : Number(f.match(/\d+/)?.[0]);
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
    return delta || a.name.localeCompare(b.name) || a.guildId.localeCompare(b.guildId);
  });
}
function statistics(records, now = Date.now()) {
  const days = records.map((r) => daysSince(r.lastVisibleActivity, now)).filter((d) => d !== null).sort((a, b) => a - b);
  const count = (predicate) => records.filter(predicate).length;
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
      0
    ),
    "Average Days Since Activity": days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
    "Median Days Since Activity": days.length ? Math.round(
      (days[Math.floor((days.length - 1) / 2)] + days[Math.floor(days.length / 2)]) / 2
    ) : null
  };
}
function exportRows(records, now = Date.now()) {
  return records.map((r) => ({
    "Server Name": r.name,
    "Guild ID": r.guildId,
    "Server Size": r.size.value,
    "Server Size Accuracy": r.size.accuracy,
    "Last Visible Activity": r.lastVisibleActivity === null ? null : new Date(r.lastVisibleActivity).toISOString(),
    "Last Scanned": new Date(r.lastScanned).toISOString(),
    "Days Since Activity": daysSince(r.lastVisibleActivity, now),
    Status: r.category,
    "Data Freshness": r.freshness,
    "Activity Confidence": r.confidence,
    "Visible Channels Scanned": r.evidence.inspected,
    Keep: r.keep
  }));
}
function exportJSON(records, now = Date.now()) {
  return JSON.stringify(
    {
      version: VERSION,
      exportedAt: new Date(now).toISOString(),
      servers: exportRows(records, now)
    },
    null,
    2
  );
}
function csvCell(value) {
  let text = value === null || value === void 0 ? "" : String(value);
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function exportCSV(records, now = Date.now()) {
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
    "Keep"
  ];
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => Object.values(row).map(csvCell).join(","))
  ].join("\r\n");
}

// packages/core/src/storage.ts
function readCache(raw, now = Date.now()) {
  const count = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  if (!raw || typeof raw !== "object" || !("schemaVersion" in raw) || raw.schemaVersion !== 1)
    return emptyCache();
  const input = raw;
  const keeps = Array.isArray(input.keeps) ? [
    ...new Set(
      input.keeps.filter(
        (id) => typeof id === "string" && /^\d+$/.test(id)
      )
    )
  ] : [];
  function snapshot(value) {
    if (!value || typeof value !== "object") return null;
    const s = value;
    if (!Array.isArray(s.records) || typeof s.at !== "number" || !Number.isFinite(s.at) || s.at < EPOCH || s.at > now)
      return null;
    const records = [];
    const ids = /* @__PURE__ */ new Set();
    for (const candidate of s.records) {
      if (!candidate || typeof candidate !== "object") continue;
      const r = candidate;
      if (typeof r.guildId !== "string" || !/^\d+$/.test(r.guildId) || typeof r.name !== "string" || ids.has(r.guildId))
        continue;
      if (typeof r.lastScanned !== "number" || !Number.isFinite(r.lastScanned) || r.lastScanned < EPOCH || r.lastScanned > now)
        continue;
      ids.add(r.guildId);
      const timestamp = snowflakeTimestamp(r.newestMessageId, now);
      const rating = ["HIGH", "MEDIUM", "LOW"].includes(
        r.observedConfidence
      ) ? r.observedConfidence : "LOW";
      const record = mergeObservation(
        {
          guildId: r.guildId,
          name: r.name,
          icon: null,
          size: normalizeSize(
            r.size?.value,
            r.size?.accuracy === "exact" ? "exact" : "approximate"
          ),
          newestMessageId: timestamp !== null ? r.newestMessageId : null,
          sourceChannelId: typeof r.sourceChannelId === "string" && /^\d+$/.test(r.sourceChannelId) ? r.sourceChannelId : null,
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
            issues: ["Restored from local cache"]
          }
        },
        void 0,
        keeps.includes(r.guildId)
      );
      record.observedConfidence = rating;
      record.size.cached = r.size?.cached === true;
      record.freshness = timestamp === null ? "UNKNOWN" : ["LIVE", "PARTIAL", "CACHED"].includes(r.freshness) ? r.freshness : "CACHED";
      record.confidence = timestamp === null ? "UNKNOWN" : ["HIGH", "MEDIUM", "LOW"].includes(r.confidence) ? r.confidence : "LOW";
      record.confidenceScore = Math.max(
        0,
        Math.min(100, Number(r.confidenceScore) || 0)
      );
      records.push(record);
    }
    return {
      at: s.at,
      durationMs: typeof s.durationMs === "number" && Number.isFinite(s.durationMs) ? Math.max(0, s.durationMs) : 0,
      records
    };
  }
  return {
    schemaVersion: 1,
    keeps,
    current: snapshot(input.current),
    previous: snapshot(input.previous)
  };
}

// packages/discord/src/scanner.ts
var REQUIRED = [
  "GuildStore",
  "ChannelStore",
  "PermissionStore",
  "UserStore"
];
var STORE_NAMES = [
  ...REQUIRED,
  "ReadStateStore",
  "GuildMemberCountStore",
  "ActiveJoinedThreadsStore"
];
var VIEW_CHANNEL = 1n << 10n;
var READ_MESSAGE_HISTORY = 1n << 16n;
var supported = /* @__PURE__ */ new Set([0, 2, 5, 10, 11, 12, 13, 15, 16]);
var threads = /* @__PURE__ */ new Set([10, 11, 12]);
var forums = /* @__PURE__ */ new Set([15, 16]);
function storeStatus(stores) {
  const methods = {
    GuildStore: "getGuilds",
    ChannelStore: "getMutableGuildChannelsForGuild",
    PermissionStore: "can",
    UserStore: "getCurrentUser",
    ReadStateStore: "lastMessageId",
    GuildMemberCountStore: "getMemberCount",
    ActiveJoinedThreadsStore: "getActiveJoinedThreadsForGuild"
  };
  return Object.fromEntries(
    STORE_NAMES.map((name) => {
      try {
        const store = stores[name];
        return [name, typeof store?.[methods[name]] === "function"];
      } catch {
        return [name, false];
      }
    })
  );
}
function assertStores(stores) {
  const status = storeStatus(stores);
  const missing = REQUIRED.filter((name) => !status[name]);
  if (missing.length)
    throw new Error(
      `ServerVitals couldn't locate required Discord stores: ${missing.join(", ")}. Check the ServerVitals repository for updates, then disable and re-enable the plugin.`
    );
}
function accountId(stores) {
  const id = stores.UserStore?.getCurrentUser()?.id;
  if (!id || !/^\d+$/.test(id))
    throw new Error(
      "Discord account metadata is not ready. Re-enable ServerVitals after Discord finishes loading."
    );
  return id;
}
function loadedThreads(raw) {
  if (!raw || typeof raw !== "object") return [];
  const result = [];
  for (const group of Object.values(raw)) {
    if (!group || typeof group !== "object") continue;
    for (const item of Object.values(group)) {
      if (item && typeof item === "object" && "channel" in item) {
        const channel = item.channel;
        if (channel && typeof channel.id === "string" && threads.has(channel.type))
          result.push(channel);
      }
    }
  }
  return result;
}
function serverSize(guild, stores) {
  const direct = normalizeSize(
    guild.memberCount ?? guild.member_count,
    "exact"
  );
  if (direct.value !== null) return direct;
  const approximate = normalizeSize(
    guild.approximateMemberCount ?? guild.approximate_member_count,
    "approximate"
  );
  if (approximate.value !== null) return approximate;
  try {
    return normalizeSize(
      stores.GuildMemberCountStore?.getMemberCount(guild.id),
      "approximate"
    );
  } catch {
    return normalizeSize(null, "unavailable");
  }
}
function scanGuild(guild, stores, now) {
  const evidence = {
    scanned: 0,
    expected: 0,
    inspected: 0,
    missing: 0,
    threads: 0,
    forums: 0,
    threadCoverage: "loaded-only",
    issues: []
  };
  const result = {
    guildId: guild.id,
    name: guild.name,
    icon: guild.icon && /^[a-zA-Z0-9_]+$/.test(guild.icon) ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=64` : null,
    size: serverSize(guild, stores),
    newestMessageId: null,
    sourceChannelId: null,
    lastVisibleActivity: null,
    lastScanned: now,
    evidence
  };
  if (guild.unavailable) {
    evidence.issues.push("Guild temporarily unavailable");
    return result;
  }
  let channels;
  try {
    channels = Object.values(
      stores.ChannelStore.getMutableGuildChannelsForGuild(guild.id)
    );
  } catch {
    evidence.issues.push("Channel enumeration failed");
    return result;
  }
  try {
    if (stores.ActiveJoinedThreadsStore) {
      channels.push(
        ...loadedThreads(
          stores.ActiveJoinedThreadsStore.getActiveJoinedThreadsForGuild(
            guild.id
          )
        )
      );
      channels.push(
        ...loadedThreads(
          stores.ActiveJoinedThreadsStore.getActiveUnjoinedThreadsForGuild?.(
            guild.id
          )
        )
      );
    } else evidence.issues.push("Loaded thread store unavailable");
  } catch {
    evidence.issues.push("Loaded thread enumeration failed");
  }
  const unique = new Map(
    channels.filter((c) => c && typeof c.id === "string").map((c) => [c.id, c])
  );
  for (const c of unique.values()) {
    if ((c.guild_id ?? c.guildId) !== guild.id || c.type === 4) continue;
    let visible = false;
    try {
      visible = stores.PermissionStore.can(VIEW_CHANNEL, c) && stores.PermissionStore.can(READ_MESSAGE_HISTORY, c);
    } catch {
      evidence.issues.push("Permission check failed");
      continue;
    }
    if (!visible) continue;
    evidence.expected++;
    if (!supported.has(c.type)) {
      evidence.missing++;
      continue;
    }
    evidence.scanned++;
    if (threads.has(c.type)) evidence.threads++;
    if (forums.has(c.type)) evidence.forums++;
    let readId;
    try {
      readId = stores.ReadStateStore?.lastMessageId(c.id);
    } catch {
      evidence.issues.push("Read state metadata unavailable");
    }
    const best = forums.has(c.type) ? null : newestActivity([c.lastMessageId, c.last_message_id, readId], now);
    if (best) {
      evidence.inspected++;
      if (!result.newestMessageId || BigInt(best.id) > BigInt(result.newestMessageId)) {
        result.newestMessageId = best.id;
        result.lastVisibleActivity = best.timestamp;
        result.sourceChannelId = c.id;
      }
    } else evidence.missing++;
  }
  evidence.issues = [...new Set(evidence.issues)];
  if (!evidence.expected)
    evidence.issues.push("No readable activity sources currently loaded");
  return result;
}
async function scanAll(stores, cancelled = () => false) {
  assertStores(stores);
  const start = performance.now();
  const guilds = Object.values(stores.GuildStore.getGuilds());
  if (!guilds.every(
    (g) => g && typeof g.id === "string" && /^\d+$/.test(g.id) && typeof g.name === "string"
  ))
    throw new Error(
      "Discord guild metadata changed shape. Previous scan retained."
    );
  const observations = [];
  for (let i = 0; i < guilds.length; i++) {
    if (cancelled()) throw new Error("Scan cancelled");
    observations.push(scanGuild(guilds[i], stores, Date.now()));
    if ((i + 1) % 20 === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (cancelled()) throw new Error("Scan cancelled");
  return {
    observations,
    durationMs: Math.round(performance.now() - start),
    at: Date.now()
  };
}

// packages/discord/src/controller.ts
var Controller = class {
  constructor(discover, storage, settingsChanged) {
    this.discover = discover;
    this.storage = storage;
    this.settingsChanged = settingsChanged;
  }
  cache = emptyCache();
  settings = migrateSettings(null);
  scanning = false;
  leaving = false;
  enabled = false;
  error = null;
  diagnostics = {};
  scanTimes = [];
  listeners = /* @__PURE__ */ new Set();
  generation = 0;
  account = "";
  writeQueue = Promise.resolve();
  revision = 0;
  baseline = null;
  accountListener = () => {
    try {
      if (accountId(this.stores) === this.account) return;
    } catch {
    }
    this.stop();
    this.error = "Discord account changed. Re-enable ServerVitals to load this account's separate cache.";
    this.emit();
  };
  getRevision = () => this.revision;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  stores = {};
  emit() {
    this.revision++;
    for (const listener of this.listeners) listener();
  }
  async start() {
    const generation = ++this.generation;
    this.enabled = true;
    try {
      this.stores = this.discover();
      this.diagnostics = storeStatus(this.stores);
      this.account = accountId(this.stores);
      const [settings, cache] = await Promise.all([
        this.storage.load(`settings:${this.account}`),
        this.storage.load(`cache:${this.account}`)
      ]);
      if (!this.enabled || this.generation !== generation) return;
      this.settings = migrateSettings(settings);
      this.cache = readCache(cache);
      this.baseline = this.cache.current;
      if (this.cache.current)
        this.cache.current = {
          ...this.cache.current,
          records: this.cache.current.records.map((r) => ({
            ...r,
            freshness: r.lastVisibleActivity === null ? "UNKNOWN" : "CACHED",
            confidence: r.lastVisibleActivity === null ? "UNKNOWN" : r.observedConfidence === "HIGH" || r.observedConfidence === "MEDIUM" ? "MEDIUM" : "LOW",
            confidenceScore: r.lastVisibleActivity === null ? 0 : r.observedConfidence === "HIGH" || r.observedConfidence === "MEDIUM" ? 60 : 25,
            size: { ...r.size, cached: r.size.value !== null }
          }))
        };
      this.stores.UserStore?.addChangeListener?.(this.accountListener);
      this.emit();
    } catch {
      if (this.enabled && this.generation === generation) {
        this.error = "ServerVitals could not initialize Discord stores or local storage. Re-enable after Discord finishes loading. Check diagnostics and the ServerVitals repository for updates.";
        this.emit();
      }
    }
  }
  stop() {
    this.enabled = false;
    this.generation++;
    this.scanning = false;
    this.stores.UserStore?.removeChangeListener?.(this.accountListener);
    this.stores = {};
    this.cache = emptyCache();
    this.account = "";
    this.baseline = null;
    this.emit();
    this.listeners.clear();
  }
  async save(kind) {
    const key = `${kind}:${this.account}`;
    const value = JSON.parse(
      JSON.stringify(kind === "cache" ? this.cache : this.settings)
    );
    this.writeQueue = this.writeQueue.catch(() => {
    }).then(() => this.storage.save(key, value));
    try {
      await this.writeQueue;
    } catch {
      this.error = "Local storage could not be saved. Changes may not survive restart.";
      this.emit();
    }
  }
  async updateSettings(partial) {
    if (!this.enabled || !this.account) return;
    this.settings = migrateSettings({ ...this.settings, ...partial });
    this.settingsChanged?.(this.settings);
    this.emit();
    await this.save("settings");
  }
  async toggleKeep(id) {
    if (!this.enabled || !this.account) return;
    const ids = new Set(this.cache.keeps);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    this.cache.keeps = [...ids];
    if (this.cache.current)
      this.cache.current = {
        ...this.cache.current,
        records: this.cache.current.records.map((r) => ({
          ...r,
          keep: ids.has(r.guildId)
        }))
      };
    this.emit();
    await this.save("cache");
  }
  async resetCache() {
    if (!this.enabled || this.leaving) return;
    this.cache = { ...emptyCache(), keeps: this.cache.keeps };
    this.baseline = null;
    this.emit();
    await this.save("cache");
  }
  async leaveSelected(ids, leave) {
    const left = [];
    if (this.leaving)
      return { left, error: "A confirmed leave operation is already running." };
    this.leaving = true;
    const generation = this.generation;
    try {
      if (!this.enabled || this.scanning || accountId(this.stores) !== this.account)
        throw new Error(
          "Leaving is unavailable during a scan or account change."
        );
      const targets = [...new Set(ids)];
      if (!targets.length) throw new Error("Select a server first.");
      const validate = (id) => {
        if (!this.enabled || generation !== this.generation || accountId(this.stores) !== this.account)
          throw new Error(
            "Leaving stopped because the plugin or account changed."
          );
        const guild = this.stores.GuildStore?.getGuilds()[id];
        if (!guild || !this.cache.current?.records.some((r) => r.guildId === id))
          throw new Error(
            "A selected server is no longer available. Check Now and try again."
          );
        if (this.cache.keeps.includes(id))
          throw new Error("Keep servers are protected from leaving.");
        if ((guild.ownerId ?? guild.owner_id) === this.account)
          throw new Error(
            "You own a selected server. Transfer ownership through Discord before leaving."
          );
      };
      for (const id of targets) validate(id);
      for (const id of targets) {
        validate(id);
        await leave(id);
        left.push(id);
        if (!this.enabled || generation !== this.generation) break;
        if (this.cache.current)
          this.cache.current = {
            ...this.cache.current,
            records: this.cache.current.records.filter((r) => r.guildId !== id)
          };
        this.emit();
        await this.save("cache");
        if (id !== targets[targets.length - 1])
          await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      return { left, error: null };
    } catch (error) {
      return {
        left,
        error: error instanceof Error ? error.message : "Leaving failed. No automatic retry was attempted."
      };
    } finally {
      this.leaving = false;
    }
  }
  async refresh() {
    if (!this.enabled || this.scanning || this.leaving) return;
    const generation = this.generation;
    this.scanning = true;
    this.error = null;
    this.emit();
    try {
      if (accountId(this.stores) !== this.account) {
        this.stop();
        this.error = "Discord account changed. Re-enable ServerVitals to load this account's separate cache.";
        return;
      }
      const scan = await scanAll(
        this.stores,
        () => !this.enabled || this.generation !== generation
      );
      if (!this.enabled || this.generation !== generation) return;
      if (accountId(this.stores) !== this.account) {
        this.accountListener();
        return;
      }
      const old = new Map(
        this.cache.current?.records.map((r) => [r.guildId, r]) ?? []
      );
      const current = {
        at: scan.at,
        durationMs: scan.durationMs,
        records: scan.observations.map(
          (o) => mergeObservation(
            o,
            old.get(o.guildId),
            this.cache.keeps.includes(o.guildId),
            this.settings
          )
        )
      };
      this.cache.previous = this.baseline ?? this.cache.current;
      this.baseline = null;
      this.cache.current = current;
      const present = new Set(current.records.map((r) => r.guildId));
      this.cache.keeps = this.cache.keeps.filter((id) => present.has(id));
      this.scanTimes = [...this.scanTimes.slice(-19), scan.durationMs];
      if (this.settings.debug)
        console.info("[ServerVitals]", {
          version: VERSION,
          guilds: current.records.length,
          visibleChannels: current.records.reduce(
            (s, r) => s + (r.evidence.scanned ?? r.evidence.inspected),
            0
          ),
          known: current.records.filter((r) => r.lastVisibleActivity !== null).length,
          unknown: current.records.filter((r) => r.lastVisibleActivity === null).length,
          cached: current.records.filter((r) => r.freshness === "CACHED").length,
          partial: current.records.filter((r) => r.freshness === "PARTIAL").length,
          durationMs: scan.durationMs
        });
      await this.save("cache");
    } catch (error) {
      if (this.enabled && this.generation === generation)
        this.error = error instanceof Error && error.message.startsWith("ServerVitals couldn't locate") ? error.message : "Activity scan failed. Previous results retained. Discord metadata may have changed; check the ServerVitals repository for updates.";
    } finally {
      if (this.generation === generation) {
        this.scanning = false;
        this.emit();
      }
    }
  }
  changes() {
    return compareScans(this.cache.previous, this.cache.current, this.settings);
  }
};

// packages/ui/src/dashboard.tsx
function createDashboard(React, controller, navigation) {
  function download(format) {
    const records = (controller.cache.current?.records ?? []).map((r) => ({
      ...r,
      category: category(
        r.lastVisibleActivity,
        Date.now(),
        controller.settings.thresholds
      )
    }));
    const content = format === "csv" ? exportCSV(records) : exportJSON(records);
    const url = URL.createObjectURL(
      new Blob([content], {
        type: format === "csv" ? "text/csv;charset=utf-8" : "application/json"
      })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ServerVitals-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.${format}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  class Boundary extends React.Component {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    render() {
      return this.state.failed ? /* @__PURE__ */ React.createElement("p", { role: "alert" }, "ServerVitals could not render this view. Close it and check the repository for updates.") : this.props.children;
    }
  }
  function Dashboard() {
    const revision = React.useSyncExternalStore(
      controller.subscribe,
      controller.getRevision,
      controller.getRevision
    );
    const [search, setSearch] = React.useState("");
    const [sort, setSort] = React.useState("oldest");
    const [filters, setFilters] = React.useState([]);
    const [ids, setIds] = React.useState();
    const [page, setPage] = React.useState(0);
    const [tab, setTab] = React.useState("Servers");
    const [notice, setNotice] = React.useState("");
    const [marked, setMarked] = React.useState([]);
    const [confirmLeave, setConfirmLeave] = React.useState(
      null
    );
    const [leaving, setLeaving] = React.useState(false);
    const [thresholds, setThresholds] = React.useState(
      controller.settings.thresholds.join(", ")
    );
    const now = React.useMemo(() => Date.now(), [revision, tab]);
    const snapshot = controller.cache.current;
    const records = React.useMemo(
      () => (snapshot?.records ?? []).map((r) => ({
        ...r,
        category: category(
          r.lastVisibleActivity,
          now,
          controller.settings.thresholds
        )
      })),
      [snapshot, controller.settings.thresholds, now]
    );
    const selected = React.useMemo(
      () => selectRecords(
        records,
        {
          search,
          sort,
          filters,
          hideKeep: controller.settings.hideKeep,
          ids
        },
        now
      ),
      [records, search, sort, filters, ids, now, controller.settings.hideKeep]
    );
    const stats = React.useMemo(() => statistics(records, now), [records, now]);
    const changes = React.useMemo(
      () => controller.changes(),
      [snapshot, controller.cache.previous, controller.settings]
    );
    const groups = React.useMemo(() => {
      const map = /* @__PURE__ */ new Map();
      for (const change of changes)
        map.set(change.label, [...map.get(change.label) ?? [], change]);
      return [...map.entries()];
    }, [changes]);
    React.useEffect(() => {
      setPage(0);
    }, [search, sort, filters, ids, controller.settings.hideKeep]);
    const pages = Math.max(1, Math.ceil(selected.length / 50));
    const currentPage = Math.min(page, pages - 1);
    const date = (value) => value === null ? "Unknown" : new Date(value).toLocaleString();
    const navigate = (guildId, channelId) => {
      if (!navigation.open(guildId, channelId))
        setNotice("Discord navigation is unavailable in this client version.");
    };
    return /* @__PURE__ */ React.createElement("section", { className: "sv-root", "aria-label": "ServerVitals dashboard" }, /* @__PURE__ */ React.createElement("style", null, CSS), /* @__PURE__ */ React.createElement("header", { className: "sv-header" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "sv-eyebrow" }, "LOCAL SERVER OVERVIEW \xB7 ", VERSION), /* @__PURE__ */ React.createElement("h1", null, "ServerVitals"), /* @__PURE__ */ React.createElement("p", null, "Find the servers that have gone quiet.")), /* @__PURE__ */ React.createElement("div", { className: "sv-scan" }, /* @__PURE__ */ React.createElement("strong", null, records.length, " Servers"), /* @__PURE__ */ React.createElement("span", null, "Last Full Scan: ", snapshot ? date(snapshot.at) : "Not scanned"), /* @__PURE__ */ React.createElement(
      "button",
      {
        disabled: !controller.enabled || controller.scanning || leaving,
        onClick: () => {
          void controller.refresh();
        }
      },
      controller.scanning ? "Inspecting metadata\u2026" : "Check Now"
    ))), /* @__PURE__ */ React.createElement("p", { className: "sv-info" }, "Last Visible Activity reflects metadata visible to your account. Missing private channels and unloaded threads limit coverage. Leaving requires your explicit selection and confirmation."), controller.error && /* @__PURE__ */ React.createElement("p", { role: "alert", className: "sv-error" }, controller.error), notice && /* @__PURE__ */ React.createElement("p", { role: "status" }, notice, " ", /* @__PURE__ */ React.createElement("button", { onClick: () => setNotice("") }, "Dismiss")), /* @__PURE__ */ React.createElement("nav", { className: "sv-tabs", "aria-label": "Dashboard sections" }, [
      "Servers",
      "Statistics",
      "What Changed",
      "Diagnostics",
      "Settings",
      "Privacy"
    ].map((t) => /* @__PURE__ */ React.createElement("button", { key: t, "aria-pressed": tab === t, onClick: () => setTab(t) }, t))), tab === "Servers" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "sv-stats" }, [
      "Total Servers",
      "Active Today",
      "Inactive 30+ Days",
      "Inactive 6+ Months",
      "Dormant 1+ Year",
      "Unknown Activity"
    ].map((key) => /* @__PURE__ */ React.createElement("div", { key }, /* @__PURE__ */ React.createElement("strong", null, stats[key]), /* @__PURE__ */ React.createElement("span", null, key)))), /* @__PURE__ */ React.createElement("div", { className: "sv-controls" }, /* @__PURE__ */ React.createElement("label", null, "Search servers", /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "search",
        placeholder: "Search server names\u2026",
        value: search,
        onChange: (e) => setSearch(e.target.value)
      }
    )), /* @__PURE__ */ React.createElement("details", { className: "sv-sort-menu" }, /* @__PURE__ */ React.createElement("summary", { "aria-label": "Sort by" }, "Sort by: ", SORTS[sort]), /* @__PURE__ */ React.createElement("div", { role: "group", "aria-label": "Sort orders" }, Object.entries(SORTS).map(([key, label]) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key,
        "aria-pressed": sort === key,
        onClick: (e) => {
          setSort(key);
          const menu = e.currentTarget.closest("details");
          if (menu) menu.open = false;
        }
      },
      label
    )))), /* @__PURE__ */ React.createElement("button", { onClick: () => download("csv") }, "Export CSV (all)"), /* @__PURE__ */ React.createElement("button", { onClick: () => download("json") }, "Export JSON (all)")), /* @__PURE__ */ React.createElement("details", { className: "sv-filters" }, /* @__PURE__ */ React.createElement("summary", null, "Filters", " ", filters.length ? `(${filters.length} combined with AND)` : "(All)"), /* @__PURE__ */ React.createElement("div", null, FILTERS.filter(
      (f) => f !== "All" && !f.startsWith("Freshness:")
    ).map((f) => /* @__PURE__ */ React.createElement("label", { key: f }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "checkbox",
        checked: filters.includes(f),
        onChange: () => setFilters(
          filters.includes(f) ? filters.filter((x) => x !== f) : [...filters, f]
        )
      }
    ), f))), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setFilters([]);
          setIds(void 0);
        }
      },
      "Clear filters"
    )), ids && /* @__PURE__ */ React.createElement("p", null, "Showing servers from a scan change.", " ", /* @__PURE__ */ React.createElement("button", { onClick: () => setIds(void 0) }, "Show all servers")), /* @__PURE__ */ React.createElement("p", null, selected.length, " matching servers \xB7", " ", controller.settings.hideKeep ? "Keep servers hidden" : "Keep servers included"), /* @__PURE__ */ React.createElement("div", { className: "sv-controls" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        disabled: leaving,
        onClick: () => setMarked(
          selected.filter((r) => !r.keep).map((r) => r.guildId)
        )
      },
      "Select matching servers"
    ), /* @__PURE__ */ React.createElement("button", { disabled: leaving, onClick: () => setMarked([]) }, "Clear selection"), /* @__PURE__ */ React.createElement(
      "button",
      {
        disabled: !navigation.leave || !marked.length || leaving || controller.scanning,
        onClick: () => setConfirmLeave([...marked])
      },
      "Leave selected servers (",
      marked.length,
      ")"
    )), confirmLeave && /* @__PURE__ */ React.createElement(
      "section",
      {
        className: "sv-error",
        "aria-label": "Confirm leaving servers"
      },
      /* @__PURE__ */ React.createElement("h2", null, "Leave ", confirmLeave.length, " selected servers?"),
      /* @__PURE__ */ React.createElement("p", null, "This changes your Discord memberships. You may need a new invitation to rejoin. Keep servers and servers you own are protected. The batch stops at the first error."),
      /* @__PURE__ */ React.createElement("ul", null, confirmLeave.map((id) => /* @__PURE__ */ React.createElement("li", { key: id }, records.find((r) => r.guildId === id)?.name ?? "Unavailable server"))),
      /* @__PURE__ */ React.createElement(
        "button",
        {
          disabled: leaving,
          onClick: () => setConfirmLeave(null)
        },
        "Cancel leaving"
      ),
      " ",
      /* @__PURE__ */ React.createElement(
        "button",
        {
          disabled: leaving || controller.scanning || !navigation.leave,
          onClick: async () => {
            if (!navigation.leave || leaving) return;
            setLeaving(true);
            const result = await controller.leaveSelected(
              confirmLeave,
              navigation.leave
            );
            setMarked(
              (current) => current.filter((id) => !result.left.includes(id))
            );
            setNotice(
              `Left ${result.left.length} server(s). ${result.error ?? "Selected memberships updated."}`
            );
            setLeaving(false);
            setConfirmLeave(null);
          }
        },
        leaving ? "Leaving selected servers\u2026" : `Confirm leave ${confirmLeave.length} servers`
      )
    ), /* @__PURE__ */ React.createElement("div", { className: "sv-table-wrap" }, /* @__PURE__ */ React.createElement("table", null, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, "Select"), /* @__PURE__ */ React.createElement("th", null, "Server"), controller.settings.showSize && /* @__PURE__ */ React.createElement("th", null, "Server Size"), /* @__PURE__ */ React.createElement("th", null, "Last Visible Activity"), /* @__PURE__ */ React.createElement("th", null, "Last Scanned"), /* @__PURE__ */ React.createElement("th", null, "Status"), /* @__PURE__ */ React.createElement("th", null, "Freshness"), /* @__PURE__ */ React.createElement("th", null, "Confidence"), /* @__PURE__ */ React.createElement("th", null, "Channels"), /* @__PURE__ */ React.createElement("th", null, "Keep"), /* @__PURE__ */ React.createElement("th", null, "Actions"))), /* @__PURE__ */ React.createElement("tbody", null, selected.slice(currentPage * 50, (currentPage + 1) * 50).map((r) => /* @__PURE__ */ React.createElement("tr", { key: r.guildId }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "checkbox",
        "aria-label": `Select ${r.name} to leave`,
        disabled: r.keep || leaving,
        checked: marked.includes(r.guildId),
        onChange: (e) => setMarked(
          e.target.checked ? [...marked, r.guildId] : marked.filter((id) => id !== r.guildId)
        )
      }
    )), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "sv-server" }, r.icon ? /* @__PURE__ */ React.createElement(
      "img",
      {
        src: r.icon,
        alt: "",
        loading: "lazy",
        width: 32,
        height: 32
      }
    ) : /* @__PURE__ */ React.createElement("span", { className: "sv-icon", "aria-hidden": "true" }, r.name.slice(0, 1)), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "sv-name",
        onClick: () => navigate(r.guildId)
      },
      r.name
    )), r.sourceChannelId && /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "sv-link",
        onClick: () => navigate(r.guildId, r.sourceChannelId)
      },
      "Open Last Active Channel"
    )), controller.settings.showSize && /* @__PURE__ */ React.createElement(
      "td",
      {
        title: r.size.accuracy === "exact" ? "Explicit member count from loaded guild metadata" : "Approximate count from loaded Discord metadata"
      },
      formatSize(r.size),
      /* @__PURE__ */ React.createElement("small", null, r.size.accuracy, r.size.cached ? " \xB7 cached" : "")
    ), /* @__PURE__ */ React.createElement("td", { title: date(r.lastVisibleActivity) }, relativeTime(r.lastVisibleActivity, now)), /* @__PURE__ */ React.createElement("td", { title: date(r.lastScanned) }, relativeTime(r.lastScanned, now)), /* @__PURE__ */ React.createElement("td", null, r.category), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
      "span",
      {
        className: `sv-badge sv-${r.freshness.toLowerCase()}`,
        title: r.freshness === "CACHED" ? "Retained from an earlier observation; current metadata could not confirm it" : "Current metadata inspected; PARTIAL indicates coverage gaps"
      },
      r.freshness
    )), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "sv-badge",
        title: `Coverage score ${r.confidenceScore}/100. ${r.evidence.inspected}/${r.evidence.expected} loaded sources supplied valid IDs. Threads: ${r.evidence.threadCoverage}. ${r.evidence.issues.join(". ")}`
      },
      r.confidence
    )), /* @__PURE__ */ React.createElement(
      "td",
      {
        title: `${r.evidence.missing} missing; ${r.evidence.threads} loaded threads; ${r.evidence.forums} forums`
      },
      r.evidence.inspected,
      "/",
      r.evidence.expected
    ), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
      "button",
      {
        "aria-label": `Keep ${r.name}`,
        "aria-pressed": r.keep,
        onClick: () => {
          void controller.toggleKeep(r.guildId);
        }
      },
      r.keep ? "\u2605 Keep" : "\u2606 Keep"
    )), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
      "button",
      {
        disabled: r.keep || leaving || controller.scanning || !navigation.leave,
        onClick: () => setConfirmLeave([r.guildId])
      },
      "Leave server"
    ))))))), !selected.length && /* @__PURE__ */ React.createElement("p", { className: "sv-empty" }, snapshot ? "No servers match this view." : "Check Now to inspect currently loaded Discord metadata."), /* @__PURE__ */ React.createElement("div", { className: "sv-controls" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        disabled: currentPage === 0,
        onClick: () => setPage(currentPage - 1)
      },
      "Previous"
    ), /* @__PURE__ */ React.createElement("span", null, "Page ", currentPage + 1, " of ", pages), /* @__PURE__ */ React.createElement(
      "button",
      {
        disabled: currentPage + 1 >= pages,
        onClick: () => setPage(currentPage + 1)
      },
      "Next"
    ))), tab === "Statistics" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h2", null, "Statistics Dashboard"), /* @__PURE__ */ React.createElement("p", null, "Totals cover the full server list, including Keep servers. Inactivity bands overlap. \u201CToday\u201D is a rolling 24 hours; six months means 180 days."), /* @__PURE__ */ React.createElement("div", { className: "sv-stats" }, Object.entries(stats).map(([name, value]) => /* @__PURE__ */ React.createElement("div", { key: name }, /* @__PURE__ */ React.createElement("strong", null, value ?? "\u2014"), /* @__PURE__ */ React.createElement("span", null, name))))), tab === "What Changed" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h2", null, "What Changed Since Last Scan"), /* @__PURE__ */ React.createElement("p", null, controller.cache.previous ? `${date(controller.cache.previous.at)} \u2192 ${date(snapshot?.at ?? null)}` : "Complete two full scans to compare results."), /* @__PURE__ */ React.createElement("p", null, "Changes describe local observations and time thresholds, not proof of server abandonment."), /* @__PURE__ */ React.createElement("ul", { className: "sv-changes" }, groups.map(([label, events]) => /* @__PURE__ */ React.createElement("li", { key: label }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setIds([...new Set(events.map((e) => e.guildId))]);
          setFilters([]);
          setSearch("");
          setTab("Servers");
        }
      },
      events.length,
      " \xB7 ",
      label
    ), /* @__PURE__ */ React.createElement("small", null, events.map((e) => e.name).join(", "))))), controller.cache.previous && !changes.length && /* @__PURE__ */ React.createElement("p", null, "No meaningful changes."), /* @__PURE__ */ React.createElement("p", null, "Removed servers remain named here for this comparison; they cannot be opened from the current list.")), tab === "Diagnostics" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h2", null, "Local diagnostics"), /* @__PURE__ */ React.createElement("dl", null, Object.entries({
      "Guilds discovered": records.length,
      "Guilds scanned": records.length,
      "Visible channels scanned": stats["Visible Channels Scanned"],
      "Thread sources scanned": records.reduce(
        (s, r) => s + r.evidence.threads,
        0
      ),
      "Forum sources scanned": records.reduce(
        (s, r) => s + r.evidence.forums,
        0
      ),
      "Live results": records.filter((r) => r.freshness === "LIVE").length,
      "Cached results": stats["Cached Results"],
      "Partial results": stats["Partial Results"],
      "Unknown results": stats["Unknown Activity"],
      "Latest scan ms": snapshot?.durationMs ?? "\u2014",
      "Average session scan ms": controller.scanTimes.length ? Math.round(
        controller.scanTimes.reduce((a, b) => a + b, 0) / controller.scanTimes.length
      ) : "\u2014",
      "Cache bytes (UTF-8)": new TextEncoder().encode(
        JSON.stringify(controller.cache)
      ).length,
      "Last full scan": date(snapshot?.at ?? null),
      ...Object.fromEntries(
        Object.entries(controller.diagnostics).map(
          ([name, found]) => [name, found ? "Found" : "Unavailable"]
        )
      )
    }).map(([key, value]) => /* @__PURE__ */ React.createElement(React.Fragment, { key }, /* @__PURE__ */ React.createElement("dt", null, key), /* @__PURE__ */ React.createElement("dd", null, value)))), /* @__PURE__ */ React.createElement("p", null, "Only loaded thread coverage is available in this alpha. Modules are discovered once per enable.")), tab === "Settings" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h2", null, "Settings"), /* @__PURE__ */ React.createElement("p", null, "Scans run only when you click Check Now. Opening ServerVitals shows saved results."), /* @__PURE__ */ React.createElement("p", null, "Activity cache:", " ", new TextEncoder().encode(JSON.stringify(controller.cache)).length.toLocaleString(), " ", "bytes (UTF-8 data). Includes at most the current and previous scan; repeated checks replace snapshots rather than append history. Storage containers may add overhead."), [
      ["debug", "Debug Mode (aggregate counts only)"],
      ["showSize", "Show Server Size column"],
      ["hideKeep", "Hide Keep servers from the server view"]
    ].map(([key, label]) => /* @__PURE__ */ React.createElement("label", { className: "sv-setting", key }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "checkbox",
        checked: controller.settings[key],
        onChange: (e) => {
          void controller.updateSettings({ [key]: e.target.checked });
        }
      }
    ), label)), /* @__PURE__ */ React.createElement("label", { className: "sv-setting" }, "Category thresholds in days (four increasing numbers)", /* @__PURE__ */ React.createElement(
      "input",
      {
        value: thresholds,
        onChange: (e) => setThresholds(e.target.value)
      }
    )), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          const values = thresholds.split(",").map((v) => Number(v.trim()));
          if (values.length !== 4 || !values.every(
            (n, i) => Number.isFinite(n) && n >= 1 && n <= 36500 && (i === 0 || n > values[i - 1])
          )) {
            setNotice(
              "Enter four increasing day thresholds, for example 7, 30, 180, 365."
            );
            return;
          }
          void controller.updateSettings({
            thresholds: values
          });
          setNotice(
            "Category thresholds saved. Statistics retain their named day ranges."
          );
        }
      },
      "Save thresholds"
    ), /* @__PURE__ */ React.createElement("details", { className: "sv-reset" }, /* @__PURE__ */ React.createElement("summary", null, "Reset activity cache"), /* @__PURE__ */ React.createElement("p", null, "This clears current and previous observations, preserves Keep, and leaves the cache empty until you click Check Now. Older activity may then be unknown."), /* @__PURE__ */ React.createElement(
      "button",
      {
        disabled: controller.scanning || leaving,
        onClick: () => {
          void controller.resetCache();
        }
      },
      "Clear activity cache"
    ))), tab === "Privacy" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("h2", null, "Privacy & accuracy"), /* @__PURE__ */ React.createElement("p", null, "ServerVitals runs locally. It has no backend, analytics or telemetry. It does not access authentication tokens or read or cache message contents. Normal scanning sends zero network/API requests. Displaying server icons may load them from Discord\u2019s CDN."), /* @__PURE__ */ React.createElement("p", null, "Last Visible Activity is the newest trustworthy message Snowflake found in permitted, loaded channel metadata. Private channels and unloaded/archived threads are outside the observation. LIVE describes a local scan, not a fresh server response."), /* @__PURE__ */ React.createElement("h2", null, "AI Development Disclosure"), /* @__PURE__ */ React.createElement("p", null, "The initial ServerVitals codebase is 100% AI generated using OpenAI Codex. Future human contributions may change the codebase. Stable releases require the maintainer\u2019s manual installation, testing and evaluation."), /* @__PURE__ */ React.createElement("p", null, "This alpha has not completed that manual stability checklist."), /* @__PURE__ */ React.createElement("p", null, "ServerVitals is independent and unofficial, and is not affiliated with, endorsed by, sponsored by, or officially supported by Discord Inc., BetterDiscord, or Vencord. Client modifications may conflict with Discord\u2019s Terms or policies. Users install at their own discretion.")), /* @__PURE__ */ React.createElement("footer", null, "Independent \xB7 Unofficial \xB7 AI-generated initial implementation \xB7 Testing build"));
  }
  return function SafeDashboard() {
    return /* @__PURE__ */ React.createElement(Boundary, null, /* @__PURE__ */ React.createElement(Dashboard, null));
  };
}
var CSS = `
.sv-sort-menu summary{cursor:pointer;padding:8px 11px;border:1px solid #555d70;border-radius:6px}.sv-sort-menu>div{display:flex;flex-direction:column;gap:4px;padding-top:8px}.sv-sort-menu summary:focus-visible{outline:2px solid #9ab7ff}
.sv-root{color:var(--text-normal,#eceef5);background:var(--background-primary,#1c1e26);font:14px/1.5 system-ui,sans-serif;padding:24px;border-radius:12px;box-sizing:border-box;min-width:0;max-width:100%}
.sv-root *{box-sizing:border-box}.sv-root h1{font-size:32px;line-height:1.2;margin:8px 0}.sv-root h2{font-size:21px;margin:20px 0 12px}.sv-root p{margin:10px 0}.sv-root button,.sv-root select,.sv-root input:not([type=checkbox]){font:inherit;color:inherit;background:var(--background-secondary,#282c38);border:1px solid var(--background-modifier-accent,#555d70);border-radius:6px;padding:8px 11px}.sv-root button{cursor:pointer}.sv-root button:hover{border-color:#7f9fff}.sv-root button:focus-visible,.sv-root input:focus-visible,.sv-root select:focus-visible{outline:2px solid #9ab7ff;outline-offset:2px}.sv-root button:disabled{opacity:.5;cursor:default}.sv-root button[aria-pressed=true]{background:#354c75;border-color:#9ab7ff}.sv-header{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}.sv-eyebrow{font-size:11px;letter-spacing:1.4px;color:#a9bce4}.sv-scan{display:flex;flex-direction:column;align-items:flex-start;gap:6px}.sv-scan strong{font-size:22px}.sv-scan span,.sv-root small,.sv-root footer{color:var(--text-muted,#b3b7c7)}.sv-info{background:var(--background-secondary,#282c38);padding:12px;border-radius:6px}.sv-error{background:#522c36;padding:14px;border-radius:6px}.sv-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:20px 0}.sv-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:16px 0}.sv-stats>div{padding:14px;border:1px solid var(--background-modifier-accent,#41485b);border-radius:8px;background:var(--background-secondary,#242834)}.sv-stats strong{display:block;font-size:26px;color:#afc9ff}.sv-stats span{font-size:12px}.sv-controls{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:16px 0}.sv-controls label{display:flex;flex-direction:column;gap:5px}.sv-controls input{min-width:230px}.sv-filters{padding:10px;border:1px solid #48516a;border-radius:6px}.sv-filters>div{display:flex;flex-wrap:wrap;gap:12px;padding:12px 0}.sv-filters label,.sv-setting{display:flex;align-items:center;gap:8px}.sv-setting{margin:14px 0;flex-wrap:wrap}.sv-table-wrap{overflow:auto;max-height:58vh}.sv-root table{width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap}.sv-root th{text-align:left;color:var(--text-muted,#c1c7d7);background:var(--background-secondary,#282c38);position:sticky;top:0;z-index:1}.sv-root th,.sv-root td{padding:12px 9px;border-bottom:1px solid var(--background-modifier-accent,#363e51)}.sv-root td:nth-child(2){min-width:200px;max-width:320px;white-space:normal}.sv-server{display:flex;align-items:center;gap:9px}.sv-server img,.sv-icon{width:32px;height:32px;border-radius:9px;object-fit:cover;flex-shrink:0}.sv-icon{display:grid;place-items:center;background:#3d4c6d}.sv-root .sv-name{padding:0;border:0;background:transparent;text-align:left;white-space:normal}.sv-root .sv-link{font-size:11px;border:0;background:transparent;color:#abc7ff;padding:4px 0}.sv-root small{display:block;font-size:11px;white-space:normal}.sv-badge{display:inline-block;font-size:10px;letter-spacing:.6px;font-weight:700;padding:4px 6px;border:1px solid #758099;border-radius:4px}.sv-live{color:#b2f4d1}.sv-cached{color:#ebc385}.sv-partial{color:#c1b5ff}.sv-unknown{color:#c8cbd4}.sv-root dl{display:grid;grid-template-columns:minmax(160px,1fr) 1fr;gap:8px}.sv-root dd{margin:0}.sv-changes{list-style:none;padding:0}.sv-changes li{padding:10px 0}.sv-reset{margin:24px 0}.sv-empty{padding:30px;text-align:center}.sv-root footer{font-size:11px;margin-top:24px;padding-top:12px;border-top:1px solid #41485b}
`;

// packages/betterdiscord/index.ts
var ServerVitals = class {
  controller;
  Dashboard;
  closeDashboard;
  start() {
    const findNavigation = (...signatures) => BdApi.Webpack.getModule(
      (value) => typeof value === "function" && signatures.every(
        (signature) => Function.prototype.toString.call(value).includes(signature)
      ),
      { searchExports: true }
    );
    const toGuild = findNavigation("transitionToGuild -");
    const toChannel = findNavigation(".openTextInVoiceIfVoiceChannel");
    const transitionTo = findNavigation("transitionTo - Transitioning to");
    const closeAllModals = findNavigation(".getState();for", " in ");
    let stores = {};
    const guildActions = BdApi.Webpack.getModule(
      (value) => !!value && typeof value.leaveGuild === "function",
      { searchExports: true }
    );
    this.controller = new Controller(
      () => {
        stores = Object.fromEntries(
          STORE_NAMES.map((name) => {
            try {
              return [name, BdApi.Webpack.getStore(name)];
            } catch {
              return [name, void 0];
            }
          })
        );
        return stores;
      },
      {
        load: async (key) => BdApi.Data.load("ServerVitals", key),
        save: async (key, value) => BdApi.Data.save("ServerVitals", key, value)
      }
    );
    this.Dashboard = createDashboard(BdApi.React, this.controller, {
      leave: guildActions ? async (id) => {
        await guildActions.leaveGuild(id);
      } : void 0,
      open: (guildId, channelId) => {
        try {
          const guild = stores.GuildStore?.getGuilds()[guildId];
          if (!guild) return false;
          if (channelId) {
            const channel = stores.ChannelStore?.getChannel(channelId);
            if (!channel || (channel.guild_id ?? channel.guildId) !== guildId || !stores.PermissionStore?.can(1024n, channel))
              return false;
            if (toChannel) toChannel(channelId);
            else if (transitionTo)
              transitionTo(`/channels/${guildId}/${channelId}`);
            else return false;
          } else {
            if (!toGuild) return false;
            toGuild(guildId);
          }
          this.closeDashboard?.();
          try {
            closeAllModals?.();
          } catch {
          }
          return true;
        } catch {
          return false;
        }
      }
    });
    void this.controller.start();
  }
  stop() {
    this.closeDashboard?.();
    this.closeDashboard = void 0;
    this.controller?.stop();
    this.controller = void 0;
    this.Dashboard = void 0;
  }
  getSettingsPanel() {
    const React = BdApi.React;
    if (!this.Dashboard)
      return React.createElement(
        "p",
        null,
        "Enable ServerVitals to open the dashboard."
      );
    const Dashboard = this.Dashboard;
    const controller = this.controller;
    const Panel = () => {
      const [open, setOpen] = React.useState(false);
      const container = React.useRef(null);
      React.useEffect(() => {
        const close = () => setOpen(false);
        this.closeDashboard = close;
        return () => {
          if (this.closeDashboard === close) this.closeDashboard = void 0;
        };
      }, []);
      React.useSyncExternalStore(
        controller.subscribe,
        controller.getRevision,
        controller.getRevision
      );
      React.useLayoutEffect(() => {
        if (!open) return;
        const modal = container.current?.closest(".bd-modal-root");
        if (!modal) return;
        const properties = ["width", "max-width", "height", "max-height"];
        const saved = properties.map((key) => [
          key,
          modal.style.getPropertyValue(key),
          modal.style.getPropertyPriority(key)
        ]);
        modal.style.width = "96vw";
        modal.style.maxWidth = "96vw";
        modal.style.height = "90vh";
        modal.style.maxHeight = "90vh";
        return () => {
          for (const [key, value, priority] of saved) {
            if (value) modal.style.setProperty(key, value, priority);
            else modal.style.removeProperty(key);
          }
        };
      }, [open]);
      return React.createElement(
        "div",
        { ref: container },
        React.createElement(
          "button",
          {
            onClick: () => setOpen(!open),
            style: { padding: "10px 18px", cursor: "pointer" }
          },
          open ? "Close ServerVitals" : "Open ServerVitals"
        ),
        open && controller.enabled && React.createElement(
          "div",
          {
            role: "region",
            "aria-label": "ServerVitals",
            style: { width: "100%" }
          },
          React.createElement(Dashboard)
        )
      );
    };
    return React.createElement(Panel);
  }
};
module.exports = ServerVitals;
