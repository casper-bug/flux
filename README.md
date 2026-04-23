<div align="center">
  <img src="logo.svg" alt="Flux Logo" width="120" height="120">
  <h1>Flux — Personal Workspace</h1>
  <p><strong>A minimalist, cross-device content dropping portal powered by your own Google Drive.</strong></p>
</div>

<br>

## Overview

**Flux** is an ultra-minimalist Progressive Web App (PWA) designed for frictionless file, link, and text transfers across all your devices. Instead of relying on third-party servers, Flux securely connects directly to your personal Google Drive, giving you a private, private workspace that you fully control.

## Key Features

- **Instant Warm Start:** Advanced local caching allows the app to restore your session and profile information in milliseconds, making the transition from "Share" to "Sent" feel instantaneous.
- **Universal Share Target:** Integrates directly into your device's native share menu. Share files or text from any app (browser, gallery, etc.) directly into Flux without opening the app first.
- **Smart Text Handling:**
  - **OTP & Password Detection:** Intelligent recognition of 6-digit codes and passwords with **automatic clipboard copy** upon arrival.
  - **Auto-Sync Links:** Paste a link on your PC, and it's already copied to your mobile clipboard the moment you open the app.
- **File & Folder Drop:** A unified dropzone for dragging and dropping files or entire folder structures directly into your `FluxSpace` folder.
- **Zero-Server Backend:** All data stays within your personal Google Drive. Flux uses restricted `drive.file` permissions, meaning it can only see the data it creates.
- **Themed Experience:** A consistent, high-end visual language featuring Nothing-inspired mono aesthetics, Space Mono typography, and custom themed modals for a premium feel.

## 🛠️ Setup & Deployment

Because Flux uses a serverless architecture, you must configure your own **Google OAuth Client ID** to deploy your own instance.

### 1. Configure Google Cloud Console
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project and enable the **Google Drive API**.
3. Configure the **OAuth consent screen** (Internal for Workspace, External for personal accounts).
   - *Note:* Add your email to the **Test users** list if the status is "Testing".
   - Scopes required: `../auth/drive.file` and `../auth/userinfo.profile`.
4. Create an **OAuth client ID** (Web application).
   - Add your local and production URLs to **Authorized JavaScript origins**.
5. Copy the generated **Client ID**.

### 2. Update & Deploy
- Replace `CLIENT_ID` in `app.js` with your ID.
- Host on any static provider (GitHub Pages, Vercel, etc.). 
- *PWA features require an `HTTPS` connection to function.*

## 💻 Tech Stack
- HTML5 / Vanilla CSS
- JavaScript (ES6+) / Service Workers
- Google Drive API v3
- Google Identity Services (GIS)
- PWA Web Share Target API

## 📄 License
This project is open-source under the MIT License.
