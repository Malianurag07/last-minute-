# LastMinute

**Need it now? Get it done.** A mobile app (Expo / React Native) that connects people with an urgent job to skilled people who work from home and are hard to find: tailors, home cooks, bakers, mehendi artists, ironing, shoe & bag repair, beauty at home, flowers & gifts, tuition and small electronics repair.

## Who it's for

- **Customers** search for a nearby provider who can finish in time, pick a deadline, and choose how the item travels. The app compares **Rapido, Porter, Uber and Ola** on price, reliability and speed for the pickup and drop.
- **Service providers** (many of them older and new to smartphones) sign up in a few big steps. They get a simple home screen with large Accept / Decline buttons, a dashboard of profile visits, earnings and reviews, and a **Partners** tab for working with other providers.

## Accessibility for older providers

- Sign-up asks one question per screen, with a progress bar, picture tiles and ready-made service templates
- Prices are set with big **+ / –** steppers instead of typing
- **Read aloud** button (text-to-speech) on every key provider screen
- **Easy mode** with bigger buttons, bigger text and a simplified home screen
- Text size A / A+ / A++ and **Hindi / English**, offered on the very first screen
- Icons always have text labels, high-contrast colours and tap targets of 44 px or more
- Destructive actions ask for confirmation, and a helpline button is always visible

## Accounts & login

- Customers and providers sign in with their **mobile number + a 4-digit PIN**, typed on a big on-screen keypad. Sign-up asks for one thing per screen and makes you type the PIN twice. Very easy PINs like 1111 are refused.
- After 5 wrong PINs the number is locked for 5 minutes.
- PINs are stored only as salted SHA-256 hashes (`expo-crypto`).
- Demo accounts (PIN **1234**): customer `9000012345` (Priya), provider `9820011111` (Kamala's Silai). The welcome screen has one-tap "Demo customer" and "Demo shop" links.

## Admin panel

Open **Admin login** at the bottom of the welcome screen, or go to `/admin`. Demo login: **admin / Admin@123**. Change it in Admin → Settings.

| Section | What the admin can do |
|---|---|
| Overview | users, providers, orders, value of completed orders, active and late orders, items that need attention, orders by status, providers by category |
| Providers | search; verify or unverify (green tick); suspend, which hides the shop from customers, or restore |
| Orders | filter active, past-due or closed orders; cancel an order |
| Users | search; block (signs the user out and stops login) or unblock |
| Reviews | list reviews, filter to 3★ and below, remove abusive ones (the rating is recalculated) |
| Settings | change the admin password, log out, reset demo data |

## Delivery partners

`src/lib/delivery.ts` estimates fares from each partner's published base fare and per-km rate (with a peak-hour surge) and ranks them with a last-minute score: 50% reliability, 30% price, 20% speed. None of these partners offers a public booking API. So booking copies the pickup and drop addresses to the clipboard and opens the partner app through a deep link, falling back to its website. Replace the estimator with real partner APIs when you have business access.

## Run it

```bash
npm install
npx expo start        # press a (Android), i (iOS) or w (web)
npm run typecheck
npx expo lint
```

## Build an Android APK

The easiest way is EAS: `npx eas-cli@latest build -p android --profile preview` (needs a free Expo account).

To build locally you need JDK 17 and the Android SDK (`ANDROID_HOME`):

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
# → android/app/build/outputs/apk/release/app-release.apk
```

The release build is signed with the debug key, which is fine for installing by hand. Before publishing on Play Store, create your own upload key.

## Structure

```
src/app/            Expo Router screens
  welcome.tsx       role picker, language and text size, demo and admin links
  auth.tsx          login and sign-up (mobile + PIN keypad)
  admin/            admin login and admin panel
  c/                customer tabs: home, search, orders, profile
  p/                provider tabs: home, jobs, dashboard, partners
  join.tsx          provider sign-up wizard
  provider/[id]     provider profile (records a visit)
  book/[id]         booking + delivery comparison
  order/[id]        customer order tracking and review
  job/[id]          provider job screen + book the return rider
  shop.tsx          edit services, prices and hours
  settings.tsx
src/components/     neo-brutalist UI kit, cards, tab bar, delivery comparison
src/state/store.tsx app state (persisted with AsyncStorage)
src/data/           categories, types, seed data
src/lib/            delivery quotes, i18n, formatting, search
```

## Not built yet

Data lives **on the device** and is seeded with demo providers. Accounts, orders and admin actions are real inside one phone, but they are not shared between phones yet. Before launch you would add:
- a backend (phone OTP login, provider listings, orders, admin API) so customers, providers and the admin see the same data
- push notifications for new orders
- real location and distance
- UPI payments
- partner API integrations
