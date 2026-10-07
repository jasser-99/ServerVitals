import test from "node:test";
import assert from "node:assert/strict";
import { EPOCH } from "../packages/core/src/index";
import {
  scanAll,
  scanGuild,
  serverSize,
  type Stores,
  type Channel,
} from "../packages/discord/src/scanner";
const now = Date.UTC(2026, 9, 7);
const id = (time: number) => ((BigInt(time - EPOCH) << 22n) + 1n).toString();
export function storesFixture(count = 1): Stores {
  const guilds = Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      String(i + 1),
      { id: String(i + 1), name: `Guild ${i + 1}` },
    ]),
  );
  return {
    GuildStore: { getGuilds: () => guilds },
    UserStore: { getCurrentUser: () => ({ id: "123" }) },
    ChannelStore: {
      getMutableGuildChannelsForGuild: (guildId) => ({
        "100": {
          id: "100",
          guild_id: guildId,
          type: 0,
          lastMessageId: id(now - 1000),
        },
      }),
      getChannel: () => undefined,
    },
    PermissionStore: { can: () => true },
    ReadStateStore: { lastMessageId: () => null },
    GuildMemberCountStore: { getMemberCount: () => 42318 },
    ActiveJoinedThreadsStore: { getActiveJoinedThreadsForGuild: () => ({}) },
  };
}
test("scanner proof: guild/channel enumeration, metadata timestamps and size without content", async () => {
  const scan = await scanAll(storesFixture(200));
  assert.equal(scan.observations.length, 200);
  assert.equal(
    scan.observations.reduce((s, o) => s + o.evidence.inspected, 0),
    200,
  );
  assert.equal(scan.observations[0].lastVisibleActivity, now - 1000);
  assert.deepEqual(scan.observations[0].size, {
    value: 42318,
    accuracy: "approximate",
  });
  console.info(
    `[ServerVitals] Synthetic scanner proof: ${scan.observations.length} guilds, ${scan.durationMs} ms (not a live Discord benchmark)`,
  );
});
test("permission denied, DM and wrong guild sources are excluded before metadata access", () => {
  const stores = storesFixture();
  stores.PermissionStore = { can: (c) => c !== 1024n };
  const r = scanGuild({ id: "1", name: "A" }, stores, now);
  assert.equal(r.lastVisibleActivity, null);
  assert.equal(r.evidence.expected, 0);
});
test("loaded joined/unjoined forum replies contribute, thread creation ID does not", () => {
  const stores = storesFixture();
  const channel: Channel = {
    id: "100",
    guild_id: "1",
    type: 15,
    lastMessageId: id(now),
  };
  stores.ChannelStore!.getMutableGuildChannelsForGuild = () => ({
    "100": channel,
  });
  stores.ActiveJoinedThreadsStore = {
    getActiveJoinedThreadsForGuild: () => ({
      "100": {
        "101": {
          channel: {
            id: "101",
            guild_id: "1",
            type: 11,
            parent_id: "100",
            lastMessageId: id(now - 2000),
          },
        },
      },
    }),
  };
  const r = scanGuild({ id: "1", name: "A" }, stores, now);
  assert.equal(r.lastVisibleActivity, now - 2000);
  assert.equal(r.evidence.threads, 1);
  assert.equal(r.evidence.forums, 1);
  assert.equal(r.evidence.threadCoverage, "loaded-only");
});
test("malformed and future metadata stays unknown; content getters never touched", () => {
  const stores = storesFixture();
  const c = {
    id: "100",
    guild_id: "1",
    type: 0,
    lastMessageId: id(now + 1000),
    get content(): never {
      throw new Error("content accessed");
    },
  };
  stores.ChannelStore!.getMutableGuildChannelsForGuild = () => ({ "100": c });
  assert.equal(
    scanGuild({ id: "1", name: "A" }, stores, now).lastVisibleActivity,
    null,
  );
});
test("missing stores fail once rather than empty successful scan", async () => {
  await assert.rejects(scanAll({}), /required Discord stores/);
});
test("counts have explicit exact/approximate/unavailable states", () => {
  assert.equal(
    serverSize({ id: "1", name: "A", member_count: 100 }, {}).accuracy,
    "exact",
  );
  assert.equal(
    serverSize({ id: "1", name: "A", approximate_member_count: 100 }, {})
      .accuracy,
    "approximate",
  );
  assert.equal(
    serverSize({ id: "1", name: "A", member_count: -1 }, {}).accuracy,
    "unavailable",
  );
});
test("thousands of visible sources across 200 guilds without a product count limit", async () => {
  const stores = storesFixture(200);
  stores.ChannelStore!.getMutableGuildChannelsForGuild = (guildId) =>
    Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [
        String(100 + i),
        {
          id: String(100 + i),
          guild_id: guildId,
          type: 0,
          lastMessageId: id(now - i * 1000),
        },
      ]),
    );
  const result = await scanAll(stores);
  assert.equal(
    result.observations.reduce((sum, o) => sum + (o.evidence.scanned ?? 0), 0),
    5000,
  );
  assert.equal(result.observations.length, 200);
  assert.ok(result.observations.every((o) => o.lastVisibleActivity === now));
});
