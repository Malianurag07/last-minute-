import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { Linking, View } from 'react-native';

import { Pill, StatTile } from '../../components/cards';
import { Header } from '../../components/Header';
import { Btn, Card, Empty, IconBox, IconBtn, PressCard, Row, Screen, Section, Stars, Txt, type IconName } from '../../components/ui';
import { categoryById } from '../../data/categories';
import { dayLabel, duration, isOpenNow, rupees, to12h } from '../../lib/format';
import { useStore } from '../../state/store';
import { colors } from '../../theme';

export default function ProviderProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, providers, recordVisit, favorites, toggleFavorite } = useStore();
  const p = providers.find((x) => x.id === id);

  useEffect(() => {
    if (id) recordVisit(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!p || p.suspended) {
    return (
      <Screen>
        <Header title="Not found" />
        <Empty icon="alert-circle" title="This provider is not available right now" sub="Please choose someone else." />
      </Screen>
    );
  }

  const cat = categoryById(p.categoryId);
  const open = p.available && isOpenNow(p.openFrom, p.openTo);
  const fav = favorites.includes(p.id);

  return (
    <Screen
      footer={
        <Row>
          <View style={{ flex: 1 }}>
            <Btn label={t('call')} icon="call" bg="white" onPress={() => Linking.openURL(`tel:${p.phone.replace(/\s/g, '')}`)} />
          </View>
          <View style={{ flex: 2 }}>
            <Btn label={t('book')} icon="flash" bg="yellow" disabled={!p.available} onPress={() => router.push(`/book/${p.id}`)} />
          </View>
        </Row>
      }
    >
      <Header
        title=""
        right={<IconBtn icon={fav ? 'heart' : 'heart-outline'} label={fav ? 'Remove from saved' : 'Save'} bg={fav ? 'pinkSoft' : 'white'} onPress={() => toggleFavorite(p.id)} />}
      />

      <Card bg={cat.soft} radius={22} inner={{ padding: 18, gap: 14 }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <IconBox icon={cat.icon as IconName} bg={cat.color} size={72} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt v="h1">{p.name}</Txt>
            <Row gap={6}>
              {p.verified ? <Ionicons name="shield-checkmark" size={18} color={colors.success} /> : null}
              <Txt v="small">{p.verified ? 'ID verified · ' : ''}{cat.name}</Txt>
            </Row>
          </View>
        </Row>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Pill icon={open ? 'radio-button-on' : 'moon'} label={open ? t('open') : t('closed')} bg={open ? 'greenSoft' : 'pinkSoft'} />
          <Pill icon="time" label={`${to12h(p.openFrom)} – ${to12h(p.openTo)}`} bg="white" />
          <Pill icon="location" label={`${p.area} · ${p.distanceKm} km`} bg="white" />
        </Row>
        <Txt>{p.bio}</Txt>
        <Txt v="small" color="muted">
          Speaks: {p.languages.join(', ')}
        </Txt>
      </Card>

      <Row>
        <StatTile icon="star" label={t('rating')} value={p.rating ? p.rating.toFixed(1) : '–'} bg="yellowSoft" />
        <StatTile icon="checkmark-done" label={t('jobs')} value={String(p.jobsDone)} bg="greenSoft" />
        <StatTile icon="flash" label="Rush fee" value={p.rushFee ? rupees(p.rushFee) : 'Free'} bg="pinkSoft" />
      </Row>

      <Section title={t('services')}>
        <View style={{ gap: 12 }}>
          {p.services.map((s) => (
            <PressCard
              key={s.id}
              onPress={() => router.push({ pathname: '/book/[id]', params: { id: p.id, service: s.id } })}
              disabled={!p.available}
              offset={4}
              inner={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View style={{ flex: 1 }}>
                <Txt v="h3">{s.name}</Txt>
                <Txt v="small" color="muted">
                  Ready in ~{duration(s.minutes)}
                </Txt>
              </View>
              <Txt v="h2">{rupees(s.price)}</Txt>
              <Ionicons name="chevron-forward" size={22} color={colors.ink} />
            </PressCard>
          ))}
        </View>
      </Section>

      <Section title={`${t('reviews')} (${p.reviews.length})`}>
        <View style={{ gap: 12 }}>
          {p.reviews.slice(0, 6).map((r) => (
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
          {!p.reviews.length ? <Txt color="muted">No reviews yet — be the first!</Txt> : null}
        </View>
      </Section>
    </Screen>
  );
}
