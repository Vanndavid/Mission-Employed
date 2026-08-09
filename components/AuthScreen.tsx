import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-8 backdrop-blur">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand-600 dark:text-brand-500 tracking-tight">
            ONE PARTNER
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mt-1">
            Mission: Employed
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-4">
            Sign in to sync your plan. Free includes the hunt system; Premium unlocks AI coaching.
          </p>
        </div>

        <div className="flex mb-6 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest ${
              mode === 'login'
                ? 'bg-brand-600 text-white'
                : 'bg-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest ${
              mode === 'register'
                ? 'bg-brand-600 text-white'
                : 'bg-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            Create account
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-800 dark:text-slate-100"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-800 dark:text-slate-100"
            />
          </label>

          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white text-sm font-bold uppercase tracking-widest"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create free account'}
          </button>
        </form>

        <p className="mt-6 text-[11px] text-slate-400 leading-relaxed text-center">
          New accounts start on Free. An admin can unlock Premium (payments come later).
        </p>
      </div>
    </div>
  );
}
