import { randomBytes } from 'node:crypto';

/** Unguessable ids (so knowing one order id never lets you guess another). */
export const newId = (prefix: string) => `${prefix}_${randomBytes(12).toString('base64url')}`;
