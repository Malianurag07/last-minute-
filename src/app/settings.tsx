import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';

import { Header } from '../components/Header';
import { Prefs } from '../components/Prefs';
import { Btn, Card, Field, IconBox, Row, Screen, Section, tap, Txt } from '../components/ui';
import { formatPhone, weakPin } from '../lib/auth';
import { HELPLINE } from '../lib/constants';
import { useStore } from '../state/store';
import { border, colors } from '../theme';

export default function Settings() {
  const { t, easyMode, set, role, me, user, logout, resetDemo, changePin } = useStore();
  const [pinOpen, setPinOpen] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinMsg, setPinMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reset = () => {
    const run = () => {
      resetDemo();
      router.replace('/welcome');
    };
    if (Platform.OS === 'web') return run();
    Alert.alert('Reset all demo data?', 'Orders, shops and settings go back to the start.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <Screen>
      <Header title={t('settings')} />

      <Section title="Easier to use">
        <Card inner={{ padding: 16, gap: 18 }}>
          <Prefs />
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: easyMode }}
            onPress={() => {
              tap();
              set('easyMode', !easyMode);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <IconBox icon="accessibility" bg={easyMode ? 'green' : 'greySoft'} size={48} />
            <View style={{ flex: 1 }}>
              <Txt v="h3">{t('easyMode')}</Txt>
              <Txt v="small" color="muted">
                {t('easyModeSub')}
              </Txt>
            </View>
            <View
              style={{
                width: 64,
                height: 36,
                borderRadius: 18,
                borderWidth: border.width,
                borderColor: colors.ink,
                backgroundColor: easyMode ? colors.green : colors.white,
                padding: 3,
                alignItems: easyMode ? 'flex-end' : 'flex-start',
              }}
            >
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.ink }} />
            </View>
          </Pressable>
        </Card>
      </Section>

      <Section title="Account">
        {user ? (
          <Card inner={{ padding: 16, gap: 10 }}>
            <Row>
              <IconBox icon="person" bg="yellowSoft" size={48} />
              <View style={{ flex: 1 }}>
                <Txt v="h3">{user.name}</Txt>
                <Txt v="small" color="muted">
                  {formatPhone(user.phone)}
                </Txt>
              </View>
            </Row>
            {!pinOpen ? (
              <Btn label="Change PIN" icon="key" bg="white" onPress={() => (setPinOpen(true), setPinMsg(null))} />
            ) : (
              <View style={{ gap: 10 }}>
                <Field icon="lock-closed" placeholder="Current PIN" keyboardType="number-pad" secureTextEntry maxLength={4} value={oldPin} onChangeText={setOldPin} />
                <Field icon="key" placeholder="New 4-digit PIN" keyboardType="number-pad" secureTextEntry maxLength={4} value={newPin} onChangeText={setNewPin} />
                <Btn
                  label="Save new PIN"
                  icon="checkmark"
                  bg="green"
                  fg="white"
                  disabled={oldPin.length !== 4 || !/^\d{4}$/.test(newPin)}
                  onPress={async () => {
                    if (weakPin(newPin)) return setPinMsg({ ok: false, text: 'That PIN is too easy to guess.' });
                    const err = await changePin(oldPin, newPin);
                    setPinMsg(err ? { ok: false, text: err } : { ok: true, text: 'PIN changed.' });
                    if (!err) {
                      setPinOpen(false);
                      setOldPin('');
                      setNewPin('');
                    }
                  }}
                />
              </View>
            )}
            {pinMsg ? (
              <Txt v="label" color={pinMsg.ok ? 'success' : 'danger'}>
                {pinMsg.text}
              </Txt>
            ) : null}
          </Card>
        ) : null}
        {role === 'provider' && me ? <Btn label={t('myShop')} icon="storefront" bg="white" onPress={() => router.push('/shop')} /> : null}
        <Btn
          label={role === 'provider' ? 'Switch to customer mode' : 'Switch to provider mode'}
          icon="swap-horizontal"
          bg="yellow"
          onPress={() => {
            set('role', role === 'provider' ? 'customer' : 'provider');
            router.replace('/');
          }}
        />
        <Btn
          label="Log out"
          icon="log-out"
          bg="white"
          onPress={() => {
            logout();
            router.replace('/welcome');
          }}
        />
      </Section>

      <Card bg="blueSoft" inner={{ padding: 16, gap: 10 }}>
        <Row>
          <Ionicons name="call" size={24} color={colors.ink} />
          <Txt v="h3">{t('helpCall')}</Txt>
        </Row>
        <Txt>Our team can set up your shop for you over the phone.</Txt>
        <Btn label="Call helpline" icon="call" bg="blue" fg="white" onPress={() => Linking.openURL(`tel:${HELPLINE}`)} />
      </Card>

      <Btn label="Reset demo data" icon="refresh" bg="pinkSoft" onPress={reset} />
      <Txt v="small" color="muted" center>
        LastMinute v1.0
      </Txt>
    </Screen>
  );
}
