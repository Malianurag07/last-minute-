# WCAG 2.2 AA — accessibility conformance report

**Scope:** LastMinute mobile app (Android/iOS, tested through its web build) and the Super Admin console.
**Target:** WCAG 2.2 Level AA (also the basis of India's GIGW 3.0 and IS 17802).
**Result:** no automated violations on any tested screen; manual checks below. A formal claim of conformance still needs a manual audit with TalkBack/VoiceOver users (see "Still to do").

## Automated testing (axe-core, rules wcag2a/aa, wcag21a/aa, wcag22aa)

| Product | Screens scanned | Violations |
|---|---|---|
| Mobile app | Welcome, privacy notice/consent, SMS code, customer home, profile, provider profile, booking, order tracking, Privacy Centre, privacy policy, provider home, dashboard, partners, settings (15) | **0** |
| Admin console | Login, 2FA, overview, providers, orders, users, reviews, privacy requests, incidents, audit log, admin accounts, my account (12) | **0** |

Issues found by the first scan and fixed: missing `aria-checked` on switches/checkboxes, accessible names not containing visible text (2.5.3 Label in Name), tabs without a tablist, wrong autocomplete on the OTP field, a non-focusable scroll area, and colour pairs below 4.5:1 (white text on bright pink/green/purple/blue).

## Design choices for older and low-literacy users (beyond AA)

- Text size A / A+ / A++ and **Easy mode** (bigger buttons and text, simpler home screen); OS font scaling respected (capped to keep layouts usable).
- Every icon has a text label; touch targets ≥ 44 px (most 54–76 px); PIN on a 84×64 px keypad.
- **Read aloud** (text-to-speech) on key screens, in English or Hindi.
- One question per screen in sign-up; plain words; destructive actions ask "Yes / No, go back".
- Hindi interface; consistent position of Back (top-left) and the main action (bottom).
- No time limits on users except the 5-minute SMS code (they can request another).
- Errors are announced to screen readers (`alert`/live regions) and explain how to fix them.

## Manual checks done

- Keyboard-only use of the admin console (skip link, visible focus ring, native `<dialog>` focus trap, focus moves to the page title on navigation).
- Reflow at 320 px width (console sidebar collapses; app is single-column).
- `prefers-reduced-motion` respected in the console.

## Still to do (needed before claiming full conformance)

1. Screen-reader passes with real users on **TalkBack (Android)** and **VoiceOver (iOS)** — automated tools can't judge reading order and meaning.
2. Test with 200% system font size on small Android phones.
3. Captions and transcripts for marketing videos (the scripts in `videos/scripts` can be used as captions).
4. Publish an accessibility statement with a contact for feedback.
