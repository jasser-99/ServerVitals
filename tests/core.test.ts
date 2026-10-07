import test from "node:test";
import assert from "node:assert/strict";
import {
  category,
  compareScans,
  confidence,
  csvCell,
  DAY,
  DEFAULT_SETTINGS,
  EPOCH,
  exportCSV,
  exportJSON,
  formatSize,
  mergeObservation,
  migrateSettings,
  newestActivity,
  normalizeSize,
  relativeTime,
  selectRecords,
  snowflakeTimestamp,
  statistics,
} from "../packages/core/src/index";
import { readCache } from "../packages/core/src/storage";
import type {
  Evidence,
  Observation,
  Record as GuildRecord,
  Snapshot,
} from "../packages/core/src/model";
const NOW = Date.UTC(2026, 9, 7, 12);
const message = (time: number) =>
  ((BigInt(time - EPOCH) << 22n) + 1n).toString();
const full: Evidence = {
  expected: 10,
  inspected: 10,
  missing: 0,
  threads: 2,
  forums: 0,
  threadCoverage: "complete",
  issues: [],
};
function observation(age: number | null = 1): Observation {
  const time = age === null ? null : NOW - age * DAY;
  return {
    guildId: "1",
    name: "Alpha",
    icon: null,
    size: { value: 1000, accuracy: "exact" },
    newestMessageId: time === null ? null : message(time),
    sourceChannelId: time === null ? null : "100",
    lastVisibleActivity: time,
    lastScanned: NOW,
    evidence: { ...full },
  };
}
function record(
  age: number | null = 1,
  patch: Partial<GuildRecord> = {},
): GuildRecord {
  return { ...mergeObservation(observation(age), undefined, false), ...patch };
}
function snapshot(records: GuildRecord[], at = NOW): Snapshot {
  return { records, at, durationMs: 10 };
}
function kinds(p: GuildRecord, r: GuildRecord) {
  return compareScans(snapshot([p]), snapshot([r])).map((c) => c.kind);
}

test("known Discord fixture decodes exactly with BigInt", () =>
  assert.equal(snowflakeTimestamp("175928847299117063", NOW), 1462015105796));
test("timestamp fixture round trips without full Snowflake Number conversion", () =>
  assert.equal(snowflakeTimestamp(message(NOW), NOW), NOW));
for (const value of [
  "",
  "0",
  "-1",
  " 175928847299117063",
  "175928847299117063 ",
  "1.5",
  "1e18",
  "abc",
  "123abc",
  "18446744073709551616",
  "9".repeat(100),
  null,
  undefined,
  Number("175928847299117063"),
  1n,
  {},
  [],
]) {
  test(`invalid Snowflake ${String(value).slice(0, 25)} (${typeof value})`, () =>
    assert.equal(snowflakeTimestamp(value, NOW), null));
}
test("unsigned 64-bit maximum is valid at its actual future timestamp only", () => {
  const expected = Number((((1n << 64n) - 1n) >> 22n) + BigInt(EPOCH));
  assert.equal(snowflakeTimestamp("18446744073709551615", expected), expected);
  assert.equal(snowflakeTimestamp("18446744073709551615", NOW), null);
});
test("future message dates rejected", () =>
  assert.equal(snowflakeTimestamp(message(NOW + 1), NOW), null));
test("newest selection ignores invalid IDs and preserves full-ID precision", () => {
  const first = BigInt(message(NOW));
  assert.equal(
    newestActivity(["bad", first.toString(), (first + 1n).toString()], NOW)?.id,
    (first + 1n).toString(),
  );
  assert.equal(newestActivity([], NOW), null);
});
test("relative times distinguish unknown, current, minutes, hours, days", () => {
  assert.equal(relativeTime(null, NOW), "Unknown");
  assert.equal(relativeTime(NOW, NOW), "just now");
  assert.equal(relativeTime(NOW - 120000, NOW), "2 minutes ago");
  assert.equal(relativeTime(NOW - 7200000, NOW), "2 hours ago");
  assert.equal(relativeTime(NOW - DAY, NOW), "1 day ago");
  assert.equal(relativeTime(NOW - 2 * DAY, NOW), "2 days ago");
});
for (const [age, expected] of [
  [0, "Active"],
  [6.99, "Active"],
  [7, "Quiet"],
  [30, "Inactive"],
  [180, "Very Inactive"],
  [365, "Very Inactive"],
  [365.01, "Dormant"],
  [null, "Unknown"],
] as const) {
  test(`category boundary ${age}`, () =>
    assert.equal(
      category(age === null ? null : NOW - age * DAY, NOW),
      expected,
    ));
}
test("custom thresholds change categories without changing named statistics", () => {
  assert.equal(category(NOW - 4 * DAY, NOW, [3, 10, 20, 30]), "Quiet");
  assert.equal(statistics([record(4)], NOW)["Active This Week"], 1);
});
test("server size formatting avoids fake precision", () => {
  assert.equal(
    formatSize({ value: 42318, accuracy: "exact" }),
    "42,318 members",
  );
  assert.equal(
    formatSize({ value: 42318, accuracy: "approximate" }),
    "~42.3K members",
  );
  assert.equal(
    formatSize({ value: null, accuracy: "unavailable" }),
    "Unavailable",
  );
  assert.deepEqual(normalizeSize(-10, "exact"), {
    value: null,
    accuracy: "unavailable",
  });
  assert.equal(normalizeSize(0, "exact").value, 0);
  assert.equal(normalizeSize(1.5, "approximate").value, null);
  assert.equal(normalizeSize(Infinity, "exact").value, null);
});
test("confidence complete = HIGH regardless of activity age", () => {
  assert.deepEqual(confidence(full, true, false), {
    level: "HIGH",
    score: 100,
  });
  assert.equal(record(400).confidence, "HIGH");
});
test("confidence loaded-only = MEDIUM, missing metadata can be LOW", () => {
  assert.deepEqual(
    confidence({ ...full, threadCoverage: "loaded-only" }, true, false),
    { level: "MEDIUM", score: 80 },
  );
  assert.equal(
    confidence({ ...full, inspected: 1, missing: 9 }, true, false).level,
    "LOW",
  );
});
test("confidence zero sources, errors, no activity and cache quality", () => {
  assert.equal(
    confidence({ ...full, expected: 0, inspected: 0 }, true, false).level,
    "LOW",
  );
  assert.equal(
    confidence(
      {
        ...full,
        issues: ["error"],
        threadCoverage: "loaded-only",
        inspected: 5,
      },
      true,
      false,
    ).score,
    10,
  );
  assert.equal(confidence(full, false, false).level, "UNKNOWN");
  assert.equal(confidence(full, true, true, "HIGH").level, "MEDIUM");
  assert.equal(confidence(full, true, true, "LOW").level, "LOW");
});
test("freshness derived from complete, partial and unknown observations", () => {
  assert.equal(record().freshness, "LIVE");
  assert.equal(
    mergeObservation(
      { ...observation(), evidence: { ...full, missing: 1, inspected: 9 } },
      undefined,
      false,
    ).freshness,
    "PARTIAL",
  );
  assert.equal(
    mergeObservation(
      {
        ...observation(),
        evidence: { ...full, threadCoverage: "loaded-only" },
      },
      undefined,
      false,
    ).freshness,
    "PARTIAL",
  );
  assert.equal(record(null).freshness, "UNKNOWN");
});
test("monotonic cache retains newer timestamp/source on older observation", () => {
  const previous = record(1);
  const merged = mergeObservation(observation(20), previous, true);
  assert.equal(merged.lastVisibleActivity, previous.lastVisibleActivity);
  assert.equal(merged.newestMessageId, previous.newestMessageId);
  assert.equal(merged.freshness, "CACHED");
  assert.equal(merged.confidence, "MEDIUM");
  assert.equal(merged.keep, true);
  assert.equal(merged.lastScanned, NOW);
});
test("monotonic cache retains known on missing observation and accepts newer", () => {
  const previous = record(20);
  assert.equal(
    mergeObservation(observation(null), previous, false).lastVisibleActivity,
    previous.lastVisibleActivity,
  );
  assert.equal(
    mergeObservation(observation(1), previous, false).lastVisibleActivity,
    NOW - DAY,
  );
});
test("cached confidence does not decay arbitrarily on repeated scans", () => {
  const once = mergeObservation(observation(null), record(1), false);
  assert.equal(
    mergeObservation(observation(null), once, false).confidence,
    once.confidence,
  );
});
test("freshness and confidence remain separate", () => {
  const low = mergeObservation(
    { ...observation(), evidence: { ...full, inspected: 1 } },
    undefined,
    false,
  );
  assert.equal(low.freshness, "LIVE");
  assert.equal(low.confidence, "LOW");
});
test("unavailable size uses explicit cached label", () => {
  assert.equal(
    mergeObservation(
      { ...observation(), size: { value: null, accuracy: "unavailable" } },
      record(),
      false,
    ).size.cached,
    true,
  );
});
const rows = [
  record(1, {
    guildId: "1",
    name: "Beta",
    size: { value: 100, accuracy: "exact" },
    confidence: "LOW",
  }),
  record(100, {
    guildId: "2",
    name: "Alpha",
    size: { value: 1000, accuracy: "approximate" },
  }),
  record(null, {
    guildId: "3",
    name: "Gamma",
    keep: true,
    size: { value: null, accuracy: "unavailable" },
  }),
];
for (const [sort, expected] of [
  ["oldest", ["2", "1", "3"]],
  ["newest", ["1", "2", "3"]],
  ["az", ["2", "1", "3"]],
  ["za", ["3", "1", "2"]],
  ["largest", ["2", "1", "3"]],
  ["smallest", ["1", "2", "3"]],
  ["confidence", ["3", "1", "2"]],
] as const) {
  test(`sort ${sort} with unknown/unavailable handling`, () =>
    assert.deepEqual(
      selectRecords(rows, { sort }, NOW).map((r) => r.guildId),
      expected,
    ));
}
test("search is trimmed, case-insensitive and local", () =>
  assert.deepEqual(
    selectRecords(rows, { search: " ALP " }, NOW).map((r) => r.guildId),
    ["2"],
  ));
test("combined filters are AND; Keep hide is view only", () => {
  assert.equal(
    selectRecords(
      rows,
      { filters: ["Inactive 30+ Days", "Confidence: HIGH"] },
      NOW,
    ).length,
    1,
  );
  assert.equal(
    selectRecords(rows, { filters: ["Inactive 30+ Days", "Unknown"] }, NOW)
      .length,
    0,
  );
  assert.equal(selectRecords(rows, { filters: ["Keep"] }, NOW).length, 1);
  assert.equal(selectRecords(rows, { hideKeep: true }, NOW).length, 2);
  assert.equal(rows[2].keep, true);
});
test("freshness filter and clickable IDs", () => {
  assert.equal(
    selectRecords(rows, { filters: ["Freshness: LIVE"] }, NOW).length,
    2,
  );
  assert.deepEqual(
    selectRecords(rows, { ids: ["1"] }, NOW).map((r) => r.guildId),
    ["1"],
  );
});
test("all fixed age filters and Unknown operate correctly", () => {
  for (const [filter, age] of [
    ["Active Today", 0.5],
    ["Active This Week", 6],
    ["Inactive 7+ Days", 7],
    ["Inactive 30+ Days", 30],
    ["Inactive 90+ Days", 90],
    ["Inactive 6+ Months", 180],
    ["Inactive 1+ Year", 365],
  ] as const) {
    assert.equal(
      selectRecords([record(age), record(null)], { filters: [filter] }, NOW)
        .length,
      1,
    );
  }
});
test("new and removed servers detected", () => {
  const changes = compareScans(
    snapshot([record()]),
    snapshot([record(1, { guildId: "2" })]),
  );
  assert.deepEqual(changes.map((c) => c.kind).sort(), ["new", "removed"]);
});
test("activity advance event and actual category crossing", () => {
  assert.ok(kinds(record(100), record(1)).includes("activity"));
  assert.ok(kinds(record(100), record(1)).includes("category"));
  assert.deepEqual(kinds(record(2), record(1)), ["activity"]);
});
test("category changes use clear before/after labels", () =>
  assert.ok(
    compareScans(snapshot([record(1)]), snapshot([record(10)])).some(
      (c) => c.label === "Moved from Active to Quiet",
    ),
  ));
test("fixed threshold crossings detected with passage of time", () => {
  const before = record(29.5);
  const after = { ...before, lastScanned: NOW + DAY };
  const changes = compareScans(
    snapshot([before]),
    snapshot([after], NOW + DAY),
  );
  assert.ok(changes.some((c) => c.label === "Crossed 30 days of inactivity"));
});
test("Dormant boundary matches category definition", () => {
  const changes = compareScans(
    snapshot([record(365)]),
    snapshot([record(366)]),
  );
  assert.ok(
    changes.some((c) => c.label === "Moved from Very Inactive to Dormant"),
  );
});
test("freshness transitions in both directions", () => {
  assert.ok(
    kinds(record(1, { freshness: "CACHED" }), record(1)).includes("freshness"),
  );
  assert.ok(
    kinds(record(1), record(1, { freshness: "CACHED" })).includes("freshness"),
  );
});
test("confidence improves and worsens", () => {
  const improved = compareScans(
    snapshot([record(1, { confidence: "LOW" })]),
    snapshot([record()]),
  );
  assert.equal(improved[0].label, "Activity confidence improved");
  assert.equal(
    compareScans(
      snapshot([record()]),
      snapshot([record(1, { confidence: "LOW" })]),
    )[0].label,
    "Activity confidence worsened",
  );
});
test("unknown becomes known and known becomes unavailable", () => {
  assert.ok(kinds(record(null), record(1)).includes("known"));
  assert.ok(kinds(record(1), record(null)).includes("unavailable"));
});
test("known metadata becoming partial records evidence change", () =>
  assert.ok(
    kinds(
      record(1),
      record(1, { freshness: "PARTIAL", confidence: "MEDIUM" }),
    ).includes("freshness"),
  ));
test("meaningful size changes only; cached/precision changes suppressed", () => {
  assert.ok(
    kinds(
      record(1),
      record(1, { size: { value: 1100, accuracy: "exact" } }),
    ).includes("size"),
  );
  assert.ok(
    !kinds(
      record(1),
      record(1, { size: { value: 1001, accuracy: "exact" } }),
    ).includes("size"),
  );
  assert.ok(
    !kinds(
      record(1),
      record(1, { size: { value: 1500, accuracy: "approximate" } }),
    ).includes("size"),
  );
  assert.ok(
    !kinds(
      record(1, { size: { value: 1000, accuracy: "exact", cached: true } }),
      record(1, { size: { value: 1500, accuracy: "exact" } }),
    ).includes("size"),
  );
});
test("unchanged records and Last Scanned/Keep/name changes do not create noise", () => {
  assert.deepEqual(
    kinds(
      record(1),
      record(1, { lastScanned: NOW + 1000, keep: true, name: "Renamed" }),
    ),
    [],
  );
  assert.deepEqual(compareScans(null, snapshot(rows)), []);
});
test("statistics totals, overlapping bands, average and median", () => {
  const stats = statistics(
    [
      record(0),
      record(7),
      record(30),
      record(200),
      record(400),
      record(null, { keep: true, freshness: "CACHED" }),
    ],
    NOW,
  );
  assert.equal(stats["Total Servers"], 6);
  assert.equal(stats["Active Today"], 1);
  assert.equal(stats["Inactive 7+ Days"], 4);
  assert.equal(stats["Inactive 30+ Days"], 3);
  assert.equal(stats["Inactive 90+ Days"], 2);
  assert.equal(stats["Inactive 6+ Months"], 2);
  assert.equal(stats["Dormant 1+ Year"], 1);
  assert.equal(stats["Unknown Activity"], 1);
  assert.equal(stats["Keep Servers"], 1);
  assert.equal(stats["Median Days Since Activity"], 30);
  assert.equal(statistics([], NOW)["Average Days Since Activity"], null);
});
test("CSV escaping and spreadsheet formula neutralization", () => {
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  for (const value of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "  =cmd", "\tcmd"])
    assert.ok(csvCell(value).startsWith("\"'"));
  assert.ok(
    exportCSV([record(1, { name: 'A,"B"\nC' })], NOW).includes('"A,""B""\nC"'),
  );
  assert.ok(exportCSV([], NOW).startsWith('"Server Name"'));
});
test("JSON export contains fields and no message bodies", () => {
  const result = JSON.parse(exportJSON([record()], NOW));
  assert.equal(result.servers[0]["Guild ID"], "1");
  assert.equal(
    result.servers[0]["Last Visible Activity"],
    new Date(NOW - DAY).toISOString(),
  );
  assert.equal(result.servers[0]["Server Size Accuracy"], "exact");
  assert.equal("content" in result.servers[0], false);
});
test("settings migration whitelists and validates thresholds and intervals", () => {
  assert.deepEqual(migrateSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(
    migrateSettings({
      thresholds: [30, 7, 180, 365],
      autoRefresh: 1,
      unexpected: true,
    }),
    DEFAULT_SETTINGS,
  );
  assert.deepEqual(
    migrateSettings({ thresholds: [1, 2, 3, 4], autoRefresh: 15, debug: true })
      .thresholds,
    [1, 2, 3, 4],
  );
  assert.equal(migrateSettings({ debug: "true" }).debug, false);
});
test("cache restoration validates message IDs, whitelists fields and preserves baseline", () => {
  const extra = { ...record(), content: "not retained" };
  const restored = readCache(
    {
      schemaVersion: 1,
      keeps: ["1", "1", "bad"],
      current: snapshot([extra]),
      previous: null,
    },
    NOW,
  );
  assert.equal(restored.current?.records[0].freshness, "LIVE");
  assert.equal(restored.current?.records[0].keep, true);
  assert.equal("content" in restored.current!.records[0], false);
  assert.deepEqual(restored.keeps, ["1"]);
  const invalid = readCache(
    {
      schemaVersion: 1,
      current: snapshot([record(1, { newestMessageId: "bad" })]),
    },
    NOW,
  );
  assert.equal(invalid.current!.records[0].lastVisibleActivity, null);
  assert.equal(readCache({ schemaVersion: 99 }).current, null);
});
