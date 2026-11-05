import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Linking, View } from 'react-native';

import { STATUS, Timeline } from '../../components/cards';
import { DeliveryCompare, handOffToPartner, useQuotes } from '../../components/DeliveryCompare';
import { Header } from '../../components/Header';
import { JobActions } from '../../components/JobActions';
import { Btn, Card, Empty, IconBox, Row, Screen, Section, Stars, Txt } from '../../components/ui';
import { clock, dayLabel, rupees, timeLeft } from '../../lib/format';
import { useStore } from '../../state/store';
import { colors } from '../../theme';

/** Provider's view of one order. Large type, one clear next step. */
export default function Job() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, me, attachDelivery } = useStore();
  const o = orders.find((x) => x.id === id);
  const quotes = useQuotes(me?.distanceKm ?? 2, 1);
  const [showDrop, setShowDrop] = useState(false);
  const [dropBooked, setDropBooked] = useState<string | null>(null);

  if (!o || !me) {
    return (
      <Screen>
        <Header title="Order" />
        <Empty icon="alert-circle" title="Order not found" />
      </Screen>
    );
  }
  const st = STATUS[o.status];
  const speak = `${o.serviceName} for ${o.customerName}. Needed ${dayLabel(o.needBy)} at ${clock(o.needBy)}, ${timeLeft(o.needBy)}. You will get ${o.price + o.rushFee} rupees. ${o.notes ? `Note: ${o.notes}` : ''} Status: ${st.label}.`;

  return (
    <Screen>
      <Header title={o.serviceName} sub={`#${o.id}`} speak={speak} />

      <Card bg={st.color} radius={20} inner={{ padding: 18, gap: 10 }}>
        <Row>
          <IconBox icon={st.icon} bg="white" size={56} />
          <Txt v="h2" style={{ flex: 1 }}>
            {st.label}
          </Txt>
        </Row>
        <Row gap={8}>
          <Ionicons name="alarm" size={24} color={colors.ink} />
          <Txt v="h3">
            Due {dayLabel(o.needBy)} {clock(o.needBy)}
          </Txt>
        </Row>
        <Txt v="label">{timeLeft(o.needBy)}</Txt>
      </Card>

      <JobActions o={o} onBookDrop={() => setShowDrop(true)} />

      {showDrop && o.status === 'ready' ? (
        <Card bg="yellowSoft" inner={{ padding: 14, gap: 12 }}>
          <Txt v="h3">Send it back to {o.customerName}</Txt>
          <Txt v="small">Tap a partner. The customer’s address is copied for you, then the app opens.</Txt>
          <DeliveryCompare
            quotes={quotes}
            selected={dropBooked ?? undefined}
            onSelect={async (q) => {
              await handOffToPartner(q, `${me.name}, ${me.area}`, o.address, `${o.serviceName} — order ${o.id}`);
              setDropBooked(q.partner.id);
              attachDelivery(o.id, { partnerId: q.partner.id, partnerName: q.partner.name, vehicle: q.partner.vehicle, price: q.price, etaMins: q.etaMins, leg: 'drop' });
            }}
          />
        </Card>
      ) : null}

      <Section title="Customer">
        <Card inner={{ padding: 16, gap: 10 }}>
          <Row>
            <IconBox icon="person" bg="pinkSoft" size={48} />
            <View style={{ flex: 1 }}>
              <Txt v="h3">{o.customerName}</Txt>
              <Txt v="small" color="muted">
                {o.handover === 'delivery' ? o.address : 'Will drop off & collect'}
              </Txt>
            </View>
          </Row>
          {o.notes ? (
            <View style={{ backgroundColor: colors.yellowSoft, borderRadius: 10, padding: 12, borderWidth: 1.5, borderColor: colors.ink }}>
              <Txt>“{o.notes}”</Txt>
            </View>
          ) : null}
          <Row>
            <View style={{ flex: 1 }}>
              <Btn label="Call" icon="call" bg="white" onPress={() => Linking.openURL(`tel:${o.customerPhone.replace(/\s/g, '')}`)} />
            </View>
            <View style={{ flex: 1 }}>
              <Btn label="WhatsApp" icon="logo-whatsapp" bg="greenSoft" onPress={() => Linking.openURL(`https://wa.me/${o.customerPhone.replace(/\D/g, '')}`)} />
            </View>
          </Row>
        </Card>
      </Section>

      <Section title="Money">
        <Card inner={{ padding: 16, gap: 8 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt>Service</Txt>
            <Txt v="label">{rupees(o.price)}</Txt>
          </Row>
          {o.rushFee ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt>Rush fee</Txt>
              <Txt v="label">{rupees(o.rushFee)}</Txt>
            </Row>
          ) : null}
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="h3">You get</Txt>
            <Txt v="h2" color="success">
              {rupees(o.price + o.rushFee)}
            </Txt>
          </Row>
          <Txt v="small" color="muted">
            Customer pays you by UPI or cash. Delivery is paid separately in the delivery app.
          </Txt>
        </Card>
      </Section>

      {o.rating ? (
        <Card bg="greenSoft" inner={{ padding: 14, gap: 6 }}>
          <Txt v="label">Customer review</Txt>
          <Stars value={o.rating} />
          {o.review ? <Txt>{o.review}</Txt> : null}
        </Card>
      ) : null}

      <Section title="Progress">
        <Card inner={{ padding: 16 }}>
          <Timeline o={o} />
        </Card>
      </Section>
    </Screen>
  );
}
