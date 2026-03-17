// ============================================================
// YouTube Enhanced Search Filters - content.js
// ============================================================

(function () {
  'use strict';

  // ── FILTER STATE ────────────────────────────────────────
  let filters = {
    sort: 'relevance',
    uploadDate: null,
    type: null,
    duration: null,
    features: [],
    durationMin: '',
    durationMax: '',
    viewMin: '',
    viewMax: '',
    dateFrom: '',
    dateTo: '',
    hideWatched: false,
    includeWords: '',
    includeAllWords: '',
    excludeWords: '',
    hideSponsored: false,
    hideMovies: false,
    hideSections: false,
    hideShorts: false,
  };

  // ── STORAGE ──────────────────────────────────────────────
  function saveFilters() {
    localStorage.setItem('yesf', JSON.stringify(filters));
  }

  function loadFilters() {
    try {
      const saved = localStorage.getItem('yesf');
      if (saved) {
        const parsed = JSON.parse(saved);
        filters = { ...filters, ...parsed };
      }
      if (!Array.isArray(filters.features)) filters.features = [];
    } catch (e) {}
  }

  // ── PRESETS ───────────────────────────────────────────────
  function loadPresets() {
    try {
      const saved = localStorage.getItem('yesf-presets');
      return saved ? JSON.parse(saved) : {};
    } catch (e) { return {}; }
  }

  function savePreset(name) {
    const presets = loadPresets();
    presets[name] = { ...filters };
    localStorage.setItem('yesf-presets', JSON.stringify(presets));
  }

  function deletePreset(name) {
    const presets = loadPresets();
    delete presets[name];
    localStorage.setItem('yesf-presets', JSON.stringify(presets));
  }

  function applyPreset(name) {
    const presets = loadPresets();
    if (!presets[name]) return;
    filters = { ...filters, ...presets[name] };
    if (!Array.isArray(filters.features)) filters.features = [];
    const panel = document.getElementById('yesf-panel');
    if (panel) updateUI(panel);
    updateBtnLabel();
    updatePresetsUI();
  }

  function updatePresetsUI() {
    const list = document.getElementById('yesf-presets-list');
    if (!list) return;
    const presets = loadPresets();
    const names = Object.keys(presets);
    if (names.length === 0) {
      list.innerHTML = '<span class="yesf-no-presets">No saved presets yet</span>';
      return;
    }
    list.innerHTML = '';
    names.forEach(name => {
      const row = document.createElement('div');
      row.className = 'yesf-preset-row';
      row.innerHTML = `
        <button class="chip yesf-preset-load">${name}</button>
        <button class="yesf-preset-update" title="Overwrite with current filters">💾</button>
        <button class="yesf-preset-delete" title="Delete preset">✕</button>
      `;
      row.querySelector('.yesf-preset-load').addEventListener('click', () => applyPreset(name));
      row.querySelector('.yesf-preset-update').addEventListener('click', () => {
        savePreset(name);
        // Flash the button briefly to confirm
        const btn = row.querySelector('.yesf-preset-update');
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = '💾'; }, 1000);
      });
      row.querySelector('.yesf-preset-delete').addEventListener('click', () => {
        deletePreset(name);
        updatePresetsUI();
      });
      list.appendChild(row);
    });
  }

  // ── ACTIVE FILTER COUNT ───────────────────────────────────
  function countActiveFilters() {
    let count = 0;
    if (filters.sort !== 'relevance') count++;
    if (filters.uploadDate) count++;
    if (filters.type) count++;
    if (filters.duration) count++;
    if (filters.features.length > 0) count++;
    if (filters.durationMin) count++;
    if (filters.durationMax) count++;
    if (filters.viewMin) count++;
    if (filters.viewMax) count++;
    if (filters.dateFrom) count++;
    if (filters.dateTo) count++;
    if (filters.hideWatched) count++;
    if (filters.includeWords) count++;
    if (filters.includeAllWords) count++;
    if (filters.excludeWords) count++;
    if (filters.hideSponsored) count++;
    if (filters.hideMovies) count++;
    if (filters.hideSections) count++;
    if (filters.hideShorts) count++;
    return count;
  }

  function updateBtnLabel() {
    const btn = document.getElementById('yesf-btn');
    if (!btn) return;
    const count = countActiveFilters();
    btn.innerHTML = count > 0
      ? `⚡ Filters <span id="yesf-count-badge">${count}</span>`
      : '⚡ Filters';
  }

  // ── PROTOBUF ENCODER ─────────────────────────────────────
  function encodeVarint(n) {
    const bytes = [];
    do {
      let b = n & 0x7f;
      n >>>= 7;
      if (n > 0) b |= 0x80;
      bytes.push(b);
    } while (n > 0);
    return bytes;
  }

  function encodeField(fieldNum, value, isBytes) {
    const tag = encodeVarint((fieldNum << 3) | (isBytes ? 2 : 0));
    if (isBytes) return [...tag, ...encodeVarint(value.length), ...value];
    return [...tag, ...encodeVarint(value)];
  }

  function buildSP() {
    const inner = [];
    const dateMap    = { today: 1, week: 2, month: 3, year: 4 };
    const typeMap    = { video: 1, channel: 2, playlist: 3, movie: 4 };
    const durMap     = { short: 1, medium: 2, long: 3 };
    const featureMap = { hd: 4, subtitles: 5, cc: 6, live: 8, purchased: 9, '4k': 14, '360': 15, vr180: 17, '3d': 18, hdr: 19 };

    if (filters.uploadDate && dateMap[filters.uploadDate])
      inner.push(...encodeField(1, dateMap[filters.uploadDate], false));
    if (filters.type && typeMap[filters.type])
      inner.push(...encodeField(2, typeMap[filters.type], false));
    if (filters.duration && durMap[filters.duration])
      inner.push(...encodeField(3, durMap[filters.duration], false));
    for (const feat of filters.features) {
      if (featureMap[feat] !== undefined)
        inner.push(...encodeField(featureMap[feat], 1, false));
    }

    const outer = [];
    const sortMap = { date: 2, views: 3, rating: 4 };
    if (filters.sort !== 'relevance' && sortMap[filters.sort])
      outer.push(...encodeField(1, sortMap[filters.sort], false));
    if (inner.length > 0)
      outer.push(...encodeField(2, inner, true));

    if (outer.length === 0) return '';
    return btoa(String.fromCharCode(...outer));
  }

  // ── CLIENT-SIDE FILTERING HELPERS ────────────────────────
  function parseViews(str) {
    if (!str) return null;
    str = str.replace(/,/g, '').replace(/views?/i, '').trim();
    if (/M/i.test(str)) return parseFloat(str) * 1e6;
    if (/K/i.test(str)) return parseFloat(str) * 1e3;
    const n = parseFloat(str);
    return isNaN(n) ? null : n;
  }

  function parseDuration(str) {
    if (!str) return null;
    const parts = str.trim().split(':').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 2) return parts[0] + parts[1] / 60;
    if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
    return null;
  }

  function parseUploadDate(str) {
    if (!str) return null;
    if (/just now|moments ago/i.test(str)) return new Date();
    const m = str.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
    if (!m) return null;
    const n = parseInt(m[1]);
    const d = new Date();
    switch (m[2].toLowerCase()) {
      case 'second': d.setSeconds(d.getSeconds() - n); break;
      case 'minute': d.setMinutes(d.getMinutes() - n); break;
      case 'hour':   d.setHours(d.getHours() - n); break;
      case 'day':    d.setDate(d.getDate() - n); break;
      case 'week':   d.setDate(d.getDate() - n * 7); break;
      case 'month':  d.setMonth(d.getMonth() - n); break;
      case 'year':   d.setFullYear(d.getFullYear() - n); break;
    }
    return d;
  }

  function splitWords(str) {
    if (!str) return [];
    return str.split(/[\s,]+/).map(s => s.toLowerCase().trim()).filter(Boolean);
  }

  // ── CLIENT-SIDE FILTERING ─────────────────────────────────
  function applyClientFilters() {
    // CSS injection - hides elements the instant YouTube creates them
    let styleEl = document.getElementById('yesf-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'yesf-style';
      document.head.appendChild(styleEl);
    }

    const rules = [];
    if (filters.hideSponsored) {
      rules.push('ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer { display: none !important; }');
    }
    if (filters.hideMovies) {
      rules.push('ytd-movie-renderer { display: none !important; }');
    }
    if (filters.hideShorts) {
      rules.push('ytd-reel-shelf-renderer { display: none !important; }');
      rules.push('ytd-rich-shelf-renderer { display: none !important; }');
      rules.push('grid-shelf-view-model { display: none !important; }');
    }
    if (filters.hideSections) {
      rules.push('ytd-shelf-renderer { display: none !important; }');
      rules.push('ytd-horizontal-card-list-renderer { display: none !important; }');
      rules.push('ytd-vertical-list-renderer { display: none !important; }');
    }
    styleEl.textContent = rules.join('\n');

    const cards = document.querySelectorAll('ytd-video-renderer');
    if (!cards.length) return;

    const dMin     = parseFloat(filters.durationMin);
    const dMax     = parseFloat(filters.durationMax);
    const vMin     = parseFloat(filters.viewMin);
    const vMax     = parseFloat(filters.viewMax);
    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const dateTo   = filters.dateTo   ? new Date(filters.dateTo + 'T23:59:59') : null;
    const inc      = splitWords(filters.includeWords);
    const exc      = splitWords(filters.excludeWords);

    let shown = 0;
    const total = cards.length;

    cards.forEach(card => {
      let hide = false;

      const titleEl    = card.querySelector('#video-title');
      const durEl      = card.querySelector('ytd-thumbnail-overlay-time-status-renderer #text');
      const metaEls    = card.querySelectorAll('#metadata-line span, #metadata-line yt-formatted-string');
      const progressEl = card.querySelector('ytd-thumbnail-overlay-resume-playback-renderer');

      const title    = titleEl ? titleEl.textContent.toLowerCase() : '';
      const duration = parseDuration(durEl ? durEl.textContent : null);

      let views = null, uploadDateStr = null;
      metaEls.forEach(el => {
        const t = el.textContent.trim();
        if (/view/i.test(t)) views = parseViews(t);
        if (/ago/i.test(t)) uploadDateStr = t;
      });

      if (!hide && filters.hideWatched && progressEl) hide = true;

      if (!hide && duration !== null) {
        if (!isNaN(dMin) && dMin > 0 && duration < dMin) hide = true;
        if (!hide && !isNaN(dMax) && dMax > 0 && duration > dMax) hide = true;
      }

      if (!hide && views !== null) {
        if (!isNaN(vMin) && vMin > 0 && views < vMin) hide = true;
        if (!hide && !isNaN(vMax) && vMax > 0 && views > vMax) hide = true;
      }

      if (!hide && uploadDateStr) {
        const uploaded = parseUploadDate(uploadDateStr);
        if (uploaded) {
          if (dateFrom && uploaded < dateFrom) hide = true;
          if (!hide && dateTo && uploaded > dateTo) hide = true;
        }
      }

      if (!hide && inc.length > 0 && !inc.some(w => title.includes(w))) hide = true;

      const incAll = splitWords(filters.includeAllWords);
      if (!hide && incAll.length > 0 && !incAll.every(w => title.includes(w))) hide = true;

      if (!hide && exc.length > 0 && exc.some(w => title.includes(w))) hide = true;

      if (!hide && filters.hideShorts) {
        const link = card.querySelector('a#video-title');
        const shortsBadge = card.querySelector('.ytd-badge-supported-renderer, ytd-badge-supported-renderer');
        const isShortURL = link && link.href && link.href.includes('/shorts/');
        const isShortBadge = shortsBadge && shortsBadge.textContent.toLowerCase().includes('short');
        if (isShortURL || isShortBadge) hide = true;
      }

      if (!hide && filters.hideSponsored) {
        const channelText = card.querySelector('#channel-name')?.textContent || '';
        if (channelText.toLowerCase().includes('sponsored')) hide = true;
      }

      card.style.display = hide ? 'none' : '';
      if (!hide) shown++;
    });

    // Results counter
    let counter = document.getElementById('yesf-counter');
    if (!counter) {
      counter = document.createElement('div');
      counter.id = 'yesf-counter';
      const anchor = document.querySelector('ytd-search #contents, ytd-item-section-renderer');
      if (anchor) anchor.parentNode.insertBefore(counter, anchor);
    }
    const active = countActiveFilters();
    counter.style.display = active > 0 ? 'block' : 'none';
    counter.textContent = `⚡ Showing ${shown} of ${total} video results`;
  }

  // ── APPLY / RESET ─────────────────────────────────────────
  function applyFilters() {
    saveFilters();
    updateBtnLabel();
    const sp = buildSP();
    const url = new URL(window.location.href);
    const currentSP = url.searchParams.get('sp') || '';

    if (sp !== currentSP) {
      if (sp) url.searchParams.set('sp', sp);
      else url.searchParams.delete('sp');
      window.location.href = url.toString();
    } else {
      applyClientFilters();
    }
  }

  function resetFilters() {
    filters = {
      sort: 'relevance', uploadDate: null, type: null, duration: null, features: [],
      durationMin: '', durationMax: '', viewMin: '', viewMax: '',
      dateFrom: '', dateTo: '', hideWatched: false, includeWords: '', includeAllWords: '', excludeWords: '',
      hideSponsored: false, hideMovies: false, hideSections: false, hideShorts: false,
    };
    localStorage.removeItem('yesf');
    updateBtnLabel();
    const url = new URL(window.location.href);
    url.searchParams.delete('sp');
    window.location.href = url.toString();
  }

  // ── UI ────────────────────────────────────────────────────
  function injectUI() {
    if (document.getElementById('yesf-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'yesf-btn';
    btn.innerHTML = '⚡ Filters';
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'yesf-panel';
    panel.innerHTML = `
      <div id="yesf-header">
        <span>⚡ Enhanced Filters</span>
        <button id="yesf-x">✕</button>
      </div>
      <div id="yesf-content">

        <div class="yesf-group">
          <div class="yesf-label">Sort by</div>
          <div class="yesf-chips">
            <button class="chip solo" data-f="sort" data-v="relevance">Relevance</button>
            <button class="chip solo" data-f="sort" data-v="date">Upload date</button>
            <button class="chip solo" data-f="sort" data-v="views">View count</button>
            <button class="chip solo" data-f="sort" data-v="rating">Rating</button>
          </div>
        </div>

        <div class="yesf-group">
          <div class="yesf-label">Upload date</div>
          <div class="yesf-chips">
            <button class="chip solo" data-f="uploadDate" data-v="today">Today</button>
            <button class="chip solo" data-f="uploadDate" data-v="week">This week</button>
            <button class="chip solo" data-f="uploadDate" data-v="month">This month</button>
            <button class="chip solo" data-f="uploadDate" data-v="year">This year</button>
          </div>
        </div>

        <div class="yesf-group">
          <div class="yesf-label">Custom date range</div>
          <div class="yesf-row">
            <label>From <input type="date" id="yesf-date-from"></label>
            <label>To <input type="date" id="yesf-date-to"></label>
          </div>
        </div>

        <div class="yesf-group">
          <div class="yesf-label">Type</div>
          <div class="yesf-chips">
            <button class="chip solo" data-f="type" data-v="video">Video</button>
            <button class="chip solo" data-f="type" data-v="channel">Channel</button>
            <button class="chip solo" data-f="type" data-v="playlist">Playlist</button>
            <button class="chip solo" data-f="type" data-v="movie">Movie</button>
          </div>
        </div>

        <div class="yesf-group">
          <div class="yesf-label">Duration</div>
          <div class="yesf-chips">
            <button class="chip solo" data-f="duration" data-v="short">Under 4 min</button>
            <button class="chip solo" data-f="duration" data-v="medium">4-20 min</button>
            <button class="chip solo" data-f="duration" data-v="long">Over 20 min</button>
          </div>
        </div>

        <div class="yesf-group">
          <div class="yesf-label">Custom duration (minutes)</div>
          <div class="yesf-row">
            <label>Min <input type="number" id="yesf-dur-min" placeholder="e.g. 5" min="0"></label>
            <label>Max <input type="number" id="yesf-dur-max" placeholder="e.g. 30" min="0"></label>
          </div>
        </div>

        <div class="yesf-group">
          <div class="yesf-label">View count</div>
          <div class="yesf-row">
            <label>Min <input type="number" id="yesf-view-min" placeholder="e.g. 1000" min="0"></label>
            <label>Max <input type="number" id="yesf-view-max" placeholder="e.g. 1000000" min="0"></label>
          </div>
        </div>

        <div class="yesf-group">
          <div class="yesf-label">Features</div>
          <div class="yesf-chips">
            <button class="chip multi" data-f="features" data-v="live">🔴 Live</button>
            <button class="chip multi" data-f="features" data-v="4k">4K</button>
            <button class="chip multi" data-f="features" data-v="hd">HD</button>
            <button class="chip multi" data-f="features" data-v="subtitles">Subtitles</button>
            <button class="chip multi" data-f="features" data-v="cc">Creative Commons</button>
            <button class="chip multi" data-f="features" data-v="360">360°</button>
            <button class="chip multi" data-f="features" data-v="vr180">VR180</button>
            <button class="chip multi" data-f="features" data-v="3d">3D</button>
            <button class="chip multi" data-f="features" data-v="hdr">HDR</button>
          </div>
        </div>

        <div class="yesf-group">
          <div class="yesf-label">Watched</div>
          <div class="yesf-chips">
            <button class="chip" id="yesf-hide-watched">Hide watched videos</button>
          </div>
        </div>

        <div class="yesf-group">
          <div class="yesf-label">Must include (any of these words)</div>
          <input type="text" id="yesf-include" placeholder="e.g. review, tutorial">
        </div>

        <div class="yesf-group">
          <div class="yesf-label">Must include (ALL of these words)</div>
          <input type="text" id="yesf-include-all" placeholder="e.g. official, full">
        </div>

        <div class="yesf-group">
          <div class="yesf-label">Must exclude (any of these words)</div>
          <input type="text" id="yesf-exclude" placeholder="e.g. ad, sponsored">
        </div>

        <div class="yesf-group">
          <div class="yesf-label">Hide clutter</div>
          <div class="yesf-chips">
            <button class="chip" id="yesf-hide-sponsored">🚫 Sponsored</button>
            <button class="chip" id="yesf-hide-movies">🎬 Movies</button>
            <button class="chip" id="yesf-hide-sections">📦 Irrelevant Sections</button>
            <button class="chip" id="yesf-hide-shorts">⚡ Shorts</button>
          </div>
        </div>

        <div class="yesf-group">
          <div class="yesf-label">Presets</div>
          <div class="yesf-row">
            <input type="text" id="yesf-preset-name" placeholder="Preset name...">
            <button id="yesf-preset-save">💾 Save</button>
          </div>
          <div id="yesf-presets-list"></div>
        </div>

        <div id="yesf-footer">
          <button id="yesf-apply">✅ Apply</button>
          <button id="yesf-reset">🔄 Reset all</button>
        </div>

      </div>
    `;
    document.body.appendChild(panel);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('open');
    });
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.querySelector('#yesf-x').addEventListener('click', () => panel.classList.remove('open'));

    document.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      panel.classList.remove('open');
    });

    // Keyboard shortcut: Alt+F
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.key === 'f') {
        e.preventDefault();
        panel.classList.toggle('open');
      }
    });

    panel.querySelectorAll('.chip.solo').forEach(chip => {
      chip.addEventListener('click', () => {
        const field = chip.dataset.f;
        const value = chip.dataset.v;
        const wasActive = chip.classList.contains('active');
        panel.querySelectorAll(`.chip[data-f="${field}"]`).forEach(c => c.classList.remove('active'));
        if (!wasActive) {
          chip.classList.add('active');
          filters[field] = value;
        } else {
          filters[field] = field === 'sort' ? 'relevance' : null;
        }
      });
    });

    panel.querySelectorAll('.chip.multi').forEach(chip => {
      chip.addEventListener('click', () => {
        const value = chip.dataset.v;
        if (filters.features.includes(value)) {
          filters.features = filters.features.filter(f => f !== value);
          chip.classList.remove('active');
        } else {
          filters.features.push(value);
          chip.classList.add('active');
        }
      });
    });

    const hwBtn = panel.querySelector('#yesf-hide-watched');
    hwBtn.addEventListener('click', () => {
      filters.hideWatched = !filters.hideWatched;
      hwBtn.classList.toggle('active', filters.hideWatched);
    });

    const bind = (id, key) => {
      const el = panel.querySelector(id);
      if (el) el.addEventListener('input', e => { filters[key] = e.target.value; });
    };
    const bindDate = (id, key) => {
      const el = panel.querySelector(id);
      if (el) el.addEventListener('change', e => { filters[key] = e.target.value; });
    };
    bind('#yesf-dur-min',     'durationMin');
    bind('#yesf-dur-max',     'durationMax');
    bind('#yesf-view-min',    'viewMin');
    bind('#yesf-view-max',    'viewMax');
    bind('#yesf-include',     'includeWords');
    bind('#yesf-include-all', 'includeAllWords');
    bind('#yesf-exclude',     'excludeWords');
    bindDate('#yesf-date-from', 'dateFrom');
    bindDate('#yesf-date-to',   'dateTo');

    const toggleBtn = (id, key) => {
      const el = panel.querySelector(id);
      if (el) el.addEventListener('click', () => {
        filters[key] = !filters[key];
        el.classList.toggle('active', filters[key]);
      });
    };
    toggleBtn('#yesf-hide-sponsored', 'hideSponsored');
    toggleBtn('#yesf-hide-movies',    'hideMovies');
    toggleBtn('#yesf-hide-sections',  'hideSections');
    toggleBtn('#yesf-hide-shorts',    'hideShorts');

    // Presets
    panel.querySelector('#yesf-preset-save').addEventListener('click', () => {
      const nameEl = panel.querySelector('#yesf-preset-name');
      const name = nameEl.value.trim();
      if (!name) return;
      savePreset(name);
      nameEl.value = '';
      updatePresetsUI();
    });

    panel.querySelector('#yesf-apply').addEventListener('click', applyFilters);
    panel.querySelector('#yesf-reset').addEventListener('click', resetFilters);

    updateUI(panel);
    updateBtnLabel();
    updatePresetsUI();
  }

  function updateUI(panel) {
    panel.querySelectorAll('.chip.solo').forEach(chip => {
      chip.classList.toggle('active', filters[chip.dataset.f] === chip.dataset.v);
    });
    panel.querySelectorAll('.chip.multi').forEach(chip => {
      chip.classList.toggle('active', filters.features.includes(chip.dataset.v));
    });
    const hw = panel.querySelector('#yesf-hide-watched');
    if (hw) hw.classList.toggle('active', filters.hideWatched);

    const set = (id, val) => { const el = panel.querySelector(id); if (el) el.value = val || ''; };
    set('#yesf-dur-min',     filters.durationMin);
    set('#yesf-dur-max',     filters.durationMax);
    set('#yesf-view-min',    filters.viewMin);
    set('#yesf-view-max',    filters.viewMax);
    set('#yesf-date-from',   filters.dateFrom);
    set('#yesf-date-to',     filters.dateTo);
    set('#yesf-include',     filters.includeWords);
    set('#yesf-include-all', filters.includeAllWords);
    set('#yesf-exclude',     filters.excludeWords);

    const syncBtn = (id, val) => { const el = panel.querySelector(id); if (el) el.classList.toggle('active', val); };
    syncBtn('#yesf-hide-sponsored', filters.hideSponsored);
    syncBtn('#yesf-hide-movies',    filters.hideMovies);
    syncBtn('#yesf-hide-sections',  filters.hideSections);
    syncBtn('#yesf-hide-shorts',    filters.hideShorts);
  }

  // ── PAGE DETECTION ────────────────────────────────────────
  let lastUrl = '';
  let filterTimer = null;

  function onPageChange() {
    const url = window.location.href;
    if (url === lastUrl) return;
    lastUrl = url;

    if (window.location.pathname === '/results') {
      document.body.classList.add('yesf-search');
      loadFilters();
      setTimeout(() => {
        injectUI();
        updateBtnLabel();
        setTimeout(applyClientFilters, 2000);
      }, 800);
    } else {
      document.body.classList.remove('yesf-search');
      document.getElementById('yesf-btn')?.remove();
      document.getElementById('yesf-panel')?.remove();
      document.getElementById('yesf-counter')?.remove();
    }
  }

  const observer = new MutationObserver(() => {
    onPageChange();
    if (window.location.pathname === '/results' && document.getElementById('yesf-panel')) {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(applyClientFilters, 400);
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  onPageChange();

})();