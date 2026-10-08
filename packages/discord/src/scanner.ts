import { newestActivity, normalizeSize } from "../../core/src/index";
import type { Observation, Size } from "../../core/src/model";

export interface Channel {
  id: string;
  guild_id?: string;
  guildId?: string;
  type: number;
  parent_id?: string;
  lastMessageId?: unknown;
  last_message_id?: unknown;
}
export interface Guild {
  id: string;
  name: string;
  icon?: string;
  memberCount?: unknown;
  member_count?: unknown;
  approximateMemberCount?: unknown;
  approximate_member_count?: unknown;
  unavailable?: boolean;
  ownerId?: string;
  owner_id?: string;
}
export interface Stores {
  GuildStore?: { getGuilds(): { [id: string]: Guild } };
  ChannelStore?: {
    getMutableGuildChannelsForGuild(id: string): { [id: string]: Channel };
    getChannel(id: string): Channel | undefined;
  };
  PermissionStore?: { can(permission: bigint, channel: Channel): boolean };
  ReadStateStore?: { lastMessageId(id: string): unknown };
  GuildMemberCountStore?: { getMemberCount(id: string): unknown };
  ActiveJoinedThreadsStore?: {
    getActiveJoinedThreadsForGuild(id: string): unknown;
    getActiveUnjoinedThreadsForGuild?(id: string): unknown;
  };
  UserStore?: {
    getCurrentUser(): { id: string } | undefined;
    addChangeListener?(listener: () => void): void;
    removeChangeListener?(listener: () => void): void;
  };
}
export const REQUIRED = [
  "GuildStore",
  "ChannelStore",
  "PermissionStore",
  "UserStore",
] as const;
export const STORE_NAMES = [
  ...REQUIRED,
  "ReadStateStore",
  "GuildMemberCountStore",
  "ActiveJoinedThreadsStore",
] as const;
export const VIEW_CHANNEL = 1n << 10n;
export const READ_MESSAGE_HISTORY = 1n << 16n;
const supported = new Set([0, 2, 5, 10, 11, 12, 13, 15, 16]);
const threads = new Set([10, 11, 12]);
const forums = new Set([15, 16]);

export function storeStatus(stores: Stores): { [name: string]: boolean } {
  const methods = {
    GuildStore: "getGuilds",
    ChannelStore: "getMutableGuildChannelsForGuild",
    PermissionStore: "can",
    UserStore: "getCurrentUser",
    ReadStateStore: "lastMessageId",
    GuildMemberCountStore: "getMemberCount",
    ActiveJoinedThreadsStore: "getActiveJoinedThreadsForGuild",
  };
  return Object.fromEntries(
    STORE_NAMES.map((name) => {
      try {
        const store = stores[name] as { [key: string]: unknown } | undefined;
        return [name, typeof store?.[methods[name]] === "function"];
      } catch {
        return [name, false];
      }
    }),
  );
}
export function assertStores(stores: Stores): void {
  const status = storeStatus(stores);
  const missing = REQUIRED.filter((name) => !status[name]);
  if (missing.length)
    throw new Error(
      `ServerVitals couldn't locate required Discord stores: ${missing.join(", ")}. Check the ServerVitals repository for updates, then disable and re-enable the plugin.`,
    );
}
export function accountId(stores: Stores): string {
  const id = stores.UserStore?.getCurrentUser()?.id;
  if (!id || !/^\d+$/.test(id))
    throw new Error(
      "Discord account metadata is not ready. Re-enable ServerVitals after Discord finishes loading.",
    );
  return id;
}
function loadedThreads(raw: unknown): Channel[] {
  if (!raw || typeof raw !== "object") return [];
  const result: Channel[] = [];
  for (const group of Object.values(raw)) {
    if (!group || typeof group !== "object") continue;
    for (const item of Object.values(group)) {
      if (item && typeof item === "object" && "channel" in item) {
        const channel = item.channel as Channel;
        if (
          channel &&
          typeof channel.id === "string" &&
          threads.has(channel.type)
        )
          result.push(channel);
      }
    }
  }
  return result;
}
export function serverSize(guild: Guild, stores: Stores): Size {
  // The count store has no accuracy flag; conservatively label it approximate.
  const direct = normalizeSize(
    guild.memberCount ?? guild.member_count,
    "exact",
  );
  if (direct.value !== null) return direct;
  const approximate = normalizeSize(
    guild.approximateMemberCount ?? guild.approximate_member_count,
    "approximate",
  );
  if (approximate.value !== null) return approximate;
  try {
    return normalizeSize(
      stores.GuildMemberCountStore?.getMemberCount(guild.id),
      "approximate",
    );
  } catch {
    return normalizeSize(null, "unavailable");
  }
}
export function scanGuild(
  guild: Guild,
  stores: Stores,
  now: number,
): Observation {
  const evidence: Observation["evidence"] = {
    scanned: 0,
    expected: 0,
    inspected: 0,
    missing: 0,
    threads: 0,
    forums: 0,
    threadCoverage: "loaded-only",
    issues: [],
  };
  const result: Observation = {
    guildId: guild.id,
    name: guild.name,
    icon:
      guild.icon && /^[a-zA-Z0-9_]+$/.test(guild.icon)
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=64`
        : null,
    size: serverSize(guild, stores),
    newestMessageId: null,
    sourceChannelId: null,
    lastVisibleActivity: null,
    lastScanned: now,
    evidence,
  };
  if (guild.unavailable) {
    evidence.issues.push("Guild temporarily unavailable");
    return result;
  }
  let channels: Channel[];
  try {
    channels = Object.values(
      stores.ChannelStore!.getMutableGuildChannelsForGuild(guild.id),
    );
  } catch {
    evidence.issues.push("Channel enumeration failed");
    return result;
  }
  try {
    if (stores.ActiveJoinedThreadsStore) {
      channels.push(
        ...loadedThreads(
          stores.ActiveJoinedThreadsStore.getActiveJoinedThreadsForGuild(
            guild.id,
          ),
        ),
      );
      channels.push(
        ...loadedThreads(
          stores.ActiveJoinedThreadsStore.getActiveUnjoinedThreadsForGuild?.(
            guild.id,
          ),
        ),
      );
    } else evidence.issues.push("Loaded thread store unavailable");
  } catch {
    evidence.issues.push("Loaded thread enumeration failed");
  }
  const unique = new Map(
    channels.filter((c) => c && typeof c.id === "string").map((c) => [c.id, c]),
  );
  for (const c of unique.values()) {
    if ((c.guild_id ?? c.guildId) !== guild.id || c.type === 4) continue;
    let visible = false;
    try {
      visible =
        stores.PermissionStore!.can(VIEW_CHANNEL, c) &&
        stores.PermissionStore!.can(READ_MESSAGE_HISTORY, c);
    } catch {
      evidence.issues.push("Permission check failed");
      continue;
    }
    if (!visible) continue;
    evidence.expected++;
    if (!supported.has(c.type)) {
      evidence.missing++;
      continue;
    }
    evidence.scanned!++;
    if (threads.has(c.type)) evidence.threads++;
    if (forums.has(c.type)) evidence.forums++;
    let readId: unknown;
    try {
      readId = stores.ReadStateStore?.lastMessageId(c.id);
    } catch {
      evidence.issues.push("Read state metadata unavailable");
    }
    // A forum's last_message_id can identify a post/thread, not its newest reply.
    // Only loaded post/thread channels contribute message timestamps.
    const best = forums.has(c.type)
      ? null
      : newestActivity([c.lastMessageId, c.last_message_id, readId], now);
    if (best) {
      evidence.inspected++;
      if (
        !result.newestMessageId ||
        BigInt(best.id) > BigInt(result.newestMessageId)
      ) {
        result.newestMessageId = best.id;
        result.lastVisibleActivity = best.timestamp;
        result.sourceChannelId = c.id;
      }
    } else evidence.missing++;
  }
  evidence.issues = [...new Set(evidence.issues)];
  if (!evidence.expected)
    evidence.issues.push("No readable activity sources currently loaded");
  return result;
}
export async function scanAll(
  stores: Stores,
  cancelled: () => boolean = () => false,
): Promise<{ observations: Observation[]; durationMs: number; at: number }> {
  assertStores(stores);
  const start = performance.now();
  const guilds = Object.values(stores.GuildStore!.getGuilds());
  if (
    !guilds.every(
      (g) =>
        g &&
        typeof g.id === "string" &&
        /^\d+$/.test(g.id) &&
        typeof g.name === "string",
    )
  )
    throw new Error(
      "Discord guild metadata changed shape. Previous scan retained.",
    );
  const observations: Observation[] = [];
  for (let i = 0; i < guilds.length; i++) {
    if (cancelled()) throw new Error("Scan cancelled");
    observations.push(scanGuild(guilds[i], stores, Date.now()));
    if ((i + 1) % 20 === 0)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (cancelled()) throw new Error("Scan cancelled");
  return {
    observations,
    durationMs: Math.round(performance.now() - start),
    at: Date.now(),
  };
}
