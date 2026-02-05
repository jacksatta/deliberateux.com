/* ================================
   Deliberate UX — app.js
   - Injects shared header everywhere
   - Theme toggle (circle-in-circle)
   - Universal fixed footer with mailto contact
   - Mouse-follow gradients for cards
   - Tag system:
	  - reads /tags.json if present (live)
	  - falls back to localStorage (local)
   - Manage page:
	  - renders table from manifest (writing/manifest.json, with fallback hardcoded list)
	  - add/delete/rename tags per article
	  - export tags.json for upload
================================= */

(function () {
  const THEME_KEY = "dux-theme";
  const TAGS_LOCAL_KEY = "dux-tags";
  const TAGS_REMOTE_URL = "/tags.json";
  const MANIFEST_URL = "/writing/manifest.json";

  function getInitialTheme() {
	const saved = localStorage.getItem(THEME_KEY);
	if (saved === "light" || saved === "dark") return saved;

	const attr = document.documentElement.getAttribute("data-theme");
	if (attr === "light" || attr === "dark") return attr;

	return "dark";
  }

  function setTheme(theme) {
	document.documentElement.setAttribute("data-theme", theme);
	localStorage.setItem(THEME_KEY, theme);
  }

  function isHome() {
	const p = location.pathname;
	return p === "/" || p.endsWith("/index.html");
  }

  function injectHeader() {
	if (document.querySelector(".site-header")) return;

	const header = document.createElement("header");
	header.className = "site-header";
	header.innerHTML = `
	  <div class="container">
		<div class="nav">
		  <div class="nav-left">
			<a class="brand" href="/">
			  <span class="brand-icon" aria-hidden="true"></span>
			  Deliberate UX
			</a>
		  </div>

		  <div class="nav-right">
			<ul class="nav-links">
			  <li><a href="/work/">Work</a></li>
			  <li><a href="/writing/writing.html">Writing</a></li>
			  <li><a href="/#about">About</a></li>
			</ul>

			<div class="mode-wrap">
			  <button class="mode-toggle" type="button" aria-label="Toggle color mode">
				<span class="mode-knob" aria-hidden="true"></span>
				<span class="mode-caption" aria-hidden="true">Mode</span>
			  </button>
			</div>
		  </div>
		</div>
	  </div>
	`;

	document.body.prepend(header);

	const btn = header.querySelector(".mode-toggle");
	btn.addEventListener("click", () => {
	  const current = document.documentElement.getAttribute("data-theme") || "dark";
	  const next = current === "dark" ? "light" : "dark";
	  setTheme(next);
	});
  }

  function injectFooter() {
	if (document.querySelector(".site-footer")) return;

	const footer = document.createElement("footer");
	footer.className = "site-footer";
	const year = new Date().getFullYear();
	footer.innerHTML = `
	  <div class="container">
		<div class="footer-inner">
		  <div class="footer-left">
			<div class="brand-dot" aria-hidden="true"></div>
			<div class="footer-blurb">
			  <div class="footer-brand">Contact for deliberate UX</div>
			  <div class="footer-tagline">© ${year} · <a href="/work/">Work</a> · <a href="/writing/writing.html">Writing</a> · <a href="/#about">About</a></div>
			</div>
		  </div>

		  <div class="footer-right">
			<form class="footer-form" autocomplete="off">
			  <input class="hp" type="text" name="company" tabindex="-1" aria-hidden="true" />
			  <input type="email" name="email" placeholder="you@domain.com" inputmode="email" required />
			  <button type="submit">Send</button>
			</form>
		  </div>
		</div>
	  </div>
	`;

	document.body.appendChild(footer);

	const form = footer.querySelector(".footer-form");
	const hp = footer.querySelector(".footer-form .hp");
	const email = footer.querySelector(".footer-form input[type='email']");
	const submitBtn = footer.querySelector(".footer-form button[type='submit']");

	// Initially disable submit button
	submitBtn.disabled = true;

	form.addEventListener("submit", (e) => {
	  e.preventDefault();

	  // Remove any previous error styling
	  email.classList.remove("email-error");

	  // basic bot tripwire
	  if (hp && hp.value && hp.value.trim().length > 0) return;

	  const v = (email.value || "").trim();
	  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
		email.classList.add("email-error");
		email.focus();
		return;
	  }

	  const to = "jacksatta@gmail.com";
	  const subject = encodeURIComponent("Deliberate UX — inquiry");
	  const body = encodeURIComponent(
		`Hi Jack,\n\nMy email is: ${v}\n\nI'm reaching out about:\n- \n\n`
	  );

	  window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
	  email.value = "";
	});

	// Live email validation
	email.addEventListener("input", () => {
	  const v = (email.value || "").trim();

	  // Clear previous states
	  email.classList.remove("email-error", "email-valid");

	  // Only validate if there's content
	  if (v.length > 0) {
		const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
		if (isValid) {
		  email.classList.add("email-valid");
		  submitBtn.disabled = false;
		} else {
		  submitBtn.disabled = true;
		  if (v.length > 3) {
			// Only show error after typing a few chars
			email.classList.add("email-error");
		  }
		}
	  } else {
		submitBtn.disabled = true;
	  }
	});
  }

  function wireCardMouseGradients() {
	const cards = document.querySelectorAll(".card");
	cards.forEach((card) => {
	  card.addEventListener("mousemove", (e) => {
		const rect = card.getBoundingClientRect();
		const x = ((e.clientX - rect.left) / rect.width) * 100;
		const y = ((e.clientY - rect.top) / rect.height) * 100;
		card.style.setProperty("--mx", `${x}%`);
		card.style.setProperty("--my", `${y}%`);
	  });

	  card.addEventListener("mouseleave", () => {
		card.style.removeProperty("--mx");
		card.style.removeProperty("--my");
	  });
	});
  }

  function wireHeroBubbleZoom() {
	const heroMedia = document.querySelector(".hero-media");
	const heroImg = document.querySelector(".hero-media img");
	const heroContent = document.querySelector(".hero-content");
	if (!heroMedia || !heroImg) return;

	// Multi-layer fisheye distortion with smooth blending
	const lens = document.createElement("div");
	lens.className = "hero-lens";

	// Six layers with gradual zoom decrease for smooth fisheye
	const layers = [
	  { zoom: 2.8, className: "hero-lens-layer-1", opacity: 1.0 },
	  { zoom: 2.5, className: "hero-lens-layer-2", opacity: 0.9 },
	  { zoom: 2.2, className: "hero-lens-layer-3", opacity: 0.8 },
	  { zoom: 1.9, className: "hero-lens-layer-4", opacity: 0.7 },
	  { zoom: 1.6, className: "hero-lens-layer-5", opacity: 0.6 },
	  { zoom: 1.3, className: "hero-lens-layer-6", opacity: 0.5 }
	];

	layers.forEach((layer) => {
	  const layerDiv = document.createElement("div");
	  layerDiv.className = layer.className;
	  layerDiv.style.backgroundImage = `url(${heroImg.src})`;
	  layerDiv.style.opacity = layer.opacity;
	  layerDiv.style.mixBlendMode = "normal";
	  lens.appendChild(layerDiv);

	  if (heroContent) {
		const contentClone = heroContent.cloneNode(true);
		contentClone.className = "hero-content-zoomed";
		layerDiv.appendChild(contentClone);
	  }
	});

	heroMedia.appendChild(lens);

	const lensSize = 280;
	let idleTimeout = null;
	let isIdle = false;

	heroMedia.addEventListener("mousemove", (e) => {
	  const rect = heroMedia.getBoundingClientRect();
	  const x = e.clientX - rect.left;
	  const y = e.clientY - rect.top;

	  lens.style.left = `${x - lensSize / 2}px`;
	  lens.style.top = `${y - lensSize / 2}px`;

	  // Get hero-content position for accurate text alignment
	  const contentRect = heroContent ? heroContent.getBoundingClientRect() : null;
	  const contentOffsetX = contentRect ? contentRect.left - rect.left : 0;
	  const contentOffsetY = contentRect ? contentRect.top - rect.top : 0;

	  layers.forEach((layer, index) => {
		const layerDiv = lens.children[index];
		const zoomLevel = layer.zoom;

		const bgX = (x * zoomLevel) - (lensSize / 2);
		const bgY = (y * zoomLevel) - (lensSize / 2);

		layerDiv.style.backgroundPosition = `-${bgX}px -${bgY}px`;
		layerDiv.style.backgroundSize = `${rect.width * zoomLevel}px ${rect.height * zoomLevel}px`;

		const contentClone = layerDiv.querySelector(".hero-content-zoomed");
		if (contentClone && contentRect) {
		  // Account for hero-content's actual position
		  const offsetX = -(x - contentOffsetX) * zoomLevel + lensSize / 2 + contentOffsetX;
		  const offsetY = -(y - contentOffsetY) * zoomLevel + lensSize / 2 + contentOffsetY;
		  contentClone.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoomLevel})`;
		}
	  });

	  if (isIdle) {
		lens.style.opacity = "1";
		lens.style.transform = "scale(1) translateY(0)";
		isIdle = false;
	  }

	  if (idleTimeout) clearTimeout(idleTimeout);
	  idleTimeout = setTimeout(() => {
		lens.style.opacity = "0";
		isIdle = true;
	  }, 800);
	});

	heroMedia.addEventListener("mouseenter", () => {
	  lens.style.opacity = "1";
	  lens.style.transform = "scale(1) translateY(0)";
	  isIdle = false;
	});

	heroMedia.addEventListener("mouseleave", () => {
	  if (idleTimeout) clearTimeout(idleTimeout);
	  lens.style.opacity = "0";
	  lens.style.transform = "scale(0.6) translateY(15px)";
	  isIdle = false;
	});
  }

  // Rotating intensity shimmer on Writing section
  function wireWritingShimmer() {
	const writingSection = document.querySelector(".panel--writing");
	if (!writingSection) return;

	let lastY = 0;
	let rotation = 0;

	writingSection.addEventListener("mousemove", (e) => {
	  const currentY = e.clientY;
	  const deltaY = currentY - lastY;

	  // Mouse up (-y) = clockwise, Mouse down (+y) = counter-clockwise
	  if (deltaY < 0) {
		rotation += 2; // clockwise
	  } else if (deltaY > 0) {
		rotation -= 2; // counter-clockwise
	  }

	  lastY = currentY;

	  writingSection.style.setProperty("--shimmer-rotation", `${rotation}deg`);
	  writingSection.classList.add("shimmer-active");
	});

	writingSection.addEventListener("mouseleave", () => {
	  writingSection.classList.remove("shimmer-active");
	});
  }

  // Subtle directional glint on Writing section border
  function wireWritingShimmer() {
	const writingSection = document.querySelector(".panel--writing");
	if (!writingSection) return;

	let lastY = 0;

	writingSection.addEventListener("mousemove", (e) => {
	  const currentY = e.clientY;

	  // Direction: mouse UP = clockwise, mouse DOWN = counter-clockwise
	  const direction = currentY < lastY ? 1 : -1;
	  lastY = currentY;

	  writingSection.style.setProperty("--shimmer-direction", direction);
	  writingSection.classList.add("shimmer-active");
	});

	writingSection.addEventListener("mouseleave", () => {
	  writingSection.classList.remove("shimmer-active");
	});
  }

  // ---------------- Tags: remote (tags.json) with local fallback ----------------

  function loadLocalTags() {
	try {
	  const raw = localStorage.getItem(TAGS_LOCAL_KEY);
	  if (!raw) return {};
	  const obj = JSON.parse(raw);
	  return obj && typeof obj === "object" ? obj : {};
	} catch {
	  return {};
	}
  }

  function saveLocalTags(tagsObj) {
	localStorage.setItem(TAGS_LOCAL_KEY, JSON.stringify(tagsObj, null, 2));
  }

  async function loadTags() {
	// Prefer remote file when it exists (live site)
	try {
	  const res = await fetch(TAGS_REMOTE_URL, { cache: "no-store" });
	  if (res.ok) {
		const data = await res.json();
		if (data && typeof data === "object") return data;
	  }
	} catch {
	  // ignore
	}
	// Fallback local
	return loadLocalTags();
  }

  function canonicalKeyForPath(pathname) {
	// store by pathname like "/writing/why-good-ux-still-fails.html"
	return pathname;
  }

  function renderArticleTags(tagList) {
	const row = document.createElement("div");
	row.className = "tag-row";

	const shown = tagList.slice(0, 5);
	shown.forEach((t) => {
	  const pill = document.createElement("span");
	  pill.className = "tag-pill";
	  pill.textContent = t;
	  row.appendChild(pill);
	});

	if (tagList.length > 5) {
	  const more = document.createElement("span");
	  more.className = "tag-pill more";
	  more.textContent = `+${tagList.length - 5}`;
	  row.appendChild(more);
	}

	return row;
  }

  async function injectArticleTags() {
	const isArticle = document.body.classList.contains("page-article");
	if (!isArticle) return;

	const tags = await loadTags();
	const key = canonicalKeyForPath(location.pathname);
	const list = Array.isArray(tags[key]) ? tags[key] : [];

	if (!list.length) return;

	// Try to place above title, inside the paper
	const paper = document.querySelector(".paper");
	const top = document.querySelector(".article-top");
	if (!paper) return;

	const row = renderArticleTags(list);

	if (top) {
	  // place before the article-top block
	  paper.insertBefore(row, top);
	} else {
	  paper.prepend(row);
	}
  }

  // ---------------- Manage page ----------------

  function defaultManifestFallback() {
	return [
	  { title: "Why good UX still fails", slug: "why-good-ux-still-fails", path: "/writing/why-good-ux-still-fails.html" },
	  { title: "The stove problem, revisited", slug: "the-stove-problem-revisited", path: "/writing/the-stove-problem-revisited.html" },
	  { title: "Adoption is a design problem", slug: "adoption-is-a-design-problem", path: "/writing/adoption-is-a-design-problem.html" }
	];
  }

  async function loadManifest() {
	try {
	  const res = await fetch(MANIFEST_URL, { cache: "no-store" });
	  if (res.ok) {
		const data = await res.json();
		if (Array.isArray(data)) return data;
		if (data && Array.isArray(data.items)) return data.items;
	  }
	} catch {
	  // ignore
	}
	return defaultManifestFallback();
  }

  function normalizeTag(t) {
	return (t || "")
	  .trim()
	  .toLowerCase()
	  .replace(/\s+/g, "-")
	  .replace(/[^a-z0-9\-]/g, "");
  }

  function ensureArrayTags(obj, key) {
	if (!obj[key]) obj[key] = [];
	if (!Array.isArray(obj[key])) obj[key] = [];
	return obj[key];
  }

  function downloadJSON(filename, obj) {
	const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
  }

  function isManagePage() {
	return location.pathname.endsWith("/manage.html") || location.pathname.endsWith("/writing/manage.html");
  }

  async function bootManagePage() {
	if (!isManagePage()) return;

	const tableBody = document.querySelector("[data-manage-body]");
	const exportBtn = document.querySelector("[data-export-tags]");
	const clearBtn = document.querySelector("[data-clear-local]");

	if (!tableBody) return;

	const manifest = await loadManifest();
	const localTags = loadLocalTags();

	function getTagsForPath(path) {
	  const key = canonicalKeyForPath(path);
	  return Array.isArray(localTags[key]) ? localTags[key] : [];
	}

	function setTagsForPath(path, list) {
	  const key = canonicalKeyForPath(path);
	  localTags[key] = list;
	  saveLocalTags(localTags);
	}

	function renderRow(item) {
	  const tr = document.createElement("tr");

	  // Title / Slug
	  const tdTitle = document.createElement("td");
	  tdTitle.className = "cell-title";
	  tdTitle.innerHTML = `
		<div class="cell-title">
		  <a href="${item.path}" target="_blank" rel="noreferrer">${item.title}</a>
		  <div class="cell-slug">${item.slug}</div>
		</div>
	  `;

	  // Tags editor
	  const tdTags = document.createElement("td");
	  const editor = document.createElement("div");
	  editor.className = "tag-editor";

	  function rerenderChips() {
		editor.querySelectorAll(".tag-chip").forEach((n) => n.remove());

		const tags = getTagsForPath(item.path);
		tags.forEach((tag, idx) => {
		  const chip = document.createElement("span");
		  chip.className = "tag-chip";
		  chip.title = "Double-click to rename. Click × to delete.";
		  chip.innerHTML = `<span>${tag}</span> <button type="button" aria-label="Delete tag">×</button>`;

		  // delete only for this article
		  chip.querySelector("button").addEventListener("click", () => {
			const next = tags.filter((_, i) => i !== idx);
			setTagsForPath(item.path, next);
			rerenderChips();
		  });

		  // inline rename
		  chip.addEventListener("dblclick", () => {
			const current = tag;
			const input = document.createElement("input");
			input.className = "tag-input";
			input.value = current;
			input.style.minWidth = "140px";

			const commit = () => {
			  const v = normalizeTag(input.value);
			  if (!v) {
				// revert
				rerenderChips();
				return;
			  }
			  const next = tags.slice();
			  next[idx] = v;
			  // de-dupe
			  const deduped = Array.from(new Set(next));
			  setTagsForPath(item.path, deduped);
			  rerenderChips();
			};

			input.addEventListener("keydown", (e) => {
			  if (e.key === "Enter") commit();
			  if (e.key === "Escape") rerenderChips();
			});
			input.addEventListener("blur", commit);

			chip.replaceWith(input);
			input.focus();
			input.select();
		  });

		  editor.prepend(chip);
		});
	  }

	  const input = document.createElement("input");
	  input.className = "tag-input";
	  input.placeholder = "Add tag…";

	  const addBtn = document.createElement("button");
	  addBtn.className = "btn";
	  addBtn.type = "button";
	  addBtn.textContent = "Add";

	  function addTag() {
		const v = normalizeTag(input.value);
		if (!v) return;

		const tags = getTagsForPath(item.path);
		const next = Array.from(new Set([...tags, v]));
		setTagsForPath(item.path, next);
		input.value = "";
		rerenderChips();
	  }

	  input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") addTag();
	  });
	  addBtn.addEventListener("click", addTag);

	  editor.appendChild(input);
	  editor.appendChild(addBtn);
	  tdTags.appendChild(editor);

	  tr.appendChild(tdTitle);
	  tr.appendChild(tdTags);

	  // initial chips
	  setTimeout(rerenderChips, 0);

	  return tr;
	}

	// Render table
	tableBody.innerHTML = "";
	manifest.forEach((item) => {
	  tableBody.appendChild(renderRow(item));
	});

	// Export tags.json (upload to live site root)
	if (exportBtn) {
	  exportBtn.addEventListener("click", () => {
		// Export ONLY local tags (your edits)
		downloadJSON("tags.json", loadLocalTags());
	  });
	}

	// Clear local tag store (optional reset)
	if (clearBtn) {
	  clearBtn.addEventListener("click", () => {
		localStorage.removeItem(TAGS_LOCAL_KEY);
		location.reload();
	  });
	}
  }

  // ---------------- Modal system ----------------

  function createModal() {
	if (document.querySelector(".modal-overlay")) return;

	const overlay = document.createElement("div");
	overlay.className = "modal-overlay";
	overlay.innerHTML = `
	  <div class="modal-content">
		<div class="modal-header">
		  <h2 class="modal-title"></h2>
		  <button class="modal-close" aria-label="Close modal">×</button>
		</div>
		<div class="modal-body"></div>
	  </div>
	`;

	document.body.appendChild(overlay);

	const closeBtn = overlay.querySelector(".modal-close");
	const content = overlay.querySelector(".modal-content");

	function closeModal() {
	  overlay.classList.remove("is-open");
	}

	closeBtn.addEventListener("click", closeModal);

	// Close on escape key
	document.addEventListener("keydown", (e) => {
	  if (e.key === "Escape" && overlay.classList.contains("is-open")) {
		closeModal();
	  }
	});

	// Close on overlay click (not content)
	overlay.addEventListener("click", (e) => {
	  if (e.target === overlay) {
		closeModal();
	  }
	});

	return overlay;
  }

  function openModal(title, bodyHTML) {
	const modal = createModal();
	const modalTitle = modal.querySelector(".modal-title");
	const modalBody = modal.querySelector(".modal-body");

	modalTitle.textContent = title;
	modalBody.innerHTML = bodyHTML;

	setTimeout(() => {
	  modal.classList.add("is-open");
	}, 10);
  }

  function wireModalTriggers() {
	const triggers = document.querySelectorAll("[data-modal]");
	triggers.forEach((trigger) => {
	  trigger.addEventListener("click", () => {
		const modalId = trigger.getAttribute("data-modal");
		// Placeholder content - will be populated with actual content later
		openModal(
		  trigger.querySelector(".card-title, .article-item-title, .work-item-title")?.textContent || "Article",
		  `<p>This is a placeholder for the full article content. In production, this would load the actual essay or case study.</p>
		   <p>The modal can contain any HTML content, including images, code blocks, and formatted text.</p>
		   <h2>Features</h2>
		   <p>• Close with X button<br>• Close with Escape key<br>• Close by clicking outside<br>• Smooth fade in/out animations</p>`
		);
	  });
	});
  }

  // ---------- boot ----------
  setTheme(getInitialTheme());

  injectHeader();
  injectFooter();
  wireCardMouseGradients();
  wireHeroBubbleZoom();
  wireWritingShimmer();
  injectArticleTags();
  bootManagePage();
  wireModalTriggers();
})();