import React from 'react';
import { View } from 'react-native';

import { Header } from '../components/Header';
import { Card, Screen, Txt } from '../components/ui';
import { GRIEVANCE_OFFICER, NOTICE, NOTICE_VERSION } from '../lib/privacy';
import { useStore } from '../state/store';

/**
 * Full privacy policy (Digital Personal Data Protection Act 2023 and DPDP Rules 2025).
 * Plain language on purpose. Have a lawyer review before launch.
 */
const SECTIONS: { h: string; p: string[] }[] = [
  {
    h: '1. Who we are',
    p: ['LastMinute (“we”) is the Data Fiduciary for the personal data you give us in this app. We connect you with local, home-based service providers.'],
  },
  {
    h: '2. What we collect and why',
    p: [
      'Name and mobile number — to create your account, log you in safely (SMS code + PIN) and let a provider contact you about your order.',
      'Address — only if you choose pickup/drop, so the provider and delivery partner can collect and return your item.',
      'Order details and notes — to do the job you asked for.',
      'Reviews — shown to others with your first name only.',
      'Technical data — a random device ID, to recognise your phone and stop strangers using your PIN on another phone. We do not collect your location, contacts, photos or Aadhaar.',
    ],
  },
  {
    h: '3. Your consent',
    p: [
      'We ask before collecting. You can withdraw any consent in the Privacy Centre as easily as you gave it. Withdrawing “share details for orders” means you can’t place new orders, because we can’t deliver without it.',
      'Marketing messages are optional and off unless you turn them on.',
    ],
  },
  {
    h: '4. Who we share with',
    p: [
      'Only the provider you book and the delivery partner you pick (Rapido, Porter, Uber or Ola) get your name, number and address — for that order only. Providers lose access to your number and address once the order is finished.',
      'We never sell your data. We share with authorities only when the law requires it.',
      'Our service partners (cloud hosting, SMS) process data only on our instructions under contract.',
    ],
  },
  {
    h: '5. How long we keep it',
    p: [
      'Account data: until you delete your account.',
      'Contact details on finished orders: removed after 90 days.',
      'Bills: 8 years, without your name or number, as tax law requires.',
      'Security logs: 3 years.',
    ],
  },
  {
    h: '6. How we protect it',
    p: [
      'Encryption on the way (HTTPS) and at rest (AES-256). PINs are stored only as one-way hashes. Staff see masked numbers; opening a full number needs a reason and is recorded. Admin accounts need 2-step verification.',
      'If a breach affects you, we will tell you and the Data Protection Board of India without delay.',
    ],
  },
  {
    h: '7. Your rights',
    p: [
      'See and download your data, correct it, delete your account, withdraw consent, and name a nominee — all in the Privacy Centre.',
      'Complain to our Grievance Officer (we reply within 7 days). If you are not satisfied, you can complain to the Data Protection Board of India.',
    ],
  },
  {
    h: '8. Children',
    p: ['LastMinute is only for people aged 18 or older. We do not knowingly collect data of children.'],
  },
  {
    h: '9. Changes',
    p: ['If we change this policy in a way that affects you, we will show you the new version in the app and ask again where needed.'],
  },
];

export default function PrivacyPolicy() {
  const { lang } = useStore();
  const n = NOTICE[lang];
  return (
    <Screen>
      <Header title="Privacy policy" sub={`Version ${NOTICE_VERSION}`} speak={`${n.title}. ${n.collect} ${n.why.join(' ')} ${n.keep} ${n.rights}`} />
      {lang === 'hi' ? (
        <Card bg="yellowSoft" inner={{ padding: 16, gap: 8 }}>
          <Txt v="h3">{n.title}</Txt>
          <Txt>{n.collect}</Txt>
          {n.why.map((w) => (
            <Txt key={w}>• {w}</Txt>
          ))}
          <Txt>{n.keep}</Txt>
          <Txt>{n.rights}</Txt>
        </Card>
      ) : null}
      {SECTIONS.map((s) => (
        <View key={s.h} style={{ gap: 8 }}>
          <Txt v="h3" role="heading">
            {s.h}
          </Txt>
          {s.p.map((p) => (
            <Txt key={p}>{p}</Txt>
          ))}
        </View>
      ))}
      <Card inner={{ padding: 16, gap: 4 }}>
        <Txt v="h3" role="heading">
          Grievance Officer
        </Txt>
        <Txt>{GRIEVANCE_OFFICER.name}</Txt>
        <Txt>{GRIEVANCE_OFFICER.email}</Txt>
        <Txt>{GRIEVANCE_OFFICER.phone}</Txt>
      </Card>
    </Screen>
  );
}
