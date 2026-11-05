import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';

import { PIN_LENGTH, PinPad } from '../components/PinPad';
import { Btn, Card, Field, IconBtn, Row, Screen, SpeakBtn, Txt } from '../components/ui';
import type { Role } from '../data/types';
import { isValidPhone, weakPin } from '../lib/auth';
import { HELPLINE } from '../lib/constants';
import { useStore } from '../state/store';
import { colors } from '../theme';

type Step = 'phone' | 'pin' | 'details' | 'newPin' | 'confirmPin';

/**
 * Login and sign-up with mobile number + 4-digit PIN.
 * One thing per screen; the PIN uses a big on-screen keypad.
 */
export default function Auth() {
  const params = useLocalSearchParams<{ role?: Role; mode?: 'login' | 'signup' }>();
  const role: Role = params.role === 'provider' ? 'provider' : 'customer';
  const { t, login, signUp, set } = useStore();
  const [mode, setMode] = useState<'login' | 'signup'>(params.mode === 'signup' ? 'signup' : 'login');
  const [step, setStep] = useState<Step>(mode === 'login' ? 'phone' : 'details');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (m: 'login' | 'signup') => {
    setMode(m);
    setStep(m === 'login' ? 'phone' : 'details');
    setPin('');
    setFirstPin('');
    setError(null);
  };

  const done = () => {
    set('role', role);
    router.replace('/');
  };

  // act as soon as the 4th digit is typed — no extra button to find
  const onPin = (v: string) => {
    setError(null);
    setPin(v);
    if (v.length !== PIN_LENGTH || busy) return;
    if (step === 'pin') {
      setBusy(true);
      login(phone, v).then((err) => {
        setBusy(false);
        if (err) {
          setError(err);
          setPin('');
        } else done();
      });
    } else if (step === 'newPin') {
      if (weakPin(v)) {
        setError('That PIN is too easy to guess. Try another.');
        setPin('');
        return;
      }
      setFirstPin(v);
      setPin('');
      setStep('confirmPin');
    } else if (step === 'confirmPin') {
      if (v !== firstPin) {
        setError('PINs did not match. Please create it again.');
        setPin('');
        setFirstPin('');
        setStep('newPin');
        return;
      }
      setBusy(true);
      signUp({ name, phone, pin: v, role }).then((err) => {
        setBusy(false);
        if (err) {
          setError(err);
          setPin('');
        } else done();
      });
    }
  };

  const titles: Record<Step, { title: string; sub: string }> = {
    phone: { title: 'Welcome back', sub: 'Enter your mobile number.' },
    pin: { title: 'Enter your PIN', sub: `4-digit PIN for +91 ${phone.replace(/\D/g, '').slice(-10)}` },
    details: {
      title: role === 'provider' ? 'Create your account' : 'Create account',
      sub: 'Your name and mobile number.',
    },
    newPin: { title: 'Make a 4-digit PIN', sub: 'You will use it to log in. Pick something easy for you to remember.' },
    confirmPin: { title: 'Type the PIN again', sub: 'Just to be sure.' },
  };
  const { title, sub } = titles[step];
  const isPinStep = step === 'pin' || step === 'newPin' || step === 'confirmPin';

  const back = () => {
    setError(null);
    setPin('');
    if (step === 'pin') return setStep('phone');
    if (step === 'newPin') return setStep('details');
    if (step === 'confirmPin') return setStep('newPin');
    if (router.canGoBack()) router.back();
    else router.replace('/welcome');
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconBtn icon="arrow-back" label={t('back')} onPress={back} />
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 2,
            borderColor: colors.ink,
            backgroundColor: role === 'provider' ? colors.greenSoft : colors.pinkSoft,
          }}
        >
          <Txt v="small">{role === 'provider' ? 'Service provider' : 'Customer'}</Txt>
        </View>
      </Row>

      <View style={{ gap: 8 }}>
        <Txt v="h1">{title}</Txt>
        <Txt color="muted">{sub}</Txt>
        <SpeakBtn text={`${title}. ${sub}`} />
      </View>

      {error ? (
        <Card bg="pinkSoft" offset={3} inner={{ padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Ionicons name="alert-circle" size={24} color={colors.danger} />
          <Txt v="label" style={{ flex: 1 }}>
            {error}
          </Txt>
        </Card>
      ) : null}

      {step === 'phone' ? (
        <View style={{ gap: 14 }}>
          <Field
            icon="call"
            placeholder="10-digit mobile number"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              setError(null);
            }}
            maxLength={16}
            autoFocus
          />
          <Btn
            label={t('next')}
            icon="arrow-forward"
            size="lg"
            disabled={!isValidPhone(phone)}
            onPress={() => {
              setPin('');
              setStep('pin');
            }}
          />
        </View>
      ) : null}

      {step === 'details' ? (
        <View style={{ gap: 14 }}>
          <Field icon="person" placeholder="Your name" value={name} onChangeText={setName} autoFocus />
          <Field
            icon="call"
            placeholder="10-digit mobile number"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              setError(null);
            }}
            maxLength={16}
          />
          {phone.length >= 10 && !isValidPhone(phone) ? (
            <Txt v="small" color="danger">
              Please enter a valid 10-digit Indian mobile number.
            </Txt>
          ) : null}
          <Btn
            label={t('next')}
            icon="arrow-forward"
            size="lg"
            disabled={name.trim().length < 2 || !isValidPhone(phone)}
            onPress={() => {
              setPin('');
              setError(null);
              setStep('newPin');
            }}
          />
        </View>
      ) : null}

      {isPinStep ? (
        <View style={{ gap: 14, alignItems: 'center' }}>
          <PinPad value={pin} onChange={onPin} error={!!error} />
          {busy ? <ActivityIndicator color={colors.ink} /> : null}
        </View>
      ) : null}

      <View style={{ gap: 12, alignItems: 'center', marginTop: 8 }}>
        {mode === 'login' ? (
          <LinkText label="New here? Create account" onPress={() => switchMode('signup')} />
        ) : (
          <LinkText label="Already have an account? Log in" onPress={() => switchMode('login')} />
        )}
        {step === 'pin' ? <LinkText label="Forgot PIN? Call helpline" onPress={() => Linking.openURL(`tel:${HELPLINE}`)} /> : null}
      </View>
    </Screen>
  );
}

function LinkText({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={10} style={{ padding: 6 }}>
      <Txt v="label" style={{ textDecorationLine: 'underline' }}>
        {label}
      </Txt>
    </Pressable>
  );
}
