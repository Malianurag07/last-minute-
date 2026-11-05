import { useState } from 'react';

import { api, ApiError, can, rupees, when, type Role } from '../api';
import { PageHead, Pill, Status, useLoad, useReasonDialog } from '../ui';

const STATUS_TONE: Record<string, 'green' | 'pink' | 'yellow' | 'blue' | 'purple' | undefined> = {
  requested: 'yellow', accepted: 'blue', pickup: 'blue', working: 'purple', ready: 'green', delivered: 'green', declined: 'pink', cancelled: undefined,
};
const CATS: Record<string, string> = {
  tailoring: 'Tailoring', food: 'Home food', mehendi: 'Mehendi', baking: 'Baking', ironing: 'Ironing', repairs: 'Repairs', beauty: 'Beauty', crafts: 'Gifts & crafts', tuition: 'Tuition', electronics: 'Electronics',
};

/* ------------------------------------------------------------------ overview */
interface Overview {
  users: number; blockedUsers: number; providers: number; providersToVerify: number; suspendedProviders: number; orders: number; ordersToday: number;
  activeOrders: number; lateOrders: number; waitingReply: number; completedGmv: number; platformRevenue: number; openPrivacyRequests: number;
  overduePrivacyRequests: number; openIncidents: number; ordersByStatus: { status: string; n: number }[]; providersByCategory: { category: string; n: number }[];
}

export function OverviewPage({ go }: { go: (p: string) => void }) {
  const { data: d, loading, error } = useLoad<Overview>('/overview');
  return (
    <>
      <PageHead title="Overview" sub="Live numbers from the database." />
      <Status loading={loading} error={error} />
      {d ? (
        <div className="grid" style={{ gap: 22 }}>
          <div className="grid k4">
            <Stat label="Users" value={d.users} sub={`${d.blockedUsers} blocked`} bg="var(--blue-soft)" />
            <Stat label="Providers" value={d.providers} sub={`${d.providersToVerify} to verify · ${d.suspendedProviders} suspended`} bg="var(--green-soft)" />
            <Stat label="Orders" value={d.orders} sub={`${d.ordersToday} today · ${d.activeOrders} active`} bg="var(--yellow-soft)" />
            <Stat label="Completed value (GMV)" value={rupees(d.completedGmv)} sub={`Platform revenue ${rupees(d.platformRevenue)}`} bg="var(--pink-soft)" />
          </div>
          <section aria-labelledby="att">
            <h2 id="att" style={{ marginBottom: 10 }}>Needs attention</h2>
            <div className="grid k2">
              <Attention n={d.providersToVerify} text="providers waiting for verification" onClick={() => go('providers')} />
              <Attention n={d.lateOrders} text="active orders past their deadline" onClick={() => go('orders')} danger />
              <Attention n={d.waitingReply} text="orders waiting for the provider to reply" onClick={() => go('orders')} />
              <Attention n={d.openPrivacyRequests} text={`privacy requests open (${d.overduePrivacyRequests} overdue)`} onClick={() => go('privacy')} danger={d.overduePrivacyRequests > 0} />
              <Attention n={d.openIncidents} text="security incidents open" onClick={() => go('incidents')} danger={d.openIncidents > 0} />
            </div>
          </section>
          <div className="grid k2">
            <section className="card" aria-labelledby="obs">
              <h2 id="obs" style={{ marginBottom: 12 }}>Orders by status</h2>
              <Bars rows={d.ordersByStatus.map((r) => ({ label: r.status, n: r.n }))} />
            </section>
            <section className="card" aria-labelledby="pbc">
              <h2 id="pbc" style={{ marginBottom: 12 }}>Providers by category</h2>
              <Bars rows={d.providersByCategory.map((r) => ({ label: CATS[r.category] ?? r.category, n: r.n }))} />
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Stat({ label, value, sub, bg }: { label: string; value: string | number; sub: string; bg: string }) {
  return (
    <div className="stat" style={{ background: bg }}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

function Attention({ n, text, onClick, danger }: { n: number; text: string; onClick: () => void; danger?: boolean }) {
  return (
    <button className="btn white" style={{ justifyContent: 'flex-start', background: danger && n ? 'var(--pink-soft)' : undefined }} onClick={onClick}>
      <strong style={{ fontSize: 20 }}>{n}</strong> {text} →
    </button>
  );
}

function Bars({ rows }: { rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <p className="hint">No data yet.</p>;
  return (
    <table aria-label="Counts">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row" style={{ width: 150, textTransform: 'none', fontSize: 15, background: 'transparent' }}>{r.label}</th>
            <td>
              <div className="bar" aria-hidden="true"><span style={{ width: `${(r.n / max) * 100}%` }} /></div>
            </td>
            <td style={{ width: 50, fontWeight: 800 }}>{r.n}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ----------------------------------------------------------------- providers */
interface ProviderRow { id: string; name: string; categoryId: string; area: string; verified: number; suspended: number; available: number; rating: number; reviewCount: number; jobsDone: number; createdAt: number; phone: string }

export function ProvidersPage({ role }: { role: Role }) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'suspended'>('pending');
  const { data, loading, error, reload } = useLoad<ProviderRow[]>(`/providers?filter=${filter}`);
  const { ask, dialog } = useReasonDialog();
  const act = (p: ProviderRow, patch: { verified?: boolean; suspended?: boolean }, title: string, confirm: string) =>
    ask(title, confirm, async (reason) => {
      await api('POST', `/providers/${p.id}`, { ...patch, reason });
      await reload();
    });
  return (
    <>
      <PageHead title="Providers" sub="Verify new shops after a phone/ID check. Suspend shops after serious complaints." />
      <Tabs value={filter} onChange={(v) => setFilter(v as typeof filter)} options={[['pending', 'To verify'], ['all', 'All'], ['suspended', 'Suspended']]} />
      <Status loading={loading} error={error} />
      {data ? (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Providers</caption>
            <thead>
              <tr><th scope="col">Shop</th><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Rating</th><th scope="col">Joined</th><th scope="col">Actions</th></tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong><div className="hint">{p.area} · {p.phone}</div></td>
                  <td>{CATS[p.categoryId] ?? p.categoryId}</td>
                  <td className="row">
                    {p.verified ? <Pill tone="green">Verified</Pill> : <Pill tone="blue">Not verified</Pill>}
                    {p.suspended ? <Pill tone="pink">Suspended</Pill> : null}
                  </td>
                  <td>{p.reviewCount ? `${p.rating.toFixed(1)} ★ (${p.reviewCount})` : '—'}<div className="hint">{p.jobsDone} jobs</div></td>
                  <td>{when(p.createdAt)}</td>
                  <td className="row">
                    {can(role, 'providers.verify') ? (
                      <button className="btn small" onClick={() => act(p, { verified: !p.verified }, `${p.verified ? 'Remove verification from' : 'Verify'} ${p.name}?`, p.verified ? 'Unverify' : 'Verify')}>
                        {p.verified ? 'Unverify' : 'Verify'}
                      </button>
                    ) : null}
                    {can(role, 'providers.suspend') ? (
                      <button className="btn small pink" onClick={() => act(p, { suspended: !p.suspended }, `${p.suspended ? 'Restore' : 'Suspend'} ${p.name}?`, p.suspended ? 'Restore' : 'Suspend')}>
                        {p.suspended ? 'Restore' : 'Suspend'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!data.length ? <tr><td colSpan={6} className="hint">Nothing here.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {dialog}
    </>
  );
}

/* -------------------------------------------------------------------- orders */
interface OrderRow { id: string; serviceName: string; status: string; price: number; rushFee: number; deliveryFee: number; platformFee: number; commission: number; needBy: number; createdAt: number; handover: string; providerName: string }

export function OrdersPage({ role }: { role: Role }) {
  const [filter, setFilter] = useState('active');
  const { data, loading, error, reload } = useLoad<OrderRow[]>(`/orders?filter=${filter}`);
  const { ask, dialog } = useReasonDialog();
  return (
    <>
      <PageHead title="Orders" sub="Customer details are hidden here; open a support ticket to contact a customer." />
      <Tabs value={filter} onChange={setFilter} options={[['active', 'Active'], ['late', 'Past due'], ['closed', 'Closed'], ['all', 'All']]} />
      <Status loading={loading} error={error} />
      {data ? (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Orders</caption>
            <thead><tr><th scope="col">Order</th><th scope="col">Provider</th><th scope="col">Status</th><th scope="col">Due</th><th scope="col">Customer pays</th><th scope="col">Our revenue</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.map((o) => {
                const late = ['requested', 'accepted', 'pickup', 'working', 'ready'].includes(o.status) && o.needBy < Date.now();
                return (
                  <tr key={o.id}>
                    <td><strong>{o.serviceName}</strong><div className="mono">{o.id}</div></td>
                    <td>{o.providerName}</td>
                    <td className="row"><Pill tone={STATUS_TONE[o.status]}>{o.status}</Pill>{late ? <Pill tone="pink">Late</Pill> : null}</td>
                    <td>{when(o.needBy)}</td>
                    <td>{rupees(o.price + o.rushFee + o.deliveryFee + o.platformFee)}</td>
                    <td>{rupees(o.commission + o.platformFee)}</td>
                    <td>
                      {can(role, 'orders.cancel') && ['requested', 'accepted', 'pickup', 'working', 'ready'].includes(o.status) ? (
                        <button className="btn small white" onClick={() => ask(`Cancel order ${o.id}?`, 'Cancel order', async (reason) => { await api('POST', `/orders/${o.id}/cancel`, { reason }); await reload(); })}>Cancel</button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!data.length ? <tr><td colSpan={7} className="hint">No orders.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {dialog}
    </>
  );
}

/* --------------------------------------------------------------------- users */
interface UserRow { id: string; name: string; phone: string; status: string; createdAt: number; lastLoginAt: number | null; orders: number; shop: string | null }

export function UsersPage({ role }: { role: Role }) {
  const { data, loading, error, reload } = useLoad<UserRow[]>('/users');
  const [q, setQ] = useState('');
  const [revealed, setRevealed] = useState<Record<string, { phone: string; address: string }>>({});
  const { ask, dialog } = useReasonDialog();
  const list = (data ?? []).filter((u) => !q.trim() || u.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <PageHead title="Users" sub="Phone numbers are masked. Revealing one needs a reason and is logged." />
      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="uq">Search by name</label>
        <input id="uq" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Status loading={loading} error={error} />
      {data ? (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Users</caption>
            <thead><tr><th scope="col">Name</th><th scope="col">Phone</th><th scope="col">Status</th><th scope="col">Orders</th><th scope="col">Last login</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong>{u.shop ? <div className="hint">Shop: {u.shop}</div> : null}</td>
                  <td>{revealed[u.id] ? <>{revealed[u.id].phone}<div className="hint">{revealed[u.id].address}</div></> : u.phone}</td>
                  <td><Pill tone={u.status === 'active' ? 'green' : u.status === 'blocked' ? 'pink' : undefined}>{u.status}</Pill></td>
                  <td>{u.orders}</td>
                  <td>{when(u.lastLoginAt)}</td>
                  <td className="row">
                    {can(role, 'pii.view') && u.status !== 'erased' && !revealed[u.id] ? (
                      <button className="btn small white" onClick={() => ask(`Reveal contact details of ${u.name}?`, 'Reveal', async (reason) => { const r = await api<{ phone: string; address: string }>('POST', `/users/${u.id}/reveal`, { reason }); setRevealed((x) => ({ ...x, [u.id]: r })); })}>Reveal</button>
                    ) : null}
                    {can(role, 'users.block') && u.status !== 'erased' ? (
                      <button className="btn small pink" onClick={() => ask(`${u.status === 'blocked' ? 'Unblock' : 'Block'} ${u.name}?`, u.status === 'blocked' ? 'Unblock' : 'Block', async (reason) => { await api('POST', `/users/${u.id}/block`, { blocked: u.status !== 'blocked', reason }); await reload(); })}>
                        {u.status === 'blocked' ? 'Unblock' : 'Block'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {dialog}
    </>
  );
}

/* ------------------------------------------------------------------- reviews */
interface ReviewRow { id: string; rating: number; text: string; author: string; createdAt: number; removedAt: number | null; removedReason: string | null; providerName: string }

export function ReviewsPage({ role }: { role: Role }) {
  const { data, loading, error, reload } = useLoad<ReviewRow[]>('/reviews');
  const [low, setLow] = useState(false);
  const { ask, dialog } = useReasonDialog();
  const list = (data ?? []).filter((r) => !low || r.rating <= 3);
  return (
    <>
      <PageHead title="Reviews" sub="Remove only abusive, fake or personal-data-revealing reviews. Removal is reversible evidence, not deletion." />
      <Tabs value={low ? 'low' : 'all'} onChange={(v) => setLow(v === 'low')} options={[['all', 'All'], ['low', '3★ and below']]} />
      <Status loading={loading} error={error} />
      <div className="grid" style={{ gap: 12 }}>
        {list.map((r) => (
          <article key={r.id} className="card flat" style={{ opacity: r.removedAt ? 0.6 : 1 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{r.author} → {r.providerName}</strong>
              <span className="hint">{when(r.createdAt)}</span>
            </div>
            <p aria-label={`${r.rating} out of 5 stars`} style={{ color: '#a34b00', fontWeight: 900 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</p>
            <p>{r.text}</p>
            {r.removedAt ? <p className="hint">Removed: {r.removedReason}</p> : can(role, 'reviews.moderate') ? (
              <button className="btn small white" style={{ marginTop: 8 }} onClick={() => ask('Remove this review?', 'Remove', async (reason) => { await api('POST', `/reviews/${r.id}/remove`, { reason }); await reload(); })}>Remove</button>
            ) : null}
          </article>
        ))}
      </div>
      {dialog}
    </>
  );
}

/* ------------------------------------------------------------------- privacy */
interface PrivacyRow { id: string; userId: string | null; type: string; status: string; detail: Record<string, unknown> | null; createdAt: number; dueAt: number; resolvedAt: number | null; resolution: string | null }

export function PrivacyPage({ role }: { role: Role }) {
  const { data, loading, error, reload } = useLoad<PrivacyRow[]>('/privacy-requests');
  const [answering, setAnswering] = useState<PrivacyRow | null>(null);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <PageHead title="Privacy requests & grievances" sub="DPDP Act: answer grievances within 7 days (our SLA). Erasure and export requests are handled automatically and logged here." />
      <Status loading={loading} error={error} />
      {msg ? <p className="alert error" role="alert">{msg}</p> : null}
      {data ? (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Privacy requests</caption>
            <thead><tr><th scope="col">Type</th><th scope="col">Details</th><th scope="col">Status</th><th scope="col">Due</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.map((r) => {
                const overdue = ['open', 'in_progress'].includes(r.status) && r.dueAt < Date.now();
                return (
                  <tr key={r.id}>
                    <td><strong>{r.type}</strong><div className="mono">{r.id}</div></td>
                    <td style={{ maxWidth: 380 }}>{r.detail ? <>{String(r.detail.subject ?? '')}<div className="hint">{String(r.detail.message ?? '')}</div></> : '—'}{r.resolution ? <div className="hint">Answer: {r.resolution}</div> : null}</td>
                    <td className="row"><Pill tone={r.status === 'resolved' ? 'green' : r.status === 'rejected' ? 'pink' : 'yellow'}>{r.status}</Pill>{overdue ? <Pill tone="pink">Overdue</Pill> : null}</td>
                    <td>{when(r.dueAt)}</td>
                    <td>{can(role, 'privacy.handle') && ['open', 'in_progress'].includes(r.status) ? <button className="btn small" onClick={() => { setAnswering(r); setText(''); }}>Answer</button> : null}</td>
                  </tr>
                );
              })}
              {!data.length ? <tr><td colSpan={5} className="hint">No requests.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {answering ? (
        <section className="card" style={{ marginTop: 18, maxWidth: 640 }} aria-labelledby="ans">
          <h2 id="ans" style={{ marginBottom: 10 }}>Answer {answering.type} {answering.id}</h2>
          <div className="field">
            <label htmlFor="res">Reply to the person (they see this in the app)</label>
            <textarea id="res" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="row">
            {(['in_progress', 'resolved', 'rejected'] as const).map((s) => (
              <button key={s} className={`btn ${s === 'resolved' ? 'green' : s === 'rejected' ? 'pink' : 'white'}`} disabled={text.trim().length < 5}
                onClick={async () => {
                  try {
                    await api('POST', `/privacy-requests/${answering.id}`, { status: s, resolution: text.trim() });
                    setAnswering(null);
                    await reload();
                  } catch (e) {
                    setMsg(e instanceof ApiError ? e.message : 'Failed');
                  }
                }}>
                Mark {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------------- incidents */
interface IncidentRow { id: string; title: string; severity: string; personal_data: number; description: string; status: string; detected_at: number; board_notified_at: number | null; users_notified_at: number | null }

export function IncidentsPage({ role }: { role: Role }) {
  const { data, loading, error, reload } = useLoad<IncidentRow[]>('/incidents');
  const [form, setForm] = useState({ title: '', severity: 'medium', personalData: false, description: '' });
  const [note, setNote] = useState<string | null>(null);
  const manage = can(role, 'incidents.manage');
  return (
    <>
      <PageHead title="Security incidents" sub="Breach register. Personal-data breaches must be reported to the Data Protection Board and affected people; cyber incidents to CERT-In within 6 hours." />
      <Status loading={loading} error={error} />
      {note ? <p className="alert info" role="status" style={{ marginBottom: 14 }}>{note}</p> : null}
      {manage ? (
        <form className="card" style={{ marginBottom: 20, maxWidth: 720 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await api<{ reminder?: string }>('POST', '/incidents', form);
            setNote(r.reminder ?? 'Incident recorded.');
            setForm({ title: '', severity: 'medium', personalData: false, description: '' });
            await reload();
          }}>
          <h2 style={{ marginBottom: 12 }}>Report an incident</h2>
          <div className="field"><label htmlFor="it">Title</label><input id="it" required minLength={5} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="grid k2">
            <div className="field"><label htmlFor="is">Severity</label>
              <select id="is" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>{['low', 'medium', 'high', 'critical'].map((s) => <option key={s}>{s}</option>)}</select>
            </div>
            <div className="field"><label><input type="checkbox" style={{ width: 22, minHeight: 22, marginRight: 8, verticalAlign: 'middle' }} checked={form.personalData} onChange={(e) => setForm({ ...form, personalData: e.target.checked })} />Personal data affected</label></div>
          </div>
          <div className="field"><label htmlFor="id">What happened</label><textarea id="id" required minLength={10} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <button className="btn pink">Record incident</button>
        </form>
      ) : null}
      <div className="grid" style={{ gap: 12 }}>
        {(data ?? []).map((i) => (
          <article key={i.id} className="card flat">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3>{i.title}</h3>
              <div className="row"><Pill tone={i.severity === 'critical' || i.severity === 'high' ? 'pink' : 'yellow'}>{i.severity}</Pill><Pill tone={i.status === 'closed' ? 'green' : 'blue'}>{i.status}</Pill>{i.personal_data ? <Pill tone="purple">personal data</Pill> : null}</div>
            </div>
            <p className="hint">Detected {when(i.detected_at)} · Board notified: {when(i.board_notified_at)} · Users notified: {when(i.users_notified_at)}</p>
            <p style={{ marginTop: 6 }}>{i.description}</p>
            {manage ? (
              <div className="row" style={{ marginTop: 10 }}>
                {i.status !== 'contained' && i.status !== 'closed' ? <button className="btn small white" onClick={async () => { await api('POST', `/incidents/${i.id}`, { status: 'contained' }); await reload(); }}>Mark contained</button> : null}
                {i.status !== 'closed' ? <button className="btn small green" onClick={async () => { await api('POST', `/incidents/${i.id}`, { status: 'closed' }); await reload(); }}>Close</button> : null}
                {i.personal_data && !i.board_notified_at ? <button className="btn small" onClick={async () => { await api('POST', `/incidents/${i.id}`, { boardNotified: true }); await reload(); }}>Board notified</button> : null}
                {i.personal_data && !i.users_notified_at ? <button className="btn small" onClick={async () => { await api('POST', `/incidents/${i.id}`, { usersNotified: true }); await reload(); }}>Users notified</button> : null}
              </div>
            ) : null}
          </article>
        ))}
        {data && !data.length ? <p className="hint">No incidents recorded.</p> : null}
      </div>
    </>
  );
}

/* --------------------------------------------------------------------- audit */
interface AuditRow { seq: number; at: number; actorType: string; actorId: string; action: string; target: string | null; detail: string | null }

export function AuditPage() {
  const { data, loading, error } = useLoad<AuditRow[]>('/audit?limit=200');
  const [check, setCheck] = useState<{ ok: boolean; checked: number; brokenAt?: number } | null>(null);
  return (
    <>
      <PageHead title="Audit log" sub="Append-only and hash-chained: any edit or deletion breaks the chain.">
        <button className="btn purple" onClick={async () => setCheck(await api('GET', '/audit/verify'))}>Verify integrity</button>
      </PageHead>
      {check ? (
        <p className={`alert ${check.ok ? 'ok' : 'error'}`} role="status" style={{ marginBottom: 14 }}>
          {check.ok ? `✓ Chain intact — ${check.checked} entries verified.` : `✗ Tampering detected at entry #${check.brokenAt}. Open a critical incident now.`}
        </p>
      ) : null}
      <Status loading={loading} error={error} />
      {data ? (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Audit log</caption>
            <thead><tr><th scope="col">#</th><th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Detail</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.seq}>
                  <td>{r.seq}</td>
                  <td>{when(r.at)}</td>
                  <td><Pill tone={r.actorType === 'admin' ? 'purple' : r.actorType === 'system' ? undefined : 'blue'}>{r.actorType}</Pill><div className="mono">{r.actorId}</div></td>
                  <td><strong>{r.action}</strong></td>
                  <td className="mono">{r.target ?? '—'}</td>
                  <td className="mono" style={{ maxWidth: 320, wordBreak: 'break-word' }}>{r.detail ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------- admins */
interface AdminRow { id: string; username: string; role: Role; mfa: number; disabled: number; mustChangePassword: number; createdAt: number; lastLoginAt: number | null }

export function AdminsPage() {
  const { data, loading, error, reload } = useLoad<AdminRow[]>('/admins');
  const [form, setForm] = useState({ username: '', role: 'support' as Role, tempPassword: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { ask, dialog } = useReasonDialog();
  return (
    <>
      <PageHead title="Admin accounts" sub="Give each person their own account with the smallest role they need. Never share logins." />
      <Status loading={loading} error={error} />
      {msg ? <p className={`alert ${msg.ok ? 'ok' : 'error'}`} role="status" style={{ marginBottom: 14 }}>{msg.text}</p> : null}
      {data ? (
        <div className="table-wrap" style={{ marginBottom: 22 }}>
          <table>
            <caption className="sr-only">Admins</caption>
            <thead><tr><th scope="col">Username</th><th scope="col">Role</th><th scope="col">2FA</th><th scope="col">Last login</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.username}</strong>{a.disabled ? <> <Pill tone="pink">disabled</Pill></> : null}{a.mustChangePassword ? <div className="hint">Temporary password</div> : null}</td>
                  <td><Pill tone="purple">{a.role}</Pill></td>
                  <td>{a.mfa ? <Pill tone="green">On</Pill> : <Pill tone="yellow">Not set up</Pill>}</td>
                  <td>{when(a.lastLoginAt)}</td>
                  <td className="row">
                    <button className="btn small white" onClick={() => ask(`Reset 2FA for ${a.username}?`, 'Reset 2FA', async (reason) => { await api('POST', `/admins/${a.id}`, { resetMfa: true, reason }); await reload(); })}>Reset 2FA</button>
                    <button className="btn small pink" onClick={() => ask(`${a.disabled ? 'Enable' : 'Disable'} ${a.username}?`, a.disabled ? 'Enable' : 'Disable', async (reason) => { await api('POST', `/admins/${a.id}`, { disabled: !a.disabled, reason }); await reload(); })}>{a.disabled ? 'Enable' : 'Disable'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <form className="card" style={{ maxWidth: 640 }}
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('POST', '/admins', form);
            setMsg({ ok: true, text: `Created ${form.username}. Share the temporary password privately; they must change it and set up 2FA at first login.` });
            setForm({ username: '', role: 'support', tempPassword: '' });
            await reload();
          } catch (x) {
            setMsg({ ok: false, text: x instanceof ApiError ? x.message : 'Failed' });
          }
        }}>
        <h2 style={{ marginBottom: 12 }}>Add an admin</h2>
        <div className="grid k2">
          <div className="field"><label htmlFor="nu">Username</label><input id="nu" required pattern="[a-z][a-z0-9._-]{2,30}" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} /></div>
          <div className="field"><label htmlFor="nr">Role</label>
            <select id="nr" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="support">support — view & answer requests</option>
              <option value="ops">ops — verify, suspend, cancel, block</option>
              <option value="auditor">auditor — read audit & incidents</option>
              <option value="super_admin">super_admin — everything</option>
            </select>
          </div>
        </div>
        <div className="field"><label htmlFor="np">Temporary password (12+ characters)</label><input id="np" type="password" autoComplete="new-password" required minLength={12} value={form.tempPassword} onChange={(e) => setForm({ ...form, tempPassword: e.target.value })} /></div>
        <button className="btn purple">Create admin</button>
      </form>
      {dialog}
    </>
  );
}

/* ---------------------------------------------------------------------- tabs */
function Tabs({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="tabs" role="tablist" aria-label="Filter">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} className="tab" onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}
