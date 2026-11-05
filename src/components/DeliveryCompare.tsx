import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useMemo } from 'react';
import { Alert, Platform, View } from 'react-native';

import { getQuotes, openPartner, type Quote } from '../lib/delivery';
import { duration, rupees } from '../lib/format';
import type { StrKey } from '../lib/i18n';
import { useStore } from '../state/store';
import { border, colors } from '../theme';
import { Badge, PressCard, Row, Txt, type IconName } from './ui';

const TAG: Record<Quote['tags'][number], { key: StrKey; bg: 'purple' | 'green' | 'blue' | 'orange' }> = {
  'best-value': { key: 'bestValue', bg: 'purple' },
  cheapest: { key: 'cheapest', bg: 'green' },
  'most-reliable': { key: 'mostReliable', bg: 'blue' },
  fastest: { key: 'fastest', bg: 'orange' },
};

export function useQuotes(distanceKm: number, legs: 1 | 2) {
  return useMemo(() => getQuotes(distanceKm, legs), [distanceKm, legs]);
}

/**
 * Side-by-side quotes from Porter / Uber / Rapido / Ola, sorted by a
 * last-minute score (reliability first, then price, then speed).
 */
export function DeliveryCompare({
  quotes,
  selected,
  onSelect,
}: {
  quotes: Quote[];
  selected?: string;
  onSelect: (q: Quote) => void;
}) {
  const { t } = useStore();
  return (
    <View style={{ gap: 12 }}>
      {quotes.map((q) => {
        const on = selected === q.partner.id;
        return (
          <PressCard
            key={q.partner.id}
            bg={on ? 'yellow' : 'white'}
            onPress={() => onSelect(q)}
            accessibilityLabel={`${q.partner.name}, ${rupees(q.price)}, ${q.etaMins} minutes`}
            accessibilityState={{ selected: on }}
            offset={4}
            inner={{ padding: 12, gap: 8 }}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={10} style={{ flex: 1 }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    borderWidth: border.width,
                    borderColor: colors.ink,
                    backgroundColor: on ? colors.ink : colors.white,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {on ? <Ionicons name="checkmark" size={16} color={colors.yellow} /> : null}
                </View>
                <Ionicons name={q.partner.icon as IconName} size={24} color={colors.ink} />
                <View style={{ flex: 1 }}>
                  <Txt v="h3" lines={1}>
                    {q.partner.name}
                  </Txt>
                  <Txt v="small" color="muted" lines={1}>
                    {q.partner.vehicle} · arrives ~{duration(q.etaMins)}
                  </Txt>
                </View>
              </Row>
              <Txt v="h2">{rupees(q.price)}</Txt>
            </Row>
            <Row gap={8}>
              <Txt v="small" style={{ width: 82 }}>
                Reliability
              </Txt>
              <View style={{ flex: 1, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.white, overflow: 'hidden' }}>
                <View style={{ width: `${q.partner.reliability}%`, height: '100%', backgroundColor: q.partner.reliability >= 90 ? colors.green : colors.orange }} />
              </View>
              <Txt v="small">{q.partner.reliability}%</Txt>
            </Row>
            {q.tags.length ? (
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                {q.tags.map((tag) => (
                  <Badge key={tag} label={t(TAG[tag].key)} bg={TAG[tag].bg} />
                ))}
              </Row>
            ) : null}
            <Txt v="small" color="muted">
              {q.partner.note}
            </Txt>
          </PressCard>
        );
      })}
      <Txt v="small" color="muted">
        Prices are estimates from each partner’s published rates (incl. peak-hour surge). The final fare is shown in their app.
      </Txt>
    </View>
  );
}

/** Copies pickup/drop details then opens the partner app (or website). */
export async function handOffToPartner(q: Quote, pickup: string, drop: string, note: string) {
  const text = `Pickup: ${pickup}\nDrop: ${drop}\nItem: ${note}`;
  try {
    await Clipboard.setStringAsync(text);
  } catch {
    // clipboard unavailable — still continue
  }
  const msg = `Pickup and drop address copied. Paste them in ${q.partner.name}.`;
  if (Platform.OS === 'web') {
    await openPartner(q.partner);
    return;
  }
  Alert.alert(`Opening ${q.partner.name}`, msg, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open app', onPress: () => void openPartner(q.partner) },
  ]);
}
