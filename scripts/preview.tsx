// Synthetic fixture only. This module is never distributed with either plugin.
import * as React from "react";
import { createRoot } from "react-dom/client";
import { DAY, EPOCH, mergeObservation } from "../packages/core/src/index";
import { Controller } from "../packages/discord/src/controller";
import type { Guild, Stores } from "../packages/discord/src/scanner";
import { createDashboard } from "../packages/ui/src/dashboard";
const now = Date.now();
const names = [
  "Counter Strike Community",
  "Weekend Builders",
  "Design Collective",
  "The Archive",
  "Indie Game Makers",
  "Quiet Reading Room",
  "Mountain Explorers",
  "Unknown Observatory",
];
const ages = [0.01, 3, 15, 420, 45, 210, 100, null];
const ids = (time: number) => ((BigInt(time - EPOCH) << 22n) + 1n).toString();
const guilds = Object.fromEntries(
  names.map((name, i) => [String(i + 1), { id: String(i + 1), name }]),
) as { [id: string]: Guild };
const initial = names.slice(0, 7).map((name, i) =>
  mergeObservation(
    {
      guildId: String(i + 1),
      name,
      icon: null,
      size: {
        value: [42318, 95, 2120, 640, 8200, 43, 1500][i],
        accuracy: "approximate",
      },
      newestMessageId: ids(now - ((ages[i] ?? 1) + 1) * DAY),
      sourceChannelId: String(100 + i),
      lastVisibleActivity: now - ((ages[i] ?? 1) + 1) * DAY,
      lastScanned: now - 60000,
      evidence: {
        expected: 1,
        inspected: 1,
        missing: 0,
        threads: 0,
        forums: 0,
        threadCoverage: "loaded-only",
        issues: [],
      },
    },
    undefined,
    i === 3,
  ),
);
const data = new Map<string, unknown>([
  [
    "cache:999",
    {
      schemaVersion: 1,
      keeps: ["4"],
      current: { at: now - 60000, durationMs: 12, records: initial },
      previous: null,
    },
  ],
]);
const stores: Stores = {
  GuildStore: { getGuilds: () => guilds },
  UserStore: { getCurrentUser: () => ({ id: "999" }) },
  PermissionStore: { can: () => true },
  ActiveJoinedThreadsStore: { getActiveJoinedThreadsForGuild: () => ({}) },
  GuildMemberCountStore: {
    getMemberCount: (id) =>
      [42318, 95, 2120, 640, 8200, 43, 1500, null][Number(id) - 1],
  },
  ChannelStore: {
    getChannel: () => undefined,
    getMutableGuildChannelsForGuild: (id) => {
      const age = ages[Number(id) - 1];
      return id === "6" || age === null
        ? {}
        : {
            [String(100 + Number(id))]: {
              id: String(100 + Number(id)),
              guild_id: id,
              type: 0,
              lastMessageId: ids(now - age * DAY),
            },
          };
    },
  },
};
const controller = new Controller(() => stores, {
  load: async (key) => data.get(key),
  save: async (key, value) => {
    data.set(key, value);
  },
});
await controller.start();
const Dashboard = createDashboard(React, controller, { open: () => true });
createRoot(document.getElementById("app")!).render(
  <>
    <div
      style={{
        color: "#ffe3a8",
        background: "#3e3420",
        padding: 12,
        textAlign: "center",
        font: "14px system-ui",
      }}
    >
      SYNTHETIC DEMONSTRATION DATA · UI preview only · Not a live Discord scan
    </div>
    <Dashboard />
  </>,
);
