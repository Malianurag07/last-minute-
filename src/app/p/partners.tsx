import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';

import { ProviderCard } from '../../components/cards';
import { Badge, Btn, Card, Chip, Field, IconBox, Row, Screen, Section, Txt, type IconName } from '../../components/ui';
import { CATEGORIES, categoryById } from '../../data/categories';
import type { Provider } from '../../data/types';
import { dayLabel } from '../../lib/format';
import { matches } from '../../lib/search';
import { useStore } from '../../state/store';
import { colors } from '../../theme';

const TEMPLATES = [
  'Can you help me with an urgent order today?',
  'I get requests for your kind of work. Can I send customers to you?',
  'Shall we offer a combo to customers together?',
  'Can we share one delivery rider to save cost?',
];

/**
 * Provider-to-provider collaboration: a tailor can find a mehendi artist
 * for a bride, a baker can team up with a flower seller, etc.
 */
export default function Partners() {
  const { me, providers, collabs, sendCollab, answerCollab } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [composeFor, setComposeFor] = useState<Provider | null>(null);
  const [msg, setMsg] = useState(TEMPLATES[0]);

  const results = useMemo(
    () => providers.filter((p) => p.id !== me?.id && matches(p, q) && (!cat || p.categoryId === cat)).slice(0, 12),
    [providers, me, q, cat],
  );
  if (!me) return null;

  const incoming = collabs.filter((c) => c.toProviderId === me.id);
  const sent = collabs.filter((c) => c.fromProviderId === me.id);
  const byId = (id: string) => providers.find((p) => p.id === id);

  const compose = composeFor ? (
        <Card bg="purpleSoft" inner={{ padding: 16, gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="h3" style={{ flex: 1 }}>
              Message to {composeFor.name}
            </Txt>
            <Ionicons name="close" size={26} color={colors.ink} onPress={() => setComposeFor(null)} accessibilityLabel="Close" />
          </Row>
          <View style={{ gap: 8 }}>
            {TEMPLATES.map((tpl) => (
              <Chip key={tpl} label={tpl} active={msg === tpl} onPress={() => setMsg(tpl)} color="white" />
            ))}
          </View>
          <Field icon="create" multiline value={msg} onChangeText={setMsg} placeholder="Write your message" />
          <Btn
            label="Send request"
            icon="send"
            bg="purple"
            fg="white"
            disabled={msg.trim().length < 3}
            onPress={() => {
              sendCollab(composeFor.id, msg.trim());
              setComposeFor(null);
            }}
          />
        </Card>
        ) : null;

  return (
    <Screen>
      <Txt v="h1">Work together</Txt>
      <Txt color="muted">Find other home-based experts, share big orders and send customers to each other.</Txt>

      {incoming.length ? (
        <Section title="Requests for you">
          {incoming.map((c) => {
            const from = byId(c.fromProviderId);
            if (!from) return null;
            const fc = categoryById(from.categoryId);
            return (
              <Card key={c.id} bg={c.status === 'pending' ? 'yellowSoft' : 'white'} inner={{ padding: 14, gap: 10 }}>
                <Row>
                  <IconBox icon={fc.icon as IconName} bg={fc.color} size={46} />
                  <View style={{ flex: 1 }}>
                    <Txt v="h3">{from.name}</Txt>
                    <Txt v="small" color="muted">
                      {fc.name} · {dayLabel(c.createdAt)}
                    </Txt>
                  </View>
                  {c.status !== 'pending' ? <Badge label={c.status} bg={c.status === 'accepted' ? 'green' : 'grey'} /> : null}
                </Row>
                <Txt>“{c.message}”</Txt>
                {c.status === 'pending' ? (
                  <Row>
                    <View style={{ flex: 1 }}>
                      <Btn label="Not now" bg="white" icon="close" onPress={() => answerCollab(c.id, 'declined')} />
                    </View>
                    <View style={{ flex: 1.3 }}>
                      <Btn label="Yes, let's talk" bg="green" fg="white" icon="checkmark" onPress={() => answerCollab(c.id, 'accepted')} />
                    </View>
                  </Row>
                ) : c.status === 'accepted' ? (
                  <Btn label={`Call ${from.name.split(' ')[0]}`} icon="call" bg="white" onPress={() => Linking.openURL(`tel:${from.phone.replace(/\s/g, '')}`)} />
                ) : null}
              </Card>
            );
          })}
        </Section>
      ) : null}

      <Section title="Find a partner">
        <Field icon="search" placeholder="Search: mehendi, cake, embroidery…" value={q} onChangeText={setQ} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All" active={!cat} onPress={() => setCat(null)} color="purpleSoft" />
          {CATEGORIES.map((c) => (
            <Chip key={c.id} label={c.name.split(' ')[0].replace(',', '')} active={cat === c.id} onPress={() => setCat(cat === c.id ? null : c.id)} color={c.soft} />
          ))}
        </ScrollView>
        <View style={{ gap: 14 }}>
          {results.map((p) => {
            const already = sent.find((c) => c.toProviderId === p.id);
            return (
              <View key={p.id} style={{ gap: 8 }}>
                <ProviderCard p={p} onPress={() => router.push(`/provider/${p.id}`)} />
                {composeFor?.id === p.id ? (
                  compose
                ) : already ? (
                  <Row gap={6} style={{ paddingLeft: 4 }}>
                    <Ionicons name={already.status === 'accepted' ? 'checkmark-circle' : 'time'} size={18} color={colors.ink} />
                    <Txt v="small">Request {already.status === 'pending' ? 'sent — waiting' : already.status}</Txt>
                  </Row>
                ) : (
                  <Btn label="Ask to collaborate" icon="people" bg="purpleSoft" full={false} onPress={() => setComposeFor(p)} />
                )}
              </View>
            );
          })}
        </View>
      </Section>
    </Screen>
  );
}
