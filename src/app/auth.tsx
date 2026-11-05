import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, View } from 'react-native';

import { PIN_LENGTH, PinPad } from '../components/PinPad';
import { Btn, Card, Field, IconBtn, Row, Screen, SpeakBtn, tap, Txt } from '../components/ui';
import type { Role } from '../data/types';
import { isValidPhone, normalizePhone, weakPin } from '../lib/auth';
import { HELPLINE } from '../lib/constants';
import { NOTICE } from '../lib/privacy';
import { useStore } from '../state/store';
import { border, colors } from '../theme';

type Step = 'phone' | 'pin' | 'loginOtp' | 'details' | 'consent' | 'otp' | 'newPin' | 'confirmPin';

/**
 * Login and sign-up with mobile number + 4-digit PIN.
 * Sign-up: details → privacy notice & consent → SMS code → PIN → PIN again.
 * Login on a new phone also asks for an SMS code.
 */
export default function Auth() {
  const params = useLocalSearchParams<{ role?: Role; mode?: 'login' | 'signup' }>();
  const role: Role = params.role === 'provider' ? 'provider' : 'customer';
  const { t, lang, login, signUp, set, requestOtp } = useStore();
  const [mode, setMode] = useState<'login' | 'signup'>(params.mode === 'signup' ? 'signup' : 'login');
  const [step, setStep] = useState<Step>(mode === 'login' ? 'phone' : 'details');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [otp, setOtp] = useState('');
  const [demoCode, setDemoCode] = useState<string | undefined>();
  const [adult, setAdult] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const notice = NOTICE[lang];

  const switchMode = (m: 'login' | 'signup') => {
    setMode(m);
    setStep(m === 'login' ? 'phone' : 'details');
    setPin('');
    setFirstPin('');
    setOtp('');
    setError(null);
  };

  const done = () => {
    set('role', role);
    router.replace('/');
  };

  const sendCode = async (purpose: 'signup' | 'login') => {
    setBusy(true);
    const r = await requestOtp(phone, purpose);
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return false;
    }
    setDemoCode(r.demoCode);
    setOtp('');
    return true;
  };

  // act as soon as the last PIN digit is typed — no extra button to find
  const onPin = async (v: string) => {
    setError(null);
    setPin(v);
    if (v.length !== PIN_LENGTH || busy) return;
    if (step === 'pin') {
      setBusy(true);
      const err = await login(phone, v);
      setBusy(false);
      if (err === 'otp_required') {
        setLoginPin(v);
        setPin('');
        if (await sendCode('login')) setStep('loginOtp');
      } else if (err) {
        setError(err);
        setPin('');
      } else done();
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
      const err = await signUp({ name, phone, pin: v, otp, role, isAdult: adult, marketing });
      setBusy(false);
      if (err) {
        setError(err);
        setPin('');
        if (/code/i.test(err)) setStep('otp');
      } else done();
    }
  };

  const titles: Record<Step, { title: string; sub: string }> = {
    phone: { title: 'Welcome back', sub: 'Enter your mobile number.' },
    pin: { title: 'Enter your PIN', sub: `PIN for +91 ${normalizePhone(phone)}` },
    loginOtp: { title: 'New phone? Confirm it’s you', sub: `We sent a 6-digit code by SMS to +91 ${normalizePhone(phone)}.` },
    details: { title: role === 'provider' ? 'Create your account' : 'Create account', sub: 'Your name and mobile number.' },
    consent: { title: notice.title, sub: 'Please read and agree. It is short.' },
    otp: { title: 'Enter the SMS code', sub: `We sent a 6-digit code to +91 ${normalizePhone(phone)}. It works for 5 minutes.` },
    newPin: { title: 'Make a 4-digit PIN', sub: 'You will use it to log in. Pick something easy for you to remember, not 1234.' },
    confirmPin: { title: 'Type the PIN again', sub: 'Just to be sure.' },
  };
  const { title, sub } = titles[step];
  const isPinStep = step === 'pin' || step === 'newPin' || step === 'confirmPin';
  const speakText = step === 'consent' ? `${notice.title}. ${notice.collect} ${notice.why.join(' ')} ${notice.keep} ${notice.rights} ${notice.age}` : `${title}. ${sub}`;

  const back = () => {
    setError(null);
    setPin('');
    const prev: Partial<Record<Step, Step>> = { pin: 'phone', loginOtp: 'pin', consent: 'details', otp: 'consent', newPin: 'otp', confirmPin: 'newPin' };
    if (prev[step]) return setStep(prev[step]!);
    if (router.canGoBack()) router.back();
    else router.replace('/welcome');
  };

  const codeEntry = (label: string, onSubmit: () => void) => (
    <View style={{ gap: 14 }}>
      {demoCode ? (
        <Card bg="blueSoft" offset={3} inner={{ padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Ionicons name="chatbox-ellipses" size={22} color={colors.ink} />
          <Txt v="label" style={{ flex: 1 }}>
            Demo SMS: your code is {demoCode}
          </Txt>
        </Card>
      ) : null}
      <Field icon="keypad" placeholder="6-digit code" keyboardType="number-pad" maxLength={6} value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, ''))} autoFocus textContentType="oneTimeCode" autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'} accessibilityLabel="6-digit SMS code" />
      <Btn label={label} icon="arrow-forward" size="lg" disabled={otp.length !== 6 || busy} onPress={onSubmit} />
      <LinkText label="Didn’t get it? Send again" onPress={() => void sendCode(mode === 'signup' ? 'signup' : 'login')} />
    </View>
  );

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconBtn icon="arrow-back" label={t('back')} onPress={back} />
        <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 2, borderColor: colors.ink, backgroundColor: role === 'provider' ? colors.greenSoft : colors.pinkSoft }}>
          <Txt v="small">{role === 'provider' ? 'Service provider' : 'Customer'}</Txt>
        </View>
      </Row>

      <View style={{ gap: 8 }}>
        <Txt v="h1" role="heading">
          {title}
        </Txt>
        <Txt color="muted">{sub}</Txt>
        <SpeakBtn text={speakText} />
      </View>

      {error ? (
        <Card bg="pinkSoft" offset={3} inner={{ padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Ionicons name="alert-circle" size={24} color={colors.danger} />
          <Txt v="label" style={{ flex: 1 }} live>
            {error}
          </Txt>
        </Card>
      ) : null}

      {step === 'phone' ? (
        <View style={{ gap: 14 }}>
          <Field icon="call" placeholder="10-digit mobile number" keyboardType="phone-pad" value={phone} onChangeText={(v) => (setPhone(v), setError(null))} maxLength={16} autoFocus accessibilityLabel="Mobile number" autoComplete="tel" />
          <Btn label={t('next')} icon="arrow-forward" size="lg" disabled={!isValidPhone(phone)} onPress={() => (setPin(''), setStep('pin'))} />
        </View>
      ) : null}

      {step === 'loginOtp' ? (
        codeEntry('Confirm & log in', async () => {
          setBusy(true);
          const err = await login(phone, loginPin, otp);
          setBusy(false);
          if (err) setError(err === 'otp_required' ? 'Please enter the SMS code.' : err);
          else done();
        })
      ) : null}

      {step === 'details' ? (
        <View style={{ gap: 14 }}>
          <Field icon="person" placeholder="Your name" value={name} onChangeText={setName} autoFocus accessibilityLabel="Your name" autoComplete="name" />
          <Field icon="call" placeholder="10-digit mobile number" keyboardType="phone-pad" value={phone} onChangeText={(v) => (setPhone(v), setError(null))} maxLength={16} accessibilityLabel="Mobile number" autoComplete="tel" />
          {phone.length >= 10 && !isValidPhone(phone) ? (
            <Txt v="small" color="danger">
              Please enter a valid 10-digit Indian mobile number.
            </Txt>
          ) : null}
          <Btn label={t('next')} icon="arrow-forward" size="lg" disabled={name.trim().length < 2 || !isValidPhone(phone)} onPress={() => (setError(null), setStep('consent'))} />
        </View>
      ) : null}

      {step === 'consent' ? (
        <View style={{ gap: 14 }}>
          <Card inner={{ padding: 16, gap: 10 }}>
            <Txt>{notice.collect}</Txt>
            {notice.why.map((w) => (
              <Row key={w} style={{ alignItems: 'flex-start' }} gap={8}>
                <Txt v="label">•</Txt>
                <Txt style={{ flex: 1 }}>{w}</Txt>
              </Row>
            ))}
            <Txt>{notice.keep}</Txt>
            <Txt>{notice.rights}</Txt>
            <Pressable onPress={() => router.push('/privacy-policy')} accessibilityRole="link" style={{ paddingVertical: 4 }}>
              <Txt v="label" style={{ textDecorationLine: 'underline' }}>
                Read the full privacy policy
              </Txt>
            </Pressable>
          </Card>
          <Check checked={adult} onChange={setAdult} label={`I am 18 years or older. (${notice.age})`} required />
          <Check checked={sharing} onChange={setSharing} label="Share my name, number and address with the provider and delivery partner for orders I place." required />
          <Check checked={marketing} onChange={setMarketing} label="Send me offers and tips on SMS/WhatsApp (optional)." />
          <Btn
            label="I agree, send SMS code"
            icon="checkmark-circle"
            size="lg"
            bg="green"
            fg="ink"
            disabled={!adult || !sharing || busy}
            onPress={async () => {
              setError(null);
              if (await sendCode('signup')) setStep('otp');
            }}
          />
        </View>
      ) : null}

      {step === 'otp' ? codeEntry(t('next'), () => (setPin(''), setError(null), setStep('newPin'))) : null}

      {isPinStep ? (
        <View style={{ gap: 14, alignItems: 'center' }}>
          <PinPad value={pin} onChange={(v) => void onPin(v)} error={!!error} />
          {busy ? <ActivityIndicator color={colors.ink} accessibilityLabel="Please wait" /> : null}
        </View>
      ) : null}

      <View style={{ gap: 12, alignItems: 'center', marginTop: 8 }}>
        {mode === 'login' ? <LinkText label="New here? Create account" onPress={() => switchMode('signup')} /> : <LinkText label="Already have an account? Log in" onPress={() => switchMode('login')} />}
        {step === 'pin' ? <LinkText label="Forgot PIN? Call helpline" onPress={() => Linking.openURL(`tel:${HELPLINE}`)} /> : null}
      </View>
    </Screen>
  );
}

function Check({ checked, onChange, label, required }: { checked: boolean; onChange: (v: boolean) => void; label: string; required?: boolean }) {
  return (
    <Pressable
      onPress={() => (tap(), onChange(!checked))}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel={`${label}${required ? ' Required.' : ''}`}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', minHeight: 48 }}
    >
      <View
        style={{
          width: 32, height: 32, borderRadius: 8, borderWidth: border.width, borderColor: colors.ink,
          backgroundColor: checked ? colors.green : colors.white, alignItems: 'center', justifyContent: 'center', marginTop: 2,
        }}
      >
        {checked ? <Ionicons name="checkmark" size={22} color={colors.ink} /> : null}
      </View>
      <Txt style={{ flex: 1 }}>
        {label}
        {required ? <Txt v="label" color="danger"> (required)</Txt> : null}
      </Txt>
    </Pressable>
  );
}

function LinkText({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={10} style={{ padding: 6, minHeight: 44, justifyContent: 'center' }}>
      <Txt v="label" style={{ textDecorationLine: 'underline' }}>
        {label}
      </Txt>
    </Pressable>
  );
}
