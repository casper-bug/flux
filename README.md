<div align="center">
  <img src="logo.svg" alt="Flux Logo" width="120" height="120">
  <h1>Flux — Personal Workspace</h1>
  <p><strong>A minimalist, cross-device file and link dropping PWA powered by your own Google Drive.</strong></p>
</div>

<br>

## 🚀 Overview

**Flux** is an ultra-minimalist, Nothing-inspired Progressive Web App (PWA) designed for frictionless file and link transfers across all your devices. Instead of relying on third-party servers, Flux securely connects directly to your personal Google Drive, giving you a private workspace that you fully control.

## ✨ Features

- **⚡ Omni-Dropzone:** A single unified input field for pasting links or dragging and dropping files and folders.
- **☁️ Zero-Server Backend:** All data stays within your personal Google Drive. Every file uploaded and link saved is stored securely in a dedicated `FluxSpace` folder in your Drive root.
- **🔒 Secure Architecture:** Flux requests strictly limited `drive.file` permissions, meaning it can only access files it creates. It cannot read your personal documents.
- **📱 PWA Ready:** Installable on iOS, Android, macOS, and Windows for a native, app-like experience with offline caching.
- **🎨 Aesthetics:** Built with a beautiful monotone design language, `Space Mono` typography, and smooth glass-morphism blur effects.
- **📋 Auto-Copy Links:** Seamlessly sync links between devices with automatic clipboard copying as soon as the app opens.

## 🛠️ Setup & Deployment

Because Flux uses a serverless architecture powered by the Google Drive API, you must configure your own **Google OAuth Client ID** to deploy your own instance.

### 1. Configure Google Cloud Console
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Navigate to **APIs & Services > Library** and enable the **Google Drive API**.
4. Go to **OAuth consent screen** and configure it for "External" (or "Internal" if you have a Google Workspace). 
   - *Important:* If your publishing status is "Testing", you must add your Google email to the **Test users** list.
   - You must request the `../auth/drive.file` and `../auth/userinfo.profile` scopes.
5. Go to **Credentials > Create Credentials > OAuth client ID**.
   - Application type: **Web application**.
   - Add your local testing URL (e.g., `http://localhost:5500`) and your production URL (e.g., `https://your-username.github.io`) to the **Authorized JavaScript origins**.
6. Copy the generated **Client ID**.

### 2. Update the Code
Open `app.js` and replace the `CLIENT_ID` constant with your actual Client ID at the very top of the file:
```javascript
const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
```

### 3. Deploy
Host the repository on any static hosting provider like **GitHub Pages**, Vercel, or Netlify. 
*Note: Service Workers and PWAs strictly require the site to be served over a secure `HTTPS` connection to install.*

## 💻 Tech Stack
- HTML5 / CSS3 (Vanilla)
- Vanilla JavaScript (ES6)
- Google Identity Services (GIS)
- Google Drive API v3
- Material Symbols

