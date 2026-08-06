import React, { createContext, useContext, useState, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("mdl_token");
    if (!token) {
      setLoading(false);
      return;
    }
    Api.me()
      .then((u) => setUser(u))
      .catch(() => {
        localStorage.removeItem("mdl_token");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const loginUser = (token, userData) => {
    localStorage.setItem("mdl_token", token);
    setUser(userData);
  };

  const logoutUser = () => {
    localStorage.removeItem("mdl_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login: loginUser, logout: logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="p-8 text-center text-muted">Loading authentication...</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
