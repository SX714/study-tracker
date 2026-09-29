# Study Tracker — 產品需求文件（PRD）

> **版本：** v1.0  
> **建立日期：** 2025-01-01  
> **狀態：** 已核准，待實作

---

## 一、專案目標

在 `study-tracker/` 資料夾內從零建立一個**純前端、無後端依賴**的個人學習追蹤網站。  
所有資料透過瀏覽器 `localStorage` 持久化，支援桌面與手機 RWD 響應式設計，並內建 Gemini AI 問答助理。

---

## 二、核心使用情境

| # | 使用情境 |
|---|---------|
| 1 | 學生啟動番茄鐘或自由計時，針對特定科目累積學習時數 |
| 2 | 透過統計圖表檢視每日／每週學習趨勢，了解各科目時間分配 |
| 3 | 設定每週／每月目標，追蹤目標達成進度 |
| 4 | 管理學習科目（名稱、emoji、顏色、優先等級、每日目標時數）|
| 5 | 隨時透過 AI 問答助理針對學習內容提問，支援連續對話與情境感知 |

---

## 三、技術選型

| 技術 | 用途 |
|------|------|
| HTML + CSS + Vanilla JavaScript | 純前端，無框架依賴 |
| Chart.js（CDN 引入） | 統計圖表（Bar / Line / Doughnut）|
| Gemini REST API（gemini-2.0-flash）| AI 問答助理 |
| localStorage | 所有資料持久化（含 API Key 設定）|

色系與元件風格：深藍 `#1e3a5f` / 淺藍 `#4a9eff`（與上層專案一致）

---

## 四、頁面清單

| 頁面 | 檔案 | 功能摘要 |
|------|------|---------|
| 儀表板 | `index.html` | 今日摘要卡片、快速啟動計時器、近期記錄 |
| 科目管理 | `subjects.html` | 新增／編輯／刪除科目 |
| 計時器 | `timer.html` | 番茄鐘 + 自由計時兩種模式 |
| 統計圖表 | `stats.html` | 每日／每週圖表、科目時數分佈 |
| 目標計畫 | `goals.html` | 每週／每月目標設定與進度追蹤 |
| 設定 | `settings.html` | Gemini API Key 設定、番茄鐘預設值 |

---

## 五、資料模型設計（localStorage）

### 5.1 鍵名總覽

| 鍵名 | 型別 | 用途 |
|------|------|------|
| `st_subjects` | `Subject[]` | 科目清單 |
| `st_sessions` | `Session[]` | 每次計時記錄 |
| `st_goals` | `Goal[]` | 學習目標清單 |
| `st_settings` | `Settings` | 全域設定（番茄鐘時長、API Key）|
| `st_ai_history` | `Message[]` | AI 對話歷史（最近 50 則）|

### 5.2 Subject（科目）

```json
{
  "id": "uuid-v4-string",
  "name": "數學",
  "emoji": "➗",
  "color": "#8e44ad",
  "dailyTargetMinutes": 60,
  "priority": "high",
  "note": "重點複習函數與微積分",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

- `priority`: `"high" | "medium" | "low"`

### 5.3 Session（學習記錄）

```json
{
  "id": "uuid-v4-string",
  "subjectId": "subject-uuid",
  "mode": "pomodoro",
  "startAt": "2024-01-01T09:00:00.000Z",
  "durationMinutes": 25,
  "completed": true
}
```

- `mode`: `"pomodoro" | "free"`
- `completed`: 番茄鐘是否完整跑完（未中斷為 `true`）

### 5.4 Goal（學習目標）

```json
{
  "id": "uuid-v4-string",
  "title": "一月數學衝刺",
  "subjectId": "subject-uuid-or-null",
  "targetMinutes": 1200,
  "period": "monthly",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

- `period`: `"weekly" | "monthly"`
- `subjectId` 為 `null` 表示「所有科目總計」

### 5.5 Settings（設定）

```json
{
  "pomodoroMinutes": 25,
  "shortBreakMinutes": 5,
  "longBreakMinutes": 15,
  "longBreakInterval": 4,
  "geminiApiKey": ""
}
```

### 5.6 AI Message（對話訊息）

```json
{
  "role": "user",
  "text": "幫我解釋等差數列的公式",
  "context": {
    "subjectName": "數學",
    "page": "timer"
  },
  "timestamp": "2024-01-01T09:05:00.000Z"
}
```

- `role`: `"user" | "model"`
- `context.page`: 發問當下所在頁面（用於情境感知 System Prompt）
- `context.subjectName`: 當前選擇科目（可為 `null`）
- 對話歷史最多保留最近 50 則，超過自動捨棄最舊的

---

## 六、頁面結構設計

### 6.0 共用結構（所有頁面）

- `<nav>` 頂部導覽列：logo + 6 頁連結 + 設定圖示 + 漢堡選單（手機版）
- `<main>` 主內容區
- `<footer>` 底部版權
- **AI 浮鈕**：右下角固定 💬 按鈕，點擊展開聊天視窗（由 `js/ai-chat.js` 動態注入）
- 共用樣式：`css/style.css`
- 共用工具：`js/utils.js`（localStorage 操作、uuid 產生、日期格式化）
- 共用 AI 模組：`js/ai-chat.js`（浮鈕、聊天視窗、Gemini API 呼叫）

### 6.1 index.html（儀表板）

```
<main>
  ├── .summary-grid（4 卡片：今日時數、本週時數、完成番茄數、目標達成率）
  ├── .quick-timer（選擇科目 + 啟動按鈕 → 跳轉 timer.html）
  ├── .recent-sessions（最近 5 筆記錄列表）
  └── .goal-progress（進行中目標進度條）
```

### 6.2 subjects.html（科目管理）

```
<main>
  ├── .page-header（標題 + 新增科目按鈕）
  ├── .subjects-grid（科目卡片列表）
  │   └── .subject-card（emoji + 名稱 + 今日進度條 + 編輯/刪除）
  └── #subject-modal（新增/編輯 Modal：名稱、emoji、顏色選擇器、目標時數、優先等級、備註）
```

### 6.3 timer.html（計時器）

```
<main>
  ├── .timer-mode-switch（番茄鐘 / 自由計時 切換 Tab）
  ├── .subject-selector（下拉選擇科目，必選）
  ├── .timer-display（大字時間顯示 MM:SS）
  ├── .timer-controls（開始 / 暫停 / 重置 按鈕）
  ├── .pomodoro-indicator（番茄進度圓圈，4 個）
  └── .session-log（本次工作階段的已完成番茄列表）
```

### 6.4 stats.html（統計圖表）

```
<main>
  ├── .date-range-filter（本週 / 本月 / 自訂 切換）
  ├── .chart-grid
  │   ├── .chart-card（每日學習時數長條圖 — Chart.js Bar）
  │   ├── .chart-card（每週趨勢折線圖 — Chart.js Line）
  │   └── .chart-card（科目時數分佈圓餅圖 — Chart.js Doughnut）
  └── .stats-table（詳細科目統計表：時數、次數、平均每次）
```

### 6.5 goals.html（目標計畫）

```
<main>
  ├── .page-header（標題 + 新增目標按鈕）
  ├── .goals-tabs（進行中 / 已完成 Tab）
  ├── .goals-list
  │   └── .goal-card（標題 + 科目標籤 + 進度條 + 剩餘天數 + 編輯/刪除）
  └── #goal-modal（新增/編輯 Modal：標題、科目、目標時數、週期、起訖日期）
```

### 6.6 settings.html（設定）

```
<main>
  ├── .settings-section（AI 設定）
  │   ├── Gemini API Key 輸入欄（type=password + 顯示/隱藏切換）
  │   └── 連線測試按鈕（呼叫 Gemini 確認 Key 有效）
  └── .settings-section（計時器預設值）
      ├── 番茄鐘時長（分鐘 input）
      ├── 短休息時長（分鐘 input）
      ├── 長休息時長（分鐘 input）
      └── 長休息間隔（幾輪後 input）
```

### 6.7 AI 聊天視窗（注入所有頁面）

```
#ai-chat-widget（js/ai-chat.js 動態注入）
  ├── .ai-fab（右下角圓形浮鈕 💬）
  └── .ai-chat-window（展開後的聊天視窗）
      ├── .ai-chat-header（標題 + 情境標籤 + 關閉按鈕）
      ├── .ai-chat-messages（對話氣泡列表）
      │   ├── .msg-user（使用者訊息，右對齊）
      │   └── .msg-model（AI 回覆，左對齊，支援換行）
      ├── .ai-chat-input-area（輸入框 + 送出按鈕）
      └── .ai-chat-no-key（未設定 API Key 時的提示 + 跳轉設定頁按鈕）
```

---

## 七、分階段開發規劃

### Phase 1 — 專案骨架與共用基礎

**目標：** 建立完整的專案骨架，所有頁面可正常瀏覽，共用基礎樣式與工具函式就位。

**子任務：**
- [ ] 建立 `css/`、`js/` 目錄結構
- [ ] 撰寫 `css/style.css`（導覽列、卡片、按鈕、AI 浮鈕、RWD 斷點）
- [ ] 撰寫 `js/utils.js`（`generateId()`、`loadData()`、`saveData()`、日期工具函式）
- [ ] 建立 6 個 HTML 檔案骨架（含共用 nav、footer）
- [ ] 預置 3 筆預設科目到 `localStorage`（首次訪問時初始化）

**完成標準：** 所有頁面可在瀏覽器打開，導覽列連結正常切換，無 JS 錯誤。

---

### Phase 2 — 科目管理（subjects.html）

**目標：** 完整的 CRUD 科目管理功能。

**子任務：**
- [ ] 渲染科目卡片列表（從 `st_subjects` 讀取）
- [ ] 新增科目 Modal（emoji 選擇器、顏色選擇器、優先等級 radio）
- [ ] 編輯科目（預填表單資料）
- [ ] 刪除科目（含確認提示）
- [ ] 儲存至 `localStorage` 並重新渲染

**完成標準：** 可新增、編輯、刪除科目，重新整理後資料持久存在。

---

### Phase 3 — 計時器（timer.html）

**目標：** 番茄鐘與自由計時兩種模式，完整計時與記錄儲存。

**子任務：**
- [ ] 模式切換 Tab（番茄鐘 / 自由計時）
- [ ] 科目選擇下拉選單（讀取 `st_subjects`）
- [ ] 番茄鐘倒數計時邏輯（25 min → 短休息 5 min → 長休息 15 min，可設定）
- [ ] 自由計時正向計時邏輯（開始 / 暫停 / 停止）
- [ ] 計時完成後儲存 `Session` 至 `st_sessions`
- [ ] 番茄進度圓圈指示（4 個）
- [ ] 瀏覽器 `Notification` API 提示（需使用者授權）

**完成標準：** 番茄鐘完整跑完後自動切換休息，自由計時可隨時停止，兩種模式皆儲存記錄。

---

### Phase 4 — 統計圖表（stats.html）

**目標：** 透過 Chart.js 視覺化學習數據。

**子任務：**
- [ ] 日期範圍篩選器（本週 / 本月 / 自訂日期）
- [ ] 每日學習時數長條圖（Chart.js Bar，X 軸為日期）
- [ ] 每週趨勢折線圖（Chart.js Line，X 軸為週次）
- [ ] 科目時數分佈圓餅圖（Chart.js Doughnut，使用各科目 color）
- [ ] 詳細統計表格（各科目總時數、學習次數、平均每次時長）
- [ ] 篩選切換時重新繪製圖表

**完成標準：** 三張圖表正確反映 `st_sessions` 的資料，切換日期範圍後圖表即時更新。

---

### Phase 5 — 目標計畫（goals.html）

**目標：** 設定每週／每月學習目標並追蹤進度。

**子任務：**
- [ ] 讀取並渲染目標卡片（進行中 / 已完成 Tab 切換）
- [ ] 新增目標 Modal（標題、科目、目標時數、週期、起訖日期）
- [ ] 進度計算邏輯（查詢符合日期範圍與科目的 `st_sessions` 累計時數）
- [ ] 進度條視覺化（百分比 + 已完成 badge）
- [ ] 目標到期自動標記為完成
- [ ] 編輯 / 刪除目標

**完成標準：** 新增目標後，計時器完成一次計時即可看到進度條更新。

---

### Phase 6 — AI 問答助理（ai-chat.js + settings.html）

**目標：** 在所有頁面注入 AI 聊天浮鈕，透過 Gemini API 提供情境感知問答，並設定 API Key。

**子任務：**
- [ ] `settings.html`：API Key 輸入表單、儲存至 `st_settings`、連線測試按鈕
- [ ] `js/ai-chat.js`：動態注入浮鈕 + 聊天視窗 DOM 到所有頁面
- [ ] 未設定 API Key 時顯示提示，引導前往設定頁
- [ ] 讀取當前頁面與科目作為情境，組成 System Prompt
- [ ] 呼叫 `gemini-2.0-flash` REST API（POST /v1beta/models/gemini-2.0-flash:generateContent）
- [ ] 傳入最近 10 則對話歷史實現連續追問
- [ ] 對話歷史儲存至 `st_ai_history`（保留最近 50 則）
- [ ] 手機版聊天視窗全屏展開

**完成標準：** 在任一頁面點擊浮鈕可開啟聊天，可連續追問，AI 回覆能感知當前學習情境。

---

### Phase 7 — 儀表板（index.html）與全站整合

**目標：** 儀表板整合所有模組資料，完成 RWD 調整與跨頁面測試。

**子任務：**
- [ ] 今日摘要 4 卡片（從 `st_sessions` 計算當日數據）
- [ ] 快速啟動計時器（選科目後跳轉 `timer.html?subject=id`）
- [ ] 近期 5 筆學習記錄列表
- [ ] 進行中目標進度條（讀取 `st_goals`）
- [ ] 全站 RWD 調整（手機版導覽列漢堡選單、卡片單欄排列）
- [ ] 跨頁面端對端功能測試（計時 → 記錄出現在統計 → 目標進度更新 → AI 問答情境正確）

**完成標準：** 儀表板正確顯示當日資料，手機版瀏覽無版面跑版，完整使用流程順暢。

---

## 八、檔案結構規劃

```
study-tracker/
├── index.html          # 儀表板
├── subjects.html       # 科目管理
├── timer.html          # 計時器
├── stats.html          # 統計圖表
├── goals.html          # 目標計畫
├── settings.html       # 設定（API Key + 番茄鐘預設值）
├── css/
│   └── style.css       # 全站樣式（含 RWD、AI 浮鈕）
├── js/
│   ├── utils.js        # 共用工具（localStorage、uuid、日期）
│   ├── subjects.js     # 科目管理邏輯
│   ├── timer.js        # 計時器邏輯
│   ├── stats.js        # 圖表繪製邏輯
│   ├── goals.js        # 目標計畫邏輯
│   ├── settings.js     # 設定頁邏輯
│   └── ai-chat.js      # AI 聊天助理（注入所有頁面）
├── docs/
│   └── PRD.md          # 本文件（產品需求規格書）
└── README.md           # 專案說明
```
