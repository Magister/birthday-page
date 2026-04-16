(function () {
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const key = params.get('key');

  if (!key) {
    app.innerHTML = `
      <div class="error-page">
        <div class="emoji">🔒</div>
        <h1>Потрібен ключ</h1>
        <p>Відкрий цю сторінку як <code>?key=...</code></p>
      </div>`;
    return;
  }

  let state = null;
  let currentTab = 'guests';

  async function load() {
    try {
      const data = await apiGet({ action: 'admin', key });
      if (data.error) {
        app.innerHTML = `
          <div class="error-page">
            <div class="emoji">🔒</div>
            <h1>Доступ заборонено</h1>
            <p>${escapeHtml(data.error)}</p>
          </div>`;
        return;
      }
      state = data;
      render();
    } catch (e) {
      app.innerHTML = `<div class="error-page"><h1>Помилка</h1><p>${escapeHtml(e.message)}</p></div>`;
    }
  }

  function render() {
    const stats = computeStats();

    app.innerHTML = `
      <div class="hero" style="padding-top: 8px;">
        <h1 style="font-size: 28px;">⚙️ Адмінка</h1>
      </div>

      <div class="card">
        <div class="summary">
          <div class="stat"><div class="num">${stats.yes}</div><div class="lbl">Прийдуть</div></div>
          <div class="stat"><div class="num">${stats.no}</div><div class="lbl">Відмова</div></div>
          <div class="stat"><div class="num">${stats.pending}</div><div class="lbl">Без відповіді</div></div>
          <div class="stat"><div class="num">${stats.totalClaims}</div><div class="lbl">Подарунків обрано</div></div>
        </div>
      </div>

      <div class="tabs">
        <button class="tab ${currentTab==='guests'?'active':''}"   data-tab="guests">👥 Гості</button>
        <button class="tab ${currentTab==='gifts'?'active':''}"    data-tab="gifts">🎁 Подарунки</button>
        <button class="tab ${currentTab==='settings'?'active':''}" data-tab="settings">⚙️ Свято</button>
      </div>

      <div class="section ${currentTab==='guests'?'active':''}" id="sec-guests">${renderGuests()}</div>
      <div class="section ${currentTab==='gifts'?'active':''}"  id="sec-gifts">${renderGiftsAdmin()}</div>
      <div class="section ${currentTab==='settings'?'active':''}" id="sec-settings">${renderSettings()}</div>
    `;

    document.querySelectorAll('.tab').forEach(t => {
      t.onclick = () => { currentTab = t.dataset.tab; render(); };
    });

    wireGuests();
    wireGifts();
    wireSettings();
  }

  function computeStats() {
    const yes     = state.guests.filter(g => g.attending === 'yes').length;
    const no      = state.guests.filter(g => g.attending === 'no').length;
    const pending = state.guests.filter(g => !g.attending).length;
    const totalClaims = state.gifts.reduce((sum, g) => sum + (g.claimers || []).length, 0);
    return { yes, no, pending, totalClaims };
  }

  function renderGuests() {
    const base = location.origin + location.pathname.replace(/admin\.html$/, '');
    const sortedGuests = [...state.guests].sort((a, b) => {
      const order = { yes: 0, no: 2, '': 1, null: 1 };
      return (order[a.attending || ''] - order[b.attending || '']) || a.name.localeCompare(b.name, 'uk');
    });

    return `
      <div class="card">
        <h2>👥 Список гостей</h2>
        <div class="add-form">
          <input type="text" id="new-guest-name" placeholder="Ім'я гостя">
          <button id="add-guest-btn" class="btn-pink">+ Додати</button>
        </div>
        <div style="margin-top: 18px;">
          ${sortedGuests.length === 0
            ? '<div class="empty">Поки що немає гостей. Додай першого ☝️</div>'
            : sortedGuests.map(g => renderGuestRow(g, base)).join('')}
        </div>
      </div>
    `;
  }

  function renderGuestRow(g, base) {
    const link = `${base}?t=${g.token}`;
    const status = g.attending === 'yes' ? '<span class="badge yes">Прийде</span>'
                 : g.attending === 'no'  ? '<span class="badge no">Не зможе</span>'
                 :                          '<span class="badge pending">Чекаємо</span>';
    return `
      <div class="admin-row">
        <div style="flex: 1; min-width: 0;">
          <div class="name">${escapeHtml(g.name)} ${status}</div>
          <div class="meta">
            <span class="copy-link">${escapeHtml(link)}</span>
          </div>
          ${g.message ? `<div class="meta" style="margin-top:4px;">💬 ${escapeHtml(g.message)}</div>` : ''}
        </div>
        <div class="actions">
          <button class="btn-teal btn-sm" data-copy="${escapeHtml(link)}">📋 Копіювати</button>
          <button class="btn-danger" data-remove-guest="${g.token}" data-name="${escapeHtml(g.name)}">×</button>
        </div>
      </div>
    `;
  }

  function renderGiftsAdmin() {
    return `
      <div class="card">
        <h2>🎁 Список подарунків</h2>
        <div class="add-form">
          <input type="text" id="new-gift-name" placeholder="Назва подарунка">
          <button id="add-gift-btn" class="btn-pink">+ Додати</button>
        </div>
        <div style="margin-top: 18px;">
          ${state.gifts.length === 0
            ? '<div class="empty">Поки що немає подарунків.</div>'
            : state.gifts.map(renderGiftRow).join('')}
        </div>
      </div>
    `;
  }

  function renderGiftRow(g) {
    const claimers = g.claimers || [];
    return `
      <div class="admin-row">
        <div style="flex: 1; min-width: 0;">
          <div class="name">${escapeHtml(g.name)} <span class="badge pending">${claimers.length}</span></div>
          ${claimers.length
            ? `<div class="claimers-list">Подарують: ${claimers.map(escapeHtml).join(', ')}</div>`
            : `<div class="claimers-list">ще ніхто не обрав</div>`}
        </div>
        <div class="actions">
          <button class="btn-danger" data-remove-gift="${g.id}" data-name="${escapeHtml(g.name)}">×</button>
        </div>
      </div>
    `;
  }

  function renderSettings() {
    const p = state.party;
    return `
      <div class="card">
        <h2>⚙️ Інформація про свято</h2>
        <label for="f-title">Назва</label>
        <input type="text" id="f-title" value="${escapeHtml(p.title || '')}">
        <label for="f-date">Дата</label>
        <input type="date" id="f-date" value="${escapeHtml(p.date || '')}">
        <label for="f-time">Час</label>
        <input type="time" id="f-time" value="${escapeHtml(p.time || '')}">
        <label for="f-location">Місце</label>
        <input type="text" id="f-location" value="${escapeHtml(p.location || '')}">
        <label for="f-desc">Опис (необов'язково)</label>
        <textarea id="f-desc" rows="4">${escapeHtml(p.description || '')}</textarea>
        <div style="margin-top: 16px;">
          <button id="save-party" class="btn-pink">💾 Зберегти</button>
        </div>
      </div>
    `;
  }

  function wireGuests() {
    const addBtn = document.getElementById('add-guest-btn');
    if (addBtn) {
      addBtn.onclick = async () => {
        const input = document.getElementById('new-guest-name');
        const name = input.value.trim();
        if (!name) return;
        addBtn.classList.add('is-loading');
        const res = await apiPost({ action: 'add_guest', key, name });
        if (res.ok) { input.value = ''; await load(); showToast('Додано'); }
        else { addBtn.classList.remove('is-loading'); showToast('Помилка: ' + (res.error || '')); }
      };
    }

    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.onclick = async () => {
        const text = btn.dataset.copy;
        try {
          await navigator.clipboard.writeText(text);
          showToast('Посилання скопійовано 📋');
        } catch {
          prompt('Скопіюй вручну:', text);
        }
      };
    });

    document.querySelectorAll('[data-remove-guest]').forEach(btn => {
      btn.onclick = async () => {
        const token = btn.dataset.removeGuest;
        const name = btn.dataset.name;
        if (!confirm(`Видалити ${name} зі списку гостей?`)) return;
        btn.classList.add('is-loading');
        const res = await apiPost({ action: 'remove_guest', key, token });
        if (res.ok) { await load(); showToast('Видалено'); }
        else { btn.classList.remove('is-loading'); showToast('Помилка: ' + (res.error || '')); }
      };
    });
  }

  function wireGifts() {
    const addBtn = document.getElementById('add-gift-btn');
    if (addBtn) {
      addBtn.onclick = async () => {
        const input = document.getElementById('new-gift-name');
        const name = input.value.trim();
        if (!name) return;
        addBtn.classList.add('is-loading');
        const res = await apiPost({ action: 'add_gift', key, name });
        if (res.ok) { input.value = ''; await load(); showToast('Додано'); }
        else { addBtn.classList.remove('is-loading'); showToast('Помилка: ' + (res.error || '')); }
      };
    }

    document.querySelectorAll('[data-remove-gift]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.removeGift;
        const name = btn.dataset.name;
        if (!confirm(`Видалити "${name}" зі списку подарунків?`)) return;
        btn.classList.add('is-loading');
        const res = await apiPost({ action: 'remove_gift', key, id });
        if (res.ok) { await load(); showToast('Видалено'); }
        else { btn.classList.remove('is-loading'); showToast('Помилка: ' + (res.error || '')); }
      };
    });
  }

  function wireSettings() {
    const btn = document.getElementById('save-party');
    if (!btn) return;
    btn.onclick = async () => {
      btn.classList.add('is-loading');
      const res = await apiPost({
        action: 'update_party',
        key,
        party_title:       document.getElementById('f-title').value,
        party_date:        document.getElementById('f-date').value,
        party_time:        document.getElementById('f-time').value,
        party_location:    document.getElementById('f-location').value,
        party_description: document.getElementById('f-desc').value,
      });
      if (res.ok) { await load(); showToast('Збережено 💾'); }
      else { btn.classList.remove('is-loading'); showToast('Помилка: ' + (res.error || '')); }
    };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  load();
})();
