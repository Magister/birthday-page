# Birthday page 🎂

Simple invitation site:
- Personalized link per guest (no signup, no name typing)
- RSVP (yes/no + optional message)
- Gift wishlist — guests claim what they'll bring; everyone sees counts but not names
- Admin page to manage guests, gifts, party info, and see who's coming

**Stack**: static HTML/JS hosted on GitHub Pages + Google Sheets as the database (via Apps Script).

---

## Setup (one-time, ~15 minutes)

### 1. Create the Google Sheet backend

1. Go to https://sheets.google.com → **+ Blank**.
2. Rename the sheet to something descriptive (e.g. *День народження*).
3. **Extensions → Apps Script**. A new tab opens with a code editor.
4. Delete the default `function myFunction() {}` and paste the entire contents of [`Code.gs`](./Code.gs).
5. Click **💾 Save** (icon top-left).
6. In the function dropdown (toolbar), select `setup` → click **▶ Run**.
   - Google will ask for permissions — approve them (this script only edits *your* sheet).
   - First run: click "Advanced" → "Go to … (unsafe)" — that warning is normal for personal scripts.
7. Open **View → Logs** (or **Execution log**). You'll see:
   ```
   Setup done. Admin key: abc123def456...
   ```
   **Copy that admin key — you'll need it.** (You can also find it later in the `Config` tab of the sheet, row `admin_key`.)

The sheet now has 4 tabs: `Config`, `Guests`, `Gifts`, `Claims`. You can ignore them — the admin page manages everything.

### 2. Deploy Apps Script as a Web App

Still in the Apps Script editor:

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → **Web app**.
3. Settings:
   - **Description**: anything (e.g. *birthday API*)
   - **Execute as**: **Me**
   - **Who has access**: **Anyone** ← important
4. Click **Deploy**.
5. Copy the **Web app URL** (looks like `https://script.google.com/macros/s/AKfyc.../exec`).

### 3. Configure the frontend

Open `config.js` in this repo and paste your Web app URL:

```js
window.API_URL = 'https://script.google.com/macros/s/AKfyc.../exec';
```

### 4. Push to GitHub & enable Pages

1. Create a new GitHub repo (e.g. `birthday-page`), public or private both work.
2. Push these files to it.
3. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / `/ (root)` → **Save**.
4. Wait ~1 minute. Your site is live at `https://<your-username>.github.io/<repo-name>/`.

### 5. Custom subdomain (optional)

1. In your DNS provider, add a **CNAME** record:
   - Name: `party` (or whatever subdomain you want)
   - Value: `<your-username>.github.io`
2. In the GitHub repo: **Settings → Pages → Custom domain** → enter `party.yourdomain.com` → Save.
3. Wait for DNS to propagate (a few minutes to a couple hours), then check **Enforce HTTPS**.

---

## Daily use

### Open admin

```
https://party.yourdomain.com/admin.html?key=YOUR_ADMIN_KEY
```

Bookmark this. It has 3 tabs:

- **👥 Гості** — add guests by name, copy their personal invite link, see who confirmed
- **🎁 Подарунки** — add/remove gifts; see who is bringing what
- **⚙️ Свято** — set the party title, date, time, location, optional description

### Send invites

For each guest in the admin, click **📋 Копіювати** to copy their personal link, then send it via Telegram/WhatsApp/etc. The link looks like:

```
https://party.yourdomain.com/?t=abc123def456
```

When the guest opens it, they see a personal greeting, the party info, can RSVP, and (if attending) can claim gifts.

---

## Updating gifts/guests later

Just open the admin page — no code changes, no redeploys. Everything lives in the Google Sheet.

If you edit `Code.gs` later, you need to **Deploy → Manage deployments → ✏ Edit → New version → Deploy** to publish changes.

## Notes

- The sheet is the source of truth. You can also edit data directly in the spreadsheet if you want.
- The `admin_key` is just a random string in the URL — it's not real auth, but it's enough to keep guests from stumbling onto the admin page.
- If you ever need a new admin key, edit the `admin_key` cell in the `Config` sheet directly.
- Google Apps Script free quota: 20,000 URL fetches/day. You're not getting close to that.
