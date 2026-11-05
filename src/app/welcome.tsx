import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

import { Prefs } from '../components/Prefs';
import { Card, IconBox, PressCard, Row, Screen, SpeakBtn, Txt } from '../components/ui';
import { DEMO_PIN } from '../data/seed';
import { useStore } from '../state/store';
import { colors } from '../theme';

export default function Welcome() {
  const { t, set, login } = useStore();

  const asCustomer = () => router.push({ pathname: '/auth', params: { role: 'customer' } });
  const asProvider = () => router.push({ pathname: '/auth', params: { role: 'provider' } });
  const demo = async (phone: string, role: 'customer' | 'provider') => {
    const err = await login(phone, DEMO_PIN);
    if (err) return;
    set('role', role);
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.yellow, overflow: 'hidden' }}>
      {/* decorative shapes echoing the reference backdrop */}
      <View style={{ position: 'absolute', left: -110, top: 120, width: 220, height: 220, borderRadius: 110, backgroundColor: colors.pink }} />
      <View
        style={{
          position: 'absolute',
          right: -120,
          bottom: -60,
          width: 340,
          height: 420,
          backgroundColor: colors.purple,
          transform: [{ rotate: '-18deg' }],
        }}
      />
      <Screen bg="yellow">
        <View style={{ height: 0 }} />
        <Card radius={28} offset={8} inner={{ padding: 22, gap: 22, backgroundColor: colors.paper }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={8}>
              <IconBox icon="flash" bg="yellow" size={40} />
              <Txt v="h3">{t('appName')}</Txt>
            </Row>
            <SpeakBtn text={`${t('tagline1')} ${t('tagline2')} ${t('welcomeSub')} ${t('iNeed')}. ${t('iOffer')}.`} compact />
          </Row>

          <View style={{ gap: 8 }}>
            <Txt v="display">
              {t('tagline1')}
              {'\n'}
              {t('tagline2')}
            </Txt>
            <Txt color="muted">{t('welcomeSub')}</Txt>
          </View>

          <RoleCard icon="bag-handle" bg="pink" title={t('iNeed')} sub={t('iNeedSub')} onPress={asCustomer} />
          <RoleCard icon="storefront" bg="green" title={t('iOffer')} sub={t('iOfferSub')} onPress={asProvider} />

          <View style={{ alignItems: 'center', gap: 4 }}>
            <Txt v="small" color="muted">
              {t('tryDemo')}
            </Txt>
            <Row gap={18}>
              <Pressable onPress={() => demo('9000012345', 'customer')} accessibilityRole="button" style={{ padding: 6 }}>
                <Txt v="label" style={{ textDecorationLine: 'underline' }}>
                  Demo customer
                </Txt>
              </Pressable>
              <Pressable onPress={() => demo('9820011111', 'provider')} accessibilityRole="button" style={{ padding: 6 }}>
                <Txt v="label" style={{ textDecorationLine: 'underline' }}>
                  Demo shop
                </Txt>
              </Pressable>
            </Row>
          </View>

          <View style={{ height: 2, backgroundColor: colors.ink, opacity: 0.1 }} />
          <Prefs />
        </Card>
      </Screen>
    </View>
  );
}

function RoleCard({ icon, bg, title, sub, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; bg: 'pink' | 'green'; title: string; sub: string; onPress: () => void }) {
  return (
    <PressCard onPress={onPress} inner={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 96 }}>
      <IconBox icon={icon} bg={bg} size={60} color={bg === 'pink' ? 'white' : 'ink'} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="h3">{title}</Txt>
        <Txt v="small" color="muted">
          {sub}
        </Txt>
      </View>
      <Ionicons name="chevron-forward" size={28} color={colors.ink} />
    </PressCard>
  );
}
