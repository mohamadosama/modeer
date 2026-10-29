/**
 * Modeer Cloudflare Edge & D1 Sync Adapter
 * Replaces Electron preload.js with cloud synchronization to Cloudflare D1.
 * Supports D1 SQL database storage + Chunked Base64 Attachment Storage.
 */

(function () {
  const DEFAULT_COMPANY = 'Tijarahub';

  function getActiveCompany() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlCo = urlParams.get('company');
      if (urlCo && urlCo.trim()) return urlCo.trim();
      const stored = localStorage.getItem('modeer_active_company');
      if (stored && stored.trim()) return stored.trim();
    } catch (e) {}
    return DEFAULT_COMPANY;
  }

  function setActiveCompany(company) {
    try {
      localStorage.setItem('modeer_active_company', company);
      const url = new URL(window.location.href);
      url.searchParams.set('company', company);
      window.location.href = url.toString();
    } catch (e) {
      window.location.reload();
    }
  }

  function snapshot() {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('acc_') || k.startsWith('disk_') || k.startsWith('co_'))) {
        o[k] = localStorage.getItem(k);
      }
    }
    return o;
  }

  function setupDesktopPolyfill(company, baseCur) {
    window.desktop = {
      company: company,
      baseCur: baseCur || 'USD',
      saveFullBackup: async (txt) => {
        try {
          const blob = new Blob([txt], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `backup-${company}-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          return true;
        } catch (e) {
          return false;
        }
      },
      savePdf: (name) => {
        window.print();
        return Promise.resolve(true);
      },
      clipPdf: (name) => {
        window.print();
        return Promise.resolve(true);
      },
      coPeers: async () => {
        try {
          const res = await fetch('/api/companies');
          const data = await res.json();
          return (data.companies || []).map((c) => ({
            name: c.id,
            rows: [],
            coa: [],
          }));
        } catch (e) {
          return [];
        }
      },
      dsInfo: () => Promise.resolve({ dir: 'Cloudflare D1 Edge', portable: true }),
    };
  }

  let statusEl = null;
  function updateStatus(state, msg) {
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'modeer-cloud-status';
      statusEl.style.cssText =
        'position:fixed;bottom:10px;left:12px;z-index:999999;font-family:system-ui,-apple-system,sans-serif;font-size:12px;padding:5px 12px;border-radius:20px;display:flex;align-items:center;gap:6px;box-shadow:0 2px 10px rgba(0,0,0,0.12);transition:all 0.3s ease;pointer-events:auto;cursor:pointer;';
      document.body.appendChild(statusEl);
    }

    if (state === 'syncing') {
      statusEl.style.background = '#eff6ff';
      statusEl.style.color = '#1d4ed8';
      statusEl.style.border = '1px solid #bfdbfe';
      statusEl.innerHTML = `<span style="display:inline-block;animation:spin 1s linear infinite">⏳</span> <span>${msg || 'جاري الحفظ في D1...'}</span>`;
    } else if (state === 'saved') {
      statusEl.style.background = '#f0fdf4';
      statusEl.style.color = '#15803d';
      statusEl.style.border = '1px solid #bbf7d0';
      statusEl.innerHTML = `<span style="color:#22c55e">●</span> <span>${msg || 'محفوظ في Cloudflare D1'}</span>`;
    } else if (state === 'error') {
      statusEl.style.background = '#fef2f2';
      statusEl.style.color = '#b91c1c';
      statusEl.style.border = '1px solid #fecaca';
      statusEl.innerHTML = `<span>⚠️</span> <span>${msg || 'تعذر الحفظ في السحابة'}</span>`;
    } else if (state === 'connected') {
      const co = getActiveCompany();
      statusEl.style.background = '#f8fafc';
      statusEl.style.color = '#334155';
      statusEl.style.border = '1px solid #cbd5e1';
      statusEl.innerHTML = `<span>🏢</span> <b>${co}</b> <span style="color:#22c55e;font-size:10px">● D1</span>`;
    }
  }

  function injectCompanySwitcher(companies) {
    const active = getActiveCompany();
    const nav = document.createElement('div');
    nav.id = 'modeer-company-nav';
    nav.style.cssText =
      'position:fixed;top:8px;left:12px;z-index:999999;display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.92);backdrop-filter:blur(6px);border:1px solid #cbd5e1;padding:4px 8px;border-radius:20px;font-family:system-ui,-apple-system,sans-serif;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);direction:rtl;';

    const label = document.createElement('span');
    label.textContent = 'الشركة:';
    label.style.fontWeight = 'bold';
    label.style.color = '#475569';
    nav.appendChild(label);

    const sel = document.createElement('select');
    sel.style.cssText =
      'border:0;background:transparent;font-size:12px;font-weight:700;color:#0f172a;cursor:pointer;outline:none;padding-inline-end:4px;';

    const known = companies && companies.length ? companies.map((c) => c.id) : ['Tijarahub', 'VOOM', 'Commerc Of Agency'];
    if (!known.includes(active)) known.push(active);

    known.forEach((co) => {
      const opt = document.createElement('option');
      opt.value = co;
      opt.textContent = co;
      if (co === active) opt.selected = true;
      sel.appendChild(opt);
    });

    const addOpt = document.createElement('option');
    addOpt.value = '__new__';
    addOpt.textContent = '+ شركة جديدة...';
    sel.appendChild(addOpt);

    sel.onchange = (e) => {
      if (e.target.value === '__new__') {
        const name = prompt('اكتب اسم الشركة الجديدة:');
        if (name && name.trim()) {
          setActiveCompany(name.trim());
        } else {
          sel.value = active;
        }
      } else {
        setActiveCompany(e.target.value);
      }
    };

    nav.appendChild(sel);
    document.body.appendChild(nav);
  }

  let lastSaved = '';
  let isSaving = false;

  async function tick() {
    if (isSaving) return;
    const cur = snapshot();
    const s = JSON.stringify(cur);
    if (s === lastSaved) return;

    const co = getActiveCompany();
    isSaving = true;
    updateStatus('syncing');

    try {
      const res = await fetch(`/api/data?company=${encodeURIComponent(co)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: cur }),
      });

      if (res.ok) {
        lastSaved = s;
        updateStatus('saved');
        setTimeout(() => updateStatus('connected'), 2000);
      } else {
        updateStatus('error');
      }
    } catch (err) {
      updateStatus('error');
    } finally {
      isSaving = false;
    }
  }

  /* ==========================================================================
     Cloudflare D1 Attachment Storage (Base64 + IndexedDB local fast-cache)
     ========================================================================== */
  const ModeerFS = (() => {
    let db = null;
    const open = () =>
      db
        ? Promise.resolve(db)
        : new Promise((res, rej) => {
            try {
              const q = indexedDB.open('acc_files_db', 1);
              q.onupgradeneeded = () => {
                const s = q.result.createObjectStore('f', { keyPath: 'id' });
                s.createIndex('owner', 'owner');
              };
              q.onsuccess = () => {
                db = q.result;
                res(db);
              };
              q.onerror = () => rej(q.error);
            } catch (e) {
              rej(e);
            }
          });

    const run = (mode, fn) =>
      open().then(
        (d) =>
          new Promise((res, rej) => {
            const t = d.transaction('f', mode),
              s = t.objectStore('f'),
              r = fn(s);
            t.oncomplete = () => res(r && r.result);
            t.onerror = () => rej(t.error);
            t.onabort = () => rej(t.error);
          })
      );

    const localFS = {
      put: (rec) => run('readwrite', (s) => s.put(rec)),
      del: (id) => run('readwrite', (s) => s.delete(id)),
      list: (owner) =>
        run('readonly', (s) => s.index('owner').getAll(owner)).then((a) =>
          (a || []).sort((x, y) => ((x.at || '') < (y.at || '') ? 1 : -1))
        ),
      all: () => run('readonly', (s) => s.getAll()),
      clear: () => run('readwrite', (s) => s.clear()),
    };

    const blobToUrl = (b) =>
      new Promise((r) => {
        const f = new FileReader();
        f.onload = () => r(f.result);
        f.readAsDataURL(b);
      });

    const urlToBlob = (u) =>
      Promise.resolve().then(() => {
        const [hd, b] = String(u).split(',');
        const mime = (hd.match(/:(.*?)[;,]/) || [])[1] || 'application/octet-stream';
        const bin = atob(b || '');
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
      });

    return {
      put: async (rec) => {
        // 1. Cache locally in IndexedDB
        try {
          await localFS.put(rec);
        } catch (e) {}

        const company = getActiveCompany();
        updateStatus('syncing', 'جاري رفع المرفق إلى D1...');

        let dataUrl = '';
        if (rec.blob) {
          dataUrl = await blobToUrl(rec.blob);
        } else if (rec.data) {
          dataUrl = rec.data;
        }

        const payload = {
          id: rec.id,
          company,
          owner: rec.owner,
          cat: rec.cat || '',
          name: rec.name || 'file',
          type: rec.type || (rec.blob && rec.blob.type) || 'application/octet-stream',
          size: rec.size || (rec.blob && rec.blob.size) || 0,
          at: rec.at || new Date().toISOString().slice(0, 10),
          data: dataUrl,
        };

        try {
          const res = await fetch(`/api/files?company=${encodeURIComponent(company)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            throw new Error('D1 upload failed: ' + res.statusText);
          }
          updateStatus('saved', 'تم حفظ المرفق في Cloudflare D1');
          setTimeout(() => updateStatus('connected'), 2000);
          return { ok: true, id: rec.id };
        } catch (err) {
          console.error('ModeerFS put error:', err);
          updateStatus('error', 'تعذر رفع المرفق إلى السحابة');
          return { ok: true, id: rec.id };
        }
      },

      del: async (id) => {
        try {
          await localFS.del(id);
        } catch (e) {}

        const company = getActiveCompany();
        try {
          await fetch(
            `/api/files/${encodeURIComponent(id)}?company=${encodeURIComponent(company)}`,
            { method: 'DELETE' }
          );
        } catch (err) {
          console.warn('ModeerFS del remote error:', err);
        }
        return true;
      },

      list: async (owner) => {
        const company = getActiveCompany();
        try {
          const res = await fetch(
            `/api/files?company=${encodeURIComponent(company)}&owner=${encodeURIComponent(owner)}`
          );
          if (res.ok) {
            const data = await res.json();
            const serverFiles = data.files || [];
            const out = [];
            for (const f of serverFiles) {
              const blob = f.data ? await urlToBlob(f.data) : (f.blob || new Blob([]));
              const item = {
                id: f.id,
                owner: f.owner,
                cat: f.cat,
                name: f.name,
                type: f.type,
                size: f.size,
                at: f.at,
                blob,
              };
              out.push(item);
              try {
                localFS.put(item);
              } catch (e) {}
            }
            return out.sort((x, y) => ((x.at || '') < (y.at || '') ? 1 : -1));
          }
        } catch (err) {
          console.warn('ModeerFS list remote error, using local cache:', err);
        }
        return localFS.list(owner);
      },

      all: async () => {
        const company = getActiveCompany();
        try {
          const res = await fetch(`/api/files/all?company=${encodeURIComponent(company)}`);
          if (res.ok) {
            const data = await res.json();
            return data.files || [];
          }
        } catch (err) {
          console.warn('ModeerFS all remote error, using local cache:', err);
        }
        return localFS.all();
      },

      clear: async () => {
        const company = getActiveCompany();
        try {
          await fetch(`/api/files/clear?company=${encodeURIComponent(company)}`, {
            method: 'POST',
          });
        } catch (e) {}
        return localFS.clear();
      },

      exportAll: async () => {
        const company = getActiveCompany();
        try {
          const res = await fetch(`/api/files?company=${encodeURIComponent(company)}`);
          if (res.ok) {
            const data = await res.json();
            const list = data.files || [];
            const out = [];
            for (const m of list) {
              const single = await fetch(
                `/api/files/${encodeURIComponent(m.id)}?company=${encodeURIComponent(company)}`
              );
              if (single.ok) {
                const sData = await single.json();
                if (sData.file) out.push(sData.file);
              }
            }
            return out;
          }
        } catch (e) {}
        return [];
      },

      importAll: async (arr) => {
        for (const item of arr || []) {
          const blob = item.data ? await urlToBlob(item.data) : item.blob;
          await ModeerFS.put({ ...item, blob });
        }
      },

      syncLocalToCloud: async () => {
        try {
          const locals = await localFS.all();
          if (!locals || locals.length === 0) return;
          const company = getActiveCompany();
          const remoteRes = await fetch(`/api/files/all?company=${encodeURIComponent(company)}`);
          if (!remoteRes.ok) return;
          const remoteData = await remoteRes.json();
          const remoteIds = new Set((remoteData.files || []).map((x) => x.id));

          for (const loc of locals) {
            if (!remoteIds.has(loc.id)) {
              console.log('Syncing legacy local attachment to Cloudflare D1:', loc.name);
              await ModeerFS.put(loc);
            }
          }
        } catch (e) {
          console.warn('Local-to-cloud attachment sync check completed:', e);
        }
      },
    };
  })();

  window.ModeerFS = ModeerFS;

  window.ModeerSync = {
    async init() {
      const co = getActiveCompany();

      // Show temporary boot loader
      const loader = document.createElement('div');
      loader.id = 'modeer-boot-loader';
      loader.style.cssText =
        'position:fixed;inset:0;background:#f8fafc;z-index:9999999;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;direction:rtl;';
      loader.innerHTML = `
        <div style="font-size:32px;margin-bottom:12px;animation:pulse 1.5s infinite">⚡</div>
        <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:6px">مدير | Cloudflare D1</div>
        <div style="font-size:13px;color:#64748b">جاري الاتصال بالسحابة وتحميل بيانات شركة [${co}]...</div>
      `;
      document.body.appendChild(loader);

      try {
        const [dataRes, compRes] = await Promise.all([
          fetch(`/api/data?company=${encodeURIComponent(co)}`),
          fetch('/api/companies').catch(() => null),
        ]);

        let companies = [];
        if (compRes && compRes.ok) {
          const compData = await compRes.json().catch(() => ({}));
          companies = compData.companies || [];
        }

        if (dataRes.ok) {
          const res = await dataRes.json();
          const serverData = res.data || {};

          // Clean up old acc_ keys in localStorage before setting company data
          const toRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('acc_') || k.startsWith('disk_') || k.startsWith('co_'))) {
              toRemove.push(k);
            }
          }
          toRemove.forEach((k) => localStorage.removeItem(k));

          // Populate with loaded data from D1
          Object.keys(serverData).forEach((k) => {
            if (k.startsWith('acc_') || k.startsWith('disk_') || k.startsWith('co_')) {
              localStorage.setItem(k, serverData[k]);
            }
          });

          const baseCur = serverData['acc_base'] || 'USD';
          setupDesktopPolyfill(co, baseCur);
        } else {
          setupDesktopPolyfill(co, 'USD');
        }

        // Set initial snapshot so we don't save immediately on boot
        lastSaved = JSON.stringify(snapshot());

        // Remove loader and start autosave
        loader.remove();
        injectCompanySwitcher(companies);
        updateStatus('connected');
        setInterval(tick, 2000);

        // Run background sync for any local legacy attachments
        setTimeout(() => {
          if (window.ModeerFS && window.ModeerFS.syncLocalToCloud) {
            window.ModeerFS.syncLocalToCloud();
          }
        }, 1200);

        window.addEventListener('beforeunload', () => {
          const cur = snapshot();
          if (JSON.stringify(cur) !== lastSaved) {
            navigator.sendBeacon(
              `/api/data?company=${encodeURIComponent(co)}`,
              JSON.stringify({ data: cur })
            );
          }
        });
      } catch (err) {
        console.error('Modeer D1 boot error:', err);
        setupDesktopPolyfill(co, 'USD');
        loader.remove();
      }
    },
  };
})();
