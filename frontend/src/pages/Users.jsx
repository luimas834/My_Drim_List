import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Api, useFetch } from "../api";
import { Card, Btn, Banner, Concept, Loading } from "../ui";

// Values must match USER_SORTS in routes/users.js.
const SORTS = [
  { value: "active", label: "Most active" },
  { value: "followers", label: "Most followers" },
  { value: "newest", label: "Newest members" },
  { value: "name", label: "Name A-Z" },
];

export default function Users() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") || "");
  const sort = searchParams.get("sort") || "active";
  const page = parseInt(searchParams.get("page"), 10) || 1;

  const usersFetch = useFetch(() => Api.userDirectory({ q: q || undefined, sort, page }), [
    searchParams.toString(),
  ]);

  const apply = (next) => {
    const merged = { q, sort, page: 1, ...next };
    const params = {};
    if (merged.q) params.q = merged.q;
    if (merged.sort && merged.sort !== "active") params.sort = merged.sort;
    if (merged.page > 1) params.page = String(merged.page);
    setSearchParams(params);
  };

  const total = Number(usersFetch.data?.[0]?.total_count ?? 0);
  const totalPages = total ? Math.ceil(total / 24) : 1;

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold text-accent">Members</h1>
        <Concept>
          Stats come from a LATERAL join on get_user_stats() — the PL/pgSQL function runs once per
          row instead of the aggregation being rewritten here
        </Concept>
      </div>

      <div className="flex flex-wrap gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q });
          }}
          className="flex gap-2 flex-1"
        >
          <input
            type="text"
            placeholder="Search by username..."
            className="flex-1 bg-surface border border-line rounded px-3 py-2 text-text focus:border-accent outline-none text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Btn type="submit">Search</Btn>
        </form>
        <select
          className="bg-surface border border-line rounded px-3 py-2 text-text focus:border-accent outline-none text-sm"
          value={sort}
          onChange={(e) => apply({ sort: e.target.value })}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </select>
      </div>

      <Banner type="err" message={usersFetch.error} />

      {usersFetch.loading ? (
        <Loading text="Loading members..." />
      ) : usersFetch.data && usersFetch.data.length > 0 ? (
        <>
          <p className="text-xs text-muted">
            {total} member{total === 1 ? "" : "s"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {usersFetch.data.map((u) => (
              <Link
                key={u.user_id}
                to={`/profile/${u.user_id}`}
                className="card p-4 hover:border-accent/60 transition-colors flex gap-3"
              >
                <Avatar user={u} size="w-12 h-12 text-base" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold text-text truncate">{u.username}</p>
                  {u.bio && <p className="text-xs text-muted line-clamp-2">{u.bio}</p>}
                  <div className="flex gap-3 text-xs text-muted pt-1">
                    <span>
                      <strong className="text-accent">{u.anime_count ?? 0}</strong> anime
                    </span>
                    <span>
                      <strong className="text-accent">{u.episodes_watched ?? 0}</strong> eps
                    </span>
                    <span>
                      <strong className="text-accent">{u.followers_count ?? 0}</strong> followers
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-line">
              <Btn variant="ghost" disabled={page <= 1} onClick={() => apply({ page: page - 1 })}>
                ← Previous
              </Btn>
              <span className="text-sm text-muted">
                Page {page} of {totalPages}
              </span>
              <Btn
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => apply({ page: page + 1 })}
              >
                Next →
              </Btn>
            </div>
          )}
        </>
      ) : (
        <Card className="text-center py-12 text-muted">No members match that search.</Card>
      )}
    </div>
  );
}

// Shared avatar: a real picture if the user set one, initials otherwise.
export function Avatar({ user, size = "w-10 h-10 text-sm" }) {
  if (user?.profile_pic) {
    return (
      <img
        src={user.profile_pic}
        alt={user.username}
        className={`${size} rounded-full object-cover border border-accent/40 shrink-0`}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }
  return (
    <div
      className={`${size} shrink-0 bg-accent/20 border border-accent text-accent rounded-full flex items-center justify-center font-bold uppercase`}
    >
      {user?.username?.substring(0, 2)}
    </div>
  );
}
