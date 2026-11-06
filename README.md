<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/4297ec2b-e2c4-423c-90bd-213adb9c268f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## Build for YouTube Playables

This project has a separate Playables build target. It keeps the normal standalone/Yandex build intact.

1. Install dependencies with `npm install`.
2. Run `npm run build:playables`.
3. Upload the generated `dist/` folder contents as a ZIP in the YouTube Playables Developer Portal (when your channel has access).

The Playables build injects the official YouTube Playables SDK before the app code and excludes the Yandex SDK and third-party ad-network script. The app includes the Playables ready, pause/resume, audio, cloud-save, and score API integrations. In the Playables environment, the existing storage helpers use in-memory state only; progress persistence is routed through the YouTube cloud-save API. Cloud saves are disabled until loadData() has completed successfully, as required by the SDK.

Important: a successful local build is not certification. This source bundle has not been built in this environment because package installation could not complete; run the build and resolve any reported errors before submission. Run Google's Playables Test Suite and complete the Developer Portal review. Portal access is currently private-preview/invitation-only.

See `PLAYABLES_SUBMISSION_CHECKLIST.md` for the remaining validation and submission steps.
