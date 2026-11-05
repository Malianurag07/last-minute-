/**
 * Neo-brutalist design tokens.
 * Thick ink outlines, hard offset shadows, bold flat colours on a warm paper background.
 * Contrast is kept high on purpose — many of our service providers are older and
 * may have weaker eyesight.
 */
export const colors = {
  ink: '#111111',
  paper: '#FBF8F1',
  white: '#FFFFFF',
  muted: '#55524B',
  line: '#E4DFD3',

  yellow: '#FFD21F',
  yellowSoft: '#FFE9A3',
  pink: '#FF4F7B',
  pinkSoft: '#FFC9D6',
  purple: '#7B61FF',
  purpleSoft: '#D9D1FF',
  green: '#2DBE3A',
  greenSoft: '#C9F2C2',
  lime: '#A6E22E',
  orange: '#FF8A1F',
  orangeSoft: '#FFD8B0',
  blue: '#2F7BFF',
  blueSoft: '#CFE0FF',
  grey: '#9A9A9A',
  greySoft: '#E6E6E6',

  danger: '#E5262E',
  success: '#1E9E2C',
} as const;

export type ColorName = keyof typeof colors;

export const border = {
  width: 2.5,
  radius: 14,
  radiusLg: 20,
} as const;

export const shadowOffset = 5;

export const space = (n: number) => n * 4;

/** Base font sizes. Every size is multiplied by the user's chosen text scale. */
export const type = {
  display: 38,
  h1: 28,
  h2: 22,
  h3: 18,
  body: 16,
  label: 15,
  small: 13,
} as const;

export type TypeVariant = keyof typeof type;
