import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Api, errMsg } from "../api";
import { useAuth } from "../auth";
import { Card, Btn, Banner, Concept } from "../ui";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await Api.login({ email, password });
      login(data.token, data.user);
      navigate("/");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12">
      <Card>
        <h1 className="text-2xl font-bold mb-2 text-center text-accent">Log In</h1>
        <p className="text-sm text-muted text-center mb-6">Sign in with your registered email</p>
        <Banner type="err" message={error} />
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase mb-1">Email</label>
            <input
              type="email"
              required
              className="w-full bg-bg border border-line rounded px-3 py-2 text-text focus:border-accent outline-none text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase mb-1">Password</label>
            <input
              type="password"
              required
              className="w-full bg-bg border border-line rounded px-3 py-2 text-text focus:border-accent outline-none text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Btn type="submit" disabled={submitting} className="w-full">
            {submitting ? "Signing in..." : "Log In"}
          </Btn>
        </form>
        <Concept className="text-center mt-4">
          Auth verification uses bcrypt hash checking & JWT session token (7d)
        </Concept>
        <p className="text-center text-xs text-muted mt-4">
          Don't have an account?{" "}
          <Link to="/register" className="text-accent hover:underline font-medium">
            Register here
          </Link>
        </p>
      </Card>
    </div>
  );
}

export function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await Api.register({ username, email, password });
      login(data.token, data.user);
      navigate("/");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12">
      <Card>
        <h1 className="text-2xl font-bold mb-2 text-center text-accent">Create Account</h1>
        <p className="text-sm text-muted text-center mb-6">Join My Drim List tracker</p>
        <Banner type="err" message={error} />
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase mb-1">Username</label>
            <input
              type="text"
              required
              className="w-full bg-bg border border-line rounded px-3 py-2 text-text focus:border-accent outline-none text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase mb-1">Email</label>
            <input
              type="email"
              required
              className="w-full bg-bg border border-line rounded px-3 py-2 text-text focus:border-accent outline-none text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase mb-1">Password</label>
            <input
              type="password"
              required
              className="w-full bg-bg border border-line rounded px-3 py-2 text-text focus:border-accent outline-none text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Btn type="submit" disabled={submitting} className="w-full">
            {submitting ? "Creating account..." : "Register"}
          </Btn>
        </form>
        <Concept className="text-center mt-4">
          Unique username and email enforced by UNIQUE constraint (23505)
        </Concept>
        <p className="text-center text-xs text-muted mt-4">
          Already have an account?{" "}
          <Link to="/login" className="text-accent hover:underline font-medium">
            Log in here
          </Link>
        </p>
      </Card>
    </div>
  );
}
