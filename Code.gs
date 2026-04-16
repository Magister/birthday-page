/**
 * Birthday page backend — Google Apps Script.
 * Paste into a Google Sheet's Apps Script editor (Extensions → Apps Script),
 * run setup() once, then deploy as Web App (execute as: Me, access: Anyone).
 */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let config = ss.getSheetByName('Config');
  if (!config) {
    config = ss.insertSheet('Config');
    config.appendRow(['key', 'value']);
    config.appendRow(['party_title', 'День народження']);
    config.appendRow(['party_date', '']);
    config.appendRow(['party_time', '']);
    config.appendRow(['party_location', '']);
    config.appendRow(['party_description', '']);
    config.appendRow(['admin_key', generateToken()]);
    config.setColumnWidth(1, 160);
    config.setColumnWidth(2, 400);
  }

  let guests = ss.getSheetByName('Guests');
  if (!guests) {
    guests = ss.insertSheet('Guests');
    guests.appendRow(['token', 'name', 'attending', 'message', 'updated_at']);
    guests.setColumnWidth(1, 140);
    guests.setColumnWidth(2, 160);
    guests.setColumnWidth(4, 300);
  }

  let gifts = ss.getSheetByName('Gifts');
  if (!gifts) {
    gifts = ss.insertSheet('Gifts');
    gifts.appendRow(['id', 'name', 'created_at']);
    gifts.setColumnWidth(2, 300);
  }

  let claims = ss.getSheetByName('Claims');
  if (!claims) {
    claims = ss.insertSheet('Claims');
    claims.appendRow(['guest_token', 'gift_id', 'claimed_at']);
  }

  const adminKey = getRawConfig().admin_key;
  Logger.log('Setup done. Admin key: ' + adminKey);
  Logger.log('Open admin page at: <your-site>/admin.html?key=' + adminKey);
}

function doGet(e) {
  const action = e.parameter.action;
  try {
    if (action === 'invite') return jsonResponse(getInviteData(e.parameter.token));
    if (action === 'admin')  return jsonResponse(getAdminData(e.parameter.key));
    return jsonResponse({ error: 'unknown_action' });
  } catch (err) {
    return jsonResponse({ error: String(err && err.message || err) });
  }
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (_) {}
  const action = body.action;
  try {
    if (action === 'rsvp')          return jsonResponse(rsvp(body));
    if (action === 'claim')         return jsonResponse(claim(body));
    if (action === 'add_guest')     return jsonResponse(addGuest(body));
    if (action === 'remove_guest')  return jsonResponse(removeGuest(body));
    if (action === 'add_gift')      return jsonResponse(addGift(body));
    if (action === 'remove_gift')   return jsonResponse(removeGift(body));
    if (action === 'update_party')  return jsonResponse(updateParty(body));
    return jsonResponse({ error: 'unknown_action' });
  } catch (err) {
    return jsonResponse({ error: String(err && err.message || err) });
  }
}

/* ---------- Caching ---------- */
// CacheService is an in-memory store shared across all invocations of this script.
// We cache the parsed outputs of each sheet read and invalidate on writes.

const CACHE_TTL = 30; // seconds
const CK = { config: 'config_public', admin: 'admin_key', gifts: 'gifts', guests: 'guests', claims: 'claims' };

function cacheGet(key) {
  const v = CacheService.getScriptCache().get(key);
  return v == null ? null : JSON.parse(v);
}
function cacheSet(key, value) {
  CacheService.getScriptCache().put(key, JSON.stringify(value), CACHE_TTL);
}
function cacheInvalidate(keys) {
  CacheService.getScriptCache().removeAll(keys);
}

/* ---------- Guest-facing ---------- */

function getInviteData(token) {
  const guest = findGuestReadOnly(token);
  if (!guest) return { error: 'invalid_token' };

  const config = getPublicConfig();
  const gifts  = getGifts();
  const claims = getAllClaims();

  const counts = {};
  const mine   = new Set();
  for (const c of claims) {
    counts[c.gift_id] = (counts[c.gift_id] || 0) + 1;
    if (c.guest_token === token) mine.add(String(c.gift_id));
  }

  return {
    guest: { name: guest.name, attending: guest.attending, message: guest.message },
    party: config,
    gifts: gifts.map(g => ({
      id: g.id,
      name: g.name,
      claim_count: counts[g.id] || 0,
      claimed_by_me: mine.has(String(g.id)),
    })),
  };
}

function rsvp(body) {
  const guest = findGuest(body.token);
  if (!guest) return { error: 'invalid_token' };
  const sheet = getSheet('Guests');
  sheet.getRange(guest.row, 3).setValue(body.attending);
  sheet.getRange(guest.row, 4).setValue(body.message || '');
  sheet.getRange(guest.row, 5).setValue(new Date());
  cacheInvalidate([CK.guests]);
  return { ok: true };
}

function claim(body) {
  const guest = findGuest(body.token);
  if (!guest) return { error: 'invalid_token' };

  const sheet = getSheet('Claims');
  const data  = sheet.getDataRange().getValues();

  let existingRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === body.token && String(data[i][1]) === String(body.gift_id)) {
      existingRow = i + 1;
      break;
    }
  }

  if (body.claimed && existingRow === -1) {
    sheet.appendRow([body.token, body.gift_id, new Date()]);
  } else if (!body.claimed && existingRow !== -1) {
    sheet.deleteRow(existingRow);
  }
  cacheInvalidate([CK.claims]);
  return { ok: true };
}

/* ---------- Admin-facing ---------- */

function getAdminData(key) {
  if (!checkAdmin(key)) return { error: 'unauthorized' };

  const config = getPublicConfig();
  const guests = getAllGuests();
  const gifts  = getGifts();
  const claims = getAllClaims();

  const claimsByGift = {};
  const nameByToken = {};
  for (const g of guests) nameByToken[g.token] = g.name;
  for (const c of claims) {
    (claimsByGift[c.gift_id] = claimsByGift[c.gift_id] || []).push(nameByToken[c.guest_token] || '?');
  }

  return {
    party:  config,
    guests: guests,
    gifts:  gifts.map(g => ({ ...g, claimers: claimsByGift[g.id] || [] })),
  };
}

function addGuest(body) {
  if (!checkAdmin(body.key)) return { error: 'unauthorized' };
  if (!body.name || !String(body.name).trim()) return { error: 'name_required' };
  const token = generateToken();
  getSheet('Guests').appendRow([token, String(body.name).trim(), '', '', '']);
  cacheInvalidate([CK.guests]);
  return { ok: true, token };
}

function removeGuest(body) {
  if (!checkAdmin(body.key)) return { error: 'unauthorized' };
  const guest = findGuest(body.token);
  if (!guest) return { error: 'not_found' };
  getSheet('Guests').deleteRow(guest.row);

  const cs = getSheet('Claims');
  const rows = cs.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === body.token) cs.deleteRow(i + 1);
  }
  cacheInvalidate([CK.guests, CK.claims]);
  return { ok: true };
}

function addGift(body) {
  if (!checkAdmin(body.key)) return { error: 'unauthorized' };
  if (!body.name || !String(body.name).trim()) return { error: 'name_required' };
  const sheet = getSheet('Gifts');
  const data  = sheet.getDataRange().getValues();
  let maxId = 0;
  for (let i = 1; i < data.length; i++) {
    const id = Number(data[i][0]);
    if (id > maxId) maxId = id;
  }
  const newId = maxId + 1;
  sheet.appendRow([newId, String(body.name).trim(), new Date()]);
  cacheInvalidate([CK.gifts]);
  return { ok: true, id: newId };
}

function removeGift(body) {
  if (!checkAdmin(body.key)) return { error: 'unauthorized' };
  const sheet = getSheet('Gifts');
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(body.id)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  const cs = getSheet('Claims');
  const rows = cs.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][1]) === String(body.id)) cs.deleteRow(i + 1);
  }
  cacheInvalidate([CK.gifts, CK.claims]);
  return { ok: true };
}

function updateParty(body) {
  if (!checkAdmin(body.key)) return { error: 'unauthorized' };
  const sheet = getSheet('Config');
  const data  = sheet.getDataRange().getValues();
  const fields = ['party_title', 'party_date', 'party_time', 'party_location', 'party_description'];

  for (const field of fields) {
    if (body[field] === undefined) continue;
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === field) {
        sheet.getRange(i + 1, 2).setValue(body[field]);
        found = true;
        break;
      }
    }
    if (!found) sheet.appendRow([field, body[field]]);
  }
  cacheInvalidate([CK.config]);
  return { ok: true };
}

/* ---------- Helpers ---------- */

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function findGuest(token) {
  if (!token) return null;
  const data = getSheet('Guests').getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      return {
        row: i + 1,
        token: data[i][0],
        name: data[i][1],
        attending: data[i][2] || null,
        message: data[i][3] || '',
      };
    }
  }
  return null;
}

function getRawConfig() {
  const data = getSheet('Config').getDataRange().getValues();
  const out = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) out[data[i][0]] = data[i][1];
  }
  return out;
}

function getPublicConfig() {
  const cached = cacheGet(CK.config);
  if (cached) return cached;
  const c = getRawConfig();
  const out = {
    title:       c.party_title || '',
    date:        c.party_date ? formatDate(c.party_date) : '',
    time:        c.party_time ? formatTime(c.party_time) : '',
    location:    c.party_location || '',
    description: c.party_description || '',
  };
  cacheSet(CK.config, out);
  return out;
}

function formatDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v);
}

function formatTime(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  return String(v);
}

function getGifts() {
  const cached = cacheGet(CK.gifts);
  if (cached) return cached;
  const data = getSheet('Gifts').getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) out.push({ id: data[i][0], name: data[i][1] });
  }
  cacheSet(CK.gifts, out);
  return out;
}

function getAllClaims() {
  const cached = cacheGet(CK.claims);
  if (cached) return cached;
  const data = getSheet('Claims').getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) out.push({ guest_token: data[i][0], gift_id: data[i][1] });
  }
  cacheSet(CK.claims, out);
  return out;
}

function getAllGuests() {
  const cached = cacheGet(CK.guests);
  if (cached) return cached;
  const data = getSheet('Guests').getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      out.push({
        token: data[i][0],
        name: data[i][1],
        attending: data[i][2] || null,
        message: data[i][3] || '',
      });
    }
  }
  cacheSet(CK.guests, out);
  return out;
}

function findGuestReadOnly(token) {
  if (!token) return null;
  const guests = getAllGuests();
  for (const g of guests) if (g.token === token) return g;
  return null;
}

function checkAdmin(key) {
  if (!key) return false;
  let adminKey = cacheGet(CK.admin);
  if (adminKey == null) {
    adminKey = getRawConfig().admin_key;
    cacheSet(CK.admin, adminKey);
  }
  return key === adminKey;
}

function generateToken() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}
