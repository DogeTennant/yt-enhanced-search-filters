// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const SP = require('../src/sp.js');

// Every link from YouTube's own Filters dialog (October 2026) must decode to the matching option.
const YOUTUBE_DIALOG = {
  'EgIQAQ==': { type: 'video' },
  'EgIQCQ==': { type: 'shorts' },
  'EgIQAg==': { type: 'channel' },
  'EgIQAw==': { type: 'playlist' },
  'EgIQBA==': { type: 'movie' },
  'EgIYBA==': { duration: 'short' },
  'EgIYBQ==': { duration: 'medium' },
  'EgIYAg==': { duration: 'long' },
  'EgIIAg==': { uploadDate: 'today' },
  'EgIIAw==': { uploadDate: 'week' },
  'EgIIBA==': { uploadDate: 'month' },
  'EgIIBQ==': { uploadDate: 'year' },
  'EgJAAQ==': { features: ['live'] },
  'EgJwAQ==': { features: ['4k'] },
  'EgIgAQ==': { features: ['hd'] },
  'EgIoAQ==': { features: ['subtitles'] },
  'EgIwAQ==': { features: ['cc'] },
  'EgJ4AQ==': { features: ['360'] },
  'EgPQAQE=': { features: ['vr180'] },
  'EgI4AQ==': { features: ['3d'] },
  'EgPIAQE=': { features: ['hdr'] },
  'EgO4AQE=': { features: ['location'] },
  'EgJIAQ==': { features: ['purchased'] },
  'CAM=': { sort: 'popularity' },
};

test('decodes every option of YouTube\'s Filters dialog', () => {
  for (const [sp, expected] of Object.entries(YOUTUBE_DIALOG)) {
    const state = SP.decode(sp);
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(state[key], value, sp);
    assert.deepEqual(state.extra, { outer: [], inner: [] }, sp);
  }
});

test('encodes every option exactly like YouTube does', () => {
  for (const [sp, expected] of Object.entries(YOUTUBE_DIALOG)) {
    assert.equal(SP.encode({ ...SP.emptyState(), ...expected }), sp);
  }
});

test('combines filters YouTube\'s dialog cannot combine', () => {
  const state = { sort: 'popularity', uploadDate: 'year', type: 'video', duration: 'long', features: ['4k', 'hdr'] };
  const sp = SP.encode(state);
  const back = SP.decode(sp);
  for (const key of Object.keys(state)) assert.deepEqual(back[key], state[key]);
});

test('no filters encode to an empty string', () => {
  assert.equal(SP.encode(SP.emptyState()), '');
  assert.equal(SP.encode({}), '');
});

test('keeps fields it does not know', () => {
  // Old "sort by upload date" (outer field 1 = 2) plus an unknown inner field 40 = 1, plus 4K.
  const sp = Buffer.from([0x08, 0x02, 0x12, 0x05, 0xc0, 0x02, 0x01, 0x70, 0x01]).toString('base64');
  const state = SP.decode(sp);
  assert.equal(state.sort, 'relevance');
  assert.deepEqual(state.features, ['4k']);
  state.features.push('hd');
  const again = SP.decode(SP.encode(state));
  assert.deepEqual(again.features.sort(), ['4k', 'hd']);
  assert.deepEqual(again.extra.inner, [{ field: 40, value: 1 }]);
  assert.deepEqual(again.extra.outer, [{ field: 1, value: 2 }]);
});

test('choosing a sort replaces an unknown sort value', () => {
  const state = SP.decode('CAI='); // old "upload date" sort
  state.sort = 'popularity';
  assert.equal(SP.encode(state), 'CAM=');
});

test('ignores garbage', () => {
  for (const bad of ['%%%', '////', 'EgI', 'Eg==', 'not base64!']) {
    assert.doesNotThrow(() => SP.decode(bad));
  }
  assert.equal(SP.decode('').sort, 'relevance');
});

test('reads URL-safe base64 without padding', () => {
  assert.deepEqual(SP.decode('EgPQAQE').features, ['vr180']);
});

test('reads the still-encoded value YouTube leaves in its URLs', () => {
  // The address bar shows sp=EgIYBQ%253D%253D, so URLSearchParams hands us "EgIYBQ%3D%3D".
  assert.equal(SP.decode('EgIYBQ%3D%3D').duration, 'medium');
  assert.equal(SP.decode('EgIYBQ%253D%253D').duration, 'medium');
});
