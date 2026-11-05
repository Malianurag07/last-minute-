import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { useStore } from '../state/store';
import { border, colors } from '../theme';
import { tap, Txt } from './ui';

export const PIN_LENGTH = 4;

/**
 * Big on-screen number pad for the 4-digit PIN. Easier than the phone
 * keyboard for people with shaky hands or weak eyesight: 72px keys, high
 * contrast, and filled dots instead of tiny asterisks.
 */
export function PinPad({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: boolean }) {
  const { fs } = useStore();
  const press = (k: string) => {
    tap();
    if (k === 'del') return onChange(value.slice(0, -1));
    if (k === 'clr') return onChange('');
    if (value.length < PIN_LENGTH) onChange(value + k);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clr', '0', 'del'];
  return (
    <View style={{ gap: 18, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 16 }} accessible accessibilityRole="image" accessibilityLabel={`${value.length} of ${PIN_LENGTH} digits entered`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              borderWidth: border.width,
              borderColor: error ? colors.danger : colors.ink,
              backgroundColor: i < value.length ? (error ? colors.danger : colors.ink) : colors.white,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 3 * 84 + 2 * 14, gap: 14 }}>
        {keys.map((k) => (
          <Pressable
            key={k}
            onPress={() => press(k)}
            accessibilityRole="button"
            accessibilityLabel={k === 'del' ? 'Delete' : k === 'clr' ? 'Clear' : k}
            testID={`pin-${k}`}
            style={({ pressed }) => ({
              width: 84,
              height: 64,
              borderRadius: 16,
              borderWidth: border.width,
              borderColor: colors.ink,
              backgroundColor: pressed ? colors.yellow : k === 'del' || k === 'clr' ? colors.greySoft : colors.white,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            {k === 'del' ? (
              <Ionicons name="backspace" size={fs(26)} color={colors.ink} />
            ) : k === 'clr' ? (
              <Txt v="label">Clear</Txt>
            ) : (
              <Txt v="h1">{k}</Txt>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
