# AO Admin Flow — Request

Written 2026-04-16 by Jack for cowork review. All items touch `deliberateux.com/ao/*`.

## 1. Queue flashing on refresh (`ao/queue.html`)

**Symptom:** list visibly flashes / jumps every 1.5s as tasks tick.

**Root cause:** `render()` does `listEl.innerHTML = ''` and rebuilds every item from scratch on every tick (queue.html:300). Each re-render re-triggers the entry animation (`animationDelay = i * 30ms`), re-seats the scroll position, and discards identity so the browser can't diff.

**Fix (spec):**
- Key each DOM row by `data-id = t.id` and do an in-place diff: reuse existing rows, patch `.q-status` / `.q-ts` / `.q-heal` textContent + class, only `appendChild` new rows and `remove()` departed ones.
- Drop the entry animation on re-renders; only run it on first mount of a given `id`.
- Guard `updateStats()` so it only writes when a stat actually changes (avoid paint thrash on the 5 stat nodes).

## 2. CS agent stays blocked forever (`ao/queue.html`)

**Symptom:** the seeded CS task (“Process inbound beta request — inbox API timeout”) never heals. Copy on the page says “Blocked tasks auto-heal.”

**Root cause:** the seed omits `blockedAt` and `healReason` (queue.html:261–265). Auto-heal at queue.html:386 gates on `if (t.status === 'blocked' && t.blockedAt)` — seeded task falls through forever.

**Fix (spec):** in `seedTasks()`, initialise the CS blocked task with `blockedAt: Date.now() - 6000` (so it enters `diagnosing` within a couple ticks) and `healReason: HEAL_REASONS[0]` so the diagnose/heal copy has content to render. Same shape as the runtime blocking branch at queue.html:370–373.

## 3. Onboarding → Configure should launch the org

**Today:** `onboard.html` finishes with “Organization launched”, stores the org in `localStorage.ao_orgs`, then redirects to `/ao/configure.html?org=<slug>&...` (onboard.html:791). Configure is a static end-state; there is no live destination for the org itself.

**Wanted:**
- After configure is saved, a primary CTA (“Launch <OrgName>”) that goes to the actual org surface — e.g. `/ao/org/<slug>/` (or a stand-in dashboard keyed by slug) — not back to configure.
- The link must be a real working URL, not a no-op. MVP is fine: a slug-keyed page that reads `ao_orgs[slug]` from localStorage and renders an org home with agents, recent tasks, site links.

**Open question for cowork:** do we route `/ao/org/<slug>/` to a new `org.html?slug=<slug>` (simpler, works on GitHub Pages without rewrites), or set up Cloudflare Pages rewrites for prettier URLs?

## 4. Admin POV — review own sites + CS-assist backdoor

**Two audiences on the admin page:**

**(a) Jack reviewing his own orgs.** From the admin dashboard, list every org in `ao_orgs` (and eventually server-backed orgs) with: slug, name, type, autonomy level, last task timestamp, site URL, direct deep-link to that org’s dashboard. Filter + search.

**(b) CS-assist into *other* customer orgs.** Read-only inspection surface for helping real customers **without** data access. Two variants, listed by preference:

1. **Preferred — CS agent assists.** Jack opens a customer org in “assist mode.” The CS agent has the scoped permissions to read that customer’s data and explain/act on Jack’s behalf; Jack sees the agent’s view + transcript but not raw customer PII. All actions are agent-mediated and logged.
2. **Fallback — direct admin backdoor.** Jack can enter the org in a shadow session that hides fields marked sensitive (email, phone, message bodies) and records every action in an admin audit log. Tag it visibly in the UI (“Admin assist — <customer> — actions logged”).

**Gating:** the admin pill already exists (queue.html:437 — `?admin` query or `localStorage.ao_admin`). Formalise this as a single gate everywhere (`isAdmin()` helper) and hide assist-mode UI behind it.

**Open questions for cowork:**
- Where does the CS agent actually run, and what’s the data contract? AO CRM at `:18800` presumably has customer records — who signs the assist session?
- Do we need a per-customer consent record before assist-mode can be opened (“customer granted support access until <date>”)?
- Audit log storage — local JSON on VPS, or pushed to the CRM?

## Not in scope here
- No backend auth yet; admin gate is client-side only. Good enough for demo/dogfooding; needs proper auth before real customers touch assist-mode.
- No changes to theme-control.js or the Theme Studio demo flow.
