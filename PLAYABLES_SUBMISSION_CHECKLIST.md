# Don't Touch the Red — YouTube Playables submission checklist

## Current status

- [x] Separate Vite build mode for YouTube Playables (`npm run build:playables`).
- [x] Official YouTube SDK script is injected before the app entry point in Playables mode.
- [x] Yandex SDK and the existing third-party ad-network script are excluded from the Playables build.
- [x] `firstFrameReady()` and `gameReady()` integration.
- [x] Host audio preference integration (`isAudioEnabled`, `onAudioEnabledChange`).
- [x] Host pause/resume callbacks; game simulation pauses on host pause.
- [x] YouTube cloud save/load adapter; saving is blocked until `loadData()` succeeds.
- [x] Playables progress helpers use in-memory state, with persistence routed through YouTube cloud save APIs.
- [x] Best score, rather than the last run score, is sent to YouTube.
- [ ] Install dependencies and complete a production build.
- [ ] Run Google's Playables SDK Test Suite and fix every failure.
- [ ] Test on desktop web, mobile web, YouTube Android, and YouTube iOS.
- [ ] Complete IARC age rating.
- [ ] Submit for review in the Playables Developer Portal after access is granted.

## Build

```bash
npm install
npm run build:playables
```

The resulting `dist/` folder is the web build. Zip the **contents** of `dist/` so that `index.html` is at the ZIP root. Do not upload the source project ZIP as the playable bundle.

## Official documentation

- https://developers.google.com/youtube/gaming/playables
- https://developers.google.com/youtube/gaming/playables/reference/sdk
- https://developers.google.com/youtube/gaming/playables/developer_portal
- https://developers.google.com/youtube/gaming/playables/support/faq

Developer Portal access is currently private preview / invitation-only. Passing a local build or SDK test does not guarantee certification or publication.
