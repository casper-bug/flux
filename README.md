<p align="center">
  <img src="logo.svg" width="128" height="128" alt="Flux Logo">
</p>

# Flux

<p align="center">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome">
  <img src="https://img.shields.io/badge/PWA-ready-orange.svg" alt="PWA Ready">
  <img src="https://img.shields.io/badge/Google%20Drive-Sync-blue.svg" alt="Google Drive Sync">
</p>

A minimal, cross-device file and link synchronization PWA powered by Google Drive. Drop files from any device, pick them up on another — no accounts beyond your own Google account, no third-party storage.

---

## 🚀 Features

- **Drag & drop upload** — drag files or folders directly into the browser window
- **Link syncing** — paste any URL to save it across devices instantly
- **Concurrent uploads** — multiple files upload in parallel with individual progress bars
- **Conflict resolution** — detects duplicates and offers Replace, Keep Both, or Cancel
- **Instant delete** — smooth animated removal with Drive API confirmation
- **Offline-capable** — service worker caches the app shell for offline access
- **PWA installable** — add to home screen on Android/iOS/desktop
- **Share target** — appears in the system share sheet on Android
- **Google Drive storage** — all data lives in a `FluxSpace` folder in your own Drive; no server, no middleman

---

## 🛠 Tech Stack

<p align="left">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Google%20Drive%20API-4285F4?style=for-the-badge&logo=googledrive&logoColor=white" alt="Google Drive API">
</p>

---

## ⚙️ Setup

### 1. Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or select an existing one)
3. Enable the **Google Drive API** and **Google Identity Services**
4. Create an **OAuth 2.0 Client ID** (Web Application type)
5. Add your domain to **Authorized JavaScript Origins** (e.g. `https://yourdomain.com` or `http://localhost` for local dev)

### 2. Configure the App

Open `app.js` and replace the placeholder:

```js
const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';
```

with your actual Client ID.

### 3. Serve Over HTTPS

The app requires HTTPS for:
- Google OAuth (mandatory)
- Service Worker registration
- Web Share API
- Clipboard API

For local development, `http://localhost` works as an OAuth-trusted origin.

---

## 📂 File Structure

```
flux/
├── index.html       # App shell, all CSS
├── app.js           # All application logic
├── sw.js            # Service worker (caching, share target)
├── manifest.json    # PWA manifest
├── logo.svg         # Nav logo
└── icon.svg         # PWA icon (home screen)
```

---

## 🧠 How It Works

1. **Auth** — Google Identity Services issues a short-lived OAuth 2.0 access token scoped to `drive.file` (Flux can only see files it created)
2. **Folder** — On first run, a `FluxSpace` folder is created in your Drive; its ID is cached in `localStorage`
3. **Upload** — Files use the Drive resumable upload API for reliability; progress is tracked per-file via `XMLHttpRequest`
4. **Sync** — Pressing refresh (or on load) fetches all files in `FluxSpace` ordered by creation date
5. **Delete** — Items animate out before the Drive API call resolves; the DOM node is removed directly (no full re-render)

---

## 📝 Technical Notes

- **Rendering** — Uses a keyed DOM-diff renderer (`diffList`) instead of full innerHTML rebuilds, so uploads and deletions never cause full-page repaints
- **Token persistence** — Access tokens are stored in `localStorage` with expiry; the app auto-restores sessions within the token lifetime
- **Conflict detection** — Checked by filename against the current item list before upload begins
- **Share target** — Registered in `manifest.json`; the service worker intercepts `POST /share-target` and forwards data to the app

---

## 🔒 Privacy

All files are stored in **your own** Google Drive under a folder called `FluxSpace`. Flux uses the `drive.file` scope, which means it can only access files it created — not your entire Drive. No analytics, no tracking, no server.

---

## ⚖️ License

MIT — do whatever you like with it.
