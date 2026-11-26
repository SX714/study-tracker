/* =============================================
   diary.js — 學習日記頁面邏輯
   ============================================= */
(function () {
  const subjects = loadData('st_subjects', []);

  // 科目 id → { name, emoji }
  const subjectMap = {};
  subjects.forEach(s => { subjectMap[s.id] = s; });

  // ── 篩選狀態 ───────────────────────────────
  let filterSubjectId = '';

  // ── 編輯狀態 ───────────────────────────────
  let editingId = null;
  let editMood  = 3;

  // ── 工具函式 ───────────────────────────────
  function formatDate(isoStr) {
    const d = new Date(isoStr);
    return d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  }

  function formatTime(isoStr) {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  }

  function dateKey(isoStr) {
    return isoStr.slice(0, 10); // YYYY-MM-DD
  }

  function moodStarsHtml(mood, total = 5) {
    return Array.from({ length: total }, (_, i) =>
      `<span class="diary-mood-star${i < mood ? ' filled' : ''}">★</span>`
    ).join('');
  }

  // ── 科目篩選下拉建立 ───────────────────────
  function buildSubjectFilter() {
    const sel = document.getElementById('diary-subject-filter');
    subjects.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.emoji || ''} ${s.name}`;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
      filterSubjectId = sel.value;
      render();
    });
  }

  // ── 主渲染 ─────────────────────────────────
  function render() {
    const container = document.getElementById('diary-list');
    const countEl   = document.getElementById('diary-count');
    let diary = loadData('st_diary', []);

    // 篩選
    if (filterSubjectId) {
      diary = diary.filter(e => e.subjectId === filterSubjectId);
    }

    // 更新計數
    countEl.textContent = `共 ${diary.length} 筆`;

    if (diary.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📓</div>
          <p>還沒有學習日記<br>完成一次計時後就會自動提示記錄！</p>
        </div>`;
      return;
    }

    // 依日期分組（降序）
    const groups = {};
    diary
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .forEach(entry => {
        const key = dateKey(entry.createdAt);
        if (!groups[key]) groups[key] = [];
        groups[key].push(entry);
      });

    container.innerHTML = Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(key => {
        const entries = groups[key];
        const label = formatDate(entries[0].createdAt);
        const cards = entries.map(e => buildCard(e)).join('');
        return `
          <div class="diary-date-group">
            <h3>${label}</h3>
            ${cards}
          </div>`;
      }).join('');

    // 繫結按鈕事件
    container.querySelectorAll('.diary-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    container.querySelectorAll('.diary-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteEntry(btn.dataset.id));
    });
  }

  function buildCard(entry) {
    const sub     = subjectMap[entry.subjectId];
    const subName = sub ? `${sub.emoji || ''} ${sub.name}` : '未知項目';
    const content = entry.content
      ? `<div class="diary-card-content">${escapeHtml(entry.content)}</div>`
      : `<div class="diary-card-content empty">（無心得記錄）</div>`;
    return `
      <div class="diary-card">
        <div class="diary-card-header">
          <span class="diary-card-subject">${subName}</span>
          <span class="diary-card-time">${formatTime(entry.createdAt)}</span>
        </div>
        <div class="diary-card-mood">${moodStarsHtml(entry.mood || 0)}</div>
        ${content}
        <div class="diary-card-actions">
          <button class="btn btn-ghost btn-sm diary-edit-btn" data-id="${entry.id}">✏️ 編輯</button>
          <button class="btn btn-danger btn-sm diary-delete-btn" data-id="${entry.id}">🗑️ 刪除</button>
        </div>
      </div>`;
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ── 刪除 ───────────────────────────────────
  function deleteEntry(id) {
    if (!confirm('確定要刪除這筆日記？')) return;
    const diary = loadData('st_diary', []).filter(e => e.id !== id);
    saveData('st_diary', diary);
    render();
  }

  // ── 編輯 Modal ─────────────────────────────
  function openEditModal(id) {
    const diary = loadData('st_diary', []);
    const entry = diary.find(e => e.id === id);
    if (!entry) return;
    editingId = id;
    editMood  = entry.mood || 3;

    const sub = subjectMap[entry.subjectId];
    document.getElementById('edit-diary-title').textContent =
      sub ? `✏️ 編輯日記 — ${sub.emoji || ''} ${sub.name}` : '✏️ 編輯日記';
    document.getElementById('edit-diary-content').value = entry.content || '';
    updateEditMoodStars(editMood);
    document.getElementById('edit-diary-modal').classList.add('open');
  }

  function closeEditModal() {
    document.getElementById('edit-diary-modal').classList.remove('open');
    editingId = null;
  }

  function updateEditMoodStars(val) {
    editMood = val;
    document.querySelectorAll('#edit-mood-stars .mood-star').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.val) <= val);
    });
  }

  // ── 初始化 ─────────────────────────────────
  buildSubjectFilter();
  render();

  // 編輯 Modal 星星
  document.querySelectorAll('#edit-mood-stars .mood-star').forEach(btn => {
    btn.addEventListener('click', () => updateEditMoodStars(Number(btn.dataset.val)));
  });

  // 關閉編輯 Modal
  document.getElementById('edit-diary-close').addEventListener('click', closeEditModal);
  document.getElementById('edit-diary-cancel').addEventListener('click', closeEditModal);
  document.getElementById('edit-diary-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeEditModal();
  });

  // 儲存編輯
  document.getElementById('edit-diary-save').addEventListener('click', () => {
    if (!editingId) return;
    const diary = loadData('st_diary', []);
    const idx   = diary.findIndex(e => e.id === editingId);
    if (idx === -1) return;
    diary[idx].content = document.getElementById('edit-diary-content').value.trim();
    diary[idx].mood    = editMood;
    saveData('st_diary', diary);
    closeEditModal();
    render();
  });
})();
