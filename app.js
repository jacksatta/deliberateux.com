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
  const MANIFEST_URL = "/work/writing/manifest.json";

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
			  <span class="brand-wordmark">Deliberate<span class="wordmark-ux">UX</span></span>
			</a>
		  </div>

		  <div class="nav-right">
			<ul class="nav-links">
			  <li><a href="/work/">Work</a></li>
			  <li><a href="/work/writing/">Writing</a></li>
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
			<div class="brand-dot" aria-hidden="true">
			  <div class="brand-dot-sparkle">
				<span></span><span></span><span></span>
				<span></span><span></span><span></span>
			  </div>
			</div>
			<div class="footer-blurb">
			  <div class="footer-wordmark">Deliberate<span class="wordmark-ux">UX</span></div>
			  <div class="footer-tagline">© ${year} · <a href="/work/">Work</a> · <a href="/work/writing/">Writing</a> · <a href="/#about">About</a></div>
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
	if (!heroMedia) return;

	const lensSize = 220;
	const zoomFactor = 2.5;

	// Create lens container (clips the zoomed content)
	const lens = document.createElement("div");
	lens.className = "hero-lens";

	// Clone entire hero-media so image + text zoom together
	const clone = heroMedia.cloneNode(true);
	clone.className = "hero-lens-clone";
	lens.appendChild(clone);
	heroMedia.appendChild(lens);

	heroMedia.addEventListener("mousemove", (e) => {
	  const rect = heroMedia.getBoundingClientRect();
	  const x = e.clientX - rect.left;
	  const y = e.clientY - rect.top;

	  // Position lens centered on cursor
	  lens.style.left = `${x - lensSize / 2}px`;
	  lens.style.top = `${y - lensSize / 2}px`;

	  // Position the scaled clone so point under cursor appears at lens center
	  const offsetX = -x * zoomFactor + lensSize / 2;
	  const offsetY = -y * zoomFactor + lensSize / 2;

	  clone.style.width = `${rect.width}px`;
	  clone.style.height = `${rect.height}px`;
	  clone.style.transform = `scale(${zoomFactor}) translate(${offsetX / zoomFactor}px, ${offsetY / zoomFactor}px)`;

	  // Fade out as cursor approaches edges
	  const edgeFade = 80; // pixels from edge to start fading
	  const distFromLeft = x;
	  const distFromRight = rect.width - x;
	  const distFromTop = y;
	  const distFromBottom = rect.height - y;
	  const minDist = Math.min(distFromLeft, distFromRight, distFromTop, distFromBottom);
	  const edgeOpacity = Math.min(1, minDist / edgeFade);

	  lens.style.opacity = edgeOpacity.toString();
	});

	heroMedia.addEventListener("mouseleave", () => {
	  lens.style.opacity = "0";
	});

	// Touch support - same behavior but fade on touch end
	function handleTouch(e) {
	  const touch = e.touches[0];
	  if (!touch) return;

	  const rect = heroMedia.getBoundingClientRect();
	  const x = touch.clientX - rect.left;
	  const y = touch.clientY - rect.top;

	  // Position lens centered on touch
	  lens.style.left = `${x - lensSize / 2}px`;
	  lens.style.top = `${y - lensSize / 2}px`;

	  // Position the scaled clone
	  const offsetX = -x * zoomFactor + lensSize / 2;
	  const offsetY = -y * zoomFactor + lensSize / 2;

	  clone.style.width = `${rect.width}px`;
	  clone.style.height = `${rect.height}px`;
	  clone.style.transform = `scale(${zoomFactor}) translate(${offsetX / zoomFactor}px, ${offsetY / zoomFactor}px)`;

	  // Fade out near edges
	  const edgeFade = 80;
	  const distFromLeft = x;
	  const distFromRight = rect.width - x;
	  const distFromTop = y;
	  const distFromBottom = rect.height - y;
	  const minDist = Math.min(distFromLeft, distFromRight, distFromTop, distFromBottom);
	  const edgeOpacity = Math.min(1, minDist / edgeFade);

	  lens.style.opacity = edgeOpacity.toString();
	}

	let fadeTimeout = null;
	const fadeDelay = 1500; // ms before lens fades after touch ends

	heroMedia.addEventListener("touchstart", (e) => {
	  // Cancel any pending fade when user touches again
	  if (fadeTimeout) {
		clearTimeout(fadeTimeout);
		fadeTimeout = null;
	  }
	  handleTouch(e);
	}, { passive: true });

	heroMedia.addEventListener("touchmove", handleTouch, { passive: true });

	heroMedia.addEventListener("touchend", () => {
	  // Fade away after delay
	  fadeTimeout = setTimeout(() => {
		lens.style.opacity = "0";
		fadeTimeout = null;
	  }, fadeDelay);
	});

	heroMedia.addEventListener("touchcancel", () => {
	  if (fadeTimeout) {
		clearTimeout(fadeTimeout);
		fadeTimeout = null;
	  }
	  lens.style.opacity = "0";
	});
  }

  // Fade out hero section as user scrolls down
  function wireScrollFade() {
	const hero = document.querySelector(".hero");
	const cards = document.querySelectorAll(".cards .card");
	const workSection = document.querySelector(".panel--work");
	const writingSection = document.querySelector(".panel--writing");

	const fadeDistance = 300; // pixels to fully fade out hero

	function updateFade() {
	  const scrollY = window.scrollY;
	  const viewportHeight = window.innerHeight;

	  // Hero fade
	  if (hero) {
		const opacity = Math.max(0, 1 - scrollY / fadeDistance);
		const translateY = scrollY * 0.3; // parallax effect
		hero.style.opacity = opacity.toString();
		hero.style.transform = `translateY(${translateY}px)`;
	  }

	  // Work section fade when writing section comes into view
	  if (workSection && writingSection) {
		const writingRect = writingSection.getBoundingClientRect();
		// Start fading when writing section enters bottom half of viewport
		if (writingRect.top < viewportHeight * 0.7) {
		  const fadeProgress = Math.min(1, (viewportHeight * 0.7 - writingRect.top) / 300);
		  workSection.style.opacity = Math.max(0.15, 1 - fadeProgress).toString();
		} else {
		  workSection.style.opacity = "1";
		}
	  }

	  // Card scroll fade - fade cards as they scroll up
	  cards.forEach((card) => {
		const rect = card.getBoundingClientRect();
		// Fade when card is in top 20% of viewport
		if (rect.top < viewportHeight * 0.2 && rect.bottom > 0) {
		  card.classList.add("scroll-faded");
		} else {
		  card.classList.remove("scroll-faded");
		}
	  });
	}

	window.addEventListener("scroll", updateFade, { passive: true });
	updateFade();
  }

  // About flowchart animation on scroll into view
  function wireAboutAnimation() {
	const illustration = document.querySelector(".about-illustration");
	if (!illustration) return;

	const observer = new IntersectionObserver(
	  (entries) => {
		entries.forEach((entry) => {
		  if (entry.isIntersecting) {
			illustration.classList.add("is-visible");
			observer.disconnect(); // Only animate once
		  }
		});
	  },
	  { threshold: 0.3 }
	);

	observer.observe(illustration);
  }

  // Glint effect on Writing section - tracks mouse position
  function wireWritingShimmer() {
	const writingSection = document.querySelector(".panel--writing");
	if (!writingSection) return;

	writingSection.addEventListener("mousemove", (e) => {
	  const rect = writingSection.getBoundingClientRect();
	  const x = ((e.clientX - rect.left) / rect.width) * 100;
	  const y = ((e.clientY - rect.top) / rect.height) * 100;
	  writingSection.style.setProperty("--mx", `${x}%`);
	  writingSection.style.setProperty("--my", `${y}%`);
	});

	writingSection.addEventListener("mouseleave", () => {
	  writingSection.style.removeProperty("--mx");
	  writingSection.style.removeProperty("--my");
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

  // ---------------- Article back link ----------------

  function injectArticleBackLink() {
	const isArticle = document.body.classList.contains("page-article");
	if (!isArticle) return;

	const articleWrap = document.querySelector(".article-wrap");
	if (!articleWrap) return;

	// Determine parent section from path
	const path = location.pathname;
	let backHref = "/";
	let backText = "Home";

	if (path.startsWith("/work/writing/")) {
	  backHref = "/work/writing/";
	  backText = "Writing";
	} else if (path.startsWith("/work/")) {
	  backHref = "/work/";
	  backText = "Work";
	}

	const backLink = document.createElement("a");
	backLink.href = backHref;
	backLink.className = "article-back-link";
	backLink.innerHTML = `<span class="back-arrow">←</span> ${backText}`;

	articleWrap.insertBefore(backLink, articleWrap.firstChild);
  }

  // ---------------- Manage page ----------------

  function defaultManifestFallback() {
	return [
	  { title: "Why good UX still fails", slug: "why-good-ux-still-fails", path: "/work/writing/why-good-ux-still-fails.html" },
	  { title: "The stove problem, revisited", slug: "the-stove-problem-revisited", path: "/work/writing/the-stove-problem-revisited.html" },
	  { title: "Adoption is a design problem", slug: "adoption-is-a-design-problem", path: "/work/writing/adoption-is-a-design-problem.html" },
	  { title: "The hidden cost of \"just one more field\"", slug: "the-hidden-cost-of-one-more-field", path: "/work/writing/the-hidden-cost-of-one-more-field.html" },
	  { title: "Design systems don't fix culture", slug: "design-systems-dont-fix-culture", path: "/work/writing/design-systems-dont-fix-culture.html" }
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
	return location.pathname.endsWith("/manage.html") || location.pathname.endsWith("/work/writing/manage.html");
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

  // Scroll-based fade animations
  function wireScrollAnimations() {
	const observerOptions = {
	  root: null,
	  rootMargin: '0px 0px -100px 0px',
	  threshold: 0.15
	};

	const sectionObserver = new IntersectionObserver((entries) => {
	  entries.forEach((entry) => {
		if (entry.isIntersecting) {
		  entry.target.classList.add('fade-in');

		  // Fade in items within the section
		  const items = entry.target.querySelectorAll('.card, .writing-list li, .work-item, .article-item');
		  items.forEach((item, index) => {
			setTimeout(() => {
			  item.classList.add('fade-in-item');
			}, index * 100);
		  });
		}
	  });
	}, observerOptions);

	// Observe all sections
	document.querySelectorAll('.section').forEach((section) => {
	  sectionObserver.observe(section);
	});
  }

  // ---------------- Work page case study modals ----------------

  function wireWorkCards() {
	const workCards = document.querySelectorAll(".work-card[data-case]");
	if (!workCards.length) return;

	workCards.forEach((card) => {
	  // Mouse gradient tracking
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

	  // Click to open modal
	  card.addEventListener("click", () => {
		const caseId = card.getAttribute("data-case");
		const modal = document.getElementById(`modal-${caseId}`);
		if (modal) {
		  modal.classList.add("is-open");
		  document.body.style.overflow = "hidden";
		}
	  });
	});
  }

  function wireCaseModals() {
	const overlays = document.querySelectorAll(".case-modal-overlay");
	if (!overlays.length) return;

	overlays.forEach((overlay) => {
	  const closeBtn = overlay.querySelector(".case-modal-close");

	  function closeModal() {
		overlay.classList.remove("is-open");
		document.body.style.overflow = "";
	  }

	  if (closeBtn) {
		closeBtn.addEventListener("click", closeModal);
	  }

	  // Close on overlay click (not modal content)
	  overlay.addEventListener("click", (e) => {
		if (e.target === overlay) {
		  closeModal();
		}
	  });

	  // Escape key to close
	  document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && overlay.classList.contains("is-open")) {
		  closeModal();
		}
	  });
	});

	// Open modal from URL hash (e.g., /work/#technology)
	const hash = window.location.hash.slice(1);
	if (hash) {
	  const modal = document.getElementById(`modal-${hash}`);
	  if (modal) {
		setTimeout(() => {
		  modal.classList.add("is-open");
		  document.body.style.overflow = "hidden";
		}, 300);
	  }
	}
  }

  // Hero entrance animation on page load
  function wireHeroIntro() {
	const hero = document.querySelector(".hero");
	if (!hero) return;

	// Add intro class to trigger CSS animations
	hero.classList.add("hero-intro");

	// Clean up class after animation completes
	hero.addEventListener("animationend", (e) => {
	  if (e.target === hero) {
		// Keep class until content animation also finishes
		const content = hero.querySelector(".hero-content");
		if (content) {
		  content.addEventListener("animationend", () => {
			hero.classList.remove("hero-intro");
		  }, { once: true });
		} else {
		  hero.classList.remove("hero-intro");
		}
	  }
	}, { once: true });
  }

  // ---------- boot ----------
  setTheme(getInitialTheme());

  wireHeroIntro();
  injectHeader();
  injectFooter();
  wireCardMouseGradients();
  wireHeroBubbleZoom();
  wireScrollFade();
  wireWritingShimmer();
  wireAboutAnimation();
  injectArticleTags();
  injectArticleBackLink();
  bootManagePage();
  wireModalTriggers();
  wireScrollAnimations();
  wireWorkCards();
  wireCaseModals();
})();