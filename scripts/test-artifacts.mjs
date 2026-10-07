import { readFile } from "node:fs/promises";
import { Script, createContext } from "node:vm";
import * as React from "react";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { createHash } from "node:crypto";
const code = await readFile(
  "dist/betterdiscord/ServerVitals.plugin.js",
  "utf8",
);
assert.ok(code.startsWith("/**\n * @name ServerVitals"));
const data = new Map();
const storeNames = [];
const guild = { id: "1", name: "Synthetic guild" };
const lastMessageId = (
  ((BigInt(Date.now()) - 1420070400000n) << 22n) +
  1n
).toString();
const stores = {
  GuildStore: { getGuilds: () => ({ 1: guild }) },
  ChannelStore: {
    getMutableGuildChannelsForGuild: () => ({
      100: { id: "100", guild_id: "1", type: 0, lastMessageId },
    }),
    getChannel: () => undefined,
  },
  PermissionStore: { can: () => true },
  UserStore: { getCurrentUser: () => ({ id: "999" }) },
};
const context = createContext({
  module: { exports: {} },
  console,
  performance,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  BdApi: {
    React,
    Webpack: {
      getStore: (name) => {
        storeNames.push(name);
        return stores[name];
      },
      getModule: () => undefined,
    },
    Data: {
      load: (_plugin, key) => data.get(key),
      save: (_plugin, key, value) => data.set(key, value),
    },
  },
});
new Script(code, { filename: "ServerVitals.plugin.js" }).runInContext(context);
const Plugin = context.module.exports;
assert.equal(typeof Plugin, "function");
const plugin = new Plugin();
plugin.start();
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(data.get("cache:999").current.records.length, 1);
assert.ok(React.isValidElement(plugin.getSettingsPanel()));
assert.equal(storeNames.length, 7);
plugin.stop();
assert.equal(plugin.controller, undefined);
assert.ok(React.isValidElement(plugin.getSettingsPanel()));
const entries = unzipSync(
  new Uint8Array(await readFile("dist/ServerVitals-Vencord.zip")),
);
assert.ok(entries["serverVitals/index.tsx"]);
assert.ok(entries["serverVitals/shared/core/src/index.ts"]);
assert.ok(entries["serverVitals/LICENSE"]);
assert.ok(
  strFromU8(entries["serverVitals/index.tsx"]).includes(
    '"./shared/discord/src/controller"',
  ),
);
assert.ok(
  Object.keys(entries).every(
    (name) => name.startsWith("serverVitals/") && !name.includes(".."),
  ),
);
const sums = await readFile("dist/SHA256SUMS.txt", "utf8");
for (const line of sums.trim().split("\n")) {
  const [sum, file] = line.split("  ");
  assert.equal(
    createHash("sha256")
      .update(await readFile(`dist/${file}`))
      .digest("hex"),
    sum,
  );
}
console.info(
  "Artifact checks passed: BetterDiscord bundle starts/stops against mock BdApi, settings panel, Vencord ZIP contents, SHA-256 checksums. Live client testing remains pending.",
);
