import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { useStore } from '../state/store';
import { IconBtn, Row, SpeakBtn, Txt } from './ui';

/** Back button + big title. Back is always top-left and labelled for screen readers. */
export function Header({ title, sub, speak, right }: { title: string; sub?: string; speak?: string; right?: React.ReactNode }) {
  const { t } = useStore();
  return (
    <View style={{ gap: 14 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconBtn icon="arrow-back" label={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Row gap={10}>
          {speak ? <SpeakBtn text={speak} /> : null}
          {right}
        </Row>
      </Row>
      {title ? (
        <View style={{ gap: 4 }}>
          <Txt v="h1">{title}</Txt>
          {sub ? <Txt color="muted">{sub}</Txt> : null}
        </View>
      ) : null}
    </View>
  );
}
