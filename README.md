# Snakebite Case Report: offline web app prototype

Hyam Institute of Technology · prototype version 2.2 · 23 October 2026

This is the global snakebite clinical case report form, turned into an installable web app (a progressive web app). It is meant as a working prototype for testing with clinicians, and as a starting point for the CLINICAL app.

## What it does now

* **Installs like an app.** On Android (Chrome) use "Install app"; on iPhone (Safari) use Share, then "Add to Home Screen". It opens full screen with its own icon.
* **Works with no connection.** After the first visit, a service worker caches the app, so it opens and works fully offline.
* **Saves reports on the device.** Submitted reports, including photographs, are stored in IndexedDB on the phone. The bar under the header shows Online / Offline and how many reports are waiting.
* **Never loses a half finished report.** The form saves a draft automatically as the clinician types, and restores it if the app is closed.
* **Cleans photographs on the device.** Every photo is re-encoded as a JPEG (maximum 2000 px), which removes GPS location and camera metadata before anything is stored. Tested: GPS data present in the original is absent in the stored copy.
* **Exports for testing.** "Saved reports" lists every report on the device. "Export all" downloads them as one JSON file, with photos embedded as data URLs.
* **Ready to send to a server.** Set `CONFIG.endpoint` at the top of `app.js` and pending reports are sent automatically whenever the device is online (see below).

## Files

| File | Purpose |
|---|---|
| `index.html` | The form (markup and styles) |
| `app.js` | All behaviour: form logic, drafts, storage, photo cleaning, sync, export |
| `sw.js` | Service worker for offline use |
| `manifest.webmanifest` | App name, colours and icons |
| `icons/` | App icons, including a maskable icon for Android |

## Running it

A service worker only runs over HTTPS (or on localhost), so open it through a web server, not by double clicking the file.

* **Locally:** in this folder run `python3 -m http.server 8000`, then open http://localhost:8000
* **For testers:** upload the folder to any static HTTPS host, for example GitHub Pages, Netlify or Cloudflare Pages. No build step is needed.

When `sw.js` or any app file changes, bump `CACHE` in `sw.js` (for example `hyam-case-report-v2`) so devices pick up the new version.

## Connecting a server

With `CONFIG.endpoint` set, each pending report is sent as `multipart/form-data` in a `POST`:

* `record`: the report as JSON (the same structure shown on the success screen)
* `bitePhoto_0`, `bitePhoto_1`, …: bite photographs as JPEG files (stage and days after bite are in `record.clinicalFeatures.bitePhotos`)
* `snakePhoto`: the snake photograph, if one was added

Any `2xx` response marks the report as Sent. Anything else leaves it pending and it is retried when the device next comes online or the app is opened.

The record keeps the clinician's details in a separate `clinicianIdentity` block so the server can store them apart from the case data.

## Limitations of the prototype (to resolve before real use)

1. **No server or accounts yet.** Anyone with the link can submit. Decide whether clinicians register and are approved first.
2. **Data on the device is not encrypted** beyond the phone's own protection. Consider encrypting reports at rest, and deleting them from the device once sent.
3. **iPhone storage.** Safari may clear stored data for a web app that is used in the browser but not added to the Home Screen and not opened for several weeks. Ask testers to add it to the Home Screen. A wrapped native build (for example Capacitor) removes this risk.
4. **No background sync.** Reports send when the app is open and online, not while it is closed.
5. **HEIC photos** (the iPhone default) are handled by Safari but may fail in some other browsers; the app shows a message if a photo cannot be read.
6. **Governance.** Before collecting real cases: UK GDPR and local data protection laws, where the data is hosted, and ethics approval where data will be used for published research.

## Suggested next steps

1. Host the prototype and let two or three clinicians try it on their own phones.
2. Choose a backend (for example Supabase or Firebase, in a suitable region) with separate storage for clinician identity.
3. Add clinician sign in and approval.
4. Wrap with Capacitor for the Apple and Google stores, alongside Project One.
