/* app.js — Deliberate UX (final)
   Fixes:
   - Manage "delete tag" deleting on wrong article (ID collisions in localStorage)
   - Adds migration to ensure unique, stable article IDs (derived from URL)
   - Manage actions resolve articleId from the row (closest <tr>) to avoid closure mixups
   - Enter/Return adds tags
   - dblclick edits tag chip (Manage only)
   - Article pages show 1–3 tags + ellipsis; popover opens from ellipsis only
   - Esc closes popovers/editing
*/

(() => {
  // ----------------------------
  // Canonical seed data (edit this)
  // ----------------------------
  const ARTICLE_INDEX = [
	{
	  id: "why-good-ux-still-fails",
	  title: "Why good UX still fails",
	  url: "/writing/why-good-ux-still-fails.html",
	  brief: "Great interaction design can still lose to incentives, operations, and time.",
	  tags: ["adoption", "incentives", "operations", "time", "trust", "real-world"],
	  updated: "2026",
	  readMinutes: 7
	},
	{
	  id: "the-stove-problem-revisited",
	  title: "The stove problem, revisited",
	  url: "/writing/the-stove-problem-revisited.html",
	  brief: "Bad mapping teaches workarounds. Fixing mapping is a reliability and safety win.",
	  tags: ["mapping", "affordances", "safety", "errors", "trust", "real-world"],
	  updated: "2026",
	  readMinutes: 8
	},
	{
	  id: "adoption-is-a-design-problem",
	  title: "Adoption is a design problem",
	  url: "/writing/adoption-is-a-design-problem.html",
	  brief: "Adoption is about time, trust, risk, switching costs — and fit.",
	  tags: ["adoption", "trust", "risk", "switching cost", "workflows", "real-world"],
	  updated: "2026",
	  readMinutes: 9
	}
  ];

  const LS_KEY = "dux_articles_v1";

  // ----------------------------
  // Utilities
  // ----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);

  function normalizeTag(tag) {
	return String(tag || "")
	  .trim()
	  .replace(/\s+/g, " ")
	  .replace(/[–—]/g, "-")
	  .toLowerCase();
  }

  function escapeHtml(str) {
	return String(str || "")
	  .replaceAll("&", "&amp;")
	  .replaceAll("<", "&lt;")
	  .replaceAll(">", "&gt;")
	  .replaceAll('"', "&quot;")
	  .replaceAll("'", "&#039;");
  }

  function slugFromUrl(url) {
	// /writing/the-stove-problem-revisited.html -> the-stove-problem-revisited
	const s = String(url || "").split("?")[0].split("#")[0];
	const file = s.split("/").pop() || "";
	return file.replace(/\.html?$/i, "").trim() || "";
  }

  function normalizeArticle(a) {
	const tags = Array.isArray(a.tags) ? a.tags.map(normalizeTag).filter(Boolean) : [];
	// de-dupe tags while preserving order
	const seen = new Set();
	const uniq = [];
	for (const t of tags) {
	  if (!seen.has(t)) { seen.add(t); uniq.push(t); }
	}
	return { ...a, tags: uniq };
  }

  function ensureUniqueIds(list) {
	// Migration: ensure every article has a unique `id`
	const used = new Set();
	const out = [];

	for (let i = 0; i < list.length; i++) {
	  const a0 = normalizeArticle(list[i] || {});
	  let id = String(a0.id || "").trim();

	  // If id missing or clearly bad, derive from URL
	  if (!id || id === "article" || id === "post" || id === "writing") {
		id = slugFromUrl(a0.url) || `article-${i + 1}`;
	  }

	  // If id collides, suffix it deterministically
	  const base = id;
	  let n = 2;
	  while (used.has(id)) {
		id = `${base}-${n}`;
		n++;
	  }
	  used.add(id);

	  out.push({ ...a0, id });
	}

	return out;
  }

  function seedIfMissing() {
	const stored = localStorage.getItem(LS_KEY);
	if (!stored) {
	  const seeded = ensureUniqueIds(ARTICLE_INDEX);
	  localStorage.setItem(LS_KEY, JSON.stringify(seeded));
	}
  }

  function loadArticlesRaw() {
	try {
	  return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
	} catch {
	  return [];
	}
  }

  function saveArticles(list) {
	const normalized = ensureUniqueIds(list);
	localStorage.setItem(LS_KEY, JSON.stringify(normalized));
	return normalized;
  }

  function migrateIfNeeded() {
	// If older data exists with duplicate IDs, fix + save once.
	seedIfMissing();
	const raw = loadArticlesRaw();

	if (!Array.isArray(raw) || raw.length === 0) {
	  saveArticles(ARTICLE_INDEX);
	  return;
	}

	// Detect collisions / missing IDs
	const ids = raw.map(x => String(x?.id || "").trim());
	const hasMissing = ids.some(id => !id);
	const seen = new Set();
	let hasDupes = false;
	for (const id of ids) {
	  if (!id) continue;
	  if (seen.has(id)) { hasDupes = true; break; }
	  seen.add(id);
	}

	if (hasMissing || hasDupes) {
	  saveArticles(raw);
	} else {
	  // Still normalize tags for safety (but don't rewrite unless needed)
	  const normalized = raw.map(normalizeArticle);
	  localStorage.setItem(LS_KEY, JSON.stringify(normalized));
	}
  }

  function getArticles() {
	migrateIfNeeded();
	const raw = loadArticlesRaw();
	if (!Array.isArray(raw) || raw.length === 0) return saveArticles(ARTICLE_INDEX);
	return ensureUniqueIds(raw);
  }

  function findArticleById(id) {
	const articles = getArticles();
	return articles.find(a => a.id === id) || null;
  }

  function setArticleTags(articleId, tags) {
	const articles = getArticles();
	const idx = articles.findIndex(a => a.id === articleId);
	if (idx === -1) return;
	articles[idx].tags = tags.map(normalizeTag).filter(Boolean);
	saveArticles(articles);
  }

  function addArticleTag(articleId, tag) {
	tag = normalizeTag(tag);
	if (!tag) return;

	const a = findArticleById(articleId);
	if (!a) return;

	if (!a.tags.includes(tag)) {
	  a.tags.push(tag);
	  setArticleTags(articleId, a.tags);
	}
  }

  function deleteArticleTag(articleId, tag) {
	tag = normalizeTag(tag);
	const a = findArticleById(articleId);
	if (!a) return;
	setArticleTags(articleId, a.tags.filter(t => t !== tag));
  }

  function replaceArticleTag(articleId, oldTag, newTag) {
	oldTag = normalizeTag(oldTag);
	newTag = normalizeTag(newTag);
	if (!newTag) return;

	const a = findArticleById(articleId);
	if (!a) return;

	const next = a.tags.map(t => (t === oldTag ? newTag : t));
	setArticleTags(articleId, Array.from(new Set(next)));
  }

  function computeMostUsedTags(articles) {
	const counts = new Map();
	for (const a of articles) for (const t of a.tags) counts.set(t, (counts.get(t) || 0) + 1);
	return Array.from(counts.entries())
	  .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
	  .map(([tag, count]) => ({ tag, count }));
  }

  // ----------------------------
  // Global ESC handling
  // ----------------------------
  let popoverEl = null;
  let inlineEdit = { input: null, articleId: null, oldTag: null };

  function closeTagPopover() {
	if (!popoverEl) return;
	popoverEl.classList.add("is-closing");
	const el = popoverEl;
	popoverEl = null;
	setTimeout(() => el.remove(), 140);
  }

  function cancelInlineEdit() {
	if (!inlineEdit.input) return;
	const input = inlineEdit.input;
	const tr = input.closest("tr");
	inlineEdit = { input: null, articleId: null, oldTag: null };
	input.remove();
	if (tr) {
	  const id = tr.getAttribute("data-article-id");
	  if (id) renderManageTable($(".manage-search")?.value || "");
	}
  }

  function installGlobalEsc() {
	window.addEventListener("keydown", (e) => {
	  if (e.key !== "Escape") return;
	  closeTagPopover();
	  cancelInlineEdit();
	});
  }

  // ----------------------------
  // Article page tags: 1–3 + ellipsis, popover only from ellipsis
  // ----------------------------
  function openTagPopover(anchorEl, article) {
	closeTagPopover();

	const articles = getArticles();
	const mostUsed = computeMostUsedTags(articles).slice(0, 10);

	popoverEl = document.createElement("div");
	popoverEl.className = "dux-popover is-open";
	popoverEl.innerHTML = `
	  <div class="dux-popover-inner">
		<div class="dux-popover-head">
		  <div class="dux-popover-title">Tags</div>
		  <button class="dux-popover-close" type="button" aria-label="Close">×</button>
		</div>

		<div class="dux-popover-section">
		  <div class="dux-popover-label">This article</div>
		  <div class="dux-popover-chips">
			${article.tags.map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("") || `<span class="tag-chip tag-chip-muted">none</span>`}
		  </div>
		</div>

		<div class="dux-popover-section">
		  <div class="dux-popover-label">Most used</div>
		  <div class="dux-popover-chips">
			${mostUsed.map(x => `<span class="tag-chip tag-chip-muted">${escapeHtml(x.tag)} <span class="tag-count">${x.count}</span></span>`).join("")}
		  </div>
		</div>

		<div class="dux-popover-foot">Press <kbd>Esc</kbd> to close.</div>
	  </div>
	`;
	document.body.appendChild(popoverEl);

	// position near anchor
	const r = anchorEl.getBoundingClientRect();
	const width = Math.min(420, window.innerWidth - 24);
	let left = Math.min(window.innerWidth - width - 12, r.left);
	left = Math.max(12, left);
	const top = Math.min(window.innerHeight - 20, r.bottom + 10);
	popoverEl.style.left = `${left}px`;
	popoverEl.style.top = `${top}px`;

	$(".dux-popover-close", popoverEl)?.addEventListener("click", closeTagPopover);

	// click outside closes
	const onDocClick = (e) => {
	  if (!popoverEl) return;
	  if (popoverEl.contains(e.target)) return;
	  if (anchorEl.contains(e.target)) return;
	  closeTagPopover();
	};
	setTimeout(() => document.addEventListener("mousedown", onDocClick, { once: true }), 0);
  }

  function renderArticleTags() {
	const articleId = document.body.getAttribute("data-article-id");
	if (!articleId) return;

	const article = findArticleById(articleId);
	if (!article) return;

	const mount = document.querySelector('[data-role="article-tags"]');
	if (!mount) return;

	mount.innerHTML = "";

	const showN = 3;
	const shown = article.tags.slice(0, showN);
	const hiddenCount = Math.max(0, article.tags.length - shown.length);

	for (const t of shown) {
	  const pill = document.createElement("span");
	  pill.className = "tag-pill";
	  pill.textContent = t;
	  mount.appendChild(pill);
	}

	if (hiddenCount > 0) {
	  const ell = document.createElement("button");
	  ell.className = "tag-pill tag-ellipsis is-action";
	  ell.type = "button";
	  ell.setAttribute("aria-label", `More tags (${hiddenCount} more)`);
	  ell.textContent = "…";

	  ell.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		openTagPopover(ell, article);
	  });

	  ell.addEventListener("mouseenter", () => openTagPopover(ell, article));

	  mount.appendChild(ell);
	}
  }

  // ----------------------------
  // Manage page
  // ----------------------------
  function startInlineEdit(chipEl, articleId, oldTag) {
	cancelInlineEdit();

	const input = document.createElement("input");
	input.className = "tag-inline-edit";
	input.value = oldTag;
	input.setAttribute("aria-label", "Edit tag");

	chipEl.replaceWith(input);
	input.focus();
	input.select();

	inlineEdit = { input, articleId, oldTag };

	const commit = () => {
	  const next = normalizeTag(input.value);
	  if (next && next !== normalizeTag(oldTag)) replaceArticleTag(articleId, oldTag, next);
	  renderManageTable($(".manage-search")?.value || "");
	  inlineEdit = { input: null, articleId: null, oldTag: null };
	};

	input.addEventListener("keydown", (e) => {
	  if (e.key === "Enter") commit();
	  if (e.key === "Escape") cancelInlineEdit();
	});
	input.addEventListener("blur", commit);
  }

  function renderManageRow(tr, article) {
	if (!article) return;
	tr.setAttribute("data-article-id", article.id);

	tr.innerHTML = `
	  <td>
		<a href="${article.url}" class="manage-article-link">${escapeHtml(article.title)}</a>
		<div class="manage-path">${escapeHtml(article.url)}</div>
	  </td>
	  <td>${escapeHtml(article.brief || "")}</td>
	  <td>
		<div class="tag-edit-row" data-role="tags"></div>
		<div class="tag-add">
		  <input type="text" class="tag-add-input" placeholder="Add tag..." />
		  <button type="button" class="tag-add-btn">Add</button>
		</div>
	  </td>
	`;

	const tagsWrap = $('[data-role="tags"]', tr);
	tagsWrap.innerHTML = "";

	for (const t of article.tags) {
	  const chip = document.createElement("span");
	  chip.className = "tag-chip";
	  chip.innerHTML = `
		<span class="tag-label">${escapeHtml(t)}</span>
		<button type="button" class="tag-x" aria-label="Remove ${escapeHtml(t)}">×</button>
	  `;

	  // IMPORTANT: resolve articleId from the row to avoid any stale bindings
	  $(".tag-x", chip).addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		const row = e.currentTarget.closest("tr");
		const id = row?.getAttribute("data-article-id");
		if (!id) return;
		deleteArticleTag(id, t);
		renderManageTable($(".manage-search")?.value || "");
	  });

	  $(".tag-label", chip).addEventListener("dblclick", () => {
		const id = tr.getAttribute("data-article-id");
		startInlineEdit(chip, id, t);
	  });

	  tagsWrap.appendChild(chip);
	}

	const input = $(".tag-add-input", tr);
	const btn = $(".tag-add-btn", tr);

	const doAdd = () => {
	  const id = tr.getAttribute("data-article-id");
	  addArticleTag(id, input.value);
	  input.value = "";
	  renderManageTable($(".manage-search")?.value || "");
	  input.focus();
	};

	btn.addEventListener("click", doAdd);
	input.addEventListener("keydown", (e) => {
	  if (e.key === "Enter") doAdd();
	  if (e.key === "Escape") {
		input.value = "";
		input.blur();
	  }
	});
  }

  function renderManageTable(filterText = "") {
	const table = $("#manageTable");
	if (!table) return;

	const tbody = $("tbody", table);
	if (!tbody) return;

	const q = normalizeTag(filterText);
	let articles = getArticles();

	if (q) {
	  articles = articles.filter(a => {
		const inTitle = normalizeTag(a.title).includes(q);
		const inBrief = normalizeTag(a.brief).includes(q);
		const inTags = (a.tags || []).some(t => t.includes(q));
		return inTitle || inBrief || inTags;
	  });
	}

	tbody.innerHTML = "";
	for (const a of articles) {
	  const tr = document.createElement("tr");
	  tbody.appendChild(tr);
	  renderManageRow(tr, a);
	}
  }

  function exportJSON() {
	const data = getArticles();
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "deliberateux-articles.json";
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
  }

  function resetLocal() {
	localStorage.removeItem(LS_KEY);
	localStorage.setItem(LS_KEY, JSON.stringify(ensureUniqueIds(ARTICLE_INDEX)));
	renderManageTable($(".manage-search")?.value || "");
  }

  function initManagePage() {
	const table = $("#manageTable");
	if (!table) return;

	renderManageTable("");

	const search = $(".manage-search");
	if (search) search.addEventListener("input", () => renderManageTable(search.value));

	$(".manage-export")?.addEventListener("click", exportJSON);
	$(".manage-reset")?.addEventListener("click", resetLocal);
  }

  // ----------------------------
  // Hero fade on scroll (keeps your CSS vars working)
  // ----------------------------
  function initHeroScroll() {
	const hero = $(".hero");
	if (!hero) return;

	const onScroll = () => {
	  const y = window.scrollY || 0;
	  const h = Math.max(1, hero.offsetHeight);
	  const p = Math.min(1, y / (h * 0.8));

	  document.documentElement.style.setProperty("--hero-media-y", `${Math.round(p * 16)}px`);
	  document.documentElement.style.setProperty("--hero-text-y", `${Math.round(p * -10)}px`);
	  document.documentElement.style.setProperty("--hero-text-opacity", `${1 - p * 0.85}`);
	  document.documentElement.style.setProperty("--hero-bottom-fade", `${Math.min(1, p * 1.05)}`);
	  document.documentElement.style.setProperty("--accent-progress", `${p}`);
	};

	onScroll();
	window.addEventListener("scroll", onScroll, { passive: true });
  }

  // ----------------------------
  // Boot
  // ----------------------------
  document.addEventListener("DOMContentLoaded", () => {
	migrateIfNeeded();
	installGlobalEsc();
	initHeroScroll();
	renderArticleTags();
	initManagePage();
  });
})();