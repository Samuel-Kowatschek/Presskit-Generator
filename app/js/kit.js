// Rendert ein Pressekit als A4-Seite (210 × 297 mm) in ein DOM-Element.
const Kit = (() => {
  const LAYOUTS = {
    vollbild: { label: 'Vollbild', extras: 0 },
    panel: { label: 'Panel', extras: 3 },
    split: { label: 'Split', extras: 0 },
    galerie: { label: 'Galerie', extras: 3 },
  };

  const FONTS = {
    'arial-narrow': '"Arial Narrow", "Helvetica Neue Condensed", sans-serif',
    'avenir-bold': '"Avenir Next", "Avenir", sans-serif',
    'avenir': '"Avenir Next", "Avenir", "Helvetica Neue", sans-serif',
  };

  // Eigene Schriften heißen intern "custom:<id>" und sind als FontFace "PKF-<id>" registriert.
  function fontStack(key, fallback) {
    if (key && key.startsWith('custom:')) return `"PKF-${key.slice(7)}", ${FONTS[fallback]}`;
    return FONTS[key] || FONTS[fallback];
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Pressetext: Leerzeile = neuer Absatz, **fett** wird hervorgehoben.
  function formatText(text) {
    return String(text || '').trim().split(/\n\s*\n/).filter(Boolean)
      .map(p => '<p>' + esc(p).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>') + '</p>')
      .join('');
  }

  function formatDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }

  function onColor(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#141414' : '#ffffff';
  }

  function links(artist, kit) {
    return [
      ['pressefotos', kit.pressefotos],
      ['pre-listening', kit.preListening],
      ['spotify', artist.spotify],
      ['instagram', artist.instagram],
      ['tiktok', artist.tiktok],
    ].filter(([, url]) => url);
  }

  function linkIndex(artist, kit) {
    const rows = links(artist, kit).map(([label, url], i) => `
      <a class="k-link" href="${esc(url)}">
        <span class="k-link-no">(${String(i + 1).padStart(2, '0')})</span>
        <span class="k-link-label">${label}</span>
        <span class="k-link-arrow">↗</span>
      </a>`).join('');
    return `<nav class="k-links">${rows}</nav>`;
  }

  function release(kit) {
    if (!kit.releaseTitle && !kit.releaseDate) return '';
    return `
      <div class="k-release">
        <span class="k-release-title">${esc(kit.releaseLabel || 'nächster release')}: <b>${esc(kit.releaseTitle)}</b></span>
        ${kit.releaseDate ? `<span class="k-release-date">vö: ${formatDate(kit.releaseDate)}</span>` : ''}
      </div>
      ${kit.producer ? `<div class="k-producer">prod. ${esc(kit.producer)}</div>` : ''}`;
  }

  function sticker(kit) {
    if (!kit.showSticker) return '';
    const label = (kit.stickerText || 'neue single').toUpperCase();
    const ring = [label, (kit.releaseTitle || '').toUpperCase()].filter(Boolean).join(' • ');
    const ringText = `${ring} • ${ring} • `;
    const center = kit.releaseDate
      ? `<text x="50" y="47" class="s-small">vö</text><text x="50" y="61" class="s-big">${formatDate(kit.releaseDate).slice(0, 6)}</text>`
      : `<text x="50" y="60" class="s-big">↗</text>`;
    return `
      <div class="k-sticker">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <defs><path id="sticker-ring" d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0"/></defs>
          <circle cx="50" cy="50" r="49" class="s-bg"/>
          <circle cx="50" cy="50" r="27" class="s-line"/>
          <text class="s-ring"><textPath href="#sticker-ring" textLength="230" lengthAdjust="spacing">${esc(ringText)}</textPath></text>
          ${center}
        </svg>
      </div>`;
  }

  // Name auf zwei möglichst gleich lange Zeilen verteilen.
  function twoLines(name) {
    const words = name.split(/\s+/);
    if (words.length < 2) return [name];
    let best = [name], bestLen = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      const len = Math.max(a.length, b.length);
      if (len < bestLen) { best = [a, b]; bestLen = len; }
    }
    return best;
  }

  function titleLines(artist, kit) {
    const name = String(artist.name || 'Artist').trim();
    const lines = kit.titleBreak ? twoLines(name) : [name];
    return lines.map(l => `<span class="k-title-line">${esc(l)}</span>`).join('');
  }

  // Bildausschnitt pro Foto: kit.crops[bildId] = { x, y, z } (Fokus in %, Zoom in %).
  function crop(kit, id) {
    const legacy = id === kit.mainImage ? { x: kit.focusX, y: kit.focusY, z: kit.zoom } : {};
    const c = (kit.crops || {})[id] || legacy;
    return { x: c.x ?? 50, y: c.y ?? (id === kit.mainImage ? 35 : 50), z: c.z ?? 100 };
  }

  // p = { id, url } oder null
  function img(kit, p, cls) {
    if (!p) return `<div class="${cls} k-img-empty"></div>`;
    const { x, y, z } = crop(kit, p.id);
    const style = `object-position:${x}% ${y}%;transform:scale(${z / 100});transform-origin:${x}% ${y}%;`;
    return `<img class="${cls}" data-id="${p.id}" src="${p.url}" style="${style}" alt="">`;
  }

  // Cover mit versetzten Rahmen dahinter (wie im SLUQ-Kit).
  function cover(kit, p) {
    return p ? `<div class="k-cover"><span></span><span></span><div class="k-cover-img">${img(kit, p, 'k-fill')}</div></div>` : '';
  }

  function meta(artist, kit) {
    const right = kit.releaseDate ? `vö ${formatDate(kit.releaseDate)}` : (kit.metaRight || new Date().getFullYear());
    return `<div class="k-meta"><span>${esc(kit.metaLeft || 'pressekit')}</span><span>${esc(artist.name || '')}</span><span>${esc(right)}</span></div>`;
  }

  function body(artist, kit) {
    return `
      <div class="k-body">
        <div class="k-copy">${release(kit)}<div class="k-text">${formatText(kit.text)}</div></div>
        ${linkIndex(artist, kit)}
      </div>`;
  }

  const templates = {
    vollbild: (a, k, main, extras, cov) => `
      <div class="k-bg">${img(k, main, 'k-main')}</div>
      <div class="k-shade"></div>
      ${meta(a, k)}
      <div class="k-head"><h1 class="k-title">${titleLines(a, k)}</h1>${sticker(k)}</div>
      ${cover(k, cov)}
      ${body(a, k)}`,

    panel: (a, k, main, extras, cov) => `
      <div class="k-bg">${img(k, main, 'k-main')}</div>
      <div class="k-panel">
        ${meta(a, k)}
        <div class="k-head">
          ${extras.map((p, i) => `<div class="k-float k-float-${i + 1}">${img(k, p, 'k-fill')}</div>`).join('')}
          <h1 class="k-title">${titleLines(a, k)}</h1>
          ${cover(k, cov)}
          ${sticker(k)}
        </div>
        ${body(a, k)}
      </div>`,

    split: (a, k, main, extras, cov) => `
      <div class="k-photo">${img(k, main, 'k-main')}${meta(a, k)}${cover(k, cov)}</div>
      <div class="k-head"><h1 class="k-title">${titleLines(a, k)}</h1>${sticker(k)}</div>
      ${body(a, k)}`,

    galerie: (a, k, main, extras, cov) => `
      ${meta(a, k)}
      <div class="k-head"><h1 class="k-title">${titleLines(a, k)}</h1>${sticker(k)}</div>
      <div class="k-grid k-grid-${extras.length}">
        <div class="k-tile k-tile-main">${img(k, main, 'k-main')}</div>
        ${extras.map(p => `<div class="k-tile">${img(k, p, 'k-main')}</div>`).join('')}
        ${cover(k, cov)}
      </div>
      ${body(a, k)}`,
  };

  // Titel so groß wie möglich auf die verfügbare Breite setzen.
  function fitTitle(page, layout) {
    const title = page.querySelector('.k-title');
    if (!title) return;
    const head = title.parentElement;
    const width = head.clientWidth;
    const lines = [...title.querySelectorAll('.k-title-line')];
    title.style.fontSize = '100px';
    const widest = Math.max(...lines.map(l => l.scrollWidth), 1);
    const max = layout === 'panel' ? 240 : layout === 'galerie' ? 200 : 260;
    let size = Math.min(max, (100 * width) / widest);
    title.style.fontSize = size.toFixed(2) + 'px';
    // Höhe begrenzen, damit ein zweizeiliger Titel nicht das Layout sprengt.
    const maxHeight = { vollbild: 330, panel: 300, split: 300, galerie: 230 }[layout];
    if (title.offsetHeight > maxHeight) {
      size *= maxHeight / title.offsetHeight;
      title.style.fontSize = size.toFixed(2) + 'px';
    }

    if (layout === 'split') {
      // Titel sitzt auf der Kante zwischen Foto und Fläche.
      const photo = page.querySelector('.k-photo');
      const h = title.offsetHeight;
      head.style.top = (photo.offsetHeight - h * 0.56) + 'px';
    }
  }

  function render(page, artist, kit, imageUrl) {
    const layout = LAYOUTS[kit.layout] ? kit.layout : 'vollbild';
    const accent = kit.accent || artist.accent || '#ff4d00';
    const panel = kit.panel || artist.panel || '#efece6';
    const titleKey = kit.titleFont || artist.titleFont || 'arial-narrow';
    const bodyKey = kit.bodyFont || artist.bodyFont || 'avenir';
    const photo = id => (id && imageUrl(id)) ? { id, url: imageUrl(id) } : null;
    const cov = photo(kit.coverImage);

    page.className = `page layout-${layout}` +
      (kit.uppercase ? ' is-upper' : '') +
      (kit.grayscale ? ' is-gray' : '') +
      (kit.titleAccent === false ? ' title-plain' : '') +
      (cov ? ' has-cover' : '') +
      (titleKey === 'avenir-bold' ? ' font-avenir' : titleKey === 'arial-narrow' ? ' font-narrow' : ' font-custom');
    page.style.setProperty('--accent', accent);
    page.style.setProperty('--on-accent', onColor(accent));
    page.style.setProperty('--panel', panel);
    page.style.setProperty('--ink', onColor(panel));
    page.style.setProperty('--title-font', fontStack(titleKey, 'arial-narrow'));
    page.style.setProperty('--body-font', fontStack(bodyKey, 'avenir'));
    page.style.setProperty('--shade', (kit.shade ?? 70) / 100);

    const main = photo(kit.mainImage);
    const extras = (kit.extraImages || []).slice(0, LAYOUTS[layout].extras).map(photo).filter(Boolean);
    page.innerHTML = templates[layout](artist, kit, main, extras, cov);

    // Verspätete Aufrufe (Schriften/Bilder geladen) ignorieren, wenn inzwischen ein anderes Layout aktiv ist.
    const fit = () => page.classList.contains('layout-' + layout) && fitTitle(page, layout);
    fit();
    document.fonts && document.fonts.ready.then(fit);
    page.querySelectorAll('img').forEach(i => i.complete || i.addEventListener('load', fit, { once: true }));
  }

  return { render, LAYOUTS, links, formatDate, crop };
})();
