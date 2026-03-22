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

## Preferred Workflow
- No need to confirm routine actions (commit, push, file edits)
- Push automatically after committing
- Keep work section and standalone portfolio in sync
