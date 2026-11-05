import { randomBytes } from 'node:crypto';

// Prints fresh secrets for a .env / secret manager. Never commit the output.
for (const k of ['JWT_SECRET', 'DATA_KEY', 'INDEX_KEY', 'AUDIT_KEY']) console.log(`${k}=${randomBytes(32).toString('base64')}`);
