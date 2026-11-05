import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { JobActions } from '../../components/JobActions';
import { Card, Grid, IconBox, IconBtn, PressCard, Row, Screen, Section, SpeakBtn, tap, Txt, type IconName } from '../../components/ui';
import type { Order } from '../../data/types';
import { HELPLINE } from '../../lib/constants';
import { clock, dayLabel, minutesUntil, rupees, timeLeft } from '../../lib/format';
import { providerPayout } from '../../lib/pricing';
import { useStore } from '../../state/store';
import { border, colors, type ColorName } from '../../theme';

export default function ProviderHome() {
  const { t, me, orders, easyMode, updateProvider } = useStore();
  const [weekAgo] = useState(() => Date.now() - 7 * 864e5);
  if (!me) return null;

  const mine = orders.filter((o) => o.providerId === me.id);
  const requests = mine.filter((o) => o.status === 'requested');
  const active = mine.filter((o) => ['accepted', 'pickup', 'working', 'ready'].includes(o.status));
  const earned = mine
    .filter((o) => o.status === 'delivered' && new Date(o.createdAt).getTime() > weekAgo)
    .reduce((s, o) => s + providerPayout(o), 0);
  const firstName = me.name.split(/[ ']/)[0];

  const summary =
    `${t('hello')} ${firstName}. ` +
    `${requests.length} ${t('newOrders')}. ${active.length} ${t('todaysWork')}. ${t('earnings')} ${earned} rupees.` +
    (requests[0] ? ` ${requests[0].customerName} needs ${requests[0].serviceName} ${timeLeft(requests[0].needBy)}.` : '');

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconBtn icon="settings-outline" label={t('settings')} onPress={() => router.push('/settings')} />
        <Row>
          <SpeakBtn text={summary} />
          <IconBtn icon="storefront-outline" label={t('myShop')} onPress={() => router.push('/shop')} />
        </Row>
      </Row>

      <View style={{ gap: 4 }}>
        <Txt v="display">
          {t('hello')},{'\n'}
          {firstName}!
        </Txt>
      </View>

      {me.suspended ? (
        <Card bg="danger" inner={{ padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Ionicons name="pause-circle" size={30} color={colors.white} />
          <Txt v="label" color="white" style={{ flex: 1 }}>
            Your shop is paused by our team, so customers can’t see it. Please call the helpline.
          </Txt>
        </Card>
      ) : !me.verified ? (
        <Card bg="blueSoft" offset={3} inner={{ padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Ionicons name="shield-half" size={28} color={colors.ink} />
          <Txt v="small" style={{ flex: 1 }}>
            Our team will call you to verify your shop. You can already take orders; verified shops get a green tick.
          </Txt>
        </Card>
      ) : null}

      {/* Availability switch — the most important control, so it's huge. */}
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: me.available }}
        aria-checked={me.available}
        onPress={() => {
          tap();
          updateProvider(me.id, { available: !me.available });
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 14,
          borderWidth: border.width,
          borderColor: colors.ink,
          borderRadius: 18,
          backgroundColor: me.available ? colors.greenSoft : colors.greySoft,
        }}
      >
        <View
          style={{
            width: 74,
            height: 42,
            borderRadius: 21,
            borderWidth: border.width,
            borderColor: colors.ink,
            backgroundColor: me.available ? colors.green : colors.white,
            padding: 3,
            alignItems: me.available ? 'flex-end' : 'flex-start',
          }}
        >
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.white, borderWidth: border.width, borderColor: colors.ink }} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="h3">{me.available ? t('available') : t('notAvailable')}</Txt>
          <Txt v="small" color="muted">
            Tap to {me.available ? 'pause' : 'start'} new orders
          </Txt>
        </View>
      </Pressable>

      {easyMode ? (
        <View style={{ gap: 14 }}>
          <BigTile icon="notifications" bg="pink" label={t('newOrders')} value={requests.length} onPress={() => router.push('/p/jobs')} />
          <BigTile icon="construct" bg="yellow" label={t('todaysWork')} value={active.length} onPress={() => router.push('/p/jobs')} />
          <BigTile icon="wallet" bg="green" label={`${t('earnings')} (7 days)`} value={rupees(earned)} onPress={() => router.push('/p/dashboard')} />
        </View>
      ) : (
        <Grid>
          <Tile icon="notifications" bg="pink" label={t('newOrders')} value={String(requests.length)} onPress={() => router.push('/p/jobs')} />
          <Tile icon="construct" bg="yellow" label={t('todaysWork')} value={String(active.length)} onPress={() => router.push('/p/jobs')} />
          <Tile icon="wallet" bg="green" label={`${t('earnings')} · 7d`} value={rupees(earned)} onPress={() => router.push('/p/dashboard')} />
          <Tile icon="eye" bg="purple" label={t('visits')} value={String(me.visits.reduce((a, b) => a + b, 0))} onPress={() => router.push('/p/dashboard')} />
        </Grid>
      )}

      {requests.length ? (
        <Section title={`${t('newOrders')} (${requests.length})`}>
          {requests.map((o) => (
            <RequestCard key={o.id} o={o} />
          ))}
        </Section>
      ) : (
        <Card bg="white" inner={{ padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <IconBox icon="cafe" bg="yellowSoft" size={48} />
          <Txt style={{ flex: 1 }}>No new orders right now. We will ring your phone when one comes.</Txt>
        </Card>
      )}

      {active.length ? (
        <Section title={t('todaysWork')}>
          {active.map((o) => (
            <PressCard key={o.id} onPress={() => router.push(`/job/${o.id}`)} inner={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconBox icon={o.status === 'ready' ? 'checkmark-done' : 'construct'} bg={o.status === 'ready' ? 'green' : 'yellow'} size={50} />
              <View style={{ flex: 1 }}>
                <Txt v="h3">{o.serviceName}</Txt>
                <Txt v="small" color="muted">
                  {o.customerName} · due {clock(o.needBy)}
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={26} color={colors.ink} />
            </PressCard>
          ))}
        </Section>
      ) : null}

      <PressCard bg="blueSoft" onPress={() => Linking.openURL(`tel:${HELPLINE}`)} inner={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBox icon="call" bg="blue" color="white" size={52} />
        <View style={{ flex: 1 }}>
          <Txt v="h3">{t('helpCall')}</Txt>
          <Txt v="small">Free · Hindi & English · 8 AM – 10 PM</Txt>
        </View>
      </PressCard>
    </Screen>
  );
}

function RequestCard({ o }: { o: Order }) {
  const mins = minutesUntil(o.needBy);
  return (
    <Card bg="white" radius={20} inner={{ padding: 16, gap: 12 }}>
      <Pressable onPress={() => router.push(`/job/${o.id}`)} style={{ gap: 6 }} accessibilityRole="button">
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Txt v="h2" style={{ flex: 1 }}>
            {o.serviceName}
          </Txt>
          <Txt v="h2" color="success">
            {rupees(providerPayout(o))}
          </Txt>
        </Row>
        <Row gap={6}>
          <Ionicons name="person" size={18} color={colors.ink} />
          <Txt v="label">{o.customerName}</Txt>
        </Row>
        <Row gap={6}>
          <Ionicons name="alarm" size={18} color={mins < 180 ? colors.danger : colors.ink} />
          <Txt v="label" color={mins < 180 ? 'danger' : 'ink'}>
            Needed {dayLabel(o.needBy)} {clock(o.needBy)} ({timeLeft(o.needBy)})
          </Txt>
        </Row>
        <Row gap={6}>
          <Ionicons name={o.handover === 'delivery' ? 'bicycle' : 'walk'} size={18} color={colors.ink} />
          <Txt v="small">{o.handover === 'delivery' ? `Rider brings it (${o.delivery?.partnerName ?? 'delivery'})` : 'Customer drops it off'}</Txt>
        </Row>
        {o.notes ? (
          <View style={{ backgroundColor: colors.yellowSoft, borderRadius: 10, padding: 10, borderWidth: 1.5, borderColor: colors.ink }}>
            <Txt>“{o.notes}”</Txt>
          </View>
        ) : null}
      </Pressable>
      <SpeakBtn
        text={`New order. ${o.customerName} needs ${o.serviceName}, ${timeLeft(o.needBy)}. You get ${providerPayout(o)} rupees. ${o.notes}`}
      />
      <JobActions o={o} />
    </Card>
  );
}

function Tile({ icon, bg, label, value, onPress }: { icon: IconName; bg: ColorName; label: string; value: string; onPress: () => void }) {
  return (
    <PressCard onPress={onPress} inner={{ padding: 14, gap: 10, minHeight: 128 }}>
      <IconBox icon={icon} bg={bg} size={44} color={bg === 'purple' || bg === 'pink' ? 'white' : 'ink'} />
      <View>
        <Txt v="h1">{value}</Txt>
        <Txt v="small" color="muted">
          {label}
        </Txt>
      </View>
    </PressCard>
  );
}

function BigTile({ icon, bg, label, value, onPress }: { icon: IconName; bg: ColorName; label: string; value: number | string; onPress: () => void }) {
  return (
    <PressCard bg={bg} onPress={onPress} inner={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 100 }}>
      <IconBox icon={icon} bg="white" size={64} />
      <Txt v="h2" style={{ flex: 1 }} color="ink">
        {label}
      </Txt>
      <Txt v="display" color="ink">
        {value}
      </Txt>
    </PressCard>
  );
}
