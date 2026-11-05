import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { OrderCard } from '../../components/cards';
import { Chip, Empty, Row, Screen, Txt } from '../../components/ui';
import type { OrderStatus } from '../../data/types';
import { useStore } from '../../state/store';

const GROUPS: { id: string; label: string; statuses: OrderStatus[] }[] = [
  { id: 'new', label: 'New', statuses: ['requested'] },
  { id: 'doing', label: 'In progress', statuses: ['accepted', 'pickup', 'working', 'ready'] },
  { id: 'done', label: 'Finished', statuses: ['delivered', 'declined', 'cancelled'] },
];

export default function Jobs() {
  const { t, me, orders } = useStore();
  const mine = orders.filter((o) => o.providerId === me?.id);
  const [g, setG] = useState(mine.some((o) => o.status === 'requested') ? 'new' : 'doing');
  const group = GROUPS.find((x) => x.id === g)!;
  const list = mine
    .filter((o) => group.statuses.includes(o.status))
    .sort((a, b) => (g === 'done' ? b.createdAt.localeCompare(a.createdAt) : a.needBy.localeCompare(b.needBy)));
  return (
    <Screen>
      <Txt v="h1">{t('orders')}</Txt>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {GROUPS.map((x) => (
          <Chip key={x.id} label={`${x.label} (${mine.filter((o) => x.statuses.includes(o.status)).length})`} active={g === x.id} onPress={() => setG(x.id)} />
        ))}
      </Row>
      {g === 'doing' && list.length ? <Txt v="small" color="muted">Most urgent first.</Txt> : null}
      <View style={{ gap: 14 }}>
        {list.map((o) => (
          <OrderCard key={o.id} o={o} title={o.customerName} onPress={() => router.push(`/job/${o.id}`)} />
        ))}
        {!list.length ? <Empty icon="briefcase-outline" title="Nothing here" sub="Keep “Taking orders” on so customers can find you." /> : null}
      </View>
    </Screen>
  );
}
