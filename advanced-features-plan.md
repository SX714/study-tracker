# Study Tracker — 進階功能計畫

## 頂層概覽

### 目標
在已完成的 Study Tracker MVP 基礎上，新增三項進階功能：
1. **深色模式**：預設跟隨系統設定，使用者可在設定頁手動覆蓋並記憶偏好。
2. **學習日記**：計時器結束後彈出日記記錄提示，並有獨立的日記清單頁面。
3. **Firebase 多裝置同步**：Google/Email 登入，Firestore 儲存雲端資料，localStorage 作為離線快取，上線後自動同步。

### 範圍
- 不修改現有功能邏輯
- 深色模式：純 CSS/JS，無新頁面
- 學習日記：新增 `diary.html` + `js/diary.js` + 修改 `timer.html`
- Firebase：新增 `js/firebase-sync.js`，修改所有頁面引用與資料操作

### 方法
三個功能依序處理，每個功能為一個獨立 Phase，確保每次改動範圍聚焦可審查。

---

## Phase 8 — 深色模式

### Intent
為全站加入深色模式支援。利用現有 CSS `:root` 自訂屬性，在 `body` 加上 `.dark` class 即可全站切換。預設跟隨系統 `prefers-color-scheme`，設定頁新增手動切換選項，使用者偏好儲存於 `st_settings.themeMode`。

### Expected Outcomes
- 所有頁面在深色模式下有正確的深色背景與適當的文字對比
- 設定頁「外觀設定」section 可三向切換（跟隨系統 / 淺色 / 深色）
- 切換後立即生效，重新整理後維持使用者選擇
- AI 聊天視窗（`ai-chat.js` 注入的樣式）也支援深色模式

### Todo List
- [ ] **CSS**：在 `css/style.css` 的 `:root` 後面加入 `body.dark` CSS class，覆蓋背景、表面、文字、邊框等色彩變數（深色調）
- [ ] **CSS**：處理 hard-coded 色彩（nav brand `#fff`、badge 背景等），改為變數或加入 `.dark` 覆蓋規則
- [ ] **CSS**：在 `js/ai-chat.js` 的注入樣式中加入 `body.dark` 覆蓋，讓聊天視窗也支援深色
- [ ] **JS (`js/utils.js`)**：新增 `initTheme()` 函式：讀取 `st_settings.themeMode`，若無設定則偵測 `prefers-color-scheme`，套用 `body.dark` 或移除；並監聽系統主題變更事件（當 `themeMode === 'system'` 時）
- [ ] **所有 HTML 頁面**（6 頁）：在 `<body>` 初始化腳本中呼叫 `initTheme()`（在 DOM 內容讀取前，避免閃爍）
- [ ] **`settings.html`**：新增「🎨 外觀設定」section，包含三選一的 radio button（跟隨系統 / 淺色模式 / 深色模式），選擇後更新 `st_settings.themeMode` 並呼叫 `initTheme()`

### Relevant Context
- `css/style.css` 第 4-24 行：現有 `:root` 變數定義
- `css/style.css` 第 78、134 行：hard-coded `#fff` 需處理
- `css/style.css` 第 291-296 行：badge 顏色需處理
- `js/utils.js`：`loadData/saveData` 模式；`initNavActive/initHamburger` 為參考範例
- `js/ai-chat.js` 第 230-485 行：注入的內聯樣式
- `settings.html`：現有 3 個 section，新增第 4 個

### Status
[x] done

---

## Phase 9 — 學習日記

### Intent
讓使用者在每次計時結束後記錄學習心得，強化反思習慣。日記資料儲存於 `st_diary`（localStorage），未來 Phase 10 可同步至 Firestore。

### Expected Outcomes
- 計時器（番茄鐘或自由計時）結束後，彈出「記錄學習心得」Modal
- Modal 包含：本次計時摘要（科目、時長）、心得文字輸入、心情評分（1-5 星）、可選擇跳過
- `diary.html` 新頁面：顯示所有日記清單，依日期分組，可依科目篩選，可查看與刪除
- 日記資料結構：`{ id, sessionId, subjectId, content, mood, createdAt }`
- 導覽列加入「📓 日記」入口連結

### Todo List
- [ ] **資料模型**：在 `js/utils.js` 確認 `st_diary` 的 `loadData/saveData` 介面可直接使用（無需改動）
- [ ] **`timer.html`**：在計時完成後（`completeSession` 函式呼叫後）觸發日記記錄 Modal；Modal 顯示本次摘要（科目名稱、時長）、心得 textarea（選填）、心情評分（5 顆星點選）、「儲存」與「跳過」按鈕
- [ ] **`timer.html`**：儲存日記時，呼叫 `saveData('st_diary', ...)` 將新日記物件 push 進陣列
- [ ] **新增 `diary.html`**：頁面骨架（nav、footer、ai-chat）、日期分組的日記清單、科目篩選下拉選單、每筆日記顯示：日期、科目 emoji+名稱、心情星星、心得內容、編輯與刪除按鈕
- [ ] **新增 `js/diary.js`**：日記清單渲染邏輯、科目篩選、刪除功能、編輯 Modal（預填現有內容、心情評分、心得 textarea，儲存後更新 `st_diary` 中的對應項目）
- [ ] **所有 HTML 頁面（nav）**：在導覽列 `<ul>` 中加入「📓 日記 (`diary.html`)」連結（7 個連結）
- [ ] **`css/style.css`**：視需要加入日記相關元件樣式（心情星星評分、日記卡片）

### Relevant Context
- `timer.html`：找到 `completeSession` 或計時完成的觸發點（inline script）
- `js/utils.js`：`generateId()`、`loadData/saveData` 可直接使用
- `subjects.html` 的 Modal 結構：參考 Modal 實作方式
- `index.html` nav 結構（第 11-27 行）：要在 6 個頁面的 nav 加入日記連結

### Status
[x] done

---

## Phase 10 — Firebase 多裝置同步

### Intent
為應用程式加入雲端同步能力。使用 Firebase Auth 提供 Google/Email 登入，Firestore 儲存所有使用者資料。localStorage 繼續作為本機快取（離線可用），每次資料變更時非同步同步至 Firestore，登入後自動從雲端拉取最新資料。

### Expected Outcomes
- 設定頁（或 nav）顯示登入/登出按鈕，支援 Google OAuth 登入
- 登入後，既有 localStorage 資料自動上傳至 Firestore（首次同步）
- `subjects`、`sessions`、`goals`、`diary` 的寫入操作在儲存 localStorage 後，也同步寫入 Firestore
- 從其他裝置登入後，可拉取雲端資料並合併到 localStorage
- 登出後，應用程式退回純 localStorage 模式（資料仍保留本機）
- 無 Firebase 設定時（未配置 `firebaseConfig`），應用程式仍可完整使用（降級模式）

### Todo List
- [ ] **Firebase 設定寫死於程式碼**：在 `js/firebase-sync.js` 頂部直接寫入 `const FIREBASE_CONFIG = { apiKey, authDomain, projectId, ... }`（使用者需自行替換為自己的 Firebase 專案值，或由開發者統一配置）
- [ ] **新增 `js/firebase-sync.js`**：使用頂部的 `FIREBASE_CONFIG` 初始化 Firebase App + Auth + Firestore；`initFirebase()` 函式（無需傳入 config）；`signInWithGoogle()`、`signInWithEmail(email, password)`、`signOut()` 函式；`syncToFirestore(uid, key, data)` 非同步寫入；`fetchFromFirestore(uid, key)` 拉取資料
- [ ] **修改 `js/utils.js`**：`saveData(key, value)` 在寫入 localStorage 後，若 Firebase 已初始化且使用者已登入，非同步呼叫 `syncToFirestore`（不阻塞 UI）
- [ ] **`settings.html`**：新增「☁️ 雲端同步」section：Google 登入按鈕、登入狀態顯示（使用者 email/名稱）、手動「立即同步」按鈕、登出按鈕（不包含 Firebase 設定輸入欄，設定已寫死於程式碼）
- [ ] **登入後資料拉取**：使用者登入成功後，從 Firestore 拉取 `subjects`、`sessions`、`goals`、`diary`，與 localStorage 合併（以 `id` 為 key，Firestore 資料優先覆蓋）
- [ ] **所有 HTML 頁面**：在 `</body>` 前加入 Firebase SDK 引用（`firebase-app.js`、`firebase-auth.js`、`firebase-firestore.js`，使用 CDN compat 版本），並引入 `js/firebase-sync.js`
- [ ] **`css/style.css`**：加入登入狀態顯示、雲端同步按鈕的樣式（可複用現有 `.btn` 元件）

### Relevant Context
- `js/utils.js`：`saveData(key, value)` 是唯一的資料寫入入口，是加入同步 hook 的理想位置
- `settings.html`：現有 section 結構，新增第 5 個 section（Phase 8 後為第 5 個，Phase 9 後 nav 有 7 連結）
- Firebase CDN (compat v9): `https://www.gstatic.com/firebasejs/10.x.x/firebase-app-compat.js`
- Firestore 資料路徑設計: `users/{uid}/subjects`, `users/{uid}/sessions`, `users/{uid}/goals`, `users/{uid}/diary`

### Status
[x] done

---

## 狀態追蹤

| Phase | 功能 | 狀態 |
|-------|------|------|
| Phase 1-7 | MVP 全部功能 | [x] done |
| Phase 8 | 深色模式 | [x] done |
| Phase 9 | 學習日記 | [x] done |
| Phase 10 | Firebase 多裝置同步 | [x] done |
