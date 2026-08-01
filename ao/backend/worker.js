/**
 * AO Cloudflare Worker — gateway + plan enforcement
 *
 * Routes:
 *   GET  /ao/api/me              → current user + plan + usage
 *   POST /ao/api/runs            → start an agent run (gated by plan quota)
 *   POST /ao/api/runs/:id/done   → mark a run complete + report usage to Stripe
 *   POST /ao/webhooks/clerk      → mirror Clerk user/metadata changes into Supabase
 *   POST /ao/webhooks/stripe     → apply subscription state changes
 *   *    /*                      → pass through to origin (static site on Pages)
 *
 * Nothing here is wired to real infrastructure yet. Deploy path:
 *   1. cp wrangler.toml.example wrangler.toml
 *   2. wrangler secret put CLERK_SECRET_KEY
 *      wrangler secret put SUPABASE_SERVICE_ROLE_KEY
 *      wrangler secret put STRIPE_SECRET_KEY
 *      wrangler secret put CLERK_WEBHOOK_SECRET
 *      wrangler secret put STRIPE_WEBHOOK_SECRET
 *   3. wrangler deploy
 */

// NOTE: keep imports to a minimum. Cloudflare Workers prefer native fetch + Web Crypto
// over heavy SDKs. Clerk's `@clerk/backend` works but adds ~200kb; we hand-verify JWTs
// via JWKS instead.

const PLAN_LIMITS = { free: 100, pro: 2000, team: 10000 };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Pass non-API / non-webhook traffic straight to origin.
    if (!path.startsWith('/ao/api/') && !path.startsWith('/ao/webhooks/')) {
      return fetch(request);
    }

    try {
      if (path.startsWith('/ao/webhooks/clerk'))  return handleClerkWebhook(request, env);
      if (path.startsWith('/ao/webhooks/stripe')) return handleStripeWebhook(request, env);

      // ── Public routes (no auth required) ────────────────────────────
      // Lead capture from the public contact form. Must come BEFORE the JWT
      // gate since visitors aren't signed in.
      if (path === '/ao/api/leads' && request.method === 'POST') {
        return handleLeadCapture(request, env);
      }
      // Preflight for the lead capture route (form may live on a subdomain later).
      if (path === '/ao/api/leads' && request.method === 'OPTIONS') {
        return corsPreflight(request.headers.get('origin'));
      }

      // ── Authenticated routes ────────────────────────────────────────
      // Everything else under /ao/api/* requires a valid Clerk JWT.
      const auth = await verifyClerkJWT(request, env);
      if (!auth.ok) return json({ error: auth.error }, 401);

      // Admin-only — must be authenticated AND have is_admin in publicMetadata
      if (path === '/ao/api/admin/overview' && request.method === 'GET') {
        return handleAdminOverview(request, env, auth.userId);
      }

      if (path === '/ao/api/me' && request.method === 'GET') {
        return handleMe(request, env, auth.userId);
      }
      if (path === '/ao/api/billing/portal' && request.method === 'POST') {
        return handleBillingPortal(request, env, auth.userId);
      }
      if (path === '/ao/api/billing/checkout' && request.method === 'POST') {
        return handleBillingCheckout(request, env, auth.userId);
      }
      if (path === '/ao/api/runs' && request.method === 'POST') {
        return handleStartRun(request, env, auth.userId);
      }
      const runDoneMatch = path.match(/^\/ao\/api\/runs\/([^/]+)\/done$/);
      if (runDoneMatch && request.method === 'POST') {
        return handleFinishRun(request, env, auth.userId, runDoneMatch[1]);
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: 'internal', detail: String(err && err.message || err) }, 500);
    }
  },

  // Nightly scheduled trigger: push Stripe metered usage for Pro overage.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(reportStripeUsage(env));
  }
};

// ─────────────────────────────────────────────────────────────────────
// Auth — verify Clerk-issued session JWTs against the public JWKS.
// ─────────────────────────────────────────────────────────────────────
async function verifyClerkJWT(request, env) {
  const authz = request.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) return { ok: false, error: 'missing bearer token' };

  // Minimal JWT verify: fetch JWKS, check sig + iss + exp. Real impl caches JWKS in
  // cf cache for ~1h.  Leaving as TODO stub — first deploy will use `@clerk/backend`
  // instead if stubbing ends up costing more than importing it.
  try {
    const payload = decodeUnverifiedPayload(token);
    if (!payload) return { ok: false, error: 'malformed token' };
    if (payload.iss !== env.CLERK_JWT_ISSUER) return { ok: false, error: 'bad issuer' };
    if (payload.exp && payload.exp * 1000 < Date.now()) return { ok: false, error: 'expired' };
    // TODO: verify signature against env.CLERK_JWT_ISSUER/.well-known/jwks.json
    return { ok: true, userId: payload.sub };
  } catch (e) {
    return { ok: false, error: 'invalid token' };
  }
}

function decodeUnverifiedPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch (e) { return null; }
}

// ─────────────────────────────────────────────────────────────────────
// Route handlers
// ─────────────────────────────────────────────────────────────────────

async function handleMe(request, env, userId) {
  const user = await supabaseSelectOne(env, 'users', { id: userId });
  if (!user) return json({ error: 'user not mirrored yet' }, 404);

  const usage = await supabaseSelectOne(env, 'usage_current_month', { user_id: userId });
  const limit = PLAN_LIMITS[user.plan] ?? 0;
  const runs  = usage?.runs ?? 0;

  // Orgs owned by this user. The single-tenant ownership model is keyed by
  // users.id; a future memberships table will broaden this for Team plans.
  const orgs = await supabaseSelect(env, 'orgs', { user_id: userId }, {
    select: 'id,slug,name,type,status',
    order: 'created_at.asc'
  });
  const orgList = (orgs || []).map(o => ({
    id: o.id,
    slug: o.slug,
    name: o.name,
    type: o.type,
    status: o.status,
    // Every org currently owned = 'owner'. When memberships ship we'll read the
    // membership row's role column instead.
    role: 'owner'
  }));

  return json({
    id: user.id,
    email: user.email,
    plan: user.plan,
    is_admin: user.is_admin,
    stripe_customer: user.stripe_customer || null,
    usage: {
      month: usage?.billing_month ?? new Date().toISOString().slice(0, 7),
      runs,
      runs_this_month: runs, // alias for client renderers
      limit,
      remaining: Math.max(0, limit - runs)
    },
    orgs: orgList
  });
}

// ─────────────────────────────────────────────────────────────────────
// Billing — Stripe Customer Portal (for existing subscribers) and
// Stripe Checkout (for first-time upgrades). Both require STRIPE_SECRET_KEY
// and a stripe_customer already provisioned (checkout creates one if
// missing; portal refuses if missing).
// ─────────────────────────────────────────────────────────────────────
async function handleBillingPortal(request, env, userId) {
  const user = await supabaseSelectOne(env, 'users', { id: userId });
  if (!user) return json({ error: 'user not mirrored yet' }, 404);
  if (!user.stripe_customer) {
    return json({ error: 'no stripe customer — upgrade via checkout first' }, 409);
  }
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'stripe not configured' }, 501);

  const body = await safeJson(request);
  const returnUrl = sanitizeReturnUrl(body?.return_url) ||
    `${new URL(request.url).origin}/ao/account.html`;

  const form = new URLSearchParams();
  form.set('customer', user.stripe_customer);
  form.set('return_url', returnUrl);

  const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: form
  });
  if (!res.ok) {
    const detail = await res.text();
    return json({ error: 'stripe portal failed', detail }, 502);
  }
  const sess = await res.json();
  return json({ url: sess.url });
}

// POST /ao/api/billing/checkout  { plan: 'pro'|'team', period: 'monthly'|'annual', seats?: n }
// Returns { url } → Stripe Checkout Session URL. Client redirects user there.
async function handleBillingCheckout(request, env, userId) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'stripe not configured' }, 501);
  const user = await supabaseSelectOne(env, 'users', { id: userId });
  if (!user) return json({ error: 'user not mirrored yet' }, 404);

  const body = await safeJson(request) || {};
  const plan = /^(pro|team)$/.test(body.plan) ? body.plan : null;
  const period = /^(monthly|annual)$/.test(body.period) ? body.period : 'monthly';
  const seats = Math.max(1, Math.min(200, parseInt(body.seats, 10) || 1));
  if (!plan) return json({ error: 'bad plan' }, 400);

  const lookupKey = `ao_${plan}_${period}`;
  // Resolve lookup_key → price_id.
  const priceRes = await fetch(
    `https://api.stripe.com/v1/prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&active=true&limit=1`,
    { headers: { 'authorization': `Bearer ${env.STRIPE_SECRET_KEY}` } }
  );
  if (!priceRes.ok) return json({ error: 'price lookup failed' }, 502);
  const prices = await priceRes.json();
  const priceId = prices?.data?.[0]?.id;
  if (!priceId) return json({ error: `no active price for ${lookupKey}` }, 404);

  const origin = new URL(request.url).origin;
  const successUrl = `${origin}/ao/account.html?checkout=success`;
  const cancelUrl  = `${origin}/ao/pricing.html?checkout=cancel`;

  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('success_url', successUrl);
  form.set('cancel_url', cancelUrl);
  form.set('line_items[0][price]', priceId);
  form.set('line_items[0][quantity]', plan === 'team' ? String(seats) : '1');
  form.set('client_reference_id', userId);
  // Critical: subscription.metadata.clerk_user_id → what the Stripe webhook
  // reads to mirror plan state back into Clerk publicMetadata + Supabase.
  form.set('subscription_data[metadata][clerk_user_id]', userId);
  form.set('subscription_data[metadata][plan]', plan);
  form.set('subscription_data[metadata][period]', period);
  if (user.stripe_customer) {
    form.set('customer', user.stripe_customer);
  } else if (user.email) {
    form.set('customer_email', user.email);
  }
  form.set('allow_promotion_codes', 'true');

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: form
  });
  if (!res.ok) {
    const detail = await res.text();
    return json({ error: 'stripe checkout failed', detail }, 502);
  }
  const sess = await res.json();
  return json({ url: sess.url, session_id: sess.id });
}

function sanitizeReturnUrl(u) {
  if (!u || typeof u !== 'string') return null;
  // Only allow same-site returns. Blocks open-redirect abuse.
  if (u.startsWith('/ao/')) return u;
  try {
    const parsed = new URL(u);
    if (parsed.hostname.endsWith('deliberateux.com')) return u;
  } catch (e) {}
  return null;
}

async function handleStartRun(request, env, userId) {
  const user = await supabaseSelectOne(env, 'users', { id: userId });
  if (!user) return json({ error: 'user not mirrored yet' }, 404);

  const usage = await supabaseSelectOne(env, 'usage_current_month', { user_id: userId });
  const limit = PLAN_LIMITS[user.plan] ?? 0;
  const runs  = usage?.runs ?? 0;
  const overage = runs >= limit;

  // Free plan: hard-stop at the limit. Pro/team: allow overage, meter it to Stripe.
  if (overage && user.plan === 'free') {
    return json({
      error: 'plan_limit_exceeded',
      plan: user.plan,
      limit,
      runs,
      upgrade_url: '/ao/pricing.html'
    }, 402);
  }

  const body = await safeJson(request);
  const row = await supabaseInsert(env, 'agent_runs', {
    user_id: userId,
    org_id: body?.org_id ?? null,
    agent: body?.agent ?? 'unknown',
    flow_name: body?.flow_name ?? null,
    status: 'running',
    input: body?.input ?? null
  });

  return json({ run: row, overage, plan: user.plan, runs: runs + 1, limit });
}

async function handleFinishRun(request, env, userId, runId) {
  const body = await safeJson(request);
  const updated = await supabaseUpdate(env, 'agent_runs', { id: runId, user_id: userId }, {
    status: body?.status ?? 'completed',
    output: body?.output ?? null,
    duration_ms: body?.duration_ms ?? null,
    completed_at: new Date().toISOString()
  });
  if (!updated) return json({ error: 'run not found' }, 404);
  return json({ run: updated });
}

// ─────────────────────────────────────────────────────────────────────
// POST /ao/api/leads — public lead capture from the AO contact form.
// No auth required (anonymous visitors). Validates input, scores the lead
// using the same logic as flow-engine.js, persists to Supabase, returns
// success. Slack/email notifications are intentionally NOT fired here yet —
// they wait until Jack wires real Slack + Postmark/Resend secrets.
// ─────────────────────────────────────────────────────────────────────
async function handleLeadCapture(request, env) {
  const body = await safeJson(request);
  if (!body) return corsJson({ error: 'invalid_json' }, 400);

  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return corsJson({ error: 'invalid_email' }, 400);
  }

  // Crude rate-limit + spam guard: reject obvious garbage. Real impl uses
  // Cloudflare Turnstile or similar; for first-launch this catches noise.
  const message = String(body.message || '').trim();
  if (message.length > 5000) return corsJson({ error: 'message_too_long' }, 400);
  if (/(\bhttps?:\/\/[^\s]+){5,}/i.test(message)) return corsJson({ error: 'spam_suspected' }, 400);

  const allowedTypes = new Set(['demo', 'client', 'partner', 'newsletter', 'general']);
  const inquiryType = allowedTypes.has(body.type) ? body.type : 'general';

  // Score what we can. Public form doesn't capture employees/budget yet —
  // those come from a richer onboarding flow later. So scoring keys off
  // email domain (corporate vs free provider) + source + inquiry intent.
  const scored = scoreLead({
    employees: 0,
    budget_range: '',
    source: body.source || 'ao-website',
    email
  });
  // Bump score for explicit demo/client/partner intent vs newsletter.
  const intentBoost = { demo: 15, client: 20, partner: 12, newsletter: -5, general: 0 }[inquiryType] || 0;
  scored.score = Math.max(0, Math.min(100, scored.score + intentBoost));
  if (intentBoost) scored.reasons.push(`Inquiry: ${inquiryType} (${intentBoost >= 0 ? '+' : ''}${intentBoost})`);
  // Re-derive tier after the boost
  scored.tier = scored.score >= 70 ? 'enterprise' : scored.score >= 40 ? 'growth' : 'starter';
  scored.qualified = scored.score >= 30;
  scored.sentiment = scored.score >= 60 ? 'high-intent' : scored.score >= 30 ? 'warm' : 'cold';

  const lead = {
    name: String(body.name || '').trim().slice(0, 200) || null,
    email,
    company: String(body.company || '').trim().slice(0, 200) || null,
    message: message || null,
    inquiry_type: inquiryType,
    source: String(body.source || 'ao-website').slice(0, 100),
    user_agent: (request.headers.get('user-agent') || '').slice(0, 500),
    ip: request.headers.get('cf-connecting-ip') || null,
    score: scored.score,
    tier: scored.tier,
    qualified: scored.qualified,
    sentiment: scored.sentiment,
    notes: scored.reasons.join('; ').slice(0, 1000),
    status: 'new'
  };

  // Primary persistence: Supabase. Always written. This is the always-on
  // record so even if external CRM destinations fail, we don't lose the lead.
  let inserted;
  try {
    inserted = await supabaseInsert(env, 'leads', lead);
  } catch (e) {
    return corsJson({ error: 'persist_failed', detail: String(e.message || e) }, 500);
  }

  // Fan-out to external destinations (Twenty CRM, generic webhook, etc.).
  // Failures are logged but don't break the form response — the visitor
  // shouldn't care that our CRM integration hiccupped.
  const fanout = await notifyLeadDestinations(env, lead, inserted?.id);

  return corsJson({
    ok: true,
    id: inserted?.id || null,
    destinations: fanout,
    message: "thanks — we'll be in touch soon"
  });
}

// ─────────────────────────────────────────────────────────────────────
// GET /ao/api/admin/overview — cross-tenant aggregate for /ao/admin.html.
// Admin-only. Bypasses the user-scoped RLS by reading via service role.
// Returns the exact shape /ao/admin.html expects so the page swaps from
// seeded → live with no code change on the client.
// ─────────────────────────────────────────────────────────────────────
async function handleAdminOverview(request, env, userId) {
  const me = await supabaseSelectOne(env, 'users', { id: userId });
  if (!me || !me.is_admin) return json({ error: 'forbidden' }, 403);

  // Run all the aggregations in parallel — none of them block on each other,
  // so total wall time stays close to the slowest single query.
  const [
    customerStats,
    leadStats,
    runStats,
    recentActivity
  ] = await Promise.all([
    aggregateCustomers(env),
    aggregateLeads(env),
    aggregateRuns(env),
    aggregateActivity(env)
  ]);

  return json({
    customers: customerStats,
    leads:     leadStats,
    agency:    {
      // Agency state still lives on Jack's Mac (virtual-agency/status/STATUS.md).
      // Until that's mirrored to Supabase or a web endpoint, this card stays
      // mostly informational. The launchd plists drive the schedule.
      last_tick: 'EA · daily 9 AM',
      last_tick_short: 'daily',
      breakdown: [
        { label: 'Schedules active', value: 3 },
        { label: 'Queue tasks',      value: 2 },
        { label: 'Pending Jack',     value: 1 }
      ],
      age: 'launchd-driven · STATUS.md on disk'
    },
    revenue: {
      // Stripe-derived. Skip until env.STRIPE_SECRET_KEY is present.
      mrr: env.STRIPE_SECRET_KEY ? '$0' : '$0',
      delta_7d: '',
      breakdown: [
        { label: 'Active subs',     value: 0 },
        { label: 'Trial',           value: 0 },
        { label: 'Cancelled (30d)', value: 0 }
      ],
      age: env.STRIPE_SECRET_KEY ? 'Stripe live · no subs yet' : 'Stripe not yet deployed'
    },
    health: runStats,
    activity: recentActivity
  });
}

async function aggregateCustomers(env) {
  // Headcount + plan breakdown via Supabase. PostgREST supports
  // `?select=count` for count-only queries.
  try {
    const total = await supabaseCount(env, 'users');
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const delta = await supabaseCount(env, 'users', { 'created_at': `gte.${since}` });
    const [free, pro, team] = await Promise.all([
      supabaseCount(env, 'users', { plan: 'eq.free' }),
      supabaseCount(env, 'users', { plan: 'eq.pro' }),
      supabaseCount(env, 'users', { plan: 'eq.team' })
    ]);
    return {
      total,
      delta_7d: delta,
      breakdown: [
        { label: 'Free', value: free },
        { label: 'Pro',  value: pro },
        { label: 'Team', value: team }
      ],
      age: total === 0 ? 'no signups yet' : 'live'
    };
  } catch (e) {
    return { total: 0, delta_7d: 0, breakdown: [], age: 'query failed: ' + e.message };
  }
}

async function aggregateLeads(env) {
  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const total = await supabaseCount(env, 'leads', { 'created_at': `gte.${since}` });
    const [hi, warm, cold] = await Promise.all([
      supabaseCount(env, 'leads', { sentiment: 'eq.high-intent', 'created_at': `gte.${since}` }),
      supabaseCount(env, 'leads', { sentiment: 'eq.warm',        'created_at': `gte.${since}` }),
      supabaseCount(env, 'leads', { sentiment: 'eq.cold',        'created_at': `gte.${since}` })
    ]);
    return {
      total,
      delta_7d: total, // it IS the 7d count
      breakdown: [
        { label: 'High-intent', value: hi },
        { label: 'Warm',        value: warm },
        { label: 'Cold',        value: cold }
      ],
      age: total === 0 ? 'no inbound yet — form goes live with worker deploy' : 'live'
    };
  } catch (e) {
    return { total: 0, delta_7d: 0, breakdown: [], age: 'query failed: ' + e.message };
  }
}

async function aggregateRuns(env) {
  try {
    const since = new Date(Date.now() - 86400000).toISOString();
    const today  = await supabaseCount(env, 'agent_runs', { 'started_at': `gte.${since}` });
    const failed = await supabaseCount(env, 'agent_runs', { status: 'eq.failed', 'started_at': `gte.${since}` });
    return {
      runs_today: today,
      delta_7d: 0,
      breakdown: [
        { label: 'Worker 200',    value: '—' },
        { label: 'Failed runs',   value: failed },
        { label: 'p95 latency',   value: '—' }
      ],
      age: today === 0 ? 'worker pending deploy' : 'live'
    };
  } catch (e) {
    return { runs_today: 0, delta_7d: 0, breakdown: [], age: 'query failed: ' + e.message };
  }
}

async function aggregateActivity(env) {
  // Latest 5 mixed events — recent users + recent leads, interleaved.
  try {
    const [users, leads] = await Promise.all([
      supabaseSelect(env, 'users', {}, { select: 'id,email,plan,created_at', order: 'created_at.desc', limit: 5 }),
      supabaseSelect(env, 'leads', {}, { select: 'id,email,inquiry_type,tier,created_at', order: 'created_at.desc', limit: 5 })
    ]);
    const events = []
      .concat((users || []).map(u => ({
        when_iso: u.created_at,
        when: shortWhen(u.created_at),
        who: 'signup',
        agent: false,
        what: `${u.email} on ${u.plan} plan.`
      })))
      .concat((leads || []).map(l => ({
        when_iso: l.created_at,
        when: shortWhen(l.created_at),
        who: 'lead',
        agent: false,
        what: `${l.email} · ${l.inquiry_type} · ${l.tier}.`
      })))
      .sort((a, b) => b.when_iso.localeCompare(a.when_iso))
      .slice(0, 8);
    return events;
  } catch (e) {
    return [];
  }
}

function shortWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return sameDay
    ? `today ${hh}:${mm}`
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Supabase count helper — uses PostgREST `Prefer: count=exact` header.
async function supabaseCount(env, table, match = {}) {
  const qs = new URLSearchParams();
  qs.set('select', 'id');
  for (const [k, v] of Object.entries(match)) qs.set(k, v);
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    headers: { ...supabaseHeaders(env), 'prefer': 'count=exact', 'range-unit': 'items', 'range': '0-0' }
  });
  if (!res.ok) return 0;
  // PostgREST returns the count in the Content-Range header: "0-0/42"
  const cr = res.headers.get('content-range') || '';
  const m = cr.match(/\/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

// Fan-out a captured lead to every configured external destination. Each
// destination is independent: a failure in one doesn't block the others.
// Returns a summary so the caller can log which destinations actually fired.
async function notifyLeadDestinations(env, lead, supabaseId) {
  const results = { supabase: !!supabaseId };

  // ── Twenty CRM (twenty.com — open-source) ───────────────────────────
  // If TWENTY_URL + TWENTY_API_KEY are configured, create a Person object
  // and attach the message + score as custom fields. We use the REST API
  // (Twenty exposes /rest/v1/* and /graphql; REST is simpler for one-shots).
  // Schema: { firstName, lastName, email, jobTitle, company, ... } —
  // custom fields the user has added are passed through unchanged.
  if (env.TWENTY_URL && env.TWENTY_API_KEY) {
    try {
      const [firstName, ...rest] = (lead.name || '').trim().split(/\s+/);
      const lastName = rest.join(' ') || null;
      const personPayload = {
        name: { firstName: firstName || null, lastName },
        emails: { primaryEmail: lead.email, additionalEmails: [] },
        // These map to Twenty's standard or custom fields. If the field
        // doesn't exist in the target workspace, Twenty ignores it cleanly.
        companyName: lead.company || null,
        jobTitle: null,
        // Custom fields the AO worker writes:
        aoSource: lead.source,
        aoInquiryType: lead.inquiry_type,
        aoMessage: lead.message,
        aoScore: lead.score,
        aoTier: lead.tier,
        aoQualified: lead.qualified,
        aoSentiment: lead.sentiment,
        aoNotes: lead.notes,
        aoSupabaseId: supabaseId || null
      };
      const tw = await fetch(`${env.TWENTY_URL.replace(/\/$/, '')}/rest/v1/people`, {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${env.TWENTY_API_KEY}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(personPayload)
      });
      results.twenty = tw.ok ? 'created' : `failed:${tw.status}`;
      if (!tw.ok) {
        // Log the body for debugging — Twenty returns helpful error JSON
        try { results.twenty_detail = (await tw.text()).slice(0, 200); } catch (_) {}
      }
    } catch (e) {
      results.twenty = `error:${String(e.message || e).slice(0, 80)}`;
    }
  }

  // ── Generic outbound webhook (Zapier, n8n, anything else) ───────────
  // Set LEAD_WEBHOOK_URL to fan out a JSON copy of the lead. Optional shared
  // secret in LEAD_WEBHOOK_SECRET goes into X-AO-Signature header.
  if (env.LEAD_WEBHOOK_URL) {
    try {
      const headers = { 'content-type': 'application/json' };
      if (env.LEAD_WEBHOOK_SECRET) headers['x-ao-signature'] = env.LEAD_WEBHOOK_SECRET;
      const wh = await fetch(env.LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...lead, supabaseId, capturedAt: new Date().toISOString() })
      });
      results.webhook = wh.ok ? 'delivered' : `failed:${wh.status}`;
    } catch (e) {
      results.webhook = `error:${String(e.message || e).slice(0, 80)}`;
    }
  }

  return results;
}

// Deterministic lead scoring — ported from flow-engine.js so the public form
// and the canvas flow use identical logic.
function scoreLead(lead) {
  let s = 0;
  const reasons = [];
  // Company size (signal absent on public form unless filled)
  if (lead.employees >= 500)      { s += 30; reasons.push('Enterprise size (+30)'); }
  else if (lead.employees >= 100) { s += 20; reasons.push('Mid-market size (+20)'); }
  else if (lead.employees >= 20)  { s += 10; reasons.push('Small business (+10)'); }
  // Budget signal
  if (lead.budget_range) {
    const m = String(lead.budget_range).match(/(\d+)/);
    if (m && parseInt(m[1], 10) >= 50)      { s += 20; reasons.push('Budget 50k+ (+20)'); }
    else if (m && parseInt(m[1], 10) >= 10) { s += 10; reasons.push('Budget 10k+ (+10)'); }
    else if (m)                              { s += 5;  reasons.push('Budget mentioned (+5)'); }
  }
  // Source
  const srcMap = { referral: 25, partner: 20, website: 15, 'ao-website': 15, ads: 10, organic: 12, direct: 8 };
  const srcVal = srcMap[lead.source] ?? 10;
  s += srcVal;
  reasons.push(`Source: ${lead.source || 'unknown'} (+${srcVal})`);
  // Email domain quality
  const domain = (lead.email || '').split('@')[1] || '';
  const freeProviders = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'proton.me', 'protonmail.com']);
  if (domain && !freeProviders.has(domain)) { s += 10; reasons.push('Corporate email (+10)'); }
  else if (domain)                          { s -= 5; reasons.push('Free email provider (-5)'); }
  const tier = s >= 70 ? 'enterprise' : s >= 40 ? 'growth' : 'starter';
  return {
    score: Math.max(0, Math.min(100, s)),
    tier,
    qualified: s >= 30,
    sentiment: s >= 60 ? 'high-intent' : s >= 30 ? 'warm' : 'cold',
    reasons
  };
}

// ─────────────────────────────────────────────────────────────────────
// Webhooks — stubs for now. Real impl verifies signatures against the
// webhook secrets before trusting the payload.
// ─────────────────────────────────────────────────────────────────────

async function handleClerkWebhook(request, env) {
  // TODO: verify svix signature with env.CLERK_WEBHOOK_SECRET
  const evt = await safeJson(request);
  if (!evt || !evt.type) return json({ error: 'bad payload' }, 400);

  if (evt.type === 'user.created' || evt.type === 'user.updated') {
    const u = evt.data;
    // Source-of-truth order:
    //   1. public_metadata.plan  (set by Stripe webhook after real billing)
    //   2. unsafe_metadata.signup_plan  (set by account.html at signup)
    //   3. 'free'
    const plan =
      u.public_metadata?.plan ??
      u.unsafe_metadata?.signup_plan ??
      'free';

    await supabaseUpsert(env, 'users', {
      id: u.id,
      email: u.email_addresses?.[0]?.email_address ?? '',
      full_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || null,
      plan,
      is_admin: !!u.public_metadata?.is_admin,
      stripe_customer: u.public_metadata?.stripe_customer ?? null
    });

    // If the signup_plan was ultimately accepted (no publicMetadata.plan yet),
    // promote it to publicMetadata so it sticks to the JWT and the client can
    // stop relying on its local intent cache. `patchClerkUser` is a best-effort
    // call — failures are logged, not thrown, because the webhook response
    // still needs to 200 so Clerk doesn't queue retries forever.
    if (!u.public_metadata?.plan && u.unsafe_metadata?.signup_plan) {
      try {
        await patchClerkUser(env, u.id, {
          public_metadata: {
            ...(u.public_metadata || {}),
            plan: u.unsafe_metadata.signup_plan
          }
        });
      } catch (e) {
        console.log('clerk patch failed', u.id, e.message || e);
      }
    }
  }

  if (evt.type === 'user.deleted') {
    await supabaseDelete(env, 'users', { id: evt.data.id });
  }

  return json({ ok: true });
}

async function handleStripeWebhook(request, env) {
  // TODO: verify Stripe-Signature with env.STRIPE_WEBHOOK_SECRET
  const evt = await safeJson(request);
  if (!evt || !evt.type) return json({ error: 'bad payload' }, 400);

  const obj = evt.data?.object || {};
  // Map Stripe price IDs to AO plan names. Populate via env so we can rotate
  // prices without a deploy. Fallback: look at the first lookup_key which we
  // suggest setting to 'ao_pro_monthly', 'ao_pro_annual', 'ao_team_monthly',
  // 'ao_team_annual' when creating the prices in the Stripe dashboard.
  function planFromLookupKey(key) {
    if (!key) return null;
    if (key.startsWith('ao_pro_')) return 'pro';
    if (key.startsWith('ao_team_')) return 'team';
    return null;
  }

  if (evt.type === 'customer.subscription.created' ||
      evt.type === 'customer.subscription.updated') {
    const sub = obj;
    const priceItem = sub.items?.data?.[0];
    const lookupKey = priceItem?.price?.lookup_key;
    const plan = (sub.status === 'active' || sub.status === 'trialing')
      ? (planFromLookupKey(lookupKey) || 'pro')
      : 'free';
    const stripeCustomer = sub.customer;
    // Clerk user id is stored on the customer's metadata (set at checkout).
    const clerkUserId = sub.metadata?.clerk_user_id;
    if (clerkUserId) {
      await supabaseUpdate(env, 'users',
        { id: clerkUserId },
        { plan, stripe_customer: stripeCustomer });
      try {
        await patchClerkUser(env, clerkUserId, {
          public_metadata: { plan, stripe_customer: stripeCustomer }
        });
      } catch (e) {
        console.log('clerk patch after stripe failed', clerkUserId, e.message || e);
      }
    } else {
      console.log('stripe sub missing clerk_user_id metadata', sub.id);
    }
  }

  if (evt.type === 'customer.subscription.deleted') {
    const clerkUserId = obj.metadata?.clerk_user_id;
    if (clerkUserId) {
      await supabaseUpdate(env, 'users', { id: clerkUserId }, { plan: 'free' });
      try {
        await patchClerkUser(env, clerkUserId, { public_metadata: { plan: 'free' } });
      } catch (e) {
        console.log('clerk downgrade failed', clerkUserId, e.message || e);
      }
    }
  }

  return json({ ok: true });
}

// Patch a Clerk user's metadata via Clerk's Backend API. Used when we want the
// user's JWT to carry plan/is_admin claims. Requires CLERK_SECRET_KEY.
async function patchClerkUser(env, userId, patch) {
  if (!env.CLERK_SECRET_KEY) return null;
  const res = await fetch(`https://api.clerk.com/v1/users/${userId}/metadata`, {
    method: 'PATCH',
    headers: {
      'authorization': `Bearer ${env.CLERK_SECRET_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error(`clerk patch ${res.status}: ${await res.text()}`);
  return res.json();
}

async function reportStripeUsage(env) {
  // Nightly: for every Pro user whose current-month runs > PLAN_LIMITS.pro, post the
  // overage to the metered Stripe price. Stub only.
  const overagers = await supabaseRpc(env, 'pro_overagers', {});
  console.log('would report overage for', overagers?.length ?? 0, 'users');
}

// ─────────────────────────────────────────────────────────────────────
// Tiny Supabase client (REST). Avoids pulling in supabase-js at worker scale.
// ─────────────────────────────────────────────────────────────────────
function supabaseHeaders(env) {
  return {
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    'prefer': 'return=representation'
  };
}

async function supabaseSelectOne(env, table, match) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(match)) qs.set(k, `eq.${v}`);
  qs.set('limit', '1');
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    headers: supabaseHeaders(env)
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

async function supabaseSelect(env, table, match, opts = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(match || {})) qs.set(k, `eq.${v}`);
  if (opts.select) qs.set('select', opts.select);
  if (opts.order)  qs.set('order', opts.order);
  if (opts.limit)  qs.set('limit', String(opts.limit));
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    headers: supabaseHeaders(env)
  });
  if (!res.ok) return [];
  return res.json();
}

async function supabaseInsert(env, table, row) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify(row)
  });
  if (!res.ok) throw new Error(`insert ${table} failed: ${res.status}`);
  const rows = await res.json();
  return rows[0];
}

async function supabaseUpsert(env, table, row) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: { ...supabaseHeaders(env), 'prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row)
  });
  if (!res.ok) throw new Error(`upsert ${table} failed: ${res.status}`);
  const rows = await res.json();
  return rows[0];
}

async function supabaseUpdate(env, table, match, patch) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(match)) qs.set(k, `eq.${v}`);
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: 'PATCH',
    headers: supabaseHeaders(env),
    body: JSON.stringify(patch)
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

async function supabaseDelete(env, table, match) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(match)) qs.set(k, `eq.${v}`);
  await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: 'DELETE',
    headers: supabaseHeaders(env)
  });
}

async function supabaseRpc(env, fn, args) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify(args)
  });
  if (!res.ok) return null;
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

// CORS-friendly variant for public endpoints (lead capture). Echoes the origin
// back so the same form can submit from deliberateux.com, ao.deliberateux.com,
// or wherever the form ends up living. We don't need credentials so the
// echo-back is safe; we restrict to https origins to prevent local-dev abuse.
function corsHeaders(origin) {
  const allowed = origin && /^https:\/\/(.*\.)?deliberateux\.com$/.test(origin) ? origin : 'https://deliberateux.com';
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    'vary': 'origin'
  };
}
function corsJson(obj, status = 200, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) }
  });
}
function corsPreflight(origin) {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

async function safeJson(request) {
  try { return await request.json(); } catch (e) { return null; }
}
