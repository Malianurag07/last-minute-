import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import React, { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '../state/store';
import { border, colors, shadowOffset, type ColorName, type TypeVariant } from '../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const tap = () => {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

/* ------------------------------------------------------------------ text */

const weights: Record<TypeVariant, TextStyle['fontWeight']> = {
  display: '900',
  h1: '900',
  h2: '800',
  h3: '800',
  body: '500',
  label: '700',
  small: '600',
};

export function Txt({
  v = 'body',
  color = 'ink',
  style,
  children,
  center,
  lines,
  role,
  live,
}: {
  v?: TypeVariant;
  color?: ColorName;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  center?: boolean;
  lines?: number;
  /** 'heading' exposes the text as a heading to screen readers */
  role?: 'heading';
  /** announce changes (errors, status) to screen readers */
  live?: boolean;
}) {
  const { fs } = useStore();
  const size = fs(v);
  return (
    <Text
      numberOfLines={lines}
      accessibilityRole={role === 'heading' || v === 'h1' || v === 'display' ? 'header' : live ? 'alert' : undefined}
      accessibilityLiveRegion={live ? 'polite' : undefined}
      maxFontSizeMultiplier={1.6}
      style={[
        {
          color: colors[color],
          fontSize: size,
          lineHeight: Math.round(size * (v === 'display' || v === 'h1' ? 1.12 : 1.35)),
          fontWeight: weights[v],
          letterSpacing: v === 'display' || v === 'h1' ? -0.6 : 0,
          textAlign: center ? 'center' : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------- surfaces */

/** A bordered box with the signature hard offset shadow. */
export function Card({
  children,
  bg = 'white',
  style,
  inner,
  offset = shadowOffset,
  radius = border.radius,
}: {
  children: React.ReactNode;
  bg?: ColorName;
  style?: StyleProp<ViewStyle>;
  inner?: StyleProp<ViewStyle>;
  offset?: number;
  radius?: number;
}) {
  return (
    <View style={[{ paddingRight: offset, paddingBottom: offset }, style]}>
      <View style={[StyleSheet.absoluteFill, { top: offset, left: offset, backgroundColor: colors.ink, borderRadius: radius }]} />
      <View
        style={[
          { backgroundColor: colors[bg], borderWidth: border.width, borderColor: colors.ink, borderRadius: radius },
          inner,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

/** Pressable card that "sinks" into its shadow when pressed. */
export function PressCard({
  children,
  bg = 'white',
  style,
  inner,
  onPress,
  disabled,
  offset = shadowOffset,
  radius = border.radius,
  accessibilityLabel,
  ...rest
}: {
  children: React.ReactNode;
  bg?: ColorName;
  style?: StyleProp<ViewStyle>;
  inner?: StyleProp<ViewStyle>;
  offset?: number;
  radius?: number;
} & Omit<PressableProps, 'style' | 'children'>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={(e) => {
        tap();
        onPress?.(e);
      }}
      style={[{ paddingRight: offset, paddingBottom: offset, opacity: disabled ? 0.45 : 1 }, style]}
      {...rest}
    >
      {({ pressed }) => (
        <>
          <View style={[StyleSheet.absoluteFill, { top: offset, left: offset, backgroundColor: colors.ink, borderRadius: radius }]} />
          <View
            style={[
              {
                backgroundColor: colors[bg],
                borderWidth: border.width,
                borderColor: colors.ink,
                borderRadius: radius,
                transform: pressed ? [{ translateX: offset - 1 }, { translateY: offset - 1 }] : [],
              },
              inner,
            ]}
          >
            {children}
          </View>
        </>
      )}
    </Pressable>
  );
}

/* --------------------------------------------------------------- buttons */

export function Btn({
  label,
  icon,
  onPress,
  bg = 'yellow',
  fg = 'ink',
  size = 'md',
  style,
  disabled,
  full = true,
}: {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  bg?: ColorName;
  fg?: ColorName;
  size?: 'md' | 'lg' | 'xl';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  full?: boolean;
}) {
  const { fs, easyMode } = useStore();
  const big = easyMode && size === 'md' ? 'lg' : size;
  const h = big === 'xl' ? 76 : big === 'lg' ? 64 : 54;
  return (
    <PressCard
      bg={bg}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={[full ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }, style]}
      inner={{ minHeight: h, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, gap: 10 }}
    >
      {icon ? <Ionicons name={icon} size={fs(big === 'xl' ? 28 : 22)} color={colors[fg]} /> : null}
      <Txt v={big === 'xl' ? 'h2' : 'h3'} color={fg} style={{ flexShrink: 1 }}>
        {label}
      </Txt>
    </PressCard>
  );
}

/** Square icon button used in the top bar (settings, search…). */
export function IconBtn({
  icon,
  onPress,
  bg = 'white',
  label,
  badge,
}: {
  icon: IconName;
  onPress?: () => void;
  bg?: ColorName;
  label: string;
  badge?: number;
}) {
  return (
    <PressCard
      bg={bg}
      onPress={onPress}
      accessibilityLabel={label}
      offset={4}
      radius={12}
      inner={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={icon} size={26} color={colors.ink} />
      {badge ? (
        <View style={s.badge}>
          <Text style={s.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </PressCard>
  );
}

/** Coloured rounded square holding an icon — the "folder icon" in the cards. */
export function IconBox({
  icon,
  bg = 'yellow',
  size = 56,
  color = 'ink',
}: {
  icon: IconName;
  bg?: ColorName;
  size?: number;
  color?: ColorName;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.2,
        borderWidth: border.width,
        borderColor: colors.ink,
        backgroundColor: colors[bg],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={size * 0.5} color={colors[color]} />
    </View>
  );
}

/**
 * The "collection folder" card from the reference design: a coloured tab
 * peeking out above a white card with an icon box, a meta line and a title.
 */
export function FolderCard({
  title,
  meta,
  meta2,
  icon,
  color,
  soft,
  onPress,
  badge,
  style,
}: {
  title: string;
  meta?: string;
  meta2?: string;
  icon: IconName;
  color: ColorName;
  soft?: ColorName;
  onPress?: () => void;
  badge?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <View style={[s.folderTab, { backgroundColor: colors[soft && color === 'yellow' ? 'yellowSoft' : color] }]}>
        <View style={[s.folderTabSlope, { backgroundColor: colors[soft && color === 'yellow' ? 'yellowSoft' : color] }]} />
      </View>
      <PressCard onPress={onPress} inner={{ padding: 14, minHeight: 150, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <IconBox icon={icon} bg={color} size={52} />
          <View style={{ flex: 1, paddingTop: 2 }}>
            {meta ? (
              <Txt v="small" color="muted">
                {meta}
              </Txt>
            ) : null}
            {meta2 ? (
              <Txt v="small" color="muted">
                {meta2}
              </Txt>
            ) : null}
            {badge ? <Badge label={badge} style={{ marginTop: 4 }} /> : null}
          </View>
        </View>
        <Txt v="h3" style={{ marginTop: 14 }} lines={2}>
          {title}
        </Txt>
      </PressCard>
    </View>
  );
}

export function Badge({ label, bg = 'pink', fg, style }: { label: string; bg?: ColorName; fg?: ColorName; style?: StyleProp<ViewStyle> }) {
  // dark backgrounds get white text, everything else ink — keeps contrast ≥ 4.5:1
  const text = fg ?? (['ink', 'danger', 'purple', 'blue', 'success'].includes(bg) ? 'white' : 'ink');
  return (
    <View style={[{ alignSelf: 'flex-start', backgroundColor: colors[bg], borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1.5, borderColor: colors.ink }, style]}>
      <Text style={{ color: colors[text], fontWeight: '900', fontSize: 12, letterSpacing: 0.4 }}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  icon,
  color = 'yellow',
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
  color?: ColorName;
}) {
  const { fs } = useStore();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: border.width,
        borderColor: colors.ink,
        backgroundColor: active ? colors[color] : colors.white,
      }}
    >
      {icon ? <Ionicons name={icon} size={fs(18)} color={colors.ink} /> : null}
      <Txt v="label">{label}</Txt>
      {active ? <Ionicons name="checkmark" size={fs(18)} color={colors.ink} /> : null}
    </Pressable>
  );
}

/* ----------------------------------------------------------------- input */

export function Field({
  icon = 'create-outline',
  style,
  right,
  ...props
}: TextInputProps & { icon?: IconName; right?: React.ReactNode }) {
  const { fs } = useStore();
  return (
    <Card style={style} inner={{ flexDirection: 'row', alignItems: props.multiline ? 'flex-start' : 'center', paddingHorizontal: 14, minHeight: 58, gap: 10 }}>
      <Ionicons name={icon} size={fs(22)} color={colors.ink} style={props.multiline ? { marginTop: 16 } : undefined} />
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        style={[
          {
            flex: 1,
            fontSize: fs('body'),
            fontWeight: '600',
            color: colors.ink,
            paddingVertical: 14,
            minHeight: props.multiline ? 96 : undefined,
            textAlignVertical: props.multiline ? 'top' : 'center',
          },
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
        ]}
      />
      {right}
    </Card>
  );
}

/** Big +/- stepper. Easier than typing numbers for many older users. */
export function Stepper({
  value,
  onChange,
  step = 10,
  min = 0,
  prefix = '₹',
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <PressCard
        accessibilityLabel="Decrease"
        offset={3}
        radius={10}
        bg="white"
        onPress={() => onChange(Math.max(min, value - step))}
        inner={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="remove" size={26} color={colors.ink} />
      </PressCard>
      <View style={{ minWidth: 86, alignItems: 'center' }}>
        <Txt v="h2">
          {prefix}
          {value}
          {suffix ? ` ${suffix}` : ''}
        </Txt>
      </View>
      <PressCard
        accessibilityLabel="Increase"
        offset={3}
        radius={10}
        bg="yellow"
        onPress={() => onChange(value + step)}
        inner={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="add" size={26} color={colors.ink} />
      </PressCard>
    </View>
  );
}

/* ---------------------------------------------------------------- layout */

export function Screen({
  children,
  scroll = true,
  bg = 'paper',
  footer,
  pad = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  bg?: ColorName;
  footer?: React.ReactNode;
  pad?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const content = (
    <View style={{ paddingHorizontal: pad ? 20 : 0, paddingTop: insets.top + 12, paddingBottom: footer ? 24 : insets.bottom + 110, gap: 18 }}>
      {children}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors[bg] }}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
      {footer ? (
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: insets.bottom + 14,
            borderTopWidth: border.width,
            borderColor: colors.ink,
            backgroundColor: colors.paper,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function Row({ children, style, gap = 12 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h2" style={{ flexShrink: 1 }}>
          {title}
        </Txt>
        {action ? (
          <Pressable onPress={onAction} accessibilityRole="button" hitSlop={10}>
            <Txt v="label" style={{ textDecorationLine: 'underline' }}>
              {action}
            </Txt>
          </Pressable>
        ) : null}
      </Row>
      {children}
    </View>
  );
}

/** Two-column grid that keeps cards equal width. */
export function Grid({ children, cols = 2, gap = 14 }: { children: React.ReactNode; cols?: number; gap?: number }) {
  const items = React.Children.toArray(children);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return (
    <View style={{ gap }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap }}>
          {r.map((c, j) => (
            <View key={j} style={{ flex: 1 }}>
              {c}
            </View>
          ))}
          {r.length < cols ? Array.from({ length: cols - r.length }).map((_, k) => <View key={`f${k}`} style={{ flex: 1 }} />) : null}
        </View>
      ))}
    </View>
  );
}

export function Stars({ value, size = 16, onChange }: { value: number; size?: number; onChange?: (n: number) => void }) {
  return (
    <Row gap={onChange ? 8 : 2}>
      {[1, 2, 3, 4, 5].map((n) => {
        const name: IconName = value >= n ? 'star' : value >= n - 0.5 ? 'star-half' : 'star-outline';
        const icon = <Ionicons name={name} size={size} color={value >= n - 0.5 ? colors.orange : colors.muted} />;
        return onChange ? (
          <Pressable key={n} onPress={() => (tap(), onChange(n))} accessibilityRole="button" accessibilityLabel={`${n} stars`} hitSlop={6}>
            {icon}
          </Pressable>
        ) : (
          <View key={n}>{icon}</View>
        );
      })}
    </Row>
  );
}

export function Divider() {
  return <View style={{ height: border.width, backgroundColor: colors.ink, opacity: 0.12, borderRadius: 2 }} />;
}

export function Empty({ icon, title, sub }: { icon: IconName; title: string; sub?: string }) {
  return (
    <Card inner={{ padding: 24, alignItems: 'center', gap: 10 }}>
      <IconBox icon={icon} bg="greySoft" size={64} />
      <Txt v="h3" center>
        {title}
      </Txt>
      {sub ? (
        <Txt color="muted" center>
          {sub}
        </Txt>
      ) : null}
    </Card>
  );
}

/* --------------------------------------------------------------- speech */

/**
 * Reads the given text aloud. Shown prominently on provider screens so
 * people who struggle to read small text can still follow along.
 */
export function SpeakBtn({ text, compact }: { text: string; compact?: boolean }) {
  const { lang, t, fs } = useStore();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => void Speech.stop(), []);
  const go = () => {
    tap();
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(text, {
      language: lang === 'hi' ? 'hi-IN' : 'en-IN',
      rate: 0.9,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };
  return (
    <Pressable
      onPress={go}
      accessibilityRole="button"
      accessibilityLabel={t('readAloud')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        borderWidth: border.width,
        borderColor: colors.ink,
        borderRadius: 999,
        paddingHorizontal: compact ? 10 : 14,
        minHeight: 40,
        backgroundColor: speaking ? colors.purple : colors.purpleSoft,
      }}
    >
      <Ionicons name={speaking ? 'stop' : 'volume-high'} size={fs(18)} color={speaking ? colors.white : colors.ink} />
      {!compact ? (
        <Txt v="label" color={speaking ? 'white' : 'ink'}>
          {t('readAloud')}
        </Txt>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  folderTab: {
    height: 22,
    width: '55%',
    marginLeft: 12,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 4,
    borderWidth: border.width,
    borderBottomWidth: 0,
    borderColor: colors.ink,
    marginBottom: -border.width,
  },
  folderTabSlope: {
    position: 'absolute',
    right: -14,
    top: 6,
    width: 18,
    height: 18,
    borderTopWidth: border.width,
    borderColor: colors.ink,
    transform: [{ rotate: '45deg' }],
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontWeight: '900', fontSize: 12 },
});
