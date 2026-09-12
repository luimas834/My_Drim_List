import React from "react";
import { Link } from "react-router-dom";
import { Api, useFetch, fmtScore, errMsg } from "../api";
import { Card, Tag, Btn, Banner, Loading } from "../ui";

export default function MyList() {
  // Filtering and sorting happen in SQL, not by filtering the array here — the
  // whole list is not fetched just to hide most of it.
  const [status, setStatus] = React.useState("");
  const [sort, setSort] = React.useState("updated");
  const watchlistFetch = useFetch(
    () => Api.watchlist({ status: status || undefined, sort }),
    [status, sort]
  );
  const activityFetch = useFetch(() => Api.activity(30));
  const notifFetch = useFetch(() => Api.notifications());

  const [notifErr, setNotifErr] = React.useState(null);
  const [wlErr, setWlErr] = React.useState(null);

  // Watchlist inline patch
  const handlePatch = async (animeId, patch) => {
    setWlErr(null);
    try {
      await Api.patchWatchlist(animeId, patch);
      watchlistFetch.reload();
      activityFetch.reload();
    } catch (err) {
      setWlErr(errMsg(err));
    }
  };

  // Watchlist remove with confirm dialog
  const handleRemove = async (animeId, title) => {
    const ok = confirm(`Remove "${title}" from your watchlist?`);
    if (!ok) return;

    setWlErr(null);
    try {
      await Api.removeWatchlist(animeId);
      watchlistFetch.reload();
      activityFetch.reload();
    } catch (err) {
      setWlErr(errMsg(err));
    }
  };

  // Derived from the list we already have — no extra request just to count.
  const unreadCount = React.useMemo(
    () => (notifFetch.data || []).filter((n) => !n.is_read).length,
    [notifFetch.data]
  );

  // Mark notification read
  const handleReadNotif = async (id) => {
    setNotifErr(null);
    try {
      await Api.readNotif(id);
      notifFetch.reload();
    } catch (err) {
      setNotifErr(errMsg(err));
    }
  };

  // Mark every unread one read — a single UPDATE server-side, not N requests
  const handleReadAll = async () => {
    setNotifErr(null);
    try {
      await Api.readAllNotifs();
      notifFetch.reload();
    } catch (err) {
      setNotifErr(errMsg(err));
    }
  };

  return (
    <div className="space-y-10 py-6">
      <h1 className="text-3xl font-extrabold text-accent">My Tracker Dashboard</h1>

      {/* 1. Watchlist Section */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="text-xl font-bold text-text">
            Watchlist
            {watchlistFetch.data && (
              <span className="text-sm font-normal text-muted ml-2">
                ({watchlistFetch.data.length})
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <select
              className="bg-surface border border-line rounded px-2 py-1 text-text text-xs outline-none focus:border-accent"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="watching">Watching</option>
              <option value="completed">Completed</option>
              <option value="on-hold">On hold</option>
              <option value="dropped">Dropped</option>
              <option value="plan-to-watch">Plan to watch</option>
            </select>
            <select
              className="bg-surface border border-line rounded px-2 py-1 text-text text-xs outline-none focus:border-accent"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="updated">Recently updated</option>
              <option value="title">Title A-Z</option>
              <option value="score">My score</option>
              <option value="progress">Progress</option>
              <option value="added">Date added</option>
            </select>
          </div>
        </div>

        <Banner type="err" message={wlErr} />

        {watchlistFetch.loading ? (
          <Loading text="Loading watchlist..." />
        ) : watchlistFetch.data && watchlistFetch.data.length > 0 ? (
          <div className="space-y-3">
            {watchlistFetch.data.map((item) => (
              <Card key={item.watchlist_id} className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-14 h-20 bg-line rounded overflow-hidden shrink-0">
                    {item.cover_image ? (
                      <img src={item.cover_image} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-muted">No Image</div>
                    )}
                  </div>
                  <div>
                    <Link to={`/anime/${item.anime_id}`} className="font-bold text-text hover:text-accent transition-colors">
                      {item.title}
                    </Link>
                    <div className="text-xs text-muted flex gap-2 items-center mt-1">
                      <span>★ {fmtScore(item.anime_score)}</span>
                      <span>•</span>
                      <span>Total Ep: {item.episode_count || "?"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
                  <select
                    className="bg-bg border border-line rounded px-2.5 py-1 text-xs text-text focus:border-accent outline-none"
                    value={item.status}
                    onChange={(e) => handlePatch(item.anime_id, { status: e.target.value })}
                  >
                    <option value="watching">Watching</option>
                    <option value="completed">Completed</option>
                    <option value="on-hold">On-Hold</option>
                    <option value="dropped">Dropped</option>
                    <option value="plan-to-watch">Plan to Watch</option>
                  </select>

                  <div className="flex items-center gap-1 text-xs text-muted">
                    <span>Ep:</span>
                    <input
                      type="number"
                      min="0"
                      className="w-16 bg-bg border border-line rounded px-2 py-1 text-xs text-text focus:border-accent outline-none"
                      value={item.episodes_watched}
                      onChange={(e) => handlePatch(item.anime_id, { episodes_watched: Number(e.target.value) })}
                    />
                  </div>

                  <div className="flex items-center gap-1 text-xs text-muted">
                    <span>Score:</span>
                    <select
                      className="bg-bg border border-line rounded px-2 py-1 text-xs text-text focus:border-accent outline-none"
                      value={item.user_score ?? ""}
                      onChange={(e) => handlePatch(item.anime_id, { user_score: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">—</option>
                      {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Btn variant="ghost" className="text-xs py-1 px-2 text-rose-400 hover:text-rose-300" onClick={() => handleRemove(item.anime_id, item.title)}>
                    Remove
                  </Btn>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-center py-8 text-muted">Your watchlist is empty. Browse catalog to add titles!</Card>
        )}
      </section>

      {/* 2. Notifications Section */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div className="flex items-baseline gap-3">
            <h2 className="text-xl font-bold text-text">Notifications</h2>
            {unreadCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-bg font-bold">
                {unreadCount} unread
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <Btn variant="ghost" className="text-xs py-1 px-2" onClick={handleReadAll}>
                Mark all read
              </Btn>
            )}
          </div>
        </div>

        <Banner type="err" message={notifErr} />

        {notifFetch.loading ? (
          <Loading text="Loading notifications..." />
        ) : notifFetch.data && notifFetch.data.length > 0 ? (
          <div className="space-y-2">
            {notifFetch.data.map((n) => (
              <Card
                key={n.notification_id}
                className={`flex items-center justify-between p-3 transition-all ${
                  !n.is_read ? "border-l-4 border-l-accent bg-surface/90" : "opacity-80"
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Tag className="capitalize">{n.type}</Tag>
                    <span className="text-xs text-muted">{n.created_at?.substring(0, 10)}</span>
                  </div>
                  <p className="text-sm text-text font-medium">{n.message}</p>
                </div>
                {!n.is_read && (
                  <Btn variant="ghost" className="text-xs py-1 px-2" onClick={() => handleReadNotif(n.notification_id)}>
                    Mark read
                  </Btn>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-center py-6 text-muted">No notifications.</Card>
        )}
      </section>

      {/* 3. Activity Log Section */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold text-text">Activity Log</h2>
        </div>

        {activityFetch.loading ? (
          <Loading text="Loading activity feed..." />
        ) : activityFetch.data && activityFetch.data.length > 0 ? (
          <Card className="divide-y divide-line p-0 overflow-hidden">
            {activityFetch.data.map((act) => (
              <div key={act.log_id} className="p-3.5 flex items-center justify-between text-xs hover:bg-line/20">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-accent uppercase tracking-wide">{act.action_type}</span>
                  <span className="text-text">{act.details}</span>
                  {act.title && <span className="text-muted font-medium">({act.title})</span>}
                </div>
                <span className="text-muted">{act.logged_at?.substring(0, 16).replace("T", " ")}</span>
              </div>
            ))}
          </Card>
        ) : (
          <Card className="text-center py-6 text-muted">No logged activity yet.</Card>
        )}
      </section>
    </div>
  );
}
