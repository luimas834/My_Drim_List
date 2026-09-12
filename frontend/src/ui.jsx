import React from "react";
import { Link } from "react-router-dom";
import { fmtScore } from "./api";

export function Card({ children, className = "" }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Btn({ children, variant = "primary", className = "", ...props }) {
  const cls = variant === "ghost" ? "btn-ghost" : "btn";
  return (
    <button className={`${cls} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Tag({ children, className = "" }) {
  return <span className={`tag ${className}`}>{children}</span>;
}

export function Banner({ type = "ok", message, children }) {
  if (!message && !children) return null;
  const cls = type === "ok" ? "banner-ok" : "banner-err";
  return <div className={cls}>{message || children}</div>;
}

export function Concept({ children, className = "" }) {
  return null;
}

export function Loading({ text = "Loading..." }) {
  return (
    <div className="py-12 text-center text-muted font-medium flex items-center justify-center gap-2">
      <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
      <span>{text}</span>
    </div>
  );
}

export function Stat({ label, value }) {
  return (
    <div className="card flex flex-col justify-between">
      <div>
        <span className="text-xs uppercase tracking-wider text-muted font-semibold block mb-1">{label}</span>
        <span className="text-2xl font-bold text-accent">{value ?? "—"}</span>
      </div>
    </div>
  );
}

export function AnimeCard({ anime }) {
  if (!anime) return null;
  const score = anime.score ?? anime.avg_score ?? anime.anime_score;
  const genreList = Array.isArray(anime.genres)
    ? anime.genres.map((g) => (typeof g === "object" ? g.name : g))
    : typeof anime.genres === "string"
    ? anime.genres.split(", ").filter(Boolean)
    : [];

  const studioList = Array.isArray(anime.studios)
    ? anime.studios.map((s) => (typeof s === "object" ? s.name : s))
    : typeof anime.studios === "string"
    ? anime.studios.split(", ").filter(Boolean)
    : [];
  const studioLabel = studioList.slice(0, 2).join(", ");

  return (
    <Link
      to={`/anime/${anime.anime_id}`}
      className="card group hover:border-accent/60 transition-all flex flex-col h-full overflow-hidden p-0"
    >
      <div className="relative aspect-[2/3] bg-line/50 overflow-hidden">
        {anime.cover_image ? (
          <img
            src={anime.cover_image}
            alt={anime.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted text-xs p-2 text-center">
            No Cover
          </div>
        )}
        {score != null && (
          <div className="absolute top-2 right-2 bg-bg/85 backdrop-blur border border-line px-2 py-0.5 rounded text-xs font-bold text-accent">
            ★ {fmtScore(score)}
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col flex-1 justify-between gap-2">
        <div className="space-y-1">
          <h3 className="font-semibold text-sm line-clamp-2 text-text group-hover:text-accent transition-colors">
            {anime.title}
          </h3>
          {/* studios came back from anime_card_view's STRING_AGG all along and
              were never displayed anywhere except the detail page */}
          {studioLabel && (
            <p className="text-xs text-muted truncate" title={studioLabel}>
              {studioLabel}
            </p>
          )}
        </div>
        {genreList.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {genreList.slice(0, 2).map((g, idx) => (
              <Tag key={idx}>{g}</Tag>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
