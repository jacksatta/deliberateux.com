# deliberateux.com — Claude Context

## Project Overview
Personal UX portfolio and writing site for Jack Satta.

## Infrastructure
- **Hosting**: GitHub Pages (`jacksatta/deliberateux.com` repo, `main` branch)
- **DNS/CDN**: Cloudflare (caching, HTTPS)
- **Domain**: GoDaddy → Cloudflare → GitHub Pages
- **Deployment**: Push to `main` → GitHub Pages auto-deploys (~2-5 min) → Cloudflare cache (~additional delay)

## Git / Push Workflow
- Remote switched to SSH (`git@github.com:jacksatta/deliberateux.com.git`) — terminal `git push` now works
- Previously used GitHub Desktop or VSCode Source Control sync; either still works
- **Never commit `.claude/` directory** — worktrees tracked as git submodules break GitHub Pages build
- `.gitignore` excludes `.claude/` and `.DS_Store`

## GitHub Pages — Known Issues Fixed
- `.nojekyll` file at repo root skips Jekyll processing (plain HTML site)
- Broken submodule (`.claude/worktrees/strange-khayyam`) was the root cause of all Pages build failures from ~March 20 — removed in commit `074117f`

## Site Structure
```
/               → Main site (index.html)
/work/          → Work section integrated into main site layout
/portfolio/     → Standalone portfolio (shareable with recruiters)
/writing/       → Writing section
/assets/        → Images and static assets
/tags/          → Writing tags
app.js          → Dynamic header/footer injection, theme toggle
styles.css      → All site styles
```

## Key Design Decisions

### Work vs. Portfolio split (as of 2026-03-18)
- `/work/index.html` — integrated work section with standard site header/footer (same as rest of site)
- `/portfolio/index.html` — standalone version for sharing with recruiters; private-style URL, no main nav dependency
- Both should be kept in sync when work content changes

### Header/Footer
- Injected dynamically via `app.js` (not hardcoded per page)
- `/portfolio/` is standalone and does NOT use the shared header/footer injection

### Styling
- Dark/light theme toggle
- Hero section with magnifying/zoom hover effect
- Brand logo uses `.brand-wordmark` / `.wordmark-ux` classes

### Cinematic page intro (home page)
Layered overlap — each layer starts halfway through the previous, total ~3s:
| t= | Layer |
|---|---|
| 0ms | All black |
| 0–1300ms | Gradient materializes (`#page-curtain` fades out, ease-in-out) |
| 650ms | Header slides down + footer fades in (900ms duration) |
| 1100ms | Hero image fades in (1000ms duration) |
| 1350ms | Hero title slides R→L (950ms) |
| 1600ms | Hero subtitle slides R→L, stacks below (900ms) |
| 1900/2100/2300ms | Chips stagger in, last lands ~3000ms |

- Scroll-reveal below hero: `.reveal` class + `IntersectionObserver` (inline script in index.html)
- Section-head reveals first; card group has `transition-delay: 120ms` for stagger
- To retune: edit delay/duration values in the cinematic block in styles.css

## AO — Agent Operations System

AO is the internal operations layer hosted at `deliberateux.com/ao/*` and backed by VPS services at `100.71.12.80`.

### AO Information Architecture (2026-04-18)
- **Sitemap reference:** `/ao/ao-sitemap.html` — interactive visual sitemap with audience tabs.
- **Dashboard is the roof.** It is the top-level container, not a peer of other pages. Everything lives under it.
- **Three audience tracks:** Prospect (demo, read-only sandbox), Customer (auth'd, own orgs), Admin (you — all orgs + system panels).
- **Org-scoped pages:** Queue, Flows, and Configure are scoped to an org via `?org=<slug>`. They are not standalone global pages.
- **Everything is clickable:** Org cards → org detail. Task rows → task detail. Agent badges → agent info. Role cards → toggle assignment.
- **Demo mode:** Pre-seeded "Acme Inc." sandbox org. Same page structure as real orgs but read-only, nothing persists. Prospect explores without signup.
- **Onboard flow returns to Dashboard:** Onboard → Bootup → Configure → Dashboard (with new org card). No dead ends.
- **Admin is auth-based:** No more `?admin=1` URL param. Account-level flag. Admin sees all orgs + Global Services + CS Backdoor.
- **New pages needed:** Login/auth gate, CS Backdoor (agent-mediated, no raw PII), Demo Dashboard variant.

### AO Pages (GitHub Pages)
- `/ao/index.html` — Landing page (marketing, two CTAs: "Try the demo" / "Get started")
- `/ao/dashboard.html` — **The roof.** My Orgs grid (customer) or All Orgs grid (admin) + system services
- `/ao/org.html` — Single org home (agents, tasks, workspace) — scoped via `?slug=`
- `/ao/onboard.html` — Organization setup wizard (5 steps)
- `/ao/bootup.html` — Agent provisioning animation (post-onboard)
- `/ao/configure.html` — Role builder, scoped to an org via `?org=`
- `/ao/queue.html` — Live work queue, scoped to an org via `?org=`
- `/ao/flows.html` — Workflow canvas, scoped to an org via `?org=`
- `/ao/ao-sitemap.html` — Split-canvas sitemap navigator (left: page tree with audience filters, right: live iframe preview)
- `/ao/app.html` — **Unified app shell.** Single entry point that embeds all tools via sidebar nav + iframe panels. Shared state via BroadcastChannel. Keyboard shortcuts (Cmd+1-6). Theme quick-switch in sidebar. Org context passed to child frames. This replaces tab-hopping across 12 separate pages.

### AO Flows Architecture (2026-04-18)
- **Variable schemas:** `NODE_SCHEMAS` object in flows.html defines input/output contracts for every node type (agents, operators, triggers, integrations, biz objects). When a connection is drawn, `autoMapFields()` matches output fields of the source to input fields of the target by name and type.
- **Schema hints in popover:** The data map editor shows available output/input fields from both connected nodes, with `<datalist>` autocomplete on the field inputs.
- **UX fix — double-click to edit:** Node text fields (`cn-editable`) are `pointer-events:none` by default. Single-click always initiates drag. Double-click enters text editing mode (adds `.editing` class, focuses field, selects text). On blur, editing mode exits. Hover still shows the edit cursor as a hint.
- **Template flows (8 total):** Client Onboarding, Lead Qualification, Task Triage, Launch a Product, Ship a Release, Content Pipeline, Growth Experiment, Incident Response. First three have full `logic` (data maps, conditions, SLAs, fallbacks) and `nodeDefaults` (agent prompts, API endpoints, schema definitions).
- **Run simulation:** BFS topological execution. IF nodes evaluate real JavaScript conditions against the payload. Data maps are resolved during run — showing source field → target field = actual value. Integration nodes make real fetch calls where possible (CRM API). Schema output fields are displayed during execution.
- **Antigravity:** Not relevant to AO. It was a deprecated Google model provider in the openclaw repo, removed in a breaking change. No action needed.

### AO Theme System (v3 — shared tokens, all pages wired)
- **Shared token file:** `/ao/ao-theme.css` — single CSS file defining all design tokens for the entire AO experience. All 8 AO pages import this via `<link rel="stylesheet" href="ao-theme.css">`.
- **Theme Studio Light:** `/ao/theme-studio-local.html` — interactive theme configurator (admin tool). Features:
  - **Tabbed left panel:** Themes / Palette / Fine-tune tabs
  - **6 theme palettes** with live preview thumbnails of all AO pages
  - **Color Harmony engine:** complementary, analogous, triadic, split-complementary, tetradic presets — modifiable and applicable to any base color
  - **Zoom toolbar:** Fit-to-frame, 50%/75%/100%/150% presets, +/- buttons, persistent zoom level
  - **Revert button:** Undo all unsaved changes back to last deployed state
  - **Before/After (A/B) toggle:** Compare new theme vs. legacy purple-AI look
  - **Deploy modal:** Pre-flight preview with before/after + change stats, animated 6-step deployment, CSS export + git commands
  - **Upsell CTA:** "Want the full Theme Studio? See AO plans" — links to /ao/ product page
- **Themes (6):**
  - **Ops** (DEFAULT) — warm charcoal bg (#121110), amber accent (218,160,72). "Air traffic control, not Tron."
  - **Midnight** — cool steel/navy bg (#0a0d14), ice-blue accent (140,185,235). Cool-shifted panels, blue-white text.
  - **Greenhouse** — dark chocolate bg (#1a1f1c), mint/cream accents. Earthy, organic.
  - **Sandstone** — warm tan bg (#1e1b18), terracotta/clay accents. Desert warmth.
  - **Studio** — warm ivory light mode (#f4f2ee). Has SVG icon/shadow overrides.
  - **Daybreak** — soft blue-white light mode (#f0f4f8), slate-blue accent (58,120,180). Sky/cloud feel.
- **Key design decision (2026-04-18):** Amber replaces purple as the primary accent (`--accent: var(--amber)`) across all themes. Purple is demoted to a desaturated secondary role.
- **Architecture:** CSS custom properties at `:root` in ao-theme.css, overridden by `[data-theme="<name>"]` selectors. Key token groups: surfaces, overlays, panels, borders, text hierarchy, semantic colors (RGB triplets), agent colors, status colors, radii, typography, layout.
- **Theme persistence:** `localStorage` key `ao_theme`. Each page has inline persistence script at load time.
- **Transitions:** 350ms ease on `background`/`color` for `html`, `body`, `.topbar`/`.ao-nav`, `.sidebar`, `.canvas-wrap`.
- **Adding a new theme:** Add `[data-theme="<name>"]` block in ao-theme.css. Add to theme-studio-local.html THEMES object. If light-mode, add Studio-style SVG/shadow overrides.
- **Wiring status (2026-04-18):** ALL 8 pages wired to ao-theme.css:
  - `flows.html` — inline theme block removed, only component-level Studio overrides remain
  - `index.html` — purple gradients replaced with amber/blue/pink theme vars
  - `dashboard.html` — purple button/filter styles replaced with amber
  - `bootup.html` — boot dot, progress bar, spinner, buttons all use amber
  - `org.html` — gradients/buttons/selections switched to amber
  - `queue.html` — nav uses `var(--surface)`
  - `configure.html` — role colors removed (flow through agent color aliases), purple→amber
  - `onboard.html` — unique warm light page; `--warm-purple`/`--warm-green` now alias to shared `--purple`/`--green` tokens; nav uses `var(--surface)`, dot uses `var(--amber)`

### AO Flows — Legacy Theme Notes
- flows.html theme switcher dropdown (`.theme-sw`) and customizer panel (`.theme-cust`) JS objects (`themeColors`, `themeBgs`) may still reference old values — should be updated to sync with ao-theme.css theme names
- The old inline `:root` block has been removed; flows now inherits from ao-theme.css

### AO Theme Tiers (planned)
- **Theme Studio Light** (free / all users): Current `/ao/theme-studio-local.html`. 6 preset palettes, harmony presets, fine-tune controls. Available to any org admin.
- **Theme Studio Full** (paid tier): Extended palette builder, custom color import, export to Figma tokens, brand kit upload, multi-org theme management. Not yet built — upsell link points to `/ao/` product page.
- **Onboard theme selector** (planned): Simplified 3-4 palette picker embedded in onboard.html step 4 or as new step. Not the full studio — just visual cards with preview dots. New users pick a theme during org setup.

### AO — Open Requests (for cowork review)
- **`/ao/REQUEST-admin-flow.md`** (2026-04-16) — four items pending: (1) queue.html flashing fix via keyed DOM diff; (2) seeded CS task missing `blockedAt` so auto-heal never fires (queue.html:261–265); (3) onboard → configure should finish with a working “Launch <Org>” link to a real `/ao/org/<slug>/` surface; (4) admin dashboard needs review-my-orgs list + CS-assist backdoor into other customer orgs (agent-mediated preferred, no raw PII). Read the request doc before starting any of these.

### AO Work Tracker (.xlsx — primary)
- **File:** `ao-work-tracker.xlsx` (Sheet ID: `11ikRhmCsG3f8bXg0iMbxnH7pDIQ1x0_X`)
- **Location:** Google Drive → `projects/work/2026/Tools and Inventory/`
- **Brand colors:** BG_DARK=#1A1A2E, BG_SURFACE=#222240, ACCENT_AMBER=#C47A2A, ACCENT_PURPLE=#A78BFA, ACCENT_GREEN=#4ADE80, TEXT_PRIMARY=#F0ECE4, TEXT_SECONDARY=#9CA3AF
- **Column H (URL Pattern)** is the CTA column — cells with HYPERLINK formulas are styled as clickable CTAs (white bg, purple #A78BFA bold text).
- **Columns:** #, Feature/Deliverable, Status, Access, Details, File(s), Port, URL Pattern (H, CTA), Date
- **Sheet structure:** Row 6 = section header, Row 7 = column headers, Rows 8–15 = public items (7 items)
- Hyperlink cells: H8, H9, H10, H11, H14, H15
- Non-link cells: H12 (GA4, "—"), H13 (Tailscale, "*.ts.net")

### AO Work Tracker (native Google Sheet — secondary)
- **Sheet ID:** `1EsFuYOYLa3VTaK80-GGEt7OVs21HHYEGiwARlOKIA4Y`
- **Sheet structure:** Rows 1–3 title, Rows 7–14 public items, Rows 18–26 admin items, Row 28+ infrastructure
- Hyperlink cells: H7–H10, H13–H14, H18–H21, H23

### AO VPS Services
- Theme Studio: `:18794` (theme-studio.html, ts.html, design-system.html)
- AO CRM: `:18800` (/api/inbound, /api/leads)
- Cloudflare Email Routing: deliberateux.com email → routing rules

### Development Environment
- **Antigravity IDE** (Google's agent-first IDE, VS Code fork): Primary development environment for AO. Workspace: `virtual-agency` with agent definition files (biz-dev.md, customer-service.md, dev.md, etc.), CRM module, dashboard wrangler, queue, scripts.
- **Claude Code** runs inside Antigravity's integrated terminal for agentic file operations.
- **Cowork** (Claude desktop) for IA planning, file creation, computer use, and cross-tool orchestration.
- **Chrome** for live preview of AO pages served from GitHub Pages or VPS.

## Preferred Workflow
- No need to confirm routine actions (commit, push, file edits)
- Push automatically after committing
- Keep work section and standalone portfolio in sync

## Asset Guidelines
### Case study card images
When selecting or cropping preview images for case study cards, avoid tight crops that are too abstract or zoomed in. The crop should show enough context to be legible at a glance — a recognizable UI section, not a close-up of a single element. Prioritize crops that show the overall layout or a key interaction area, not decorative details.
