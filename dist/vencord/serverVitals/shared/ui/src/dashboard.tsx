import type * as ReactTypes from "react";
import {
  category,
  exportCSV,
  exportJSON,
  FILTERS,
  formatSize,
  relativeTime,
  selectRecords,
  SORTS,
  statistics,
  VERSION,
} from "../../core/src/index";
import type { Controller } from "../../discord/src/controller";

export interface Navigation {
  open(guildId: string, channelId?: string | null): boolean;
}
export function createDashboard(
  React: typeof ReactTypes,
  controller: Controller,
  navigation: Navigation,
) {
  function download(format: "csv" | "json") {
    const records = (controller.cache.current?.records ?? []).map((r) => ({
      ...r,
      category: category(
        r.lastVisibleActivity,
        Date.now(),
        controller.settings.thresholds,
      ),
    }));
    const content = format === "csv" ? exportCSV(records) : exportJSON(records);
    const url = URL.createObjectURL(
      new Blob([content], {
        type: format === "csv" ? "text/csv;charset=utf-8" : "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ServerVitals-${new Date().toISOString().slice(0, 10)}.${format}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  class Boundary extends React.Component<
    { children: ReactTypes.ReactNode },
    { failed: boolean }
  > {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    render() {
      return this.state.failed ? (
        <p role="alert">
          ServerVitals could not render this view. Close it and check the
          repository for updates.
        </p>
      ) : (
        this.props.children
      );
    }
  }
  function Dashboard() {
    const revision = React.useSyncExternalStore(
      controller.subscribe,
      controller.getRevision,
      controller.getRevision,
    );
    const [search, setSearch] = React.useState("");
    const [sort, setSort] = React.useState<keyof typeof SORTS>("oldest");
    const [filters, setFilters] = React.useState<string[]>([]);
    const [ids, setIds] = React.useState<string[] | undefined>();
    const [page, setPage] = React.useState(0);
    const [tab, setTab] = React.useState("Servers");
    const [notice, setNotice] = React.useState("");
    const [thresholds, setThresholds] = React.useState(
      controller.settings.thresholds.join(", "),
    );
    const now = React.useMemo(() => Date.now(), [revision, tab]);
    const snapshot = controller.cache.current;
    const records = React.useMemo(
      () =>
        (snapshot?.records ?? []).map((r) => ({
          ...r,
          category: category(
            r.lastVisibleActivity,
            now,
            controller.settings.thresholds,
          ),
        })),
      [snapshot, controller.settings.thresholds, now],
    );
    const selected = React.useMemo(
      () =>
        selectRecords(
          records,
          {
            search,
            sort,
            filters,
            hideKeep: controller.settings.hideKeep,
            ids,
          },
          now,
        ),
      [records, search, sort, filters, ids, now, controller.settings.hideKeep],
    );
    const stats = React.useMemo(() => statistics(records, now), [records, now]);
    const changes = React.useMemo(
      () => controller.changes(),
      [snapshot, controller.cache.previous, controller.settings],
    );
    const groups = React.useMemo(() => {
      const map = new Map<string, typeof changes>();
      for (const change of changes)
        map.set(change.label, [...(map.get(change.label) ?? []), change]);
      return [...map.entries()];
    }, [changes]);
    React.useEffect(() => {
      setPage(0);
    }, [search, sort, filters, ids, controller.settings.hideKeep]);
    const pages = Math.max(1, Math.ceil(selected.length / 50));
    const currentPage = Math.min(page, pages - 1);
    const date = (value: number | null) =>
      value === null ? "Unknown" : new Date(value).toLocaleString();
    const navigate = (guildId: string, channelId?: string | null) => {
      if (!navigation.open(guildId, channelId))
        setNotice("Discord navigation is unavailable in this client version.");
    };
    return (
      <section className="sv-root" aria-label="ServerVitals dashboard">
        <style>{CSS}</style>
        <header className="sv-header">
          <div>
            <span className="sv-eyebrow">
              LOCAL SERVER OVERVIEW · {VERSION}
            </span>
            <h1>ServerVitals</h1>
            <p>Find the servers that have gone quiet.</p>
          </div>
          <div className="sv-scan">
            <strong>{records.length} Servers</strong>
            <span>
              Last Full Scan: {snapshot ? date(snapshot.at) : "Not scanned"}
            </span>
            <button
              disabled={!controller.enabled || controller.scanning}
              onClick={() => {
                void controller.refresh();
              }}
            >
              {controller.scanning ? "Inspecting metadata…" : "Check Now"}
            </button>
          </div>
        </header>
        <p className="sv-info">
          Last Visible Activity reflects metadata visible to your account.
          Missing private channels and unloaded threads limit coverage.
          ServerVitals never leaves servers.
        </p>
        {controller.error && (
          <p role="alert" className="sv-error">
            {controller.error}
          </p>
        )}
        {notice && (
          <p role="status">
            {notice} <button onClick={() => setNotice("")}>Dismiss</button>
          </p>
        )}
        <nav className="sv-tabs" aria-label="Dashboard sections">
          {[
            "Servers",
            "Statistics",
            "What Changed",
            "Diagnostics",
            "Settings",
            "Privacy",
          ].map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        {tab === "Servers" && (
          <>
            <div className="sv-stats">
              {[
                "Total Servers",
                "Active Today",
                "Inactive 30+ Days",
                "Inactive 6+ Months",
                "Dormant 1+ Year",
                "Unknown Activity",
              ].map((key) => (
                <div key={key}>
                  <strong>{stats[key as keyof typeof stats]}</strong>
                  <span>{key}</span>
                </div>
              ))}
            </div>
            <div className="sv-controls">
              <label>
                Search servers
                <input
                  type="search"
                  placeholder="Search server names…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label>
                Sort by
                <select
                  value={sort}
                  onChange={(e) =>
                    setSort(e.target.value as keyof typeof SORTS)
                  }
                >
                  {Object.entries(SORTS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => download("csv")}>Export CSV (all)</button>
              <button onClick={() => download("json")}>
                Export JSON (all)
              </button>
            </div>
            <details className="sv-filters">
              <summary>
                Filters{" "}
                {filters.length
                  ? `(${filters.length} combined with AND)`
                  : "(All)"}
              </summary>
              <div>
                {FILTERS.filter((f) => f !== "All").map((f) => (
                  <label key={f}>
                    <input
                      type="checkbox"
                      checked={filters.includes(f)}
                      onChange={() =>
                        setFilters(
                          filters.includes(f)
                            ? filters.filter((x) => x !== f)
                            : [...filters, f],
                        )
                      }
                    />
                    {f}
                  </label>
                ))}
              </div>
              <button
                onClick={() => {
                  setFilters([]);
                  setIds(undefined);
                }}
              >
                Clear filters
              </button>
            </details>
            {ids && (
              <p>
                Showing servers from a scan change.{" "}
                <button onClick={() => setIds(undefined)}>
                  Show all servers
                </button>
              </p>
            )}
            <p>
              {selected.length} matching servers ·{" "}
              {controller.settings.hideKeep
                ? "Keep servers hidden"
                : "Keep servers included"}
            </p>
            <div className="sv-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Server</th>
                    {controller.settings.showSize && <th>Server Size</th>}
                    <th>Last Visible Activity</th>
                    <th>Last Scanned</th>
                    <th>Status</th>
                    <th>Freshness</th>
                    <th>Confidence</th>
                    <th>Channels</th>
                    <th>Keep</th>
                  </tr>
                </thead>
                <tbody>
                  {selected
                    .slice(currentPage * 50, (currentPage + 1) * 50)
                    .map((r) => (
                      <tr key={r.guildId}>
                        <td>
                          <div className="sv-server">
                            {r.icon ? (
                              <img
                                src={r.icon}
                                alt=""
                                loading="lazy"
                                width={32}
                                height={32}
                              />
                            ) : (
                              <span className="sv-icon" aria-hidden="true">
                                {r.name.slice(0, 1)}
                              </span>
                            )}
                            <button
                              className="sv-name"
                              onClick={() => navigate(r.guildId)}
                            >
                              {r.name}
                            </button>
                          </div>
                          {r.sourceChannelId && (
                            <button
                              className="sv-link"
                              onClick={() =>
                                navigate(r.guildId, r.sourceChannelId)
                              }
                            >
                              Open Last Active Channel
                            </button>
                          )}
                        </td>
                        {controller.settings.showSize && (
                          <td
                            title={
                              r.size.accuracy === "exact"
                                ? "Explicit member count from loaded guild metadata"
                                : "Approximate count from loaded Discord metadata"
                            }
                          >
                            {formatSize(r.size)}
                            <small>
                              {r.size.accuracy}
                              {r.size.cached ? " · cached" : ""}
                            </small>
                          </td>
                        )}
                        <td title={date(r.lastVisibleActivity)}>
                          {relativeTime(r.lastVisibleActivity, now)}
                        </td>
                        <td title={date(r.lastScanned)}>
                          {relativeTime(r.lastScanned, now)}
                        </td>
                        <td>{r.category}</td>
                        <td>
                          <span
                            className={`sv-badge sv-${r.freshness.toLowerCase()}`}
                            title={
                              r.freshness === "CACHED"
                                ? "Retained from an earlier observation; current metadata could not confirm it"
                                : "Current metadata inspected; PARTIAL indicates coverage gaps"
                            }
                          >
                            {r.freshness}
                          </span>
                        </td>
                        <td>
                          <span
                            className="sv-badge"
                            title={`Coverage score ${r.confidenceScore}/100. ${r.evidence.inspected}/${r.evidence.expected} loaded sources supplied valid IDs. Threads: ${r.evidence.threadCoverage}. ${r.evidence.issues.join(". ")}`}
                          >
                            {r.confidence}
                          </span>
                        </td>
                        <td
                          title={`${r.evidence.missing} missing; ${r.evidence.threads} loaded threads; ${r.evidence.forums} forums`}
                        >
                          {r.evidence.inspected}/{r.evidence.expected}
                        </td>
                        <td>
                          <button
                            aria-label={`Keep ${r.name}`}
                            aria-pressed={r.keep}
                            onClick={() => {
                              void controller.toggleKeep(r.guildId);
                            }}
                          >
                            {r.keep ? "★ Keep" : "☆ Keep"}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!selected.length && (
              <p className="sv-empty">
                {snapshot
                  ? "No servers match this view."
                  : "Check Now to inspect currently loaded Discord metadata."}
              </p>
            )}
            <div className="sv-controls">
              <button
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>
              <span>
                Page {currentPage + 1} of {pages}
              </span>
              <button
                disabled={currentPage + 1 >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
        {tab === "Statistics" && (
          <>
            <h2>Statistics Dashboard</h2>
            <p>
              Totals cover the full server list, including Keep servers.
              Inactivity bands overlap. “Today” is a rolling 24 hours; six
              months means 180 days.
            </p>
            <div className="sv-stats">
              {Object.entries(stats).map(([name, value]) => (
                <div key={name}>
                  <strong>{value ?? "—"}</strong>
                  <span>{name}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "What Changed" && (
          <>
            <h2>What Changed Since Last Scan</h2>
            <p>
              {controller.cache.previous
                ? `${date(controller.cache.previous.at)} → ${date(snapshot?.at ?? null)}`
                : "Complete two full scans to compare results."}
            </p>
            <p>
              Changes describe local observations and time thresholds, not proof
              of server abandonment.
            </p>
            <ul className="sv-changes">
              {groups.map(([label, events]) => (
                <li key={label}>
                  <button
                    onClick={() => {
                      setIds([...new Set(events.map((e) => e.guildId))]);
                      setFilters([]);
                      setSearch("");
                      setTab("Servers");
                    }}
                  >
                    {events.length} · {label}
                  </button>
                  <small>{events.map((e) => e.name).join(", ")}</small>
                </li>
              ))}
            </ul>
            {controller.cache.previous && !changes.length && (
              <p>No meaningful changes.</p>
            )}
            <p>
              Removed servers remain named here for this comparison; they cannot
              be opened from the current list.
            </p>
          </>
        )}
        {tab === "Diagnostics" && (
          <>
            <h2>Local diagnostics</h2>
            <dl>
              {Object.entries({
                "Guilds discovered": records.length,
                "Guilds scanned": records.length,
                "Visible channels scanned": stats["Visible Channels Scanned"],
                "Thread sources scanned": records.reduce(
                  (s, r) => s + r.evidence.threads,
                  0,
                ),
                "Forum sources scanned": records.reduce(
                  (s, r) => s + r.evidence.forums,
                  0,
                ),
                "Live results": records.filter((r) => r.freshness === "LIVE")
                  .length,
                "Cached results": stats["Cached Results"],
                "Partial results": stats["Partial Results"],
                "Unknown results": stats["Unknown Activity"],
                "Latest scan ms": snapshot?.durationMs ?? "—",
                "Average session scan ms": controller.scanTimes.length
                  ? Math.round(
                      controller.scanTimes.reduce((a, b) => a + b, 0) /
                        controller.scanTimes.length,
                    )
                  : "—",
                "Cache bytes (UTF-8)": new TextEncoder().encode(
                  JSON.stringify(controller.cache),
                ).length,
                "Last full scan": date(snapshot?.at ?? null),
                ...Object.fromEntries(
                  Object.entries(controller.diagnostics).map(
                    ([name, found]) => [name, found ? "Found" : "Unavailable"],
                  ),
                ),
              }).map(([key, value]) => (
                <React.Fragment key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </React.Fragment>
              ))}
            </dl>
            <p>
              Only loaded thread coverage is available in this alpha. Modules
              are discovered once per enable.
            </p>
          </>
        )}
        {tab === "Settings" && (
          <>
            <h2>Settings</h2>
            <p>
              Scans run only when you click Check Now. Opening ServerVitals
              shows saved results.
            </p>
            <p>
              Activity cache:{" "}
              {new TextEncoder()
                .encode(JSON.stringify(controller.cache))
                .length.toLocaleString()}{" "}
              bytes (UTF-8 data). Includes at most the current and previous
              scan; repeated checks replace snapshots rather than append
              history. Storage containers may add overhead.
            </p>
            {(
              [
                ["debug", "Debug Mode (aggregate counts only)"],
                ["showSize", "Show Server Size column"],
                ["hideKeep", "Hide Keep servers from the server view"],
              ] as const
            ).map(([key, label]) => (
              <label className="sv-setting" key={key}>
                <input
                  type="checkbox"
                  checked={controller.settings[key]}
                  onChange={(e) => {
                    void controller.updateSettings({ [key]: e.target.checked });
                  }}
                />
                {label}
              </label>
            ))}
            <label className="sv-setting">
              Category thresholds in days (four increasing numbers)
              <input
                value={thresholds}
                onChange={(e) => setThresholds(e.target.value)}
              />
            </label>
            <button
              onClick={() => {
                const values = thresholds
                  .split(",")
                  .map((v) => Number(v.trim()));
                if (
                  values.length !== 4 ||
                  !values.every(
                    (n, i) =>
                      Number.isFinite(n) &&
                      n >= 1 &&
                      n <= 36500 &&
                      (i === 0 || n > values[i - 1]),
                  )
                ) {
                  setNotice(
                    "Enter four increasing day thresholds, for example 7, 30, 180, 365.",
                  );
                  return;
                }
                void controller.updateSettings({
                  thresholds: values as [number, number, number, number],
                });
                setNotice(
                  "Category thresholds saved. Statistics retain their named day ranges.",
                );
              }}
            >
              Save thresholds
            </button>
            <details className="sv-reset">
              <summary>Reset activity cache</summary>
              <p>
                This clears current and previous observations, preserves Keep,
                and leaves the cache empty until you click Check Now. Older
                activity may then be unknown.
              </p>
              <button
                disabled={controller.scanning}
                onClick={() => {
                  void controller.resetCache();
                }}
              >
                Clear activity cache
              </button>
            </details>
          </>
        )}
        {tab === "Privacy" && (
          <>
            <h2>Privacy & accuracy</h2>
            <p>
              ServerVitals runs locally. It has no backend, analytics or
              telemetry. It does not access authentication tokens or read or
              cache message contents. Normal scanning sends zero network/API
              requests. Displaying server icons may load them from Discord’s
              CDN.
            </p>
            <p>
              Last Visible Activity is the newest trustworthy message Snowflake
              found in permitted, loaded channel metadata. Private channels and
              unloaded/archived threads are outside the observation. LIVE
              describes a local scan, not a fresh server response.
            </p>
            <h2>AI Development Disclosure</h2>
            <p>
              The initial ServerVitals codebase is 100% AI generated using
              OpenAI Codex. Future human contributions may change the codebase.
              Stable releases require the maintainer’s manual installation,
              testing and evaluation.
            </p>
            <p>This alpha has not completed that manual stability checklist.</p>
            <p>
              ServerVitals is independent and unofficial, and is not affiliated
              with, endorsed by, sponsored by, or officially supported by
              Discord Inc., BetterDiscord, or Vencord. Client modifications may
              conflict with Discord’s Terms or policies. Users install at their
              own discretion.
            </p>
          </>
        )}
        <footer>
          Independent · Unofficial · AI-generated initial implementation ·
          Testing build
        </footer>
      </section>
    );
  }
  return function SafeDashboard() {
    return (
      <Boundary>
        <Dashboard />
      </Boundary>
    );
  };
}
const CSS = `
.sv-root{color:var(--text-normal,#eceef5);background:var(--background-primary,#1c1e26);font:14px/1.5 system-ui,sans-serif;padding:24px;border-radius:12px;box-sizing:border-box;min-width:0;max-width:100%}
.sv-root *{box-sizing:border-box}.sv-root h1{font-size:32px;line-height:1.2;margin:8px 0}.sv-root h2{font-size:21px;margin:20px 0 12px}.sv-root p{margin:10px 0}.sv-root button,.sv-root select,.sv-root input:not([type=checkbox]){font:inherit;color:inherit;background:var(--background-secondary,#282c38);border:1px solid var(--background-modifier-accent,#555d70);border-radius:6px;padding:8px 11px}.sv-root button{cursor:pointer}.sv-root button:hover{border-color:#7f9fff}.sv-root button:focus-visible,.sv-root input:focus-visible,.sv-root select:focus-visible{outline:2px solid #9ab7ff;outline-offset:2px}.sv-root button:disabled{opacity:.5;cursor:default}.sv-root button[aria-pressed=true]{background:#354c75;border-color:#9ab7ff}.sv-header{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}.sv-eyebrow{font-size:11px;letter-spacing:1.4px;color:#a9bce4}.sv-scan{display:flex;flex-direction:column;align-items:flex-start;gap:6px}.sv-scan strong{font-size:22px}.sv-scan span,.sv-root small,.sv-root footer{color:var(--text-muted,#b3b7c7)}.sv-info{background:var(--background-secondary,#282c38);padding:12px;border-radius:6px}.sv-error{background:#522c36;padding:14px;border-radius:6px}.sv-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:20px 0}.sv-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:16px 0}.sv-stats>div{padding:14px;border:1px solid var(--background-modifier-accent,#41485b);border-radius:8px;background:var(--background-secondary,#242834)}.sv-stats strong{display:block;font-size:26px;color:#afc9ff}.sv-stats span{font-size:12px}.sv-controls{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:16px 0}.sv-controls label{display:flex;flex-direction:column;gap:5px}.sv-controls input{min-width:230px}.sv-filters{padding:10px;border:1px solid #48516a;border-radius:6px}.sv-filters>div{display:flex;flex-wrap:wrap;gap:12px;padding:12px 0}.sv-filters label,.sv-setting{display:flex;align-items:center;gap:8px}.sv-setting{margin:14px 0;flex-wrap:wrap}.sv-table-wrap{overflow:auto;max-height:58vh}.sv-root table{width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap}.sv-root th{text-align:left;color:var(--text-muted,#c1c7d7);background:var(--background-secondary,#282c38);position:sticky;top:0;z-index:1}.sv-root th,.sv-root td{padding:12px 9px;border-bottom:1px solid var(--background-modifier-accent,#363e51)}.sv-root td:first-child{min-width:200px;max-width:320px;white-space:normal}.sv-server{display:flex;align-items:center;gap:9px}.sv-server img,.sv-icon{width:32px;height:32px;border-radius:9px;object-fit:cover;flex-shrink:0}.sv-icon{display:grid;place-items:center;background:#3d4c6d}.sv-root .sv-name{padding:0;border:0;background:transparent;text-align:left;white-space:normal}.sv-root .sv-link{font-size:11px;border:0;background:transparent;color:#abc7ff;padding:4px 0}.sv-root small{display:block;font-size:11px;white-space:normal}.sv-badge{display:inline-block;font-size:10px;letter-spacing:.6px;font-weight:700;padding:4px 6px;border:1px solid #758099;border-radius:4px}.sv-live{color:#b2f4d1}.sv-cached{color:#ebc385}.sv-partial{color:#c1b5ff}.sv-unknown{color:#c8cbd4}.sv-root dl{display:grid;grid-template-columns:minmax(160px,1fr) 1fr;gap:8px}.sv-root dd{margin:0}.sv-changes{list-style:none;padding:0}.sv-changes li{padding:10px 0}.sv-reset{margin:24px 0}.sv-empty{padding:30px;text-align:center}.sv-root footer{font-size:11px;margin-top:24px;padding-top:12px;border-top:1px solid #41485b}
`;
