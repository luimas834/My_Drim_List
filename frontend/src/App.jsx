import React from "react";
import { Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth, ProtectedRoute } from "./auth";
import { Api } from "./api";
import { Btn } from "./ui";

import Home from "./pages/Home";
import Browse from "./pages/Browse";
import AnimeDetail from "./pages/AnimeDetail";
import MyList from "./pages/MyList";
import Profile from "./pages/Profile";
import Users from "./pages/Users";
import Demo from "./pages/Demo";
import { Login, Register } from "./pages/Auth";

export default function App() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Unread badge. One COUNT query, re-run on navigation rather than on a timer —
  // notifications here are created by triggers during the user's own session, so
  // route changes are the moments the number can actually have moved.
  const [unread, setUnread] = React.useState(0);
  React.useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    Api.unreadCount()
      .then((r) => setUnread(Number(r.unread) || 0))
      .catch(() => setUnread(0));
  }, [user, location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col font-sans">
      {/* Navbar */}
      <header className="bg-surface border-b border-line sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="text-xl font-black text-accent tracking-wide flex items-center gap-2">
              <span>MDL</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 uppercase">
                DBMS-II
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted">
              <Link to="/" className="hover:text-accent transition-colors">
                Home
              </Link>
              <Link to="/browse" className="hover:text-accent transition-colors">
                Browse
              </Link>
              <Link to="/users" className="hover:text-accent transition-colors">
                Members
              </Link>
              {user && (
                <Link to="/my-list" className="hover:text-accent transition-colors flex items-center gap-1.5">
                  My List
                  {unread > 0 && (
                    <span
                      title={`${unread} unread notification${unread === 1 ? "" : "s"}`}
                      className="min-w-[1.15rem] h-[1.15rem] px-1 inline-flex items-center justify-center rounded-full bg-accent text-bg text-[0.65rem] font-bold"
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
              )}
              {user && (
                <Link to={`/profile/${user.user_id}`} className="hover:text-accent transition-colors">
                  Profile
                </Link>
              )}
              <Link to="/demo" className="hover:text-accent transition-colors text-amber-400 font-semibold">
                Demo & Viva
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <div className="flex items-center gap-3">
                <Link to={`/profile/${user.user_id}`} className="font-semibold text-text hover:text-accent text-sm">
                  {user.username}
                </Link>
                <Btn variant="ghost" className="py-1 px-3 text-xs" onClick={handleLogout}>
                  Log Out
                </Btn>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login">
                  <Btn variant="ghost" className="py-1.5 px-3 text-xs">
                    Log In
                  </Btn>
                </Link>
                <Link to="/register">
                  <Btn className="py-1.5 px-3 text-xs">Register</Btn>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 pb-12">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/anime/:id" element={<AnimeDetail />} />
          <Route
            path="/my-list"
            element={
              <ProtectedRoute>
                <MyList />
              </ProtectedRoute>
            }
          />
          <Route path="/users" element={<Users />} />
          <Route path="/profile/:id" element={<Profile />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<div className="py-12 text-center text-muted">Page not found (404)</div>} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        <div className="max-w-6xl mx-auto px-4">
          <p>My Drim List — DBMS-II Course Project (Thin backend, fat database)</p>
        </div>
      </footer>
    </div>
  );
}