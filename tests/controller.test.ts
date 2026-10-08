import test from "node:test";
import assert from "node:assert/strict";
import { Controller, type Storage } from "../packages/discord/src/controller";
import { EPOCH } from "../packages/core/src/index";
import type { Stores } from "../packages/discord/src/scanner";
test("multi-server leaving stops at the first rejection and preserves remaining records", async () => {
  const f = fixture(3);
  await f.controller.start();
  await f.controller.refresh();
  const calls: string[] = [];
  const result = await f.controller.leaveSelected(
    ["1", "2", "3"],
    async (id) => {
      calls.push(id);
      if (id === "2") throw new Error("Rate limit or permission failure");
    },
  );
  assert.deepEqual(calls, ["1", "2"]);
  assert.deepEqual(result.left, ["1"]);
  assert.match(result.error!, /failure/);
  assert.deepEqual(
    f.controller.cache.current!.records.map((r) => r.guildId),
    ["2", "3"],
  );
  f.controller.stop();
});
test("confirmed leaving protects Keep and owned servers without invoking actions", async () => {
  const f = fixture();
  await f.controller.start();
  await f.controller.refresh();
  let calls = 0;
  const leave = async () => {
    calls++;
  };
  await f.controller.toggleKeep("1");
  assert.match((await f.controller.leaveSelected(["1"], leave)).error!, /Keep/);
  await f.controller.toggleKeep("1");
  f.stores.GuildStore!.getGuilds = () => ({
    "1": { id: "1", name: "Owned", ownerId: "123" },
  });
  assert.match((await f.controller.leaveSelected(["1"], leave)).error!, /own/);
  assert.equal(calls, 0);
  f.controller.stop();
});
test("leaving removes successful records, deduplicates selections and does not retry failures", async () => {
  const f = fixture();
  await f.controller.start();
  await f.controller.refresh();
  let calls = 0;
  const failed = await f.controller.leaveSelected(["1"], async () => {
    calls++;
    throw new Error("Discord rejected leaving");
  });
  assert.equal(calls, 1);
  assert.deepEqual(failed.left, []);
  assert.equal(f.controller.cache.current!.records.length, 1);
  const result = await f.controller.leaveSelected(["1", "1"], async () => {
    calls++;
  });
  assert.deepEqual(result.left, ["1"]);
  assert.equal(calls, 2);
  assert.equal(f.controller.cache.current!.records.length, 0);
  f.controller.stop();
});
test("enable and reopen use cache without scanning or timers, including legacy refresh settings", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: Date.now() });
  const f = fixture();
  f.data.set("settings:123", { autoRefresh: 5 });
  await f.controller.start();
  assert.equal(f.controller.cache.current, null);
  assert.equal(f.data.has("cache:123"), false);
  t.mock.timers.tick(3_600_000);
  assert.equal(f.controller.cache.current, null);
  await f.controller.refresh();
  const at = f.controller.cache.current!.at;
  f.controller.stop();
  await f.controller.start();
  assert.equal(f.controller.cache.current!.at, at);
  assert.equal(f.controller.cache.current!.records[0].freshness, "CACHED");
  t.mock.timers.tick(3_600_000);
  assert.equal(f.controller.cache.current!.at, at);
  f.controller.stop();
});

test("repeated manual checks retain only two snapshots", async () => {
  const f = fixture();
  await f.controller.start();
  for (let i = 0; i < 20; i++) await f.controller.refresh();
  const stored = f.data.get("cache:123") as {
    current: unknown;
    previous: unknown;
  };
  assert.ok(stored.current && stored.previous);
  assert.deepEqual(Object.keys(stored).sort(), [
    "current",
    "keeps",
    "previous",
    "schemaVersion",
  ]);
  await f.controller.resetCache();
  assert.equal(f.controller.cache.current, null);
  assert.equal(f.controller.cache.previous, null);
  f.controller.stop();
});
function fixture(count = 1) {
  const data = new Map<string, unknown>();
  let currentAccount = "123";
  let accountListener: (() => void) | undefined;
  const storage: Storage = {
    load: async (key) => data.get(key),
    save: async (key, value) => {
      data.set(key, value);
    },
  };
  let time = Date.now() - 1000;
  const stores: Stores = {
    GuildStore: {
      getGuilds: () =>
        Object.fromEntries(
          Array.from({ length: count }, (_, i) => [
            String(i + 1),
            { id: String(i + 1), name: "Server" },
          ]),
        ),
    },
    UserStore: {
      getCurrentUser: () => ({ id: currentAccount }),
      addChangeListener: (fn) => {
        accountListener = fn;
      },
      removeChangeListener: () => {
        accountListener = undefined;
      },
    },
    ChannelStore: {
      getChannel: () => undefined,
      getMutableGuildChannelsForGuild: (guild) => ({
        "100": {
          id: "100",
          guild_id: guild,
          type: 0,
          lastMessageId: ((BigInt(time - EPOCH) << 22n) + 1n).toString(),
        },
      }),
    },
    PermissionStore: { can: () => true },
    ActiveJoinedThreadsStore: { getActiveJoinedThreadsForGuild: () => ({}) },
  };
  const controller = new Controller(() => stores, storage);
  return {
    controller,
    stores,
    data,
    storage,
    setTime: (value: number) => {
      time = value;
    },
    switchAccount: () => {
      currentAccount = "456";
      accountListener?.();
    },
    hasListener: () => !!accountListener,
  };
}
test("manual scans preserve Keep and rotate snapshots only on checks", async () => {
  const f = fixture();
  await f.controller.start();
  await f.controller.refresh();
  assert.equal(f.controller.cache.current?.records.length, 1);
  await f.controller.toggleKeep("1");
  assert.equal(f.controller.cache.previous === null, true);
  assert.equal(f.controller.cache.current!.records[0].keep, true);
  assert.ok(f.data.has("cache:123"));
  await f.controller.refresh();
  assert.equal(f.controller.cache.previous?.records.length, 1);
  assert.equal(f.controller.changes().length, 0);
  f.controller.stop();
  assert.equal(f.hasListener(), false);
  assert.equal(f.controller.cache.current, null);
});
test("monotonic caching survives restart without false freshness changes", async () => {
  const f = fixture();
  await f.controller.start();
  await f.controller.refresh();
  const timestamp = f.controller.cache.current!.records[0].lastVisibleActivity;
  await f.controller.refresh();
  f.controller.stop();
  await f.controller.start();
  await f.controller.refresh();
  assert.equal(
    f.controller.cache.current!.records[0].lastVisibleActivity,
    timestamp,
  );
  assert.equal(
    f.controller.changes().filter((c) => c.kind === "freshness").length,
    0,
  );
  f.controller.stop();
});
test("missing metadata retains earlier activity and records current inspection", async () => {
  const f = fixture();
  await f.controller.start();
  await f.controller.refresh();
  const old = f.controller.cache.current!.records[0].lastVisibleActivity;
  f.stores.ChannelStore!.getMutableGuildChannelsForGuild = () => ({});
  await f.controller.refresh();
  assert.equal(f.controller.cache.current!.records[0].lastVisibleActivity, old);
  assert.equal(f.controller.cache.current!.records[0].freshness, "CACHED");
  f.controller.stop();
});
test("failed full scan preserves last successful snapshot", async () => {
  const f = fixture();
  await f.controller.start();
  await f.controller.refresh();
  const prior = f.controller.cache.current;
  f.stores.GuildStore!.getGuilds = () => {
    throw new Error("changed");
  };
  await f.controller.refresh();
  assert.equal(f.controller.cache.current, prior);
  assert.ok(f.controller.error);
  f.controller.stop();
});
test("disable cancels yielding scan and prevents completion save", async () => {
  const f = fixture(200);
  await f.controller.start();
  const task = f.controller.refresh();
  await new Promise((resolve) => setTimeout(resolve, 1));
  f.controller.stop();
  await task;
  assert.equal(f.controller.cache.current, null);
  assert.equal(f.data.has("cache:123"), false);
});
test("account switching clears visible cache and stops scanner", async () => {
  const f = fixture();
  await f.controller.start();
  await f.controller.refresh();
  f.switchAccount();
  assert.equal(f.controller.enabled, false);
  assert.equal(f.controller.cache.current, null);
  assert.equal(f.hasListener(), false);
  await f.controller.start();
  await f.controller.refresh();
  assert.ok(f.data.has("cache:456"));
  f.controller.stop();
});
test("cache reset preserves Keep and clears comparison baseline", async () => {
  const f = fixture();
  await f.controller.start();
  await f.controller.refresh();
  await f.controller.toggleKeep("1");
  await f.controller.resetCache();
  assert.equal(f.controller.cache.current, null);
  assert.equal(f.controller.cache.previous, null);
  assert.deepEqual(f.controller.cache.keeps, ["1"]);
  await f.controller.refresh();
  assert.equal(f.controller.cache.current!.records[0].keep, true);
  assert.equal(f.controller.cache.previous, null);
  f.controller.stop();
});
test("storage failure is visible without crashing", async () => {
  const f = fixture();
  f.storage.save = async () => {
    throw new Error("disk full");
  };
  await f.controller.start();
  await f.controller.refresh();
  assert.match(f.controller.error!, /storage could not be saved/);
  f.controller.stop();
});
test("settings changes validate and synchronize host callbacks", async () => {
  const f = fixture();
  let debug = false;
  const controller = new Controller(
    () => f.stores,
    f.storage,
    (s) => {
      debug = s.debug;
    },
  );
  await controller.start();
  await controller.updateSettings({ debug: true });
  assert.equal(debug, true);
  assert.ok(f.data.has("settings:123"));
  controller.stop();
});
