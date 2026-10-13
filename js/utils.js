/**
 * utils.js — Study Tracker 共用工具函式
 * 所有頁面皆引入此檔案
 */

/* ===========================
   localStorage 工具
   =========================== */

/**
 * 讀取 localStorage 資料，若不存在則回傳 fallback
 * @param {string} key
 * @param {*} fallback
 */
function loadData(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 寫入 localStorage
 * @param {string} key
 * @param {*} value
 */
function saveData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ===========================
   ID 產生器
   =========================== */

/**
 * 產生簡易唯一 ID（時間戳 + 隨機碼）
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ===========================
   日期工具
   =========================== */

/**
 * 取得 YYYY-MM-DD 格式日期字串
 * @param {Date} date
 * @returns {string}
 */
function toDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 格式化為繁體中文日期（例：2025/1/1）
 * @param {string|Date} date
 * @returns {string}
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('zh-TW');
}

/**
 * 取得本週的起訖日期（週一～週日）
 * @returns {{ start: string, end: string }}
 */
function getThisWeekRange() {
  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay(); // 週日視為第7天
  const start = new Date(now);
  start.setDate(now.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start: toDateStr(start), end: toDateStr(end) };
}

/**
 * 取得本月的起訖日期
 * @returns {{ start: string, end: string }}
 */
function getThisMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toDateStr(start), end: toDateStr(end) };
}

/**
 * 判斷某日期字串是否在指定範圍內
 * @param {string} dateStr YYYY-MM-DD
 * @param {string} start   YYYY-MM-DD
 * @param {string} end     YYYY-MM-DD
 * @returns {boolean}
 */
function isInRange(dateStr, start, end) {
  return dateStr >= start && dateStr <= end;
}

/* ===========================
   時間格式化
   =========================== */

/**
 * 將分鐘數轉為 Xh Ym 字串（例：90 → "1h 30m"）
 * @param {number} minutes
 * @returns {string}
 */
function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/* ===========================
   導覽列初始化（高亮當前頁面）
   =========================== */

/**
 * 依據當前 URL 為對應的 nav 連結加上 active class
 */
function initNavActive() {
  const current = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === current) link.classList.add('active');
  });
}

/**
 * 漢堡選單開關
 */
function initHamburger() {
  const btn = document.querySelector('.nav-hamburger');
  const links = document.querySelector('.nav-links');
  if (!btn || !links) return;
  btn.addEventListener('click', () => links.classList.toggle('open'));
}

// 頁面載入後自動初始化導覽列 + 首次訪問預設科目
document.addEventListener('DOMContentLoaded', () => {
  initNavActive();
  initHamburger();
  initDefaultSubjects();
});

/**
 * 首次訪問時預置 3 筆預設科目（只在 st_subjects 尚未存在時執行）
 */
function initDefaultSubjects() {
  if (localStorage.getItem('st_subjects') !== null) return; // 已有資料，跳過
  const defaults = [
    { id: generateId(), name: '數學',   emoji: '➗', color: '#4a9eff',
      dailyTargetMinutes: 60,  priority: 'high',   note: '', createdAt: new Date().toISOString() },
    { id: generateId(), name: '英文',   emoji: '📖', color: '#8e44ad',
      dailyTargetMinutes: 45,  priority: 'medium', note: '', createdAt: new Date().toISOString() },
    { id: generateId(), name: '程式設計', emoji: '💻', color: '#27ae60',
      dailyTargetMinutes: 90,  priority: 'high',   note: '', createdAt: new Date().toISOString() },
  ];
  localStorage.setItem('st_subjects', JSON.stringify(defaults));
}
