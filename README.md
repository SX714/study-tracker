# Study Tracker

> 個人學習追蹤網站 — 純前端、無後端依賴，使用 localStorage 持久化資料。

## 功能特色

- 🍅 **番茄鐘 + 自由計時** — 兩種模式可切換，計時後自動記錄
- 📚 **科目管理** — 自訂名稱、emoji、顏色、優先等級、每日目標時數
- 📊 **統計圖表** — Chart.js 繪製每日／每週趨勢與科目分佈
- 🎯 **目標計畫** — 設定每週／每月目標，追蹤達成進度
- 🤖 **AI 問答助理** — 內建 Gemini AI，支援情境感知與連續對話
- 📱 **RWD 響應式** — 桌面與手機皆可流暢使用

## 頁面結構

| 頁面 | 說明 |
|------|------|
| `index.html` | 儀表板：今日摘要、快速計時、近期記錄 |
| `subjects.html` | 科目管理：新增／編輯／刪除科目 |
| `timer.html` | 計時器：番茄鐘 + 自由計時 |
| `stats.html` | 統計圖表：Chart.js 三圖 + 統計表 |
| `goals.html` | 目標計畫：週／月目標設定與進度追蹤 |
| `settings.html` | 設定：Gemini API Key、番茄鐘預設值 |

## 快速開始

1. Clone 或下載此專案
2. 直接用瀏覽器開啟 `index.html`（無需 server）
3. 前往 `settings.html` 填入 Gemini API Key 以啟用 AI 功能

## 技術棧

- HTML5 + CSS3 + Vanilla JavaScript
- [Chart.js](https://www.chartjs.org/)（CDN）
- [Gemini REST API](https://ai.google.dev/)（gemini-2.0-flash）
- localStorage（無需資料庫）

## 文件

- 📄 [產品需求文件（PRD）](docs/PRD.md)
- 📋 [開發計畫](study-tracker-prd-plan.md)

## 開發狀態

| Phase | 說明 | 狀態 |
|-------|------|------|
| Phase 1 | 專案骨架與共用基礎 | ⏳ pending |
| Phase 2 | 科目管理 | ⏳ pending |
| Phase 3 | 計時器 | ⏳ pending |
| Phase 4 | 統計圖表 | ⏳ pending |
| Phase 5 | 目標計畫 | ⏳ pending |
| Phase 6 | AI 問答助理 + 設定頁 | ⏳ pending |
| Phase 7 | 儀表板與全站整合 | ⏳ pending |
