import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Platform, Pressable, Share, View } from 'react-native';

import { Header } from '../components/Header';
import { Badge, Btn, Card, Field, IconBox, Row, Screen, Section, tap, Txt } from '../components/ui';
import { isValidPhone } from '../lib/auth';
import { confirm } from '../lib/confirm';
import { dayLabel } from '../lib/format';
import { GRIEVANCE_OFFICER } from '../lib/privacy';
import { useStore } from '../state/store';
import { border, colors } from '../theme';

/**
 * Privacy Centre — every right under the DPDP Act 2023 in one place,
 * in plain words: see/download, correct, withdraw consent, nominate,
 * complain, delete.
 */
export default function PrivacyCentre() {
  const { user, setConsent, exportMyData, setNominee, raiseGrievance, deleteAccount, requests, updateMe } = useStore();
  const [draft, setDraft] = useState({ name: user?.name ?? '', address: user?.address ?? '' });
  const [fixMsg, setFixMsg] = useState<string | null>(null);
  const [nominee, setNom] = useState({ name: user?.nominee?.name ?? '', phone: user?.nominee?.phone ?? '', relation: user?.nominee?.relation ?? '' });
  const [nomMsg, setNomMsg] = useState<string | null>(null);
  const [g, setG] = useState({ subject: '', message: '' });
  const [gMsg, setGMsg] = useState<string | null>(null);
  const [delPin, setDelPin] = useState('');
  const [delErr, setDelErr] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  if (!user) return <Redirect href="/welcome" />;
  const c = user.consents;

  return (
    <Screen>
      <Header
        title="Privacy Centre"
        sub="Your data, your choice. Everything here works instantly."
        speak="Privacy Centre. Here you can download your data, change what you allow, add a nominee, complain to our grievance officer, or delete your account."
      />

      <Section title="What you allow">
        <Toggle
          on={!!c?.orderSharing}
          title="Share my details for my orders"
          sub="Needed to place orders: the provider and delivery partner see your name, number and address for that order only."
          onChange={(v) =>
            v
              ? void setConsent('orderSharing', true)
              : confirm('Stop sharing details?', 'You won’t be able to place new orders until you turn this back on.', () => void setConsent('orderSharing', false), 'Stop sharing')
          }
        />
        <Toggle on={!!c?.marketing} title="Offers & tips on SMS/WhatsApp" sub="Optional. You can stop anytime." onChange={(v) => void setConsent('marketing', v)} />
        {c ? (
          <Txt v="small" color="muted">
            Notice version {c.noticeVersion} · last changed {dayLabel(c.at)}
          </Txt>
        ) : null}
      </Section>

      <Section title="See or download my data">
        <Card inner={{ padding: 16, gap: 10 }}>
          <Txt>Get a copy of everything we hold about you: profile, consents, orders, reviews and requests.</Txt>
          <Btn
            label="Download my data"
            icon="download"
            bg="white"
            onPress={async () => {
              const data = await exportMyData();
              if (!data) return;
              const text = JSON.stringify(data, null, 2);
              if (Platform.OS === 'web') {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
                a.download = 'lastminute-my-data.json';
                a.click();
              } else await Share.share({ title: 'My LastMinute data', message: text });
              setExportMsg('Your data is ready. Keep it safe — it has your personal details.');
            }}
          />
          {exportMsg ? <Txt v="small" color="success" live>{exportMsg}</Txt> : null}
        </Card>
      </Section>

      <Section title="Correct my details">
        <Card inner={{ padding: 16, gap: 10 }}>
          <Field icon="person" placeholder="Name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} accessibilityLabel="Your name" />
          <Field icon="location" placeholder="Pickup / drop address" value={draft.address} onChangeText={(address) => setDraft({ ...draft, address })} accessibilityLabel="Your address" />
          <Btn
            label="Save corrections"
            icon="save"
            bg="white"
            disabled={draft.name.trim().length < 2 || (draft.name === user.name && draft.address === user.address)}
            onPress={async () => {
              await updateMe({ name: draft.name.trim(), address: draft.address.trim() });
              setFixMsg('Saved.');
            }}
          />
          {fixMsg ? <Txt v="small" color="success" live>{fixMsg}</Txt> : null}
          <Txt v="small" color="muted">To change your mobile number, delete this account and sign up again with the new number.</Txt>
        </Card>
      </Section>

      <Section title="Nominee">
        <Card inner={{ padding: 16, gap: 10 }}>
          <Txt>Someone who can use these rights for you if you pass away or can’t act yourself.</Txt>
          <Field icon="person" placeholder="Nominee name" value={nominee.name} onChangeText={(name) => setNom({ ...nominee, name })} accessibilityLabel="Nominee name" />
          <Field icon="call" placeholder="Nominee mobile number" keyboardType="phone-pad" value={nominee.phone} onChangeText={(phone) => setNom({ ...nominee, phone })} accessibilityLabel="Nominee mobile number" />
          <Field icon="people" placeholder="Relation (e.g. daughter)" value={nominee.relation} onChangeText={(relation) => setNom({ ...nominee, relation })} accessibilityLabel="Relation" />
          <Btn
            label="Save nominee"
            icon="save"
            bg="white"
            disabled={nominee.name.trim().length < 2 || !isValidPhone(nominee.phone) || nominee.relation.trim().length < 2}
            onPress={async () => {
              const err = await setNominee(nominee);
              setNomMsg(err ?? 'Nominee saved.');
            }}
          />
          {nomMsg ? <Txt v="small" live>{nomMsg}</Txt> : null}
        </Card>
      </Section>

      <Section title="Complain or ask a question">
        <Card inner={{ padding: 16, gap: 10 }}>
          <Txt>Our Grievance Officer replies within 7 days.</Txt>
          <Field icon="pricetag" placeholder="Subject" value={g.subject} onChangeText={(subject) => setG({ ...g, subject })} accessibilityLabel="Subject" />
          <Field icon="chatbubble-ellipses" multiline placeholder="Tell us what happened" value={g.message} onChangeText={(message) => setG({ ...g, message })} accessibilityLabel="Your message" />
          <Btn
            label="Send to Grievance Officer"
            icon="send"
            disabled={g.subject.trim().length < 3 || g.message.trim().length < 5}
            onPress={async () => {
              const id = await raiseGrievance(g.subject.trim(), g.message.trim());
              if (id) {
                setGMsg(`Sent. Your ticket number is ${id}.`);
                setG({ subject: '', message: '' });
              }
            }}
          />
          {gMsg ? <Txt v="small" color="success" live>{gMsg}</Txt> : null}
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Pressable onPress={() => Linking.openURL(`mailto:${GRIEVANCE_OFFICER.email}`)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
              <Txt v="label" style={{ textDecorationLine: 'underline' }}>{GRIEVANCE_OFFICER.email}</Txt>
            </Pressable>
            <Txt v="small" color="muted">·</Txt>
            <Pressable onPress={() => Linking.openURL(`tel:${GRIEVANCE_OFFICER.phone.replace(/-/g, '')}`)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
              <Txt v="label" style={{ textDecorationLine: 'underline' }}>{GRIEVANCE_OFFICER.phone}</Txt>
            </Pressable>
          </Row>
          <Txt v="small" color="muted">
            If you are not happy with our answer, you can complain to the Data Protection Board of India.
          </Txt>
        </Card>
        {requests.length ? (
          <View style={{ gap: 10 }}>
            {requests.map((r) => (
              <Card key={r.id} offset={3} inner={{ padding: 12, gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt v="label" style={{ flex: 1 }} lines={1}>
                    {r.subject ?? r.type.replace('_', ' ')}
                  </Txt>
                  <Badge label={r.status.replace('_', ' ')} bg={r.status === 'resolved' ? 'green' : r.status === 'rejected' ? 'pink' : 'ink'} fg={r.status === 'resolved' ? 'ink' : 'white'} />
                </Row>
                <Txt v="small" color="muted">
                  #{r.id} · {dayLabel(r.createdAt)}
                </Txt>
                {r.resolution ? <Txt v="small">Answer: {r.resolution}</Txt> : null}
              </Card>
            ))}
          </View>
        ) : null}
      </Section>

      <Section title="Delete my account">
        <Card bg="pinkSoft" inner={{ padding: 16, gap: 10 }}>
          <Row>
            <IconBox icon="trash" bg="white" size={44} />
            <Txt style={{ flex: 1 }}>This removes your name, number, address and PIN. Bills stay for 8 years without your name, as tax law requires. This can’t be undone.</Txt>
          </Row>
          <Field icon="lock-closed" placeholder="Type your PIN to confirm" keyboardType="number-pad" secureTextEntry maxLength={6} value={delPin} onChangeText={setDelPin} accessibilityLabel="PIN to confirm deletion" />
          <Btn
            label="Delete my account"
            icon="trash"
            bg="white"
            disabled={delPin.length < 4}
            onPress={() =>
              confirm('Delete your account?', 'All your personal details will be erased. This cannot be undone.', async () => {
                const err = await deleteAccount(delPin);
                if (err) setDelErr(err);
                else router.replace('/welcome');
              }, 'Delete')
            }
          />
          {delErr ? <Txt v="label" color="danger" live>{delErr}</Txt> : null}
        </Card>
      </Section>

      <Pressable onPress={() => router.push('/privacy-policy')} accessibilityRole="link" style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}>
        <Txt v="label" style={{ textDecorationLine: 'underline' }}>Read the full privacy policy</Txt>
      </Pressable>
    </Screen>
  );
}

function Toggle({ on, title, sub, onChange }: { on: boolean; title: string; sub: string; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      accessibilityLabel={title}
      accessibilityHint={sub}
      onPress={() => (tap(), onChange(!on))}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: border.width, borderColor: colors.ink, backgroundColor: on ? colors.greenSoft : colors.white }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="h3">{title}</Txt>
        <Txt v="small" color="muted">{sub}</Txt>
      </View>
      <View style={{ width: 64, height: 36, borderRadius: 18, borderWidth: border.width, borderColor: colors.ink, backgroundColor: on ? colors.green : colors.white, padding: 3, alignItems: on ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.ink }} />
      </View>
      <Ionicons name={on ? 'checkmark-circle' : 'close-circle'} size={22} color={on ? colors.success : colors.muted} accessibilityElementsHidden importantForAccessibility="no" />
    </Pressable>
  );
}
