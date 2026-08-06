import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Api, useFetch } from "../api";
import { AnimeCard, Loading, Banner, Concept, Btn } from "../ui";

export default function Home() {
  const trendingFetch = useFetch(() => Api.trending());
  const topFetch = useFetch(() => Api.top());
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
    </div>
  );
}
