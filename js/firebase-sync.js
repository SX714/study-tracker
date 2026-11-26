/**
 * firebase-sync.js — Firebase 雲端同步模組
 *
 * 使用前請將下方 FIREBASE_CONFIG 替換為你自己 Firebase 專案的設定值。
 * 前往 https://console.firebase.google.com → 專案設定 → 你的應用程式 → SDK 設定 取得。
 */

/* ===========================
   Firebase 專案設定（請替換為你的專案值）
   =========================== */
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyDZJE0YqNKBiCBdy3PMrUnhJo5i2bDAPKY',
  authDomain:        'study-tracker-95346.firebaseapp.com',
  projectId:         'study-tracker-95346',
  storageBucket:     'study-tracker-95346.firebasestorage.app',
  messagingSenderId: '903394827622',
  appId:             '1:903394827622:web:ecb284685dd705be38fca7',
  measurementId:     'G-N0PT0627Z8'
};

/* ===========================
   同步範圍（這些 key 的變更會同步至 Firestore）
   =========================== */
const SYNC_KEYS = ['st_subjects', 'st_sessions', 'st_goals', 'st_diary'];

/** 將 localStorage key 對應至 Firestore 文件名稱 */
const KEY_TO_DOC = {
  st_subjects: 'subjects',
  st_sessions: 'sessions',
  st_goals:    'goals',
  st_diary:    'diary'
};

/* ===========================
   內部狀態
   =========================== */
let _app  = null;
let _auth = null;
let _db   = null;

/* ===========================
   初始化
   =========================== */

/**
 * 初始化 Firebase App、Auth、Firestore。
 * 若 FIREBASE_CONFIG 仍為佔位值，靜默跳過（降級模式）。
 * 防止重複 initializeApp（多頁面或快取情境）。
 */
function initFirebase() {
  if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
    console.info('[firebase-sync] FIREBASE_CONFIG 尚未設定，雲端同步停用。');
    return;
  }
  try {
    // 防止重複初始化
    if (firebase.apps.length > 0) {
      _app = firebase.apps[0];
    } else {
      _app = firebase.initializeApp(FIREBASE_CONFIG);
    }
    _auth = firebase.auth();
    _db   = firebase.firestore();

    // 監聽登入狀態
    _auth.onAuthStateChanged(async (user) => {
      if (user) {
        window._firebaseUser = user;
        _updateSyncUI(user);
        _updateNavAvatar(user);
        // 登入後先拉取雲端資料，再上傳本機資料
        await fetchAndMergeFromFirestore(user.uid);
        await syncAllToFirestore(user.uid);
      } else {
        window._firebaseUser = null;
        _updateSyncUI(null);
        _updateNavAvatar(null);
      }
    });
  } catch (err) {
    console.error('[firebase-sync] 初始化失敗：', err);
  }
}

/* ===========================
   Auth 操作
   =========================== */

/** Google OAuth 登入。
 *  - 優先使用 signInWithPopup（HTTPS 環境）
 *  - popup 被封鎖時自動 fallback 至 signInWithRedirect
 *  - file:// 協定下給出友善提示（Firebase Auth 本身不支援 file://）
 */
async function signInWithGoogle() {
  if (!_auth) { alert('Firebase 尚未初始化，請先設定 FIREBASE_CONFIG。'); return; }

  // file:// 協定：Firebase Auth 完全不支援，給出友善說明
  if (location.protocol === 'file:') {
    alert(
      '⚠️ Google 登入需要透過網頁伺服器（https:// 或 http://localhost）開啟。\n\n' +
      '最簡單的方法是將專案部署到 GitHub Pages：\n' +
      '1. 在 GitHub 建立 repository，將所有檔案上傳\n' +
      '2. 前往 Settings → Pages → 選 main branch → Save\n' +
      '3. 取得網址後，在 Firebase Console → Authentication\n' +
      '   → Settings → 授權網域，新增你的 GitHub Pages 網址\n\n' +
      '本機測試可用 VS Code 的 Live Server 擴充功能。'
    );
    return;
  }

  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');

  try {
    await _auth.signInWithPopup(provider);
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
      // popup 被封鎖時改用 redirect
      console.warn('[firebase-sync] Popup 被封鎖，改用 redirect 登入…');
      try {
        await _auth.signInWithRedirect(provider);
      } catch (redirectErr) {
        console.error('[firebase-sync] Redirect 登入失敗：', redirectErr);
        alert('登入失敗：' + redirectErr.message);
      }
    } else if (err.code === 'auth/unauthorized-domain') {
      alert(
        '❌ 此網域尚未在 Firebase 授權。\n\n' +
        '請前往 Firebase Console → Authentication → Settings → 授權網域，\n' +
        '將目前的網址（' + location.hostname + '）加入清單後再試一次。'
      );
    } else {
      console.error('[firebase-sync] Google 登入失敗：', err);
      alert('登入失敗：' + (err.message || err.code));
    }
  }
}

/** 登出 */
async function signOutUser() {
  if (!_auth) return;
  try {
    await _auth.signOut();
  } catch (err) {
    console.error('[firebase-sync] 登出失敗：', err);
  }
}

/* ===========================
   Firestore 同步
   =========================== */

/**
 * 將單一 key 的資料同步至 Firestore。
 * @param {string} uid   使用者 UID
 * @param {string} key   localStorage key（需在 SYNC_KEYS 內）
 * @param {*}      value 要儲存的值（陣列）
 */
async function syncKey(uid, key, value) {
  if (!_db || !uid) return;
  const docName = KEY_TO_DOC[key];
  if (!docName) return;
  try {
    await _db.doc(`users/${uid}/data/${docName}`).set({ items: value });
  } catch (err) {
    console.error(`[firebase-sync] syncKey(${key}) 失敗：`, err);
  }
}

/**
 * 一次同步所有 SYNC_KEYS 的本機資料至 Firestore。
 * @param {string} uid
 */
async function syncAllToFirestore(uid) {
  if (!_db || !uid) return;
  const promises = SYNC_KEYS.map(key => {
    let raw;
    try { raw = JSON.parse(localStorage.getItem(key) || '[]'); } catch { raw = []; }
    return syncKey(uid, key, Array.isArray(raw) ? raw : []);
  });
  await Promise.all(promises);
}

/**
 * 從 Firestore 拉取各 key 的資料，與 localStorage 合併後寫回。
 * 合併策略：以 id 為 key 建立 Map，Firestore 資料覆蓋本機資料（雲端優先）。
 * 寫回時直接用 localStorage.setItem，不觸發 saveData，避免無限循環。
 * @param {string} uid
 */
async function fetchAndMergeFromFirestore(uid) {
  if (!_db || !uid) return;
  for (const key of SYNC_KEYS) {
    const docName = KEY_TO_DOC[key];
    try {
      const snap = await _db.doc(`users/${uid}/data/${docName}`).get();
      if (!snap.exists) continue;
      const cloudItems = snap.data().items || [];
      let localItems;
      try { localItems = JSON.parse(localStorage.getItem(key) || '[]'); } catch { localItems = []; }
      if (!Array.isArray(localItems)) localItems = [];

      // 以 id 為 key 合併，雲端資料優先
      const merged = new Map();
      localItems.forEach(item => { if (item?.id) merged.set(item.id, item); });
      cloudItems.forEach(item => { if (item?.id) merged.set(item.id, item); });

      localStorage.setItem(key, JSON.stringify([...merged.values()]));
    } catch (err) {
      console.error(`[firebase-sync] fetchAndMerge(${key}) 失敗：`, err);
    }
  }
}

/* ===========================
   UI 更新（供 settings.html 使用）
   =========================== */

/**
 * 更新導覽列右上角頭像（所有頁面皆適用）
 * 若元素不存在（非對應頁面），靜默跳過。
 */
function _updateNavAvatar(user) {
  const wrap = document.getElementById('nav-user-avatar-wrap');
  const img  = document.getElementById('nav-user-avatar');
  if (!wrap || !img) return;
  if (user && user.photoURL) {
    img.src = user.photoURL;
    wrap.style.display = 'block';
  } else {
    wrap.style.display = 'none';
  }
}

/** 更新設定頁的登入狀態 UI（若元素存在） */
function _updateSyncUI(user) {
  const statusEl  = document.getElementById('sync-status');
  const loggedIn  = document.getElementById('sync-logged-in');
  const loggedOut = document.getElementById('sync-logged-out');
  if (!statusEl) return; // 非設定頁，不操作

  if (user) {
    if (loggedOut) loggedOut.style.display = 'none';
    if (loggedIn)  loggedIn.style.display  = 'block';
    const nameEl   = document.getElementById('sync-user-name');
    const emailEl  = document.getElementById('sync-user-email');
    const avatarEl = document.getElementById('sync-user-avatar');
    if (nameEl)   nameEl.textContent  = user.displayName || '使用者';
    if (emailEl)  emailEl.textContent = user.email || '';
    if (avatarEl && user.photoURL) {
      avatarEl.src = user.photoURL;
      avatarEl.style.display = 'block';
    }
    statusEl.textContent = '✅ 已登入';
    statusEl.className   = 'sync-status-badge success';
  } else {
    if (loggedIn)  loggedIn.style.display  = 'none';
    if (loggedOut) loggedOut.style.display = 'block';
    statusEl.textContent = '尚未登入';
    statusEl.className   = 'sync-status-badge';
  }
}

/* ===========================
   掛載至 window，供全域呼叫
   =========================== */
window._firebaseSync = { syncKey, syncAllToFirestore, fetchAndMergeFromFirestore };

// 將 Auth 操作函式也掛載到 window，讓 settings.html 的 inline script 可直接呼叫
window.signInWithGoogle  = signInWithGoogle;
window.signOutUser       = signOutUser;
window.syncAllToFirestore = syncAllToFirestore;

// 頁面載入後自動初始化
document.addEventListener('DOMContentLoaded', initFirebase);
