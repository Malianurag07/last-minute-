import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';

import { Header } from '../components/Header';
import { Prefs } from '../components/Prefs';
import { Btn, Card, IconBox, Row, Screen, Section, tap, Txt } from '../components/ui';
import { HELPLINE } from '../lib/constants';
import { useStore } from '../state/store';
import { border, colors } from '../theme';

export default function Settings() {
  const { t, easyMode, set, role, me, signOut, resetDemo } = useStore();

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
            signOut();
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
