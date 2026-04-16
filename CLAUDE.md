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

### AO Pages (GitHub Pages)
- `/ao/index.html` — AO landing page
- `/ao/onboard.html` — Organization setup wizard
- `/ao/configure.html` — Configuration page
- `/ao/dashboard.html` — Admin dashboard

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

## Preferred Workflow
- No need to confirm routine actions (commit, push, file edits)
- Push automatically after committing
- Keep work section and standalone portfolio in sync

## Asset Guidelines
### Case study card images
When selecting or cropping preview images for case study cards, avoid tight crops that are too abstract or zoomed in. The crop should show enough context to be legible at a glance — a recognizable UI section, not a close-up of a single element. Prioritize crops that show the overall layout or a key interaction area, not decorative details.
