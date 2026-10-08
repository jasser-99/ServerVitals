import {
  compareScans,
  emptyCache,
  mergeObservation,
  migrateSettings,
  VERSION,
} from "../../core/src/index";
import { readCache } from "../../core/src/storage";
import type { Cache, Settings, Snapshot } from "../../core/src/model";
import { accountId, scanAll, storeStatus, type Stores } from "./scanner";

export interface Storage {
  load(key: string): Promise<unknown>;
  save(key: string, value: unknown): Promise<void>;
}
export class Controller {
  cache: Cache = emptyCache();
  settings = migrateSettings(null);
  scanning = false;
  enabled = false;
  error: string | null = null;
  diagnostics: { [name: string]: boolean } = {};
  scanTimes: number[] = [];
  private listeners = new Set<() => void>();
  private generation = 0;
  private account = "";
  private writeQueue: Promise<void> = Promise.resolve();
  private revision = 0;
  private baseline: Snapshot | null = null;
  private accountListener = () => {
    try {
      if (accountId(this.stores) === this.account) return;
    } catch {
      /* Logged out. */
    }
    this.stop();
    this.error =
      "Discord account changed. Re-enable ServerVitals to load this account's separate cache.";
    this.emit();
  };
  getRevision = () => this.revision;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  constructor(
    private discover: () => Stores,
    private storage: Storage,
    private settingsChanged?: (settings: Settings) => void,
  ) {}
  private stores: Stores = {};
  private emit() {
    this.revision++;
    for (const listener of this.listeners) listener();
  }
  async start() {
    const generation = ++this.generation;
    this.enabled = true;
    try {
      this.stores = this.discover();
      this.diagnostics = storeStatus(this.stores);
      this.account = accountId(this.stores);
      const [settings, cache] = await Promise.all([
        this.storage.load(`settings:${this.account}`),
        this.storage.load(`cache:${this.account}`),
      ]);
      if (!this.enabled || this.generation !== generation) return;
      this.settings = migrateSettings(settings);
      this.cache = readCache(cache);
      this.baseline = this.cache.current;
      if (this.cache.current)
        this.cache.current = {
          ...this.cache.current,
          records: this.cache.current.records.map((r) => ({
            ...r,
            freshness: r.lastVisibleActivity === null ? "UNKNOWN" : "CACHED",
            confidence:
              r.lastVisibleActivity === null
                ? "UNKNOWN"
                : r.observedConfidence === "HIGH" ||
                    r.observedConfidence === "MEDIUM"
                  ? "MEDIUM"
                  : "LOW",
            confidenceScore:
              r.lastVisibleActivity === null
                ? 0
                : r.observedConfidence === "HIGH" ||
                    r.observedConfidence === "MEDIUM"
                  ? 60
                  : 25,
            size: { ...r.size, cached: r.size.value !== null },
          })),
        };
      this.stores.UserStore?.addChangeListener?.(this.accountListener);
      this.emit();
    } catch {
      if (this.enabled && this.generation === generation) {
        this.error =
          "ServerVitals could not initialize Discord stores or local storage. Re-enable after Discord finishes loading. Check diagnostics and the ServerVitals repository for updates.";
        this.emit();
      }
    }
  }
  stop() {
    this.enabled = false;
    this.generation++;
    this.scanning = false;
    this.stores.UserStore?.removeChangeListener?.(this.accountListener);
    this.stores = {};
    this.cache = emptyCache();
    this.account = "";
    this.baseline = null;
    this.emit();
    this.listeners.clear();
  }
  private async save(kind: "cache" | "settings") {
    const key = `${kind}:${this.account}`;
    const value = JSON.parse(
      JSON.stringify(kind === "cache" ? this.cache : this.settings),
    );
    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(() => this.storage.save(key, value));
    try {
      await this.writeQueue;
    } catch {
      this.error =
        "Local storage could not be saved. Changes may not survive restart.";
      this.emit();
    }
  }
  async updateSettings(partial: Partial<Settings>) {
    if (!this.enabled || !this.account) return;
    this.settings = migrateSettings({ ...this.settings, ...partial });
    this.settingsChanged?.(this.settings);
    this.emit();
    await this.save("settings");
  }
  async toggleKeep(id: string) {
    if (!this.enabled || !this.account) return;
    const ids = new Set(this.cache.keeps);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    this.cache.keeps = [...ids];
    if (this.cache.current)
      this.cache.current = {
        ...this.cache.current,
        records: this.cache.current.records.map((r) => ({
          ...r,
          keep: ids.has(r.guildId),
        })),
      };
    this.emit();
    await this.save("cache");
  }
  async resetCache() {
    if (!this.enabled) return;
    this.cache = { ...emptyCache(), keeps: this.cache.keeps };
    this.baseline = null;
    this.emit();
    await this.save("cache");
  }
  async refresh() {
    if (!this.enabled || this.scanning) return;
    const generation = this.generation;
    this.scanning = true;
    this.error = null;
    this.emit();
    try {
      if (accountId(this.stores) !== this.account) {
        this.stop();
        this.error =
          "Discord account changed. Re-enable ServerVitals to load this account's separate cache.";
        return;
      }
      const scan = await scanAll(
        this.stores,
        () => !this.enabled || this.generation !== generation,
      );
      if (!this.enabled || this.generation !== generation) return;
      if (accountId(this.stores) !== this.account) {
        this.accountListener();
        return;
      }
      const old = new Map(
        this.cache.current?.records.map((r) => [r.guildId, r]) ?? [],
      );
      const current: Snapshot = {
        at: scan.at,
        durationMs: scan.durationMs,
        records: scan.observations.map((o) =>
          mergeObservation(
            o,
            old.get(o.guildId),
            this.cache.keeps.includes(o.guildId),
            this.settings,
          ),
        ),
      };
      this.cache.previous = this.baseline ?? this.cache.current;
      this.baseline = null;
      this.cache.current = current;
      const present = new Set(current.records.map((r) => r.guildId));
      this.cache.keeps = this.cache.keeps.filter((id) => present.has(id));
      this.scanTimes = [...this.scanTimes.slice(-19), scan.durationMs];
      if (this.settings.debug)
        console.info("[ServerVitals]", {
          version: VERSION,
          guilds: current.records.length,
          visibleChannels: current.records.reduce(
            (s, r) => s + (r.evidence.scanned ?? r.evidence.inspected),
            0,
          ),
          known: current.records.filter((r) => r.lastVisibleActivity !== null)
            .length,
          unknown: current.records.filter((r) => r.lastVisibleActivity === null)
            .length,
          cached: current.records.filter((r) => r.freshness === "CACHED")
            .length,
          partial: current.records.filter((r) => r.freshness === "PARTIAL")
            .length,
          durationMs: scan.durationMs,
        });
      await this.save("cache");
    } catch (error) {
      if (this.enabled && this.generation === generation)
        this.error =
          error instanceof Error &&
          error.message.startsWith("ServerVitals couldn't locate")
            ? error.message
            : "Activity scan failed. Previous results retained. Discord metadata may have changed; check the ServerVitals repository for updates.";
    } finally {
      if (this.generation === generation) {
        this.scanning = false;
        this.emit();
      }
    }
  }
  changes() {
    return compareScans(this.cache.previous, this.cache.current, this.settings);
  }
}
