import React from 'react';
import { View } from 'react-native';

import type { Order } from '../data/types';
import { confirm } from '../lib/confirm';
import { useStore } from '../state/store';
import { Btn, Row } from './ui';

/**
 * The single next step for a job, as one giant button (plus a second
 * option only where it is really needed). Destructive choices ask first.
 */
export function JobActions({ o, onBookDrop }: { o: Order; onBookDrop?: () => void }) {
  const { t, setOrderStatus } = useStore();
  const go = (s: Order['status']) => () => setOrderStatus(o.id, s);

  switch (o.status) {
    case 'requested':
      return (
        <Row>
          <View style={{ flex: 1 }}>
            <Btn
              label={t('decline')}
              icon="close"
              bg="pinkSoft"
              size="lg"
              onPress={() => confirm('Say no to this order?', 'The customer will be told you are busy.', go('declined'))}
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <Btn label={t('accept')} icon="checkmark" bg="green" size="lg" onPress={go('accepted')} />
          </View>
        </Row>
      );
    case 'accepted':
    case 'pickup':
      return <Btn label={t('startWork')} icon="construct" bg="yellow" size="lg" onPress={go('working')} />;
    case 'working':
      return <Btn label={t('markReady')} icon="checkmark-done" bg="green" size="lg" onPress={go('ready')} />;
    case 'ready':
      return (
        <View style={{ gap: 12 }}>
          {o.handover === 'delivery' && onBookDrop ? <Btn label="Book rider to send back" icon="bicycle" bg="yellow" size="lg" onPress={onBookDrop} /> : null}
          <Btn label={t('markDelivered')} icon="hand-right" bg="green" size="lg" onPress={go('delivered')} />
        </View>
      );
    default:
      return null;
  }
}
