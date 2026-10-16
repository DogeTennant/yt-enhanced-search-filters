// Pure helpers for the filters YouTube can't do itself: parsing numbers, lengths and ages,
// matching title words, and deciding whether one result card should be hidden.
// No DOM access here, so it can be unit-tested with `node --test`.
(function (root) {
  'use strict';

  // "1,194,065 views" -> 1194065, "1.1M" -> 1100000, "12K" -> 12000, "No views" -> 0.
  // Full counts are read digit by digit, so they work in any language.
  function parseCount(text) {
    if (text == null) return null;
    const s = String(text).trim();
    if (!s) return null;
    const short = s.match(/(\d+(?:[.,]\d+)?)\s*([KMB])(?![a-z])/i);
    if (short) {
      const n = parseFloat(short[1].replace(',', '.'));
      return Math.round(n * { K: 1e3, M: 1e6, B: 1e9 }[short[2].toUpperCase()]);
    }
    const digits = s.replace(/\D/g, '');
    if (digits) return Number(digits);
    return /^no\b/i.test(s) ? 0 : null;
  }

  // "25:33" -> 1533, "1:09:56" -> 4196. Anything else -> null.
  function parseLength(text) {
    if (!text) return null;
    const m = String(text).trim().match(/^(\d+)(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
    if (!m || m[2] === undefined) return null;
    const parts = [m[1], m[2], m[3]].filter(p => p !== undefined).map(Number);
    return parts.reduce((total, p) => total * 60 + p, 0);
  }

  const DAY = 86400000;
  const AGE_UNITS = [
    [/^(years?|yrs?|y)$/, 365.25 * DAY],
    [/^(months?|mos?)$/, 30.44 * DAY],
    [/^(weeks?|wks?|w)$/, 7 * DAY],
    [/^(days?|d)$/, DAY],
    [/^(hours?|hrs?|h)$/, 3600000],
    [/^(minutes?|mins?|m)$/, 60000],
    [/^(seconds?|secs?|s)$/, 1000],
  ];

  // "2y ago", "3 weeks ago", "Streamed 5 months ago" -> { count, unit (ms) }. English only;
  // anything else returns null and the date check simply skips that card.
  function parseAge(text) {
    if (!text) return null;
    const m = String(text).toLowerCase().match(/(\d+)\s*([a-z]+)\s+ago\b/);
    if (!m) return null;
    const unit = AGE_UNITS.find(([re]) => re.test(m[2]));
    return unit ? { count: Number(m[1]), unit: unit[1] } : null;
  }

  // YouTube rounds ages down ("1 year ago" can mean 23 months), so allow half a unit either way
  // and only hide a card when it is clearly outside the range.
  function outsideDateRange(ageText, from, to, now) {
    const age = parseAge(ageText);
    if (!age) return false;
    const newest = now - (age.count - 0.5) * age.unit;
    const oldest = now - (age.count + 1.5) * age.unit;
    if (from && newest < Date.parse(from + 'T00:00:00')) return true;
    if (to && oldest > Date.parse(to + 'T23:59:59')) return true;
    return false;
  }

  // Lowercase and drop accents, so "navod" matches "Návod".
  function fold(s) {
    return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  }

  // "review* "full movie", trailer" -> matchers for: words starting with "review",
  // the phrase "full movie", and the whole word "trailer".
  function compileTerms(input) {
    const terms = [];
    const re = /"([^"]+)"|([^\s,"]+)/g;
    let m;
    while ((m = re.exec(String(input || '')))) {
      const raw = fold((m[1] || m[2]).trim());
      if (!raw || raw === '*') continue;
      const body = raw.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\p{L}\\p{N}]*');
      terms.push({ label: m[1] || m[2], re: new RegExp('(?<![\\p{L}\\p{N}])' + body + '(?![\\p{L}\\p{N}])', 'u') });
    }
    return terms;
  }

  // Number typed by the user: "10k", "1.5M", "1,000,000", "250" -> number, or null if empty/invalid.
  function parseUserCount(input) {
    const s = String(input || '').trim().replace(/\s+/g, '');
    if (!s) return null;
    const m = s.match(/^(\d+(?:[.,]\d+)?)([kmb])?$/i) || s.match(/^(\d{1,3}(?:,\d{3})+)$/);
    if (!m) return null;
    if (m[2]) return Math.round(parseFloat(m[1].replace(',', '.')) * { k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()]);
    return Number(m[1].replace(/,/g, ''));
  }

  function parseMinutes(input) {
    const n = parseFloat(String(input || '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function formatCount(n) {
    if (n >= 1e9) return +(n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return +(n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return +(n / 1e3).toFixed(1) + 'K';
    return String(n);
  }

  // Turns the user's filter settings into something cheap to run against every card.
  function compileFilters(filters, hide) {
    const f = filters || {};
    const h = hide || {};
    const custom = f.duration === 'custom';
    return {
      minSec: custom && parseMinutes(f.durationMin) ? parseMinutes(f.durationMin) * 60 : null,
      maxSec: custom && parseMinutes(f.durationMax) ? parseMinutes(f.durationMax) * 60 : null,
      minViews: parseUserCount(f.viewMin),
      maxViews: parseUserCount(f.viewMax),
      any: compileTerms(f.anyWords),
      all: compileTerms(f.allWords),
      none: compileTerms(f.noneWords),
      dateFrom: f.uploadDate === 'custom' ? f.dateFrom || '' : '',
      dateTo: f.uploadDate === 'custom' ? f.dateTo || '' : '',
      watched: !!h.watched,
      shorts: !!h.shorts,
      channels: (h.channels || []).map(c => fold(c).replace(/^@/, '')).filter(Boolean),
    };
  }

  function isActive(c) {
    return c.minSec != null || c.maxSec != null || c.minViews != null || c.maxViews != null ||
      c.any.length > 0 || c.all.length > 0 || c.none.length > 0 || !!c.dateFrom || !!c.dateTo ||
      c.watched || c.shorts || c.channels.length > 0;
  }

  // card: { title, channel, handle, views, seconds, age, watched, short, live, upcoming }
  // Returns why the card should be hidden, or null to keep it. Missing data never hides a card.
  function reasonToHide(card, c, now) {
    if (c.watched && card.watched > 0) return 'Watched';
    if (c.shorts && card.short) return 'Short';
    if (c.channels.length) {
      const name = fold(card.channel), handle = fold(card.handle).replace(/^@/, '');
      if (c.channels.some(x => x === name || (handle && x === handle))) return 'Hidden channel';
    }
    if (card.seconds != null) {
      if (c.minSec != null && card.seconds < c.minSec) return 'Too short';
      if (c.maxSec != null && card.seconds > c.maxSec) return 'Too long';
    }
    if (card.views != null) {
      if (c.minViews != null && card.views < c.minViews) return 'Under ' + formatCount(c.minViews) + ' views';
      if (c.maxViews != null && card.views > c.maxViews) return 'Over ' + formatCount(c.maxViews) + ' views';
    }
    if ((c.dateFrom || c.dateTo) && outsideDateRange(card.age, c.dateFrom, c.dateTo, now)) return 'Outside date range';
    if (c.any.length || c.all.length || c.none.length) {
      const title = fold(card.title);
      if (c.any.length && !c.any.some(t => t.re.test(title))) return 'Missing words';
      const missing = c.all.find(t => !t.re.test(title));
      if (missing) return 'Missing "' + missing.label + '"';
      const banned = c.none.find(t => t.re.test(title));
      if (banned) return 'Contains "' + banned.label + '"';
    }
    return null;
  }

  const api = {
    parseCount, parseLength, parseAge, outsideDateRange, fold, compileTerms, parseUserCount,
    parseMinutes, formatCount, compileFilters, isActive, reasonToHide,
  };
  root.YESF = root.YESF || {};
  root.YESF.match = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
