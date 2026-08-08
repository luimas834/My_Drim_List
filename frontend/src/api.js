import axios from "axios";
import { useEffect, useState, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("mdl_token");
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

export function errMsg(e) {
  if (!e) return "An unexpected error occurred.";
  if (e.response?.status === 401) return "Session expired — log in again.";
  let msg = e.response?.data?.error;
  if (!msg) {
    if (typeof e.response?.data === "string" && e.response.data.includes("<html")) {
      return `API Error (${e.response.status}): Endpoint not found`;
    }
    if (e.message && !e.response) return "Cannot reach the API.";
    return e.message || "An unexpected error occurred.";
  }
  if (typeof msg === "string" && /^[A-Z_]+:\s*/.test(msg)) {
    msg = msg.replace(/^[A-Z_]+:\s*/, "");
  }
  return msg;
}

export function num(v) {
  return v == null || v === "" ? null : Number(v);
}

export function fmtScore(v) {
  const n = num(v);
  return n != null && !isNaN(n) ? n.toFixed(2) : "—";
}

export function useFetch(fn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fn();
      setData(res);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}

export const Api = {
  login: (credentials) => api.post("/auth/login", credentials).then((r) => r.data),
  register: (data) => api.post("/auth/register", data).then((r) => r.data),
  me: () => api.get("/auth/me").then((r) => r.data),
  animeList: (params) => api.get("/anime", { params }).then((r) => r.data),
  trending: () => api.get("/anime/trending").then((r) => r.data),
  top: (params) => api.get("/anime/top", { params }).then((r) => r.data),
  anime: (id) => api.get(`/anime/${id}`).then((r) => r.data),
  watchlist: () => api.get("/watchlist/me").then((r) => r.data),
  setStatus: (anime_id, status) => api.post("/watchlist", { anime_id, status }).then((r) => r.data),
  patchWatchlist: (anime_id, patch) => api.patch(`/watchlist/${anime_id}`, patch).then((r) => r.data),
  removeWatchlist: (anime_id) => api.delete(`/watchlist/${anime_id}`).then((r) => r.data),
  reviews: (animeId) => api.get(`/reviews/anime/${animeId}`).then((r) => r.data),
  postReview: (data) => api.post("/reviews", data).then((r) => r.data),
  patchReview: (reviewId, data) => api.patch(`/reviews/${reviewId}`, data).then((r) => r.data),
  deleteReview: (reviewId) => api.delete(`/reviews/${reviewId}`).then((r) => r.data),
  helpful: (reviewId) => api.post(`/reviews/${reviewId}/helpful`).then((r) => r.data),
  unhelpful: (reviewId) => api.delete(`/reviews/${reviewId}/helpful`).then((r) => r.data),
  myVotes: (animeId) => api.get(`/reviews/anime/${animeId}/my-votes`).then((r) => r.data),
  discussions: (episodeId) => api.get(`/episodes/${episodeId}/discussions`).then((r) => r.data),
  postDiscussion: (episodeId, comment) => api.post(`/episodes/${episodeId}/discussions`, { comment }).then((r) => r.data),
  patchDiscussion: (discussionId, comment) => api.patch(`/episodes/discussions/${discussionId}`, { comment }).then((r) => r.data),
  deleteDiscussion: (discussionId) => api.delete(`/episodes/discussions/${discussionId}`).then((r) => r.data),
  recentDiscussions: (limit = 10) => api.get("/episodes/recent-discussions", { params: { limit } }).then((r) => r.data),
  notifications: () => api.get("/notifications").then((r) => r.data),
  readNotif: (id) => api.patch(`/notifications/${id}/read`).then((r) => r.data),
  unreadCount: () => api.get("/notifications/unread-count").then((r) => r.data),
  readAllNotifs: () => api.patch("/notifications/read-all").then((r) => r.data),
  user: (id) => api.get(`/users/${id}`).then((r) => r.data),
  stats: (id) => api.get(`/users/${id}/stats`).then((r) => r.data),
  followState: (id) => api.get(`/users/${id}/follow-status`).then((r) => r.data),
  follow: (id) => api.post(`/users/${id}/follow`).then((r) => r.data),
  unfollow: (id) => api.delete(`/users/${id}/follow`).then((r) => r.data),
  followers: (id) => api.get(`/users/${id}/followers`).then((r) => r.data),
  following: (id) => api.get(`/users/${id}/following`).then((r) => r.data),
  genres: () => api.get("/anime/genres").then((r) => r.data),
  recommendations: () => api.get("/users/me/recommendations").then((r) => r.data),
  history: (after, limit) => api.get("/users/me/history", { params: { after, limit } }).then((r) => r.data),
  activity: (limit) => api.get("/users/me/activity", { params: { limit } }).then((r) => r.data),
  refreshMatview: () => api.post("/admin/refresh").then((r) => r.data),
  bulkDrop: (months) => api.post("/admin/bulk-drop", { months }).then((r) => r.data),
  health: () => axios.get(API_BASE.replace(/\/api$/, "") + "/health").then((r) => r.data),
};
