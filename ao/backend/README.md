# AO Backend Scaffolding

Planning-grade artifacts for the AO auth + billing + usage-meter stack. **Nothing here is deployed yet** — these files lock the schema and API shape so the frontend (`ao-user.js`, `ao-seed.js`, `configure.html`, etc.) can be wired progressively without backend drift.

## Stack (locked 2026-04-22)

| Concern | Service |
|---|---|
| Identity | Clerk |
| Billing | Stripe (routed through Clerk) |
| Data | Supabase (Postgres + RLS) |
| Gateway / enforcement | Cloudflare Worker in front of the static site + agent-run proxy |

The full rationale lives at `../../new-brand/ao-account-billing-plan.md` (in Jack's workspace, not checked in).

## Files

- `schema.sql` — Supabase migration: tables, types, RLS policies, functions.
- `worker.js` — Cloudflare Worker stub: Clerk JWT verification, plan gate, usage meter, Stripe webhook → plan promotion, Stripe Checkout + Customer Portal session creation.
- `wrangler.toml.example` — env vars the worker expects (copy to `wrangler.toml`, fill secrets with `wrangler secret put`).

## API surface (what `/ao/api/*` and `/ao/webhooks/*` return)

Authenticated routes require `Authorization: Bearer <clerk_jwt>` (client gets it via `Clerk.session.getToken()`). Public routes (lead capture) require nothing.

| Method | Path | Auth | Purpose | Response |
|---|---|---|---|---|
| **POST** | **`/ao/api/leads`** | **public** | **Capture inbound lead from contact form. Validates, scores, persists to `leads` table.** | `{ ok, id, message }` or 400 `invalid_email` / `spam_suspected` / `message_too_long` |
| GET  | `/ao/api/me` | bearer | Current user + plan + usage + orgs | `{ id, email, plan, is_admin, stripe_customer, usage, orgs }` |
| POST | `/ao/api/billing/checkout` | bearer | Create Stripe Checkout Session for Pro/Team upgrade | `{ url, session_id }` |
| POST | `/ao/api/billing/portal` | bearer | Create Stripe Customer Portal session | `{ url }` |
| POST | `/ao/api/runs` | bearer | Start an agent run (gated by plan quota) | `{ run, overage, plan, runs, limit }` or 402 `plan_limit_exceeded` |
| POST | `/ao/api/runs/:id/done` | bearer | Mark run complete | `{ run }` |
| **GET**  | **`/ao/api/admin/overview`** | **bearer + `is_admin`** | **Cross-tenant aggregate for `/ao/admin.html` — customers, leads, agency, revenue, health, recent activity** | `{ customers, leads, agency, revenue, health, activity }` |
| POST | `/ao/webhooks/clerk` | signature | Clerk → mirror user changes to Supabase | — |
| POST | `/ao/webhooks/stripe` | signature | Stripe → apply subscription state to Supabase + Clerk publicMetadata | — |

**Leads body:** `{ name?, email!, company?, message?, type?: 'demo'|'client'|'partner'|'newsletter'|'general', source? }`. Email required + format-validated. Message capped at 5000 chars; messages with 5+ URLs rejected as spam. Inquiry intent boosts the score (demo +15, client +20, partner +12, newsletter -5). Lead is scored using the same logic as `flow-engine.js` (deterministic — corporate email +10, free provider -5, source weighting) and the result (score / tier / qualified / sentiment / notes) is persisted alongside the raw input. CORS allows any `*.deliberateux.com` origin; preflight handled.

**Checkout body:** `{ plan: 'pro' | 'team', period: 'monthly' | 'annual', seats?: number }`. `seats` only applies to Team. Checkout resolves the lookup_key `ao_<plan>_<period>` → active price, creates a subscription session with `subscription_data.metadata.clerk_user_id = <userId>` so the Stripe webhook can mirror plan state back to Clerk + Supabase.

**Portal body:** `{ return_url?: string }` — must be a same-site `/ao/*` path or a `deliberateux.com` URL. Worker rejects cross-domain returns to block open-redirect abuse.

## Plan intent handoff (signup)

The client-side pages `/ao/pricing.html` and `/ao/account.html` capture plan choice during signup:

1. User clicks "Start Pro" on `pricing.html` → redirected to `account.html?plan=pro&period=annual&next=...`
2. `account.html` stashes `ao_signup_plan` + `ao_signup_period` in localStorage, then lets Clerk handle sign-up.
3. After `Clerk.user` becomes available, the page calls `user.update({ unsafeMetadata: { signup_plan, signup_period } })` — `unsafeMetadata` is the only metadata field the browser can write; `publicMetadata` is backend-only.
4. Clerk fires `user.created` → our worker's `/ao/webhooks/clerk` handler reads `unsafe_metadata.signup_plan`, mirrors it into Supabase `users.plan`, and calls Clerk's Backend API (`patchClerkUser`) to promote it into `publicMetadata.plan`.
5. On the user's next JWT refresh, the plan claim is present and the worker's plan gate can read it from the token.

Stripe is the source of truth once real billing exists: `handleStripeWebhook` overwrites `publicMetadata.plan` based on `subscription.status` + `price.lookup_key`. Set price lookup_keys to `ao_pro_monthly`, `ao_pro_annual`, `ao_team_monthly`, `ao_team_annual` in the Stripe dashboard so `planFromLookupKey()` can map them.

## Wiring order (mirrors step 3 of the plan doc)

1. Create Supabase project → run `schema.sql` → capture `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
2. Create Clerk app → enable Stripe billing integration → define `plan` and `is_admin` public metadata keys → capture `CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` + `CLERK_JWT_ISSUER`.
3. Install Clerk SDK on the frontend: `<script src="https://<your-clerk-frontend-api>/v4/clerk.browser.js"></script>` loaded before `ao-user.js` on every AO page. `ao-user.js` auto-detects `window.Clerk` and switches from `guest` to signed-in namespace.
4. Deploy worker (`wrangler deploy`) → route AO origin through it → worker validates JWT on `/ao/api/*` requests, checks plan in Clerk metadata, increments usage counter in Supabase, rejects when Free plan hits 100 runs/month or Pro plan hits 2000.
5. Stripe metered pricing: create products `ao-pro` ($29/mo · $290/yr) + `ao-team` ($49/user/mo · $490/user/yr) + metered overage SKU for Pro. Worker reports usage to Stripe nightly via a scheduled trigger.

## Out of scope for this scaffold

- Actual Clerk/Supabase/Stripe credentials (lives in `wrangler secret` / env)
- Frontend Clerk mount (SignIn/SignUp components go in a separate PR once `ao-account.html` lands)
- Worker-side agent-run proxy to Jack's Mac (comes later; compute ceiling is the real constraint)
- Migration of existing `ao_guest_*` namespace to signed-in users (handled client-side by `AOUser.migrateGuestToUser()` already)
