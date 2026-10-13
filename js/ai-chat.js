/**
 * ai-chat.js — Study Tracker AI 問答助理
 * 在所有頁面注入右下角浮鈕 + 聊天視窗，呼叫 Gemini REST API
 * 使用方式：在每個 HTML 頁面底部 <script src="js/ai-chat.js"></script>
 */
(function () {
  'use strict';

  /* ===========================
     常數設定
     =========================== */
  const GEMINI_API_URL =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
  const MAX_HISTORY  = 50;  // localStorage 保留最多 50 則
  const CTX_HISTORY  = 10;  // 每次 API 呼叫帶入最近 10 則（5 輪對話）
  const STORAGE_KEY  = 'st_ai_history';
  const SETTINGS_KEY = 'st_settings';

  /* ===========================
     工具函式
     =========================== */
  function getApiKey() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return s.geminiApiKey || '';
    } catch { return ''; }
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  }

  function saveHistory(history) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
  }

  /** 取得目前頁面名稱（用於情境感知） */
  function getCurrentPage() {
    const file = location.pathname.split('/').pop() || 'index.html';
    const map = {
      'index.html':    '儀表板',
      'subjects.html': '科目管理',
      'timer.html':    '計時器',
      'stats.html':    '統計圖表',
      'goals.html':    '目標計畫',
      'settings.html': '設定'
    };
    return map[file] || file;
  }

  /** 取得目前選擇的科目名稱（timer.html 用） */
  function getCurrentSubject() {
    const sel = document.getElementById('subject-select');
    if (!sel || !sel.value) return null;
    try {
      const subjects = JSON.parse(localStorage.getItem('st_subjects') || '[]');
      return subjects.find(s => s.id === sel.value)?.name || null;
    } catch { return null; }
  }

  /** 組成 System Prompt */
  function buildSystemPrompt() {
    const page    = getCurrentPage();
    const subject = getCurrentSubject();
    let prompt = `你是 Study Tracker 的 AI 學習助理。請用繁體中文回答，回覆簡潔清楚。
使用者目前在「${page}」頁面。`;
    if (subject) prompt += `\n使用者正在學習「${subject}」科目。`;
    prompt += `\n請根據使用者的學習情境提供有幫助的回答，例如解題、概念解釋、學習建議等。`;
    return prompt;
  }

  /* ===========================
     Gemini API 呼叫
     =========================== */
  async function callGemini(userText, history) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('NO_KEY');

    // 組合對話歷史（取最近 CTX_HISTORY 則）
    const recentHistory = history.slice(-CTX_HISTORY);
    const contents = [
      // System instruction 以 user/model 對話形式注入
      { role: 'user',  parts: [{ text: buildSystemPrompt() }] },
      { role: 'model', parts: [{ text: '好的，我了解。請問有什麼我可以幫你的？' }] },
      // 對話歷史
      ...recentHistory.map(m => ({
        role:  m.role,
        parts: [{ text: m.text }]
      })),
      // 本次訊息
      { role: 'user', parts: [{ text: userText }] }
    ];

    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contents })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '（無回應）';
  }

  /* ===========================
     DOM 注入
     =========================== */
  function injectWidget() {
    // 避免重複注入
    if (document.getElementById('ai-chat-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'ai-chat-widget';
    widget.innerHTML = `
      <!-- 浮鈕 -->
      <button id="ai-fab" aria-label="開啟 AI 助理" title="AI 學習助理">💬</button>

      <!-- 聊天視窗 -->
      <div id="ai-chat-window" aria-hidden="true">
        <div id="ai-chat-header">
          <div id="ai-chat-header-left">
            <span id="ai-chat-icon">🤖</span>
            <div>
              <div id="ai-chat-title">AI 學習助理</div>
              <div id="ai-chat-context"></div>
            </div>
          </div>
          <div id="ai-chat-header-right">
            <button id="ai-chat-clear" title="清除對話">🗑</button>
            <button id="ai-chat-close" title="關閉">✕</button>
          </div>
        </div>

        <div id="ai-chat-messages">
          <!-- 訊息由 JS 渲染 -->
        </div>

        <!-- 未設定 API Key 時顯示 -->
        <div id="ai-no-key">
          <div style="font-size:2rem;margin-bottom:12px;">🔑</div>
          <p>尚未設定 Gemini API Key</p>
          <a href="settings.html" id="ai-go-settings">前往設定</a>
        </div>

        <div id="ai-chat-input-area">
          <textarea
            id="ai-chat-input"
            placeholder="輸入問題，例：幫我解釋等差數列…"
            rows="1"
            maxlength="2000"
          ></textarea>
          <button id="ai-chat-send" title="送出">➤</button>
        </div>
      </div>
    `;
    document.body.appendChild(widget);

    injectStyles();
    bindEvents();
    renderMessages();
    updateContext();
  }

  /* ===========================
     樣式注入
     =========================== */
  function injectStyles() {
    if (document.getElementById('ai-chat-styles')) return;
    const style = document.createElement('style');
    style.id = 'ai-chat-styles';
    style.textContent = `
      /* 浮鈕 */
      #ai-fab {
        position: fixed;
        bottom: 28px;
        right: 28px;
        width: 54px;
        height: 54px;
        border-radius: 50%;
        background: #4a9eff;
        color: #fff;
        font-size: 1.4rem;
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 18px rgba(74,158,255,0.45);
        z-index: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s, transform 0.2s;
      }
      #ai-fab:hover { background: #2d7dd2; transform: scale(1.08); }
      #ai-fab.open  { background: #2d7dd2; }

      /* 聊天視窗 */
      #ai-chat-window {
        position: fixed;
        bottom: 96px;
        right: 28px;
        width: 360px;
        max-height: 560px;
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
        border: 1px solid #e2e8f0;
        display: none;
        flex-direction: column;
        z-index: 499;
        overflow: hidden;
      }
      #ai-chat-window.open { display: flex; }

      /* Header */
      #ai-chat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        background: #1e3a5f;
        color: #fff;
        flex-shrink: 0;
      }
      #ai-chat-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      #ai-chat-icon { font-size: 1.4rem; }
      #ai-chat-title {
        font-size: 0.95rem;
        font-weight: 700;
        line-height: 1.2;
      }
      #ai-chat-context {
        font-size: 0.72rem;
        color: rgba(255,255,255,0.65);
        margin-top: 1px;
      }
      #ai-chat-header-right {
        display: flex;
        gap: 6px;
      }
      #ai-chat-header-right button {
        background: rgba(255,255,255,0.15);
        border: none;
        color: #fff;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.85rem;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
      }
      #ai-chat-header-right button:hover { background: rgba(255,255,255,0.28); }

      /* 訊息區 */
      #ai-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 14px 14px 8px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 100px;
      }
      .ai-msg {
        max-width: 85%;
        padding: 9px 13px;
        border-radius: 12px;
        font-size: 0.875rem;
        line-height: 1.55;
        word-break: break-word;
        white-space: pre-wrap;
      }
      .ai-msg.user {
        align-self: flex-end;
        background: #4a9eff;
        color: #fff;
        border-bottom-right-radius: 4px;
      }
      .ai-msg.model {
        align-self: flex-start;
        background: #f1f5f9;
        color: #1a2332;
        border-bottom-left-radius: 4px;
      }
      .ai-msg.loading {
        align-self: flex-start;
        background: #f1f5f9;
        color: #94a3b8;
      }
      .ai-msg.error {
        align-self: flex-start;
        background: #fee2e2;
        color: #b91c1c;
      }

      /* 空狀態 */
      #ai-chat-welcome {
        text-align: center;
        padding: 24px 12px;
        color: #94a3b8;
        font-size: 0.85rem;
      }
      #ai-chat-welcome .welcome-icon { font-size: 2rem; margin-bottom: 8px; }

      /* 未設定 Key */
      #ai-no-key {
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px 20px;
        text-align: center;
        flex: 1;
        color: #5a6a7e;
        font-size: 0.88rem;
      }
      #ai-no-key p { margin-bottom: 12px; }
      #ai-go-settings {
        background: #4a9eff;
        color: #fff;
        padding: 8px 18px;
        border-radius: 8px;
        font-size: 0.85rem;
        font-weight: 600;
        text-decoration: none;
        transition: background 0.15s;
      }
      #ai-go-settings:hover { background: #2d7dd2; }

      /* 輸入區 */
      #ai-chat-input-area {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        padding: 10px 12px;
        border-top: 1px solid #e2e8f0;
        background: #f8fafc;
        flex-shrink: 0;
      }
      #ai-chat-input {
        flex: 1;
        border: 1.5px solid #e2e8f0;
        border-radius: 10px;
        padding: 8px 12px;
        font-size: 0.875rem;
        resize: none;
        font-family: inherit;
        line-height: 1.5;
        max-height: 100px;
        overflow-y: auto;
        background: #fff;
        color: #1a2332;
        transition: border-color 0.15s;
      }
      #ai-chat-input:focus {
        outline: none;
        border-color: #4a9eff;
        box-shadow: 0 0 0 3px rgba(74,158,255,0.12);
      }
      #ai-chat-send {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: #4a9eff;
        color: #fff;
        border: none;
        cursor: pointer;
        font-size: 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: background 0.15s;
      }
      #ai-chat-send:hover    { background: #2d7dd2; }
      #ai-chat-send:disabled { background: #94a3b8; cursor: not-allowed; }

      /* 手機版全屏 */
      @media (max-width: 480px) {
        #ai-chat-window {
          bottom: 0;
          right: 0;
          width: 100%;
          max-height: 80vh;
          border-radius: 16px 16px 0 0;
        }
        #ai-fab { bottom: 20px; right: 20px; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ===========================
     事件綁定
     =========================== */
  function bindEvents() {
    const fab    = document.getElementById('ai-fab');
    const win    = document.getElementById('ai-chat-window');
    const closeBtn = document.getElementById('ai-chat-close');
    const clearBtn = document.getElementById('ai-chat-clear');
    const sendBtn  = document.getElementById('ai-chat-send');
    const input    = document.getElementById('ai-chat-input');

    // 開關聊天視窗
    fab.addEventListener('click', () => toggleWindow());

    closeBtn.addEventListener('click', () => closeWindow());

    // ESC 關閉
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && win.classList.contains('open')) closeWindow();
    });

    // 清除對話
    clearBtn.addEventListener('click', () => {
      if (!confirm('確定要清除所有對話記錄？')) return;
      saveHistory([]);
      renderMessages();
    });

    // 送出訊息
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // 自動調整輸入框高度
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });
  }

  /* ===========================
     視窗控制
     =========================== */
  function toggleWindow() {
    const win = document.getElementById('ai-chat-window');
    const fab = document.getElementById('ai-fab');
    if (win.classList.contains('open')) {
      closeWindow();
    } else {
      win.classList.add('open');
      win.setAttribute('aria-hidden', 'false');
      fab.classList.add('open');
      fab.textContent = '✕';
      updateContext();
      checkApiKey();
      scrollToBottom();
      document.getElementById('ai-chat-input').focus();
    }
  }

  function closeWindow() {
    const win = document.getElementById('ai-chat-window');
    const fab = document.getElementById('ai-fab');
    win.classList.remove('open');
    win.setAttribute('aria-hidden', 'true');
    fab.classList.remove('open');
    fab.textContent = '💬';
  }

  /* ===========================
     情境標籤更新
     =========================== */
  function updateContext() {
    const ctx     = document.getElementById('ai-chat-context');
    const page    = getCurrentPage();
    const subject = getCurrentSubject();
    ctx.textContent = subject ? `${page} · ${subject}` : page;
  }

  /* ===========================
     API Key 檢查
     =========================== */
  function checkApiKey() {
    const hasKey   = !!getApiKey();
    const noKeyEl  = document.getElementById('ai-no-key');
    const inputArea = document.getElementById('ai-chat-input-area');
    const messages  = document.getElementById('ai-chat-messages');

    noKeyEl.style.display   = hasKey ? 'none'  : 'flex';
    inputArea.style.display = hasKey ? 'flex'  : 'none';
    messages.style.display  = hasKey ? 'flex'  : 'none';
  }

  /* ===========================
     訊息渲染
     =========================== */
  function renderMessages() {
    const container = document.getElementById('ai-chat-messages');
    const history   = loadHistory();

    if (history.length === 0) {
      container.innerHTML = `
        <div id="ai-chat-welcome">
          <div class="welcome-icon">🤖</div>
          <p>你好！我是 AI 學習助理。</p>
          <p>有任何學習問題都可以問我～</p>
        </div>`;
      return;
    }

    container.innerHTML = history.map(m => `
      <div class="ai-msg ${m.role === 'user' ? 'user' : 'model'}">
        ${escapeHtml(m.text)}
      </div>`).join('');

    scrollToBottom();
  }

  function appendMessage(role, text, isLoading = false) {
    const container = document.getElementById('ai-chat-messages');
    // 移除歡迎訊息
    const welcome = document.getElementById('ai-chat-welcome');
    if (welcome) welcome.remove();

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
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ===========================
     送出訊息
     =========================== */
  async function sendMessage() {
    const input   = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-chat-send');
    const text    = input.value.trim();
    if (!text) return;

    // 清空輸入
    input.value = '';
    input.style.height = 'auto';

    // 顯示使用者訊息
    appendMessage('user', text);

    // 顯示 loading
    const loadingEl = appendMessage('model', '思考中…', true);
    sendBtn.disabled = true;

    // 讀取歷史
    const history = loadHistory();

    try {
      updateContext(); // 取得最新情境
      const reply = await callGemini(text, history);

      // 移除 loading
      loadingEl.remove();

      // 顯示 AI 回覆
      appendMessage('model', reply);

      // 儲存對話歷史
      history.push({ role: 'user',  text, timestamp: new Date().toISOString() });
      history.push({ role: 'model', text: reply, timestamp: new Date().toISOString() });
      saveHistory(history);

    } catch (err) {
      loadingEl.remove();
      if (err.message === 'NO_KEY') {
        checkApiKey(); // 顯示設定提示
      } else {
        const errDiv = appendMessage('model', `❌ 錯誤：${err.message}`);
        errDiv.classList.add('error');
      }
    } finally {
      sendBtn.disabled = false;
      document.getElementById('ai-chat-input').focus();
    }
  }

  /* ===========================
     初始化
     =========================== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectWidget);
  } else {
    injectWidget();
  }

  // 移除原本 HTML 中的靜態 ai-fab（避免重複）
  document.addEventListener('DOMContentLoaded', () => {
    const staticFab = document.getElementById('ai-fab-btn');
    if (staticFab) staticFab.remove();
  });

})();
