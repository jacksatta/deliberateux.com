# AO Deployment Checklist

Everything in `/ao/` is built and committable; the frontend works in guest mode today. This doc is the remaining **manual** work to turn on real auth, real billing, and real usage gating.

Order matters. Each step unblocks the next.

---

> **Adjacent docs:**
> - `EMAIL.md` — Cloudflare Email Routing for `ao@deliberateux.com` (Tier 1) and the `ao.deliberateux.com` subdomain identity (Tier 2). 60-second CF dashboard task; unblocks the contact form's reply path.
> - `../../../virtual-agency/docker-compose.twenty.yml` — optional Twenty CRM stack. Adds a real admin UI for triaging leads (replaces the custom admin we'd otherwise have to build). Lives in the agency repo so it travels with the agency to any host.

## 0. Pre-flight

- [ ] Domain: `deliberateux.com` is already on Cloudflare (DNS + CDN) in front of GitHub Pages. Nothing to change.
- [ ] Stripe account exists and is activated for real charges (not just test mode).
- [ ] You have a Cloudflare Workers paid plan or are OK staying on the free tier (10M req/day is plenty for now).

Rough time to complete steps 1–5 end-to-end: **3–4 hours**, most of it waiting for Stripe/Clerk onboarding flows.

---

## 1. Supabase — database + RLS (30 min)

**Why first:** Clerk and the Worker both need Supabase URLs + keys. Nothing else works until this exists.

1. Go to https://supabase.com/ → New Project.
   - Name: `ao-prod`
   - Region: `us-west-1` (closest to you/VPS)
   - DB password: save to 1Password.
2. Wait ~2 min for provisioning.
3. Settings → API → copy:
   - `SUPABASE_URL` (Project URL)
   - `SUPABASE_SERVICE_ROLE_KEY` (⚠️ server-side only, never commit)
4. SQL editor → paste contents of `ao/backend/schema.sql` → Run. Verify 0 errors.
5. Table editor → confirm these tables exist: `users`, `orgs`, `org_members`, `runs`, `usage_monthly`.

**Save to 1Password as "AO Supabase":** URL + service role key.

---

## 2. Clerk — identity + JWT (30 min)

**Why second:** The Worker validates Clerk JWTs; Stripe hooks are routed through Clerk's billing integration.

1. Go to https://clerk.com → Create Application.
   - Name: `AO` (deliberateux.com)
   - Auth methods: Email + Google (skip phone for MVP)
2. Configure → Sessions → **claim session token template** so `plan` and `is_admin` end up in the JWT:
   ```json
   {
     "plan": "{{user.public_metadata.plan}}",
     "is_admin": "{{user.public_metadata.is_admin}}"
   }
   ```
3. User & Authentication → Metadata → Public Metadata schema → add:
   - `plan` (string, enum: `free`, `pro`, `team`, default `free`)
   - `is_admin` (boolean, default false)
4. Configure → Paths → set sign-in URL to `/ao/account.html` and sign-up URL to `/ao/account.html`.
5. Configure → Restrictions → Allowed origins: `https://deliberateux.com`.
6. Developers → API Keys → copy:
   - `CLERK_PUBLISHABLE_KEY` (`pk_live_...`)
   - `CLERK_SECRET_KEY` (`sk_live_...`, ⚠️ server-side only)
   - `CLERK_JWT_ISSUER` — the "Frontend API" URL, e.g. `https://clerk.deliberateux.com` once you add the custom domain, otherwise `https://<your-instance>.clerk.accounts.dev`
7. Webhooks → add endpoint (URL will be your worker's, you'll come back here in step 4):
   - URL placeholder: `https://deliberateux.com/ao/webhooks/clerk`
   - Events: `user.created`, `user.updated`, `user.deleted`
   - Copy the signing secret → `CLERK_WEBHOOK_SECRET`

**Save to 1Password as "AO Clerk":** publishable + secret + webhook secret + issuer URL.

---

## 3. Stripe — products + lookup keys (45 min)

**Why third:** The Worker's checkout endpoint resolves `ao_<plan>_<period>` lookup keys → price IDs. Get the names exactly right or Checkout 500s.

1. Stripe Dashboard → Products → Create product.
   - Name: **AO Pro** · tax code: SaaS
   - Price 1: `$29.00 USD` / month · **lookup_key: `ao_pro_monthly`**
   - Price 2: `$290.00 USD` / year · **lookup_key: `ao_pro_annual`**
2. Create product.
   - Name: **AO Team** · tax code: SaaS
   - Price 1: `$49.00 USD` / month · **per-seat** (quantity adjustable) · **lookup_key: `ao_team_monthly`**
   - Price 2: `$490.00 USD` / year · **per-seat** · **lookup_key: `ao_team_annual`**
3. (Later, not MVP) Create metered overage SKU for Pro `$0.02/run over 2000`.
4. Billing → Customer Portal → Configure:
   - Enable plan switching between the 4 prices above.
   - Enable cancel subscription (at period end).
   - Branding: AO theme (amber + midnight). Logo: deliberateux.com favicon for now.
5. Developers → API keys → copy:
   - `STRIPE_SECRET_KEY` (`sk_live_...`)
6. Developers → Webhooks → Add endpoint.
   - URL: `https://deliberateux.com/ao/webhooks/stripe`
   - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`
   - Copy signing secret → `STRIPE_WEBHOOK_SECRET`

**Save to 1Password as "AO Stripe":** secret key + webhook secret + the 4 price IDs (for reference, even though the Worker looks them up by name).

---

## 4. Cloudflare Worker — deploy (45 min)

**Why fourth:** The Worker is the API + webhook receiver. Nothing on the frontend calls a real endpoint until this is live.

```bash
cd ao/backend
cp wrangler.toml.example wrangler.toml
# edit wrangler.toml: set account_id + CLERK_JWT_ISSUER + SUPABASE_URL
```

Set secrets (each prompts for the value):
```bash
wrangler secret put CLERK_SECRET_KEY
wrangler secret put CLERK_WEBHOOK_SECRET
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
```

Deploy:
```bash
wrangler deploy
```

Route the Worker to `/ao/*`:
1. Cloudflare dashboard → Workers & Pages → `ao-gateway` → Triggers → Routes
2. Add route: `deliberateux.com/ao/api/*` → `ao-gateway`
3. Add route: `deliberateux.com/ao/webhooks/*` → `ao-gateway`

⚠️ **Do NOT** route `deliberateux.com/ao/*` wholesale — that would intercept the static HTML pages and break them. Only the `/api/` and `/webhooks/` subpaths go to the Worker.

Smoke test:
```bash
curl https://deliberateux.com/ao/api/me
# expect: 401 { "error": "unauthorized" }
```

Now **update the Clerk webhook URL** (step 2.7) to point here, and the **Stripe webhook URL** (step 3.6) to point here. Send a test event from each dashboard; check Worker logs with `wrangler tail`.

---

## 5. Frontend — Clerk SDK + wire up (30 min)

**Why last:** Everything above has to exist before the frontend can do real auth.

1. Grab your Clerk frontend API URL (from step 2.6 — `CLERK_JWT_ISSUER` without the `https://` prefix, e.g. `clerk.deliberateux.com` or `my-app.clerk.accounts.dev`).
2. In every `/ao/*.html` page, add this before `ao-user.js`:
   ```html
   <script
     async
     crossorigin="anonymous"
     data-clerk-publishable-key="pk_live_YOUR_KEY"
     src="https://YOUR-FRONTEND-API/npm/@clerk/clerk-js@5/dist/clerk.browser.js"
     type="text/javascript"
   ></script>
   ```
3. On `/ao/account.html`, the page already mounts `<div id="clerk-signin">` via `Clerk.mountSignIn(...)`. Verify the sign-in flow works by going to `/ao/account.html` on prod, signing up with a test email, and confirming:
   - a `users` row appears in Supabase
   - the Clerk webhook fires (Clerk dashboard → Webhooks → Attempts)
   - `/ao/api/me` returns your user record with `plan: 'free'`

4. Test upgrade: click a Pro CTA on `/ao/pricing.html` while signed in → you should land on Stripe Checkout. Complete with a test card (`4242 4242 4242 4242`) in Stripe test mode, then:
   - Stripe webhook fires
   - `users.plan` in Supabase flips to `pro`
   - `/ao/api/me` returns `plan: 'pro'`
   - Console on `/ao/account.html` re-renders with the Pro badge

---

## 5b. (Optional) Twenty CRM — triage UI for leads (30 min)

**Why:** Skip building a custom admin UI for lead triage. Twenty is open-source (MIT), self-hostable, and already has the lead-pipeline / kanban / custom-fields surface we'd otherwise have to design. The form-to-worker-to-Supabase loop still runs as the source of truth; Twenty is the human-facing triage layer the worker fans leads out to.

**On the VPS** (or your local Mac, for testing):

```bash
cp /Users/jack/Local\ Docs/Projects/virtual-agency/.env.twenty.example .env.twenty
# Edit .env.twenty — generate APP_SECRET with: openssl rand -base64 32
# Edit it again — pick a strong TWENTY_PG_PASSWORD

# Standalone test on local Mac:
docker compose -f /Users/jack/Local\ Docs/Projects/virtual-agency/docker-compose.twenty.yml \
  --env-file .env.twenty up -d

# Or merge the services into the openclaw VPS compose (~/openclaw/docker-compose.yml)
# then deploy normally:
bash ~/openclaw/deploy-vps.sh
```

**One-time setup in the Twenty UI:**

1. Visit `http://localhost:3000` (or `https://twenty.deliberateux.com` once DNS is wired)
2. Create your workspace — first admin account
3. Settings → API & Webhooks → **Generate API key** (read+write scope)
4. Save the API key to 1Password as "AO Twenty"

**Wire it to the worker:**

In `wrangler.toml` (public vars):
```toml
TWENTY_URL = "https://twenty.deliberateux.com"   # or http://100.71.12.80:3000 for Tailscale-only
```

Then secret:
```bash
wrangler secret put TWENTY_API_KEY
```

**Custom fields to add inside Twenty** (Settings → Data model → People → + Add field):
- `aoSource` (TEXT)
- `aoInquiryType` (TEXT)
- `aoMessage` (TEXT, multi-line)
- `aoScore` (NUMBER)
- `aoTier` (TEXT)
- `aoQualified` (BOOLEAN)
- `aoSentiment` (TEXT)
- `aoNotes` (TEXT, multi-line)
- `aoSupabaseId` (TEXT)

If a field doesn't exist when the worker posts, Twenty ignores it cleanly — no breakage.

**Smoke test:** submit a test entry from `/ao/index.html`'s contact form. The response JSON includes `destinations: { supabase: true, twenty: 'created' }`. Both Twenty and Supabase should have the lead within seconds.

---

## 6. Go-live switches

- [ ] Flip Stripe from test mode to live mode; swap `STRIPE_SECRET_KEY` + webhook secret.
- [ ] Flip Clerk from Development → Production instance; swap `CLERK_SECRET_KEY` + publishable key.
- [ ] Run `wrangler deploy` once more with the production secrets.
- [ ] Add a row to `ao-work-tracker.xlsx` marking AO billing as **LIVE**.
- [ ] Tell Sarah, announce on LinkedIn/X.

---

## Rollback

If billing goes sideways:

1. **Kill payments only:** disable the Stripe webhook endpoint. Existing subs keep working, no new charges hit the system until re-enabled.
2. **Kill auth:** remove Clerk script tag from HTML pages — frontend degrades to guest mode (`ao-user.js` detects `!window.Clerk`). Existing users can't sign in, but no data corruption.
3. **Kill everything:** revert the Worker route (`deliberateux.com/ao/api/*`) in Cloudflare. Frontend calls start 404ing; `ao-user.js`'s `fetchMe()` catches and falls back to guest state.

Supabase data survives all three scenarios. Worst case: delete the Worker, site is static again.

---

## Out of scope for this checklist

- Agent-run compute proxy (the Worker doesn't yet proxy to your Mac — `POST /ao/api/runs` just records the attempt and enforces plan limits; actual execution happens elsewhere).
- Multi-tenant org billing split (Team plan billing is per-seat but seat management UI lives in `/ao/configure.html` which doesn't yet call real org-admin endpoints).
- SSO for Team plan (SAML/OIDC through Clerk is a later upsell).
- Usage-based overage billing for Pro (`$0.02/run` over 2000). Code is commented in `worker.js` for the metered-price path; wire after first $10k MRR.

---

## Quick reference — env vars the Worker expects

```
CLERK_JWT_ISSUER            https://...clerk.accounts.dev      # public, in wrangler.toml [vars]
SUPABASE_URL                https://<ref>.supabase.co           # public, in wrangler.toml [vars]
CLERK_SECRET_KEY            sk_live_...                         # secret
CLERK_WEBHOOK_SECRET        whsec_...                           # secret
SUPABASE_SERVICE_ROLE_KEY   eyJ...                              # secret
STRIPE_SECRET_KEY           sk_live_...                         # secret
STRIPE_WEBHOOK_SECRET       whsec_...                           # secret
```

## Quick reference — Clerk public_metadata schema

```json
{
  "plan": "free" | "pro" | "team",
  "is_admin": true | false
}
```

## Quick reference — Stripe lookup_keys

- `ao_pro_monthly`  → $29/mo
- `ao_pro_annual`   → $290/yr
- `ao_team_monthly` → $49/seat/mo
- `ao_team_annual`  → $490/seat/yr
