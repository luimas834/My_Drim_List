import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Api, useFetch } from "../api";
import { AnimeCard, Loading, Banner, Concept, Btn } from "../ui";

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [genre, setGenre] = useState(searchParams.get("genre") || "");
  const [studio, setStudio] = useState(searchParams.get("studio") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page"), 10) || 1);

  // Sync state with URL params if modified externally or on load
  useEffect(() => {
    setQ(searchParams.get("q") || "");
    setGenre(searchParams.get("genre") || "");
    setStudio(searchParams.get("studio") || "");
    setPage(parseInt(searchParams.get("page"), 10) || 1);
  }, [searchParams]);

  // Genres come from their own endpoint now. Deriving them from top_by_genre
  // only ever listed genres that already had a scored anime.
  const genresFetch = useFetch(() => Api.genres());
  const studiosFetch = useFetch(() => Api.studios());

  // Fetch anime cards
  const catalogFetch = useFetch(
    () =>
      Api.animeList({
        page,
        q: q || undefined,
        genre: genre || undefined,
        studio: studio || undefined,
      }),
    [page, q, genre, studio]
  );

  const updateFilters = (newQ, newGenre, newStudio, newPage) => {
    const params = {};
    if (newQ) params.q = newQ;
    if (newGenre) params.genre = newGenre;
    if (newStudio) params.studio = newStudio;
    if (newPage > 1) params.page = String(newPage);
    setSearchParams(params);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    updateFilters(q, genre, studio, 1);
  };

  const handleGenreChange = (e) => {
    const val = e.target.value;
    setGenre(val);
    setPage(1);
    updateFilters(q, val, studio, 1);
  };

  const handleStudioChange = (e) => {
    const val = e.target.value;
    setStudio(val);
    setPage(1);
    updateFilters(q, genre, val, 1);
  };

  const clearFilters = () => {
    setQ("");
    setGenre("");
    setStudio("");
    setPage(1);
    setSearchParams({});
  };

  return (
    <div className="space-y-6 py-6">
      <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-accent">Browse Catalog</h1>
          <Concept>Queries regular VIEW anime_card_view + STRING_AGG server-side</Concept>
        </div>
      </div>

      {/* Filter Controls */}
      <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search title..."
          className="flex-1 bg-surface border border-line rounded px-3 py-2 text-text focus:border-accent outline-none text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="bg-surface border border-line rounded px-3 py-2 text-text focus:border-accent outline-none text-sm"
          value={genre}
          onChange={handleGenreChange}
        >
          <option value="">All Genres</option>
          {(genresFetch.data || []).map((g) => (
            <option key={g.genre_id} value={g.name}>
              {g.name} ({g.anime_count})
            </option>
          ))}
        </select>
        <select
          className="bg-surface border border-line rounded px-3 py-2 text-text focus:border-accent outline-none text-sm"
          value={studio}
          onChange={handleStudioChange}
        >
          <option value="">All Studios</option>
          {(studiosFetch.data || []).map((s) => (
            <option key={s.studio_id} value={s.name}>
              {s.name} ({s.anime_count})
            </option>
          ))}
        </select>
        <Btn type="submit">Search</Btn>
        {(q || genre || studio) && (
          <Btn type="button" variant="ghost" onClick={clearFilters}>
            Clear
          </Btn>
        )}
      </form>

      {(genre || studio) && (
        <Concept>
          {studio && genre
            ? "Two EXISTS subqueries against anime_genres and anime_studios — both indexed bridge lookups, combined in one WHERE"
            : studio
            ? "EXISTS against anime_studios JOIN studios — indexed by idx_anime_studios_s"
            : "EXISTS against anime_genres JOIN genres — indexed by idx_anime_genres_g"}
        </Concept>
      )}

      <Banner type="err" message={catalogFetch.error} />

      {catalogFetch.loading ? (
        <Loading text="Fetching anime list..." />
      ) : (
        <>
          {catalogFetch.data && catalogFetch.data.length > 0 ? (
            <div className="grid-cards">
              {catalogFetch.data.map((anime) => (
                <AnimeCard key={anime.anime_id} anime={anime} />
              ))}
            </div>
          ) : (
            <div className="card text-center py-12 text-muted">No anime matches your criteria.</div>
          )}

          {/* Pagination Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-line">
            <Btn
              variant="ghost"
              disabled={page <= 1}
              onClick={() => {
                const nextP = page - 1;
                setPage(nextP);
                updateFilters(q, genre, nextP);
              }}
            >
              ← Previous
            </Btn>
            <span className="text-sm text-muted">Page {page}</span>
            <Btn
              variant="ghost"
              disabled={!catalogFetch.data || catalogFetch.data.length < 20}
              onClick={() => {
                const nextP = page + 1;
                setPage(nextP);
                updateFilters(q, genre, nextP);
              }}
            >
              Next →
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}
