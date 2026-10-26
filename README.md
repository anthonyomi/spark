# Spark

A private little app for two: never go more than 72 hours, and take turns making the first move.

- **Countdown ring**: how long since last time and how long is left
- **Whose turn**: works it out automatically (the opposite of whoever initiated last)
- **Calendar**: a dot for each time, coloured by who initiated, with the deadline day marked
- **Stats**: streak, times this month, longest gap, missed deadlines, who's been initiating
- **Push reminders** to whoever's turn it is at **24h, 6h and 1h left**, and when time's up
- Works on both phones, updates live, installs to the home screen

## How it fits together

| Part | Service | Cost |
|---|---|---|
| The app (HTML/JS) | GitHub Pages | free |
| Database + logins | Supabase | free tier |
| Reminder timer | Supabase `pg_cron` (runs every 15 min) | free |
| Phone notifications | [ntfy](https://ntfy.sh) app | free |

Open `index.html` with no keys set and it runs in **demo mode** (data saved in that browser only), so you can try it first.

---

## Setup (about 20 minutes)

### 1. Supabase (database + logins)

1. Create a free account at <https://supabase.com> and a new project (pick a region near you).
2. **Authentication → Users → Add user → Create new user** — once for you and once for your wife. Tick *Auto confirm user*. These are the logins you'll use in the app.
3. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up", so nobody else can create an account.
4. Open `supabase/schema.sql`, edit the **partners** block (names, the two emails from step 2, and two long random ntfy topic names), then paste the whole file into **SQL Editor** and click **Run**.
   - If it complains about `pg_cron` or `pg_net`, enable them under **Database → Extensions** and run it again.
   - Optionally set `app_url` in that file to your GitHub Pages URL so tapping a reminder opens the app.
5. **Project Settings → API**: copy the **Project URL** and the **anon / publishable key** into `config.js`.

### 2. Notifications (ntfy)

1. Each of you installs **ntfy** from the App Store / Play Store.
2. Tap **+** and subscribe to *your own* topic name from the partners block (server: `ntfy.sh`).
3. Allow notifications when asked.

Reminders are worded discreetly (e.g. *"Anthony, it's your turn — about 24 hours left 😉"*) since they can show on a lock screen. Change the wording in `check_deadline()` in `schema.sql`.

### 3. Publish on GitHub Pages

1. Create a new GitHub repository (GitHub Pages on a free account needs it to be public — the code is public but **none of your data is**; it lives in Supabase behind your logins). A neutral name like `spark` is fine.
2. Upload all these files (keep the `supabase` folder or leave it out — the app doesn't need it).
3. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.
4. After a minute your app is at `https://<your-username>.github.io/<repo>/`.

### 4. Put it on your phones

- **iPhone**: open the link in Safari → Share → **Add to Home Screen**.
- **Android**: open in Chrome → ⋮ → **Install app** / **Add to Home screen**.

Sign in with the logins from step 1.2. Done.

---

## Changing things

- **Different time window**: change `windowHours` in `config.js` *and* `window_hours` in `check_deadline()` (re-run that function in the SQL editor).
- **Different reminder times**: edit `thresholds` in `check_deadline()`.
- **Test a reminder**: log an entry backdated to ~49 hours ago; within 15 minutes the other person should get the "24 hours left" ping.
