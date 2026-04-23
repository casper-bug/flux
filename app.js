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
let recentUploads = [];

// ─── DOM refs ────────────────────────────────────────────────
const _id = id => document.getElementById(id);
const overlay       = _id('overlay');
const overlaySignIn = _id('overlaySignIn');
const signInBtn     = _id('signInBtn');
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
const modalExtra    = _id('modalExtraBtn');
const modalActions  = _id('modalActions');
// const aboutLink     = _id('aboutLink');
const settingsBtn   = _id('settingsBtn');
const scrollTopBtn  = _id('scrollTopBtn');
const storagePulse  = _id('storagePulse');
const browseBtn     = _id('browseBtn');

let driveQuota = null; // Storage state

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
      configBanner.style.display = 'block';
    }
    
    recoverSession();
    loadCachedItems();
    
    // SW Logic moved to index.html for stability

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
    
    // Background Sync Hook: Sync when page is focused
    window.addEventListener('focus', () => {
      if (accessToken && fluxFolderId) loadItems();
    });
  } else {
    document.body.classList.remove('has-session');
    localStorage.removeItem('flux_session');
  }
}

function loadCachedItems() {
  const cached = localStorage.getItem('flux_items_cache');
  if (cached) {
    try {
      items = JSON.parse(cached);
      renderItems();
    } catch (e) {}
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
  settingsBtn.style.display = 'inline-flex';
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
  settingsBtn.style.display = 'none';
  document.body.classList.remove('has-session');
  overlay.classList.remove('hidden');
  showToast('Signed out', false);
}



settingsBtn.addEventListener('click', () => haptic(20));
signInBtn.addEventListener('click', signIn);
overlaySignIn.addEventListener('click', signIn);

// ─── Drive API Helper ────────────────────────────────────────
async function driveAPI(url, options = {}) {
  if (!accessToken) { signIn(); throw new Error('Not authenticated'); }
  options.headers = options.headers || {};
  options.headers['Authorization'] = `Bearer ${accessToken}`;
  
  try {
    const res = await fetch(url, options).catch(err => {
      throw new Error(`Network failure: ${err.message}`);
    });
    
    if (res.status === 401) { 
      localStorage.removeItem('flux_token');
      signIn(); 
      throw new Error('Unauthorized - Please sign in again'); 
    }
    
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Drive API error (${res.status}): ${errText}`);
    }
    
    // Safely handle empty body (DELETE returns 204 No Content)
    if (res.status === 204 || res.status === 205) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('json')) return null;
    const text = await res.text();
    return text.trim() ? JSON.parse(text) : null;
  } catch (e) {
    console.error('Request Error:', e);
    throw e;
  }
}

// ─── Drive Folder ────────────────────────────────────────────
async function ensureFluxFolder() {
  // Use localStorage to keep folder ID persistent
  const savedFolderId = localStorage.getItem('flux_folder_id');
  if (savedFolderId) {
    fluxFolderId = savedFolderId;
    driveAPI(`https://www.googleapis.com/drive/v3/files/${savedFolderId}?fields=id`).catch(e => {
      console.warn('Saved folder ID invalid, searching again...');
      localStorage.removeItem('flux_folder_id');
      fluxFolderId = null;
      ensureFluxFolder();
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
  haptic(15);
  refreshBtn.classList.add('spinning');

  try {
    const q = encodeURIComponent(`'${fluxFolderId}' in parents and trashed=false`);
    const r = await driveAPI(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,createdTime,appProperties,webViewLink)&orderBy=createdTime desc`);
    items = r.files || [];
    
    // Auto-Cleanup Logic
    const cleanupDays = parseInt(localStorage.getItem('flux_cleanup_days') || '0');
    if (cleanupDays > 0) {
      const now = Date.now();
      const threshold = cleanupDays * 24 * 60 * 60 * 1000;
      for (const item of items) {
        if (now - new Date(item.createdTime).getTime() > threshold) {
          driveAPI(`https://www.googleapis.com/drive/v3/files/${item.id}`, { method: 'DELETE' }).catch(()=>{});
        }
      }
    }

    // Storage Analysis
    const totalFluxBytes = items.reduce((acc, i) => acc + parseInt(i.size || 0), 0);
    if (storagePulse) storagePulse.innerHTML = `SPACE USED: ${formatBytes(totalFluxBytes)}`;
    
    // Fetch Drive Quota
    try {
      const about = await driveAPI('https://www.googleapis.com/drive/v3/about?fields=storageQuota');
      driveQuota = about.storageQuota;
      localStorage.setItem('flux_drive_quota', JSON.stringify(driveQuota));
      updateStorageUI(totalFluxBytes);
    } catch(e) {}

    const newItemsJson = JSON.stringify(items);
    const oldItemsJson = localStorage.getItem('flux_items_cache');
    localStorage.setItem('flux_items_cache', newItemsJson);
    
    // Always re-render if it's the first load or if things changed
    if (newItemsJson !== oldItemsJson || !oldItemsJson) {
      renderItems();
    }
    
    // Auto-copy / Notification logic (Only for new items)
    if (items.length > 0) {
      const latest = items[0];
      const latestTime = new Date(latest.createdTime).getTime();
      const lastSeenTime = parseInt(localStorage.getItem('flux_last_seen_time') || '0', 10);
      const isNew = latestTime > lastSeenTime;
      const wasSelfSaved = localStorage.getItem(`self_saved_${latest.id}`);

      if (isNew && !wasSelfSaved) {
        const isText = latest.mimeType === 'application/vnd.flux.link' || (latest.appProperties && latest.appProperties.url);
        if (isText) {
          const text = latest.appProperties?.url || latest.name;
          const otp = isOTP(text);
          const pwd = isPassword(text);
          const link = text.startsWith('http');
          
          if (otp || pwd || link) {
            const label = otp ? 'OTP' : (pwd ? 'Password' : (link ? 'Link' : 'Text'));
            try {
              // Instead of auto-copying, show a notification the user can click
              showToast(`New ${label} received. Click to Copy.`, true, 'content_copy');
              
              toast.style.cursor = 'pointer';
              const copyHandler = () => {
                navigator.clipboard.writeText(text).then(() => showToast('Copied!', true));
                toast.removeEventListener('click', copyHandler);
                toast.style.cursor = 'default';
              };
              toast.addEventListener('click', copyHandler);
            } catch(e) { 
              showToast(`New ${label}: ${text}`, true, 'content_copy');
            }
          }
        } else {
          showToast('New file received!', true);
        }
      }
      
      // Always update last seen time to the latest item in the list
      localStorage.setItem('flux_last_seen_time', latestTime.toString());
    }
  } catch(e) {
    showToast('Failed to load items', false);
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

function updateStorageUI(fluxBytes) {
  if (!driveQuota || !storagePulse) return;
  localStorage.setItem('flux_used_bytes', (fluxBytes || 0).toString());
  storagePulse.innerHTML = `SPACE USED: ${formatBytes(fluxBytes || 0)}`;
}

// ─── Card Builders ───────────────────────────────────────────
function buildUploadCard(file) {
  const isText = file.mimeType === 'application/vnd.flux.link';
  const pct = file.progress || 0;
  const el = document.createElement('div');
  el.className = 'item-card uploading';
  el.dataset.uid = file._uid;
  el.innerHTML = `
    <div class="item-icon"><span class="material-symbols-outlined">${isText ? 'notes' : getFileIcon(file.name)}</span></div>
    <div class="item-info">
      <div class="item-name">${escHtml(file.name)}</div>
      <div class="item-meta">
        ${isText ? 'Processing...' : `<div class="progress-mini-bg"><div class="progress-mini-bar" style="width:${pct}%"></div></div>`}
      </div>
    </div>
    <div class="item-actions" style="min-width:60px;justify-content:flex-end;">
      <div class="upload-status">${isText ? 'SAVING' : pct + '%'}</div>
    </div>`;
  return el;
}

function buildItemCard(file) {
  const isText = file.mimeType === 'application/vnd.flux.link' || (file.appProperties?.url);
  const name = file.name;
  const content = isText ? (file.appProperties?.url || name) : null;
  const el = document.createElement('div');
  el.className = 'item-card';
  el.dataset.itemId = file.id;
  el.innerHTML = `
    <div class="item-icon"><span class="material-symbols-outlined">${isText ? 'notes' : getFileIcon(name)}</span></div>
    <div class="item-info" title="${escHtml(name)}">
      <div class="item-name">${escHtml(name)}</div>
      <div class="item-meta">${timeAgo(file.createdTime)}${!isText ? ' · ' + formatBytes(file.size) : ''}</div>
    </div>
    <div class="item-actions">
      <button class="action-btn share-btn" title="Share"><span class="material-symbols-outlined" style="font-size:1.1rem;">share</span></button>
      <button class="action-btn download-btn" title="${isText ? 'Copy' : 'Download'}"><span class="material-symbols-outlined" style="font-size:1.1rem;">${isText ? 'content_copy' : 'download'}</span></button>
      <button class="action-btn delete-btn" title="Delete"><span class="material-symbols-outlined" style="font-size:1.1rem;">delete</span></button>
    </div>`;

  const handleAction = (e) => {
    if (e) e.stopPropagation();
    haptic(20);
    if (isText) navigator.clipboard.writeText(content).then(() => showToast('Copied!', true, 'content_copy'));
    else downloadFile(file.id, name, el.querySelector('.download-btn'));
  };
  el.querySelector('.item-info').addEventListener('click', handleAction);
  el.querySelector('.download-btn').addEventListener('click', handleAction);
  el.querySelector('.share-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const shareUrl = isText ? content : file.webViewLink;
    if (!isText) {
      const btn = el.querySelector('.share-btn');
      const icon = btn.querySelector('.material-symbols-outlined');
      try {
        btn.classList.add('spinning'); icon.textContent = 'sync';
        await driveAPI(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: 'anyone' })
        });
      } catch (err) { /* silent */ } finally { btn.classList.remove('spinning'); icon.textContent = 'share'; }
    }
    if (navigator.share) {
      haptic(20);
      navigator.share({ title: name, url: shareUrl }).catch(() => {});
    } else {
      haptic(50);
      navigator.clipboard.writeText(shareUrl); showToast('Link copied', true);
    }
  });
  el.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    haptic([30, 30]);
    deleteItem(file.id, name, el);
  });
  return el;
}

// ─── Keyed DOM Diff Renderer ──────────────────────────────────
function renderItems() {
  // Deduplicate: remove placeholder if real item now exists
  const itemIds = new Set(items.map(i => i.id));
  const itemNames = new Set(items.map(i => i.name));
  
  recentUploads = recentUploads.filter(r => {
    // If we have an ID and it's already in the main items list, remove immediately
    if (r.id && itemIds.has(r.id)) return false;
    
    const age = Date.now() - new Date(r.createdTime).getTime();
    
    // Absolute safety timeout: if it's older than 60s, remove it regardless of progress
    if (age > 60000) return false;

    // If progress is 100%, we wait a very short time (5s) for Drive to reflect the change
    if (r.progress >= 100) {
      if (age > 5000 || itemNames.has(r.name)) return false;
    }
    
    // Otherwise keep it if it's still uploading or very fresh
    return true;
  });

  const allItems = [
    ...recentUploads,
    ...items.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime))
  ];

  // Determine empty state
  if (!allItems.length) {
    textSection.style.display = 'none';
    textList.style.display   = 'none';
    fileSection.style.display = 'none';
    fileList.style.display   = 'none';
    emptyState.style.display = 'flex';
    return;
  }
  emptyState.style.display = 'none';

  // Build desired key sets per list
  const desiredText = [], desiredFile = [];
  for (const f of allItems) {
    const isText = f.mimeType === 'application/vnd.flux.link' || (f.appProperties?.url);
    if (isText) desiredText.push(f);
    else desiredFile.push(f);
  }

  diffList(textList, desiredText, true);
  diffList(fileList, desiredFile, false);

  textSection.style.display = desiredText.length ? 'flex' : 'none';
  textList.style.display    = desiredText.length ? 'flex' : 'none';
  fileSection.style.display = desiredFile.length ? 'flex' : 'none';
  fileList.style.display    = desiredFile.length ? 'flex' : 'none';
}

function diffList(container, desired) {
  // Index existing DOM children by their stable key
  const existing = new Map();
  for (const child of container.children) {
    const key = child.dataset.itemId || ('u:' + child.dataset.uid);
    if (key) existing.set(key, child);
  }

  const seen = new Set();
  let refNode = container.firstChild;

  for (const f of desired) {
    const key = f.id || ('u:' + f._uid);
    seen.add(key);
    let el = existing.get(key);

    if (!el) {
      // Insert new card
      el = f.isRecentPlaceholder ? buildUploadCard(f) : buildItemCard(f);
      container.insertBefore(el, refNode);
    } else {
      // Ensure it's in the right position
      if (el !== refNode) container.insertBefore(el, refNode);
      refNode = el.nextSibling;
    }
    refNode = el.nextSibling;
  }

  // Remove stale nodes (not in desired set)
  for (const [key, el] of existing) {
    if (!seen.has(key) && !el.classList.contains('deleting')) {
      el.remove();
    }
  }
}

async function deleteItem(id, name, el) {
  const choice = await showModal('DELETE ITEM?', `Delete "${name}"? This cannot be undone.`, 'Delete', true, false, 'Cancel');
  if (choice !== 'confirm') return;

  // Lock height and animate out
  el.style.maxHeight = el.offsetHeight + 'px';
  el.style.overflow = 'hidden';
  el.classList.add('deleting');

  // Fire API in parallel with the animation
  const apiCall = driveAPI(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' })
    .catch(err => err);

  el.addEventListener('animationend', async () => {
    const result = await apiCall;
    if (result instanceof Error) {
      el.classList.remove('deleting');
      el.style.maxHeight = '';
      el.style.overflow = '';
      showToast('Delete failed: ' + result.message, false);
      return;
    }
    // Remove from state and trigger a full re-render for consistency
    items = items.filter(i => i.id !== id);
    recentUploads = recentUploads.filter(r => r.id !== id);
    localStorage.setItem('flux_items_cache', JSON.stringify(items));
    renderItems();
  }, { once: true });
}

// ─── Uploads (Files & Folders) ───────────────────────────────
fileInput.addEventListener('change', () => handleFiles(fileInput.files));
if (browseBtn) browseBtn.addEventListener('click', () => { haptic(20); fileInput.click(); });

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
  dropZone.style.display = 'none';

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
  
  fileSection.style.display = 'flex';
  emptyState.style.display = 'none';

  for (const f of fileArray) {
    // Drive Storage Check
    if (driveQuota) {
      const remaining = parseInt(driveQuota.limit) - parseInt(driveQuota.usage);
      if (f.size > remaining) {
        showToast(`Not enough Drive space for "${f.name}"`, false);
        continue;
      }
    }

    // Intelligent Conflict Resolution
    const existing = items.find(i => i.name === f.name);
    if (existing) {
      const choice = await showModal(
        'DUPLICATE DETECTED',
        `"${f.name}" already exists.`,
        'Replace Existing',
        true, // Show Cancel
        false, 
        'Cancel',
        true, // Show Extra
        'Keep Both'
      );
      
      if (choice === 'confirm') {
        try {
          await driveAPI(`https://www.googleapis.com/drive/v3/files/${existing.id}`, { method: 'DELETE' });
        } catch (err) {
          showToast('Failed to replace file', false);
          continue;
        }
      } else if (choice === 'extra') {
        // Keep Both (Google Drive handles this naturally)
      } else {
        continue; // Cancelled
      }
    }

    const placeholder = {
      _uid: Math.random().toString(36).slice(2), // unique ID for DOM targeting
      name: f.name, size: f.size, mimeType: f.type,
      isRecentPlaceholder: true, createdTime: new Date().toISOString(),
      progress: 0, appProperties: {}
    };
    recentUploads.push(placeholder);
    renderItems();

    // Concurrent uploads: Don't await, let them run in parallel
    uploadSingleFile(f, placeholder)
      .then((fileObj) => {
        placeholder.id = fileObj.id; // Mark with ID so renderItems can deduplicate
        setTimeout(loadItems, 1000);
      })
      .catch(e => {
        showToast(`Failed: ${f.name}`, false);
        recentUploads = recentUploads.filter(r => r !== placeholder);
        renderItems();
      });
  }
  fileInput.value = '';
}

function uploadSingleFile(file, placeholderEl) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!fluxFolderId) throw new Error('Drive folder not initialized');
      const isObject = !placeholderEl.tagName;
      
      // Use Resumable Upload for Large Files and better stability
      const metadata = { 
        name: file.name, 
        parents: [fluxFolderId],
        appProperties: { device: localStorage.getItem('flux_device_name') || 'Unknown' }
      };
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      });
      if (!res.ok) throw new Error(`Init HTTP ${res.status}`);
      const uploadUrl = res.headers.get('Location');
      
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const pct = Math.floor(e.loaded / e.total * 100);
          placeholderEl.progress = pct;
          
          // Target only this file's card using its unique data-uid
          const el = document.querySelector(`[data-uid="${placeholderEl._uid}"]`);
          if (el) {
            const bar = el.querySelector('.progress-mini-bar');
            const status = el.querySelector('.upload-status');
            if (bar) bar.style.width = pct + '%';
            if (status) status.textContent = pct + '%';
          }
        }
      };
      
      xhr.onload = () => {
        if (xhr.status === 401) { signIn(); reject('Unauthorized'); return; }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.response));
        } else {
          reject('Upload failed: ' + xhr.status);
        }
      };
      
      xhr.onerror = () => reject(new Error('Network connectivity issue'));
      xhr.send(file);
    } catch(err) {
      reject(err);
    }
  });
}

// ─── Upload Links ────────────────────────────────────────────
let pasteAndSendMode = false;
saveLinkBtn.addEventListener('click', async () => {
  haptic(20);
  if (!accessToken) { signIn(); return; }
  
  let text = linkInput.value.trim();
  
  // If empty and in pasteAndSendMode, grab from clipboard
  if (!text && pasteAndSendMode) {
    try {
      text = await navigator.clipboard.readText();
      text = text ? text.trim() : '';
    } catch (e) {
      showToast('Clipboard access denied', false);
      return;
    }
  }
  
  if (!text) return;

  // Auto-prepend https
  if (text.includes('.') && !text.includes(' ') && !text.startsWith('http')) {
     text = 'https://' + text;
  }

  linkInput.value = ''; // Clear immediately for snappiness

  const placeholder = {
    name: text,
    mimeType: 'application/vnd.flux.link',
    appProperties: { url: text },
    isRecentPlaceholder: true,
    createdTime: new Date().toISOString(),
    progress: 100 // Links are fast
  };
  recentUploads.push(placeholder);
  renderItems();
  
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

    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form
    });
    
    // Wait for indexing
    setTimeout(loadItems, 800);
  } catch(e) {
    showToast('Failed to save', false);
    recentUploads = recentUploads.filter(r => r !== placeholder);
    renderItems();
  }
});
linkInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveLinkBtn.click(); });

function updateSaveBtnIcon() {
  const icon = saveLinkBtn.querySelector('.material-symbols-outlined');
  if (!icon) return;
  if (linkInput.value.trim() === '') {
    icon.textContent = 'content_paste';
    saveLinkBtn.title = 'Paste & Send';
  } else {
    icon.textContent = 'send';
    saveLinkBtn.title = 'Save Content';
  }
}
linkInput.addEventListener('input', updateSaveBtnIcon);
window.addEventListener('focus', updateSaveBtnIcon);
updateSaveBtnIcon(); // Initial state

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


// ─── Toast ───────────────────────────────────────────────────
let toastTimer;
function showToast(msg, success = true, icon = null) {
  clearTimeout(toastTimer);
  toastText.textContent = msg;
  toastIcon.textContent = icon || (success ? 'check_circle' : 'error');
  toast.className = 'show' + (success ? ' success' : ' error');
  toastTimer = setTimeout(() => toast.className = '', 3000);
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
  // Broaden to 4-12 digits for various service codes
  return /^\d{4,12}$/.test(s.trim());
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

let scrollTimer;
window.addEventListener('scroll', () => {
  if (scrollTimer) return;
  scrollTimer = setTimeout(() => {
    if (scrollTopBtn) scrollTopBtn.style.display = window.scrollY > 400 ? 'flex' : 'none';
    scrollTimer = null;
  }, 150);
});

// ─── Modals ──────────────────────────────────────────────────
function showModal(title, content, btn1Text = 'OK', showBtn2 = false, btn1Only = false, btn2Text = 'Cancel', showExtra = false, extraText = 'Extra') {
  return new Promise(resolve => {
    modalTitle.textContent = title;
    modalBody.innerHTML = content;
    
    modalConfirm.textContent = btn1Text;
    
    modalCancel.style.display = btn1Only ? 'none' : 'inline-block';
    modalCancel.textContent = btn2Text;
    
    modalExtra.style.display = showExtra ? 'inline-block' : 'none';
    if (showExtra) modalExtra.textContent = extraText;
    
    const cleanup = () => {
      modalOverlay.classList.remove('active');
      modalConfirm.removeEventListener('click', onConfirm);
      modalCancel.removeEventListener('click', onCancel);
      modalExtra.removeEventListener('click', onExtra);
    };
    const onConfirm = () => { cleanup(); resolve('confirm'); };
    const onCancel = () => { cleanup(); resolve('cancel'); };
    const onExtra = () => { cleanup(); resolve('extra'); };
    
    modalConfirm.addEventListener('click', onConfirm);
    modalCancel.addEventListener('click', onCancel);
    modalExtra.addEventListener('click', onExtra);
    modalOverlay.classList.add('active');
  });
}

if (scrollTopBtn) scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));


function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m";
  return Math.floor(seconds) + "s";
}

function getTimeGroup(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = now - d;
  if (diff < dayMs && d.getDate() === now.getDate()) return 'TODAY';
  if (diff < dayMs * 2) return 'YESTERDAY';
  return 'OLDER';
}

setInterval(() => {
  if (accessToken) {
    const loginTime = parseInt(localStorage.getItem('flux_login_time') || '0');
    if (Date.now() - loginTime > 55 * 60 * 1000) showToast('Session expiring soon. Refresh page recommended.', false);
  }
}, 5 * 60 * 1000);

// ─── Clipboard Detection (Paste & Send) ──────────────────────
async function checkClipboard() {
  if (!document.hasFocus()) return;
  try {
    // Only check if input is empty
    if (linkInput.value.trim() !== '') return;

    // We can't always check without permission, but we can try
    const text = await navigator.clipboard.readText().catch(() => '');
    if (text && text.trim() !== '') {
      pasteAndSendMode = true;
      const icon = saveLinkBtn.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = 'content_paste_go';
      saveLinkBtn.title = 'Paste & Send';
    } else {
      resetSendBtn();
    }
  } catch (e) { resetSendBtn(); }
}

function resetSendBtn() {
  pasteAndSendMode = false;
  const icon = saveLinkBtn.querySelector('.material-symbols-outlined');
  if (icon) icon.textContent = 'send';
  saveLinkBtn.title = 'Send';
}

window.addEventListener('focus', checkClipboard);
linkInput.addEventListener('input', () => {
  if (linkInput.value.trim() !== '') resetSendBtn();
  else checkClipboard();
});

// ─── Background Sync (Poll every 10s) ────────────────────────
setInterval(() => {
  if (accessToken && fluxFolderId && document.visibilityState === 'visible') {
    loadItems();
  }
}, 30000);
