import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, LoaderCircle, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { Button, Card, Input } from '../components/ui/Primitives';
import { AdminNotificationsPage } from './AdminNotificationsPage';
import {
  checkAdminSession,
  loginAdmin,
  logoutAdmin,
  resolveAdminServerUrl,
  type AdminSessionInfo,
} from '../utils/adminSession';

interface AdminPageProps {
  onExit: () => void;
}

function serverLabel(): string {
  const configured = resolveAdminServerUrl();
  if (configured) return configured;
  return typeof window === 'undefined' ? 'this app' : window.location.origin;
}

/**
 * Hidden, owner-only entry point. Nothing links here: the panel is opened from
 * `#admin`, Ctrl+Alt+A, or a long-press on the app emblem, and the page itself
 * stays inert until the server confirms an admin session.
 */
export const AdminPage: React.FC<AdminPageProps> = ({ onExit }) => {
  const [session, setSession] = useState<AdminSessionInfo | null>(null);
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const info = await checkAdminSession();
    setSession(info);
    return info;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !passcode.trim()) return;

    setBusy(true);
    setError(null);
    try {
      await loginAdmin(passcode.trim());
      setPasscode('');
      const info = await refresh();
      if (!info.authenticated) {
        setError('The server accepted the passcode but did not keep the session. Try again.');
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Admin sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const lock = async () => {
    await logoutAdmin();
    setPasscode('');
    setError(null);
    setSession({ enabled: session?.enabled ?? true, authenticated: false, reachable: true });
  };

  if (!session) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-secondary)]">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Checking admin access…
        </Card>
      </div>
    );
  }

  if (session.authenticated) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Admin panel</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Unlocked on this browser
                {session.expiresAt
                  ? ` · until ${new Date(session.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onExit}>
              <ArrowLeft className="h-4 w-4" />
              Back to app
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void lock()}>
              <LogOut className="h-4 w-4" />
              Lock
            </Button>
          </div>
        </div>

        <AdminNotificationsPage />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
          <Lock className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">Restricted area</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            This panel belongs to the app owner. Enter the admin passcode to continue.
          </p>
        </div>
      </div>

      <Card className="space-y-4">
        <form onSubmit={submit} className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Admin passcode</span>
            <Input
              type="password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              placeholder="••••••••••••"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              disabled={busy}
            />
          </label>
          <Button type="submit" className="w-full" disabled={busy || !passcode.trim()}>
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {busy ? 'Checking…' : 'Unlock admin panel'}
          </Button>
        </form>

        {error && (
          <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs leading-relaxed text-red-700 dark:text-red-300">
            {error}
          </p>
        )}

        {!session.reachable && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
            Could not reach the app server at <strong className="text-[var(--text-primary)]">{serverLabel()}</strong>. Admin access needs the Node
            server: run <code>npm run dev</code> or <code>npm start</code>, and point <code>VITE_AI_PROXY_URL</code> at it when the app is hosted
            separately.
          </p>
        )}

        {session.reachable && !session.enabled && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
            Admin access is disabled on the server. Add <code>ADMIN_PASSCODE</code> to its environment and restart it.
          </p>
        )}

        <Button variant="ghost" size="sm" className="w-full" onClick={onExit}>
          <ArrowLeft className="h-4 w-4" />
          Back to the app
        </Button>
      </Card>

      <p className="text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
        Server: {serverLabel()}
        <br />
        Sessions end when the tab closes, when you lock the panel, or when the server restarts.
      </p>
    </div>
  );
};
