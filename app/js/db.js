// Lokale Speicherung im Browser (IndexedDB): Artists inkl. Pressekits + Bilder als Blobs.
const DB = (() => {
  const NAME = 'pressekit-generator';
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, 3);
      req.onupgradeneeded = e => {
        const db = req.result;
        if (e.oldVersion < 1) {
          db.createObjectStore('artists', { keyPath: 'id' });
          const images = db.createObjectStore('images', { keyPath: 'id' });
          images.createIndex('artistId', 'artistId');
        }
        if (e.oldVersion < 2) db.createObjectStore('fonts', { keyPath: 'id' });
        if (e.oldVersion < 3) db.createObjectStore('settings', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const result = fn(s);
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
      t.onerror = () => reject(t.error);
    });
  }

  return {
    allArtists: () => tx('artists', 'readonly', s => s.getAll()),
    putArtist: a => tx('artists', 'readwrite', s => s.put(a)),
    deleteArtist: id => tx('artists', 'readwrite', s => s.delete(id)),
    allImages: () => tx('images', 'readonly', s => s.getAll()),
    putImage: img => tx('images', 'readwrite', s => s.put(img)),
    deleteImage: id => tx('images', 'readwrite', s => s.delete(id)),
    allFonts: () => tx('fonts', 'readonly', s => s.getAll()),
    putFont: f => tx('fonts', 'readwrite', s => s.put(f)),
    deleteFont: id => tx('fonts', 'readwrite', s => s.delete(id)),
    getSettings: () => tx('settings', 'readonly', s => s.get('main')),
    putSettings: v => tx('settings', 'readwrite', s => s.put({ ...v, id: 'main' })),
  };
})();
