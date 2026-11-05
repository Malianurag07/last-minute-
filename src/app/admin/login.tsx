import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Btn, Card, Field, IconBox, IconBtn, Row, Screen, Txt } from '../../components/ui';
import { useStore } from '../../state/store';
import { colors } from '../../theme';

export default function AdminLogin() {
  const { adminSession, adminLogin } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (adminSession) return <Redirect href="/admin" />;

  const submit = async () => {
    setBusy(true);
    const err = await adminLogin(username, password);
    setBusy(false);
    if (err) {
      setError(err);
      setPassword('');
    } else router.replace('/admin');
  };

  return (
    <Screen bg="purpleSoft">
      <IconBtn icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))} />
      <Card radius={24} offset={7} inner={{ padding: 22, gap: 16 }}>
        <Row>
          <IconBox icon="shield-checkmark" bg="purple" color="white" size={56} />
          <View style={{ flex: 1 }}>
            <Txt v="h1">Admin</Txt>
            <Txt v="small" color="muted">
              LastMinute operations panel
            </Txt>
          </View>
        </Row>
        {error ? (
          <Row style={{ backgroundColor: colors.pinkSoft, padding: 10, borderRadius: 10, borderWidth: 2, borderColor: colors.ink }}>
            <Ionicons name="alert-circle" size={22} color={colors.danger} />
            <Txt v="label" style={{ flex: 1 }}>
              {error}
            </Txt>
          </Row>
        ) : null}
        <Field icon="person" placeholder="Username" autoCapitalize="none" autoCorrect={false} value={username} onChangeText={(v) => (setUsername(v), setError(null))} />
        <Field
          icon="lock-closed"
          placeholder="Password"
          secureTextEntry={!show}
          autoCapitalize="none"
          value={password}
          onChangeText={(v) => (setPassword(v), setError(null))}
          onSubmitEditing={submit}
          right={<Ionicons name={show ? 'eye-off' : 'eye'} size={22} color={colors.ink} onPress={() => setShow(!show)} accessibilityLabel={show ? 'Hide password' : 'Show password'} />}
        />
        <Btn label="Log in" icon="log-in" bg="purple" fg="white" disabled={!username || !password || busy} onPress={submit} />
        {busy ? <ActivityIndicator color={colors.ink} /> : null}
        <Txt v="small" color="muted">
          Demo login: admin / Admin@123. Change it after first login.
        </Txt>
      </Card>
    </Screen>
  );
}
