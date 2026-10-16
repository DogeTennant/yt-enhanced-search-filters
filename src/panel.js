// Builds the extension's DOM: the toolbar button, the filter panel and the results bar.
// Only structure lives here; content.js fills in state and handles events.
(function (root) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // h('div', { class: 'x', dataset: { a: 1 } }, child, 'text', ...)
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  // 24x24 line icons. Each entry: [tag, attributes].
  const ICONS = {
    sliders: [
      ['path', { d: 'M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2' }],
      ['circle', { cx: 14, cy: 6, r: 2 }], ['circle', { cx: 8, cy: 12, r: 2 }], ['circle', { cx: 16, cy: 18, r: 2 }],
    ],
    close: [['path', { d: 'M6 6l12 12M18 6 6 18' }]],
    star: [['path', { d: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1.1 5.8L12 16.9l-5.3 2.7 1.1-5.8-4.3-4.1 5.9-.9z' }]],
    save: [['path', { d: 'M12 4v11M7 10l5 5 5-5M5 20h14' }]],
    trash: [['path', { d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6' }]],
    eye: [['path', { d: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z' }], ['circle', { cx: 12, cy: 12, r: 3 }]],
    eyeOff: [['path', { d: 'M2 12s3.6-7 10-7c2 0 3.7.7 5.1 1.6M22 12s-3.6 7-10 7c-2 0-3.7-.7-5.1-1.6M3 3l18 18' }]],
    check: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
    filterOff: [['path', { d: 'M4 5h16l-6 7.5V19l-4 1.5v-8z' }]],
  };

  function icon(name, cls) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'yesf-icon' + (cls ? ' ' + cls : ''));
    for (const [tag, attrs] of ICONS[name]) {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      svg.append(el);
    }
    return svg;
  }

  const chip = (group, value, label) =>
    h('button', { type: 'button', class: 'yesf-chip', dataset: { group, value: value == null ? '' : value } }, label);

  const featureChip = (value, label) =>
    h('button', { type: 'button', class: 'yesf-chip', dataset: { feature: value } }, label);

  const group = (label, ...body) => h('div', { class: 'yesf-group' }, h('div', { class: 'yesf-label' }, label), ...body);

  const chips = (...items) => h('div', { class: 'yesf-chips' }, ...items);

  const field = (label, name, attrs) =>
    h('label', { class: 'yesf-field' }, h('span', {}, label), h('input', { dataset: { field: name }, autocomplete: 'off', spellcheck: 'false', ...attrs }));

  // Shown only while `data-group` has the value `custom`.
  const reveal = (group, ...body) => h('div', { class: 'yesf-reveal', dataset: { when: group } }, ...body);

  function filtersTab() {
    return h('div', { class: 'yesf-tabpanel', dataset: { tab: 'filters' } },
      group('Sort by', chips(chip('sort', 'relevance', 'Relevance'), chip('sort', 'popularity', 'Popularity'))),
      group('Upload date',
        chips(chip('uploadDate', null, 'Any time'), chip('uploadDate', 'today', 'Today'), chip('uploadDate', 'week', 'This week'),
          chip('uploadDate', 'month', 'This month'), chip('uploadDate', 'year', 'This year'), chip('uploadDate', 'custom', 'Custom range')),
        reveal('uploadDate', h('div', { class: 'yesf-row' },
          field('From', 'dateFrom', { type: 'date' }), field('To', 'dateTo', { type: 'date' })))),
      group('Type',
        chips(chip('type', null, 'Any'), chip('type', 'video', 'Video'), chip('type', 'shorts', 'Shorts'), chip('type', 'channel', 'Channel'),
          chip('type', 'playlist', 'Playlist'), chip('type', 'movie', 'Movie'))),
      group('Length',
        chips(chip('duration', null, 'Any'), chip('duration', 'short', 'Under 3 min'), chip('duration', 'medium', '3–20 min'),
          chip('duration', 'long', 'Over 20 min'), chip('duration', 'custom', 'Custom')),
        reveal('duration', h('div', { class: 'yesf-row' },
          field('Min minutes', 'durationMin', { type: 'number', min: '0', step: 'any', placeholder: '5' }),
          field('Max minutes', 'durationMax', { type: 'number', min: '0', step: 'any', placeholder: '30' })))),
      group('Features',
        chips(featureChip('live', 'Live'), featureChip('4k', '4K'), featureChip('hd', 'HD'), featureChip('subtitles', 'Subtitles/CC'),
          featureChip('cc', 'Creative Commons'), featureChip('360', '360°'), featureChip('vr180', 'VR180'), featureChip('3d', '3D'),
          featureChip('hdr', 'HDR'), featureChip('location', 'Location'))),
      group('Views', h('div', { class: 'yesf-row' },
        field('At least', 'viewMin', { type: 'text', inputmode: 'decimal', placeholder: '10K' }),
        field('At most', 'viewMax', { type: 'text', inputmode: 'decimal', placeholder: '1M' }))),
      group('Title words',
        h('div', { class: 'yesf-stack' },
          field('Any of', 'anyWords', { type: 'text', placeholder: 'review, tutorial' }),
          field('All of', 'allWords', { type: 'text', placeholder: 'minecraft 1.21' }),
          field('None of', 'noneWords', { type: 'text', placeholder: 'reaction "full movie"' })),
        h('p', { class: 'yesf-hint' }, 'Whole words, any case. Use quotes for a phrase and * for word endings: ', h('code', {}, 'review*'), ' also finds “reviews”.')));
  }

  const HIDE_OPTIONS = [
    ['ads', 'Ads', 'Sponsored results and promoted videos'],
    ['shorts', 'Shorts', 'Shorts shelves and Shorts mixed into results'],
    ['movies', 'Movies', 'Paid movie results'],
    ['sections', 'Extra shelves', '“People also watched”, “For you”, related searches'],
    ['watched', 'Watched videos', 'Anything you have started watching'],
  ];

  function hideTab() {
    return h('div', { class: 'yesf-tabpanel', dataset: { tab: 'hide' } },
      h('p', { class: 'yesf-note' }, 'These apply to every search and are saved until you turn them off.'),
      h('div', { class: 'yesf-switches' }, HIDE_OPTIONS.map(([key, label, desc]) =>
        h('button', { type: 'button', role: 'switch', 'aria-checked': 'false', class: 'yesf-switch', dataset: { hide: key } },
          h('span', { class: 'yesf-switch-text' }, h('span', { class: 'yesf-switch-label' }, label), h('span', { class: 'yesf-switch-desc' }, desc)),
          h('span', { class: 'yesf-switch-track' }, h('span', { class: 'yesf-switch-thumb' }))))),
      group('Channels',
        h('div', { class: 'yesf-tokens', dataset: { tokens: 'channels' } }),
        h('input', { type: 'text', class: 'yesf-input', dataset: { addToken: 'channels' }, placeholder: 'Channel name or @handle, then Enter', autocomplete: 'off', spellcheck: 'false' })));
  }

  function presetsTab() {
    return h('div', { class: 'yesf-tabpanel', dataset: { tab: 'presets' } },
      h('div', { class: 'yesf-presets' }),
      group('Save current filters',
        h('div', { class: 'yesf-row yesf-save-row' },
          h('input', { type: 'text', class: 'yesf-input', dataset: { presetName: '' }, placeholder: 'Preset name', maxlength: '40', autocomplete: 'off' }),
          h('button', { type: 'button', class: 'yesf-button', dataset: { action: 'save-preset' } }, 'Save'))));
  }

  function buildPanel() {
    const tab = (name, label) =>
      h('button', { type: 'button', role: 'tab', class: 'yesf-tab', dataset: { tabButton: name } }, label, h('span', { class: 'yesf-tab-count' }));
    return h('div', { id: 'yesf-panel', role: 'dialog', 'aria-label': 'Search filters', hidden: true },
      h('div', { class: 'yesf-head' },
        h('div', { class: 'yesf-tabs', role: 'tablist' }, tab('filters', 'Filters'), tab('hide', 'Hide'), tab('presets', 'Presets')),
        h('button', { type: 'button', class: 'yesf-icon-button', dataset: { action: 'close' }, 'aria-label': 'Close', title: 'Close (Esc)' }, icon('close'))),
      h('div', { class: 'yesf-body' }, filtersTab(), hideTab(), presetsTab()),
      h('div', { class: 'yesf-foot' },
        h('span', { class: 'yesf-status' }),
        h('button', { type: 'button', class: 'yesf-button', dataset: { action: 'reset' }, title: 'Clear all filters (Hide settings stay)' }, 'Reset'),
        h('button', { type: 'button', class: 'yesf-button yesf-primary', dataset: { action: 'apply' } }, 'Apply')));
  }

  function buildButton() {
    return h('button', { type: 'button', id: 'yesf-btn', 'aria-label': 'Search filters', title: 'Search filters (Alt+F)', 'aria-haspopup': 'dialog' },
      icon('sliders'), h('span', { class: 'yesf-badge', hidden: true }));
  }

  function buildBar() {
    return h('div', { id: 'yesf-bar', hidden: true },
      icon('filterOff', 'yesf-bar-icon'),
      h('span', { class: 'yesf-bar-text' }),
      h('button', { type: 'button', class: 'yesf-link', dataset: { action: 'peek' } }),
      h('button', { type: 'button', class: 'yesf-link', dataset: { action: 'open' } }, 'Edit filters'));
  }

  function presetRow(name, { isDefault, isCurrent }) {
    const iconButton = (action, iconName, label, extra) =>
      h('button', { type: 'button', class: 'yesf-icon-button' + (extra || ''), dataset: { action, name }, 'aria-label': label, title: label }, icon(iconName));
    return h('div', { class: 'yesf-preset' + (isCurrent ? ' is-current' : '') },
      h('button', { type: 'button', class: 'yesf-preset-name', dataset: { action: 'load-preset', name }, title: 'Apply this preset' },
        isCurrent ? icon('check') : null, h('span', {}, name)),
      iconButton('default-preset', 'star', isDefault ? 'Stop using for new tabs' : 'Use for every new tab', isDefault ? ' is-on' : ''),
      iconButton('update-preset', 'save', 'Replace with current filters'),
      iconButton('delete-preset', 'trash', 'Delete preset'));
  }

  function token(list, value) {
    return h('span', { class: 'yesf-token' }, h('span', {}, value),
      h('button', { type: 'button', dataset: { removeToken: list, value }, 'aria-label': 'Remove ' + value, title: 'Remove' }, icon('close')));
  }

  root.YESF = root.YESF || {};
  root.YESF.ui = { h, icon, buildPanel, buildButton, buildBar, presetRow, token };
})(globalThis);
