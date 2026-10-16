// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/match.js');

test('parseCount reads full and abbreviated counts', () => {
  assert.equal(M.parseCount('1,194,065 views'), 1194065);
  assert.equal(M.parseCount('1 194 065 zhlédnutí'), 1194065);
  assert.equal(M.parseCount('1.1M'), 1100000);
  assert.equal(M.parseCount('12K views'), 12000);
  assert.equal(M.parseCount('2.5B'), 2500000000);
  assert.equal(M.parseCount('No views'), 0);
  assert.equal(M.parseCount(''), null);
  assert.equal(M.parseCount(null), null);
});

test('parseLength reads m:ss and h:mm:ss', () => {
  assert.equal(M.parseLength('25:33'), 1533);
  assert.equal(M.parseLength('1:09:56'), 4196);
  assert.equal(M.parseLength('0:37'), 37);
  assert.equal(M.parseLength('LIVE'), null);
  assert.equal(M.parseLength('12'), null);
  assert.equal(M.parseLength(''), null);
});

test('parseAge reads short and long English ages', () => {
  const DAY = 86400000;
  assert.deepEqual(M.parseAge('2y ago'), { count: 2, unit: 365.25 * DAY });
  assert.deepEqual(M.parseAge('3 weeks ago'), { count: 3, unit: 7 * DAY });
  assert.deepEqual(M.parseAge('Streamed 5 months ago'), { count: 5, unit: 30.44 * DAY });
  assert.deepEqual(M.parseAge('2mo ago'), { count: 2, unit: 30.44 * DAY });
  assert.deepEqual(M.parseAge('17h ago'), { count: 17, unit: 3600000 });
  assert.deepEqual(M.parseAge('5m ago'), { count: 5, unit: 60000 });
  assert.equal(M.parseAge('před 2 lety'), null);
  assert.equal(M.parseAge(''), null);
});

test('outsideDateRange only hides clear misses', () => {
  const now = Date.parse('2026-10-16T12:00:00');
  // after:2026-10-01 - the junk YouTube returned in testing
  assert.equal(M.outsideDateRange('14y ago', '2026-10-01', '', now), true);
  assert.equal(M.outsideDateRange('3w ago', '2026-10-01', '', now), true);
  assert.equal(M.outsideDateRange('2w ago', '2026-10-01', '', now), false);
  assert.equal(M.outsideDateRange('5d ago', '2026-10-01', '', now), false);
  // before:2015-01-01
  assert.equal(M.outsideDateRange('11y ago', '', '2015-01-01', now), false);
  assert.equal(M.outsideDateRange('2y ago', '', '2015-01-01', now), true);
  // unreadable ages are never hidden
  assert.equal(M.outsideDateRange('před 2 lety', '2026-10-01', '', now), false);
});

test('compileTerms matches whole words, phrases, wildcards and ignores accents', () => {
  const hit = (terms, text) => M.compileTerms(terms).some(t => t.re.test(M.fold(text)));
  assert.equal(hit('ad', 'How I made this'), false);
  assert.equal(hit('ad', 'Skip the ad, please'), true);
  assert.equal(hit('review', 'Phone reviews 2026'), false);
  assert.equal(hit('review*', 'Phone reviews 2026'), true);
  assert.equal(hit('"full movie"', 'The Matrix FULL MOVIE'), true);
  assert.equal(hit('"full movie"', 'full length movie'), false);
  assert.equal(hit('navod', 'Minecraft návod'), true);
  assert.equal(hit('1.21', 'Minecraft 1.21 update'), true);
  assert.equal(hit('c++', 'Learn C++ fast'), true);
  assert.deepEqual(M.compileTerms('a, b  "c d"').map(t => t.label), ['a', 'b', 'c d']);
  assert.deepEqual(M.compileTerms('  *  '), []);
});

test('parseUserCount accepts K/M/B and thousands separators', () => {
  assert.equal(M.parseUserCount('10k'), 10000);
  assert.equal(M.parseUserCount('1.5M'), 1500000);
  assert.equal(M.parseUserCount('1,5m'), 1500000);
  assert.equal(M.parseUserCount('1,000,000'), 1000000);
  assert.equal(M.parseUserCount('1 000'), 1000);
  assert.equal(M.parseUserCount('250'), 250);
  assert.equal(M.parseUserCount(''), null);
  assert.equal(M.parseUserCount('lots'), null);
});

const card = over => ({
  title: 'Ultimate Guide To Redstone', channel: 'ibxtoycat', handle: '@toycat',
  views: 1194065, seconds: 1533, age: '2y ago', watched: 0, short: false, ...over,
});
const now = Date.parse('2026-10-16T12:00:00');
const reason = (filters, hide, c) => M.reasonToHide(c || card(), M.compileFilters(filters, hide), now);

test('reasonToHide: length only counts with a custom range', () => {
  assert.equal(reason({ duration: 'custom', durationMin: '30' }), 'Too short');
  assert.equal(reason({ duration: 'custom', durationMax: '20' }), 'Too long');
  assert.equal(reason({ duration: 'custom', durationMin: '20', durationMax: '30' }), null);
  assert.equal(reason({ duration: 'long', durationMin: '30' }), null);
});

test('reasonToHide: views', () => {
  assert.equal(reason({ viewMin: '2M' }), 'Under 2M views');
  assert.equal(reason({ viewMax: '1m' }), 'Over 1M views');
  assert.equal(reason({ viewMin: '1M', viewMax: '2M' }), null);
  assert.equal(reason({ viewMin: '2M' }, {}, card({ views: null })), null);
});

test('reasonToHide: title words', () => {
  assert.equal(reason({ anyWords: 'tutorial, guide' }), null);
  assert.equal(reason({ anyWords: 'tutorial' }), 'Missing words');
  assert.equal(reason({ allWords: 'redstone guide' }), null);
  assert.equal(reason({ allWords: 'redstone tutorial' }), 'Missing "tutorial"');
  assert.equal(reason({ noneWords: 'Ultimate' }), 'Contains "Ultimate"');
});

test('reasonToHide: hide settings', () => {
  assert.equal(reason({}, { watched: true }, card({ watched: 40 })), 'Watched');
  assert.equal(reason({}, { shorts: true }, card({ short: true })), 'Short');
  assert.equal(reason({}, { channels: ['IBXTOYCAT'] }), 'Hidden channel');
  assert.equal(reason({}, { channels: ['@toycat'] }), 'Hidden channel');
  assert.equal(reason({}, { channels: ['toycat'] }), 'Hidden channel');
  assert.equal(reason({}, { channels: ['someone else'] }), null);
});

test('reasonToHide: custom date range uses the card age', () => {
  assert.equal(reason({ uploadDate: 'custom', dateFrom: '2026-01-01' }), 'Outside date range');
  assert.equal(reason({ uploadDate: 'custom', dateFrom: '2020-01-01' }), null);
  assert.equal(reason({ uploadDate: 'week', dateFrom: '2026-01-01' }), null);
});

test('isActive is false for default filters', () => {
  assert.equal(M.isActive(M.compileFilters({}, {})), false);
  assert.equal(M.isActive(M.compileFilters({ viewMin: '5' }, {})), true);
  assert.equal(M.isActive(M.compileFilters({}, { watched: true })), true);
});
