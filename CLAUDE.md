# deliberateux.com — Claude Context

## Project Overview
Personal UX portfolio and writing site for Jack Satta.

## Infrastructure
- **Hosting**: GitHub Pages (`jacksatta/deliberateux.com` repo, `main` branch)
- **DNS/CDN**: Cloudflare (caching, HTTPS)
- **Domain**: GoDaddy → Cloudflare → GitHub Pages
- **Deployment**: Push to `main` → GitHub Pages auto-deploys (~2-5 min) → Cloudflare cache (~additional delay)

## Git / Push Workflow
- Terminal `git push` fails (HTTPS auth not available in shell)
- Push via **VSCode Source Control sync button** or **GitHub Desktop**
- VSCode Source Control panel works like GitHub Desktop (stage → message → commit → sync)

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

## Preferred Workflow
- No need to confirm routine actions (commit, push, file edits)
- Push automatically after committing
- Keep work section and standalone portfolio in sync
