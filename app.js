/**
 * FLUX — Cross-device file and link dropping
 */

const CLIENT_ID = '771231099167-p1nj843lp8uga6inhhed5rmr7uiksms6.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file profile';
const FLUX_FOLDER_NAME = 'FluxSpace';

// ─── State ───────────────────────────────────────────────────
let accessToken = null;
let fluxFolderId = null;
let items = [];

// ─── DOM refs ────────────────────────────────────────────────
const _id = id => document.getElementById(id);
const overlay       = _id('overlay');
const overlaySignIn = _id('overlaySignIn');
const signInBtn     = _id('signInBtn');
const signOutBtn    = _id('signOutBtn');
const userAvatar    = _id('userAvatar');
const userName      = _id('userName');

const fileInput     = _id('fileInput');
const dropZone      = _id('dropZone');
const linkInput     = _id('linkInput');
const saveLinkBtn   = _id('saveLinkBtn');

const textList      = _id('textList');
const fileList      = _id('fileList');
const textSection   = _id('textSectionTitle');
const fileSection   = _id('fileSectionTitle');
const emptyState    = _id('emptyState');
const refreshBtn    = _id('refreshBtn');
const configBanner  = _id('configBanner');
const toast         = _id('toast');
const toastIcon     = _id('toastIcon');
const toastText     = _id('toastText');

const modalOverlay  = _id('modalOverlay');
const modalTitle    = _id('modalTitle');
const modalBody     = _id('modalBody');
const modalCancel   = _id('modalCancelBtn');
const modalConfirm  = _id('modalConfirmBtn');
const modalActions  = _id('modalActions');
const aboutLink     = _id('aboutLink');

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
      configBanner.style.display = 'block';
    }
    
    // Try to recover session immediately before GIS loads
    recoverSession();
    
    // Load cached items for instant UI
    loadCachedItems();
    
    loadGISScript();
  } catch (e) {
    console.error('Initialization error:', e);
  }
});

// ─── Authentication Recovery ─────────────────────────────────
function recoverSession() {
  const savedToken = localStorage.getItem('flux_token');
  const expiry = localStorage.getItem('flux_token_expiry');
  
  if (savedToken && expiry && Date.now() < parseInt(expiry, 10)) {
    accessToken = savedToken;
    
    // Hide overlay immediately
    overlay.classList.add('hidden');
    
    // Restore cached user info for instant UI feedback
    const cachedUser = localStorage.getItem('flux_user_info');
    if (cachedUser) {
      try {
        const info = JSON.parse(cachedUser);
        updateUserUI(info);
      } catch (e) { console.warn('Failed to parse cached user info'); }
    }
    
    // Start background tasks
    ensureFluxFolder().then(() => {
      loadItems();
      checkSharedData(); // Process shared data as soon as we have folder access
    });

    // Refresh user info in background
    fetchUserInfo();
  }
}

// ─── Google Identity Services ────────────────────────────────
function loadGISScript() {
  if (typeof google !== 'undefined') { initGIS(); return; }
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.onload = initGIS;
  s.onerror = () => showToast('Failed to load Google Sign-In', false);
  document.head.appendChild(s);
}

let tokenClient;
function initGIS() {
  if (CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') return;
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    setTimeout(initGIS, 500);
    return;
  }
  if (tokenClient) return; // Already initialized
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: handleTokenResponse,
  });
  
  // If we haven't recovered a session yet, check for flux_session flag
  if (!accessToken && localStorage.getItem('flux_session')) {
    // We could try silent auth here, but usually recoverSession handles it
  }
}

function signIn() {
  if (typeof google === 'undefined' || !google.accounts) {
    showToast('Loading Google Services...', true);
    loadGISScript();
    return;
  }
  
  if (!tokenClient) {
    initGIS();
  }
  
  if (!tokenClient) {
    showToast('Service not ready. Please try again in a moment.', false);
    return;
  }
  
  try {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } catch (e) {
    console.error('Sign-in error:', e);
    showToast('Login failed to open', false);
  }
}

function handleTokenResponse(resp) {
  if (resp.error) { showToast('Sign-in failed', false); return; }
  
  if (!google.accounts.oauth2.hasGrantedAllScopes(resp, 'https://www.googleapis.com/auth/drive.file')) {
    showToast('Drive permission missing', false);
    return;
  }
  
  accessToken = resp.access_token;
  localStorage.setItem('flux_session', '1');
  localStorage.setItem('flux_token', accessToken);
  localStorage.setItem('flux_token_expiry', Date.now() + (resp.expires_in * 1000) - 60000);
  fetchUserInfo();
  overlay.classList.add('hidden');
}

async function fetchUserInfo() {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!r.ok) {
       if (r.status === 401) signOut();
       return;
    }
    const info = await r.json();
    const oldInfo = localStorage.getItem('flux_user_info');
    localStorage.setItem('flux_user_info', JSON.stringify(info));
    
    const shouldShowWelcome = !oldInfo;
    updateUserUI(info, shouldShowWelcome);
    
    if (!fluxFolderId) {
      await ensureFluxFolder();
      loadItems();
      checkSharedData();
    }
  } catch(e) {
    console.error('Session error:', e);
  }
}

function updateUserUI(info, showWelcome = false) {
  const name = info.given_name || info.name || 'User';
  if (info.picture) {
    userAvatar.src = info.picture;
    userAvatar.style.display = 'block';
  } else {
    userAvatar.style.display = 'none';
  }
  userName.textContent = name;
  userName.style.display = 'block';
  signInBtn.style.display = 'none';
  signOutBtn.style.display = 'inline-flex';
  if (showWelcome) showToast('Welcome, ' + name, true);
}

function signOut() {
  if (accessToken) google.accounts.oauth2.revoke(accessToken);
  accessToken = null;
  fluxFolderId = null;
  localStorage.removeItem('flux_session');
  localStorage.removeItem('flux_token');
  localStorage.removeItem('flux_token_expiry');
  localStorage.removeItem('flux_user_info');
  userAvatar.style.display = 'none';
  userName.style.display = 'none';
  signInBtn.style.display = 'inline-flex';
  signOutBtn.style.display = 'none';
  overlay.classList.remove('hidden');
  showToast('Signed out', false);
}

// ─── Footer / About ──────────────────────────────────────────
aboutLink.addEventListener('click', () => {
  const content = `
    Flux is a cross-device sharing tool that uses your own Google Drive for storage.

    HOW IT WORKS
    Everything is stored in a folder called "FluxSpace" in your Drive. Because it is a PWA, you can install it as an app on your phone or PC.

    PRIVACY & SECURITY
    • No Servers: Your data moves directly between your browser and Google.
    • Limited Access: Flux can only see and manage the files it creates. It is technically unable to access any of your other personal documents.

    CREATOR
    <a href="https://github.com/casper-bug" target="_blank" style="color:var(--text); text-decoration:underline;">casper-bug</a>
  `;
  showModal('ABOUT FLUX', content, 'Close', false, true);
});

signInBtn.addEventListener('click', signIn);
signOutBtn.addEventListener('click', signOut);
overlaySignIn.addEventListener('click', signIn);

// ─── Drive Folder ────────────────────────────────────────────
async function ensureFluxFolder() {
  // Use localStorage to keep folder ID persistent
  const savedFolderId = localStorage.getItem('flux_folder_id');
  if (savedFolderId) {
    fluxFolderId = savedFolderId;
    // Verify in background, don't await
    driveAPI(`https://www.googleapis.com/drive/v3/files/${savedFolderId}?fields=id`).catch(e => {
      console.warn('Saved folder ID invalid, searching again...');
      localStorage.removeItem('flux_folder_id');
      fluxFolderId = null;
      ensureFluxFolder(); // Try to find/create it again
    });
    return;
  }

  const q = encodeURIComponent(`name='${FLUX_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await driveAPI(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  if (r.files && r.files.length > 0) {
    fluxFolderId = r.files[0].id;
    localStorage.setItem('flux_folder_id', fluxFolderId);
    return;
  }
  const body = { name: FLUX_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' };
  const created = await driveAPI('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  fluxFolderId = created.id;
  localStorage.setItem('flux_folder_id', fluxFolderId);
}

// ─── Fetch Items ─────────────────────────────────────────────
refreshBtn.addEventListener('click', loadItems);

async function loadItems() {
  if (!accessToken || !fluxFolderId) return;
  refreshBtn.classList.add('spinning');
  try {
    const q = encodeURIComponent(`'${fluxFolderId}' in parents and trashed=false`);
    const r = await driveAPI(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,createdTime,appProperties,webViewLink)&orderBy=createdTime desc`);
    items = r.files || [];
    localStorage.setItem('flux_items_cache', JSON.stringify(items));
    renderItems();
    
    // Auto-copy latest text (OTPs, Passwords, Links)
    if (items.length > 0) {
      const latest = items[0];
      const isText = latest.mimeType === 'application/vnd.flux.link' || (latest.appProperties && latest.appProperties.url);
      
      if (isText) {
        const text = latest.appProperties?.url || latest.name;
        const lastCopied = localStorage.getItem('flux_last_copied');
        
        if (lastCopied !== latest.id && !localStorage.getItem(`self_saved_${latest.id}`)) {
          // Auto-copy logic: Always auto-copy OTPs/Passwords, Links depend on type
          const otp = isOTP(text);
          const pwd = isPassword(text);
          const link = text.startsWith('http');
          
          if (otp || pwd || link) {
            try {
              await navigator.clipboard.writeText(text);
              localStorage.setItem('flux_last_copied', latest.id);
              const label = otp ? 'OTP' : (pwd ? 'Password' : 'Link');
              showToast(`${label} auto-copied`, true, 'content_copy');
            } catch(e) {
              console.warn('Clipboard auto-copy blocked', e);
            }
          }
        }
      } else {
        // If it's a file and it's new, just notify
        const lastSeen = localStorage.getItem('flux_last_seen');
        if (lastSeen && lastSeen !== latest.id && !localStorage.getItem(`self_saved_${latest.id}`)) {
           showToast('New file received!', true);
        }
        localStorage.setItem('flux_last_seen', latest.id);
      }
    }
  } catch(e) {
    showToast('Failed to load items', false);
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

function renderItems() {
  textList.innerHTML = '';
  fileList.innerHTML = '';
  
  let textCount = 0;
  let fileCount = 0;

  if (!items.length) {
    textSection.style.display = 'none';
    fileSection.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  items.forEach(file => {
    const isText = file.mimeType === 'application/vnd.flux.link' || (file.appProperties && file.appProperties.url);
    const name = file.name;
    const content = isText ? (file.appProperties?.url || file.name) : null;
    
    let iconName = isText ? 'notes' : getFileIcon(name);
    
    const el = document.createElement('div');
    el.className = 'item-card';
    el.innerHTML = `
      <div class="item-icon"><span class="material-symbols-outlined">${iconName}</span></div>
      <div class="item-info" title="${name}">
        <div class="item-name">${escHtml(name)}</div>
        <div class="item-meta">${timeAgo(file.createdTime)} ${!isText ? '· '+formatBytes(file.size) : ''}</div>
      </div>
      <div class="item-actions">
        <button class="action-btn share-btn" title="Share"><span class="material-symbols-outlined" style="font-size: 1.1rem;">share</span></button>
        <button class="action-btn download-btn" title="${isText ? 'Copy' : 'Download'}"><span class="material-symbols-outlined" style="font-size: 1.1rem;">${isText ? 'content_copy' : 'download'}</span></button>
        <button class="action-btn delete-btn" title="Delete"><span class="material-symbols-outlined" style="font-size: 1.1rem;">delete</span></button>
      </div>
    `;

    // Click behavior
    const handleAction = (e) => {
      if (e) e.stopPropagation();
      const btn = el.querySelector('.download-btn');
      if (isText) {
        navigator.clipboard.writeText(content).then(() => {
          showToast('Copied to clipboard', true, 'content_copy');
        });
      } else {
        downloadFile(file.id, file.name, btn);
      }
    };
    
    el.querySelector('.item-info').addEventListener('click', handleAction);
    el.querySelector('.download-btn').addEventListener('click', handleAction);
    
    el.querySelector('.share-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const shareUrl = isText ? content : file.webViewLink;
      if (!shareUrl) {
        showToast('Link not available yet', false);
        return;
      }

      // If it's a file, we need to ensure it's accessible to anyone with the link
      if (!isText) {
        const btn = el.querySelector('.share-btn');
        const iconSpan = btn.querySelector('.material-symbols-outlined');
        try {
          btn.classList.add('spinning');
          iconSpan.textContent = 'sync';
          await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
            method: 'POST',
            headers: { 
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
          });
        } catch (err) {
          console.warn('Failed to update permissions', err);
        } finally {
          btn.classList.remove('spinning');
          iconSpan.textContent = 'share';
        }
      }

      if (navigator.share) {
        try {
          await navigator.share({
            title: name,
            text: isText ? content : `Shared file: ${name}`,
            url: shareUrl
          });
        } catch (err) {
          if (err.name !== 'AbortError') showToast('Share failed', false);
        }
      } else {
        // Fallback for browsers without navigator.share
        try {
          await navigator.clipboard.writeText(shareUrl);
          showToast('Copied to clipboard', true);
        } catch (err) {
          showToast('Failed to copy', false);
        }
      }
    });
    
    el.querySelector('.delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await showModal('Delete Item', `Are you sure you want to delete "${name}"?`, 'Delete', true);
      if (!ok) return;
      
      el.style.opacity = '0.5';
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }
        });
        showToast('Deleted', true);
        loadItems();
      } catch(err) {
        showToast('Delete failed', false);
        el.style.opacity = '1';
      }
    });

    if (isText) {
      textList.appendChild(el);
      textCount++;
    } else {
      fileList.appendChild(el);
      fileCount++;
    }
  });

  textSection.style.display = textCount > 0 ? 'flex' : 'none';
  fileSection.style.display = fileCount > 0 ? 'flex' : 'none';
}

// ─── Uploads (Files & Folders) ───────────────────────────────
fileInput.addEventListener('change', () => handleFiles(fileInput.files));

const browseBtn = document.getElementById('browseBtn');
if(browseBtn) browseBtn.addEventListener('click', () => fileInput.click());

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  document.body.addEventListener(eventName, e => e.preventDefault(), false);
});

document.body.addEventListener('dragover', () => {
  dropZone.classList.add('drag-over');
});

document.body.addEventListener('dragleave', e => {
  if (e.relatedTarget === null || e.relatedTarget.nodeName === 'HTML') {
    dropZone.classList.remove('drag-over');
  }
});

document.body.addEventListener('drop', async e => {
  dropZone.classList.remove('drag-over');

  
  // Recursively gather files from DataTransferItems
  const files = [];
  const items = e.dataTransfer.items;
  
  if (items) {
    const promises = [];
    for (let i=0; i<items.length; i++) {
      const item = items[i].webkitGetAsEntry();
      if (item) promises.push(traverseFileTree(item, '', files));
    }
    await Promise.all(promises);
    handleFiles(files);
  } else {
    handleFiles(e.dataTransfer.files);
  }
});

async function traverseFileTree(item, path, filesArray) {
  if (item.isFile) {
    return new Promise(resolve => {
      item.file(file => {
        // We can attach the relative path if needed, but for now we just upload flat
        filesArray.push(file);
        resolve();
      });
    });
  } else if (item.isDirectory) {
    const dirReader = item.createReader();
    return new Promise(resolve => {
      dirReader.readEntries(async entries => {
        const promises = [];
        for (let i=0; i<entries.length; i++) {
          promises.push(traverseFileTree(entries[i], path + item.name + "/", filesArray));
        }
        await Promise.all(promises);
        resolve();
      });
    });
  }
}

async function handleFiles(files) {
  if (!accessToken) { signIn(); return; }
  const fileArray = Array.from(files);
  if (!fileArray.length) return;
  
  fileSection.style.display = 'flex'; // Ensure section is visible
  emptyState.style.display = 'none';

  for (let i = 0; i < fileArray.length; i++) {
    const f = fileArray[i];
    
    // Create inline placeholder with identical structure
    const el = document.createElement('div');
    el.className = 'item-card uploading';
    el.innerHTML = `
      <div class="item-icon"><span class="material-symbols-outlined">${getFileIcon(f.name)}</span></div>
      <div class="item-info">
        <div class="item-name">${escHtml(f.name)}</div>
        <div class="item-meta">
          <div class="progress-mini-bg"><div class="progress-mini-bar"></div></div>
        </div>
      </div>
      <div class="item-actions">
        <div class="upload-status" style="font-size: 0.7rem; font-weight: 700; color: var(--text); min-width: 32px; text-align: right;">0%</div>
      </div>
    `;
    fileList.prepend(el);

    try {
      await uploadSingleFile(f, el);
      // Morph to "Ready" state
      el.classList.remove('uploading');
      el.querySelector('.upload-status').innerHTML = '<span class="material-symbols-outlined" style="color:var(--text); font-size: 1.2rem;">check_circle</span>';
      el.querySelector('.item-meta').innerHTML = 'Saved to Drive';
    } catch(e) {
      showToast(`Failed to upload ${f.name}`, false);
      el.remove();
    }
  }
  
  fileInput.value = ''; // reset
  showToast('Upload complete', true);
  // Multi-stage refresh to account for Google Drive indexing lag
  setTimeout(loadItems, 1000);
  setTimeout(loadItems, 5000);
}

function uploadSingleFile(file, placeholderEl) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!fluxFolderId) throw new Error('Drive folder not initialized');
      
      const miniBar = placeholderEl.querySelector('.progress-mini-bar');
      const statusText = placeholderEl.querySelector('.upload-status');

      // Step 1: Create file metadata
      const metadata = { name: file.name, parents: [fluxFolderId] };
      const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      });
      if (!res.ok) throw new Error(`Metadata HTTP ${res.status}`);
      const fileData = await res.json();
      localStorage.setItem(`self_saved_${fileData.id}`, '1');
      
      // Step 2: Upload file content
      const xhr = new XMLHttpRequest();
      xhr.open('PATCH', `https://www.googleapis.com/upload/drive/v3/files/${fileData.id}?uploadType=media`);
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const pct = Math.floor(e.loaded / e.total * 100);
          if (miniBar) miniBar.style.width = pct + '%';
          if (statusText) statusText.textContent = pct + '%';
        }
      };
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload HTTP ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Network error'));
      
      xhr.send(file);
    } catch(err) {
      reject(err);
    }
  });
}

// ─── Upload Links ────────────────────────────────────────────
saveLinkBtn.addEventListener('click', async () => {
  if (!accessToken) { signIn(); return; }
  let text = linkInput.value.trim();
  if (!text) return;
  
  // Auto-prepend https only if it looks like a domain and isn't one already
  if (text.includes('.') && !text.includes(' ') && !text.startsWith('http')) {
     text = 'https://' + text;
  }

  const iconSpan = saveLinkBtn.querySelector('.material-symbols-outlined');
  saveLinkBtn.disabled = true;
  if (iconSpan) iconSpan.textContent = 'sync';
  saveLinkBtn.classList.add('spinning');
  
  try {
    const metadata = {
      name: text,
      mimeType: 'application/vnd.flux.link',
      parents: [fluxFolderId],
      appProperties: { url: text }
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([text], { type: 'text/plain' }));

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form
    });
    const savedData = await res.json();
    localStorage.setItem(`self_saved_${savedData.id}`, '1');
    
    linkInput.value = '';
    showToast('Saved', true);
    loadItems();
  } catch(e) {
    showToast('Failed to save', false);
  } finally {
    saveLinkBtn.disabled = false;
    if (iconSpan) iconSpan.textContent = 'send';
    saveLinkBtn.classList.remove('spinning');
  }
});
linkInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveLinkBtn.click(); });

// ─── Downloading ─────────────────────────────────────────────
function downloadFile(fileId, fileName, btn) {
  const iconSpan = btn ? btn.querySelector('.material-symbols-outlined') : null;
  if (btn) {
    btn.classList.add('spinning');
    if (iconSpan) iconSpan.textContent = 'sync';
  }

  const xhr = new XMLHttpRequest();
  xhr.open('GET', `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
  xhr.responseType = 'blob';
  
  xhr.onload = () => {
    if (btn) {
      btn.classList.remove('spinning');
      if (iconSpan) iconSpan.textContent = 'download';
    }
    if (xhr.status === 200) {
      const url = URL.createObjectURL(xhr.response);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      showToast('Download failed', false);
    }
  };
  
  xhr.onerror = () => {
    if (btn) {
      btn.classList.remove('spinning');
      if (iconSpan) iconSpan.textContent = 'download';
    }
    showToast('Network error during download', false);
  };
  
  xhr.send();
}

// ─── Drive API helpers ────────────────────────────────────────
async function driveAPI(url, opts = {}) {
  const headers = { Authorization: `Bearer ${accessToken}`, ...(opts.headers || {}) };
  const r = await fetch(url, { ...opts, headers });
  if (!r.ok) throw new Error(`Drive API error ${r.status}`);
  return r.json();
}

// ─── Toast ───────────────────────────────────────────────────
let toastTimer;
function showToast(msg, success = true, icon = null) {
  clearTimeout(toastTimer);
  toastText.textContent = msg;
  toastIcon.textContent = icon || (success ? 'check_circle' : 'error');
  toast.className = 'show' + (success ? ' success' : ' error');
  toastTimer = setTimeout(() => toast.className = '', 3000);
}

// ─── Modal Utility ───────────────────────────────────────────
function showModal(title, body, confirmText = 'Confirm', isDanger = false, isAlert = false) {
  return new Promise((resolve) => {
    modalTitle.textContent = title;
    modalBody.innerHTML = body.replace(/\n/g, '<br>');
    modalConfirm.textContent = confirmText;
    
    // Styling classes
    modalConfirm.className = 'modal-btn confirm' + (isDanger ? ' danger' : '');
    modalCancel.style.display = isAlert ? 'none' : 'inline-block';
    
    modalOverlay.classList.add('active');
    
    const cleanup = (val) => {
      modalOverlay.classList.remove('active');
      modalCancel.removeEventListener('click', onCancel);
      modalConfirm.removeEventListener('click', onConfirm);
      resolve(val);
    };
    
    const onCancel = () => cleanup(false);
    const onConfirm = () => cleanup(true);
    
    modalCancel.addEventListener('click', onCancel);
    modalConfirm.addEventListener('click', onConfirm);
  });
}

// ─── Share Target Handling ──────────────────────────────────
async function checkSharedData() {
  const urlParams = new URLSearchParams(window.location.search);
  if (!urlParams.has('share')) return;
  
  // Remove the share param from URL without refreshing
  const newUrl = window.location.pathname + window.location.hash;
  window.history.replaceState({}, document.title, newUrl);

  // If not signed in yet, we'll wait and checkSharedData will be called again by fetchUserInfo
  if (!accessToken || !fluxFolderId) {
    showToast('Awaiting authentication...', true, 'sync');
    return;
  }

  try {
    const cache = await caches.open('flux-share-target');
    const response = await cache.match('/shared-data');
    if (!response) return;

    const data = await response.json();
    
    // 1. Handle Files
    if (data.files && data.files.length > 0) {
      const filesToUpload = [];
      for (const fileInfo of data.files) {
        const fileRes = await cache.match(`/shared-files/${fileInfo.index}`);
        if (fileRes) {
          const blob = await fileRes.blob();
          const file = new File([blob], fileInfo.name, { type: fileInfo.type || blob.type });
          filesToUpload.push(file);
        }
      }
      if (filesToUpload.length > 0) {
        showToast(`Processing ${filesToUpload.length} shared files...`, true);
        await handleFiles(filesToUpload);
      }
    }

    // 2. Handle Text/URL (Link)
    const sharedLink = data.url || data.text;
    if (sharedLink && (sharedLink.startsWith('http') || sharedLink.includes('.'))) {
      let finalUrl = sharedLink;
      if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;
      
      linkInput.value = finalUrl;
      showToast('Processing shared link...', true);
      // Trigger the existing save link logic
      saveLinkBtn.click();
    }

    // Cleanup
    await caches.delete('flux-share-target');
  } catch (e) {
    console.error('Error processing shared data:', e);
    showToast('Failed to process shared item', false);
  }
}

// ─── Utilities ───────────────────────────────────────────────
function formatBytes(b) {
  b = parseInt(b);
  if (isNaN(b) || !b) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b/1048576).toFixed(1) + ' MB';
  return (b/1073741824).toFixed(2) + ' GB';
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

function getFileIcon(name) {
  if (!name) return 'description';
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    jpg:'image', jpeg:'image', png:'image', gif:'image', webp:'image', svg:'image',
    mp4:'movie', mov:'movie', avi:'movie', mkv:'movie', webm:'movie',
    mp3:'audio_file', wav:'audio_file', flac:'audio_file', aac:'audio_file', m4a:'audio_file', ogg:'audio_file',
    pdf:'picture_as_pdf', doc:'description', docx:'description', xls:'table_chart', xlsx:'table_chart',
    zip:'folder_zip', rar:'folder_zip', '7z':'folder_zip', tar:'folder_zip', gz:'folder_zip',
    js:'code', ts:'code', py:'code', html:'code', css:'code', json:'code',
    apk:'android', exe:'terminal', dmg:'terminal', pkg:'terminal',
  };
  return map[ext] || 'description';
}

function escHtml(s) {
  if(!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function isOTP(s) {
  if (!s) return false;
  // Common OTPs are 6-8 digits
  return /^\d{6,8}$/.test(s.trim());
}

function isPassword(s) {
  if (!s) return false;
  // A password is often 8-20 chars, has variety, and is not a URL or phone number
  const trimmed = s.trim();
  if (trimmed.length < 8 || trimmed.length > 32) return false;
  if (trimmed.includes(' ') || trimmed.startsWith('http')) return false;
  // Phone numbers are digits, spaces, hyphens, plus
  if (/^[\d\s\-+()]{10,}$/.test(trimmed)) return false;
  return true;
}

// ─── Background Sync (Poll every 30s) ────────────────────────
setInterval(() => {
  if (accessToken && fluxFolderId) {
    loadItems();
  }
}, 30000);
