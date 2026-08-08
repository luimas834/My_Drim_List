import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Api, useFetch, fmtScore, errMsg, num } from "../api";
import { useAuth } from "../auth";
import { Card, Tag, Btn, Banner, Concept, Loading } from "../ui";

export default function AnimeDetail() {
  const { id } = useParams();
  const animeId = parseInt(id, 10);
  const { user } = useAuth();

  const animeFetch = useFetch(() => Api.anime(animeId), [animeId]);
  const watchlistFetch = useFetch(() => (user ? Api.watchlist() : Promise.resolve([])), [user]);
  const reviewsFetch = useFetch(() => Api.reviews(animeId), [animeId]);

  // Expanded episode state
  const [expandedEpisodeId, setExpandedEpisodeId] = useState(null);
  const [onlyDiscussed, setOnlyDiscussed] = useState(false);

  // Discussion activity, all of it computed server-side (episode_card_view +
  // get_anime_discussion_stats). We only decide what to render.
  const stats = animeFetch.data?.discussion_stats || null;
  const allEpisodes = React.useMemo(() => animeFetch.data?.episodes || [], [animeFetch.data]);
  const discussedEpisodes = React.useMemo(
    () => allEpisodes.filter((e) => Number(e.comment_count) > 0),
    [allEpisodes]
  );
  const visibleEpisodes = onlyDiscussed ? discussedEpisodes : allEpisodes;

  // Watchlist entry state
  const myWatchlistEntry = React.useMemo(() => {
    if (!watchlistFetch.data || !Array.isArray(watchlistFetch.data)) return null;
    return watchlistFetch.data.find((w) => w.anime_id === animeId) || null;
  }, [watchlistFetch.data, animeId]);

  // Form states
  const [wlStatus, setWlStatus] = useState("");
  const [wlEp, setWlEp] = useState("");
  const [wlScore, setWlScore] = useState("");
  const [wlMsg, setWlMsg] = useState(null);
  const [wlErr, setWlErr] = useState(null);
  const [wlSubmitting, setWlSubmitting] = useState(false);

  // Sync watchlist entry into form when fetched
  React.useEffect(() => {
    if (myWatchlistEntry) {
      setWlStatus(myWatchlistEntry.status || "");
      setWlEp(myWatchlistEntry.episodes_watched ?? 0);
      setWlScore(myWatchlistEntry.user_score ?? "");
    }
  }, [myWatchlistEntry]);

  // Review form state
  const [reviewBody, setReviewBody] = useState("");
  const [reviewScore, setReviewScore] = useState("8");
  const [reviewErr, setReviewErr] = useState(null);
  const [reviewMsg, setReviewMsg] = useState(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Editing review state
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [editScore, setEditScore] = useState("");
  const [helpfulErr, setHelpfulErr] = useState(null);

  const anime = animeFetch.data;
  const loading = animeFetch.loading;

  if (loading) return <Loading text="Loading anime details..." />;
  if (animeFetch.error) return <Banner type="err" message={animeFetch.error} />;
  if (!anime) return <div className="card text-center py-12">Anime not found</div>;

  // Watchlist handlers
  const handleStatusChange = async (e) => {
    const newStatus = e.target.value;
    setWlStatus(newStatus);
    setWlErr(null);
    setWlMsg(null);
    setWlSubmitting(true);
    try {
      await Api.setStatus(animeId, newStatus);
      setWlMsg(`Watchlist status updated to '${newStatus}'`);
      watchlistFetch.reload();
    } catch (err) {
      setWlErr(errMsg(err));
    } finally {
      setWlSubmitting(false);
    }
  };

  const handlePatchWatchlist = async (patch) => {
    setWlErr(null);
    setWlMsg(null);
    setWlSubmitting(true);
    try {
      await Api.patchWatchlist(animeId, patch);
      setWlMsg("Watchlist updated successfully.");
      watchlistFetch.reload();
    } catch (err) {
      setWlErr(errMsg(err));
    } finally {
      setWlSubmitting(false);
    }
  };

  const handleWatchFinalEpisode = async () => {
    if (!anime.episode_count) return;
    setWlErr(null);
    setWlMsg(null);
    setWlSubmitting(true);
    try {
      await Api.patchWatchlist(animeId, { episodes_watched: anime.episode_count });
      setWlMsg(`Finished final episode (${anime.episode_count}/${anime.episode_count})!`);
      watchlistFetch.reload();
    } catch (err) {
      setWlErr(errMsg(err));
    } finally {
      setWlSubmitting(false);
    }
  };

  // Review submission handler
  const handlePostReview = async (force = false) => {
    setReviewErr(null);
    setReviewMsg(null);
    setReviewSubmitting(true);
    try {
      await Api.postReview({
        anime_id: animeId,
        body: reviewBody,
        score: reviewScore ? Number(reviewScore) : null,
      });
      setReviewMsg("Review posted successfully!");
      setReviewBody("");
      reviewsFetch.reload();
      animeFetch.reload(); // Score updated via trigger
    } catch (err) {
      setReviewErr(errMsg(err));
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Helpful vote handler
  const handleHelpful = async (reviewId) => {
    setHelpfulErr(null);
    try {
      await Api.helpful(reviewId);
      reviewsFetch.reload();
    } catch (err) {
      setHelpfulErr(errMsg(err));
    }
  };

  // Edit review handler
  const handleSaveEditReview = async (reviewId) => {
    try {
      await Api.patchReview(reviewId, {
        body: editBody,
        score: editScore ? Number(editScore) : null,
      });
      setEditingReviewId(null);
      reviewsFetch.reload();
      animeFetch.reload();
    } catch (err) {
      alert(errMsg(err));
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!confirm("Are you sure you want to delete your review?")) return;
    try {
      await Api.deleteReview(reviewId);
      reviewsFetch.reload();
      animeFetch.reload();
    } catch (err) {
      alert(errMsg(err));
    }
  };

  const isCompletedInWatchlist = myWatchlistEntry?.status === "completed";

  return (
    <div className="space-y-8 py-6">
      {/* Anime Header Hero */}
      <Card className="flex flex-col md:flex-row gap-6 p-6">
        <div className="w-full md:w-56 shrink-0 aspect-[2/3] bg-line/50 rounded-lg overflow-hidden relative">
          {anime.cover_image ? (
            <img
              src={anime.cover_image}
              alt={anime.title}
              className="w-full h-full object-cover"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted text-sm">No Cover Image</div>
          )}
        </div>

        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h1 className="text-3xl font-extrabold text-text">{anime.title}</h1>
              {anime.native_title && <p className="text-sm text-muted">{anime.native_title}</p>}
            </div>
            <div className="bg-bg border border-line px-4 py-2 rounded-lg text-right">
              <span className="text-xs uppercase tracking-wider text-muted block font-semibold">Average Score</span>
              <span className="text-2xl font-black text-accent">★ {fmtScore(anime.score)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center text-sm">
            <span className="capitalize font-semibold text-text">{anime.status || "Unknown Status"}</span>
            <span className="text-muted">•</span>
            <span>{anime.episode_count ? `${anime.episode_count} Episodes` : "Episode count unknown"}</span>
            {anime.aired_start && (
              <>
                <span className="text-muted">•</span>
                <span className="text-muted">Aired: {anime.aired_start?.substring(0, 10)}</span>
              </>
            )}
          </div>

          {/* Genres */}
          {anime.genres && anime.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {anime.genres.map((g) => (
                <Tag key={g.genre_id}>{g.name}</Tag>
              ))}
            </div>
          )}

          {/* Studios */}
          {anime.studios && anime.studios.length > 0 && (
            <div className="text-xs text-muted">
              Studios: <span className="text-text font-medium">{anime.studios.map((s) => s.name).join(", ")}</span>
            </div>
          )}

          {/* Synopsis */}
          <p className="text-sm text-text/90 leading-relaxed pt-2 border-t border-line">
            {anime.synopsis || "No synopsis available."}
          </p>
        </div>
      </Card>

      {/* Watchlist Panel */}
      {user ? (
        <Card className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-accent">Your Watchlist Status</h2>
            <Concept>BEFORE trigger chain — trg_a_episode_check → trg_b_finish_date</Concept>
          </div>

          <Banner type="ok" message={wlMsg} />
          <Banner type="err" message={wlErr} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Status</label>
              <select
                className="w-full bg-bg border border-line rounded px-3 py-2 text-text text-sm focus:border-accent outline-none"
                value={wlStatus}
                onChange={handleStatusChange}
                disabled={wlSubmitting}
              >
                <option value="">(Not on list)</option>
                <option value="watching">Watching</option>
                <option value="completed">Completed</option>
                <option value="on-hold">On-Hold</option>
                <option value="dropped">Dropped</option>
                <option value="plan-to-watch">Plan to Watch</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">
                Episodes Watched ({anime.episode_count ? `/ ${anime.episode_count}` : ""})
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  max={anime.episode_count || 9999}
                  className="w-full bg-bg border border-line rounded px-3 py-2 text-text text-sm focus:border-accent outline-none"
                  value={wlEp}
                  onChange={(e) => setWlEp(e.target.value)}
                  disabled={wlSubmitting || !wlStatus}
                />
                <Btn
                  variant="ghost"
                  disabled={wlSubmitting || !wlStatus}
                  onClick={() => handlePatchWatchlist({ episodes_watched: Number(wlEp) })}
                >
                  Save
                </Btn>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Your Score (1-10)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="10"
                  className="w-full bg-bg border border-line rounded px-3 py-2 text-text text-sm focus:border-accent outline-none"
                  value={wlScore}
                  onChange={(e) => setWlScore(e.target.value)}
                  disabled={wlSubmitting || !wlStatus}
                />
                <Btn
                  variant="ghost"
                  disabled={wlSubmitting || !wlStatus}
                  onClick={() => handlePatchWatchlist({ user_score: wlScore ? Number(wlScore) : null })}
                >
                  Save
                </Btn>
              </div>
            </div>
          </div>

          {anime.episode_count && (
            <div className="pt-2 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-2">
              <span className="text-xs text-muted">Demo helper: jump directly to final episode count</span>
              <Btn onClick={handleWatchFinalEpisode} disabled={wlSubmitting}>
                ⚡ Watch final episode ({anime.episode_count}/{anime.episode_count})
              </Btn>
            </div>
          )}

          {myWatchlistEntry && (
            <div className="text-xs text-muted space-x-3 pt-1">
              <span>Finished: {myWatchlistEntry.finished_at ? myWatchlistEntry.finished_at.substring(0, 10) : "Not finished"}</span>
              <span>•</span>
              <span>Updated: {myWatchlistEntry.updated_at ? myWatchlistEntry.updated_at.substring(0, 10) : "—"}</span>
            </div>
          )}
        </Card>
      ) : (
        <Card className="text-center py-6 text-muted">
          <Link to="/login" className="text-accent underline font-semibold">
            Log in
          </Link>{" "}
          to track this anime on your watchlist and write reviews.
        </Card>
      )}

      {/* Reviews Section */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold text-accent">User Reviews</h2>
          <Concept>BEFORE INSERT trigger trg_review_guard enforces completion; AFTER trigger updates score</Concept>
        </div>

        <Banner type="err" message={helpfulErr} />

        {/* Post Review Form */}
        {user && (
          <Card className="space-y-4">
            <h3 className="font-semibold text-text">Write a Review</h3>

            {!isCompletedInWatchlist && (
              <div className="bg-amber-950/40 border border-amber-800/80 text-amber-200 text-xs p-3 rounded space-y-2">
                <p>
                  ⚠️ Watchlist status is currently <strong>'{myWatchlistEntry?.status || "Not on list"}'</strong>. PostgreSQL's
                  BEFORE trigger <code>trg_review_guard</code> will reject reviews for uncompleted anime with code 400.
                </p>
              </div>
            )}

            <Banner type="ok" message={reviewMsg} />
            <Banner type="err" message={reviewErr} />

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">Score (1-10)</label>
                <select
                  className="bg-bg border border-line rounded px-3 py-1.5 text-text text-sm focus:border-accent outline-none"
                  value={reviewScore}
                  onChange={(e) => setReviewScore(e.target.value)}
                >
                  {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((s) => (
                    <option key={s} value={s}>
                      {s} / 10
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase mb-1">Review text</label>
                <textarea
                  rows="3"
                  placeholder="What did you think of this anime?"
                  className="w-full bg-bg border border-line rounded p-3 text-text text-sm focus:border-accent outline-none"
                  value={reviewBody}
                  onChange={(e) => setReviewBody(e.target.value)}
                />
              </div>

              <div className="flex gap-3">
                <Btn
                  onClick={() => handlePostReview(false)}
                  disabled={reviewSubmitting || !reviewBody || !isCompletedInWatchlist}
                >
                  Post Review
                </Btn>
                {!isCompletedInWatchlist && (
                  <Btn variant="ghost" onClick={() => handlePostReview(true)} disabled={reviewSubmitting || !reviewBody}>
                    Try anyway (demo the guard)
                  </Btn>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Review Listing */}
        {reviewsFetch.loading ? (
          <Loading text="Loading reviews..." />
        ) : reviewsFetch.data && reviewsFetch.data.length > 0 ? (
          <div className="space-y-4">
            {reviewsFetch.data.map((r) => {
              const isMine = user && user.user_id === r.user_id;
              const isEditing = editingReviewId === r.review_id;

              return (
                <Card key={r.review_id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Link to={`/profile/${r.user_id}`} className="font-bold text-accent hover:underline text-sm">
                        {r.username}
                      </Link>
                      <span className="text-xs font-semibold bg-line px-2 py-0.5 rounded text-accent">
                        ★ {r.score} / 10
                      </span>
                      {r.is_edited && <Tag className="bg-amber-950 text-amber-300 border border-amber-800">Edited</Tag>}
                    </div>
                    <span className="text-xs text-muted">{r.created_at?.substring(0, 10)}</span>
                  </div>

                  {isEditing ? (
                    <div className="space-y-3 pt-2">
                      <select
                        className="bg-bg border border-line rounded px-2 py-1 text-sm"
                        value={editScore}
                        onChange={(e) => setEditScore(e.target.value)}
                      >
                        {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <textarea
                        rows="3"
                        className="w-full bg-bg border border-line rounded p-2 text-sm text-text"
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Btn onClick={() => handleSaveEditReview(r.review_id)}>Save Edit</Btn>
                        <Btn variant="ghost" onClick={() => setEditingReviewId(null)}>
                          Cancel
                        </Btn>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-text/90 whitespace-pre-wrap">{r.body}</p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-line text-xs">
                    <div className="flex items-center gap-3">
                      <Btn variant="ghost" className="py-1 px-2.5 text-xs" onClick={() => handleHelpful(r.review_id)}>
                        👍 Helpful ({r.helpful_count})
                      </Btn>
                      <Concept>Stored procedure cast_helpful_vote</Concept>
                    </div>

                    {isMine && !isEditing && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingReviewId(r.review_id);
                            setEditBody(r.body);
                            setEditScore(String(r.score));
                          }}
                          className="text-muted hover:text-accent font-medium text-xs"
                        >
                          Edit
                        </button>
                        <button onClick={() => handleDeleteReview(r.review_id)} className="text-rose-400 hover:text-rose-300 font-medium text-xs">
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="text-center py-6 text-muted">No reviews yet for this anime.</Card>
        )}
      </div>

      {/* Episode Discussion Threads */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="text-xl font-bold text-accent">Episodes &amp; Discussions</h2>
          {stats && stats.total_comments > 0 && (
            <span className="text-xs text-muted">
              <strong className="text-text">{stats.total_comments}</strong> comment
              {stats.total_comments === 1 ? "" : "s"} from{" "}
              <strong className="text-text">{stats.participants}</strong> user
              {stats.participants === 1 ? "" : "s"} across{" "}
              <strong className="text-text">{stats.episodes_with_comments}</strong> episode
              {stats.episodes_with_comments === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <Concept>
          episode_card_view supplies each episode's comment_count in one query; totals come from
          get_anime_discussion_stats()
        </Concept>

        {anime.episodes && anime.episodes.length > 0 ? (
          <>
            {discussedEpisodes.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyDiscussed}
                  onChange={(e) => setOnlyDiscussed(e.target.checked)}
                />
                Show only episodes with comments ({discussedEpisodes.length})
              </label>
            )}
            <div className="space-y-2">
              {visibleEpisodes.map((ep) => (
                <EpisodeAccordion
                  key={ep.episode_id}
                  episode={ep}
                  isExpanded={expandedEpisodeId === ep.episode_id}
                  onToggle={() => setExpandedEpisodeId(expandedEpisodeId === ep.episode_id ? null : ep.episode_id)}
                  user={user}
                  onCountChange={() => animeFetch.reload()}
                />
              ))}
            </div>
          </>
        ) : (
          <Card className="text-center py-6 text-muted space-y-2">
            <p>No episodes indexed for this title.</p>
            <p className="text-xs">
              Episodes come from the Jikan seed. Run{" "}
              <code className="text-accent">npm run db:seed</code> to fetch them for every anime.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

function EpisodeAccordion({ episode, isExpanded, onToggle, user, onCountChange }) {
  const discussionsFetch = useFetch(
    () => (isExpanded ? Api.discussions(episode.episode_id) : Promise.resolve([])),
    [isExpanded, episode.episode_id]
  );
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  // which comment is currently being edited, and its working text
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  // comment_count comes from episode_card_view with the page load; once the user
  // starts posting in this thread the fetched list is the fresher number
  const count = discussionsFetch.data ? discussionsFetch.data.length : Number(episode.comment_count) || 0;

  const refresh = () => {
    discussionsFetch.reload();
    onCountChange?.(); // re-pull the anime so header totals stay honest
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    setErr(null);
    try {
      await Api.postDiscussion(episode.episode_id, comment);
      setComment("");
      refresh();
    } catch (error) {
      setErr(errMsg(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (discussionId) => {
    if (!editText.trim()) return;
    setSubmitting(true);
    setErr(null);
    try {
      await Api.patchDiscussion(discussionId, editText);
      setEditingId(null);
      setEditText("");
      refresh();
    } catch (error) {
      setErr(errMsg(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (discussionId) => {
    setSubmitting(true);
    setErr(null);
    try {
      await Api.deleteDiscussion(discussionId);
      refresh();
    } catch (error) {
      setErr(errMsg(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between cursor-pointer gap-3" onClick={onToggle}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-bold text-accent shrink-0">Ep {episode.episode_number}</span>
          <span className="font-medium text-text truncate">{episode.title || "Untitled"}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {count > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 font-semibold">
              💬 {count}
            </span>
          )}
          <span className="text-xs text-muted">{isExpanded ? "▲ Collapse" : "▼ Discuss"}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-3 border-t border-line space-y-4">
          <Banner type="err" message={err} />
          {discussionsFetch.loading ? (
            <Loading text="Loading comments..." />
          ) : discussionsFetch.data && discussionsFetch.data.length > 0 ? (
            <div className="space-y-2">
              {discussionsFetch.data.map((c) => {
                const isMine = user && c.user_id === user.user_id;
                const isEditing = editingId === c.discussion_id;

                return (
                  <div
                    key={c.discussion_id}
                    className="bg-bg/60 p-2.5 rounded border border-line/60 text-xs space-y-1"
                  >
                    <div className="flex justify-between font-semibold gap-2">
                      <span className="text-accent">
                        {c.username}
                        {isMine && <span className="text-muted font-normal"> (you)</span>}
                      </span>
                      <span className="text-muted shrink-0">
                        {c.is_edited && <span className="italic mr-1">edited ·</span>}
                        {c.created_at?.substring(0, 10)}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          rows="2"
                          className="w-full bg-bg border border-line rounded p-2 text-xs text-text focus:border-accent outline-none"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Btn
                            className="py-1 text-xs"
                            disabled={submitting || !editText.trim()}
                            onClick={() => handleSaveEdit(c.discussion_id)}
                          >
                            Save
                          </Btn>
                          <Btn
                            variant="ghost"
                            className="py-1 text-xs"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Btn>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-text whitespace-pre-wrap">{c.comment}</p>
                        {isMine && (
                          <div className="flex gap-3 pt-1">
                            <button
                              className="text-muted hover:text-accent underline"
                              onClick={() => {
                                setEditingId(c.discussion_id);
                                setEditText(c.comment);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="text-muted hover:text-red-400 underline"
                              disabled={submitting}
                              onClick={() => handleDelete(c.discussion_id)}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted italic">No comments yet on this episode.</p>
          )}

          {user ? (
            <>
              <form onSubmit={handlePostComment} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Write a comment..."
                  className="flex-1 bg-bg border border-line rounded px-3 py-1.5 text-xs text-text focus:border-accent outline-none"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <Btn type="submit" disabled={submitting || !comment.trim()} className="py-1 text-xs">
                  Post
                </Btn>
              </form>
              <Concept>
                Posting fires trg_notify_discussion — everyone already in this thread gets a
                notification. Editing fires trg_discussion_edit_flag (WHEN the text actually changed).
              </Concept>
            </>
          ) : (
            <p className="text-xs text-muted italic">
              <Link to="/login" className="text-accent underline">
                Log in
              </Link>{" "}
              to join the discussion.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
