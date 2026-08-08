import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Api, useFetch } from "../api";
import { AnimeCard, Loading, Banner, Concept, Btn } from "../ui";

export default function Home() {
  const trendingFetch = useFetch(() => Api.trending());
  const topFetch = useFetch(() => Api.top());
  const discussionsFetch = useFetch(() => Api.recentDiscussions(8));
  const studiosFetch = useFetch(() => Api.topStudios(8, 2));
  const [visibleGenreCount, setVisibleGenreCount] = useState(5);

  const loading = trendingFetch.loading || topFetch.loading;
  const error = trendingFetch.error || topFetch.error;

  // Group top by genre
  const genreGroups = React.useMemo(() => {
    if (!topFetch.data) return [];
    const map = new Map();
    for (const item of topFetch.data) {
      if (!map.has(item.genre_id)) {
        map.set(item.genre_id, { id: item.genre_id, name: item.genre, items: [] });
      }
      map.get(item.genre_id).items.push(item);
    }
    return Array.from(map.values());
  }, [topFetch.data]);

  if (loading) return <Loading text="Loading home showcase..." />;

  return (
    <div className="space-y-10 py-6">
      <Banner type="err" message={error} />

      {/* Trending Section */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold text-accent">Trending This Week</h2>
          <Concept>Multi-JOIN + 7-day window aggregation in SQL</Concept>
        </div>
        {trendingFetch.data && trendingFetch.data.length > 0 ? (
          <div className="grid-cards">
            {trendingFetch.data.map((anime) => (
              <AnimeCard key={anime.anime_id} anime={anime} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No trending anime found.</p>
        )}
      </section>

      {/* Top by Genre Section */}
      <section className="space-y-6">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-xl font-bold text-accent">Top Anime by Genre</h2>
            <Concept>
              Pre-ranked rows from MATERIALIZED VIEW top_by_genre using RANK() OVER (PARTITION BY genre_id)
            </Concept>
          </div>
          <Link to="/demo" className="text-xs text-accent hover:underline font-medium">
            View stale / refresh in /demo →
          </Link>
        </div>

        {genreGroups.slice(0, visibleGenreCount).map((group) => (
          <div key={group.id} className="space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-1">
              <h3 className="font-semibold text-text">{group.name}</h3>
              <Link to={`/browse?genre=${encodeURIComponent(group.name)}`} className="text-xs text-muted hover:text-accent">
                Browse {group.name} →
              </Link>
            </div>
            <div className="grid-cards">
              {group.items.slice(0, 10).map((anime) => (
                <AnimeCard key={anime.anime_id} anime={anime} />
              ))}
            </div>
          </div>
        ))}

        {genreGroups.length > visibleGenreCount && (
          <div className="text-center pt-4">
            <Btn variant="ghost" onClick={() => setVisibleGenreCount((prev) => prev + 5)}>
              Show more genres ({genreGroups.length - visibleGenreCount} remaining)
            </Btn>
          </div>
        )}
      </section>

      {/* Studio leaderboard — the anime_studios M:N doing visible work */}
      {studiosFetch.data && studiosFetch.data.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-accent">Top Studios</h2>
            <Concept>
              get_top_studios() over studio_card_view — aggregate across the anime_studios bridge,
              RANK() window, HAVING-style minimum so a one-hit studio can't top the table
            </Concept>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {studiosFetch.data.map((s) => (
              <Link
                key={s.studio_id}
                to={`/browse?studio=${encodeURIComponent(s.name)}`}
                className="card p-3 hover:border-accent/60 transition-colors space-y-1"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted font-bold">#{s.rnk}</span>
                  <span className="text-sm font-bold text-accent">★ {s.avg_score ?? "—"}</span>
                </div>
                <p className="text-sm font-semibold text-text truncate" title={s.name}>
                  {s.name}
                </p>
                <p className="text-xs text-muted">
                  {s.anime_count} title{s.anime_count === 1 ? "" : "s"}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Latest episode discussions — one function call, already joined */}
      {discussionsFetch.data && discussionsFetch.data.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-accent">Latest Episode Discussions</h2>
            <Concept>get_recent_discussions() — comment ⋈ user ⋈ episode ⋈ anime in one call</Concept>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {discussionsFetch.data.map((d) => (
              <Link
                key={d.discussion_id}
                to={`/anime/${d.anime_id}`}
                className="card flex gap-3 p-3 hover:border-accent/60 transition-colors"
              >
                {d.cover_image && (
                  <img
                    src={d.cover_image}
                    alt={d.anime_title}
                    className="w-12 h-16 object-cover rounded shrink-0"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="text-xs text-muted truncate">
                    <span className="text-accent font-semibold">{d.username}</span> on{" "}
                    <span className="text-text font-medium">{d.anime_title}</span> · Ep{" "}
                    {d.episode_number}
                  </p>
                  <p className="text-sm text-text/90 line-clamp-2">{d.comment}</p>
                  <p className="text-[0.65rem] text-muted">
                    {d.is_edited && <span className="italic">edited · </span>}
                    {d.created_at?.substring(0, 10)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
