// Shared API client for Apps Script web app.
// POST uses text/plain to avoid CORS preflight (Apps Script can't handle OPTIONS).

async function apiGet(params) {
  if (!window.API_URL) throw new Error('API_URL not set in config.js');
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(window.API_URL + '?' + qs, { method: 'GET' });
  return res.json();
}

async function apiPost(body) {
  if (!window.API_URL) throw new Error('API_URL not set in config.js');
  const res = await fetch(window.API_URL, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  });
  return res.json();
}

function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 2200);
}
