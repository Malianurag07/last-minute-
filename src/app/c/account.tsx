import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { ProviderCard } from '../../components/cards';
import { Btn, Card, Field, Row, Screen, Section, Txt } from '../../components/ui';
import { formatPhone } from '../../lib/auth';
import { useStore } from '../../state/store';

export default function Account() {
  const { t, user, updateMe, set, favorites, listed, logout } = useStore();
  const [draft, setDraft] = useState({ name: user?.name ?? '', address: user?.address ?? '' });
  const [saved, setSaved] = useState(false);
  if (!user) return null;
  const dirty = draft.name !== user.name || draft.address !== user.address;
  const favs = listed.filter((p) => favorites.includes(p.id));
  return (
    <Screen>
      <Txt v="h1">{t('profile')}</Txt>
      <Card bg="yellowSoft" inner={{ padding: 16, gap: 12 }}>
        <Txt v="label">Your details (shared with the provider when you book)</Txt>
        <Field icon="person" placeholder="Name" value={draft.name} onChangeText={(name) => (setDraft({ ...draft, name }), setSaved(false))} accessibilityLabel="Your name" />
        <Row gap={8} style={{ paddingHorizontal: 4 }}>
          <Txt v="label">Mobile:</Txt>
          <Txt>{formatPhone(user.phone)}</Txt>
        </Row>
        <Field icon="location" placeholder="Pickup / drop address" value={draft.address} onChangeText={(address) => (setDraft({ ...draft, address }), setSaved(false))} accessibilityLabel="Your address" />
        <Btn label={saved ? 'Saved' : t('save')} icon={saved ? 'checkmark' : 'save'} bg={dirty ? 'yellow' : 'white'} disabled={!dirty || draft.name.trim().length < 2} onPress={async () => { await updateMe({ name: draft.name.trim(), address: draft.address.trim() }); setSaved(true); }} />
      </Card>
      <Section title="Saved providers">
        <View style={{ gap: 14 }}>
          {favs.map((p) => (
            <ProviderCard key={p.id} p={p} onPress={() => router.push(`/provider/${p.id}`)} />
          ))}
          {!favs.length ? <Txt color="muted">Tap the heart on a provider’s page to save them here.</Txt> : null}
        </View>
      </Section>
      <Btn label="Privacy Centre" icon="shield-checkmark" bg="white" onPress={() => router.push('/privacy')} />
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
