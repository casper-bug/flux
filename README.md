<p align="center">
  <img src="logo.svg" width="120" height="120" alt="Flux Logo">
</p>

# FLUX DROP (v41)
### Personal Cross-Device Synchronization Engine


**Flux** is a professional-grade, privacy-first PWA designed for seamless file and link sharing across all your devices. Powered entirely by your personal **Google Drive**, Flux provides a high-performance, "zero-snap" experience without the need for a dedicated backend.

---

## 🚀 Key Features

### 📦 Storage & Reliability
- **Resumable Upload Engine**: Upgraded XHR protocol for stable large-file transfers on unstable networks.
- **Intelligent Conflict Intelligence**: Automated "Replace" or "Keep Both" resolution for filename collisions.
- **Storage Dashboard**: Real-time visualization of Google Drive quota, with color-coded breakdown (Flux vs. Other vs. Free).
- **Auto-Cleanup Engine**: Configurable maintenance to automatically purge items older than 1, 7, or 30 days.


### 🔐 Security & Identity
- **Biometric App Lock**: WebAuthn integration for Fingerprint or FaceID protection.
- **Device Identity**: Customizable device naming—every share shows exactly which device sent it.
- **Privacy-First**: All data stays within your `FluxSpace` folder in your private Google Drive.
- **Hardened CSP**: Strict Content Security Policy protecting against XSS and unauthorized data exfiltration.

### 📱 PWA Integration
- **System Share Target**: Appear directly in the Android/iOS share menu to "Drop" files into Flux.
- **Smart Clipboard**: Automatic detection and auto-copy for OTPs, passwords, and links.
- **Offline Resilience**: Service Worker caching for instant load times and update notifications.

---

## 🛠 Tech Stack
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Backend**: Google Drive API v3 (`drive.file` scope).
- **Identity**: Google Identity Services (GIS).
- **Architecture**: Performance-optimized with `DocumentFragment` batching and throttled event listeners.

---

## 📦 Getting Started
1. Clone the repository to a web server.
2. Update the `CLIENT_ID` in `app.js` with your Google Cloud Console ID.
3. Access Flux via HTTPS for full PWA and Biometric support.

---
**Version**: 41.0.0  
**Aesthetic**: Mono / Minimalist  
**Developer**: Antigravity AI
