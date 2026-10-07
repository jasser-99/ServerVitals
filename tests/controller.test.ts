import test from "node:test";
import assert from "node:assert/strict";
import { Controller, type Storage } from "../packages/discord/src/controller";
import { EPOCH } from "../packages/core/src/index";
import type { Stores } from "../packages/discord/src/scanner";
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
test("controller scans on enable, Keep persists, snapshots rotate only on scans", async () => {
  const f = fixture();
  await f.controller.start();
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
  const timestamp = f.controller.cache.current!.records[0].lastVisibleActivity;
  await f.controller.refresh();
  f.controller.stop();
  await f.controller.start();
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
  const task = f.controller.start();
  await new Promise((resolve) => setTimeout(resolve, 1));
  f.controller.stop();
  await task;
  assert.equal(f.controller.cache.current, null);
  assert.equal(f.data.has("cache:123"), false);
});
test("account switching clears visible cache and stops scanner", async () => {
  const f = fixture();
  await f.controller.start();
  f.switchAccount();
  assert.equal(f.controller.enabled, false);
  assert.equal(f.controller.cache.current, null);
  assert.equal(f.hasListener(), false);
  await f.controller.start();
  assert.ok(f.data.has("cache:456"));
  f.controller.stop();
});
test("cache reset preserves Keep and clears comparison baseline", async () => {
  const f = fixture();
  await f.controller.start();
  await f.controller.toggleKeep("1");
  await f.controller.resetCache();
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
  assert.match(f.controller.error!, /storage could not be saved/);
  f.controller.stop();
});
test("settings changes validate and synchronize host callbacks", async () => {
  const f = fixture();
  let interval = -1;
  const controller = new Controller(
    () => f.stores,
    f.storage,
    (s) => {
      interval = s.autoRefresh;
    },
  );
  await controller.start();
  await controller.updateSettings({ autoRefresh: 15 });
  assert.equal(interval, 15);
  assert.ok(f.data.has("settings:123"));
  controller.stop();
});
