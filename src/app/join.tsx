import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Btn, Card, Chip, Field, Grid, IconBox, IconBtn, PressCard, Row, Screen, SpeakBtn, Stepper, Txt, type IconName } from '../components/ui';
import { CATEGORIES, categoryById } from '../data/categories';
import type { Provider, Service } from '../data/types';
import { duration, to12h } from '../lib/format';
import { newId } from '../lib/id';
import { useStore } from '../state/store';
import { border, colors } from '../theme';

const STEPS = ['name', 'category', 'services', 'timing', 'done'] as const;
const FROM = ['07:00', '08:00', '09:00', '10:00', '11:00'];
const TO = ['18:00', '19:00', '20:00', '21:00', '22:00'];

interface Draft {
  name: string;
  phone: string;
  categoryId: string;
  services: Service[];
  openFrom: string;
  openTo: string;
  area: string;
  bio: string;
}

/**
 * Provider sign-up. One question per screen, big tap targets, read-aloud on
 * every step and ready-made service templates so nobody has to type prices.
 */
export default function Join() {
  const guard = useStore();
  if (!guard.user) return <Redirect href="/welcome" />;
  if (guard.me) return <Redirect href="/p" />;
  return <JoinWizard />;
}

function JoinWizard() {
  const { t, lang, registerProvider, set, user } = useStore();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>({
    name: user?.name ?? '',
    phone: user ? `+91 ${user.phone}` : '',
    categoryId: '',
    services: [],
    openFrom: '09:00',
    openTo: '20:00',
    area: '',
    bio: '',
  });
  const [custom, setCustom] = useState('');
  const upd = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const key = STEPS[step];
  const cat = d.categoryId ? categoryById(d.categoryId) : null;

  const canNext =
    (key === 'name' && d.name.trim().length > 1 && d.phone.replace(/\D/g, '').length >= 10) ||
    (key === 'category' && !!d.categoryId) ||
    (key === 'services' && d.services.length > 0) ||
    (key === 'timing' && d.area.trim().length > 1) ||
    key === 'done';

  const questions: Record<(typeof STEPS)[number], { q: string; hint: string }> = {
    name: { q: 'What is your name?', hint: 'This is how customers will see you. Add your phone number so they can call.' },
    category: { q: 'What work do you do?', hint: 'Tap one picture.' },
    services: { q: 'What can you make or fix?', hint: 'Tap to choose. Use + and – to set your price.' },
    timing: { q: 'When are you free?', hint: 'Choose your working hours and your area.' },
    done: { q: 'Your shop is ready!', hint: 'Customers near you can now find you.' },
  };
  const { q, hint } = questions[key];

  const toggleTemplate = (tpl: { name: string; price: number; minutes: number }) => {
    const exists = d.services.find((s) => s.name === tpl.name);
    upd({
      services: exists ? d.services.filter((s) => s.name !== tpl.name) : [...d.services, { id: newId('s'), ...tpl }],
    });
  };

  const finish = () => {
    const p: Provider = {
      id: newId('p'),
      name: d.name.trim(),
      phone: d.phone,
      categoryId: d.categoryId,
      bio: d.bio.trim() || `Home-based ${cat?.name.toLowerCase()} in ${d.area}. Last-minute jobs welcome.`,
      area: d.area.trim(),
      distanceKm: 1.5,
      rushFee: 50,
      services: d.services,
      rating: 0,
      reviews: [],
      jobsDone: 0,
      languages: lang === 'hi' ? ['Hindi'] : ['English', 'Hindi'],
      openFrom: d.openFrom,
      openTo: d.openTo,
      available: true,
      visits: [0, 0, 0, 0, 0, 0, 0],
      verified: false,
      joinedAt: new Date().toISOString(),
    };
    registerProvider(p);
    router.replace('/p');
  };

  return (
    <Screen
      footer={
        <Row>
          {step > 0 && key !== 'done' ? (
            <View style={{ flex: 1 }}>
              <Btn label={t('back')} icon="arrow-back" bg="white" size="lg" onPress={() => setStep(step - 1)} />
            </View>
          ) : null}
          <View style={{ flex: 2 }}>
            {key === 'done' ? (
              <Btn label="Open my shop" icon="storefront" bg="green" size="lg" onPress={finish} />
            ) : (
              <Btn label={t('next')} icon="arrow-forward" bg="yellow" size="lg" disabled={!canNext} onPress={() => setStep(step + 1)} />
            )}
          </View>
        </Row>
      }
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <IconBtn
          icon="close"
          label="Close"
          onPress={() => {
            set('role', 'customer');
            router.replace('/');
          }}
        />
        <Txt v="label">
          Step {step + 1} of {STEPS.length}
        </Txt>
      </Row>

      {/* progress */}
      <Row gap={6}>
        {STEPS.map((s, i) => (
          <View key={s} style={{ flex: 1, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: i <= step ? colors.green : colors.white }} />
        ))}
      </Row>

      <View style={{ gap: 8 }}>
        <Txt v="h1">{q}</Txt>
        <Txt color="muted">{hint}</Txt>
        <SpeakBtn text={`${q} ${hint}`} />
      </View>

      {key === 'name' ? (
        <View style={{ gap: 14 }}>
          <Field icon="person" placeholder="e.g. Kamala Aunty's Silai" value={d.name} onChangeText={(name) => upd({ name })} autoFocus />
          <Field icon="call" placeholder="Mobile number" keyboardType="phone-pad" value={d.phone} onChangeText={(phone) => upd({ phone })} maxLength={14} />
          <Txt v="small" color="muted">
            We only share your number with customers who book you.
          </Txt>
        </View>
      ) : null}

      {key === 'category' ? (
        <Grid>
          {CATEGORIES.map((c) => {
            const on = d.categoryId === c.id;
            return (
              <PressCard
                key={c.id}
                bg={on ? c.soft : 'white'}
                onPress={() => upd({ categoryId: c.id, services: on ? d.services : [] })}
                accessibilityState={{ selected: on }}
                accessibilityLabel={c.name}
                inner={{ padding: 12, alignItems: 'center', gap: 8, minHeight: 140, justifyContent: 'center' }}
              >
                <IconBox icon={c.icon as IconName} bg={c.color} size={62} />
                <Txt v="label" center>
                  {lang === 'hi' ? c.nameHi : c.name}
                </Txt>
                {on ? (
                  <View style={{ position: 'absolute', top: 8, right: 8 }}>
                    <Ionicons name="checkmark-circle" size={28} color={colors.success} />
                  </View>
                ) : null}
              </PressCard>
            );
          })}
        </Grid>
      ) : null}

      {key === 'services' && cat ? (
        <View style={{ gap: 12 }}>
          {[...cat.templates, ...d.services.filter((s) => !cat.templates.some((tp) => tp.name === s.name))].map((tpl) => {
            const sel = d.services.find((s) => s.name === tpl.name);
            return (
              <Card key={tpl.name} bg={sel ? 'yellowSoft' : 'white'} inner={{ padding: 14, gap: 12 }}>
                <Pressable
                  onPress={() => toggleTemplate(tpl)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !!sel }}
                  accessibilityLabel={tpl.name}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      borderWidth: border.width,
                      borderColor: colors.ink,
                      backgroundColor: sel ? colors.green : colors.white,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {sel ? <Ionicons name="checkmark" size={24} color={colors.white} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt v="h3">{tpl.name}</Txt>
                    <Txt v="small" color="muted">
                      Takes about {duration(tpl.minutes)}
                    </Txt>
                  </View>
                </Pressable>
                {sel ? (
                  <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <Txt v="label">Your price</Txt>
                    <Stepper
                      value={sel.price}
                      step={sel.price >= 500 ? 50 : 10}
                      min={10}
                      onChange={(price) => upd({ services: d.services.map((s) => (s.name === sel.name ? { ...s, price } : s)) })}
                    />
                  </Row>
                ) : null}
              </Card>
            );
          })}
          <Row style={{ alignItems: 'stretch' }}>
            <Field style={{ flex: 1 }} icon="add-circle" placeholder="Add something else" value={custom} onChangeText={setCustom} />
            <Btn
              label="Add"
              full={false}
              disabled={custom.trim().length < 2}
              onPress={() => {
                upd({ services: [...d.services, { id: newId('s'), name: custom.trim(), price: 100, minutes: 60 }] });
                setCustom('');
              }}
            />
          </Row>
        </View>
      ) : null}

      {key === 'timing' ? (
        <View style={{ gap: 18 }}>
          <View style={{ gap: 8 }}>
            <Txt v="h3">I start work at</Txt>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {FROM.map((f) => (
                <Chip key={f} label={to12h(f)} icon="sunny" active={d.openFrom === f} onPress={() => upd({ openFrom: f })} />
              ))}
            </Row>
          </View>
          <View style={{ gap: 8 }}>
            <Txt v="h3">I stop work at</Txt>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {TO.map((f) => (
                <Chip key={f} label={to12h(f)} icon="moon" active={d.openTo === f} onPress={() => upd({ openTo: f })} color="purpleSoft" />
              ))}
            </Row>
          </View>
          <View style={{ gap: 8 }}>
            <Txt v="h3">My area</Txt>
            <Field icon="location" placeholder="e.g. Shivaji Nagar" value={d.area} onChangeText={(area) => upd({ area })} />
          </View>
          <View style={{ gap: 8 }}>
            <Txt v="h3">About me (optional)</Txt>
            <Field icon="chatbubble-ellipses" multiline placeholder="e.g. 20 years experience, same-day work" value={d.bio} onChangeText={(bio) => upd({ bio })} />
          </View>
        </View>
      ) : null}

      {key === 'done' && cat ? (
        <Card bg={cat.soft} radius={22} inner={{ padding: 18, gap: 12 }}>
          <Row>
            <IconBox icon={cat.icon as IconName} bg={cat.color} size={64} />
            <View style={{ flex: 1 }}>
              <Txt v="h2">{d.name}</Txt>
              <Txt v="small">
                {cat.name} · {d.area}
              </Txt>
            </View>
          </Row>
          <Txt v="label">
            Open {to12h(d.openFrom)} – {to12h(d.openTo)}
          </Txt>
          {d.services.map((s) => (
            <Row key={s.id} style={{ justifyContent: 'space-between' }}>
              <Txt style={{ flex: 1 }}>{s.name}</Txt>
              <Txt v="label">₹{s.price}</Txt>
            </Row>
          ))}
          <Txt v="small" color="muted">
            You can change all of this anytime from “My shop”.
          </Txt>
        </Card>
      ) : null}
    </Screen>
  );
}
