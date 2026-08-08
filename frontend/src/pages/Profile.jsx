import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Api, useFetch, fmtScore, errMsg } from "../api";
import { useAuth } from "../auth";
import { Card, Tag, Btn, Banner, Concept, Loading, Stat } from "../ui";

export default function Profile() {
  const { id } = useParams();
  const userId = parseInt(id, 10);
  const { user: currentUser } = useAuth();

  const userFetch = useFetch(() => Api.user(userId), [userId]);
  const statsFetch = useFetch(() => Api.stats(userId), [userId]);

  const isMe = currentUser && currentUser.user_id === userId;

  // Follow state
  const followFetch = useFetch(() => (currentUser && !isMe ? Api.followState(userId) : Promise.resolve(null)), [
    currentUser,
    userId,
    isMe,
  ]);

  const [followSubmitting, setFollowSubmitting] = useState(false);
  const [followErr, setFollowErr] = useState(null);
  const [selfFollowErr, setSelfFollowErr] = useState(null);

  // Recommendations state (own profile only)
  const recsFetch = useFetch(() => (isMe ? Api.recommendations() : Promise.resolve(null)), [isMe]);

  // Follower / following lists, fetched only when a count is clicked
  const [socialTab, setSocialTab] = useState(null); // "followers" | "following" | null
  const socialFetch = useFetch(
    () =>
      socialTab === "followers"
        ? Api.followers(userId)
        : socialTab === "following"
        ? Api.following(userId)
        : Promise.resolve(null),
    [socialTab, userId]
  );

  // Keyset Pagination History state (own profile only)
  const [historyItems, setHistoryItems] = useState([]);
  const [historyAfter, setHistoryAfter] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState(null);

  // Load initial history page
  React.useEffect(() => {
    if (isMe) {
      setHistoryLoading(true);
      Api.history(0, 10)
        .then((rows) => {
          setHistoryItems(rows);
          if (rows.length < 10) setHasMoreHistory(false);
          if (rows.length > 0) {
            setHistoryAfter(rows[rows.length - 1].watchlist_id);
          }
        })
        .catch((e) => setHistoryErr(errMsg(e)))
        .finally(() => setHistoryLoading(false));
    }
  }, [isMe]);

  const handleLoadMoreHistory = async () => {
    if (!hasMoreHistory || historyLoading) return;
    setHistoryLoading(true);
    setHistoryErr(null);
    try {
      const rows = await Api.history(historyAfter, 10);
      if (rows.length < 10) setHasMoreHistory(false);
      if (rows.length > 0) {
        setHistoryItems((prev) => [...prev, ...rows]);
        setHistoryAfter(rows[rows.length - 1].watchlist_id);
      }
    } catch (e) {
      setHistoryErr(errMsg(e));
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleToggleFollow = async () => {
    setFollowSubmitting(true);
    setFollowErr(null);
    try {
      if (followFetch.data?.is_following) {
        await Api.unfollow(userId);
      } else {
        await Api.follow(userId);
      }
      followFetch.reload();
      userFetch.reload();
    } catch (e) {
      setFollowErr(errMsg(e));
    } finally {
      setFollowSubmitting(false);
    }
  };

  const handleDemoSelfFollow = async () => {
    setSelfFollowErr(null);
    try {
      await Api.follow(userId);
      userFetch.reload();
    } catch (e) {
      setSelfFollowErr(errMsg(e));
    }
  };

  const profile = userFetch.data;
  const stats = statsFetch.data;

  if (userFetch.loading) return <Loading text="Loading profile..." />;
  if (userFetch.error) return <Banner type="err" message={userFetch.error} />;
  if (!profile) return <div className="card text-center py-12">User not found</div>;

  return (
    <div className="space-y-10 py-6">
      {/* Profile Header */}
      <Card className="space-y-4 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-accent/20 border-2 border-accent text-accent rounded-full flex items-center justify-center font-bold text-2xl uppercase">
              {profile.username?.substring(0, 2)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text">{profile.username}</h1>
              <p className="text-xs text-muted">Joined {profile.created_at?.substring(0, 10)}</p>
              {profile.bio && <p className="text-sm text-text/80 mt-1">{profile.bio}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* The counts were dead numbers. Both directions come from the same
                self-referential followers table, read from opposite ends. */}
            <div className="flex gap-4 text-center">
              <button
                onClick={() => setSocialTab(socialTab === "followers" ? null : "followers")}
                className={`px-2 py-1 rounded transition-colors ${
                  socialTab === "followers" ? "bg-accent/15" : "hover:bg-line/40"
                }`}
              >
                <span className="text-lg font-bold text-accent block">{profile.followers_count ?? 0}</span>
                <span className="text-xs text-muted uppercase font-semibold">Followers</span>
              </button>
              <button
                onClick={() => setSocialTab(socialTab === "following" ? null : "following")}
                className={`px-2 py-1 rounded transition-colors ${
                  socialTab === "following" ? "bg-accent/15" : "hover:bg-line/40"
                }`}
              >
                <span className="text-lg font-bold text-accent block">{profile.following_count ?? 0}</span>
                <span className="text-xs text-muted uppercase font-semibold">Following</span>
              </button>
            </div>

            {currentUser && !isMe && (
              <div>
                <Btn onClick={handleToggleFollow} disabled={followSubmitting} variant={followFetch.data?.is_following ? "ghost" : "primary"}>
                  {followFetch.data?.is_following ? "Unfollow" : "Follow"}
                </Btn>
              </div>
            )}
          </div>
        </div>

        {followErr && <Banner type="err" message={followErr} />}

        {socialTab && (
          <div className="pt-3 border-t border-line space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold text-text capitalize">{socialTab}</h3>
              <Concept>
                {socialTab === "followers"
                  ? "followers JOIN users ON follower_id — the same table read from the other end"
                  : "followers JOIN users ON following_id — self-referential M:N, both directions"}
              </Concept>
            </div>

            {socialFetch.loading ? (
              <Loading text={`Loading ${socialTab}...`} />
            ) : socialFetch.data && socialFetch.data.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {socialFetch.data.map((u) => (
                  <Link
                    key={u.user_id}
                    to={`/profile/${u.user_id}`}
                    className="flex items-center gap-3 p-2 rounded border border-line/60 bg-bg/50 hover:border-accent/60 transition-colors"
                  >
                    <div className="w-8 h-8 shrink-0 bg-accent/20 border border-accent text-accent rounded-full flex items-center justify-center font-bold text-xs uppercase">
                      {u.username?.substring(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-text block truncate">{u.username}</span>
                      <span className="text-xs text-muted">
                        since {u.followed_at?.substring(0, 10)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted italic">
                {socialTab === "followers" ? "No followers yet." : "Not following anyone yet."}
              </p>
            )}
          </div>
        )}

        {isMe && (
          <div className="pt-3 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-2">
            <span className="text-xs text-muted">Demo helper: test self-follow database constraints</span>
            <Btn variant="ghost" className="text-xs border-amber-800/60 text-amber-300" onClick={handleDemoSelfFollow}>
              Demo: follow yourself
            </Btn>
          </div>
        )}
        <Banner type="err" message={selfFollowErr} />
      </Card>

      {/* 6 Stat Tiles Section */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold text-text">User Statistics</h2>
          <Concept>Computed via get_user_stats(id) — RETURNS TABLE in 1 round trip</Concept>
        </div>

        {statsFetch.loading ? (
          <Loading text="Calculating stats..." />
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <Stat label="Total Anime" value={stats.total ?? stats.total_anime ?? 0} />
            <Stat label="Completed" value={stats.completed ?? stats.completed_anime ?? 0} />
            <Stat label="Watching" value={stats.watching ?? stats.watching_anime ?? 0} />
            <Stat label="Dropped" value={stats.dropped ?? stats.dropped_anime ?? 0} />
            <Stat label="Episodes" value={stats.episodes ?? stats.total_episodes_watched ?? 0} />
            <Stat label="Mean Score" value={fmtScore(stats.mean_score)} />

          </div>
        ) : (
          <p className="text-sm text-muted">No stats recorded.</p>
        )}
      </section>

      {/* Recommendations Section (Own Profile Only) */}
      {isMe && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-text">Recommended Anime for You</h2>
            <Concept>Generated by PL/pgSQL function recommend_anime — uses explicit CURSOR & TEMP TABLE</Concept>
          </div>

          {recsFetch.loading ? (
            <Loading text="Running recommendation cursor..." />
          ) : recsFetch.data && recsFetch.data.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {recsFetch.data.map((rec) => (
                <Card key={rec.anime_id} className="flex items-center gap-3 py-2.5 px-4">
                  <Link to={`/anime/${rec.anime_id}`} className="font-semibold text-text hover:text-accent text-sm">
                    {rec.title}
                  </Link>
                  <Tag className="bg-accent/20 text-accent border border-accent/40">
                    {rec.genre_match_count} genre match{rec.genre_match_count !== 1 ? "es" : ""}
                  </Tag>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="text-center py-6 text-muted text-sm">
              Complete at least one anime first — the cursor loops over the genres of your completed titles.
            </Card>
          )}
        </section>
      )}

      {/* Keyset Pagination History Section (Own Profile Only) */}
      {isMe && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-text">Watch History</h2>
            <Concept>Keyset Pagination via get_watch_history(user_id, after, limit)</Concept>
          </div>

          <Banner type="err" message={historyErr} />

          {historyItems.length > 0 ? (
            <div className="space-y-2">
              <Card className="divide-y divide-line p-0 overflow-hidden">
                {historyItems.map((h) => (
                  <div key={h.watchlist_id} className="p-3 flex items-center justify-between text-xs hover:bg-line/20">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-accent font-semibold">#{h.watchlist_id}</span>
                      <Link to={`/anime/${h.anime_id}`} className="font-bold text-text hover:underline text-sm">
                        {h.title}
                      </Link>
                      <Tag className="capitalize">{h.status}</Tag>
                    </div>
                    <div className="flex items-center gap-3 text-muted">
                      <span>Ep: {h.episodes_watched}</span>
                      <span>Updated: {h.updated_at?.substring(0, 10)}</span>
                    </div>
                  </div>
                ))}
              </Card>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted">
                  Current cursor <code>after = {historyAfter}</code>
                </span>
                <Btn variant="ghost" onClick={handleLoadMoreHistory} disabled={!hasMoreHistory || historyLoading}>
                  {historyLoading ? "Fetching..." : hasMoreHistory ? "Load more history →" : "All history loaded"}
                </Btn>
              </div>
            </div>
          ) : (
            <Card className="text-center py-6 text-muted text-sm">No watch history recorded yet.</Card>
          )}
        </section>
      )}
    </div>
  );
}
