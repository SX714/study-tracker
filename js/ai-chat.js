/**
 * ai-chat.js — Study Tracker AI 問答助理
 * 功能：右下角浮鈕 + 聊天視窗，Gemini REST API，話題管理，歷史查看與選擇性清除
 */
(function () {
  'use strict';

  /* ===========================
     常數
     =========================== */
  const GEMINI_API_URL =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
  const CTX_HISTORY   = 10;              // Gemini 每次帶入最近 10 則
  const HISTORY_KEY   = 'st_ai_history'; // [{ id, topicId, role, text, timestamp }]
  const TOPICS_KEY    = 'st_ai_topics';  // [{ id, title, createdAt, page }]
  const SETTINGS_KEY  = 'st_settings';

  /* ===========================
     localStorage 工具
     =========================== */
  function getApiKey() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').geminiApiKey || ''; }
    catch { return ''; }
  }
  function loadHistory()         { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } }
  function saveHistory(h)        { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); }
  function loadTopics()          { try { return JSON.parse(localStorage.getItem(TOPICS_KEY)  || '[]'); } catch { return []; } }
  function saveTopics(t)         { localStorage.setItem(TOPICS_KEY,  JSON.stringify(t)); }

  /* ===========================
     頁面 / 情境
     =========================== */
  function getCurrentPage() {
    const f = location.pathname.split('/').pop() || 'index.html';
    return { 'index.html':'儀表板','subjects.html':'科目管理','timer.html':'計時器',
             'stats.html':'統計圖表','goals.html':'目標計畫','settings.html':'設定' }[f] || f;
  }
  function getCurrentSubject() {
    const sel = document.getElementById('subject-select');
    if (!sel?.value) return null;
    try { return JSON.parse(localStorage.getItem('st_subjects')||'[]').find(s=>s.id===sel.value)?.name||null; }
    catch { return null; }
  }
  function buildSystemPrompt() {
    const page = getCurrentPage(), sub = getCurrentSubject();
    return `你是 Study Tracker 的 AI 學習助理。請用繁體中文回答，回覆簡潔清楚。使用者目前在「${page}」頁面。`
      + (sub ? `\n使用者正在學習「${sub}」科目。` : '')
      + `\n請根據使用者的學習情境提供有幫助的回答，例如解題、概念解釋、學習建議等。`;
  }

  /** 讀取某科目的統計數據，組成可讀摘要字串 */
  function getSubjectStats(subjectId) {
    try {
      const subjects = JSON.parse(localStorage.getItem('st_subjects') || '[]');
      const sessions = JSON.parse(localStorage.getItem('st_sessions') || '[]');
      const goals    = JSON.parse(localStorage.getItem('st_goals')    || '[]');
      const sub      = subjects.find(s => s.id === subjectId);
      if (!sub) return null;

      const subSessions = sessions.filter(s => s.subjectId === subjectId);
      const totalMin    = subSessions.reduce((a, s) => a + (s.durationMinutes || 0), 0);
      const count       = subSessions.length;
      const pomodoros   = subSessions.filter(s => s.mode === 'pomodoro' && s.completed).length;

      // 本週
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
      weekStart.setHours(0, 0, 0, 0);
      const weekMin = subSessions
        .filter(s => new Date(s.startAt) >= weekStart)
        .reduce((a, s) => a + (s.durationMinutes || 0), 0);

      // 今日
      const todayStr = now.toISOString().slice(0, 10);
      const todayMin = subSessions
        .filter(s => s.startAt.startsWith(todayStr))
        .reduce((a, s) => a + (s.durationMinutes || 0), 0);

      // 進行中目標
      const todayDate = todayStr;
      const activeGoals = goals.filter(g =>
        g.endDate >= todayDate && (!g.subjectId || g.subjectId === subjectId));
      const goalLines = activeGoals.map(g => {
        const done = sessions
          .filter(s => s.startAt.slice(0,10) >= g.startDate && s.startAt.slice(0,10) <= g.endDate
            && (!g.subjectId || s.subjectId === subjectId))
          .reduce((a, s) => a + (s.durationMinutes || 0), 0);
        const pct = Math.min(100, Math.round(done / g.targetMinutes * 100));
        return `• ${g.title}：${pct}%（${Math.round(done/60*10)/10}h / ${Math.round(g.targetMinutes/60*10)/10}h）`;
      });

      const fmtMin = m => m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`;

      return [
        `【${sub.emoji || ''} ${sub.name} 學習統計】`,
        `• 累計總時數：${fmtMin(totalMin)}（共 ${count} 次）`,
        `• 今日學習：${fmtMin(todayMin)}`,
        `• 本週學習：${fmtMin(weekMin)}`,
        `• 完成番茄數：${pomodoros} 🍅`,
        `• 每日目標：${sub.dailyTargetMinutes ? fmtMin(sub.dailyTargetMinutes) : '未設定'}`,
        goalLines.length ? `\n【目標進度】\n${goalLines.join('\n')}` : ''
      ].filter(Boolean).join('\n');
    } catch { return null; }
  }

  /* ===========================
     Gemini API
     =========================== */
  async function callGemini(userText, topicMessages) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('NO_KEY');
    const recent = topicMessages.slice(-CTX_HISTORY);
    const contents = [
      { role:'user',  parts:[{ text: buildSystemPrompt() }] },
      { role:'model', parts:[{ text:'好的，我了解。請問有什麼我可以幫你的？' }] },
      ...recent.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
      { role:'user',  parts:[{ text: userText }] }
    ];
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ contents })
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message||`HTTP ${res.status}`); }
    return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '（無回應）';
  }

  /* ===========================
     狀態
     =========================== */
  let viewMode      = 'chat';     // 'chat' | 'history'
  let activeTopicId = null;       // 目前使用的話題 ID
  let isNewTopic    = true;       // 本次是否為全新話題

  /* ===========================
     DOM 注入
     =========================== */
  function injectWidget() {
    if (document.getElementById('ai-chat-widget')) return;
    const w = document.createElement('div');
    w.id = 'ai-chat-widget';
    w.innerHTML = `
      <button id="ai-fab" aria-label="開啟 AI 助理" title="AI 學習助理">💬</button>

      <div id="ai-chat-window" aria-hidden="true">
        <!-- Header -->
        <div id="ai-chat-header">
          <div id="ai-chat-header-left">
            <span id="ai-chat-icon">🤖</span>
            <div>
              <div id="ai-chat-title">AI 學習助理</div>
              <div id="ai-chat-context"></div>
            </div>
          </div>
          <div id="ai-chat-header-right">
            <button id="ai-new-topic-btn" title="開啟新話題">✏️</button>
            <button id="ai-chat-history-btn" title="查看歷史">🕘</button>
            <button id="ai-chat-close" title="關閉">✕</button>
          </div>
        </div>

        <!-- 話題選擇橫幅（首次開啟或切換話題時顯示） -->
        <div id="ai-topic-picker">
          <div id="ai-topic-picker-title">💬 選擇對話方式</div>
          <button class="ai-topic-choice" id="ai-pick-new">
            <span class="ai-topic-choice-icon">✨</span>
            <div>
              <div class="ai-topic-choice-label">開啟新話題</div>
              <div class="ai-topic-choice-sub">全新開始，不帶入過去對話</div>
            </div>
          </button>
          <button class="ai-topic-choice" id="ai-pick-continue">
            <span class="ai-topic-choice-icon">🔁</span>
            <div>
              <div class="ai-topic-choice-label">延續上次話題</div>
              <div class="ai-topic-choice-sub" id="ai-last-topic-sub">載入中…</div>
            </div>
          </button>
        </div>

        <!-- Tab -->
        <div id="ai-view-tabs" style="display:none;">
          <button class="ai-tab active" data-view="chat">目前對話</button>
          <button class="ai-tab" data-view="history">全部歷史</button>
        </div>

        <!-- 訊息區 -->
        <div id="ai-chat-messages"></div>

        <!-- 未設定 Key -->
        <div id="ai-no-key">
          <div style="font-size:2rem;margin-bottom:12px;">🔑</div>
          <p>尚未設定 Gemini API Key</p>
          <a href="settings.html" id="ai-go-settings">前往設定</a>
        </div>

        <!-- 輸入區 -->
        <div id="ai-chat-input-area">
          <div id="ai-topic-label-bar">
            <span id="ai-topic-label-text">話題：新對話</span>
            <button id="ai-stats-btn" title="讀取科目統計數據">📊 插入統計</button>
          </div>
          <!-- 科目統計快捷列（點擊「插入統計」後展開） -->
          <div id="ai-stats-picker" style="display:none;"></div>
          <div id="ai-input-row">
            <textarea id="ai-chat-input" placeholder="輸入問題，Enter 送出…" rows="1" maxlength="2000"></textarea>
            <button id="ai-chat-send" title="送出">➤</button>
          </div>
        </div>
      </div>

      <!-- 歷史面板（覆蓋在聊天視窗上） -->
      <div id="ai-history-panel">
        <div id="ai-history-header">
          <span style="font-weight:700;">🕘 歷史對話</span>
          <button id="ai-history-close">✕</button>
        </div>
        <div id="ai-history-list"></div>
      </div>
    `;
    document.body.appendChild(w);
    injectStyles();
    bindEvents();
    updateContext();
  }

  /* ===========================
     樣式
     =========================== */
  function injectStyles() {
    if (document.getElementById('ai-chat-styles')) return;
    const s = document.createElement('style');
    s.id = 'ai-chat-styles';
    s.textContent = `
      /* ── 浮鈕 ── */
      #ai-fab {
        position:fixed; bottom:28px; right:28px; width:54px; height:54px;
        border-radius:50%; background:#4a9eff; color:#fff; font-size:1.4rem;
        border:none; cursor:pointer; box-shadow:0 4px 18px rgba(74,158,255,0.45);
        z-index:500; display:flex; align-items:center; justify-content:center;
        transition:background .2s, transform .2s;
      }
      #ai-fab:hover { background:#2d7dd2; transform:scale(1.08); }
      #ai-fab.open  { background:#2d7dd2; }

      /* ── 聊天視窗 ── */
      #ai-chat-window {
        position:fixed; bottom:96px; right:28px; width:360px; max-height:580px;
        background:#fff; border-radius:16px; box-shadow:0 8px 32px rgba(0,0,0,0.15);
        border:1px solid #e2e8f0; display:none; flex-direction:column; z-index:499; overflow:hidden;
      }
      #ai-chat-window.open { display:flex; }

      /* ── Header ── */
      #ai-chat-header {
        display:flex; align-items:center; justify-content:space-between;
        padding:12px 14px; background:#1e3a5f; color:#fff; flex-shrink:0;
      }
      #ai-chat-header-left  { display:flex; align-items:center; gap:10px; }
      #ai-chat-icon         { font-size:1.3rem; }
      #ai-chat-title        { font-size:0.92rem; font-weight:700; line-height:1.2; }
      #ai-chat-context      { font-size:0.7rem; color:rgba(255,255,255,0.6); margin-top:1px; }
      #ai-chat-header-right { display:flex; gap:5px; }
      #ai-chat-header-right button {
        background:rgba(255,255,255,0.15); border:none; color:#fff;
        width:28px; height:28px; border-radius:6px; cursor:pointer;
        font-size:0.85rem; display:flex; align-items:center; justify-content:center;
        transition:background .15s;
      }
      #ai-chat-header-right button:hover { background:rgba(255,255,255,0.28); }

      /* ── 話題選擇 ── */
      #ai-topic-picker {
        padding:14px 14px 10px;
        border-bottom:1px solid #e2e8f0;
        flex-shrink:0;
        background:#f8fafc;
      }
      #ai-topic-picker-title {
        font-size:0.8rem; font-weight:700; color:#5a6a7e;
        text-transform:uppercase; letter-spacing:.05em; margin-bottom:10px;
      }
      .ai-topic-choice {
        display:flex; align-items:center; gap:12px;
        width:100%; padding:10px 12px; border-radius:10px;
        border:1.5px solid #e2e8f0; background:#fff; cursor:pointer;
        text-align:left; margin-bottom:8px;
        transition:border-color .15s, background .15s;
      }
      .ai-topic-choice:hover { border-color:#4a9eff; background:#f0f7ff; }
      .ai-topic-choice-icon  { font-size:1.4rem; flex-shrink:0; }
      .ai-topic-choice-label { font-size:0.88rem; font-weight:600; color:#1a2332; }
      .ai-topic-choice-sub   { font-size:0.75rem; color:#94a3b8; margin-top:2px; }

      /* ── Tab ── */
      #ai-view-tabs {
        display:flex; border-bottom:1px solid #e2e8f0;
        background:#f8fafc; flex-shrink:0;
      }
      .ai-tab {
        flex:1; padding:8px 0; font-size:0.82rem; font-weight:600;
        border:none; background:none; cursor:pointer; color:#94a3b8;
        border-bottom:2px solid transparent; transition:color .15s, border-color .15s;
      }
      .ai-tab.active { color:#4a9eff; border-bottom-color:#4a9eff; background:#fff; }

      /* ── 訊息區 ── */
      #ai-chat-messages {
        flex:1; overflow-y:auto; padding:12px 12px 6px;
        display:flex; flex-direction:column; gap:8px; min-height:80px;
      }
      .ai-msg {
        max-width:86%; padding:9px 13px; border-radius:12px;
        font-size:0.875rem; line-height:1.55; word-break:break-word; white-space:pre-wrap;
      }
      .ai-msg.user  { align-self:flex-end; background:#4a9eff; color:#fff; border-bottom-right-radius:4px; }
      .ai-msg.model { align-self:flex-start; background:#f1f5f9; color:#1a2332; border-bottom-left-radius:4px; }
      .ai-msg.loading { align-self:flex-start; background:#f1f5f9; color:#94a3b8; }
      .ai-msg.error   { align-self:flex-start; background:#fee2e2; color:#b91c1c; }

      /* 日期分隔 */
      .ai-date-divider {
        display:flex; align-items:center; gap:8px;
        font-size:0.7rem; color:#94a3b8; margin:6px 0 2px;
      }
      .ai-date-divider::before, .ai-date-divider::after {
        content:''; flex:1; height:1px; background:#e2e8f0;
      }

      /* 空狀態 */
      #ai-chat-welcome {
        text-align:center; padding:20px 12px; color:#94a3b8; font-size:0.85rem;
      }
      #ai-chat-welcome .welcome-icon { font-size:2rem; margin-bottom:8px; }

      /* ── 未設定 Key ── */
      #ai-no-key {
        display:none; flex-direction:column; align-items:center; justify-content:center;
        padding:32px 20px; text-align:center; flex:1; color:#5a6a7e; font-size:0.88rem;
      }
      #ai-no-key p { margin-bottom:12px; }
      #ai-go-settings {
        background:#4a9eff; color:#fff; padding:8px 18px; border-radius:8px;
        font-size:0.85rem; font-weight:600; text-decoration:none; transition:background .15s;
      }
      #ai-go-settings:hover { background:#2d7dd2; }

      /* ── 輸入區 ── */
      #ai-chat-input-area {
        display:none; flex-direction:column;
        border-top:1px solid #e2e8f0; background:#f8fafc; flex-shrink:0;
      }
      #ai-topic-label-bar {
        padding:5px 12px 0;
        font-size:0.72rem; color:#94a3b8;
        display:flex; justify-content:space-between; align-items:center;
      }
      #ai-topic-label-text { font-style:italic; }
      #ai-stats-btn {
        font-size:0.72rem; font-weight:600; padding:2px 8px;
        border-radius:6px; border:1px solid #bfdbfe; background:#eff6ff;
        color:#1d4ed8; cursor:pointer; white-space:nowrap;
        transition:background .15s;
      }
      #ai-stats-btn:hover { background:#dbeafe; }

      /* 科目統計快捷列 */
      #ai-stats-picker {
        padding:6px 10px 4px;
        border-bottom:1px solid #e2e8f0;
        background:#f0f7ff;
      }
      #ai-stats-picker-title {
        font-size:0.7rem; color:#5a6a7e; font-weight:600;
        text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px;
      }
      #ai-stats-picker-btns {
        display:flex; flex-wrap:wrap; gap:5px;
      }
      .ai-stats-subject-btn {
        display:inline-flex; align-items:center; gap:4px;
        font-size:0.78rem; font-weight:600; padding:3px 10px;
        border-radius:100px; border:1.5px solid transparent;
        cursor:pointer; background:#fff; transition:border-color .15s, background .15s;
      }
      .ai-stats-subject-btn:hover { background:#e0f2fe; }
      .ai-stats-subject-btn.active { border-color:#4a9eff; background:#eff6ff; }
      #ai-input-row {
        display:flex; align-items:flex-end; gap:8px; padding:8px 12px 10px;
      }
      #ai-chat-input {
        flex:1; border:1.5px solid #e2e8f0; border-radius:10px;
        padding:8px 12px; font-size:0.875rem; resize:none; font-family:inherit;
        line-height:1.5; max-height:100px; overflow-y:auto;
        background:#fff; color:#1a2332; transition:border-color .15s;
      }
      #ai-chat-input:focus { outline:none; border-color:#4a9eff; box-shadow:0 0 0 3px rgba(74,158,255,0.12); }
      #ai-chat-send {
        width:36px; height:36px; border-radius:10px; background:#4a9eff;
        color:#fff; border:none; cursor:pointer; font-size:1rem;
        display:flex; align-items:center; justify-content:center; flex-shrink:0;
        transition:background .15s;
      }
      #ai-chat-send:hover    { background:#2d7dd2; }
      #ai-chat-send:disabled { background:#94a3b8; cursor:not-allowed; }

      /* ── 歷史面板 ── */
      #ai-history-panel {
        display:none; position:fixed; bottom:96px; right:28px;
        width:360px; max-height:580px; background:#fff;
        border-radius:16px; box-shadow:0 8px 32px rgba(0,0,0,0.18);
        border:1px solid #e2e8f0; flex-direction:column; z-index:600; overflow:hidden;
      }
      #ai-history-panel.open { display:flex; }
      #ai-history-header {
        display:flex; justify-content:space-between; align-items:center;
        padding:12px 16px; background:#1e3a5f; color:#fff; font-size:0.92rem; flex-shrink:0;
      }
      #ai-history-close {
        background:rgba(255,255,255,0.15); border:none; color:#fff;
        width:28px; height:28px; border-radius:6px; cursor:pointer; font-size:0.9rem;
        display:flex; align-items:center; justify-content:center;
      }
      #ai-history-close:hover { background:rgba(255,255,255,0.28); }
      #ai-history-list {
        flex:1; overflow-y:auto; padding:10px 12px;
      }
      /* 話題區塊 */
      .ai-history-topic {
        border:1px solid #e2e8f0; border-radius:10px; margin-bottom:10px; overflow:hidden;
      }
      .ai-history-topic-header {
        display:flex; justify-content:space-between; align-items:center;
        padding:9px 12px; background:#f8fafc; cursor:pointer;
        transition:background .15s;
      }
      .ai-history-topic-header:hover { background:#eef2ff; }
      .ai-history-topic-title { font-size:0.85rem; font-weight:600; color:#1a2332; }
      .ai-history-topic-meta  { font-size:0.72rem; color:#94a3b8; margin-top:2px; }
      .ai-history-topic-actions { display:flex; gap:5px; }
      .ai-history-topic-btn {
        font-size:0.75rem; padding:3px 8px; border-radius:6px; border:none; cursor:pointer;
        font-weight:600; transition:background .15s;
      }
      .ai-history-topic-btn.load   { background:#dbeafe; color:#1d4ed8; }
      .ai-history-topic-btn.load:hover { background:#bfdbfe; }
      .ai-history-topic-btn.del    { background:#fee2e2; color:#b91c1c; }
      .ai-history-topic-btn.del:hover  { background:#fecaca; }
      .ai-history-topic-msgs {
        display:none; padding:8px 10px; border-top:1px solid #e2e8f0;
        background:#fff; max-height:200px; overflow-y:auto;
      }
      .ai-history-topic-msgs.open { display:block; }
      .ai-history-topic-preview {
        font-size:0.8rem; padding:4px 0; border-bottom:1px solid #f1f5f9;
        color:#5a6a7e; line-height:1.45;
      }
      .ai-history-topic-preview:last-child { border-bottom:none; }
      .ai-history-topic-preview .role-badge {
        font-size:0.68rem; font-weight:700; margin-right:4px;
        padding:1px 5px; border-radius:4px;
      }
      .ai-history-topic-preview .role-badge.u { background:#dbeafe; color:#1d4ed8; }
      .ai-history-topic-preview .role-badge.m { background:#dcfce7; color:#15803d; }

      /* 空歷史 */
      .ai-history-empty {
        text-align:center; padding:32px 16px; color:#94a3b8; font-size:0.85rem;
      }
      .ai-history-empty-icon { font-size:2rem; margin-bottom:8px; }

      /* 手機版 */
      @media (max-width:480px) {
        #ai-chat-window, #ai-history-panel {
          bottom:0; right:0; width:100%; max-height:80vh; border-radius:16px 16px 0 0;
        }
        #ai-fab { bottom:20px; right:20px; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ===========================
     事件綁定
     =========================== */
  function bindEvents() {
    document.getElementById('ai-fab').addEventListener('click', toggleWindow);
    document.getElementById('ai-chat-close').addEventListener('click', closeWindow);

    // ESC 關閉
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (document.getElementById('ai-history-panel').classList.contains('open')) closeHistoryPanel();
        else if (document.getElementById('ai-chat-window').classList.contains('open')) closeWindow();
      }
    });

    // 話題選擇
    document.getElementById('ai-pick-new').addEventListener('click', () => startNewTopic());
    document.getElementById('ai-pick-continue').addEventListener('click', () => continueLastTopic());

    // Tab 切換
    document.getElementById('ai-view-tabs').addEventListener('click', e => {
      const tab = e.target.closest('.ai-tab');
      if (!tab) return;
      switchView(tab.dataset.view);
    });

    // 新話題按鈕（聊天中途開新話題）
    document.getElementById('ai-new-topic-btn').addEventListener('click', () => showTopicPicker());

    // 📊 插入統計按鈕
    document.getElementById('ai-stats-btn').addEventListener('click', toggleStatsPicker);

    // 歷史面板
    document.getElementById('ai-chat-history-btn').addEventListener('click', openHistoryPanel);
    document.getElementById('ai-history-close').addEventListener('click', closeHistoryPanel);

    // 送出
    document.getElementById('ai-chat-send').addEventListener('click', sendMessage);
    document.getElementById('ai-chat-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.getElementById('ai-chat-input').addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
  }

  /* ===========================
     視窗控制
     =========================== */
  function toggleWindow() {
    const win = document.getElementById('ai-chat-window');
    win.classList.contains('open') ? closeWindow() : openWindow();
  }

  function openWindow() {
    const win = document.getElementById('ai-chat-window');
    const fab = document.getElementById('ai-fab');
    win.classList.add('open');
    win.setAttribute('aria-hidden', 'false');
    fab.classList.add('open');
    fab.textContent = '✕';
    updateContext();
    checkApiKey();
    // 若無 activeTopicId 或剛初始化 → 顯示話題選擇器
    if (!activeTopicId) {
      showTopicPicker();
    } else {
      hideTopicPicker();
      renderMessages();
      scrollToBottom();
      document.getElementById('ai-chat-input').focus();
    }
  }

  function closeWindow() {
    document.getElementById('ai-chat-window').classList.remove('open');
    document.getElementById('ai-chat-window').setAttribute('aria-hidden', 'true');
    const fab = document.getElementById('ai-fab');
    fab.classList.remove('open');
    fab.textContent = '💬';
  }

  /* ===========================
     話題選擇器
     =========================== */
  function showTopicPicker() {
    // 更新「延續上次」說明
    const topics = loadTopics();
    const last   = topics[topics.length - 1];
    const subEl  = document.getElementById('ai-last-topic-sub');
    if (last) {
      const d = new Date(last.createdAt).toLocaleDateString('zh-TW', { month:'long', day:'numeric' });
      const msgs = loadHistory().filter(m => m.topicId === last.id);
      subEl.textContent = `${d} · ${last.title || '未命名話題'} (${Math.floor(msgs.length/2)} 輪對話)`;
      document.getElementById('ai-pick-continue').disabled = false;
    } else {
      subEl.textContent = '尚無歷史話題';
      document.getElementById('ai-pick-continue').disabled = true;
    }
    document.getElementById('ai-topic-picker').style.display = 'block';
    document.getElementById('ai-view-tabs').style.display = 'none';
    document.getElementById('ai-chat-messages').style.display = 'none';
    document.getElementById('ai-chat-input-area').style.display = 'none';
  }

  function hideTopicPicker() {
    document.getElementById('ai-topic-picker').style.display = 'none';
    document.getElementById('ai-view-tabs').style.display = 'flex';
    document.getElementById('ai-chat-messages').style.display = 'flex';
    document.getElementById('ai-chat-input-area').style.display = 'flex';
  }

  function startNewTopic() {
    const id    = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const topic = {
      id, title: '',
      createdAt: new Date().toISOString(),
      page: getCurrentPage()
    };
    const topics = loadTopics();
    topics.push(topic);
    saveTopics(topics);
    activeTopicId = id;
    isNewTopic    = true;
    hideTopicPicker();
    switchView('chat');
    updateTopicLabel('新對話');
    document.getElementById('ai-chat-messages').innerHTML = `
      <div id="ai-chat-welcome">
        <div class="welcome-icon">✨</div>
        <p>新話題已開始！</p>
        <p>請輸入你的問題～</p>
      </div>`;
    document.getElementById('ai-chat-input').focus();
  }

  function continueLastTopic() {
    const topics = loadTopics();
    const last   = topics[topics.length - 1];
    if (!last) return;
    activeTopicId = last.id;
    isNewTopic    = false;
    hideTopicPicker();
    switchView('chat');
    updateTopicLabel(last.title || '延續上次話題');
    renderMessages();
    scrollToBottom();
    document.getElementById('ai-chat-input').focus();
  }

  /* ===========================
     Tab 切換
     =========================== */
  function switchView(mode) {
    viewMode = mode;
    document.querySelectorAll('.ai-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.view === mode));
    const inputArea = document.getElementById('ai-chat-input-area');
    if (inputArea) inputArea.style.display = mode === 'history' ? 'none' : 'flex';
    renderMessages();
  }

  /* ===========================
     科目統計快捷列
     =========================== */
  function toggleStatsPicker() {
    const picker = document.getElementById('ai-stats-picker');
    const btn    = document.getElementById('ai-stats-btn');
    const isOpen = picker.style.display !== 'none';
    if (isOpen) {
      picker.style.display = 'none';
      btn.textContent = '📊 插入統計';
      return;
    }
    try {
      const subjects = JSON.parse(localStorage.getItem('st_subjects') || '[]');
      if (subjects.length === 0) {
        picker.innerHTML = `<div id="ai-stats-picker-title">尚無科目，請先至科目管理新增。</div>`;
        picker.style.display = 'block';
        return;
      }
      picker.innerHTML = `
        <div id="ai-stats-picker-title">📊 選擇科目以插入統計數據</div>
        <div id="ai-stats-picker-btns">
          ${subjects.map(s => `
            <button class="ai-stats-subject-btn"
              data-id="${s.id}"
              style="border-color:${s.color}20; color:${s.color};"
              onclick="window._aiChat.insertSubjectStats('${s.id}')">
              ${s.emoji || ''} ${s.name}
            </button>`).join('')}
        </div>`;
      picker.style.display = 'block';
      btn.textContent = '✕ 收起';
    } catch (e) {
      picker.style.display = 'none';
    }
  }

  function insertSubjectStats(subjectId) {
    const stats = getSubjectStats(subjectId);
    if (!stats) return;
    const input = document.getElementById('ai-chat-input');
    const existing = input.value.trim();
    input.value = existing
      ? existing + '\n\n' + stats + '\n\n請根據以上統計，給我學習建議。'
      : stats + '\n\n請根據以上統計，給我學習建議。';
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    input.focus();
    document.querySelectorAll('.ai-stats-subject-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.id === subjectId));
  }

  /* ===========================
     情境標籤
     =========================== */
  function updateContext() {
    const ctx = document.getElementById('ai-chat-context');
    const sub = getCurrentSubject();
    ctx.textContent = sub ? `${getCurrentPage()} · ${sub}` : getCurrentPage();
  }

  function updateTopicLabel(text) {
    const el = document.getElementById('ai-topic-label-text');
    if (el) el.textContent = `話題：${text}`;
  }

  /* ===========================
     API Key 檢查
     =========================== */
  function checkApiKey() {
    const hasKey = !!getApiKey();
    document.getElementById('ai-no-key').style.display  = hasKey ? 'none' : 'flex';
    if (!hasKey) {
      document.getElementById('ai-topic-picker').style.display    = 'none';
      document.getElementById('ai-view-tabs').style.display       = 'none';
      document.getElementById('ai-chat-messages').style.display   = 'none';
      document.getElementById('ai-chat-input-area').style.display = 'none';
    }
  }

  /* ===========================
     訊息渲染
     =========================== */
  function renderMessages() {
    const container = document.getElementById('ai-chat-messages');
    if (viewMode === 'history') {
      renderHistoryInChat(container);
    } else {
      renderTopicMessages(container);
    }
  }

  function renderTopicMessages(container) {
    if (!activeTopicId) { container.innerHTML = ''; return; }
    const msgs = loadHistory().filter(m => m.topicId === activeTopicId);
    if (msgs.length === 0) {
      container.innerHTML = `
        <div id="ai-chat-welcome">
          <div class="welcome-icon">🤖</div>
          <p>你好！我是 AI 學習助理。</p>
          <p>有任何學習問題都可以問我～</p>
        </div>`;
      return;
    }
    container.innerHTML = msgs.map(m => `
      <div class="ai-msg ${m.role === 'user' ? 'user' : 'model'}">
        ${escapeHtml(m.text)}
      </div>`).join('');
    scrollToBottom();
  }

  function renderHistoryInChat(container) {
    const history = loadHistory();
    if (history.length === 0) {
      container.innerHTML = `
        <div id="ai-chat-welcome">
          <div class="welcome-icon">🕘</div>
          <p>尚無對話歷史記錄</p>
          <p style="font-size:0.8rem;">每次對話都會自動儲存。</p>
        </div>`;
      return;
    }
    let lastDate = '';
    container.innerHTML = history.map(m => {
      const d = m.timestamp
        ? new Date(m.timestamp).toLocaleDateString('zh-TW', { year:'numeric', month:'long', day:'numeric' })
        : '未知日期';
      let html = '';
      if (d !== lastDate) { html += `<div class="ai-date-divider">${d}</div>`; lastDate = d; }
      html += `<div class="ai-msg ${m.role === 'user' ? 'user' : 'model'}">${escapeHtml(m.text)}</div>`;
      return html;
    }).join('');
    scrollToBottom();
  }

  function appendMessage(role, text, isLoading = false) {
    const container = document.getElementById('ai-chat-messages');
    document.getElementById('ai-chat-welcome')?.remove();
    const div = document.createElement('div');
    div.className = `ai-msg ${isLoading ? 'loading' : role === 'user' ? 'user' : 'model'}`;
    div.textContent = text;
    container.appendChild(div);
    scrollToBottom();
    return div;
  }

  function scrollToBottom() {
    const el = document.getElementById('ai-chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ===========================
     送出訊息
     =========================== */
  async function sendMessage() {
    const input   = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-chat-send');
    const text    = input.value.trim();
    if (!text || !activeTopicId) return;

    input.value = '';
    input.style.height = 'auto';
    appendMessage('user', text);
    const loadingEl = appendMessage('model', '思考中…', true);
    sendBtn.disabled = true;

    // 只傳入本話題的歷史
    const topicHistory = loadHistory().filter(m => m.topicId === activeTopicId);

    try {
      updateContext();
      const reply = await callGemini(text, topicHistory);
      loadingEl.remove();
      appendMessage('model', reply);

      const now = new Date().toISOString();
      const history = loadHistory();
      history.push({ topicId: activeTopicId, role:'user',  text, timestamp: now });
      history.push({ topicId: activeTopicId, role:'model', text: reply, timestamp: now });
      saveHistory(history);

      // 自動以第一句問題做話題標題
      const topics = loadTopics();
      const idx = topics.findIndex(t => t.id === activeTopicId);
      if (idx !== -1 && !topics[idx].title) {
        topics[idx].title = text.slice(0, 30) + (text.length > 30 ? '…' : '');
        saveTopics(topics);
        updateTopicLabel(topics[idx].title);
      }

    } catch (err) {
      loadingEl.remove();
      if (err.message === 'NO_KEY') { checkApiKey(); }
      else {
        const d = appendMessage('model', `❌ 錯誤：${err.message}`);
        d.classList.add('error');
      }
    } finally {
      sendBtn.disabled = false;
      document.getElementById('ai-chat-input').focus();
    }
  }

  /* ===========================
     歷史面板（話題列表）
     =========================== */
  function openHistoryPanel() {
    renderHistoryPanel();
    document.getElementById('ai-history-panel').classList.add('open');
  }

  function closeHistoryPanel() {
    document.getElementById('ai-history-panel').classList.remove('open');
  }

  function renderHistoryPanel() {
    const topics  = loadTopics();
    const history = loadHistory();
    const list    = document.getElementById('ai-history-list');

    if (topics.length === 0) {
      list.innerHTML = `
        <div class="ai-history-empty">
          <div class="ai-history-empty-icon">🕘</div>
          <p>尚無對話記錄</p>
        </div>`;
      return;
    }

    // 由新到舊
    list.innerHTML = [...topics].reverse().map(topic => {
      const msgs   = history.filter(m => m.topicId === topic.id);
      const date   = new Date(topic.createdAt).toLocaleDateString('zh-TW',
                       { year:'numeric', month:'long', day:'numeric' });
      const title  = topic.title || '未命名話題';
      const rounds = Math.floor(msgs.length / 2);
      const isCurrent = topic.id === activeTopicId;

      const previews = msgs.slice(0, 4).map(m => `
        <div class="ai-history-topic-preview">
          <span class="role-badge ${m.role === 'user' ? 'u' : 'm'}">
            ${m.role === 'user' ? '我' : 'AI'}
          </span>${escapeHtml(m.text.slice(0, 60))}${m.text.length > 60 ? '…' : ''}
        </div>`).join('');

      return `
        <div class="ai-history-topic" id="topic-block-${topic.id}">
          <div class="ai-history-topic-header" onclick="document.getElementById('topic-msgs-${topic.id}').classList.toggle('open')">
            <div>
              <div class="ai-history-topic-title">
                ${isCurrent ? '🟢 ' : ''}${escapeHtml(title)}
              </div>
              <div class="ai-history-topic-meta">${date} · ${topic.page || ''} · ${rounds} 輪對話</div>
            </div>
            <div class="ai-history-topic-actions">
              <button class="ai-history-topic-btn load" onclick="event.stopPropagation(); loadTopic('${topic.id}')">載入</button>
              <button class="ai-history-topic-btn del"  onclick="event.stopPropagation(); deleteTopic('${topic.id}')">刪除</button>
            </div>
          </div>
          <div class="ai-history-topic-msgs" id="topic-msgs-${topic.id}">
            ${previews || '<div style="font-size:0.8rem;color:#94a3b8;padding:6px 0;">（無訊息）</div>'}
          </div>
        </div>`;
    }).join('');
  }

  function loadTopic(topicId) {
    const topics = loadTopics();
    const topic  = topics.find(t => t.id === topicId);
    if (!topic) return;
    activeTopicId = topicId;
    isNewTopic    = false;
    updateTopicLabel(topic.title || '歷史話題');
    closeHistoryPanel();
    hideTopicPicker();
    switchView('chat');
    renderMessages();
    scrollToBottom();
    document.getElementById('ai-chat-input').focus();
  }

  function deleteTopic(topicId) {
    if (!confirm('確定要刪除這個話題及其所有訊息？')) return;
    // 刪除話題
    saveTopics(loadTopics().filter(t => t.id !== topicId));
    // 刪除相關訊息
    saveHistory(loadHistory().filter(m => m.topicId !== topicId));
    // 若刪的是當前話題，重置
    if (activeTopicId === topicId) {
      activeTopicId = null;
      updateTopicLabel('新對話');
    }
    renderHistoryPanel();
    renderMessages();
  }

  /* ===========================
     初始化
     =========================== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectWidget);
  } else {
    injectWidget();
  }

  // 移除靜態 ai-fab-btn（若存在）
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ai-fab-btn')?.remove();
  });

  // 將 loadTopic / deleteTopic / insertSubjectStats 掛載到 window（供 HTML onclick 呼叫）
  window._aiChat = { loadTopic, deleteTopic, insertSubjectStats };

})();

// 全域代理（ai-history-panel / ai-stats-picker 內的 onclick 需要存取）
function loadTopic(id)            { window._aiChat.loadTopic(id); }
function deleteTopic(id)          { window._aiChat.deleteTopic(id); }
function insertSubjectStats(id)   { window._aiChat.insertSubjectStats(id); }
