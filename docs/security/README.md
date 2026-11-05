# LastMinute — Security architecture & threat model

**Goal:** nobody — not a customer, a provider, a curious employee, or an attacker with a stolen phone — can read data they shouldn't, change prices, fake orders/reviews, or act as an admin.

## 1. The rule: the server decides everything

The first prototype kept all data and the admin login on the phone, so anyone could edit the phone's storage and become admin. That design was removed:

| Before (prototype) | Now |
|---|---|
| Accounts, orders, admin password in phone storage | All data in the **server database**. In live mode the phone keeps only display settings and a session token. |
| Prices computed in the app | **Server computes every rupee** (service price, rush fee, delivery fee, commission). Extra fields from the app are rejected. |
| In-app admin panel (`admin / Admin@123`) | Removed. Admin uses a **separate web console** with password + authenticator-app 2FA. |
| Order status changed by anyone | **Server-side state machine** decides who can move an order to which step. |

```
 Phone app ──HTTPS──▶ API server (Fastify) ──▶ SQLite/Postgres (encrypted fields)
 Admin console ─HTTPS─┘   │ auth, RBAC, validation, audit chain
                          └──▶ SMS gateway (OTP)   (delivery apps opened by deep link — no data sent by us)
```

## 2. Controls (what is implemented, with the file)

| Area | Control | Where |
|---|---|---|
| Login | Mobile OTP (6 digits, 5 min, 3 tries) + 4–6 digit PIN; PIN alone is not enough on a new phone | `server/src/routes/auth.ts` |
| Brute force | Escalating lockout after 5 wrong PINs; per-IP and per-number rate limits; same answer for unknown numbers (no account discovery); constant-time comparison | `auth.ts`, `crypto.ts` |
| Weak secrets | Easy PINs (1234, 1111, years…) refused; admin passwords ≥12 chars, not containing the username | `domain.ts` |
| Password storage | scrypt (N=2¹⁵, 32 MiB) with random salt | `crypto.ts` |
| Sessions | 15-min access JWT (HS256 pinned, issuer/audience checked); 30-day rotating refresh tokens stored hashed; **reuse of a stolen refresh token revokes the whole session family**; logout/block take effect instantly (token version + live session check) | `tokens.ts`, `app.ts` |
| Admin | Password + TOTP (RFC 6238) with **replay protection**; forced password change on first login; 30-min idle timeout; refresh token in **HttpOnly, SameSite=Strict, path-scoped cookie**; optional IP allow-list | `routes/admin.ts`, `config.ts` |
| Least privilege | Roles `super_admin`, `ops`, `support`, `auditor`; every admin API checks a permission; there must always be ≥1 active super admin | `app.ts` (`PERMISSIONS`) |
| Authorisation | Object-level checks: you only see your orders / your shop; other users get **404** (no hint the record exists) | `routes/orders.ts`, `routes/shop.ts` |
| Mass assignment | Every request body is a strict schema (zod `.strict()`): unknown fields like `verified`, `rating`, `price` are rejected | all routes |
| Personal data at rest | AES-256-GCM per field, IV per value, **bound to its row** (AAD) so ciphertext can't be copied between users; phone lookup via HMAC blind index; key rotation (`DATA_KEY_PREV`) | `crypto.ts`, `db.ts` |
| Data minimisation | Providers see the customer's number/address **only while the order is active**; staff see masked numbers; revealing one needs a reason and is logged | `orders.ts`, `admin.ts` |
| Audit | Append-only (DB triggers block UPDATE/DELETE) **and** HMAC hash chain — any edit is detected by *Verify integrity* | `audit.ts` |
| Transport & browser | HSTS (prod), strict CSP (`default-src 'self'`, no inline script), `frame-ancestors 'none'`, nosniff, no-referrer, `Cache-Control: no-store`, CORS allow-list | `app.ts` |
| Errors & logs | No stack traces to clients; logs redact PIN, OTP, passwords, tokens, phone | `app.ts` |
| Fail closed | Production refuses to start without secrets, with the console SMS sender, or without a CORS allow-list | `config.ts` |
| Mobile | Tokens in Android Keystore / iOS Keychain (`expo-secure-store`, this-device-only); HTTPS enforced in release builds; unused Android permissions blocked; web build keeps tokens in memory only | `src/lib/api.ts`, `app.json` |
| Retention | Daily sweep deletes expired OTPs/tokens, removes order contact details 90 days after completion, drops stale devices | `retention.ts` |

## 3. Proven by tests

`cd server && npm test` — **32 automated security tests**, including:

- forged JWT, `alg: none` token, user token on admin API → all rejected
- stolen refresh token replay → whole family revoked, user signed out everywhere
- user B reads/cancels user A's order → 404
- customer accepts/completes own order, provider skips steps → refused
- client sends `price: 1` → rejected; server price used
- provider sets own shop `verified: true` → rejected
- 5 wrong PINs → locked even with the right PIN; 6th SMS request from one IP → 429
- admin TOTP replay → refused; support role can't verify/suspend/see audit/reveal phone
- someone with raw database access drops the trigger and edits an audit row → **chain check reports the exact row**
- database dump contains no phone numbers, names or PINs in clear
- erasure wipes personal data but keeps the tax record

Browser tests (Playwright) additionally cover the admin console (20 checks) and the app in demo and live mode (37–38 checks).

## 4. Threat model (STRIDE)

| Threat | Example | Mitigation |
|---|---|---|
| **S**poofing | Someone guesses a PIN | OTP on new devices, lockout, rate limits, weak-PIN list |
| | Attacker steals an admin password | TOTP 2FA, IP allow-list option, alerts via audit |
| **T**ampering | Modified app sends cheaper price / fake status | Server-side pricing + state machine + strict schemas |
| | Insider edits the audit trail | Triggers + HMAC chain + integrity check |
| **R**epudiation | Admin denies suspending a shop | Every admin action needs a written reason, logged with hashed IP |
| **I**nformation disclosure | DB backup leaks | Field encryption, blind index, keys outside the DB |
| | Provider keeps harvesting customer numbers | Numbers hidden after order completion |
| | XSS in console steals session | Strict CSP, React escaping, HttpOnly refresh cookie, memory-only access token |
| **D**enial of service | OTP/SMS pumping (costly) | Per-IP + per-number OTP limits, body size limit, global rate limit; add WAF/CDN in prod |
| **E**levation of privilege | Support staff calls super-admin API | Permission check on every route, role from DB not token |

## 5. Before going live (deployment checklist)

- [ ] Run the API behind HTTPS (TLS 1.2+) on a managed host in India; set `TRUST_PROXY=1` behind a load balancer.
- [ ] Generate secrets with `npm run keys` and store them in a secret manager (never in git). Rotate yearly.
- [ ] Move from SQLite to managed Postgres with encrypted, tested daily backups (the schema is portable).
- [ ] Plug a DLT-registered SMS provider in `server/src/sms.ts`.
- [ ] Create the first super admin with `npm run admin:create -- <name>`; turn on `ADMIN_IP_ALLOWLIST`.
- [ ] Add a WAF/CDN (e.g. Cloudflare) with bot protection on `/v1/auth/*`.
- [ ] Ship logs to a SIEM; alert on `refresh_token_reuse_detected`, admin lockouts and `audit verify` failures.
- [ ] Mobile: Play Integrity / App Attest, certificate pinning (optional), Play App Signing with your own upload key.
- [ ] Independent penetration test (OWASP ASVS L2 + MASVS L1) before public launch, then yearly.
- [ ] Dependency scanning (`npm audit`, Dependabot) in CI.

**Honest limits:** no system is "unbreakable". These controls follow OWASP ASVS/MASVS practice and make attacks hard, visible and contained; the checklist above plus an external pentest are what turn this into production-grade security.
