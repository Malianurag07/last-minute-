import { useEffect, useState } from 'react';

import { api, can, refresh, setAccessToken, setSignedOutHandler, type SessionInfo } from './api';
import { ChangePassword, Login } from './pages/Login';
import { AdminsPage, AuditPage, IncidentsPage, OrdersPage, OverviewPage, PrivacyPage, ProvidersPage, ReviewsPage, UsersPage } from './pages/Pages';

const NAV: { id: string; label: string; perm: string }[] = [
  { id: 'overview', label: 'Overview', perm: 'dashboard' },
  { id: 'providers', label: 'Providers', perm: 'providers.view' },
  { id: 'orders', label: 'Orders', perm: 'orders.view' },
  { id: 'users', label: 'Users', perm: 'users.view' },
  { id: 'reviews', label: 'Reviews', perm: 'reviews.view' },
  { id: 'privacy', label: 'Privacy requests', perm: 'privacy.view' },
  { id: 'incidents', label: 'Security incidents', perm: 'incidents.view' },
  { id: 'audit', label: 'Audit log', perm: 'audit.view' },
  { id: 'admins', label: 'Admin accounts', perm: 'admins.manage' },
  { id: 'account', label: 'My account', perm: 'dashboard' },
];

export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [booting, setBooting] = useState(true);
  const [notice, setNotice] = useState<string | undefined>();
  const [page, setPage] = useState(() => location.hash.slice(1) || 'overview');

  useEffect(() => {
    setSignedOutHandler((msg) => {
      setAccessToken(null);
      setSession(null);
      setNotice(msg ?? 'You were signed out.');
    });
    // a reload loses the in-memory token; the HttpOnly cookie restores the session
    refresh().then((s) => {
      setSession(s);
      setBooting(false);
    });
  }, []);

  useEffect(() => {
    const onHash = () => setPage(location.hash.slice(1) || 'overview');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // move focus to the page title on navigation so screen-reader users hear where they are
  useEffect(() => {
    document.getElementById('page-title')?.focus();
    document.title = `${NAV.find((n) => n.id === page)?.label ?? 'Admin'} · LastMinute Super Admin`;
  }, [page, session]);

  const go = (p: string) => {
    location.hash = p;
    setPage(p);
  };

  if (booting) return <p role="status" style={{ padding: 30 }}>Loading…</p>;
  if (!session) return <Login notice={notice} onDone={(s) => { setNotice(undefined); setSession(s); }} />;

  const role = session.role;
  const items = NAV.filter((n) => can(role, n.perm));
  const current = items.some((n) => n.id === page) ? page : 'overview';

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="shell">
        <nav className="sidebar" aria-label="Admin sections">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">⚡</div>
            <div>
              <strong>LastMinute</strong>
              <div className="hint">Super Admin</div>
            </div>
          </div>
          {!session.mustChangePassword
            ? items.map((n) => (
                <button key={n.id} className="nav-btn" aria-current={current === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
                  {n.label}
                </button>
              ))
            : null}
          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <p className="hint" style={{ marginBottom: 8 }}>
              Signed in as <strong>{session.username}</strong> ({role.replace('_', ' ')})
            </p>
            <button
              className="btn white small"
              onClick={async () => {
                await api('POST', '/logout').catch(() => {});
                setAccessToken(null);
                setSession(null);
                setNotice('Signed out.');
              }}
            >
              Sign out
            </button>
          </div>
        </nav>
        <main id="main">
          {session.mustChangePassword ? (
            <ChangePassword forced onDone={(s) => setSession(s)} />
          ) : (
            <>
              {current === 'overview' ? <OverviewPage go={go} /> : null}
              {current === 'providers' ? <ProvidersPage role={role} /> : null}
              {current === 'orders' ? <OrdersPage role={role} /> : null}
              {current === 'users' ? <UsersPage role={role} /> : null}
              {current === 'reviews' ? <ReviewsPage role={role} /> : null}
              {current === 'privacy' ? <PrivacyPage role={role} /> : null}
              {current === 'incidents' ? <IncidentsPage role={role} /> : null}
              {current === 'audit' ? <AuditPage /> : null}
              {current === 'admins' ? <AdminsPage /> : null}
              {current === 'account' ? (
                <>
                  <h1 id="page-title" tabIndex={-1} style={{ marginBottom: 16 }}>My account</h1>
                  <ChangePassword onDone={(s) => setSession(s)} />
                </>
              ) : null}
            </>
          )}
        </main>
      </div>
    </>
  );
}
