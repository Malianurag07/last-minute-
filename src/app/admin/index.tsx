import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Pill, STATUS, StatTile, StatusPill } from '../../components/cards';
import { Badge, Btn, Card, Chip, Empty, Field, IconBox, IconBtn, Row, Screen, Section, Stars, Txt, type IconName } from '../../components/ui';
import { CATEGORIES, categoryById } from '../../data/categories';
import type { OrderStatus, Provider } from '../../data/types';
import { formatPhone } from '../../lib/auth';
import { confirm } from '../../lib/confirm';
import { clock, dayLabel, minutesUntil, rupees } from '../../lib/format';
import { matches } from '../../lib/search';
import { useStore } from '../../state/store';
import { border, colors } from '../../theme';

type Tab = 'overview' | 'providers' | 'orders' | 'users' | 'reviews' | 'settings';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'providers', label: 'Providers', icon: 'storefront' },
  { id: 'orders', label: 'Orders', icon: 'receipt' },
  { id: 'users', label: 'Users', icon: 'people' },
  { id: 'reviews', label: 'Reviews', icon: 'star' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const ACTIVE: OrderStatus[] = ['requested', 'accepted', 'pickup', 'working', 'ready'];

/** Operations panel: verify and suspend shops, watch orders, moderate reviews, block users. */
export default function Admin() {
  const { adminSession } = useStore();
  const [tab, setTab] = useState<Tab>('overview');
  if (!adminSession) return <Redirect href="/admin/login" />;

  return (
    <Screen bg="paper">
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <IconBox icon="shield-checkmark" bg="purple" color="white" size={48} />
          <View>
            <Txt v="h2">Admin panel</Txt>
            <Txt v="small" color="muted">
              LastMinute operations
            </Txt>
          </View>
        </Row>
        <IconBtn icon="home" label="Back to app" onPress={() => router.replace('/')} />
      </Row>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {TABS.map((x) => (
          <Chip key={x.id} icon={x.icon} label={x.label} active={tab === x.id} onPress={() => setTab(x.id)} color="purpleSoft" />
        ))}
      </ScrollView>

      {tab === 'overview' ? <Overview go={setTab} /> : null}
      {tab === 'providers' ? <Providers /> : null}
      {tab === 'orders' ? <Orders /> : null}
      {tab === 'users' ? <Users /> : null}
      {tab === 'reviews' ? <Reviews /> : null}
      {tab === 'settings' ? <AdminSettings /> : null}
    </Screen>
  );
}

/* ---------------------------------------------------------------- overview */

function Overview({ go }: { go: (t: Tab) => void }) {
  const { users, providers, orders } = useStore();
  const today = new Date().toDateString();
  const delivered = orders.filter((o) => o.status === 'delivered');
  const gmv = delivered.reduce((s, o) => s + o.price + o.rushFee, 0);
  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const late = active.filter((o) => minutesUntil(o.needBy) < 0);
  const pending = providers.filter((p) => !p.verified && !p.suspended);
  const suspended = providers.filter((p) => p.suspended);
  const rated = providers.filter((p) => p.reviews.length);
  const avg = rated.length ? rated.reduce((s, p) => s + p.rating, 0) / rated.length : 0;
  const statusCounts = (Object.keys(STATUS) as OrderStatus[]).map((s) => ({ s, n: orders.filter((o) => o.status === s).length })).filter((x) => x.n);
  const maxS = Math.max(1, ...statusCounts.map((x) => x.n));

  return (
    <View style={{ gap: 18 }}>
      <Row>
        <StatTile icon="people" label="Users" value={String(users.length)} bg="blueSoft" sub={`${users.filter((u) => u.blocked).length} blocked`} />
        <StatTile icon="storefront" label="Providers" value={String(providers.length)} bg="greenSoft" sub={`${pending.length} to verify`} />
      </Row>
      <Row>
        <StatTile icon="receipt" label="Orders" value={String(orders.length)} bg="yellowSoft" sub={`${orders.filter((o) => new Date(o.createdAt).toDateString() === today).length} today`} />
        <StatTile icon="wallet" label="Completed value" value={rupees(gmv)} bg="pinkSoft" sub={`${delivered.length} completed`} />
      </Row>
      <Row>
        <StatTile icon="flash" label="Active now" value={String(active.length)} bg="purpleSoft" sub={`${late.length} past due`} />
        <StatTile icon="star" label="Avg rating" value={avg ? avg.toFixed(1) : '–'} bg="orangeSoft" sub={`${suspended.length} suspended`} />
      </Row>

      <Section title="Needs attention">
        <View style={{ gap: 10 }}>
          <AttentionRow icon="shield-half" bg="blueSoft" text={`${pending.length} provider${pending.length === 1 ? '' : 's'} waiting for verification`} onPress={() => go('providers')} />
          <AttentionRow icon="alarm" bg={late.length ? 'pink' : 'greySoft'} text={`${late.length} active order${late.length === 1 ? '' : 's'} past the deadline`} onPress={() => go('orders')} />
          <AttentionRow
            icon="hourglass"
            bg="yellowSoft"
            text={`${orders.filter((o) => o.status === 'requested').length} order(s) waiting for provider reply`}
            onPress={() => go('orders')}
          />
        </View>
      </Section>

      <Section title="Orders by status">
        <Card inner={{ padding: 16, gap: 10 }}>
          {statusCounts.map(({ s, n }) => (
            <Row key={s} gap={8}>
              <Txt v="small" style={{ width: 130 }} lines={1}>
                {STATUS[s].label}
              </Txt>
              <View style={{ flex: 1, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.white, overflow: 'hidden' }}>
                <View style={{ width: `${(n / maxS) * 100}%`, height: '100%', backgroundColor: colors.purple }} />
              </View>
              <Txt v="small" style={{ width: 24, textAlign: 'right' }}>
                {n}
              </Txt>
            </Row>
          ))}
          {!statusCounts.length ? <Txt color="muted">No orders yet.</Txt> : null}
        </Card>
      </Section>

      <Section title="Providers by category">
        <Card inner={{ padding: 16, gap: 8 }}>
          {CATEGORIES.map((c) => {
            const n = providers.filter((p) => p.categoryId === c.id).length;
            return (
              <Row key={c.id} style={{ justifyContent: 'space-between' }}>
                <Row gap={8} style={{ flex: 1 }}>
                  <Ionicons name={c.icon as IconName} size={18} color={colors.ink} />
                  <Txt v="small" lines={1} style={{ flex: 1 }}>
                    {c.name}
                  </Txt>
                </Row>
                <Txt v="label">{n}</Txt>
              </Row>
            );
          })}
        </Card>
      </Section>
    </View>
  );
}

function AttentionRow({ icon, bg, text, onPress }: { icon: IconName; bg: 'blueSoft' | 'pink' | 'greySoft' | 'yellowSoft'; text: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: border.width, borderColor: colors.ink, backgroundColor: colors[bg] }}
    >
      <Ionicons name={icon} size={22} color={colors.ink} />
      <Txt v="label" style={{ flex: 1 }}>
        {text}
      </Txt>
      <Ionicons name="chevron-forward" size={20} color={colors.ink} />
    </Pressable>
  );
}

/* --------------------------------------------------------------- providers */

function Providers() {
  const { providers, users, updateProvider } = useStore();
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | 'pending' | 'suspended'>('all');
  const list = providers.filter(
    (p) => matches(p, q) && (f === 'all' || (f === 'pending' ? !p.verified && !p.suspended : p.suspended)),
  );
  const owner = (p: Provider) => users.find((u) => u.providerId === p.id);

  return (
    <View style={{ gap: 14 }}>
      <Field icon="search" placeholder="Search providers" value={q} onChangeText={setQ} />
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        <Chip label={`All (${providers.length})`} active={f === 'all'} onPress={() => setF('all')} color="purpleSoft" />
        <Chip label={`To verify (${providers.filter((p) => !p.verified && !p.suspended).length})`} active={f === 'pending'} onPress={() => setF('pending')} color="blueSoft" />
        <Chip label={`Suspended (${providers.filter((p) => p.suspended).length})`} active={f === 'suspended'} onPress={() => setF('suspended')} color="pinkSoft" />
      </Row>
      {list.map((p) => {
        const c = categoryById(p.categoryId);
        const u = owner(p);
        return (
          <Card key={p.id} bg={p.suspended ? 'greySoft' : 'white'} inner={{ padding: 14, gap: 10 }}>
            <Row style={{ alignItems: 'flex-start' }}>
              <IconBox icon={c.icon as IconName} bg={c.color} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="h3">{p.name}</Txt>
                <Txt v="small" color="muted">
                  {c.name} · {p.area}
                </Txt>
                <Txt v="small" color="muted">
                  {p.phone}
                  {u ? ` · account: ${u.name}` : ''}
                </Txt>
              </View>
            </Row>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {p.verified ? <Pill icon="shield-checkmark" label="Verified" bg="greenSoft" /> : <Pill icon="shield-half" label="Not verified" bg="blueSoft" />}
              {p.suspended ? <Pill icon="pause" label="Suspended" bg="pink" /> : null}
              <Pill icon="star" label={p.rating ? `${p.rating.toFixed(1)} (${p.reviews.length})` : 'No reviews'} bg="yellowSoft" />
              <Pill icon="checkmark-done" label={`${p.jobsDone} jobs`} />
              <Pill icon="eye" label={`${p.visits.reduce((a, b) => a + b, 0)} visits/7d`} />
            </Row>
            <Row>
              <View style={{ flex: 1 }}>
                <Btn
                  label={p.verified ? 'Unverify' : 'Verify'}
                  icon={p.verified ? 'close-circle' : 'shield-checkmark'}
                  bg={p.verified ? 'white' : 'green'}
                  fg={p.verified ? 'ink' : 'white'}
                  onPress={() => updateProvider(p.id, { verified: !p.verified })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Btn
                  label={p.suspended ? 'Restore' : 'Suspend'}
                  icon={p.suspended ? 'play' : 'pause'}
                  bg={p.suspended ? 'yellow' : 'pinkSoft'}
                  onPress={() =>
                    p.suspended
                      ? updateProvider(p.id, { suspended: false })
                      : confirm('Suspend this provider?', `${p.name} will be hidden from customers until restored.`, () => updateProvider(p.id, { suspended: true, available: false }), 'Suspend')
                  }
                />
              </View>
            </Row>
          </Card>
        );
      })}
      {!list.length ? <Empty icon="storefront" title="No providers match" /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ orders */

function Orders() {
  const { orders, providers, setOrderStatus } = useStore();
  const [f, setF] = useState<'active' | 'late' | 'done' | 'all'>('active');
  const list = useMemo(
    () =>
      orders
        .filter((o) =>
          f === 'all'
            ? true
            : f === 'active'
              ? ACTIVE.includes(o.status)
              : f === 'late'
                ? ACTIVE.includes(o.status) && minutesUntil(o.needBy) < 0
                : !ACTIVE.includes(o.status),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders, f],
  );
  return (
    <View style={{ gap: 14 }}>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {(['active', 'late', 'done', 'all'] as const).map((x) => (
          <Chip key={x} label={{ active: 'Active', late: 'Past due', done: 'Closed', all: 'All' }[x]} active={f === x} onPress={() => setF(x)} color="purpleSoft" />
        ))}
      </Row>
      {list.map((o) => {
        const p = providers.find((x) => x.id === o.providerId);
        const late = ACTIVE.includes(o.status) && minutesUntil(o.needBy) < 0;
        return (
          <Card key={o.id} bg={late ? 'pinkSoft' : 'white'} inner={{ padding: 14, gap: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="h3" style={{ flex: 1 }} lines={1}>
                {o.serviceName}
              </Txt>
              <Txt v="h3">{rupees(o.price + o.rushFee + o.deliveryFee)}</Txt>
            </Row>
            <Txt v="small">
              #{o.id} · {o.customerName} → {p?.name ?? 'Unknown'}
            </Txt>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              <StatusPill status={o.status} />
              <Pill icon="alarm" label={`Due ${dayLabel(o.needBy)} ${clock(o.needBy)}`} bg={late ? 'pink' : 'white'} />
              {o.delivery ? <Pill icon="bicycle" label={o.delivery.partnerName} /> : null}
              {late ? <Badge label="Late" bg="danger" /> : null}
            </Row>
            {ACTIVE.includes(o.status) ? (
              <Btn
                label="Cancel order"
                icon="close"
                bg="white"
                full={false}
                onPress={() => confirm('Cancel this order?', 'Both the customer and the provider will see it as cancelled.', () => setOrderStatus(o.id, 'cancelled'), 'Cancel order')}
              />
            ) : null}
          </Card>
        );
      })}
      {!list.length ? <Empty icon="receipt-outline" title="No orders here" /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------- users */

function Users() {
  const { users, orders, providers, setUserBlocked } = useStore();
  const [q, setQ] = useState('');
  const list = users.filter((u) => !q.trim() || `${u.name} ${u.phone}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <View style={{ gap: 14 }}>
      <Field icon="search" placeholder="Search by name or phone" value={q} onChangeText={setQ} />
      {list.map((u) => {
        const shop = providers.find((p) => p.id === u.providerId);
        const n = orders.filter((o) => o.customerId === u.id).length;
        return (
          <Card key={u.id} bg={u.blocked ? 'greySoft' : 'white'} inner={{ padding: 14, gap: 8 }}>
            <Row>
              <IconBox icon={u.providerId ? 'storefront' : 'person'} bg={u.providerId ? 'greenSoft' : 'pinkSoft'} size={44} />
              <View style={{ flex: 1 }}>
                <Txt v="h3">{u.name}</Txt>
                <Txt v="small" color="muted">
                  {formatPhone(u.phone)} · joined {dayLabel(u.createdAt)}
                </Txt>
              </View>
              {u.blocked ? <Badge label="Blocked" bg="danger" /> : null}
            </Row>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              <Pill icon="receipt" label={`${n} order${n === 1 ? '' : 's'}`} />
              {shop ? <Pill icon="storefront" label={shop.name} bg="greenSoft" /> : null}
            </Row>
            <Btn
              label={u.blocked ? 'Unblock' : 'Block user'}
              icon={u.blocked ? 'lock-open' : 'ban'}
              bg={u.blocked ? 'yellow' : 'pinkSoft'}
              full={false}
              onPress={() =>
                u.blocked
                  ? setUserBlocked(u.id, false)
                  : confirm('Block this user?', `${u.name} will not be able to log in.`, () => setUserBlocked(u.id, true), 'Block')
              }
            />
          </Card>
        );
      })}
      {!list.length ? <Empty icon="people" title="No users match" /> : null}
    </View>
  );
}

/* ----------------------------------------------------------------- reviews */

function Reviews() {
  const { providers, deleteReview } = useStore();
  const [lowOnly, setLowOnly] = useState(false);
  const all = providers
    .flatMap((p) => p.reviews.map((r) => ({ r, p })))
    .filter(({ r }) => !lowOnly || r.rating <= 3)
    .sort((a, b) => b.r.date.localeCompare(a.r.date));
  return (
    <View style={{ gap: 14 }}>
      <Row gap={8}>
        <Chip label="All reviews" active={!lowOnly} onPress={() => setLowOnly(false)} color="purpleSoft" />
        <Chip label="3★ and below" active={lowOnly} onPress={() => setLowOnly(true)} color="pinkSoft" />
      </Row>
      {all.map(({ r, p }) => (
        <Card key={`${p.id}-${r.id}`} offset={3} inner={{ padding: 14, gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="label" style={{ flex: 1 }} lines={1}>
              {r.author} → {p.name}
            </Txt>
            <Txt v="small" color="muted">
              {dayLabel(r.date)}
            </Txt>
          </Row>
          <Stars value={r.rating} />
          <Txt>{r.text}</Txt>
          <Btn
            label="Remove review"
            icon="trash"
            bg="white"
            full={false}
            onPress={() => confirm('Remove this review?', 'Use this only for abusive or fake reviews. The rating will be recalculated.', () => deleteReview(p.id, r.id), 'Remove')}
          />
        </Card>
      ))}
      {!all.length ? <Empty icon="star-outline" title="No reviews" /> : null}
    </View>
  );
}

/* ---------------------------------------------------------------- settings */

function AdminSettings() {
  const { admin, adminChangePassword, adminLogout, resetDemo } = useStore();
  const [oldP, setOldP] = useState('');
  const [newP, setNewP] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <View style={{ gap: 14 }}>
      <Card inner={{ padding: 16, gap: 12 }}>
        <Txt v="h3">Change admin password</Txt>
        <Txt v="small" color="muted">
          Signed in as “{admin.username}”.
        </Txt>
        <Field icon="lock-closed" placeholder="Current password" secureTextEntry autoCapitalize="none" value={oldP} onChangeText={setOldP} />
        <Field icon="key" placeholder="New password (8+ characters)" secureTextEntry autoCapitalize="none" value={newP} onChangeText={setNewP} />
        <Btn
          label="Update password"
          icon="checkmark"
          bg="purple"
          fg="white"
          disabled={!oldP || !newP}
          onPress={async () => {
            const err = await adminChangePassword(oldP, newP);
            setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Password updated.' });
            if (!err) {
              setOldP('');
              setNewP('');
            }
          }}
        />
        {msg ? (
          <Txt v="label" color={msg.ok ? 'success' : 'danger'}>
            {msg.text}
          </Txt>
        ) : null}
      </Card>
      <Btn
        label="Log out of admin"
        icon="log-out"
        bg="white"
        onPress={() => {
          adminLogout();
          router.replace('/welcome');
        }}
      />
      <Btn
        label="Reset all demo data"
        icon="refresh"
        bg="pinkSoft"
        onPress={() =>
          confirm('Reset everything?', 'All accounts, shops and orders go back to the demo data.', () => {
            resetDemo();
            router.replace('/welcome');
          }, 'Reset')
        }
      />
    </View>
  );
}
