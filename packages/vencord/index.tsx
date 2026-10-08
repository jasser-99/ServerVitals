/*
 * ServerVitals, an independent custom userplugin
 * Copyright (c) 2026 ServerVitals contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import {
  ActiveJoinedThreadsStore,
  ChannelRouter,
  ChannelStore,
  closeModal,
  closeAllModals,
  GuildMemberCountStore,
  GuildStore,
  Modal,
  NavigationRouter,
  openModal,
  PermissionStore,
  React,
  ReadStateStore,
  UserStore,
  UserGuildJoinRequestStore,
} from "@webpack/common";
import { Controller } from "../discord/src/controller";
import type { Channel, Stores } from "../discord/src/scanner";
import { createDashboard } from "../ui/src/dashboard";

let controller: Controller | undefined;
let Dashboard: ReturnType<typeof createDashboard> | undefined;
let modalKey: string | undefined;
const guildActions = findByPropsLazy("leaveGuild") as {
  leaveGuild(id: string): Promise<void>;
};
const settings = definePluginSettings({
  debug: {
    type: OptionType.BOOLEAN,
    description: "Debug Mode: log aggregate scan counts only",
    default: false,
    onChange(value) {
      void controller?.updateSettings({ debug: value });
    },
  },
});
export default definePlugin({
  name: "ServerVitals",
  description:
    "Find the servers that have gone quiet. Independent alpha; initial implementation 100% AI generated. Version 0.1.6.",
  authors: [{ name: "ServerVitals contributors", id: 0n }],
  settings,
  start() {
    const stores = {
      GuildStore,
      ChannelStore,
      PermissionStore,
      ReadStateStore,
      GuildMemberCountStore,
      ActiveJoinedThreadsStore,
      UserStore,
      UserGuildJoinRequestStore,
    } as unknown as Stores;
    controller = new Controller(
      () => stores,
      {
        load: (key) => DataStore.get(`ServerVitals:${key}`),
        save: (key, value) => DataStore.set(`ServerVitals:${key}`, value),
      },
      (updated) => {
        if (settings.store.debug !== updated.debug)
          settings.store.debug = updated.debug;
      },
    );
    Dashboard = createDashboard(React, controller, {
      leave: async (id) => {
        await guildActions.leaveGuild(id);
      },
      open(guildId, channelId) {
        try {
          if (!stores.GuildStore?.getGuilds()[guildId]) return false;
          if (channelId) {
            const c = stores.ChannelStore?.getChannel(channelId) as
              Channel | undefined;
            if (
              !c ||
              (c.guild_id ?? c.guildId) !== guildId ||
              !stores.PermissionStore?.can(1024n, c)
            )
              return false;
            ChannelRouter.transitionToChannel(channelId);
          } else {
            NavigationRouter.transitionToGuild(guildId);
          }
          if (modalKey) closeModal(modalKey);
          modalKey = undefined;
          closeAllModals();
          return true;
        } catch {
          return false;
        }
      },
    });
    const instance = controller;
    void instance.start().then(() => {
      if (controller === instance && instance.enabled)
        void instance.updateSettings({
          debug: settings.store.debug,
        });
    });
  },
  stop() {
    controller?.stop();
    controller = undefined;
    Dashboard = undefined;
    if (modalKey) closeModal(modalKey);
    modalKey = undefined;
  },
  settingsAboutComponent() {
    return (
      <div>
        <p>
          Independent testing build · 0.1.6 · Initial implementation 100% AI
          generated.
        </p>
        <button
          disabled={!controller?.enabled}
          onClick={() => {
            if (!Dashboard) return;
            if (modalKey) closeModal(modalKey);
            const Content = Dashboard;
            modalKey = openModal(
              (props) => (
                <Modal {...props} title="ServerVitals" size="xxl">
                  <Content />
                </Modal>
              ),
              {
                onCloseCallback: () => {
                  modalKey = undefined;
                },
              },
            );
          }}
        >
          Open ServerVitals
        </button>
        <p>
          Local metadata only. No tokens, message contents or telemetry. Report
          ServerVitals issues to its own repository.
        </p>
      </div>
    );
  },
});
