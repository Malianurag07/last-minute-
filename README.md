# LastMinute

**Need it now? Get it done.** LastMinute connects people who need something done *today* with skilled people who work from home and are hard to find: tailors, home cooks, bakers, mehendi artists, ironing, shoe & bag repair, beauty at home, flowers & gifts, tuition and small electronics repair. It compares **Rapido, Porter, Uber and Ola** to move the item, and is designed for older providers who are new to smartphones.

## What's in this repo

| Folder | What it is |
|---|---|
| `src/` | Mobile app (Expo / React Native, Android + iOS + web) |
| `server/` | Secure API: the single source of truth for accounts, shops, orders and admin actions |
| `admin-web/` | Super Admin web console (served by the API at `/console`) |
| `docs/security/` | Security architecture, threat model, incident-response runbook |
| `docs/compliance/` | DPDP Act 2023 map, ISO 27001 readiness, WCAG 2.2 AA report |
| `docs/business/` | Business model & unit economics, strategic marketing plan |
| `videos/` | Investor pitch, Instagram Reel and partner-recruitment videos (+ scripts and the code that renders them) |

## Two ways the app runs

- **Offline demo (default):** no server needed; sample data lives on the phone. Good for showing the product. Demo PIN **2580** — customer `9000012345`, provider `9820011111`.
- **Live mode:** build with `EXPO_PUBLIC_API_URL=https://your-api` and every account, order, price and permission lives on the server. The phone keeps only display settings and a session token in the Android Keystore / iOS Keychain. **Use live mode for real users** — on-device data can always be edited by whoever holds the phone.

## Features

**Customers:** search & categories, "ready within 2 hours" filter, verified providers with real reviews, booking with deadline + rush-fee warning, delivery partner comparison (reliability-first ranking) and hand-off to the partner app, live order tracking, reviews, saved providers.

**Providers:** 5-step sign-up (one question per screen, picture tiles, ready-made services, prices set with big +/−), huge Accept / Decline, read-aloud of every order, Easy mode, Hindi, dashboard (visits, earnings after commission, acceptance, ratings), collaboration requests with other providers, shop editor.

**Privacy (DPDP Act):** plain-language notice in English & Hindi before sign-up, 18+ check, separate consents (marketing optional), Privacy Centre to download / correct / delete data, withdraw consent, add a nominee and raise grievances.

**Admin (web console only):** password + authenticator-app 2FA, least-privilege roles, verify/suspend providers, cancel orders, block users, moderate reviews, handle privacy requests, breach register, tamper-evident audit log, admin account management.

## Money rules (same in app and server)

12% commission on the service price (5% in a provider's first 3 months) · 20% of the rush fee (provider keeps 80%) · ₹9 convenience fee per order · delivery paid directly to the delivery partner. Details: `docs/business/BUSINESS_MODEL.md`.

## Run it

```bash
# app (offline demo)
npm install
npx expo start                     # a = Android, i = iOS, w = web

# server + admin console (development)
cd admin-web && npm install && npm run build   # build the console once
cd server && npm install && npm start          # http://localhost:8787, console at /console

# app against the local server
EXPO_PUBLIC_API_URL=http://localhost:8787 npx expo start
```

Dev server demo data: users' PIN **2580**; admin `superadmin` / temporary password `Demo-Temp-Pass-2026` (you must set up 2FA and change it on first login). In production, demo data is refused — create the first admin with `npm run admin:create -- <name>`.

## Quality checks

```bash
npx tsc --noEmit && npx expo lint      # app
cd server && npm test                  # 32 security tests
cd server && npm run typecheck
cd admin-web && npm run build          # typecheck + build
```

End-to-end browser tests (Playwright) cover the app in demo and live mode and the admin console, including an axe WCAG 2.2 AA scan of 27 screens with zero violations.

## Build an Android APK

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
# → android/app/build/outputs/apk/release/app-release.apk
```

Needs JDK 17 and the Android SDK, or use EAS: `npx eas-cli@latest build -p android --profile preview`. The local release build is signed with the debug key — fine for installing by hand; use your own upload key for the Play Store.

## Before launch

See `docs/security/README.md` (deployment checklist), `docs/compliance/DPDPA.md` ("Still to do outside the code") and `docs/compliance/ISO27001.md`. In short: host the API on HTTPS in India with managed Postgres and a secret manager, plug in a DLT-registered SMS provider, appoint a Grievance Officer, get a lawyer to review the privacy texts, run an external penetration test, and test with TalkBack/VoiceOver users.
