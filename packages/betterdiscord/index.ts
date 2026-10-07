import type * as ReactTypes from "react";
import { Controller } from "../discord/src/controller";
import { STORE_NAMES, type Channel, type Stores } from "../discord/src/scanner";
import { createDashboard } from "../ui/src/dashboard";

interface BdAPI {
  React: typeof ReactTypes;
  Webpack: {
    getStore(name: string): unknown;
    getModule(
      filter: (value: unknown) => boolean,
      options: { searchExports: boolean },
    ): unknown;
  };
  Data: {
    load(plugin: string, key: string): unknown;
    save(plugin: string, key: string, value: unknown): void;
  };
}
declare const BdApi: BdAPI;
class ServerVitals {
  private controller?: Controller;
  private Dashboard?: ReturnType<typeof createDashboard>;
  start() {
    const findNavigation = (signature: string) =>
      BdApi.Webpack.getModule(
        (value) =>
          typeof value === "function" &&
          Function.prototype.toString.call(value).includes(signature),
        { searchExports: true },
      ) as ((id: string) => void) | undefined;
    const toGuild = findNavigation("transitionToGuild -");
    const toChannel = findNavigation(".openTextInVoiceIfVoiceChannel");
    let stores: Stores = {};
    this.controller = new Controller(
      () => {
        stores = Object.fromEntries(
          STORE_NAMES.map((name) => {
            try {
              return [name, BdApi.Webpack.getStore(name)];
            } catch {
              return [name, undefined];
            }
          }),
        ) as Stores;
        return stores;
      },
      {
        load: async (key) => BdApi.Data.load("ServerVitals", key),
        save: async (key, value) => BdApi.Data.save("ServerVitals", key, value),
      },
    );
    this.Dashboard = createDashboard(BdApi.React, this.controller, {
      open(guildId, channelId) {
        try {
          const guild = stores.GuildStore?.getGuilds()[guildId];
          if (!guild) return false;
          if (channelId) {
            const channel: Channel | undefined =
              stores.ChannelStore?.getChannel(channelId);
            if (
              !channel ||
              (channel.guild_id ?? channel.guildId) !== guildId ||
              !stores.PermissionStore?.can(1024n, channel)
            )
              return false;
            if (!toChannel) return false;
            toChannel(channelId);
          } else {
            if (!toGuild) return false;
            toGuild(guildId);
          }
          return true;
        } catch {
          return false;
        }
      },
    });
    void this.controller.start();
  }
  stop() {
    this.controller?.stop();
    this.controller = undefined;
    this.Dashboard = undefined;
  }
  getSettingsPanel() {
    const React = BdApi.React;
    if (!this.Dashboard)
      return React.createElement(
        "p",
        null,
        "Enable ServerVitals to open the dashboard.",
      );
    const Dashboard = this.Dashboard;
    function Panel() {
      const [open, setOpen] = React.useState(false);
      return React.createElement(
        "div",
        null,
        React.createElement(
          "button",
          {
            onClick: () => setOpen(!open),
            style: { padding: "10px 18px", cursor: "pointer" },
          },
          open ? "Close ServerVitals" : "Open ServerVitals",
        ),
        open && React.createElement(Dashboard),
      );
    }
    return React.createElement(Panel);
  }
}
// A normal BetterDiscord CommonJS export after bundling.
module.exports = ServerVitals;
