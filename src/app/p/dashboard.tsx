import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { StatTile } from '../../components/cards';
import { Card, Row, Screen, Section, SpeakBtn, Stars, Txt } from '../../components/ui';
import { dayLabel, rupees } from '../../lib/format';
import { useStore } from '../../state/store';
import { border, colors } from '../../theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Dashboard() {
  const { t, me, orders } = useStore();
  if (!me) return null;

  const mine = orders.filter((o) => o.providerId === me.id);
  const visits = me.visits;
  const totalVisits = visits.reduce((a, b) => a + b, 0);
  const today = visits[visits.length - 1] ?? 0;
  const yesterday = visits[visits.length - 2] ?? 0;
  const change = yesterday ? Math.round(((today - yesterday) / yesterday) * 100) : 0;
  const answered = mine.filter((o) => o.status !== 'requested' && o.status !== 'cancelled');
  const accepted = answered.filter((o) => o.status !== 'declined');
  const acceptRate = answered.length ? Math.round((accepted.length / answered.length) * 100) : 100;
  const completed = mine.filter((o) => o.status === 'delivered');
  const earned = completed.reduce((s, o) => s + o.price + o.rushFee, 0);
  const conversion = totalVisits ? Math.round((mine.length / totalVisits) * 1000) / 10 : 0;
  const max = Math.max(1, ...visits);
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: me.reviews.filter((r) => Math.round(r.rating) === n).length }));
  const maxDist = Math.max(1, ...dist.map((d) => d.c));
  const dayNames = visits.map((_, i) => DAYS[(new Date().getDay() - (visits.length - 1 - i) + 7) % 7]);

  const speak = `In the last 7 days, ${totalVisits} people looked at your shop. Today ${today}. Your rating is ${me.rating || 'not yet available'}. You have earned ${earned} rupees from ${completed.length} finished orders.`;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h1">{t('dashboard')}</Txt>
        <SpeakBtn text={speak} />
      </Row>

      <Row>
        <StatTile icon="eye" label={`${t('visits')} · 7d`} value={String(totalVisits)} bg="purpleSoft" sub={`${today} today`} />
        <StatTile icon="star" label={t('rating')} value={me.rating ? me.rating.toFixed(1) : '–'} bg="yellowSoft" sub={`${me.reviews.length} reviews`} />
      </Row>
      <Row>
        <StatTile icon="wallet" label={t('earnings')} value={rupees(earned)} bg="greenSoft" sub={`${completed.length} completed`} />
        <StatTile icon="thumbs-up" label="Accepted" value={`${acceptRate}%`} bg="pinkSoft" sub={`${mine.length} orders total`} />
      </Row>

      <Section title="Who visited your shop">
        <Card inner={{ padding: 16, gap: 14 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="label">Profile visits, last 7 days</Txt>
            {yesterday ? (
              <Row gap={4}>
                <Ionicons name={change >= 0 ? 'trending-up' : 'trending-down'} size={18} color={change >= 0 ? colors.success : colors.danger} />
                <Txt v="small" color={change >= 0 ? 'success' : 'danger'}>
                  {change >= 0 ? '+' : ''}
                  {change}% vs yesterday
                </Txt>
              </Row>
            ) : null}
          </Row>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 150, gap: 8 }}>
            {visits.map((v, i) => {
              const isToday = i === visits.length - 1;
              return (
                <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }} accessibilityLabel={`${dayNames[i]}: ${v} visits`}>
                  <Txt v="small">{v}</Txt>
                  <View
                    style={{
                      width: '100%',
                      height: Math.max(6, (v / max) * 110),
                      backgroundColor: isToday ? colors.yellow : colors.purple,
                      borderWidth: border.width,
                      borderColor: colors.ink,
                      borderRadius: 6,
                    }}
                  />
                  <Txt v="small" color={isToday ? 'ink' : 'muted'}>
                    {isToday ? 'Today' : dayNames[i]}
                  </Txt>
                </View>
              );
            })}
          </View>
          <Txt v="small" color="muted">
            {conversion}% of visitors placed an order.
          </Txt>
        </Card>
      </Section>

      <Section title="What customers say">
        <Card inner={{ padding: 16, gap: 10 }}>
          <Row>
            <Txt v="display">{me.rating ? me.rating.toFixed(1) : '–'}</Txt>
            <View style={{ gap: 4 }}>
              <Stars value={me.rating} size={22} />
              <Txt v="small" color="muted">
                {me.reviews.length} reviews
              </Txt>
            </View>
          </Row>
          {dist.map((d) => (
            <Row key={d.n} gap={8}>
              <Txt v="small" style={{ width: 34 }} lines={1}>
                {d.n}★
              </Txt>
              <View style={{ flex: 1, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.white, overflow: 'hidden' }}>
                <View style={{ width: `${(d.c / maxDist) * 100}%`, height: '100%', backgroundColor: colors.orange }} />
              </View>
              <Txt v="small" style={{ width: 22, textAlign: 'right' }}>
                {d.c}
              </Txt>
            </Row>
          ))}
        </Card>
        {me.reviews.slice(0, 4).map((r) => (
          <Card key={r.id} offset={3} inner={{ padding: 14, gap: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="label">{r.author}</Txt>
              <Txt v="small" color="muted">
                {dayLabel(r.date)}
              </Txt>
            </Row>
            <Stars value={r.rating} />
            <Txt>{r.text}</Txt>
          </Card>
        ))}
        {!me.reviews.length ? <Txt color="muted">Reviews from your customers will show up here.</Txt> : null}
      </Section>

      <Card bg="yellow" inner={{ padding: 16, gap: 8 }}>
        <Row>
          <Ionicons name="bulb" size={24} color={colors.ink} />
          <Txt v="h3">Tips to get more orders</Txt>
        </Row>
        <Txt>• Reply to new orders within 10 minutes.</Txt>
        <Txt>• Keep “Taking orders” on during your working hours.</Txt>
        <Txt>• Ask happy customers to leave a review.</Txt>
      </Card>
    </Screen>
  );
}
