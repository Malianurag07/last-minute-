import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { DeliveryCompare, useQuotes } from '../../components/DeliveryCompare';
import { Header } from '../../components/Header';
import { Btn, Card, Chip, Divider, Empty, Field, PressCard, Row, Screen, Section, Txt } from '../../components/ui';
import { clock, dayLabel, duration, rupees } from '../../lib/format';
import { useStore } from '../../state/store';
import { colors } from '../../theme';

const HOUR = 60 * 60 * 1000;

function deadlineOptions(now = new Date()) {
  const at = (h: number, m = 0, addDays = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + addDays);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const tonight = at(21);
  const opts = [
    { id: '1h', label: 'In 1 hour', at: new Date(now.getTime() + HOUR) },
    { id: '2h', label: 'In 2 hours', at: new Date(now.getTime() + 2 * HOUR) },
    { id: '4h', label: 'In 4 hours', at: new Date(now.getTime() + 4 * HOUR) },
  ];
  if (tonight.getTime() - now.getTime() > 4.5 * HOUR) opts.push({ id: 'tonight', label: 'Tonight 9 PM', at: tonight });
  opts.push({ id: 'tmrw', label: 'Tomorrow 10 AM', at: at(10, 0, 1) });
  return opts;
}

export default function Book() {
  const { id, service } = useLocalSearchParams<{ id: string; service?: string }>();
  const { t, providers, customer, placeOrder } = useStore();
  const p = providers.find((x) => x.id === id);

  const [serviceId, setServiceId] = useState(service ?? p?.services[0]?.id);
  const opts = useMemo(() => deadlineOptions(), []);
  const [deadline, setDeadline] = useState(opts[1].id);
  const [notes, setNotes] = useState('');
  const [handover, setHandover] = useState<'delivery' | 'self'>('delivery');
  const quotes = useQuotes(p?.distanceKm ?? 2, 2);
  const [partnerId, setPartnerId] = useState<string | undefined>(quotes[0]?.partner.id);
  const [busy, setBusy] = useState(false);

  if (!p) {
    return (
      <Screen>
        <Header title="Book" />
        <Empty icon="alert-circle" title="Provider not found" />
      </Screen>
    );
  }

  const svc = p.services.find((s) => s.id === serviceId) ?? p.services[0];
  const needBy = opts.find((o) => o.id === deadline)!.at;
  const minsAvailable = Math.round((needBy.getTime() - Date.now()) / 60000);
  const quote = quotes.find((q) => q.partner.id === partnerId);
  // round trip travel time eats into the work window
  const travel = handover === 'delivery' && quote ? quote.etaMins * 2 : 0;
  const tooTight = svc.minutes + travel > minsAvailable;
  const rush = minsAvailable <= 180 ? p.rushFee : 0;
  const deliveryFee = handover === 'delivery' && quote ? quote.price : 0;
  const total = svc.price + rush + deliveryFee;

  const submit = async () => {
    setBusy(true);
    const o = await placeOrder({
      providerId: p.id,
      serviceId: svc.id,
      serviceName: svc.name,
      price: svc.price,
      rushFee: rush,
      deliveryFee,
      needBy: needBy.toISOString(),
      notes,
      handover,
      address: customer.address,
      delivery:
        handover === 'delivery' && quote
          ? { partnerId: quote.partner.id, partnerName: quote.partner.name, vehicle: quote.partner.vehicle, price: quote.price, etaMins: quote.etaMins, leg: 'both' }
          : undefined,
    });
    setBusy(false);
    if (o) router.replace(`/order/${o.id}`);
  };

  return (
    <Screen
      footer={
        <View style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="label">{t('total')}</Txt>
            <Txt v="h1">{rupees(total)}</Txt>
          </Row>
          <Btn label={`${t('placeOrder')} · pay after work`} icon="checkmark-circle" bg="green" size="lg" disabled={busy} onPress={submit} />
        </View>
      }
    >
      <Header title={p.name} sub="Book a last-minute job" />

      <Section title={t('chooseService')}>
        <View style={{ gap: 10 }}>
          {p.services.map((s) => {
            const on = s.id === svc.id;
            return (
              <PressCard
                key={s.id}
                bg={on ? 'yellow' : 'white'}
                offset={4}
                onPress={() => setServiceId(s.id)}
                accessibilityState={{ selected: on }}
                inner={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={26} color={colors.ink} />
                <View style={{ flex: 1 }}>
                  <Txt v="h3">{s.name}</Txt>
                  <Txt v="small" color="muted">
                    ~{duration(s.minutes)}
                  </Txt>
                </View>
                <Txt v="h3">{rupees(s.price)}</Txt>
              </PressCard>
            );
          })}
        </View>
      </Section>

      <Section title={t('needBy')}>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {opts.map((o) => (
            <Chip key={o.id} label={o.label} icon="alarm" active={deadline === o.id} onPress={() => setDeadline(o.id)} color="pinkSoft" />
          ))}
        </Row>
        <Txt v="small" color="muted">
          Needed by {dayLabel(needBy.toISOString())}, {clock(needBy.toISOString())}
          {rush ? ` · rush fee ${rupees(rush)} applies` : ''}
        </Txt>
        {tooTight ? (
          <Card bg="pinkSoft" offset={3} inner={{ padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Ionicons name="warning" size={24} color={colors.ink} />
            <Txt v="small" style={{ flex: 1 }}>
              This is tight: the work takes ~{duration(svc.minutes)}
              {travel ? ` plus ~${duration(travel)} travel` : ''}. {p.name.split(' ')[0]} will confirm if it’s possible.
            </Txt>
          </Card>
        ) : null}
      </Section>

      <Section title={t('notes')}>
        <Field icon="chatbubble-ellipses" multiline placeholder="Sizes, colour, design, allergies…" value={notes} onChangeText={setNotes} />
      </Section>

      <Section title={t('handover')}>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Chip icon="bicycle" label={t('sendByDelivery')} active={handover === 'delivery'} onPress={() => setHandover('delivery')} color="yellow" />
          <Chip icon="walk" label={t('selfHandover')} active={handover === 'self'} onPress={() => setHandover('self')} color="yellow" />
        </Row>
        {handover === 'delivery' ? (
          <View style={{ gap: 10 }}>
            <Txt v="small" color="muted">
              Pickup from you → {p.area} ({p.distanceKm} km) and back. Rider is booked only after {p.name.split(' ')[0]} accepts.
            </Txt>
            <DeliveryCompare quotes={quotes} selected={partnerId} onSelect={(q) => setPartnerId(q.partner.id)} />
          </View>
        ) : (
          <Txt v="small" color="muted">
            Address shared after acceptance: {p.area}, {p.distanceKm} km away.
          </Txt>
        )}
      </Section>

      <Card bg="white" inner={{ padding: 16, gap: 10 }}>
        <Txt v="h3">Summary</Txt>
        <Line label={svc.name} value={rupees(svc.price)} />
        {rush ? <Line label="Rush fee (needed within 3 hrs)" value={rupees(rush)} /> : null}
        {deliveryFee ? <Line label={`${quote?.partner.name} (pickup + drop)`} value={rupees(deliveryFee)} /> : null}
        <Divider />
        <Line label={t('total')} value={rupees(total)} bold />
        <Txt v="small" color="muted">
          Pay the provider by UPI or cash once the work is done. Delivery is paid in the partner app.
        </Txt>
      </Card>
    </Screen>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Txt v={bold ? 'h3' : 'body'} style={{ flex: 1 }}>
        {label}
      </Txt>
      <Txt v={bold ? 'h3' : 'label'}>{value}</Txt>
    </Row>
  );
}
