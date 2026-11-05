import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Linking, View } from 'react-native';

import { STATUS, Timeline } from '../../components/cards';
import { DeliveryCompare, handOffToPartner, useQuotes } from '../../components/DeliveryCompare';
import { Header } from '../../components/Header';
import { Btn, Card, Divider, Empty, Field, IconBox, Row, Screen, Section, Stars, Txt } from '../../components/ui';
import { clock, dayLabel, rupees, timeLeft } from '../../lib/format';
import { useStore } from '../../state/store';
import { colors } from '../../theme';

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, orders, providers, setOrderStatus, attachDelivery, rateOrder } = useStore();
  const o = orders.find((x) => x.id === id);
  const p = providers.find((x) => x.id === o?.providerId);
  const quotes = useQuotes(p?.distanceKm ?? 2, 1);
  const [changing, setChanging] = useState(false);
  const [stars, setStars] = useState(5);
  const [review, setReview] = useState('');

  if (!o || !p) {
    return (
      <Screen>
        <Header title="Order" />
        <Empty icon="alert-circle" title="Order not found" />
      </Screen>
    );
  }

  const st = STATUS[o.status];
  const chosen = quotes.find((q) => q.partner.id === o.delivery?.partnerId) ?? quotes[0];
  const canBookPickup = o.handover === 'delivery' && o.status === 'accepted';

  const bookPickup = async (q = chosen) => {
    await handOffToPartner(q, o.address, `${p.name}, ${p.area}`, `${o.serviceName} — order ${o.id}`);
    attachDelivery(o.id, { partnerId: q.partner.id, partnerName: q.partner.name, vehicle: q.partner.vehicle, price: q.price, etaMins: q.etaMins, leg: 'pickup' });
  };

  return (
    <Screen>
      <Header title={o.serviceName} sub={`${p.name} · #${o.id}`} speak={`${o.serviceName}. ${st.label}. Needed ${timeLeft(o.needBy)}.`} />

      <Card bg={st.color} radius={20} inner={{ padding: 18, gap: 8 }}>
        <Row>
          <IconBox icon={st.icon} bg="white" size={52} />
          <View style={{ flex: 1 }}>
            <Txt v="h2">{st.label}</Txt>
            <Txt v="small">
              Due {dayLabel(o.needBy)}, {clock(o.needBy)} ({timeLeft(o.needBy)})
            </Txt>
          </View>
        </Row>
        {o.status === 'requested' ? <Txt v="small">Most providers reply within 10 minutes. We’ll notify you.</Txt> : null}
      </Card>

      {canBookPickup ? (
        <Card bg="yellowSoft" inner={{ padding: 16, gap: 12 }}>
          <Row>
            <Ionicons name="bicycle" size={26} color={colors.ink} />
            <Txt v="h3" style={{ flex: 1 }}>
              Accepted! Book the pickup now
            </Txt>
          </Row>
          <Txt v="small">
            {chosen.partner.name} · {rupees(chosen.price)} · rider in ~{chosen.etaMins} min. Your pickup & drop address will be copied for you.
          </Txt>
          <Btn label={`Book on ${chosen.partner.name}`} icon="open-outline" onPress={() => bookPickup()} />
          <Btn label={changing ? 'Hide other options' : 'Compare other partners'} bg="white" icon="swap-horizontal" onPress={() => setChanging(!changing)} />
          {changing ? <DeliveryCompare quotes={quotes} selected={chosen.partner.id} onSelect={(q) => bookPickup(q)} /> : null}
        </Card>
      ) : null}

      {o.status === 'delivered' && !o.rating ? (
        <Card bg="greenSoft" inner={{ padding: 16, gap: 12 }}>
          <Txt v="h3">How did {p.name.split(' ')[0]} do?</Txt>
          <Stars value={stars} size={38} onChange={setStars} />
          <Field icon="chatbubble" placeholder="Say thanks or share feedback" value={review} onChangeText={setReview} />
          <Btn label="Submit review" icon="send" bg="green" onPress={() => rateOrder(o.id, stars, review)} />
        </Card>
      ) : null}
      {o.rating ? (
        <Card offset={3} inner={{ padding: 14, gap: 6 }}>
          <Txt v="label">Your review</Txt>
          <Stars value={o.rating} />
          {o.review ? <Txt>{o.review}</Txt> : null}
        </Card>
      ) : null}

      <Section title="Progress">
        <Card inner={{ padding: 16 }}>
          <Timeline o={o} />
        </Card>
      </Section>

      <Section title="Details">
        <Card inner={{ padding: 16, gap: 10 }}>
          <Line icon="pricetag" label="Service" value={rupees(o.price)} />
          {o.rushFee ? <Line icon="flash" label="Rush fee" value={rupees(o.rushFee)} /> : null}
          {o.deliveryFee ? <Line icon="bicycle" label={o.delivery?.partnerName ?? 'Delivery'} value={rupees(o.deliveryFee)} /> : null}
          <Divider />
          <Line icon="wallet" label={t('total')} value={rupees(o.price + o.rushFee + o.deliveryFee)} />
          {o.notes ? (
            <>
              <Divider />
              <Txt v="small" color="muted">
                Your note
              </Txt>
              <Txt>{o.notes}</Txt>
            </>
          ) : null}
        </Card>
      </Section>

      <Row>
        <View style={{ flex: 1 }}>
          <Btn label={t('call')} icon="call" bg="white" onPress={() => Linking.openURL(`tel:${p.phone.replace(/\s/g, '')}`)} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn label="WhatsApp" icon="logo-whatsapp" bg="greenSoft" onPress={() => Linking.openURL(`https://wa.me/${p.phone.replace(/\D/g, '')}`)} />
        </View>
      </Row>
      {o.status === 'requested' ? <Btn label="Cancel order" icon="close" bg="pinkSoft" onPress={() => setOrderStatus(o.id, 'cancelled')} /> : null}
    </Screen>
  );
}

function Line({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return (
    <Row>
      <Ionicons name={icon} size={18} color={colors.ink} />
      <Txt style={{ flex: 1 }}>{label}</Txt>
      <Txt v="label">{value}</Txt>
    </Row>
  );
}
