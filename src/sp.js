// Reads and writes YouTube's `sp` search parameter.
//
// `sp` is a base64-encoded protobuf message. Field 1 is the sort order; field 2 is a nested
// message holding the filters. The numbers below are the ones YouTube's own "Filters" dialog
// produces (checked October 2026). Fields we don't know are kept, so a filter picked in
// YouTube's dialog survives when the user changes something in ours.
(function (root) {
  'use strict';

  const SORT = { popularity: 3 };
  const UPLOAD_DATE = { today: 2, week: 3, month: 4, year: 5 };
  const TYPE = { video: 1, channel: 2, playlist: 3, movie: 4, shorts: 9 };
  const DURATION = { short: 4, medium: 5, long: 2 }; // under 3 min, 3-20 min, over 20 min
  const FEATURE = {
    live: 8, '4k': 14, hd: 4, subtitles: 5, cc: 6, '360': 15,
    vr180: 26, '3d': 7, hdr: 25, location: 23, purchased: 9,
  };

  const invert = map => Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
  const SORT_BY_CODE = invert(SORT);
  const DATE_BY_CODE = invert(UPLOAD_DATE);
  const TYPE_BY_CODE = invert(TYPE);
  const DURATION_BY_CODE = invert(DURATION);
  const FEATURE_BY_FIELD = invert(FEATURE);

  function encodeVarint(n) {
    const bytes = [];
    do {
      let b = n % 128;
      n = Math.floor(n / 128);
      if (n > 0) b |= 0x80;
      bytes.push(b);
    } while (n > 0);
    return bytes;
  }

  function encodeField(field, value) {
    if (Array.isArray(value)) return [...encodeVarint((field << 3) | 2), ...encodeVarint(value.length), ...value];
    return [...encodeVarint(field << 3), ...encodeVarint(value)];
  }

  // Returns [{ field, value }] where value is a number (varint) or a byte array (length-delimited),
  // or null if the bytes aren't a message we can read.
  function parseMessage(bytes) {
    const fields = [];
    let pos = 0;
    const varint = () => {
      let result = 0, scale = 1, b;
      do {
        if (pos >= bytes.length) throw new Error('truncated');
        b = bytes[pos++];
        result += (b & 0x7f) * scale;
        scale *= 128;
      } while (b & 0x80);
      return result;
    };
    try {
      while (pos < bytes.length) {
        const tag = varint();
        const field = Math.floor(tag / 8), wire = tag % 8;
        if (wire === 0) {
          fields.push({ field, value: varint() });
        } else if (wire === 2) {
          const len = varint();
          if (pos + len > bytes.length) return null;
          fields.push({ field, value: Array.from(bytes.slice(pos, pos + len)) });
          pos += len;
        } else {
          return null;
        }
      }
    } catch (e) {
      return null;
    }
    return fields;
  }

  function fromBase64(str) {
    let s = String(str).trim();
    // YouTube's own links encode `sp` twice ("EgIYBQ%253D%253D"), so a URL can still hold "%3D".
    for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(s); i++) {
      try { s = decodeURIComponent(s); } catch (e) { break; }
    }
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    return Array.from(bin, c => c.charCodeAt(0));
  }

  function toBase64(bytes) {
    return btoa(String.fromCharCode(...bytes));
  }

  function emptyState() {
    return { sort: 'relevance', uploadDate: null, type: null, duration: null, features: [], extra: { outer: [], inner: [] } };
  }

  // sp string -> { sort, uploadDate, type, duration, features, extra }
  function decode(sp) {
    const state = emptyState();
    if (!sp) return state;
    let outer;
    try { outer = parseMessage(fromBase64(sp)); } catch (e) { outer = null; }
    if (!outer) return state;

    for (const f of outer) {
      if (f.field === 1 && typeof f.value === 'number' && SORT_BY_CODE[f.value]) {
        state.sort = SORT_BY_CODE[f.value];
      } else if (f.field === 2 && Array.isArray(f.value)) {
        const inner = parseMessage(f.value);
        if (!inner) { state.extra.outer.push(f); continue; }
        for (const g of inner) {
          const n = g.value;
          if (g.field === 1 && DATE_BY_CODE[n]) state.uploadDate = DATE_BY_CODE[n];
          else if (g.field === 2 && TYPE_BY_CODE[n]) state.type = TYPE_BY_CODE[n];
          else if (g.field === 3 && DURATION_BY_CODE[n]) state.duration = DURATION_BY_CODE[n];
          else if (n === 1 && FEATURE_BY_FIELD[g.field]) state.features.push(FEATURE_BY_FIELD[g.field]);
          else state.extra.inner.push(g);
        }
      } else {
        state.extra.outer.push(f);
      }
    }
    return state;
  }

  // { sort, uploadDate, type, duration, features, extra } -> sp string ('' when nothing is set)
  function encode(state) {
    const s = { ...emptyState(), ...state };
    const extra = s.extra || { outer: [], inner: [] };
    const ours = new Set();
    const inner = [];

    if (UPLOAD_DATE[s.uploadDate]) { inner.push(...encodeField(1, UPLOAD_DATE[s.uploadDate])); ours.add(1); }
    if (TYPE[s.type]) { inner.push(...encodeField(2, TYPE[s.type])); ours.add(2); }
    if (DURATION[s.duration]) { inner.push(...encodeField(3, DURATION[s.duration])); ours.add(3); }
    for (const feat of s.features || []) {
      if (FEATURE[feat] && !ours.has(FEATURE[feat])) { inner.push(...encodeField(FEATURE[feat], 1)); ours.add(FEATURE[feat]); }
    }
    for (const g of extra.inner || []) {
      if (!ours.has(g.field)) inner.push(...encodeField(g.field, g.value));
    }

    const outer = [];
    if (SORT[s.sort]) outer.push(...encodeField(1, SORT[s.sort]));
    if (inner.length) outer.push(...encodeField(2, inner));
    for (const f of extra.outer || []) {
      if (f.field !== 1 || !SORT[s.sort]) outer.push(...encodeField(f.field, f.value));
    }
    return outer.length ? toBase64(outer) : '';
  }

  const api = { decode, encode, emptyState, SORT, UPLOAD_DATE, TYPE, DURATION, FEATURE };
  root.YESF = root.YESF || {};
  root.YESF.sp = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
