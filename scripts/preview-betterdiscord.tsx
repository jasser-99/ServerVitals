// Synthetic BetterDiscord host: exercises the actual distributed plugin UI.
import * as React from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";

const root = createRoot(document.getElementById("app")!);
const state = {
  channelId: "",
  dismiss() {
    root.render(<h1>Opened channel {state.channelId}</h1>);
  },
};
// Match minified Discord source signatures without depending on host internals.
const toChannel = new Function(
  "state",
  'return function(id){state.channelId=id;return ".openTextInVoiceIfVoiceChannel";}',
)(state);
const closeAll = new Function(
  "state",
  "return function(){const store={getState:()=>({settings:true})};const data=store.getState();for(const key in data){if(key)state.dismiss();}}",
)(state);
const data = new Map();
const guilds: { [id: string]: { id: string; name: string } } = {
  "1": { id: "1", name: "Test server" },
};
const guildActions = {
  leaveGuild: async (id: string) => {
    delete guilds[id];
  },
};
const channel = {
  id: "100",
  guild_id: "1",
  type: 0,
  lastMessageId: (
    (BigInt(Date.now() - 1000) - 1420070400000n) <<
    22n
  ).toString(),
};
const stores: { [key: string]: unknown } = {
  GuildStore: { getGuilds: () => guilds },
  ChannelStore: {
    getChannel: (id: string) => (id === channel.id ? channel : undefined),
    getMutableGuildChannelsForGuild: () => ({ "100": channel }),
  },
  PermissionStore: { can: () => true },
  UserStore: { getCurrentUser: () => ({ id: "999" }) },
};
const api = {
  React,
  ReactDOM: { createPortal },
  Webpack: {
    getStore: (name: string) => stores[name],
    getModule: (filter: (value: unknown) => boolean) =>
      [toChannel, closeAll, guildActions].find(filter),
  },
  Data: {
    load: (_plugin: string, key: string) => data.get(key),
    save: (_plugin: string, key: string, value: unknown) =>
      data.set(key, value),
  },
};
const code = await (await fetch("/betterdiscord.js")).text();
const module = { exports: undefined as unknown };
new Function("module", "BdApi", code)(module, api);
const Plugin = module.exports as new () => {
  start(): void;
  getSettingsPanel(): React.ReactNode;
};
const plugin = new Plugin();
plugin.start();
await new Promise((resolve) => setTimeout(resolve, 10));
root.render(
  <div data-testid="discord-settings">
    Discord Settings
    <div
      data-testid="plugin-settings"
      className="bd-modal-root"
      style={{
        width: 600,
        height: 400,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ overflow: "auto" }}>{plugin.getSettingsPanel()}</div>
    </div>
  </div>,
);
