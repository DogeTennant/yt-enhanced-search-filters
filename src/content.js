// Main content script: state, storage, navigation, result filtering and panel behaviour.
//
// Three kinds of state:
// - filters: sort/date/type/length/features/views/title words. The YouTube-side part lives in the
//   URL (the `sp` parameter and after:/before: in the query), so the URL is always the truth for
//   it. The whole set is kept per tab in sessionStorage and carried over to new searches.
// - hide: "always hide" settings (ads, Shorts, watched, channels...), saved in extension storage.
// - presets: named filter sets, saved in extension storage.
(function () {
  'use strict';

  const { sp: SP, match: M, ui: UI } = globalThis.YESF;
  const api = globalThis.browser || globalThis.chrome;

  const DEFAULT_FILTERS = {
    sort: 'relevance', uploadDate: null, dateFrom: '', dateTo: '', type: null,
    duration: null, durationMin: '', durationMax: '', features: [],
    viewMin: '', viewMax: '', anyWords: '', allWords: '', noneWords: '',
  };
  const DEFAULT_HIDE = { ads: false, shorts: false, movies: false, sections: false, watched: false, channels: [] };
  const CSS_HIDE_KEYS = ['ads', 'shorts', 'movies', 'sections'];
  const SESSION_KEY = 'yesf-session';

  const clone = o => JSON.parse(JSON.stringify(o));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function normFilters(f) {
    const out = clone(DEFAULT_FILTERS);
    if (!f || typeof f !== 'object') return out;
    for (const key of Object.keys(out)) {
      if (key === 'features') out.features = Array.isArray(f.features) ? f.features.filter(x => x in SP.FEATURE).sort() : [];
      else if (f[key] != null) out[key] = typeof out[key] === 'string' ? String(f[key]) : f[key];
    }
    return out;
  }

  function normHide(x) {
    const out = clone(DEFAULT_HIDE);
    if (!x || typeof x !== 'object') return out;
    for (const key of CSS_HIDE_KEYS.concat('watched')) out[key] = !!x[key];
    out.channels = Array.isArray(x.channels) ? x.channels.map(String).filter(Boolean) : [];
    return out;
  }

  function normPresets(list) {
    return Array.isArray(list)
      ? list.filter(p => p && typeof p.name === 'string' && p.name).map(p => ({ name: p.name, filters: normFilters(p.filters) }))
      : [];
  }

  // ---- State ----

  let applied = normFilters();  // filters in effect on this page
  let draft = normFilters();    // what the panel is editing
  let extra = SP.emptyState().extra; // `sp` fields we don't model, kept as they are
  let hide = normHide();
  let draftHide = normHide();
  let presets = [];
  let defaultPreset = '';
  let peek = false;
  let activeTab = 'filters';

  // ---- Storage ----

  function readSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (s && typeof s === 'object') return { filters: normFilters(s.filters), query: typeof s.query === 'string' ? s.query : null };
    } catch (e) { /* missing or unreadable */ }
    return null;
  }

  function writeSession(filters, query) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ filters, query })); } catch (e) { /* storage blocked */ }
  }

  function savePrefs(values) {
    return Promise.resolve(api.storage.local.set(values)).catch(() => {});
  }

  // Version 1.x kept everything in YouTube's localStorage. Copy it into extension storage once.
  // The old keys stay where they are, so going back to 1.x doesn't lose anything.
  function readV1() {
    const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } };
    const old = read('yesf-persistent') || {};
    const oldPresets = read('yesf-presets') || {};
    return {
      hide: normHide({ ads: old.hideSponsored, shorts: old.hideShorts, movies: old.hideMovies, sections: old.hideSections, watched: old.hideWatched }),
      presets: Object.entries(oldPresets)
        .filter(([name, p]) => name && p && typeof p === 'object')
        .map(([name, p]) => ({ name: name.slice(0, 40), filters: fromV1(p) })),
    };
  }

  function fromV1(p) {
    const f = normFilters();
    if (p.sort === 'views') f.sort = 'popularity';
    if (p.uploadDate in SP.UPLOAD_DATE) f.uploadDate = p.uploadDate;
    if (p.dateFrom || p.dateTo) Object.assign(f, { uploadDate: 'custom', dateFrom: p.dateFrom || '', dateTo: p.dateTo || '' });
    if (p.type in SP.TYPE) f.type = p.type;
    if (p.duration in SP.DURATION) f.duration = p.duration;
    if (p.durationMin || p.durationMax) Object.assign(f, { duration: 'custom', durationMin: p.durationMin || '', durationMax: p.durationMax || '' });
    f.features = Array.isArray(p.features) ? p.features : [];
    Object.assign(f, { viewMin: p.viewMin || '', viewMax: p.viewMax || '', anyWords: p.includeWords || '', allWords: p.includeAllWords || '', noneWords: p.excludeWords || '' });
    return normFilters(f);
  }

  async function loadPrefs() {
    let stored = {};
    try { stored = await api.storage.local.get(['hide', 'presets', 'defaultPreset', 'migratedV1']); } catch (e) { /* use defaults */ }
    if (!stored.migratedV1) {
      const v1 = readV1();
      stored = { ...stored, hide: stored.hide || v1.hide, presets: normPresets(stored.presets).concat(v1.presets), migratedV1: true };
      await savePrefs({ hide: stored.hide, presets: stored.presets, migratedV1: true });
    }
    hide = normHide(stored.hide);
    draftHide = clone(hide);
    presets = normPresets(stored.presets);
    defaultPreset = typeof stored.defaultPreset === 'string' ? stored.defaultPreset : '';
  }

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.hide) {
      const hidePending = !same(draftHide, hide);
      hide = normHide(changes.hide.newValue);
      if (!hidePending) draftHide = clone(hide);
      applyHideClasses();
      runFilters();
    }
    if (changes.presets) presets = normPresets(changes.presets.newValue);
    if (changes.defaultPreset) defaultPreset = changes.defaultPreset.newValue || '';
    render();
  });

  // ---- URL <-> filters ----

  const DATE_OP = /(^|\s)(after|before):(\d{4}-\d{2}-\d{2})(?=\s|$)/gi;

  function readUrl(href) {
    const url = new URL(href);
    let after = '', before = '';
    const query = (url.searchParams.get('search_query') || '')
      .replace(DATE_OP, (all, space, op, date) => { if (op.toLowerCase() === 'after') after = date; else before = date; return ' '; })
      .replace(/\s+/g, ' ').trim();
    return { query, after, before, state: SP.decode(url.searchParams.get('sp') || '') };
  }

  // A custom length range also sends the narrowest YouTube length that contains it, so YouTube
  // returns more videos that can pass. ("Under 3 min" is skipped: YouTube answers it with Shorts only.)
  function lengthBucket(f) {
    const min = M.parseMinutes(f.durationMin), max = M.parseMinutes(f.durationMax);
    if (min != null && min >= 20) return 'long';
    if (min != null && min >= 3 && max != null && max <= 20) return 'medium';
    return null;
  }

  function youtubePart(f, unknown) {
    return {
      sort: f.sort,
      uploadDate: f.uploadDate === 'custom' ? null : f.uploadDate,
      type: f.type,
      duration: f.duration === 'custom' ? lengthBucket(f) : f.duration,
      features: f.features,
      extra: unknown,
    };
  }

  function hasYoutubeFilters(f, unknown) {
    return !!SP.encode(youtubePart(f, unknown)) || (f.uploadDate === 'custom' && !!(f.dateFrom || f.dateTo));
  }

  function buildUrl(f, query) {
    const url = new URL('/results', location.origin);
    let q = query;
    if (f.uploadDate === 'custom') {
      if (f.dateFrom) q += ' after:' + f.dateFrom;
      if (f.dateTo) q += ' before:' + f.dateTo;
    }
    url.searchParams.set('search_query', q.trim());
    const sp = SP.encode(youtubePart(f, extra));
    if (sp) url.searchParams.set('sp', sp);
    return url.toString();
  }

  function sameSearch(a, b) {
    const key = href => {
      const u = new URL(href);
      return (u.searchParams.get('search_query') || '').replace(/\s+/g, ' ').trim() + '\n' + SP.encode(SP.decode(u.searchParams.get('sp') || ''));
    };
    return key(a) === key(b);
  }

  function presetFilters(name) {
    const p = presets.find(x => x.name === name);
    return p ? normFilters(p.filters) : null;
  }

  // Works out the filters for the page we just arrived on. Returns false when it redirects.
  function syncFromUrl() {
    const u = readUrl(location.href);
    extra = u.state.extra;
    const session = readSession() || { filters: presetFilters(defaultPreset) || normFilters(), query: null };
    const urlHasFilters = !!(u.after || u.before || SP.encode(u.state));

    // A new search without filters in the URL: bring the tab's filters along.
    if (!urlHasFilters && u.query && u.query !== session.query && hasYoutubeFilters(session.filters, extra)) {
      const target = buildUrl(session.filters, u.query);
      if (!sameSearch(target, location.href)) {
        writeSession(session.filters, u.query);
        location.replace(target);
        return false;
      }
    }

    // Otherwise the URL decides the YouTube-side filters (it may come from YouTube's own
    // Filters menu or a shared link); the extension-only ones come from the session.
    const f = normFilters(session.filters);
    f.sort = u.state.sort;
    f.type = u.state.type;
    f.features = u.state.features;
    if (u.after || u.before) Object.assign(f, { uploadDate: 'custom', dateFrom: u.after, dateTo: u.before });
    else Object.assign(f, { uploadDate: u.state.uploadDate, dateFrom: '', dateTo: '' });
    if (!(f.duration === 'custom' && lengthBucket(f) === u.state.duration)) {
      Object.assign(f, { duration: u.state.duration, durationMin: '', durationMax: '' });
    }
    applied = normFilters(f);
    draft = clone(applied);
    writeSession(applied, u.query);
    return true;
  }

  // ---- Applying ----

  function applyHideClasses() {
    const cl = document.documentElement.classList;
    for (const key of CSS_HIDE_KEYS) cl.toggle('yesf-hide-' + key, hide[key]);
  }

  function apply() {
    if (!same(draftHide, hide)) {
      hide = clone(draftHide);
      savePrefs({ hide });
      applyHideClasses();
    }
    applied = normFilters(draft);
    draft = clone(applied);
    const { query } = readUrl(location.href);
    writeSession(applied, query);
    const target = buildUrl(applied, query);
    if (!sameSearch(target, location.href)) {
      location.assign(target);
      return;
    }
    closePanel();
    render();
    runFilters();
  }

  function reset() {
    draft = normFilters();
    draftHide = clone(hide);
    apply();
  }

  function countFilters(f) {
    let n = 0;
    if (f.sort !== 'relevance') n++;
    if (f.uploadDate && (f.uploadDate !== 'custom' || f.dateFrom || f.dateTo)) n++;
    if (f.type) n++;
    if (f.duration && (f.duration !== 'custom' || M.parseMinutes(f.durationMin) || M.parseMinutes(f.durationMax))) n++;
    n += f.features.length;
    if (M.parseUserCount(f.viewMin) != null || M.parseUserCount(f.viewMax) != null) n++;
    for (const key of ['anyWords', 'allWords', 'noneWords']) if (M.compileTerms(f[key]).length) n++;
    return n;
  }

  const countHide = x => CSS_HIDE_KEYS.concat('watched').filter(k => x[k]).length + x.channels.length;

  // ---- Reading result cards ----

  function readCard(el) {
    const raw = el.getAttribute('data-yesf');
    if (raw) {
      try {
        const d = JSON.parse(raw);
        return {
          title: d.title, channel: d.channel, handle: d.handle, age: d.age, watched: d.watched, short: d.short,
          views: d.live || d.upcoming ? null : M.parseCount(d.viewsText),
          seconds: M.parseLength(d.lengthText),
        };
      } catch (e) { /* fall through to the visible text */ }
    }
    return readCardText(el);
  }

  // Fallback when YouTube's data object isn't available: read what the card shows.
  function readCardText(el) {
    const text = sel => (el.querySelector(sel)?.textContent || '').trim();
    const meta = [...el.querySelectorAll('#metadata-line span')].map(e => e.textContent.trim()).filter(Boolean);
    const age = meta.find(t => /\bago\b/i.test(t)) || '';
    const viewsText = meta.find(t => t !== age && /\d/.test(t) && !/watching|waiting/i.test(t)) || '';
    const length = text('ytd-thumbnail-overlay-time-status-renderer').match(/\d+(?::\d{2}){1,2}/);
    const channelLink = el.querySelector('ytd-channel-name a, #channel-name a');
    const handle = (channelLink?.getAttribute('href') || '').match(/^\/(@[^/?]+)/);
    return {
      title: text('#video-title'),
      channel: (channelLink?.textContent || '').trim(),
      handle: handle ? decodeURIComponent(handle[1]) : '',
      views: M.parseCount(viewsText),
      seconds: length ? M.parseLength(length[0]) : null,
      age,
      watched: el.querySelector('ytd-thumbnail-overlay-resume-playback-renderer, yt-thumbnail-overlay-progress-bar-view-model') ? 1 : 0,
      short: !!el.querySelector('a[href^="/shorts/"]'),
    };
  }

  function runFilters() {
    if (location.pathname !== '/results') return;
    ensureUi();
    const compiled = M.compileFilters(applied, hide);
    const active = M.isActive(compiled);
    if (active) document.dispatchEvent(new CustomEvent('yesf:read'));
    const now = Date.now();
    let total = 0, hidden = 0;
    for (const el of document.querySelectorAll('ytd-search ytd-video-renderer')) {
      const inHiddenShelf = hide.sections && el.closest('ytd-shelf-renderer');
      const reason = active ? M.reasonToHide(readCard(el), compiled, now) : null;
      if (reason) {
        if (el.getAttribute('data-yesf-hidden') !== reason) el.setAttribute('data-yesf-hidden', reason);
      } else if (el.hasAttribute('data-yesf-hidden')) {
        el.removeAttribute('data-yesf-hidden');
      }
      if (inHiddenShelf) continue;
      total++;
      if (reason) hidden++;
    }
    updateBar(total, hidden);
  }

  // ---- UI ----

  let btn = null, panel = null, bar = null;

  function ensureUi() {
    if (!document.body) return;
    if (!btn) {
      btn = UI.buildButton();
      btn.addEventListener('click', e => { e.stopPropagation(); togglePanel(); });
      panel = UI.buildPanel();
      panel.addEventListener('click', onPanelClick);
      panel.addEventListener('input', onPanelInput);
      panel.addEventListener('change', onPanelInput);
      panel.addEventListener('keydown', onPanelKey);
      bar = UI.buildBar();
      bar.addEventListener('click', onBarClick);
    }
    const center = document.querySelector('ytd-masthead #center');
    if (center && btn.parentElement !== center) {
      center.append(btn);
      btn.classList.remove('yesf-floating');
    } else if (!center && !btn.isConnected) {
      document.body.append(btn);
      btn.classList.add('yesf-floating');
    }
    if (!panel.isConnected) document.body.append(panel);
    const results = document.querySelector('ytd-search ytd-section-list-renderer > #contents');
    if (results && bar.nextElementSibling !== results) results.before(bar);
  }

  function updateBar(total, hidden) {
    if (!bar) return;
    bar.hidden = hidden === 0;
    const text = `${hidden} of ${total} videos hidden by your filters`;
    const textEl = bar.querySelector('.yesf-bar-text');
    if (textEl.textContent !== text) textEl.textContent = text;
    const peekLabel = peek ? 'Hide them again' : 'Show them';
    const peekBtn = bar.querySelector('[data-action="peek"]');
    if (peekBtn.textContent !== peekLabel) peekBtn.textContent = peekLabel;
  }

  function setPeek(on) {
    peek = on;
    document.documentElement.classList.toggle('yesf-peek', on);
    runFilters();
  }

  function onBarClick(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'peek') setPeek(!peek);
    if (action === 'open') { e.stopPropagation(); openPanel('filters'); }
  }

  function isOpen() {
    return panel && !panel.hidden;
  }

  function openPanel(tab) {
    ensureUi();
    if (tab) activeTab = tab;
    render();
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    placePanel();
  }

  function closePanel() {
    if (!isOpen()) return;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  function togglePanel() {
    if (isOpen()) closePanel(); else openPanel();
  }

  function placePanel() {
    const width = panel.offsetWidth;
    const r = btn.getBoundingClientRect();
    const anchored = r.width > 0 && r.bottom < 120;
    const top = anchored ? r.bottom + 8 : 64;
    const left = anchored ? r.left + r.width / 2 - width / 2 : innerWidth - width - 16;
    panel.style.top = top + 'px';
    panel.style.left = Math.max(8, Math.min(left, innerWidth - width - 8)) + 'px';
    panel.style.maxHeight = (innerHeight - top - 16) + 'px';
  }

  function render() {
    if (!panel) return;
    const q = (sel, fn) => panel.querySelectorAll(sel).forEach(fn);

    q('.yesf-chip[data-group]', c => c.setAttribute('aria-pressed', String((draft[c.dataset.group] || null) === (c.dataset.value || null))));
    q('.yesf-chip[data-feature]', c => c.setAttribute('aria-pressed', String(draft.features.includes(c.dataset.feature))));
    q('.yesf-reveal', el => { el.hidden = draft[el.dataset.when] !== 'custom'; });
    q('input[data-field]', el => {
      const v = String(draft[el.dataset.field] ?? '');
      if (el.value !== v) el.value = v;
    });
    q('.yesf-switch', el => el.setAttribute('aria-checked', String(draftHide[el.dataset.hide])));

    const tokens = panel.querySelector('[data-tokens="channels"]');
    tokens.replaceChildren(...draftHide.channels.map(c => UI.token('channels', c)));
    tokens.hidden = draftHide.channels.length === 0;

    const list = panel.querySelector('.yesf-presets');
    if (presets.length) {
      list.replaceChildren(...presets.map(p => UI.presetRow(p.name, { isDefault: p.name === defaultPreset, isCurrent: same(p.filters, applied) })));
    } else {
      list.replaceChildren(UI.h('p', { class: 'yesf-note' },
        'Save filters you use often and apply them with one click. Star a preset to start every new tab with it.'));
    }

    q('[data-tab-button]', t => {
      const name = t.dataset.tabButton;
      t.setAttribute('aria-selected', String(name === activeTab));
      const n = name === 'filters' ? countFilters(draft) : name === 'hide' ? countHide(draftHide) : 0;
      t.querySelector('.yesf-tab-count').textContent = n ? String(n) : '';
    });
    q('.yesf-tabpanel', p => { p.hidden = p.dataset.tab !== activeTab; });

    const pending = !same(draft, applied) || !same(draftHide, hide);
    panel.querySelector('.yesf-status').textContent = pending ? 'Not applied yet' : '';
    panel.querySelector('[data-action="apply"]').classList.toggle('is-pending', pending);

    const count = countFilters(applied);
    const badge = btn.querySelector('.yesf-badge');
    badge.textContent = String(count);
    badge.hidden = count === 0;
    btn.classList.toggle('is-active', count > 0);
  }

  function addChannel(input) {
    const value = input.value.trim().replace(/\s+/g, ' ');
    if (!value) return;
    if (!draftHide.channels.some(c => M.fold(c) === M.fold(value))) draftHide.channels.push(value);
    input.value = '';
    render();
  }

  function savePreset(nameInput) {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const existing = presets.find(p => p.name === name);
    if (existing) existing.filters = clone(draft);
    else presets.push({ name, filters: clone(draft) });
    nameInput.value = '';
    savePrefs({ presets });
    render();
  }

  function onPanelClick(e) {
    e.stopPropagation();
    const target = e.target.closest('button');
    if (!target) return;
    const d = target.dataset;

    if (d.tabButton) { activeTab = d.tabButton; render(); return; }
    if (d.group !== undefined) { draft[d.group] = d.value || (d.group === 'sort' ? 'relevance' : null); render(); return; }
    if (d.feature) {
      draft.features = draft.features.includes(d.feature) ? draft.features.filter(x => x !== d.feature) : draft.features.concat(d.feature).sort();
      render();
      return;
    }
    if (d.hide) { draftHide[d.hide] = !draftHide[d.hide]; render(); return; }
    if (d.removeToken) { draftHide.channels = draftHide.channels.filter(c => c !== d.value); render(); return; }

    switch (d.action) {
      case 'close': closePanel(); break;
      case 'apply': apply(); break;
      case 'reset': reset(); break;
      case 'save-preset': savePreset(panel.querySelector('[data-preset-name]')); break;
      case 'load-preset': {
        const f = presetFilters(d.name);
        if (f) { draft = f; apply(); }
        break;
      }
      case 'default-preset':
        defaultPreset = defaultPreset === d.name ? '' : d.name;
        savePrefs({ defaultPreset });
        render();
        break;
      case 'update-preset': {
        const p = presets.find(x => x.name === d.name);
        if (!p) break;
        p.filters = clone(draft);
        savePrefs({ presets });
        render();
        const done = [...panel.querySelectorAll('[data-action="update-preset"]')].find(b => b.dataset.name === d.name);
        if (done) {
          done.classList.add('is-done');
          done.replaceChildren(UI.icon('check'));
        }
        break;
      }
      case 'delete-preset':
        // First click arms the button, a second click within 3 seconds deletes.
        if (!target.classList.contains('is-armed')) {
          target.classList.add('is-armed');
          target.title = 'Click again to delete';
          setTimeout(() => target.classList.remove('is-armed'), 3000);
          break;
        }
        presets = presets.filter(x => x.name !== d.name);
        if (defaultPreset === d.name) { defaultPreset = ''; savePrefs({ defaultPreset }); }
        savePrefs({ presets });
        render();
        break;
    }
  }

  function onPanelInput(e) {
    const key = e.target.dataset.field;
    if (!key) return;
    draft[key] = e.target.value;
    render();
  }

  function onPanelKey(e) {
    e.stopPropagation(); // keep YouTube's keyboard shortcuts out of our inputs
    if (e.key === 'Escape') { closePanel(); btn.focus(); return; }
    if (e.altKey && e.code === 'KeyF') { e.preventDefault(); closePanel(); return; }
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    const d = e.target.dataset;
    if (d.addToken) addChannel(e.target);
    else if (d.presetName !== undefined) savePreset(e.target);
    else apply();
  }

  // ---- Navigation ----

  let routedHref = '';

  function route() {
    const onSearch = location.pathname === '/results';
    document.documentElement.classList.toggle('yesf-on-search', onSearch);
    if (!onSearch) {
      routedHref = '';
      closePanel();
      if (peek) setPeek(false);
      return;
    }
    if (location.href !== routedHref) {
      routedHref = location.href;
      if (!syncFromUrl()) return;
      if (peek) setPeek(false);
    }
    ensureUi();
    render();
    runFilters();
    observeResults();
  }

  let observed = null, timer = 0;

  function observeResults() {
    const target = document.querySelector('ytd-search');
    if (!target || target === observed) return;
    observed = target;
    new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => { timer = 0; runFilters(); }, 120);
    }).observe(target, { childList: true, subtree: true });
  }

  document.addEventListener('click', e => {
    if (isOpen() && e.button === 0 && !e.composedPath().includes(panel)) closePanel();
  });

  document.addEventListener('keydown', e => {
    if (location.pathname !== '/results') return;
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyF') {
      e.preventDefault();
      togglePanel();
    } else if (e.key === 'Escape' && isOpen()) {
      closePanel();
    }
  });

  window.addEventListener('resize', () => { if (isOpen()) placePanel(); });
  document.addEventListener('yt-navigate-finish', route);

  loadPrefs().then(() => {
    applyHideClasses();
    if (document.readyState === 'loading') {
      // Sort out the filters (and any redirect) before YouTube renders anything.
      if (location.pathname === '/results') {
        if (!syncFromUrl()) return;
        routedHref = location.href;
      }
      document.addEventListener('DOMContentLoaded', route, { once: true });
    } else {
      route();
    }
  });
})();
