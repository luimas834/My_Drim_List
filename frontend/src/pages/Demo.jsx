import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Api, errMsg } from "../api";
import { Card, Btn, Banner, Concept } from "../ui";

export default function Demo() {
  const [healthData, setHealthData] = useState(null);
  const [healthErr, setHealthErr] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [refreshMsg, setRefreshMsg] = useState(null);
  const [refreshErr, setRefreshErr] = useState(null);
  const [refreshLoading, setRefreshLoading] = useState(false);

  const [months, setMonths] = useState(6);
  const [dropNotice, setDropNotice] = useState(null);
  const [dropErr, setDropErr] = useState(null);
  const [dropLoading, setDropLoading] = useState(false);

  const handlePingHealth = async () => {
    setHealthLoading(true);
    setHealthErr(null);
    try {
      const data = await Api.health();
      setHealthData(data);
    } catch (e) {
      setHealthErr(errMsg(e));
    } finally {
      setHealthLoading(false);
    }
  };

  const handleRefreshMatview = async () => {
    setRefreshLoading(true);
    setRefreshErr(null);
    setRefreshMsg(null);
    try {
      const res = await Api.refreshMatview();
      setRefreshMsg(`Success: ${res.refreshed} refreshed!`);
    } catch (e) {
      setRefreshErr(errMsg(e));
    } finally {
      setRefreshLoading(false);
    }
  };

  const handleBulkDrop = async () => {
    setDropLoading(true);
    setDropErr(null);
    setDropNotice(null);
    try {
      const res = await Api.bulkDrop(Number(months));
      setDropNotice(res.notice || "Procedure executed.");
    } catch (e) {
      setDropErr(errMsg(e));
    } finally {
      setDropLoading(false);
    }
  };

  const cheatSheet = [
    { click: "Trending row", concept: "Multi-JOIN + 7-day window aggregation", path: "/" },
    { click: "Top by genre", concept: "MATERIALIZED VIEW + RANK() OVER (PARTITION BY)", path: "/" },
    { click: "Refresh matview", concept: "RECOMPUTE MATERIALIZED VIEW top_by_genre", path: "/demo" },
    { click: "Browse / search", concept: "Regular VIEW anime_card_view + STRING_AGG", path: "/browse" },
    { click: "Watch final episode", concept: "BEFORE trigger chain (trg_a_episode_check → trg_b_finish_date)", path: "/anime/1" },
    { click: "Uncompleted review", concept: "BEFORE INSERT trigger (trg_review_guard + RAISE EXCEPTION)", path: "/anime/1" },
    { click: "Review post", concept: "AFTER trigger updating anime.score aggregate", path: "/anime/1" },
    { click: "Review edit", concept: "Conditional WHEN BEFORE trigger stamping is_edited", path: "/anime/1" },
    { click: "Helpful vote", concept: "Stored PROCEDURE cast_helpful_vote + DUPLICATE_VOTE exception", path: "/anime/1" },
    { click: "Follow user", concept: "Self-referential M:N + notify_new_follower trigger", path: "/profile/1" },
    { click: "Follow self", concept: "CHECK constraint AND BEFORE trigger blocking self-follow", path: "/profile/1" },
    { click: "Notifications", concept: "AFTER triggers fn_notify_new_follower & fn_notify_new_review", path: "/my-list" },
    { click: "Activity log", concept: "AFTER trigger fn_log_watchlist writing to logging table", path: "/my-list" },
    { click: "Stat tiles", concept: "PL/pgSQL function get_user_stats (RETURNS TABLE)", path: "/profile/1" },
    { click: "Recommendations", concept: "PL/pgSQL function recommend_anime (explicit CURSOR + TEMP TABLE)", path: "/profile/1" },
    { click: "Watch history", concept: "Keyset pagination get_watch_history(user_id, after, limit)", path: "/profile/1" },
    { click: "Remove watchlist", concept: "ON DELETE CASCADE + trg_review_cleanup", path: "/my-list" },
    { click: "Bulk drop inactive", concept: "Batch PROCEDURE bulk_drop_inactive + GET DIAGNOSTICS ROW_COUNT", path: "/demo" },
  ];

  return (
    <div className="space-y-10 py-6">
      <div>
        <h1 className="text-3xl font-extrabold text-accent">Demo & Viva Control Panel</h1>
        <p className="text-sm text-muted">Cheat sheet and maintenance administrative tools for presentation demo</p>
      </div>

      {/* Admin Maintenance Tools */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Health & Matview */}
        <Card className="space-y-4">
          <h2 className="text-lg font-bold text-text">Database Maintenance</h2>

          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-sm text-text block">Refresh Materialized View</span>
                <Concept>Executes REFRESH MATERIALIZED VIEW top_by_genre</Concept>
              </div>
              <Btn onClick={handleRefreshMatview} disabled={refreshLoading}>
                {refreshLoading ? "Refreshing..." : "Refresh Matview"}
              </Btn>
            </div>
            <Banner type="ok" message={refreshMsg} />
            <Banner type="err" message={refreshErr} />
          </div>

          <div className="space-y-2 pt-4 border-t border-line">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-sm text-text block">API Health Check</span>
                <span className="text-xs text-muted block font-mono">{import.meta.env.VITE_API_URL}</span>
              </div>
              <Btn variant="ghost" onClick={handlePingHealth} disabled={healthLoading}>
                Ping /health
              </Btn>
            </div>
            <Banner type="err" message={healthErr} />
            {healthData && (
              <pre className="bg-bg p-2 rounded text-xs font-mono text-emerald-400 border border-line">
                {JSON.stringify(healthData, null, 2)}
              </pre>
            )}
          </div>
        </Card>

        {/* Bulk Drop Procedure */}
        <Card className="space-y-4">
          <h2 className="text-lg font-bold text-text">Batch Stored Procedure Demo</h2>

          <div className="space-y-3">
            <div>
              <span className="font-semibold text-sm text-text block">CALL bulk_drop_inactive(months)</span>
              <Concept>Demonstrates GET DIAGNOSTICS ROW_COUNT via RAISE NOTICE in PostgreSQL</Concept>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs text-muted font-semibold uppercase">Months inactive:</label>
              <input
                type="number"
                min="0"
                className="w-24 bg-bg border border-line rounded px-3 py-1.5 text-sm text-text outline-none focus:border-accent"
                value={months}
                onChange={(e) => setMonths(e.target.value)}
              />
              <Btn onClick={handleBulkDrop} disabled={dropLoading}>
                {dropLoading ? "Executing..." : "Run Procedure"}
              </Btn>
            </div>

            <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/80 p-2.5 rounded">
              ⚠️ <strong>Warning:</strong> setting months = 0 drops every non-completed entry for all users. Run this at the end of the presentation!
            </p>

            <Banner type="ok" message={dropNotice ? `Notice Output: ${dropNotice}` : null} />
            <Banner type="err" message={dropErr} />
          </div>
        </Card>
      </div>

      {/* Cheat Sheet Table */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-text">Presentation Concept Cheat Sheet</h2>
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-line/60 text-muted uppercase tracking-wider border-b border-line">
                <th className="p-3">Feature / Action</th>
                <th className="p-3">PostgreSQL Concept to Explain</th>
                <th className="p-3 text-right">Navigate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {cheatSheet.map((item, idx) => (
                <tr key={idx} className="hover:bg-line/20 transition-colors">
                  <td className="p-3 font-semibold text-accent">{item.click}</td>
                  <td className="p-3 text-text font-mono">{item.concept}</td>
                  <td className="p-3 text-right">
                    <Link to={item.path} className="text-accent hover:underline font-medium">
                      Go →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
