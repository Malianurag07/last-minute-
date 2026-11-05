import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '../state/store';
import { border, colors } from '../theme';
import { tap, Txt, type IconName } from './ui';

export interface TabMeta {
  icon: IconName;
  label: string;
  badge?: number;
}

/**
 * Chunky bottom navigation: always shows a text label under the icon
 * (icons alone confuse first-time smartphone users) and the active tab
 * gets a solid yellow pill.
 */
export function TabBar({ state, emitter, navigateToTab, meta }: BottomTabBarProps & { meta: Record<string, TabMeta> }) {
  const insets = useSafeAreaInsets();
  const { fs } = useStore();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: insets.bottom + 10,
        flexDirection: 'row',
        backgroundColor: colors.white,
        borderWidth: border.width,
        borderColor: colors.ink,
        borderRadius: 22,
        padding: 6,
        gap: 4,
        shadowColor: colors.ink,
        shadowOffset: { width: 4, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 0,
      }}
    >
      {state.routes.map((route, i) => {
        const m = meta[route.name];
        if (!m) return null;
        const focused = state.index === i;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            onPress={() => {
              tap();
              const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) navigateToTab(route.key);
            }}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 8,
              borderRadius: 16,
              backgroundColor: focused ? colors.yellow : 'transparent',
              borderWidth: focused ? 2 : 0,
              borderColor: colors.ink,
            }}
          >
            <View>
              <Ionicons name={focused ? m.icon : (`${m.icon}-outline` as IconName)} size={fs(24)} color={colors.ink} />
              {m.badge ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -12,
                    minWidth: 20,
                    height: 20,
                    paddingHorizontal: 4,
                    borderRadius: 10,
                    backgroundColor: colors.danger,
                    borderWidth: 2,
                    borderColor: colors.ink,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Txt v="small" color="white" style={{ fontSize: 11, lineHeight: 13, fontWeight: '900' }}>
                    {m.badge}
                  </Txt>
                </View>
              ) : null}
            </View>
            <Txt v="small" style={{ marginTop: 2, fontWeight: focused ? '900' : '700' }} lines={1}>
              {m.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
