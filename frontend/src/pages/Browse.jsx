import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Api, useFetch, errMsg } from "../api";
import { AnimeCard, Loading, Banner, Btn } from "../ui";

// Labels are ours; the values must match the SORTS whitelist in routes/anime.js.
const SORT_OPTIONS = [
  { value: "score", label: "Highest rated" },
  { value: "popularity", label: "Most popular" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title A-Z" },
  { value: "episodes", label: "Most episodes" },
  { value: "reviews", label: "Most reviewed" },
];

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [q, setQ] = useState(searchParams.get("q") || "");
  const [genre, setGenre] = useState(searchParams.get("genre") || "");
  const [studio, setStudio] = useState(searchParams.get("studio") || "");
  const [year, setYear] = useState(searchParams.get("year") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "score");
  const [page, setPage] = useState(parseInt(searchParams.get("page"), 10) || 1);

  // The URL is the source of truth, so a shared link reproduces the exact view.
  useEffect(() => {
    setQ(searchParams.get("q") || "");
    setGenre(searchParams.get("genre") || "");
    setStudio(searchParams.get("studio") || "");
    setYear(searchParams.get("year") || "");
    setStatus(searchParams.get("status") || "");
    setSort(searchParams.get("sort") || "score");
    setPage(parseInt(searchParams.get("page"), 10) || 1);
  }, [searchParams]);

  const genresFetch = useFetch(() => Api.genres());
  const studiosFetch = useFetch(() => Api.studios());
  const yearsFetch = useFetch(() => Api.years());
  const statusesFetch = useFetch(() => Api.statuses());

  const catalogFetch = useFetch(
    () =>
      Api.animeList({
        page,
        sort,
        q: q || undefined,
        genre: genre || undefined,
        studio: studio || undefined,
        year: year || undefined,
        status: status || undefined,
      }),
    [page, q, genre, studio, year, status, sort]
  );

  // One place that writes the URL, so adding a filter can't desync a call site.
  const apply = (next) => {
    const merged = { q, genre, studio, year, status, sort, page: 1, ...next };
    const params = {};
    if (merged.q) params.q = merged.q;
    if (merged.genre) params.genre = merged.genre;
    if (merged.studio) params.studio = merged.studio;
    if (merged.year) params.year = merged.year;
    if (merged.status) params.status = merged.status;
    if (merged.sort && merged.sort !== "score") params.sort = merged.sort;
    if (merged.page > 1) params.page = String(merged.page);
    setSearchParams(params);
  };

  const goToPage = (p) => {
    apply({ page: p });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clearFilters = () => setSearchParams({});

  const surpriseMe = async () => {
    try {
      const { anime_id } = await Api.randomAnime();
      navigate(`/anime/${anime_id}`);
    } catch (e) {
      alert(errMsg(e));
    }
  };

  // COUNT(*) OVER() rides along on every row — no second query for the total.
  const total = Number(catalogFetch.data?.[0]?.total_count ?? 0);
  const totalPages = total ? Math.ceil(total / 20) : 1;
  const activeFilters = [q, genre, studio, year, status].filter(Boolean).length;

  const selectCls =
    "bg-surface border border-line rounded px-3 py-2 text-text focus:border-accent outline-none text-sm";

  return (
    <div className="space-y-6 py-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-accent">Browse Catalog</h1>
        </div>
        <Btn variant="ghost" onClick={surpriseMe}>
          🎲 Surprise me
        </Btn>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q });
          }}
          className="flex gap-3"
        >
          <input
            type="text"
            placeholder="Search titles and synopses..."
            className="flex-1 bg-surface border border-line rounded px-3 py-2 text-text focus:border-accent outline-none text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Btn type="submit">Search</Btn>
        </form>

        <div className="flex flex-wrap gap-2">
          <select className={selectCls} value={genre} onChange={(e) => apply({ genre: e.target.value })}>
            <option value="">All genres</option>
            {(genresFetch.data || []).map((g) => (
              <option key={g.genre_id} value={g.name}>
                {g.name} ({g.anime_count})
              </option>
            ))}
          </select>

          <select className={selectCls} value={studio} onChange={(e) => apply({ studio: e.target.value })}>
            <option value="">All studios</option>
            {(studiosFetch.data || []).map((s) => (
              <option key={s.studio_id} value={s.name}>
                {s.name} ({s.anime_count})
              </option>
            ))}
          </select>

          <select className={selectCls} value={year} onChange={(e) => apply({ year: e.target.value })}>
            <option value="">Any year</option>
            {(yearsFetch.data || []).map((y) => (
              <option key={y.year} value={y.year}>
                {y.year} ({y.anime_count})
              </option>
            ))}
          </select>

          <select className={selectCls} value={status} onChange={(e) => apply({ status: e.target.value })}>
            <option value="">Any status</option>
            {(statusesFetch.data || []).map((s) => (
              <option key={s.status} value={s.status}>
                {s.status} ({s.anime_count})
              </option>
            ))}
          </select>

          <select className={selectCls} value={sort} onChange={(e) => apply({ sort: e.target.value })}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Sort: {o.label}
              </option>
            ))}
          </select>

          {activeFilters > 0 && (
            <Btn variant="ghost" onClick={clearFilters}>
              Clear ({activeFilters})
            </Btn>
          )}
        </div>
      </div>

      <Banner type="err" message={catalogFetch.error} />

      {catalogFetch.loading ? (
        <Loading text="Fetching anime..." />
      ) : (
        <>
          {catalogFetch.data && catalogFetch.data.length > 0 ? (
            <>
              <p className="text-xs text-muted">
                {total} result{total === 1 ? "" : "s"}
                {q && ` for "${q}"`}
                {genre && ` · ${genre}`}
                {studio && ` · ${studio}`}
                {year && ` · ${year}`}
              </p>
              <div className="grid-cards">
                {catalogFetch.data.map((anime) => (
                  <AnimeCard key={anime.anime_id} anime={anime} />
                ))}
              </div>
            </>
          ) : (
            <div className="card text-center py-12 space-y-2">
              <p className="text-muted">No anime matches these filters.</p>
              {activeFilters > 0 && (
                <Btn variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Btn>
              )}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-line">
              <Btn variant="ghost" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                ← Previous
              </Btn>
              <span className="text-sm text-muted">
                Page {page} of {totalPages}
              </span>
              <Btn variant="ghost" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                Next →
              </Btn>
            </div>
          )}
        </>
      )}
    </div>
  );
}
