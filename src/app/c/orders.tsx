import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { OrderCard } from '../../components/cards';
import { Chip, Empty, Row, Screen, Txt } from '../../components/ui';
import { useStore } from '../../state/store';

const DONE = ['delivered', 'declined', 'cancelled'];

export default function CustomerOrders() {
  const { t, orders, providers, user } = useStore();
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const mine = orders.filter((o) => o.customerId === user?.id);
  const list = mine.filter((o) => (tab === 'active' ? !DONE.includes(o.status) : DONE.includes(o.status)));
  return (
    <Screen>
      <Txt v="h1">{t('orders')}</Txt>
      <Row gap={10}>
        <Chip label={`Active (${mine.filter((o) => !DONE.includes(o.status)).length})`} active={tab === 'active'} onPress={() => setTab('active')} />
        <Chip label="Past" active={tab === 'past'} onPress={() => setTab('past')} />
      </Row>
      <View style={{ gap: 14 }}>
        {list.map((o) => (
          <OrderCard key={o.id} o={o} title={providers.find((p) => p.id === o.providerId)?.name ?? ''} onPress={() => router.push(`/order/${o.id}`)} />
        ))}
        {!list.length ? (
          <Empty icon="receipt-outline" title={tab === 'active' ? 'No active orders' : 'Nothing here yet'} sub="When you book someone, you can track it here." />
        ) : null}
      </View>
    </Screen>
  );
}
