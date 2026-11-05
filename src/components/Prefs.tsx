import React from 'react';
import { View } from 'react-native';

import { useStore } from '../state/store';
import { Chip, Row, Txt } from './ui';

export const SCALES = [
  { v: 1, label: 'A' },
  { v: 1.2, label: 'A+' },
  { v: 1.4, label: 'A++' },
];

/** Language + text-size pickers, shown on the very first screen and in Settings. */
export function Prefs() {
  const { t, lang, set, textScale } = useStore();
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 8 }}>
        <Txt v="label">{t('language')}</Txt>
        <Row gap={10}>
          <Chip label="English" active={lang === 'en'} onPress={() => set('lang', 'en')} />
          <Chip label="हिंदी" active={lang === 'hi'} onPress={() => set('lang', 'hi')} />
        </Row>
      </View>
      <View style={{ gap: 8 }}>
        <Txt v="label">{t('textSize')}</Txt>
        <Row gap={10}>
          {SCALES.map((s) => (
            <Chip key={s.v} label={s.label} active={textScale === s.v} onPress={() => set('textScale', s.v)} />
          ))}
        </Row>
      </View>
    </View>
  );
}
