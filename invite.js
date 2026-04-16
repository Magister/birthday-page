(function () {
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const token = params.get('t');

  if (!token) {
    renderError('Це особисте запрошення', 'Схоже, посилання неповне. Попроси, будь ласка, нове.');
    return;
  }

  let state = null;

  async function load() {
    try {
      const data = await apiGet({ action: 'invite', token });
      if (data.error === 'invalid_token') {
        renderError('Запрошення не знайдено', 'Перевір, будь ласка, посилання — можливо, воно неточне.');
        return;
      }
      if (data.error) {
        renderError('Щось пішло не так', data.error);
        return;
      }
      state = data;
      render();
    } catch (e) {
      renderError('Не вдалося завантажити', e.message);
    }
  }

  function render() {
    const g = state.guest;
    const p = state.party;
    const attending = g.attending;

    if (p.title) document.title = p.title + ' 🎂';

    app.innerHTML = `
      <div class="confetti">🎈 🎂 🎉 🎁 🎈</div>
      <div class="hero">
        <h1>${escapeHtml(p.title || 'День народження')}</h1>
        <div class="greeting">Привіт, ${escapeHtml(g.name)}! 👋</div>
      </div>

      <div class="card pink">
        <h2>📅 Коли і де</h2>
        <div class="party-info">
          ${p.date     ? `<div class="row"><span class="icon">📆</span><span>${escapeHtml(formatDateUk(p.date))}</span></div>` : ''}
          ${p.time     ? `<div class="row"><span class="icon">⏰</span><span>${escapeHtml(p.time)}</span></div>` : ''}
          ${p.location ? `<div class="row"><span class="icon">📍</span><span>${escapeHtml(p.location)}</span></div>` : ''}
          ${p.description ? `<div class="desc">${escapeHtml(p.description)}</div>` : ''}
        </div>
      </div>

      <div class="card purple">
        <h2>✋ Чи зможеш прийти?</h2>
        ${renderRsvp(attending, g.message)}
      </div>

      <div id="gifts-section">
        ${attending === 'yes' ? renderGifts() : ''}
      </div>
    `;

    wireRsvp();
    if (attending === 'yes') wireGifts();
  }

  function renderRsvp(attending, message) {
    if (!attending) {
      return `
        <div class="rsvp-buttons">
          <button id="btn-yes" class="btn-pink">🎉 Прийду!</button>
          <button id="btn-no"  class="btn-ghost">😔 Не зможу</button>
        </div>
      `;
    }
    if (attending === 'yes') {
      return `
        <div class="rsvp-status yes">✅ Ти будеш на святі — ура!</div>
        <label for="msg">Хочеш щось передати? (необов'язково)</label>
        <textarea id="msg" placeholder="Привітання, ідеї, тощо...">${escapeHtml(message || '')}</textarea>
        <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button id="btn-save-msg" class="btn-teal btn-sm">💾 Зберегти повідомлення</button>
          <button id="btn-change" class="btn-ghost btn-sm">Змінити відповідь</button>
        </div>
      `;
    }
    return `
      <div class="rsvp-status no">😔 Ти не зможеш прийти.</div>
      <label for="msg">Хочеш щось передати? (необов'язково)</label>
      <textarea id="msg" placeholder="Привітання...">${escapeHtml(message || '')}</textarea>
      <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button id="btn-save-msg" class="btn-teal btn-sm">💾 Зберегти</button>
        <button id="btn-change" class="btn-ghost btn-sm">Змінити відповідь</button>
      </div>
    `;
  }

  function renderGifts() {
    const gifts = shuffleByToken(state.gifts || [], token);
    return `
      <div class="card yellow">
        <h2>🎁 Подарунки</h2>
        <p style="margin: 0 0 14px; color: var(--muted); font-size: 15px;">
          Натисни «Я подарую», якщо хочеш принести щось зі списку. Один подарунок можуть обрати кілька гостей — це нормально.
        </p>
        ${gifts.length === 0
          ? '<div class="empty">Список подарунків поки що порожній 🤷‍♀️</div>'
          : `<div class="gift-list">${gifts.map(renderGift).join('')}</div>`}
      </div>
    `;
  }

  function renderGift(g) {
    const mine = g.claimed_by_me;
    return `
      <div class="gift ${mine ? 'claimed-by-me' : ''}" data-id="${g.id}">
        <div style="flex:1; min-width:0;">
          <div class="gift-name">${escapeHtml(g.name)}</div>
          <div class="gift-count">${giftCountLabel(g.claim_count, mine)}</div>
        </div>
        <div class="gift-action">
          <button class="${mine ? 'btn-ghost' : 'btn-pink'} btn-sm" data-action="${mine ? 'unclaim' : 'claim'}" data-id="${g.id}">
            ${mine ? '✓ Я подарую' : 'Я подарую'}
          </button>
        </div>
      </div>
    `;
  }

  function giftCountLabel(count, mine) {
    if (count === 0) return 'Поки ніхто не обрав';
    if (count === 1) return mine ? 'Тільки ти' : '1 людина обрала';
    if (mine)        return `Ти і ще ${count - 1}`;
    return `${count} ${pluralUk(count, ['людина обрала','людини обрали','людей обрали'])}`;
  }

  function wireRsvp() {
    const yes = document.getElementById('btn-yes');
    const no  = document.getElementById('btn-no');
    const change = document.getElementById('btn-change');
    const saveMsg = document.getElementById('btn-save-msg');

    if (yes) yes.onclick = () => setRsvp('yes');
    if (no)  no.onclick  = () => setRsvp('no');
    if (change) change.onclick = () => {
      state.guest.attending = null;
      render();
    };
    if (saveMsg) saveMsg.onclick = async () => {
      const msg = document.getElementById('msg').value;
      saveMsg.classList.add('is-loading');
      const res = await apiPost({ action: 'rsvp', token, attending: state.guest.attending, message: msg });
      saveMsg.classList.remove('is-loading');
      if (res.ok) { state.guest.message = msg; showToast('Збережено 💌'); }
      else showToast('Помилка: ' + (res.error || ''));
    };
  }

  async function setRsvp(value) {
    const active = document.getElementById(value === 'yes' ? 'btn-yes' : 'btn-no');
    const other  = document.getElementById(value === 'yes' ? 'btn-no'  : 'btn-yes');
    if (active) active.classList.add('is-loading');
    if (other)  other.disabled = true;
    const res = await apiPost({ action: 'rsvp', token, attending: value, message: state.guest.message || '' });
    if (res.ok) {
      state.guest.attending = value;
      render();
      showToast(value === 'yes' ? 'Чекаємо на тебе! 🎉' : 'Дякуємо, що сказав(ла) 💜');
    } else {
      showToast('Помилка: ' + (res.error || ''));
      if (active) active.classList.remove('is-loading');
      if (other)  other.disabled = false;
    }
  }

  function wireGifts() {
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const claimed = btn.dataset.action === 'claim';
        btn.classList.add('is-loading');
        const res = await apiPost({ action: 'claim', token, gift_id: id, claimed });
        if (res.ok) {
          const gift = state.gifts.find(g => String(g.id) === String(id));
          if (gift) {
            gift.claimed_by_me = claimed;
            gift.claim_count += claimed ? 1 : -1;
          }
          document.getElementById('gifts-section').innerHTML = renderGifts();
          wireGifts();
          showToast(claimed ? 'Дякуємо! 🎁' : 'Скасовано');
        } else {
          showToast('Помилка: ' + (res.error || ''));
          btn.classList.remove('is-loading');
        }
      };
    });
  }

  function renderError(title, text) {
    app.innerHTML = `
      <div class="error-page">
        <div class="emoji">🎈</div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(text)}</p>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pluralUk(n, forms) {
    const mod10  = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
  }

  function shuffleByToken(arr, seedStr) {
    const a = arr.slice();
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) {
      seed = ((seed << 5) - seed + seedStr.charCodeAt(i)) | 0;
    }
    seed = seed >>> 0;
    const rand = () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function formatDateUk(s) {
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s;
    const months = ['січня','лютого','березня','квітня','травня','червня',
                    'липня','серпня','вересня','жовтня','листопада','грудня'];
    return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
  }

  load();
})();
