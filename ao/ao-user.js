/* ao-user.js — Shared user identity + storage namespacing for AO
 *
 * Single source of truth for:
 *   - aoKey(suffix)        → 'ao_<uid>_<suffix>' (signed in) or 'ao_guest_<suffix>' (anonymous)
 *   - isAdmin()            → boolean
 *   - getUser()            → { id, email, plan, isAdmin, ... } or null
 *   - getItem/setItem/removeItem → aoKey-wrapped localStorage helpers (preferred)
 *   - migrateLegacyKeys()  → copies pre-namespacing ao_* keys into ao_guest_* on first run
 *   - migrateGuestToUser() → called on Clerk sign-in; copies ao_guest_* → ao_<uid>_*
 *
 * Must load BEFORE ao-nav.js. Clerk integration is stubbed — when Clerk is present
 * on window.Clerk, we use the real user id; otherwise everything runs in guest mode.
 */
(function () {
  'use strict';

  // Keys that should NOT be user-scoped (UI prefs shared across accounts on same browser).
  var GLOBAL_KEYS = { 'theme': 1, 'sidebar_collapsed': 1 };

  // Legacy (pre-namespacing) keys to migrate on first run. Matches AO source as of 2026-04-22.
  var LEGACY_KEYS = [
    'ao_orgs',
    'ao_flow_tasks',
    'ao_flow_executions',
    'ao_last_execution',
    'ao_gh_pat',
    'ao_admin'
  ];

  function currentUid() {
    try {
      if (window.Clerk && window.Clerk.user && window.Clerk.user.id) {
        return window.Clerk.user.id;
      }
    } catch (e) {}
    return 'guest';
  }

  function aoKey(suffix) {
    if (!suffix) return null;
    // Strip 'ao_' prefix if caller passed a full legacy key by accident.
    var s = String(suffix).replace(/^ao_/, '');
    if (GLOBAL_KEYS[s]) return 'ao_' + s;
    return 'ao_' + currentUid() + '_' + s;
  }

  function getItem(suffix) {
    var k = aoKey(suffix);
    return k ? localStorage.getItem(k) : null;
  }
  function setItem(suffix, value) {
    var k = aoKey(suffix);
    if (k) localStorage.setItem(k, value);
  }
  function removeItem(suffix) {
    var k = aoKey(suffix);
    if (k) localStorage.removeItem(k);
  }

  function getJSON(suffix, fallback) {
    try { return JSON.parse(getItem(suffix)) || (fallback !== undefined ? fallback : null); }
    catch (e) { return fallback !== undefined ? fallback : null; }
  }
  function setJSON(suffix, obj) { setItem(suffix, JSON.stringify(obj)); }

  function isAdmin() {
    // Priority: Clerk publicMetadata.is_admin > localStorage flag > ?admin URL param
    try {
      if (window.Clerk && window.Clerk.user &&
          window.Clerk.user.publicMetadata &&
          window.Clerk.user.publicMetadata.is_admin) {
        return true;
      }
    } catch (e) {}
    if (localStorage.getItem('ao_admin') === '1') return true;
    try {
      if (new URLSearchParams(location.search).has('admin')) {
        localStorage.setItem('ao_admin', '1');
        return true;
      }
    } catch (e) {}
    return false;
  }

  function getUser() {
    try {
      if (window.Clerk && window.Clerk.user) {
        var u = window.Clerk.user;
        return {
          id: u.id,
          email: (u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || '',
          name: u.fullName || u.firstName || '',
          plan: (u.publicMetadata && u.publicMetadata.plan) || 'free',
          isAdmin: isAdmin(),
          signedIn: true
        };
      }
    } catch (e) {}
    return {
      id: 'guest',
      email: '',
      name: '',
      plan: 'free',
      isAdmin: isAdmin(),
      signedIn: false
    };
  }

  /* Run once on page load: if guest namespace is empty but legacy keys exist,
   * copy them in. Preserves Jack's existing browser data on the first load
   * after this module ships. */
  function migrateLegacyKeys() {
    var didMigrate = false;
    LEGACY_KEYS.forEach(function (k) {
      var legacyVal = localStorage.getItem(k);
      if (legacyVal === null) return;
      var suffix = k.replace(/^ao_/, '');
      if (GLOBAL_KEYS[suffix]) return; // theme etc. already at the shared key
      var newKey = 'ao_guest_' + suffix;
      if (localStorage.getItem(newKey) !== null) return; // don't clobber
      localStorage.setItem(newKey, legacyVal);
      didMigrate = true;
    });
    if (didMigrate) localStorage.setItem('ao_legacy_migrated', String(Date.now()));
  }

  /* Called when a user first signs in via Clerk: copy every ao_guest_* key
   * into ao_<uid>_*, then clear guest namespace. Only runs if the user's
   * namespace is empty (don't clobber returning users). */
  function migrateGuestToUser() {
    var uid = currentUid();
    if (uid === 'guest') return;
    var userPrefix = 'ao_' + uid + '_';
    var guestPrefix = 'ao_guest_';
    var userHasData = false;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(userPrefix) === 0) { userHasData = true; break; }
    }
    if (userHasData) return;
    var keysToMove = [];
    for (var j = 0; j < localStorage.length; j++) {
      var gk = localStorage.key(j);
      if (gk && gk.indexOf(guestPrefix) === 0) keysToMove.push(gk);
    }
    keysToMove.forEach(function (gk) {
      var suffix = gk.slice(guestPrefix.length);
      var val = localStorage.getItem(gk);
      if (val !== null) {
        // Special case: 'orgs' may contain demo entries (seeded for cold visitors).
        // Strip them on migration so a new signed-in user starts with their own orgs only.
        if (suffix === 'orgs') {
          try {
            var parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              var filtered = parsed.filter(function (o) { return !o || !o.demo; });
              val = JSON.stringify(filtered);
            }
          } catch (e) {}
        }
        localStorage.setItem(userPrefix + suffix, val);
      }
      localStorage.removeItem(gk);
    });
  }

  /* Public API on window.AOUser */
  window.AOUser = {
    aoKey: aoKey,
    getItem: getItem,
    setItem: setItem,
    removeItem: removeItem,
    getJSON: getJSON,
    setJSON: setJSON,
    isAdmin: isAdmin,
    getUser: getUser,
    currentUid: currentUid,
    migrateGuestToUser: migrateGuestToUser
  };

  /* Run legacy migration once on every page load. Cheap and idempotent. */
  migrateLegacyKeys();
})();
