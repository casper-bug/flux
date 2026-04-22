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
const overlay       = document.getElementById('overlay');
const overlaySignIn = document.getElementById('overlaySignIn');
const signInBtn     = document.getElementById('signInBtn');
const signOutBtn    = document.getElementById('signOutBtn');
const userAvatar    = document.getElementById('userAvatar');
const userName      = document.getElementById('userName');

const fileInput     = document.getElementById('fileInput');
const dropZone      = document.getElementById('dropZone');
const linkInput     = document.getElementById('linkInput');
const saveLinkBtn   = document.getElementById('saveLinkBtn');

const uploadProgress= document.getElementById('uploadProgress');
const uploadBar     = document.getElementById('uploadProgressBar');
const uploadLbl     = document.getElementById('uploadProgressLabel');

const itemsList     = document.getElementById('itemsList');
const emptyState    = document.getElementById('emptyState');
const refreshBtn    = document.getElementById('refreshBtn');
const configBanner  = document.getElementById('configBanner');
const toast         = document.getElementById('toast');

const dlOverlay     = document.getElementById('dlOverlay');
const dlTitle       = document.getElementById('dlTitle');
const dlBar         = document.getElementById('dlBar');
const dlText        = document.getElementById('dlText');

// ─── Init ────────────────────────────────────────────────────
window.addEventListener('load', () => {
  if (CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
    configBanner.style.display = 'block';
  }
  loadGISScript();
  checkSharedData();
});

// ─── Google Identity Services ────────────────────────────────
function loadGISScript() {
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.onload = initGIS;
  document.head.appendChild(s);
}

let tokenClient;
function initGIS() {
  if (CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') return;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: handleTokenResponse,
  });
  
  // Check for saved token to prevent sign-out on refresh
  const savedToken = localStorage.getItem('flux_token');
  const expiry = localStorage.getItem('flux_token_expiry');
  if (savedToken && expiry && Date.now() < parseInt(expiry, 10)) {
    accessToken = savedToken;
    fetchUserInfo();
    overlay.classList.add('hidden');
  } else if (localStorage.getItem('flux_session') && tokenClient) {
    // try to silent auth, might fail if popups blocked
    // tokenClient.requestAccessToken({ prompt: '' });
  }
}

function signIn() {
  if (!tokenClient) {
    showToast('⚠ Set your Client ID first', false);
    return;
  }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function handleTokenResponse(resp) {
  if (resp.error) { showToast('Sign-in failed', false); return; }
  
  if (!google.accounts.oauth2.hasGrantedAllScopes(resp, 'https://www.googleapis.com/auth/drive.file')) {
    showToast('⚠ Google Drive permission missing! Please sign in again and check the box.', false);
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
    const info = await r.json();
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
    showToast('✓ Welcome, ' + name, true);
    
    await ensureFluxFolder();
    loadItems();
    checkSharedData(); // Try again after auth
  } catch(e) {
    console.error('Initialization Error:', e);
    showToast('⚠ Drive Error: ' + e.message, false);
  }
}

function signOut() {
  if (accessToken) google.accounts.oauth2.revoke(accessToken);
  accessToken = null;
  fluxFolderId = null;
  localStorage.removeItem('flux_session');
  localStorage.removeItem('flux_token');
  localStorage.removeItem('flux_token_expiry');
  userAvatar.style.display = 'none';
  userName.style.display = 'none';
  signInBtn.style.display = 'inline-flex';
  signOutBtn.style.display = 'none';
  overlay.classList.remove('hidden');
  showToast('Signed out', false);
}

signInBtn.addEventListener('click', signIn);
signOutBtn.addEventListener('click', signOut);
overlaySignIn.addEventListener('click', signIn);

// ─── Drive Folder ────────────────────────────────────────────
async function ensureFluxFolder() {
  // Use localStorage to keep folder ID persistent
  const savedFolderId = localStorage.getItem('flux_folder_id');
  if (savedFolderId) {
    try {
      await driveAPI(`https://www.googleapis.com/drive/v3/files/${savedFolderId}?fields=id`);
      fluxFolderId = savedFolderId;
      return;
    } catch (e) {
      console.warn('Saved folder ID invalid, searching again...');
      localStorage.removeItem('flux_folder_id');
    }
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
    renderItems();
    
    // Auto-copy latest link (if it's not the one we just saved/uploaded ourselves)
    if (items.length > 0) {
      const latest = items[0];
      const isLink = latest.mimeType === 'application/vnd.flux.link' || (latest.appProperties && latest.appProperties.url);
      if (isLink) {
        const url = latest.appProperties?.url || latest.name;
        const lastCopied = localStorage.getItem('flux_last_copied');
        if (lastCopied !== latest.id) {
          // Verify it's not one we created in this session
          if (!localStorage.getItem(`self_saved_${latest.id}`)) {
            try {
              await navigator.clipboard.writeText(url);
              localStorage.setItem('flux_last_copied', latest.id);
              showToast('🔗 New link auto-copied', true);
            } catch(e) {
              console.warn('Clipboard auto-copy blocked', e);
            }
          }
        }
      } else {
        // If it's a file and it's new, just notify
        const lastSeen = localStorage.getItem('flux_last_seen');
        if (lastSeen && lastSeen !== latest.id && !localStorage.getItem(`self_saved_${latest.id}`)) {
           showToast('📦 New file received!', true);
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
  [...itemsList.querySelectorAll('.item-card')].forEach(el => el.remove());
  
  if (!items.length) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  items.forEach(file => {
    const isLink = file.mimeType === 'application/vnd.flux.link' || (file.appProperties && file.appProperties.url);
    const name = file.name;
    const url = isLink ? (file.appProperties?.url || file.name) : null;
    const iconName = isLink ? 'link' : getFileIcon(name);
    
    const el = document.createElement('div');
    el.className = 'item-card';
    el.innerHTML = `
      <div class="item-icon"><span class="material-symbols-outlined">${iconName}</span></div>
      <div class="item-info" title="${name}">
        <div class="item-name">${escHtml(name)}</div>
        <div class="item-meta">${timeAgo(file.createdTime)} ${!isLink ? '· '+formatBytes(file.size) : ''}</div>
      </div>
      <div class="item-actions">
        <button class="action-btn share-btn" title="Share Link"><span class="material-symbols-outlined" style="font-size: 1.1rem;">share</span></button>
        <button class="action-btn download-btn" title="${isLink ? 'Open Link' : 'Download'}"><span class="material-symbols-outlined" style="font-size: 1.1rem;">${isLink ? 'open_in_new' : 'download'}</span></button>
        <button class="action-btn delete-btn" title="Delete"><span class="material-symbols-outlined" style="font-size: 1.1rem;">delete</span></button>
      </div>
    `;

    // Click behavior
    const handleOpen = () => {
      if (isLink) window.open(url, '_blank');
      else downloadFile(file.id, file.name);
    };
    
    el.querySelector('.item-info').addEventListener('click', handleOpen);
    el.querySelector('.download-btn').addEventListener('click', handleOpen);
    
    el.querySelector('.share-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const shareUrl = isLink ? url : file.webViewLink;
      if (!shareUrl) {
        showToast('⚠ Link not available yet', false);
        return;
      }

      // If it's a file, we need to ensure it's accessible to anyone with the link
      if (!isLink) {
        try {
          const btn = el.querySelector('.share-btn');
          btn.classList.add('spinning');
          await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
            method: 'POST',
            headers: { 
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
          });
          btn.classList.remove('spinning');
        } catch (err) {
          console.warn('Failed to update permissions', err);
        }
      }

      if (navigator.share) {
        try {
          await navigator.share({
            title: name,
            text: isLink ? `Check out this link via Flux Drop` : `Shared file: ${name}`,
            url: shareUrl
          });
        } catch (err) {
          if (err.name !== 'AbortError') showToast('Share failed', false);
        }
      } else {
        // Fallback for browsers without navigator.share
        try {
          await navigator.clipboard.writeText(shareUrl);
          showToast('🔗 Link copied to clipboard', true);
        } catch (err) {
          showToast('Failed to copy link', false);
        }
      }
    });
    
    el.querySelector('.delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this item?')) return;
      el.style.opacity = '0.5';
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }
        });
        showToast('✓ Deleted', true);
        loadItems();
      } catch(err) {
        showToast('Delete failed', false);
        el.style.opacity = '1';
      }
    });

    itemsList.appendChild(el);
  });
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
  
  uploadProgress.style.display = 'block';
  
  for (let i = 0; i < fileArray.length; i++) {
    const f = fileArray[i];
    uploadLbl.textContent = `Uploading ${f.name} (${i+1}/${fileArray.length})...`;
    try {
      await uploadSingleFile(f);
    } catch(e) {
      showToast(`Failed to upload ${f.name}`, false);
    }
  }
  
  uploadProgress.style.display = 'none';
  uploadBar.style.width = '0%';
  fileInput.value = ''; // reset
  showToast('✓ Upload complete', true);
  // Wait longer for Google Drive search index to update
  setTimeout(loadItems, 3000);
}

function uploadSingleFile(file) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!fluxFolderId) throw new Error('Drive folder not initialized');
      
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
        if (e.lengthComputable) uploadBar.style.width = (e.loaded / e.total * 100) + '%';
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
  let url = linkInput.value.trim();
  if (!url) return;
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;

  saveLinkBtn.disabled = true;
  saveLinkBtn.textContent = 'Saving...';
  
  try {
    const metadata = {
      name: url,
      mimeType: 'application/vnd.flux.link',
      parents: [fluxFolderId],
      appProperties: { url: url }
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([url], { type: 'text/plain' }));

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form
    });
    const savedData = await res.json();
    localStorage.setItem(`self_saved_${savedData.id}`, '1');
    
    linkInput.value = '';
    showToast('✓ Link saved', true);
    loadItems();
  } catch(e) {
    showToast('Failed to save link', false);
  } finally {
    saveLinkBtn.disabled = false;
    saveLinkBtn.textContent = 'Save Link';
  }
});
linkInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveLinkBtn.click(); });

// ─── Downloading ─────────────────────────────────────────────
function downloadFile(fileId, fileName) {
  dlTitle.textContent = `Downloading ${fileName}...`;
  dlBar.style.width = '0%';
  dlText.textContent = '0%';
  dlOverlay.classList.add('active');

  const xhr = new XMLHttpRequest();
  xhr.open('GET', `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
  xhr.responseType = 'blob';
  
  xhr.onprogress = e => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      dlBar.style.width = pct + '%';
      dlText.textContent = pct + '%';
    } else {
      dlBar.style.width = '100%';
      dlText.textContent = formatBytes(e.loaded);
    }
  };
  
  xhr.onload = () => {
    dlOverlay.classList.remove('active');
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
    dlOverlay.classList.remove('active');
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
function showToast(msg, success = true) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
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
    showToast('Waiting for sign-in to process shared item...', true);
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

// ─── Background Sync (Poll every 30s) ────────────────────────
setInterval(() => {
  if (accessToken && fluxFolderId) {
    loadItems();
  }
}, 30000);
