# AO Email Setup

Two-step plan. Tier 1 is what's wired today; Tier 2 is the upgrade when AO's identity should stand on its own.

## Tier 1 — `ao@deliberateux.com` (now)

The contact form on `/ao/index.html` falls back to **`ao@deliberateux.com`** when the CRM endpoint is unreachable (which, today, is most of the time — the CRM is on the Tailscale-only VPS, port 18800, not publicly reachable).

For that fallback to actually deliver mail to your inbox, **Cloudflare Email Routing** has to forward `ao@deliberateux.com` somewhere real. Four-step setup (one-time, ~60 seconds):

1. Cloudflare dashboard → `deliberateux.com` → **Email** → **Email Routing**
2. If not already enabled, click **Enable Email Routing**. Cloudflare auto-adds the MX + TXT records.
3. **Routing rules** → **Create address**:
   - Custom address: `ao`
   - Action: `Send to an email`
   - Destination: `jacksatta@gmail.com` (or wherever you want AO mail to land)
4. Verify the destination address — Cloudflare sends a one-time confirmation link.

While you're there, do the same for **`hello@deliberateux.com`** (general-purpose) and **`support@deliberateux.com`** (post-launch — for real customer issues vs general inquiries). Free tier supports unlimited routes.

### Gmail filter (optional but recommended)

To keep AO mail visually separate without a separate inbox:

```
From / To: ao@deliberateux.com
Apply label: AO/Inbound
Skip Inbox: no (still notifies)
```

Filter creator: Gmail → Settings → Filters and Blocked Addresses → Create new filter. Label appears in left sidebar; AO mail clusters there.

## Tier 2 — `hello@ao.deliberateux.com` (when AO has its own URL)

When `ao.deliberateux.com` exists as a subdomain (see below), email moves with it:

1. Cloudflare → DNS → add CNAME: `ao` → `deliberateux.com` (or wherever AO content lives, e.g. Cloudflare Pages project, GitHub Pages, or a redirect).
2. Cloudflare → `deliberateux.com` → **Email** → **Email Routing** → **Settings** → confirm the subdomain `ao.deliberateux.com` is enabled (it inherits routing from the parent if the MX records propagate; if not, add MX records manually for the subdomain).
3. Add routing rules for `hello@ao.deliberateux.com`, `support@ao.deliberateux.com` etc. → forward to wherever.
4. Update `FALLBACK_EMAIL` in `/ao/index.html` (the contact form script): `'ao@deliberateux.com'` → `'hello@ao.deliberateux.com'`. One-line change.

### Subdomain setup (for Tier 2)

Three options, decreasing complexity:

- **(simplest) CNAME alias.** `ao.deliberateux.com` → `deliberateux.com`. Both URLs serve the same content. Existing canonical tags already point at `deliberateux.com/ao/*` so SEO defaults to the directory version. Cover-letter URLs keep working. AO gets its own front door.
- **(redirect)** Cloudflare Bulk Redirect rule: `ao.deliberateux.com/*` → `deliberateux.com/ao/$1` (302 — keeps cover-letter URLs canonical). Or the inverse direction once you commit to the subdomain.
- **(separate Pages project)** Stand up a new Cloudflare Pages project at `ao.deliberateux.com` from a separate repo or branch. More work, but cleanly separates AO's deploy lifecycle from deliberateux.com.

Recommendation: CNAME alias on day one. Keep canonical pointed at `/ao/*` until AO has been live long enough to justify a real DNS pivot.

## Tier 3 — independent domain (later)

`autonomousops.com`, `agentos.dev`, `stride.run`, etc. Worth $10/yr to lock a name you commit to, but not a launch blocker. When AO has real customers and a clear name, do this with a 301 redirect from the subdomain so existing inbound links keep working.

## Inbox routing for the agency CS agent

When the CS agent comes back online (Gmail MCP reload pending), it should monitor only the `AO/Inbound` Gmail label, not the entire inbox. That keeps personal mail and agency-routed mail cleanly separated. Filter is set up in the previous step.
