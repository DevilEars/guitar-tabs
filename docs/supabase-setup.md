# Turning on sign-in and sync (Supabase)

Until these steps are done the app runs in **local-only mode**: tabs are saved in the browser / on the phone,
the Account screen says "Sign in unavailable", and the GitHub Pages site keeps working.

You need: a Supabase account (free plan is fine) and access to the GitHub repo settings.

## 1. Create the project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Pick a name (e.g. `guitar-tabs`), a strong database password (store it in your password manager; the app
   never needs it), and the region closest to you. Wait for it to finish provisioning.

## 2. Create the `tabs` table (run the migration)

1. In the project: **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/migrations/20261124213000_create_tabs.sql`](../supabase/migrations/20261124213000_create_tabs.sql) and click **Run**.
3. Check: **Table Editor** shows `tabs` with **RLS enabled**, and **Authentication → Policies** lists four
   `tabs: … own` policies.

*Alternative with the Supabase CLI* (later, e.g. from the box with a personal access token):

```bash
export SUPABASE_ACCESS_TOKEN=...            # dashboard → Account → Access Tokens
npx supabase link --project-ref <project-ref>   # asks for the database password
npx supabase db push                         # applies supabase/migrations/*.sql
```

## 3. Email sign-in

1. **Authentication → Sign In / Providers → Email**: make sure Email is **enabled**. Keep **Confirm email** on
   (new accounts get a confirmation link). Magic links ("Email me a sign-in link") use the same provider.
2. **Authentication → URL Configuration**:
   - **Site URL**: `https://devilears.github.io/guitar-tabs/`
   - **Redirect URLs** → add:
     - `https://devilears.github.io/guitar-tabs/`
     - `guitartabs://auth-callback` (Android app; magic links on Android are untested so far)
     - optionally `http://localhost:8081/` for local web development
3. Supabase's built-in email sender is rate-limited (a few emails per hour) and meant for testing. For real use
   add your own SMTP under **Authentication → Emails → SMTP Settings**.

GitHub / Google sign-in can be added later: enable the provider in **Sign In / Providers**, then wire a button to
`auth.signInWithOAuth('github' | 'google')` (already implemented in `apps/app/src/sync/supabase.ts`).

## 4. Give the app the project URL and public key

From **Project Settings → API Keys** (or the **Connect** dialog) copy:

- the **Project URL** (`https://<project-ref>.supabase.co`)
- the **publishable** key (`sb_publishable_…`) or the legacy **anon** key. Both are public by design.

**Never** use the `service_role` / secret key anywhere in this app or repo.

Set them as **repository variables** (not secrets) so the Pages build can inline them:

- GitHub → repo **Settings → Secrets and variables → Actions → Variables → New repository variable**
  - `EXPO_PUBLIC_SUPABASE_URL` = the Project URL
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY` = the publishable/anon key

or with the gh CLI:

```bash
gh variable set EXPO_PUBLIC_SUPABASE_URL --body "https://<project-ref>.supabase.co" -R DevilEars/guitar-tabs
gh variable set EXPO_PUBLIC_SUPABASE_ANON_KEY --body "sb_publishable_..." -R DevilEars/guitar-tabs
```

Then re-run the deploy: **Actions → Test and deploy web to GitHub Pages → Run workflow** (or push to main).

For local development / Android builds put the same two values in `apps/app/.env.local` (see `apps/app/.env.example`).

## 5. Check it works

1. Open <https://devilears.github.io/guitar-tabs/> → **Sign in** → create an account, confirm the email, sign in.
2. If you had tabs on that device, accept **Upload to my account**.
3. Edit a tab; the header should go *Saving… → Saved · synced*. In Supabase **Table Editor → tabs** the row appears.
4. Sign in on a second browser/device: the same tabs appear. Delete one; it disappears on the other after the next
   sync (on focus, every 60 s, or **Account → Sync now**).

## How sync behaves

- Local-first: every edit is saved on the device first, then pushed. Offline edits sync later.
- Conflicts: **last write wins** by `updated_at`, which the editing device sets. A device with a badly wrong clock
  can win or lose conflicts it shouldn't.
- Deletes are soft (`deleted_at`) so they reach other devices; a newer edit on another device brings the tab back.
- Tabs created while signed out stay on that device until you choose **Upload to my account**.
