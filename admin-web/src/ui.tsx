import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { api, ApiError } from './api';

/** Load data from the API with loading/error state and a reload function. */
export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>('GET', path));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load.');
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
}

export function Status({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) return <p className="alert error" role="alert">{error}</p>;
  if (loading) return <p role="status" className="hint">Loading…</p>;
  return null;
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 id="page-title" tabIndex={-1}>{title}</h1>
        {sub ? <p className="hint">{sub}</p> : null}
      </div>
      <div className="row">{children}</div>
    </div>
  );
}

export function Pill({ children, tone }: { children: ReactNode; tone?: 'green' | 'pink' | 'yellow' | 'blue' | 'purple' }) {
  return <span className={`pill ${tone ?? ''}`}>{children}</span>;
}

/**
 * Modal that asks for a written reason before a sensitive action.
 * Uses the native <dialog> (focus trap + Esc handled by the browser).
 */
export function useReasonDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<{ title: string; confirm: string; run: (reason: string) => Promise<void> } | null>(null);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = (title: string, confirm: string, run: (reason: string) => Promise<void>) => {
    setState({ title, confirm, run });
    setReason('');
    setErr(null);
    queueMicrotask(() => ref.current?.showModal());
  };

  const dialog = (
    <dialog ref={ref} aria-labelledby="reason-title" onClose={() => setState(null)}>
      {state ? (
        <form
          method="dialog"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await state.run(reason.trim());
              ref.current?.close();
            } catch (x) {
              setErr(x instanceof ApiError ? x.message : 'Failed.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 id="reason-title" style={{ marginBottom: 12 }}>{state.title}</h2>
          <div className="field">
            <label htmlFor="reason">Reason (saved in the audit log)</label>
            <textarea id="reason" required minLength={5} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </div>
          {err ? <p className="alert error" role="alert" style={{ marginBottom: 12 }}>{err}</p> : null}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn white" onClick={() => ref.current?.close()}>Cancel</button>
            <button type="submit" className="btn pink" disabled={busy || reason.trim().length < 5}>{state.confirm}</button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
  return { ask, dialog };
}
