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
  private closeDashboard?: () => void;
  start() {
    const findNavigation = (...signatures: string[]) =>
      BdApi.Webpack.getModule(
        (value) =>
          typeof value === "function" &&
          signatures.every((signature) =>
            Function.prototype.toString.call(value).includes(signature),
          ),
        { searchExports: true },
      ) as ((id: string) => void) | undefined;
    const toGuild = findNavigation("transitionToGuild -");
    const toChannel = findNavigation(".openTextInVoiceIfVoiceChannel");
    const transitionTo = findNavigation("transitionTo - Transitioning to");
    const closeAllModals = findNavigation(".getState();for", " in ") as
      (() => void) | undefined;
    let stores: Stores = {};
    const guildActions = BdApi.Webpack.getModule(
      (value) =>
        !!value &&
        typeof (value as { leaveGuild?: unknown }).leaveGuild === "function",
      { searchExports: true },
    ) as { leaveGuild(id: string): Promise<void> } | undefined;
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
      leave: guildActions
        ? async (id) => {
            await guildActions.leaveGuild(id);
          }
        : undefined,
      open: (guildId, channelId) => {
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
            if (toChannel) toChannel(channelId);
            else if (transitionTo)
              transitionTo(`/channels/${guildId}/${channelId}`);
            else return false;
          } else {
            if (!toGuild) return false;
            toGuild(guildId);
          }
          this.closeDashboard?.();
          // Discord's settings overlay can otherwise hide a successful transition.
          try {
            closeAllModals?.();
          } catch {
            // Navigation succeeded; settings dismissal is optional.
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
    this.closeDashboard?.();
    this.closeDashboard = undefined;
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
    const controller = this.controller!;
    const Panel = () => {
      const [open, setOpen] = React.useState(false);
      const container = React.useRef<HTMLDivElement>(null);
      React.useEffect(() => {
        const close = () => setOpen(false);
        this.closeDashboard = close;
        return () => {
          if (this.closeDashboard === close) this.closeDashboard = undefined;
        };
      }, []);
      React.useSyncExternalStore(
        controller.subscribe,
        controller.getRevision,
        controller.getRevision,
      );
      React.useLayoutEffect(() => {
        if (!open) return;
        // Keep the dashboard inside BetterDiscord's actual FocusLock boundary.
        const modal = container.current?.closest<HTMLElement>(".bd-modal-root");
        if (!modal) return;
        const properties = ["width", "max-width", "height", "max-height"];
        const saved = properties.map((key) => [
          key,
          modal.style.getPropertyValue(key),
          modal.style.getPropertyPriority(key),
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
            style: { padding: "10px 18px", cursor: "pointer" },
          },
          open ? "Close ServerVitals" : "Open ServerVitals",
        ),
        open &&
          controller.enabled &&
          React.createElement(
            "div",
            {
              role: "region",
              "aria-label": "ServerVitals",
              style: { width: "100%" },
            },
            React.createElement(Dashboard),
          ),
      );
    };
    return React.createElement(Panel);
  }
}
// A normal BetterDiscord CommonJS export after bundling.
module.exports = ServerVitals;
