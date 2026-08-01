/* ao-seed.js — Welcome demo content for new AO users
 *
 * Exposes window.AOSeed.welcomeTasks() returning a small, visually interesting
 * set of tasks across a few agents so the queue doesn't look empty on first visit.
 * queue.html checks AOUser.getItem('welcome_demo_dismissed') — if set, seed is skipped.
 *
 * This file is the single source of truth for what a new user sees.
 */
(function () {
  'use strict';

  function welcomeAgents() {
    return [
      { id: 'marketing', name: 'Marketing', role: 'Competitive scans, positioning, launch planning' },
      { id: 'dev',       name: 'Dev',       role: 'Feature implementation, deploys, bug fixes' },
      { id: 'uxr',       name: 'UX Research', role: 'Heuristic evaluation, accessibility audits' },
      { id: 'cs',        name: 'Customer Support', role: 'Inbox triage, feature request capture' },
      { id: 'ea',        name: 'Exec Assistant', role: 'Triage, unblock agents, synthesize for you' }
    ];
  }

  function welcomeTasks(nextIdFn) {
    var nextId = (typeof nextIdFn === 'function') ? nextIdFn : (function(){ var n=1; return function(){ return n++; }; })();
    var now = Date.now();
    return [
      { id: nextId(), agent: 'marketing', task: 'Scan competitor pricing pages',
        status: 'done', born: now - 180000, healState: null, healReason: null, demo: true },
      { id: nextId(), agent: 'dev',       task: 'Ship launch CTA fix to production',
        status: 'done', born: now - 120000, healState: null, healReason: null, demo: true },
      { id: nextId(), agent: 'uxr',       task: 'Audit onboarding flow for first-run friction',
        status: 'progress', born: now - 40000, healState: null, healReason: null, demo: true },
      { id: nextId(), agent: 'cs',        task: 'Draft reply to inbound beta request',
        status: 'progress', born: now - 20000, healState: null, healReason: null, demo: true },
      { id: nextId(), agent: 'ea',        task: 'Synthesize yesterday\'s handoffs for morning brief',
        status: 'queued', born: now - 5000, healState: null, healReason: null, demo: true }
    ];
  }

  // "Dismiss welcome demo" helper — stamps the user's namespace so the demo
  // doesn't reappear on next page load. Returns true if a dismissal was recorded.
  function dismissDemo() {
    if (!window.AOUser) return false;
    window.AOUser.setItem('welcome_demo_dismissed', String(Date.now()));
    return true;
  }

  function isDismissed() {
    return !!(window.AOUser && window.AOUser.getItem('welcome_demo_dismissed'));
  }

  // Demo orgs — persisted into the orgs list so dashboard + org.html + configure.html
  // all see the same data. Flagged demo:true so the migration path can drop them
  // when a user first signs in (they shouldn't carry over to a real account).
  function welcomeOrgs() {
    var nowIso = new Date().toISOString().slice(0, 10);
    return [
      {
        slug: 'bright-studio',
        name: 'Bright Studio',
        type: 'creative',
        status: 'active',
        focus: ['design', 'content', 'marketing'],
        autonomy: 'high',
        operators: {
          ea: 'agent', mkt: 'agent', dev: 'agent', uxr: 'agent',
          qa: 'agent', cs: 'agent', biz: 'human'
        },
        roles: ['ea', 'mkt', 'dev', 'uxr', 'qa', 'cs', 'biz'],
        createdAt: nowIso,
        updatedAt: nowIso,
        demo: true
      },
      {
        slug: 'nomad-labs',
        name: 'Nomad Labs',
        type: 'small-team',
        status: 'active',
        focus: ['development', 'marketing', 'analytics'],
        autonomy: 'medium',
        operators: {
          ea: 'agent', mkt: 'agent', dev: 'human', uxr: 'agent',
          qa: 'agent', cs: 'agent', biz: 'agent'
        },
        roles: ['ea', 'mkt', 'dev', 'uxr', 'qa', 'cs', 'biz'],
        createdAt: nowIso,
        updatedAt: nowIso,
        demo: true
      }
    ];
  }

  // Idempotent: seed demo orgs into localStorage when (a) the orgs list is empty
  // AND (b) we haven't already seeded once for this user. Returns true if seeding
  // actually happened, false otherwise. Safe to call on every page load.
  function seedOrgsIfEmpty() {
    if (!window.AOUser) return false;
    if (AOUser.getItem('orgs_seeded') === '1') return false; // already seeded once
    var existing = AOUser.getJSON('orgs', []);
    if (Array.isArray(existing) && existing.length > 0) {
      // User has real orgs — don't seed, but mark as seeded so we never overwrite.
      AOUser.setItem('orgs_seeded', '1');
      return false;
    }
    AOUser.setJSON('orgs', welcomeOrgs());
    AOUser.setItem('orgs_seeded', '1');
    return true;
  }

  window.AOSeed = {
    welcomeAgents: welcomeAgents,
    welcomeTasks: welcomeTasks,
    welcomeOrgs: welcomeOrgs,
    seedOrgsIfEmpty: seedOrgsIfEmpty,
    dismissDemo: dismissDemo,
    isDismissed: isDismissed
  };
})();
