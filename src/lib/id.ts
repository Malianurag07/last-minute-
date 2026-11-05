let n = 0;
/** Unique id, safe even when called several times in the same millisecond. */
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(n++).toString(36)}`;
