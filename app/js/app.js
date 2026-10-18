// UI: Artists verwalten, Pressekits bearbeiten, Vorschau + PDF-Export.
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  const state = { artists: [], images: [], fonts: [], artistId: null, kitId: null, tab: 'kit', cropTarget: null, highlightUntil: 0 };
  const fontFaces = new Map(); // Font-ID -> FontFace

  const DEFAULT_SETTINGS = {
    contacts: [
      'jonas@newwavegermany.de', 'kontakt@newwavegermany.de', 'Lilly.brw@gmail.com', 'redaktion@hiphop.de',
      'geniusde@outlook.de', 'Fynn.mueller@e-pod.ch', 'gikkmagazin@gmx.at', 'info@visions.de',
      'redaktion@mzee.com', 'office@thegap.at', 'redaktion@backspin.de', 'info@mostdope.tv',
      'hi@kickdrum-magazin.de', 'hey@filterkaffee.art',
    ],
    subject: '{datum} {artist} - {titel}',
    template: 'Hallo,\n\n{mailtext}\n\nHier könnt ihr den Song schon einmal hören: {prelistening}\nPressefotos: {pressefotos}\n\nLG\n{signatur}',
    signature: '—\nSamuel Kowatschek\nArtist Management @ ungestuem\n@samukowatschek\n+43 677 61964250',
  };
  let settings = { ...DEFAULT_SETTINGS };
  const urls = new Map(); // Bild-ID -> Object-URL

  const DEFAULT_KIT = {
    layout: 'vollbild', releaseLabel: 'nächster release', crops: {},
    uppercase: true, titleBreak: false, titleAccent: true, grayscale: false, shade: 70,
    showSticker: true, stickerText: 'neue single', metaLeft: 'pressekit', extraImages: [], coverImage: null,
  };

  const artist = () => state.artists.find(a => a.id === state.artistId);
  const kit = () => artist()?.kits.find(k => k.id === state.kitId);
  const artistImages = () => state.images.filter(i => i.artistId === state.artistId);
  const imageUrl = id => (id && urls.get(id)) || null;

  // ---------- Links normalisieren ----------
  function normalizeUrl(value, kind) {
    let v = String(value || '').trim();
    if (!v) return '';
    const handle = v.replace(/^@/, '');
    if (kind === 'instagram' && !/[./]/.test(handle)) return `https://www.instagram.com/${handle}/`;
    if (kind === 'tiktok' && !/[./]/.test(handle)) return `https://www.tiktok.com/@${handle}`;
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    return v;
  }

  // ---------- Speichern ----------
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    setStatus('Speichert …');
    saveTimer = setTimeout(async () => {
      const a = artist();
      if (a) await DB.putArtist(a);
      setStatus('Gespeichert');
    }, 350);
  }
  function setStatus(t) { $('#status').textContent = t; }

  // ---------- Artists & Kits ----------
  function newKit(a, base = {}) {
    const last = a.kits[a.kits.length - 1] || {};
    return {
      ...DEFAULT_KIT,
      pressefotos: last.pressefotos || '',
      ...base,
      id: uid(),
      text: base.text ?? a.defaultText ?? '',
      mainImage: base.mainImage ?? artistImagesOf(a.id)[0]?.id ?? null,
      created: Date.now(),
    };
  }
  const artistImagesOf = id => state.images.filter(i => i.artistId === id);

  async function addArtist() {
    const a = {
      id: uid(), name: 'Neuer Artist', instagram: '', tiktok: '', spotify: '', defaultText: '',
      accent: '#ff4d00', panel: '#efece6', titleFont: 'arial-narrow', kits: [], created: Date.now(),
    };
    a.kits.push(newKit(a, { name: 'Allgemein' }));
    state.artists.push(a);
    await DB.putArtist(a);
    selectArtist(a.id, 'artist');
    $('[data-a="name"]').select();
  }

  function selectArtist(id, tab) {
    state.artistId = id;
    const a = artist();
    state.kitId = a?.kits[a.kits.length - 1]?.id || null;
    if (tab) state.tab = tab;
    renderAll();
  }

  // ---------- Bilder ----------
  async function downscale(file, max = 3000) {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
  }

  async function addImages(files) {
    const a = artist();
    if (!a) return;
    setStatus('Bilder werden geladen …');
    for (const f of [...files].filter(f => f.type.startsWith('image/'))) {
      const img = { id: uid(), artistId: a.id, name: f.name, blob: await downscale(f), created: Date.now() };
      await DB.putImage(img);
      state.images.push(img);
      urls.set(img.id, URL.createObjectURL(img.blob));
    }
    a.kits.forEach(k => { if (!k.mainImage) k.mainImage = artistImages()[0]?.id || null; });
    save();
    renderAll();
  }

  async function removeImage(id) {
    if (!confirm('Bild löschen? Es verschwindet auch aus allen Pressekits dieses Artists.')) return;
    await DB.deleteImage(id);
    state.images = state.images.filter(i => i.id !== id);
    URL.revokeObjectURL(urls.get(id));
    urls.delete(id);
    const a = artist();
    a.kits.forEach(k => {
      if (k.mainImage === id) k.mainImage = artistImages()[0]?.id || null;
      if (k.coverImage === id) k.coverImage = null;
      k.extraImages = (k.extraImages || []).filter(x => x !== id);
    });
    save();
    renderAll();
  }

  // ---------- Rendering ----------
  function renderSidebar() {
    $('#artist-list').innerHTML = state.artists.map(a => `
      <li><button data-artist="${a.id}" class="${a.id === state.artistId ? 'active' : ''}">
        <span class="dot" style="background:${a.accent}"></span>${escapeHtml(a.name || 'Ohne Namen')}
      </button></li>`).join('');
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function fillFields() {
    const a = artist(), k = kit();
    $$('[data-a]').forEach(el => setValue(el, a?.[el.dataset.a]));
    $$('[data-k]').forEach(el => {
      const key = el.dataset.k;
      let v = k?.[key];
      if (v == null || v === '') {
        if (['accent', 'panel', 'titleFont', 'bodyFont'].includes(key)) v = a?.[key];
      }
      setValue(el, v);
    });
  }
  function setValue(el, v) {
    if (document.activeElement === el) return;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v ?? (el.type === 'color' ? '#000000' : '');
    if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.selectedIndex = 0;
  }

  function renderKitSelect() {
    const a = artist();
    $('#kit-select').innerHTML = a.kits.map(k =>
      `<option value="${k.id}" ${k.id === state.kitId ? 'selected' : ''}>${escapeHtml(k.name || k.releaseTitle || 'Pressekit')}</option>`).join('');
    $('#kit-del').disabled = a.kits.length < 2;
  }

  const LAYOUT_ICONS = {
    vollbild: '<rect x="1" y="1" width="32" height="44" fill="#bbb"/><rect x="4" y="5" width="26" height="6" fill="#161616"/><rect x="4" y="34" width="15" height="7" fill="#fff"/><rect x="22" y="34" width="8" height="7" fill="#fff"/>',
    panel: '<rect x="1" y="1" width="32" height="44" fill="#bbb"/><rect x="5" y="5" width="24" height="36" fill="#fff"/><rect x="8" y="13" width="18" height="6" fill="#161616"/><rect x="8" y="30" width="18" height="8" fill="#ddd"/>',
    galerie: '<rect x="1" y="1" width="32" height="44" fill="#fff" stroke="#ddd"/><rect x="4" y="4" width="26" height="6" fill="#161616"/><rect x="4" y="12" width="16" height="19" fill="#bbb"/><rect x="21" y="12" width="9" height="9" fill="#bbb"/><rect x="21" y="22" width="9" height="9" fill="#bbb"/><rect x="4" y="34" width="15" height="8" fill="#ddd"/>',
    split: '<rect x="1" y="1" width="32" height="44" fill="#fff" stroke="#ddd"/><rect x="1" y="1" width="32" height="25" fill="#bbb"/><rect x="4" y="22" width="26" height="7" fill="#161616"/><rect x="4" y="33" width="15" height="8" fill="#ddd"/>',
  };
  function renderLayoutSeg() {
    const k = kit();
    $('#layout-seg').innerHTML = Object.entries(Kit.LAYOUTS).map(([key, l]) => `
      <button data-layout="${key}" class="${k.layout === key ? 'active' : ''}">
        <svg viewBox="0 0 34 46">${LAYOUT_ICONS[key]}</svg>${l.label}
      </button>`).join('');
  }

  function thumb(img, extra = '') {
    return `<img src="${imageUrl(img.id)}" alt="">${extra}`;
  }

  function renderImages() {
    const imgs = artistImages(), k = kit();
    $('#pool').innerHTML = imgs.map(i => `<div class="thumb">${thumb(i)}<button class="x" data-remove="${i.id}" title="Löschen">×</button></div>`).join('');
    $('#main-picker').innerHTML = imgs.map(i =>
      `<button class="thumb ${k.mainImage === i.id ? 'sel' : ''}" data-main="${i.id}">${thumb(i, k.mainImage === i.id ? '<span class="badge">Haupt</span>' : '')}</button>`).join('');

    $('#cover-picker').innerHTML =
      `<button class="thumb thumb-none ${!k.coverImage ? 'sel' : ''}" data-cover="none">kein<br>Cover</button>` +
      imgs.map(i => `<button class="thumb ${k.coverImage === i.id ? 'sel' : ''}" data-cover="${i.id}">${thumb(i, k.coverImage === i.id ? '<span class="badge">Cover</span>' : '')}</button>`).join('');

    const max = Kit.LAYOUTS[k.layout].extras;
    $('#extras-wrap').hidden = max === 0;
    $('#extras-hint').textContent = `bis zu ${max} im Layout „${Kit.LAYOUTS[k.layout].label}“`;
    const extras = (k.extraImages || []).slice(0, max);
    $('#extra-picker').innerHTML = imgs.filter(i => i.id !== k.mainImage && i.id !== k.coverImage).map(i => {
      const n = extras.indexOf(i.id);
      return `<button class="thumb ${n > -1 ? 'sel' : ''}" data-extra="${i.id}">${thumb(i, n > -1 ? `<span class="badge">+${n + 1}</span>` : '')}</button>`;
    }).join('');
    $('#shade-field').style.display = k.layout === 'vollbild' ? '' : 'none';
    renderCropControls();
  }

  function renderWordCount() {
    const n = (kit()?.text || '').replace(/\*\*/g, '').split(/\s+/).filter(Boolean).length;
    const el = $('#word-count');
    el.textContent = `${n} Wörter`;
    el.className = 'count ' + (n >= 50 && n <= 100 ? 'ok' : 'warn');
  }

  function renderPreview() {
    const a = artist(), k = kit(), page = $('#page');
    if (!a || !k) { page.innerHTML = ''; page.className = 'page'; return; }
    Kit.render(page, a, k, imageUrl);
    if (Date.now() < state.highlightUntil) markCropTarget();
    fitPreview();
    const missing = [];
    if (!k.mainImage) missing.push('Hauptbild');
    if (!Kit.links(a, k).length) missing.push('Links');
    if (missing.length) setStatus('Fehlt noch: ' + missing.join(', '));
    renderMailPreview();
  }

  function fitPreview() {
    const stage = $('#stage'), page = $('#page'), scaler = $('#scaler');
    const w = stage.clientWidth - 44, h = stage.clientHeight - 28;
    const s = Math.min(w / page.offsetWidth, h / page.offsetHeight, 1.4);
    page.style.transform = `scale(${s})`;
    scaler.style.width = page.offsetWidth * s + 'px';
    scaler.style.height = page.offsetHeight * s + 'px';
  }

  function renderAll() {
    renderSidebar();
    const a = artist();
    $('#empty').hidden = !!a;
    $('#editor-content').hidden = !a;
    if (a) {
      $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.tab));
      $$('.tab-panel').forEach(p => p.hidden = p.dataset.panel !== state.tab);
      renderFontSelects();
      renderKitSelect();
      renderLayoutSeg();
      renderImages();
      fillFields();
      renderWordCount();
    }
    renderPreview();
  }

  // ---------- Bildausschnitt pro Foto ----------
  // Welche Fotos das aktuelle Layout zeigt, mit Rolle als Hinweis.
  function cropTargets() {
    const k = kit(), byId = id => state.images.find(i => i.id === id);
    const list = [];
    if (k.mainImage) list.push({ id: k.mainImage, role: 'Hauptbild' });
    (k.extraImages || []).slice(0, Kit.LAYOUTS[k.layout].extras)
      .forEach((id, i) => list.push({ id, role: `Zusatzbild ${i + 1}` }));
    if (k.coverImage) list.push({ id: k.coverImage, role: 'Cover' });
    return list.filter(t => byId(t.id)).map(t => ({ ...t, name: byId(t.id).name }));
  }

  function renderCropControls() {
    const k = kit(), targets = cropTargets();
    if (!targets.some(t => t.id === state.cropTarget)) state.cropTarget = targets[0]?.id || null;
    $('#crop-target').innerHTML = targets.map(t =>
      `<option value="${t.id}" ${t.id === state.cropTarget ? 'selected' : ''}>${t.role} – ${escapeHtml(t.name.replace(/\.[^.]+$/, ''))}</option>`).join('');
    const disabled = !state.cropTarget;
    $$('[data-crop], #crop-target').forEach(el => el.disabled = disabled);
    if (disabled) { $('#crop-thumb').removeAttribute('src'); return; }
    $('#crop-thumb').src = imageUrl(state.cropTarget);
    const c = Kit.crop(k, state.cropTarget);
    $('#crop-x').value = c.x; $('#crop-y').value = c.y; $('#crop-z').value = c.z;
  }

  function markCropTarget() {
    $$('#page img[data-id]').forEach(i => i.classList.toggle('is-cropping', i.dataset.id === state.cropTarget));
  }
  function flashCropTarget() {
    state.highlightUntil = Date.now() + 1500;
    markCropTarget();
    clearTimeout(flashCropTarget.t);
    flashCropTarget.t = setTimeout(() => $$('#page img.is-cropping').forEach(i => i.classList.remove('is-cropping')), 1500);
  }

  $('#crop-target').onchange = e => { state.cropTarget = e.target.value; renderCropControls(); flashCropTarget(); };
  $('#crop-reset').onclick = () => {
    const k = kit();
    if (!state.cropTarget) return;
    k.crops = { ...(k.crops || {}), [state.cropTarget]: { x: 50, y: state.cropTarget === k.mainImage ? 35 : 50, z: 100 } };
    save(); renderCropControls(); renderPreview(); flashCropTarget();
  };

  // ---------- Eigene Schriften ----------
  const BUILTIN_FONTS = {
    title: [['arial-narrow', 'Arial Narrow'], ['avenir-bold', 'Avenir Next Bold']],
    body: [['avenir', 'Avenir Next']],
  };

  async function registerFont(f) {
    const face = new FontFace('PKF-' + f.id, await f.blob.arrayBuffer(), { weight: '100 900' });
    await face.load();
    document.fonts.add(face);
    fontFaces.set(f.id, face);
  }

  function renderFontSelects() {
    const custom = state.fonts.map(f => [`custom:${f.id}`, f.name]);
    $$('select[data-fonts]').forEach(sel => {
      const opts = [...BUILTIN_FONTS[sel.dataset.fonts], ...custom];
      sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('') +
        (custom.length ? '' : '<option value="" disabled>+ eigene Schrift: „Schriften verwalten“</option>');
    });
  }

  function renderFontList() {
    $('#font-list').innerHTML = state.fonts.length
      ? state.fonts.map(f => `
        <li>
          <span class="sample" style="font-family:'PKF-${f.id}'">${escapeHtml(artist()?.name || 'Aa Bb Cc 123')}<span class="name">${escapeHtml(f.name)}</span></span>
          <button class="link-btn" data-remove-font="${f.id}">Entfernen</button>
        </li>`).join('')
      : '<li class="empty">Noch keine eigenen Schriften.</li>';
  }

  async function addFonts(files) {
    for (const file of [...files].filter(f => /\.(otf|ttf|woff2?)$/i.test(f.name))) {
      const f = {
        id: uid(),
        name: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
        blob: file,
        created: Date.now(),
      };
      try {
        await registerFont(f);
      } catch {
        alert(`„${file.name}“ konnte nicht als Schrift gelesen werden.`);
        continue;
      }
      await DB.putFont(f);
      state.fonts.push(f);
    }
    renderFontList();
    renderAll();
  }

  async function removeFont(id) {
    const f = state.fonts.find(x => x.id === id);
    if (!confirm(`Schrift „${f.name}“ entfernen? Pressekits, die sie nutzen, fallen auf die Standardschrift zurück.`)) return;
    await DB.deleteFont(id);
    state.fonts = state.fonts.filter(x => x.id !== id);
    if (fontFaces.has(id)) document.fonts.delete(fontFaces.get(id));
    fontFaces.delete(id);
    renderFontList();
    renderAll();
  }

  $('#fonts-open').onclick = () => { renderFontList(); $('#fonts-dialog').showModal(); };
  $('#fonts-close').onclick = () => $('#fonts-dialog').close();
  $('#font-input').onchange = e => { addFonts(e.target.files); e.target.value = ''; };
  const fontDrop = $('#font-drop');
  ['dragenter', 'dragover'].forEach(ev => fontDrop.addEventListener(ev, e => { e.preventDefault(); fontDrop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => fontDrop.addEventListener(ev, e => { e.preventDefault(); fontDrop.classList.remove('over'); }));
  fontDrop.addEventListener('drop', e => addFonts(e.dataTransfer.files));

  // ---------- Events ----------
  document.addEventListener('input', e => {
    const el = e.target, a = artist();
    if (!a) return;
    if (el.dataset.crop) {
      const k = kit();
      k.crops = { ...(k.crops || {}), [state.cropTarget]: { ...Kit.crop(k, state.cropTarget), [el.dataset.crop]: Number(el.value) } };
      state.highlightUntil = Date.now() + 1500;
      save(); renderPreview(); flashCropTarget();
      return;
    }
    const val = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    if (el.dataset.a) {
      const key = el.dataset.a;
      // Artist-Farben/Schrift gelten für alle Kits, die sie nicht selbst überschreiben.
      a[key] = val;
      if (key === 'name' || key === 'accent') renderSidebar();
    } else if (el.dataset.k) {
      kit()[el.dataset.k] = val;
      if (el.dataset.k === 'text') renderWordCount();
      if (el.dataset.k === 'name' || el.dataset.k === 'releaseTitle') renderKitSelect();
    } else return;
    save();
    renderPreview();
  });

  document.addEventListener('change', e => {
    const el = e.target;
    if (!el.dataset.url) return;
    const v = normalizeUrl(el.value, el.dataset.url);
    if (v === el.value) return;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  document.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    const k = kit();
    if (t.dataset.artist) selectArtist(t.dataset.artist);
    else if (t.dataset.tab) { state.tab = t.dataset.tab; renderAll(); }
    else if (t.dataset.layout) { k.layout = t.dataset.layout; save(); renderAll(); }
    else if (t.dataset.main) {
      k.mainImage = t.dataset.main;
      k.extraImages = (k.extraImages || []).filter(x => x !== k.mainImage);
      save(); renderAll();
    } else if (t.dataset.extra) {
      const max = Kit.LAYOUTS[k.layout].extras;
      let ex = (k.extraImages || []).slice(0, max);
      ex = ex.includes(t.dataset.extra) ? ex.filter(x => x !== t.dataset.extra) : [...ex, t.dataset.extra].slice(-max);
      k.extraImages = ex;
      save(); renderAll();
    } else if (t.dataset.cover) {
      k.coverImage = t.dataset.cover === 'none' ? null : t.dataset.cover;
      if (k.coverImage === k.mainImage) k.mainImage = artistImages().find(i => i.id !== k.coverImage)?.id || k.mainImage;
      k.extraImages = (k.extraImages || []).filter(x => x !== k.coverImage);
      save(); renderAll();
    } else if (t.dataset.removeFont) removeFont(t.dataset.removeFont);
    else if (t.dataset.remove) removeImage(t.dataset.remove);
  });

  $('#add-artist').onclick = addArtist;

  $('#delete-artist').onclick = async () => {
    const a = artist();
    if (!confirm(`„${a.name}“ mit allen Pressekits und Bildern löschen?`)) return;
    for (const i of artistImages()) await DB.deleteImage(i.id);
    state.images = state.images.filter(i => i.artistId !== a.id);
    await DB.deleteArtist(a.id);
    state.artists = state.artists.filter(x => x.id !== a.id);
    selectArtist(state.artists[0]?.id || null);
  };

  $('#kit-select').onchange = e => { state.kitId = e.target.value; renderAll(); };
  $('#kit-new').onclick = () => {
    const a = artist(), k = newKit(a, { name: '' });
    a.kits.push(k); state.kitId = k.id; save(); renderAll();
    $('[data-k="name"]').focus();
  };
  $('#kit-dup').onclick = () => {
    const a = artist(), src = kit();
    const k = { ...structuredClone(src), id: uid(), name: (src.name || 'Pressekit') + ' Kopie', created: Date.now() };
    a.kits.push(k); state.kitId = k.id; save(); renderAll();
  };
  $('#kit-del').onclick = () => {
    const a = artist();
    if (a.kits.length < 2 || !confirm('Dieses Pressekit löschen?')) return;
    a.kits = a.kits.filter(k => k.id !== state.kitId);
    state.kitId = a.kits[a.kits.length - 1].id;
    save(); renderAll();
  };
  // Für ein allgemeines EPK: Release-Felder leeren, Sticker („neue single“) ausblenden
  // und statt des Release-Texts den allgemeinen Pressetext des Artists verwenden.
  $('#clear-release').onclick = () => {
    Object.assign(kit(), {
      releaseTitle: '', releaseDate: '', producer: '', releaseLabel: DEFAULT_KIT.releaseLabel,
      showSticker: false, text: artist().defaultText || '', mailText: '',
    });
    save(); renderAll();
  };

  $('#use-default-text').onclick = () => {
    kit().text = artist().defaultText || '';
    save(); renderAll();
  };

  // Bilder: Dateiauswahl + Drag & Drop
  $('#image-input').onchange = e => { addImages(e.target.files); e.target.value = ''; };
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addImages(e.dataTransfer.files));

  // PDF: Browser-Druck auf A4 – Links bleiben klickbar, Text bleibt Vektor.
  // PDF: Der lokale Server druckt die Seite exakt auf A4 (ohne Druckdialog).
  // Läuft der Server nicht, bleibt der Browser-Druck als Ausweichweg.
  function printFallback() {
    const prev = document.title;
    document.title = fileName();
    window.print();
    document.title = prev;
  }

  $('#export').onclick = async () => {
    const a = artist(), k = kit();
    if (!a || !k) return;
    if (!k.mainImage) { alert('Bitte mindestens ein Pressebild hinzufügen und als Hauptbild wählen.'); return; }
    const btn = $('#export');
    btn.disabled = true;
    setStatus('PDF wird erstellt …');
    try {
      const res = await fetch('api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: await standaloneHtml() }),
      });
      if (!res.ok || res.headers.get('Content-Type') !== 'application/pdf') {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server antwortet nicht (${res.status})`);
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(await res.blob());
      link.download = fileName() + '.pdf';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
      setStatus('PDF gespeichert (Downloads)');
    } catch (err) {
      setStatus('');
      if (confirm(`Die PDF konnte nicht direkt erstellt werden:\n${err.message}\n\nStattdessen über den Druckdialog speichern? (Ränder: Keine, Hintergrundgrafiken: an)`)) printFallback();
    } finally {
      btn.disabled = false;
    }
  };
  window.addEventListener('beforeprint', () => { $('#page').style.transform = 'none'; });
  window.addEventListener('afterprint', fitPreview);
  new ResizeObserver(fitPreview).observe($('#stage'));

  // ---------- Mail ----------
  const plain = t => String(t || '').replace(/\*\*(.+?)\*\*/g, '$1').trim();
  const today = () => new Date().toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });

  function mailValues(a, k) {
    return {
      mailtext: plain(k.mailText) || plain(k.text),
      artist: a.name || '',
      titel: k.releaseTitle || k.name || 'Pressekit',
      datum: k.releaseDate ? Kit.formatDate(k.releaseDate) : today(),
      'vö': k.releaseDate ? Kit.formatDate(k.releaseDate) : '',
      prelistening: k.preListening || '',
      pressefotos: k.pressefotos || '',
      spotify: a.spotify || '',
      instagram: a.instagram || '',
      tiktok: a.tiktok || '',
      signatur: settings.signature || '',
    };
  }

  // Platzhalter ersetzen; Zeilen, deren Platzhalter alle leer sind, fallen weg.
  function fill(template, values) {
    return template.split('\n').filter(line => {
      const keys = [...line.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);
      return !keys.length || keys.some(key => values[key]);
    }).join('\n').replace(/\{([^}]+)\}/g, (m, key) => values[key] ?? m)
      .replace(/\n{3,}/g, '\n\n').trim();
  }

  function buildMail() {
    const a = artist(), k = kit(), v = mailValues(a, k);
    return {
      subject: fill(settings.subject, v).replace(/\s+/g, ' '),
      body: fill(settings.template, v),
      bcc: settings.contacts,
    };
  }

  function renderMailPreview() {
    const el = $('#mail-preview');
    if (!el || !kit()) return;
    const m = buildMail();
    el.innerHTML = `<b>BCC:</b> ${m.bcc.length} Kontakte\n<b>Betreff:</b> ${escapeHtml(m.subject)}\n\n${escapeHtml(m.body)}`;
  }

  const parseContacts = t => [...new Set(t.split(/[\s,;]+/).map(x => x.trim()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))];

  function renderSettings() {
    $('#set-contacts').value = settings.contacts.join('\n');
    $('#set-subject').value = settings.subject;
    $('#set-template').value = settings.template;
    $('#set-signature').value = settings.signature;
    updateContactsCount();
  }
  function updateContactsCount() {
    const n = parseContacts($('#set-contacts').value).length;
    $('#contacts-count').textContent = `${n} gültige Adressen`;
    $('#contacts-count').className = 'count ' + (n ? 'ok' : 'warn');
  }
  $('#set-contacts').addEventListener('input', updateContactsCount);
  $('#settings-open').onclick = () => { renderSettings(); $('#settings-dialog').showModal(); };
  $('#settings-close').onclick = async () => {
    settings = {
      contacts: parseContacts($('#set-contacts').value),
      subject: $('#set-subject').value.trim() || DEFAULT_SETTINGS.subject,
      template: $('#set-template').value || DEFAULT_SETTINGS.template,
      signature: $('#set-signature').value,
    };
    await DB.putSettings(settings);
    $('#settings-dialog').close();
    setStatus('Einstellungen gespeichert');
    renderMailPreview();
  };

  // Eigenständiges HTML der Seite (Bilder + eigene Schriften eingebettet) für den PDF-Druck im Server.
  async function standaloneHtml() {
    const page = $('#page').cloneNode(true);
    page.style.transform = 'none';
    page.querySelectorAll('.is-cropping').forEach(i => i.classList.remove('is-cropping'));
    const css = await (await fetch('css/kit.css')).text();
    const dataUrls = new Map();
    for (const img of page.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      if (!dataUrls.has(src)) dataUrls.set(src, await blobToDataUrl(await (await fetch(src)).blob()));
      img.setAttribute('src', dataUrls.get(src));
    }
    const a = artist(), k = kit();
    const used = [k.titleFont || a.titleFont, k.bodyFont || a.bodyFont].filter(f => f && f.startsWith('custom:')).map(f => f.slice(7));
    const faces = await Promise.all(state.fonts.filter(f => used.includes(f.id)).map(async f =>
      `@font-face{font-family:"PKF-${f.id}";src:url(${await blobToDataUrl(f.blob)});font-weight:100 900;}`));
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>${faces.join('')}
      @page{size:A4;margin:0}html,body{margin:0;padding:0}${css}</style></head><body>${page.outerHTML}</body></html>`;
  }

  const fileName = () => `${artist().name} – Pressekit${kit().name ? ' ' + kit().name : ''}`;

  function mailtoFallback(m) {
    const q = `bcc=${encodeURIComponent(m.bcc.join(','))}&subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
    location.href = `mailto:?${q}`;
  }

  $('#mail').onclick = async () => {
    const a = artist(), k = kit();
    if (!a || !k) return;
    if (!k.mainImage) { alert('Bitte mindestens ein Pressebild hinzufügen und als Hauptbild wählen.'); return; }
    if (!settings.contacts.length && !confirm('Es sind keine Ansprechpartner:innen hinterlegt. Trotzdem fortfahren?')) return;
    const m = buildMail();
    const btn = $('#mail');
    btn.disabled = true;
    setStatus('PDF wird erstellt …');
    try {
      const res = await fetch('api/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...m, html: await standaloneHtml(), filename: fileName() }),
      });
      const data = await res.json().catch(() => ({ error: `Server antwortet nicht richtig (${res.status}). Läuft die App über start.command?` }));
      if (!res.ok) throw new Error(data.error);
      setStatus('Mail-Entwurf geöffnet · PDF liegt in Downloads/Pressekits');
    } catch (err) {
      setStatus('');
      if (confirm(`Mail mit Anhang konnte nicht erstellt werden:\n${err.message}\n\nStattdessen eine Mail ohne Anhang öffnen? Das PDF exportierst du dann über „PDF exportieren“ und hängst es selbst an.`)) {
        mailtoFallback(m);
      }
    } finally {
      btn.disabled = false;
    }
  };

  // ---------- Backup ----------
  const blobToDataUrl = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });

  $('#backup-export').onclick = async () => {
    setStatus('Backup wird erstellt …');
    const images = await Promise.all(state.images.map(async i => ({ ...i, blob: await blobToDataUrl(i.blob) })));
    const fonts = await Promise.all(state.fonts.map(async f => ({ ...f, blob: await blobToDataUrl(f.blob) })));
    const data = JSON.stringify({ version: 3, artists: state.artists, images, fonts, settings });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    link.download = `pressekit-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setStatus('Backup gespeichert');
  };

  $('#backup-import').onchange = async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      for (const i of data.images || []) {
        const img = { ...i, blob: await (await fetch(i.blob)).blob() };
        await DB.putImage(img);
      }
      for (const f of data.fonts || []) await DB.putFont({ ...f, blob: await (await fetch(f.blob)).blob() });
      for (const a of data.artists || []) await DB.putArtist(a);
      if (data.settings) await DB.putSettings(data.settings);
      await load();
      setStatus(`Backup geladen: ${data.artists?.length || 0} Artists`);
    } catch (err) {
      alert('Backup konnte nicht gelesen werden.');
    }
  };

  // ---------- Start ----------
  async function load() {
    state.artists = (await DB.allArtists()).sort((a, b) => a.created - b.created);
    state.images = (await DB.allImages()).sort((a, b) => a.created - b.created);
    urls.forEach(u => URL.revokeObjectURL(u));
    urls.clear();
    state.images.forEach(i => urls.set(i.id, URL.createObjectURL(i.blob)));
    settings = { ...DEFAULT_SETTINGS, ...(await DB.getSettings()) };
    delete settings.id;
    state.fonts = (await DB.allFonts()).sort((a, b) => a.created - b.created);
    for (const f of state.fonts) if (!fontFaces.has(f.id)) await registerFont(f).catch(() => {});

    // Früher war das Cover im Vollbild-Layout das erste Zusatzbild,
    // und Fokus/Zoom gab es nur fürs Hauptbild.
    state.artists.forEach(a => a.kits.forEach(k => {
      if (!k.crops) {
        k.crops = {};
        if (k.mainImage && (k.focusX != null || k.focusY != null || k.zoom != null)) {
          k.crops[k.mainImage] = { x: k.focusX ?? 50, y: k.focusY ?? 35, z: k.zoom ?? 100 };
        }
      }
      if (k.coverImage === undefined) {
        k.coverImage = k.layout === 'vollbild' ? (k.extraImages || [])[0] || null : null;
        if (k.coverImage) k.extraImages = k.extraImages.filter(x => x !== k.coverImage);
      }
    }));
    selectArtist(state.artists.find(a => a.id === state.artistId)?.id || state.artists[0]?.id || null);
  }

  load();
})();
