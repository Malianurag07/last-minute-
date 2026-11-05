import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

import { api, ApiError, setAccessToken, type SessionInfo } from '../api';

type Step = { kind: 'password' } | { kind: 'totp'; challenge: string } | { kind: 'setup'; challenge: string; secret: string; url: string };

export function Login({ onDone, notice }: { onDone: (s: SessionInfo) => void; notice?: string }) {
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (step.kind === 'setup') QRCode.toDataURL(step.url, { margin: 1, width: 400 }).then(setQr).catch(() => setQr(null));
  }, [step]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <main className="card login-card" aria-labelledby="login-title">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">⚡</div>
          <div>
            <h1 id="login-title" style={{ fontSize: 24 }}>LastMinute Super Admin</h1>
            <p className="hint">Restricted. Every action is recorded.</p>
          </div>
        </div>
        {notice ? <p className="alert info" role="status" style={{ marginBottom: 14 }}>{notice}</p> : null}
        {error ? <p className="alert error" role="alert" style={{ marginBottom: 14 }}>{error}</p> : null}

        {step.kind === 'password' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const r = await api<{ mfa: 'totp' | 'setup'; challenge: string; secret?: string; otpauthUrl?: string }>('POST', '/login', { username, password });
                setPassword('');
                setStep(r.mfa === 'setup' ? { kind: 'setup', challenge: r.challenge, secret: r.secret!, url: r.otpauthUrl! } : { kind: 'totp', challenge: r.challenge });
              });
            }}
          >
            <div className="field">
              <label htmlFor="u">Username</label>
              <input id="u" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label htmlFor="p">Password</label>
              <input id="p" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn purple" style={{ width: '100%' }} disabled={busy}>Continue</button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const s = await api<SessionInfo & { accessToken: string }>('POST', '/login/totp', { challenge: step.challenge, code });
                setAccessToken(s.accessToken);
                onDone(s);
              });
            }}
          >
            {step.kind === 'setup' ? (
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ marginBottom: 8 }}>Set up 2-step verification</h2>
                <p style={{ marginBottom: 10 }}>Scan this with Google Authenticator, Microsoft Authenticator or Authy, then type the 6-digit code.</p>
                {qr ? <img className="qr" src={qr} alt="QR code for your authenticator app" /> : null}
                <p className="hint" style={{ marginTop: 8 }}>Can’t scan? Enter this key:</p>
                <code className="secret">{step.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
              </div>
            ) : (
              <p style={{ marginBottom: 12 }}>Open your authenticator app and type the 6-digit code for LastMinute.</p>
            )}
            <div className="field">
              <label htmlFor="c">6-digit code</label>
              <input id="c" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
            </div>
            <button className="btn purple" style={{ width: '100%' }} disabled={busy || code.length !== 6}>Verify & sign in</button>
            <button type="button" className="btn white small" style={{ marginTop: 12 }} onClick={() => setStep({ kind: 'password' })}>Start again</button>
          </form>
        )}
      </main>
    </div>
  );
}

export function ChangePassword({ onDone, forced }: { onDone: (s: SessionInfo) => void; forced?: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  return (
    <section className="card" style={{ maxWidth: 520 }} aria-labelledby="pw-title">
      <h2 id="pw-title" style={{ marginBottom: 8 }}>{forced ? 'Set your own password' : 'Change password'}</h2>
      {forced ? <p className="alert info" style={{ marginBottom: 12 }}>You signed in with a temporary password. Choose a new one to continue.</p> : null}
      {error ? <p className="alert error" role="alert" style={{ marginBottom: 12 }}>{error}</p> : null}
      {ok ? <p className="alert ok" role="status" style={{ marginBottom: 12 }}>Password changed. Other sessions were signed out.</p> : null}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (next !== again) return setError('The new passwords don’t match.');
          try {
            const s = await api<SessionInfo & { accessToken: string }>('POST', '/password', { current, next });
            setAccessToken(s.accessToken);
            setOk(true);
            setCurrent('');
            setNext('');
            setAgain('');
            onDone(s);
          } catch (x) {
            setError(x instanceof ApiError ? x.message : 'Failed.');
          }
        }}
      >
        <div className="field">
          <label htmlFor="cur">Current password</label>
          <input id="cur" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="new">New password</label>
          <input id="new" type="password" autoComplete="new-password" required minLength={12} aria-describedby="new-hint" value={next} onChange={(e) => setNext(e.target.value)} />
          <p id="new-hint" className="hint">At least 12 characters. A short sentence is easy to remember and hard to guess.</p>
        </div>
        <div className="field">
          <label htmlFor="again">Type it again</label>
          <input id="again" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
        </div>
        <button className="btn purple">Save password</button>
      </form>
    </section>
  );
}
