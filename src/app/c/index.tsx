import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { OrderCard, ProviderCard } from '../../components/cards';
import { Card, Field, FolderCard, Grid, IconBox, IconBtn, PressCard, Row, Screen, Section, Txt, type IconName } from '../../components/ui';
import { CATEGORIES } from '../../data/categories';
import { useStore } from '../../state/store';
import { colors } from '../../theme';

export default function CustomerHome() {
  const { t, lang, providers, orders, customer } = useStore();
  const [q, setQ] = useState('');

  const myActive = orders.filter(
    (o) => o.customerName === customer.name && !['delivered', 'declined', 'cancelled'].includes(o.status),
  );
  const fast = providers
    .filter((p) => p.available && Math.min(...p.services.map((s) => s.minutes)) <= 120)
    .sort((a, b) => b.rating - a.rating || a.distanceKm - b.distanceKm)
    .slice(0, 4);

  const go = () => router.push({ pathname: '/c/search', params: { q } });

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconBtn icon="settings-outline" label={t('settings')} onPress={() => router.push('/settings')} />
        <Row>
          <IconBtn icon="receipt-outline" label={t('orders')} badge={myActive.length || undefined} onPress={() => router.push('/c/orders')} />
          <IconBtn icon="search" label="Search" onPress={() => router.push('/c/search')} />
        </Row>
      </Row>

      <View style={{ gap: 6 }}>
        <Txt v="display">
          {t('tagline1')}
          {'\n'}
          {t('tagline2')}
        </Txt>
        <Row gap={6}>
          <Ionicons name="location" size={18} color={colors.pink} />
          <Txt v="label" lines={1} style={{ flexShrink: 1 }}>
            {customer.address}
          </Txt>
        </Row>
      </View>

      <Row style={{ alignItems: 'stretch' }}>
        <Field
          style={{ flex: 1 }}
          icon="search"
          placeholder={t('searchPh')}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={go}
          returnKeyType="search"
        />
        <PressCard
          bg="yellow"
          accessibilityLabel={t('urgent')}
          onPress={() => router.push({ pathname: '/c/search', params: { q, fast: '1' } })}
          inner={{ width: 62, height: 62, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="flash" size={30} color={colors.ink} />
        </PressCard>
      </Row>

      {myActive.length ? (
        <Section title="Your active orders" action="See all" onAction={() => router.push('/c/orders')}>
          {myActive.slice(0, 2).map((o) => (
            <OrderCard
              key={o.id}
              o={o}
              title={providers.find((p) => p.id === o.providerId)?.name ?? ''}
              onPress={() => router.push(`/order/${o.id}`)}
            />
          ))}
        </Section>
      ) : null}

      <Section title={t('categories')}>
        <Grid>
          {CATEGORIES.map((c, i) => {
            const n = providers.filter((p) => p.categoryId === c.id).length;
            return (
              <FolderCard
                key={c.id}
                title={lang === 'hi' ? c.nameHi : c.name}
                meta={`${n} ${t('providersNear')}`}
                meta2={`${providers.filter((p) => p.categoryId === c.id && p.available).length} open`}
                icon={c.icon as IconName}
                color={c.color}
                badge={i === 3 ? 'New' : undefined}
                onPress={() => router.push(`/category/${c.id}`)}
              />
            );
          })}
        </Grid>
      </Section>

      <Section title={t('readyFast')} action="See all" onAction={() => router.push({ pathname: '/c/search', params: { fast: '1' } })}>
        <View style={{ gap: 14 }}>
          {fast.map((p) => (
            <ProviderCard key={p.id} p={p} onPress={() => router.push(`/provider/${p.id}`)} />
          ))}
        </View>
      </Section>

      <Section title="How it works">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 8, paddingBottom: 6 }}>
          <Step n={1} icon="search" bg="yellow" title="Find" text="Pick a local expert who can do it in time." />
          <Step n={2} icon="bicycle" bg="pink" title="Send" text="We compare Porter, Uber, Rapido & Ola for the cheapest reliable pickup." />
          <Step n={3} icon="checkmark-done" bg="green" title="Done" text="Track progress and get it back before your deadline." />
        </ScrollView>
      </Section>

      <Card bg="purple" inner={{ padding: 18, gap: 10 }}>
        <Txt v="h2" color="white">
          Good with your hands?
        </Txt>
        <Txt color="white">Tailor, cook, baker, repair expert — earn from home. No shop needed.</Txt>
        <PressCard bg="white" onPress={() => router.push('/join')} offset={4} style={{ alignSelf: 'flex-start' }} inner={{ paddingHorizontal: 16, paddingVertical: 10 }}>
          <Txt v="label">Register as a provider →</Txt>
        </PressCard>
      </Card>
    </Screen>
  );
}

function Step({ n, icon, bg, title, text }: { n: number; icon: IconName; bg: 'yellow' | 'pink' | 'green'; title: string; text: string }) {
  return (
    <Card style={{ width: 200 }} inner={{ padding: 14, gap: 8, minHeight: 160 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconBox icon={icon} bg={bg} size={44} />
        <Txt v="h1" color="line">
          {n}
        </Txt>
      </Row>
      <Txt v="h3">{title}</Txt>
      <Txt v="small" color="muted">
        {text}
      </Txt>
    </Card>
  );
}
