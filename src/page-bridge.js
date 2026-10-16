// Runs in YouTube's own page context ("world": "MAIN"), because only there can we read the data
// object YouTube keeps on each result card. The visible text is abbreviated ("1.1M") and changes
// between layouts; the data object has the full numbers ("1,194,065 views").
//
// The extension asks by dispatching a `yesf:read` event; we answer synchronously by writing a
// small JSON summary into each card's `data-yesf` attribute.
(function () {
  'use strict';

  const text = o => {
    if (!o) return '';
    if (o.simpleText != null) return String(o.simpleText);
    if (Array.isArray(o.runs)) return o.runs.map(r => r.text || '').join('');
    return typeof o.content === 'string' ? o.content : '';
  };

  function describe(d) {
    const overlays = Array.isArray(d.thumbnailOverlays) ? d.thumbnailOverlays : [];
    const pick = key => (overlays.find(o => o && o[key]) || {})[key];
    const resume = pick('thumbnailOverlayResumePlaybackRenderer');
    const time = pick('thumbnailOverlayTimeStatusRenderer');
    const badges = (d.badges || []).map(b => b && b.metadataBadgeRenderer).filter(Boolean);
    const owner = d.ownerText || d.longBylineText || d.shortBylineText;
    const ownerUrl = owner && owner.runs && owner.runs[0] && owner.runs[0].navigationEndpoint &&
      owner.runs[0].navigationEndpoint.browseEndpoint && owner.runs[0].navigationEndpoint.browseEndpoint.canonicalBaseUrl || '';
    return {
      id: d.videoId || '',
      title: text(d.title),
      channel: text(owner),
      handle: ownerUrl.startsWith('/@') ? decodeURIComponent(ownerUrl.slice(1)) : '',
      viewsText: text(d.viewCountText),
      lengthText: text(d.lengthText) || (time ? text(time.text) : ''),
      age: text(d.publishedTimeText),
      watched: resume ? Number(resume.percentDurationWatched) || 1 : 0,
      short: !!(d.navigationEndpoint && d.navigationEndpoint.reelWatchEndpoint),
      live: badges.some(b => /LIVE/.test(b.style || '')) || (time && time.style === 'LIVE') || false,
      upcoming: !!d.upcomingEventData || (time && time.style === 'UPCOMING') || false,
    };
  }

  document.addEventListener('yesf:read', () => {
    for (const el of document.querySelectorAll('ytd-search ytd-video-renderer')) {
      let summary = null;
      try {
        if (el.data) summary = JSON.stringify(describe(el.data));
      } catch (e) { /* unexpected shape: the extension falls back to reading the card's text */ }
      if (summary) el.setAttribute('data-yesf', summary);
      else el.removeAttribute('data-yesf');
    }
  });
})();
