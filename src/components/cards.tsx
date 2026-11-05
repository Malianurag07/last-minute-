import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { categoryById } from '../data/categories';
import type { Order, OrderStatus, Provider } from '../data/types';
import { clock, dayLabel, duration, isOpenNow, minutesUntil, rupees, timeLeft } from '../lib/format';
import { useStore } from '../state/store';
import { border, colors, type ColorName } from '../theme';
import { Badge, IconBox, PressCard, Row, Stars, Txt, type IconName } from './ui';

export function ProviderCard({ p, onPress }: { p: Provider; onPress: () => void }) {
  const { t, favorites } = useStore();
  const cat = categoryById(p.categoryId);
  const open = p.available && isOpenNow(p.openFrom, p.openTo);
  const fastest = Math.min(...p.services.map((s) => s.minutes));
  return (
    <PressCard onPress={onPress} inner={{ padding: 14, gap: 10 }}>
      <Row style={{ alignItems: 'flex-start' }}>
        <IconBox icon={cat.icon as IconName} bg={cat.color} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={6}>
            <Txt v="h3" style={{ flexShrink: 1 }} lines={1}>
              {p.name}
            </Txt>
            {p.verified ? <Ionicons name="shield-checkmark" size={18} color={colors.green} /> : null}
            {favorites.includes(p.id) ? <Ionicons name="heart" size={16} color={colors.pink} /> : null}
          </Row>
          <Txt v="small" color="muted" lines={1}>
            {cat.name} · {p.area} · {p.distanceKm} km
          </Txt>
          <Row gap={6} style={{ marginTop: 2 }}>
            <Stars value={p.rating} size={14} />
            <Txt v="small">
              {p.rating ? p.rating.toFixed(1) : 'New'} ({p.reviews.length})
            </Txt>
          </Row>
        </View>
      </Row>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        <Pill icon="flash" label={`from ${duration(fastest)}`} bg="yellowSoft" />
        <Pill icon="pricetag" label={`from ${rupees(Math.min(...p.services.map((s) => s.price)))}`} bg="greySoft" />
        <Pill icon={open ? 'radio-button-on' : 'moon'} label={open ? t('open') : t('closed')} bg={open ? 'greenSoft' : 'pinkSoft'} />
      </Row>
    </PressCard>
  );
}

export function Pill({ icon, label, bg = 'greySoft' }: { icon?: IconName; label: string; bg?: ColorName }) {
  return (
    <Row
      gap={4}
      style={{
        backgroundColor: colors[bg],
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: colors.ink,
        paddingHorizontal: 9,
        paddingVertical: 3,
      }}
    >
      {icon ? <Ionicons name={icon} size={14} color={colors.ink} /> : null}
      <Txt v="small">{label}</Txt>
    </Row>
  );
}

export const STATUS: Record<OrderStatus, { label: string; color: ColorName; icon: IconName }> = {
  requested: { label: 'Waiting for reply', color: 'yellow', icon: 'hourglass' },
  accepted: { label: 'Accepted', color: 'blueSoft', icon: 'thumbs-up' },
  pickup: { label: 'Pickup on the way', color: 'orangeSoft', icon: 'bicycle' },
  working: { label: 'Work in progress', color: 'purpleSoft', icon: 'construct' },
  ready: { label: 'Ready', color: 'greenSoft', icon: 'checkmark-done' },
  delivered: { label: 'Completed', color: 'green', icon: 'checkmark-circle' },
  declined: { label: 'Declined', color: 'pinkSoft', icon: 'close-circle' },
  cancelled: { label: 'Cancelled', color: 'greySoft', icon: 'close-circle' },
};

export const FLOW: OrderStatus[] = ['requested', 'accepted', 'pickup', 'working', 'ready', 'delivered'];

export function StatusPill({ status }: { status: OrderStatus }) {
  const s = STATUS[status];
  return <Pill icon={s.icon} label={s.label} bg={s.color} />;
}

export function OrderCard({ o, title, onPress }: { o: Order; title: string; onPress: () => void }) {
  const mins = minutesUntil(o.needBy);
  const active = !['delivered', 'declined', 'cancelled'].includes(o.status);
  const urgent = active && mins < 120;
  return (
    <PressCard onPress={onPress} inner={{ padding: 14, gap: 10 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Txt v="h3" lines={1}>
            {o.serviceName}
          </Txt>
          <Txt v="small" color="muted" lines={1}>
            {title}
          </Txt>
        </View>
        <Txt v="h3">{rupees(o.price + o.rushFee + o.deliveryFee)}</Txt>
      </Row>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        <StatusPill status={o.status} />
        {active ? (
          <Pill icon="alarm" label={`Due ${dayLabel(o.needBy)} ${clock(o.needBy)}`} bg={urgent ? 'pink' : 'white'} />
        ) : null}
        {urgent ? <Badge label={mins < 0 ? 'Late' : timeLeft(o.needBy)} bg="ink" /> : null}
      </Row>
    </PressCard>
  );
}

/** Vertical progress tracker with big dots and labels. */
export function Timeline({ o }: { o: Order }) {
  const flow = o.handover === 'self' ? FLOW.filter((s) => s !== 'pickup') : FLOW;
  if (o.status === 'declined' || o.status === 'cancelled') {
    return (
      <Row>
        <Ionicons name="close-circle" size={28} color={colors.danger} />
        <Txt v="h3">{STATUS[o.status].label}</Txt>
      </Row>
    );
  }
  const idx = flow.indexOf(o.status);
  return (
    <View>
      {flow.map((st, i) => {
        const done = i <= idx;
        const at = o.history.find((h) => h.status === st)?.at;
        return (
          <Row key={st} style={{ alignItems: 'flex-start' }}>
            <View style={{ alignItems: 'center', width: 30 }}>
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  borderWidth: border.width,
                  borderColor: colors.ink,
                  backgroundColor: done ? colors.green : colors.white,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {done ? <Ionicons name="checkmark" size={16} color={colors.ink} /> : null}
              </View>
              {i < flow.length - 1 ? (
                <View style={{ width: 3, height: 26, backgroundColor: i < idx ? colors.green : colors.line }} />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingTop: 2 }}>
              <Txt v="label" color={done ? 'ink' : 'muted'}>
                {STATUS[st].label}
              </Txt>
              {at ? (
                <Txt v="small" color="muted">
                  {dayLabel(at)}, {clock(at)}
                </Txt>
              ) : null}
            </View>
          </Row>
        );
      })}
    </View>
  );
}

export function StatTile({ icon, label, value, bg, sub }: { icon: IconName; label: string; value: string; bg: ColorName; sub?: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors[bg],
        borderWidth: border.width,
        borderColor: colors.ink,
        borderRadius: border.radius,
        padding: 12,
        gap: 4,
      }}
    >
      <Row gap={6}>
        <Ionicons name={icon} size={18} color={colors.ink} />
        <Txt v="small" lines={1} style={{ flexShrink: 1 }}>
          {label}
        </Txt>
      </Row>
      <Txt v="h1">{value}</Txt>
      {sub ? (
        <Txt v="small" color="muted">
          {sub}
        </Txt>
      ) : null}
    </View>
  );
}
