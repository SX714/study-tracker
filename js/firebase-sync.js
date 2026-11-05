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
 */
function initFirebase() {
  if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
    console.info('[firebase-sync] FIREBASE_CONFIG 尚未設定，雲端同步停用。');
    return;
  }
  try {
    _app  = firebase.initializeApp(FIREBASE_CONFIG);
    _auth = firebase.auth();
    _db   = firebase.firestore();

    // 監聽登入狀態
    _auth.onAuthStateChanged(async (user) => {
      if (user) {
        window._firebaseUser = user;
        _updateSyncUI(user);
        // 登入後先拉取雲端資料，再上傳本機資料
        await fetchAndMergeFromFirestore(user.uid);
        await syncAllToFirestore(user.uid);
      } else {
        window._firebaseUser = null;
        _updateSyncUI(null);
      }
    });
  } catch (err) {
    console.error('[firebase-sync] 初始化失敗：', err);
  }
}

/* ===========================
   Auth 操作
   =========================== */

/** Google OAuth 登入（彈出視窗） */
async function signInWithGoogle() {
  if (!_auth) { alert('Firebase 尚未初始化，請先設定 FIREBASE_CONFIG。'); return; }
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await _auth.signInWithPopup(provider);
  } catch (err) {
    console.error('[firebase-sync] Google 登入失敗：', err);
    alert('登入失敗：' + err.message);
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
   掛載至 window，供 utils.js 使用
   =========================== */
window._firebaseSync = { syncKey, syncAllToFirestore, fetchAndMergeFromFirestore };

// 頁面載入後自動初始化
document.addEventListener('DOMContentLoaded', initFirebase);
