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

## Delivery partners

`src/lib/delivery.ts` estimates fares from each partner's published base fare and per-km rate (with a peak-hour surge) and ranks them with a last-minute score: 50% reliability, 30% price, 20% speed. None of these partners offers a public booking API. So booking copies the pickup and drop addresses to the clipboard and opens the partner app through a deep link, falling back to its website. Replace the estimator with real partner APIs when you have business access.

## Run it

```bash
npm install
npx expo start        # press a (Android), i (iOS) or w (web)
npm run typecheck
```

## Structure

```
src/app/            Expo Router screens
  welcome.tsx       role picker, language and text size
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

Data lives on the device and is seeded with demo providers. Before launch you would add a backend (auth with phone OTP, provider listings, orders, push notifications for new orders), real geolocation and distance, payments (UPI), and partner API integrations.
