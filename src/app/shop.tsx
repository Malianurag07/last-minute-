import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Header } from '../components/Header';
import { Btn, Card, Chip, Field, PressCard, Row, Screen, Section, Stepper, Txt } from '../components/ui';
import { categoryById } from '../data/categories';
import type { Service } from '../data/types';
import { duration, to12h } from '../lib/format';
import { newId } from '../lib/id';
import { useStore } from '../state/store';
import { colors } from '../theme';

const FROM = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '16:00'];
const TO = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00'];

/** Edit services, prices and hours. Changes are saved only when "Save" is pressed. */
export default function Shop() {
  const { t, me, updateProvider } = useStore();
  const [services, setServices] = useState<Service[]>(me?.services ?? []);
  const [rushFee, setRushFee] = useState(me?.rushFee ?? 0);
  const [openFrom, setOpenFrom] = useState(me?.openFrom ?? '09:00');
  const [openTo, setOpenTo] = useState(me?.openTo ?? '20:00');
  const [bio, setBio] = useState(me?.bio ?? '');
  const [newName, setNewName] = useState('');
  if (!me) return null;
  const cat = categoryById(me.categoryId);
  const updSvc = (id: string, patch: Partial<Service>) => setServices((l) => l.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const unused = cat.templates.filter((tp) => !services.some((s) => s.name === tp.name));

  const save = async () => {
    await updateProvider(me.id, { services, rushFee, openFrom, openTo, bio });
    router.back();
  };

  return (
    <Screen footer={<Btn label={t('save')} icon="save" bg="green" size="lg" disabled={!services.length} onPress={save} />}>
      <Header title={t('myShop')} sub={`${me.name} · ${cat.name}`} speak="Here you can change your prices, add new work, and set your working hours. Press the green Save button at the bottom when done." />

      <Section title={t('services')}>
        {services.map((s) => (
          <Card key={s.id} inner={{ padding: 14, gap: 12 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Txt v="h3">{s.name}</Txt>
                <Txt v="small" color="muted">
                  Takes about {duration(s.minutes)}
                </Txt>
              </View>
              <PressCard
                offset={3}
                radius={10}
                bg="pinkSoft"
                accessibilityLabel={`Remove ${s.name}`}
                onPress={() => setServices((l) => l.filter((x) => x.id !== s.id))}
                inner={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="trash" size={22} color={colors.ink} />
              </PressCard>
            </Row>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <Txt v="label">Price</Txt>
              <Stepper value={s.price} step={s.price >= 500 ? 50 : 10} min={10} onChange={(price) => updSvc(s.id, { price })} />
            </Row>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <Txt v="label">Time needed</Txt>
              <Stepper value={s.minutes} step={15} min={5} prefix="" suffix="min" onChange={(minutes) => updSvc(s.id, { minutes })} />
            </Row>
          </Card>
        ))}
        {unused.length ? (
          <View style={{ gap: 8 }}>
            <Txt v="label">Add more work</Txt>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {unused.map((tp) => (
                <Chip key={tp.name} icon="add" label={tp.name} onPress={() => setServices((l) => [...l, { id: newId('s'), ...tp }])} />
              ))}
            </Row>
          </View>
        ) : null}
        <Row style={{ alignItems: 'stretch' }}>
          <Field style={{ flex: 1 }} icon="add-circle" placeholder="Something else" value={newName} onChangeText={setNewName} />
          <Btn
            label="Add"
            full={false}
            disabled={newName.trim().length < 2}
            onPress={() => {
              setServices((l) => [...l, { id: newId('s'), name: newName.trim(), price: 100, minutes: 60 }]);
              setNewName('');
            }}
          />
        </Row>
      </Section>

      <Section title="Rush fee">
        <Card inner={{ padding: 14, gap: 10 }}>
          <Txt v="small" color="muted">
            Extra you charge when someone needs it within 3 hours.
          </Txt>
          <Stepper value={rushFee} step={10} onChange={setRushFee} />
        </Card>
      </Section>

      <Section title="Working hours">
        <Txt v="label">Start</Txt>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {FROM.map((f) => (
            <Chip key={f} label={to12h(f)} icon="sunny" active={openFrom === f} onPress={() => setOpenFrom(f)} />
          ))}
        </Row>
        <Txt v="label">Stop</Txt>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {TO.map((f) => (
            <Chip key={f} label={to12h(f)} icon="moon" active={openTo === f} onPress={() => setOpenTo(f)} color="purpleSoft" />
          ))}
        </Row>
      </Section>

      <Section title="About me">
        <Field icon="chatbubble-ellipses" multiline value={bio} onChangeText={setBio} />
      </Section>
    </Screen>
  );
}
