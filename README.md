# Meridian Immigration CRM — deployment guide

A real, cloud-hosted CRM: Next.js (web app) + Supabase (Postgres database,
authentication, and Row Level Security policies that enforce Admin/Staff
access **inside the database itself**, not just in the interface).

Nobody needs to install anything — once deployed, Admin and Staff open a
normal browser URL from any computer and sign in.

Budget: Supabase free tier + Vercel free tier comfortably cover 1 Admin + 4
Staff. No credit card required for either at this scale.

---

## A. Create and configure the cloud database (Supabase)

1. Go to https://supabase.com → **Start your project** → sign up (email or GitHub).
2. Click **New project**. Choose an organization, name it e.g. `meridian-crm`,
   set a database password (save it somewhere safe), pick the region closest
   to your office, and click **Create new project**. Wait ~2 minutes for it
   to provision.
3. In the left sidebar, open **SQL Editor** → **New query**.
4. Open `supabase/schema.sql` from this project, copy its entire contents,
   paste into the SQL editor, and click **Run**. This creates every table
   (leads, clients, payments, documents, refunds, slots, visa history,
   activity log) and the Row Level Security policies that enforce your
   access rules at the database level.
5. In the left sidebar, open **Project Settings → API**. Note down:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public** key
   - **service_role** key (click "Reveal" — keep this one secret, never share it)

You now have a live, empty cloud database.

---

## B. Authentication — how it's set up

Authentication uses Supabase's built-in email/password auth (already live —
nothing further to configure). Two things worth knowing:

- Every login is a row in Supabase's private `auth.users` table, linked to a
  row in the `profiles` table you just created, which stores their name and
  `role` (`admin` or `staff`). All access-control checks read this `role`.
- Staff accounts can only be created through the app's Settings page (Admin
  only), which calls a server-side route using the **service_role** key.
  That key never reaches the browser, so Staff can never create accounts or
  escalate their own role.

You'll create the actual Admin and Staff logins in steps E and F below,
after deploying.

---

## C. Deploy the web application (Vercel)

1. Get the code onto GitHub: create a new repository, then from this
   project folder run:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/meridian-crm.git
   git push -u origin main
   ```
2. Go to https://vercel.com → sign up/sign in (GitHub sign-in is easiest) →
   **Add New… → Project** → import the repository you just pushed.
3. Vercel auto-detects Next.js — leave the build settings as default.
4. Before deploying, open **Environment Variables** and add:
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service_role key |
5. Click **Deploy**. Wait ~1–2 minutes.

---

## D. Get the final website URL

When the deploy finishes, Vercel shows a URL like
`https://meridian-crm.vercel.app` — that's the live CRM. Open it in a
browser from any computer. (Optional: in Vercel → **Settings → Domains**,
attach your own domain, e.g. `crm.meridianimmigration.com`.)

---

## E. Create your Admin account

1. In Supabase → **Authentication → Users → Add user → Create new user**.
   Enter your email and a password, and check "Auto Confirm User". Click
   **Create user**. Copy the generated **User UID**.
2. Go to **SQL Editor → New query** and run (replace the two placeholders):
   ```sql
   insert into profiles (id, full_name, role, active)
   values ('PASTE-USER-UID-HERE', 'Your Name', 'admin', true);
   ```
3. Go to your CRM URL → sign in with that email/password. You're now Admin.

---

## F. Create the 3–4 Staff accounts

Do this from inside the app, not Supabase directly:

1. Sign in as Admin → **Settings** → "Staff members" section at the bottom.
2. Enter each staff member's full name, a work email, and a temporary
   password (8+ characters) → **Create staff account**.
3. Repeat for each of your 3–4 staff. Share their email + temporary
   password with them directly (they can't reset it themselves yet in this
   MVP — see "Future hardening" below).
4. Staff sign in at the same CRM URL with those credentials.

---

## G. Test Admin vs Staff permissions

With two browser windows (or one normal + one incognito), sign in as Admin
in one and a Staff member in the other, and verify:

1. **Admin** → Leads: sees every lead from every staff member.
2. **Staff** → Leads: sees only leads assigned to them. Confirm this by
   creating a lead in the Admin window assigned to a *different* staff
   member, then confirming it never appears in this Staff window's list.
3. **Staff** → try visiting `/clients` directly in the address bar. It
   should show "You don't have access to Client Management" — this is
   enforced by the database (Row Level Security), so it also blocks a
   Staff member trying to call the API directly, not just the menu link.
4. Create two leads with the same mobile number → confirm the second
   attempt is blocked with a duplicate warning.
5. As Staff: add a note, set a follow-up date in the past → confirm it
   shows under **Follow-up Center → Overdue** with the correct day count.
6. As Admin: convert a lead to a client → confirm the lead's history
   (notes, follow-ups) is still visible on the lead, and the new record
   appears under **Clients** with all fields blank and ready to fill in.
7. As Admin: mark a client's visa status **Refused** → confirm the
   ₹10,000 refund alert appears and a `Pending` refund record is created;
   confirm it does *not* auto-mark as paid.
8. As Admin: record two partial payments and confirm the balance
   calculates correctly (Total fee − sum of payments).
9. Close the browser entirely, reopen the CRM URL from a different
   computer, sign in again → confirm every lead, note, and follow-up you
   created is still there (this proves it's a shared cloud database, not
   per-browser local storage).

---

## Notes on what's deliberately simple in this first version

- **Staff passwords**: Admin sets a staff member's initial password; there's
  no self-service "forgot password" flow yet. Supabase supports one
  (`supabase.auth.resetPasswordForEmail`) — ask to have it added when you're
  ready.
- **Duplicate-mobile check**: implemented as a database function
  (`find_duplicate_mobile`) that any signed-in user can call. It deliberately
  returns only the minimum info needed to prevent a duplicate (which staff
  member owns it, not the full record) so it doesn't leak another staff
  member's lead details.
- Everything in section 24 of the original brief (WhatsApp, email reminders,
  Excel import, etc.) was intentionally left out of this MVP, as requested —
  the schema and route structure were built so those can be added later
  without a rebuild.
