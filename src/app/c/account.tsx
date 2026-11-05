import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { ProviderCard } from '../../components/cards';
import { Btn, Card, Field, Screen, Section, Txt } from '../../components/ui';
import { useStore } from '../../state/store';

export default function Account() {
  const { t, customer, set, favorites, providers } = useStore();
  const upd = (k: keyof typeof customer) => (v: string) => set('customer', { ...customer, [k]: v });
  const favs = providers.filter((p) => favorites.includes(p.id));
  return (
    <Screen>
      <Txt v="h1">{t('profile')}</Txt>
      <Card bg="yellowSoft" inner={{ padding: 16, gap: 12 }}>
        <Txt v="label">Your details (shared with the provider when you book)</Txt>
        <Field icon="person" placeholder="Name" value={customer.name} onChangeText={upd('name')} />
        <Field icon="call" placeholder="Phone" keyboardType="phone-pad" value={customer.phone} onChangeText={upd('phone')} />
        <Field icon="location" placeholder="Pickup / drop address" value={customer.address} onChangeText={upd('address')} />
      </Card>
      <Section title="Saved providers">
        <View style={{ gap: 14 }}>
          {favs.map((p) => (
            <ProviderCard key={p.id} p={p} onPress={() => router.push(`/provider/${p.id}`)} />
          ))}
          {!favs.length ? <Txt color="muted">Tap the heart on a provider’s page to save them here.</Txt> : null}
        </View>
      </Section>
      <Btn label={t('settings')} icon="settings" bg="white" onPress={() => router.push('/settings')} />
      <Btn label="Switch to provider mode" icon="storefront" bg="green" onPress={() => { set('role', 'provider'); router.replace('/'); }} />
    </Screen>
  );
}
