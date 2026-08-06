import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Api, useFetch } from "../api";
import { AnimeCard, Loading, Banner, Concept, Btn } from "../ui";

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [genre, setGenre] = useState(searchParams.get("genre") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page"), 10) || 1);

  // Sync state with URL params if modified externally or on load
  useEffect(() => {
    const urlQ = searchParams.get("q") || "";
    const urlGenre = searchParams.get("genre") || "";
    const urlPage = parseInt(searchParams.get("page"), 10) || 1;
    setQ(urlQ);
    setGenre(urlGenre);
    setPage(urlPage);
  }, [searchParams]);

  // Fetch available genres from top_by_genre
  const topFetch = useFetch(() => Api.top());
  const genreList = React.useMemo(() => {
    if (!topFetch.data) return [];
    const set = new Map();
    for (const row of topFetch.data) {
      if (row.genre) set.set(row.genre_id, row.genre);
    }
    return Array.from(set.values()).sort();
  }, [topFetch.data]);

  // Fetch anime cards
  const catalogFetch = useFetch(() => Api.animeList({ page, q: q || undefined, genre: genre || undefined }), [page, q, genre]);

  const updateFilters = (newQ, newGenre, newPage) => {
    const params = {};
    if (newQ) params.q = newQ;
    if (newGenre) params.genre = newGenre;
    if (newPage > 1) params.page = String(newPage);
    setSearchParams(params);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    updateFilters(q, genre, 1);
  };

  const handleGenreChange = (e) => {
    const val = e.target.value;
    setGenre(val);
    setPage(1);
    updateFilters(q, val, 1);
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
          {genreList.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <Btn type="submit">Search</Btn>
      </form>

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
