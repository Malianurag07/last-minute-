# Videos

Three launch videos, built from **real app screens** and rendered frame-by-frame with an original synthesised music bed.

| File | Format | Purpose |
|---|---|---|
| `out/LastMinute_Investor_Pitch.mp4` | 1920×1080, ~4:22 | Investor pitch + full product demo + business model |
| `out/LastMinute_Reel.mp4` | 1080×1920, 0:33 | Instagram Reels / YouTube Shorts / WhatsApp Status |
| `out/LastMinute_Become_A_Partner.mp4` | 1080×1920, 0:52 | Recruiting tailors, bakers, home cooks… (Hindi + English) |

Voiceover scripts: `scripts/`. The videos carry on-screen narration so they work muted (most Reels are watched without sound); record a voiceover on top for the pitch.

## Rebuild
```bash
npx expo export --platform web            # demo build of the app
npx serve dist -l 8099 --single           # or any static server with SPA fallback
node videos/capture.mjs http://localhost:8099 videos/frames/screens
node videos/render.mjs pitch   videos/out/LastMinute_Investor_Pitch.mp4
node videos/render.mjs reel    videos/out/LastMinute_Reel.mp4
node videos/render.mjs partner videos/out/LastMinute_Become_A_Partner.mp4
```
Needs ffmpeg, Python 3 + numpy, Playwright's Chromium and an emoji font. Edit scenes in `stage/*.html` (each element's motion is a pure function of time; preview stills with `--preview 10,20,30`).
