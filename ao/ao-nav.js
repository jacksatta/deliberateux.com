/* ao-nav.js — Shared navigation chrome for all AO pages */
(function () {
  'use strict';
  var PAGE = location.pathname.replace(/^\/ao\//, '').replace(/\.html$/, '') || 'index';
  var PARAMS = new URLSearchParams(location.search);
  var ORG = PARAMS.get('org') || PARAMS.get('slug') || '';
  var IS_ADMIN = PARAMS.has('admin') || localStorage.getItem('ao_admin') === '1';
  if (IS_ADMIN) localStorage.setItem('ao_admin', '1');
  var SKIP = { 'app': 1, 'bootup': 1 };
  if (SKIP[PAGE]) return;
  var saved = localStorage.getItem('ao_theme');
  if (saved) document.documentElement.dataset.theme = saved;
  var LINKS = [
    ['Overview',   '/ao/',               {}],
    ['Dashboard',  '/ao/dashboard.html',  { admin: true }],
    ['Queue',      '/ao/queue.html',      {}],
    ['Flows',      '/ao/flows.html',      {}],
    ['Configure',  '/ao/configure.html',  {}],
    ['Onboard',    '/ao/onboard.html',    { hideOn: ['queue', 'flows', 'configure', 'dashboard', 'org'] }],
  ];
  var PAGE_ANCHORS = {
    'index': [
      ['Architecture', '#architecture'],
      ['Agents', '#agents'],
      ['Protocol', '#protocol'],
    ]
  };
  function isCurrent(href) {
    var h = href.replace(/^\/ao\//, '').replace(/\.html$/, '') || 'index';
    return h === PAGE;
  }
  function contextLabel() {
    if (IS_ADMIN) return '/ Admin';
    if (ORG) return '/ ' + decodeURIComponent(ORG);
    var labels = {
      'index': '', 'onboard': '/ Setup', 'configure': '/ Configure',
      'queue': '/ Queue', 'flows': '/ Studio', 'dashboard': '/ Admin',
      'org': ORG ? '/ ' + decodeURIComponent(ORG) : '/ Org',
      'tracker': '/ Tracker', 'user-flows': '/ Sitemap',
      'ao-sitemap': '/ Sitemap', 'theme-studio-local': '/ Theme Studio',
    };
    return labels[PAGE] || '';
  }
  function buildNav() {
    var nav = document.createElement('nav');
    nav.className = 'ao-nav';
    var inner = document.createElement('div');
    inner.className = 'ao-nav-inner';
    var logo = document.createElement('a');
    logo.href = IS_ADMIN ? '/ao/dashboard.html' : '/ao/';
    logo.className = 'ao-nav-logo';
    logo.innerHTML = '<span class="ao-nav-dot"></span>AO<span class="ao-nav-context">' + contextLabel() + '</span>';
    inner.appendChild(logo);
    var linksWrap = document.createElement('div');
    linksWrap.className = 'ao-nav-links';
    var anchors = PAGE_ANCHORS[PAGE] || [];
    anchors.forEach(function (entry) {
      var a = document.createElement('a');
      a.href = entry[1]; a.textContent = entry[0];
      a.className = 'ao-nav-anchor';
      linksWrap.appendChild(a);
    });
    if (anchors.length) {
      var sep = document.createElement('span');
      sep.className = 'ao-nav-sep';
      linksWrap.appendChild(sep);
    }
    LINKS.forEach(function (entry) {
      var label = entry[0], href = entry[1], opts = entry[2] || {};
      if (opts.admin && !IS_ADMIN) return;
      if (opts.hideOn && opts.hideOn.indexOf(PAGE) !== -1) return;
      if (opts.showOn && opts.showOn.indexOf(PAGE) === -1) return;
      var a = document.createElement('a');
      a.href = href; a.textContent = label;
      if (isCurrent(href)) a.className = 'current';
      if (ORG && href.indexOf('?') === -1 &&
          ['queue', 'flows', 'configure', 'org'].some(function(p) { return href.indexOf(p) !== -1; })) {
        a.href = href + '?org=' + encodeURIComponent(ORG);
      }
      linksWrap.appendChild(a);
    });
    inner.appendChild(linksWrap);
    if (IS_ADMIN) {
      var badge = document.createElement('span');
      badge.className = 'ao-nav-admin';
      badge.textContent = 'Admin';
      inner.appendChild(badge);
    }
    var themeBtn = document.createElement('button');
    themeBtn.className = 'ao-nav-theme';
    themeBtn.title = 'Switch theme';
    themeBtn.innerHTML = '&#9681;';
    themeBtn.addEventListener('click', cycleTheme);
    inner.appendChild(themeBtn);
    nav.appendChild(inner);
    return nav;
  }
  var THEMES = ['ops', 'midnight', 'greenhouse', 'sandstone', 'studio', 'daybreak'];
  function cycleTheme() {
    var current = document.documentElement.dataset.theme || 'ops';
    var idx = THEMES.indexOf(current);
    var next = THEMES[(idx + 1) % THEMES.length];
    document.documentElement.dataset.theme = next;
    localStorage.setItem('ao_theme', next);
  }
  function injectStyles() {
    if (document.querySelector('.ao-nav-injected-styles')) return;
    var s = document.createElement('style');
    s.className = 'ao-nav-injected-styles';
    s.textContent = '.ao-nav{position:sticky;top:0;z-index:200;background:var(--surface);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,0.07);transition:background .35s ease}.ao-nav-inner{width:min(var(--max,1200px),calc(100% - 48px));margin:0 auto;display:flex;align-items:center;height:54px}.ao-nav-logo{font-size:.95rem;font-weight:700;display:flex;align-items:center;gap:8px;color:var(--text);text-decoration:none;margin-right:auto;flex-shrink:0}.ao-nav-context{font-weight:400;color:var(--muted);margin-left:2px}.ao-nav-dot{width:7px;height:7px;border-radius:50%;background:rgb(var(--amber));box-shadow:0 0 7px rgba(var(--amber),.6);flex-shrink:0;animation:aoDotPulse 2.5s ease-in-out infinite}@keyframes aoDotPulse{0%,100%{opacity:1}50%{opacity:.35}}.ao-nav-links{display:flex;gap:22px;font-size:.84rem;margin-right:16px}.ao-nav-links a{color:var(--muted);text-decoration:none;transition:color .2s;padding:4px 0;border-bottom:2px solid transparent}.ao-nav-links a:hover{color:var(--text)}.ao-nav-links a.current{color:var(--text);border-bottom-color:rgb(var(--amber))}.ao-nav-sep{width:1px;height:14px;background:rgba(255,255,255,.12);align-self:center;margin:0 2px}[data-theme=studio] .ao-nav-sep,[data-theme=daybreak] .ao-nav-sep{background:rgba(0,0,0,.12)}.ao-nav-admin{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:5px 11px;border-radius:6px;background:rgba(var(--amber),.14);border:1px solid rgba(var(--amber),.28);color:rgb(var(--amber));margin-right:12px}.ao-nav-theme{background:none;border:none;cursor:pointer;color:var(--muted);font-size:1.1rem;padding:6px;border-radius:6px;line-height:1;transition:color .2s,background .2s}.ao-nav-theme:hover{color:var(--text);background:rgba(255,255,255,.06)}@media(max-width:600px){.ao-nav-links{gap:12px;font-size:.78rem}.ao-nav-inner{height:48px}}[data-theme=studio] .ao-nav{border-bottom-color:rgba(0,0,0,.08)}[data-theme=studio] .ao-nav-theme:hover{background:rgba(0,0,0,.06)}[data-theme=daybreak] .ao-nav{border-bottom-color:rgba(0,0,0,.06)}[data-theme=daybreak] .ao-nav-theme:hover{background:rgba(0,0,0,.05)}';
    document.head.appendChild(s);
  }
  var ADMIN_ONLY = { 'tracker': 1, 'user-flows': 1 };
  function adminGate() {
    if (!ADMIN_ONLY[PAGE]) return false;
    if (IS_ADMIN) return false;
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--bg,#121110);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:var(--muted,#888);font-family:system-ui;';
    overlay.innerHTML = '<div style="font-size:1.1rem;font-weight:600;color:var(--text,#eee)">Admin access required</div><div style="font-size:0.85rem">Add <code style="background:rgba(255,255,255,0.08);padding:3px 8px;border-radius:4px;font-size:0.82rem">?admin</code> to the URL</div>';
    document.body.appendChild(overlay);
    return true;
  }
  function init() {
    if (adminGate()) return;
    injectStyles();
    var existing = document.querySelector('nav.ao-nav');
    if (existing) existing.remove();
    var nav = buildNav();
    document.body.insertBefore(nav, document.body.firstChild);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
