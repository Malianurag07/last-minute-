import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { ProviderCard } from '../../components/cards';
import { Btn, Card, Field, Row, Screen, Section, Txt } from '../../components/ui';
import { formatPhone } from '../../lib/auth';
import { useStore } from '../../state/store';

export default function Account() {
  const { t, user, updateMe, set, favorites, listed, logout } = useStore();
  if (!user) return null;
  const favs = listed.filter((p) => favorites.includes(p.id));
  return (
    <Screen>
      <Txt v="h1">{t('profile')}</Txt>
      <Card bg="yellowSoft" inner={{ padding: 16, gap: 12 }}>
        <Txt v="label">Your details (shared with the provider when you book)</Txt>
        <Field icon="person" placeholder="Name" value={user.name} onChangeText={(name) => updateMe({ name })} />
        <Row gap={8} style={{ paddingHorizontal: 4 }}>
          <Txt v="label">Mobile:</Txt>
          <Txt>{formatPhone(user.phone)}</Txt>
        </Row>
        <Field icon="location" placeholder="Pickup / drop address" value={user.address} onChangeText={(address) => updateMe({ address })} />
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
      <Btn
        label={user.providerId ? 'Go to my shop' : 'Open a shop (become a provider)'}
        icon="storefront"
        bg="green"
        onPress={() => {
          set('role', 'provider');
          router.replace('/');
        }}
      />
      <Btn
        label="Log out"
        icon="log-out"
        bg="pinkSoft"
        onPress={() => {
          logout();
          router.replace('/welcome');
        }}
      />
    </Screen>
  );
}
