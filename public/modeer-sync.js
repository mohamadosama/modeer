/**
 * Modeer Cloudflare Edge & D1 Sync Adapter
 * Replaces Electron preload.js with cloud synchronization to Cloudflare D1.
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
      statusEl.innerHTML = '<span style="display:inline-block;animation:spin 1s linear infinite">⏳</span> <span>جاري الحفظ في D1...</span>';
    } else if (state === 'saved') {
      statusEl.style.background = '#f0fdf4';
      statusEl.style.color = '#15803d';
      statusEl.style.border = '1px solid #bbf7d0';
      statusEl.innerHTML = '<span style="color:#22c55e">●</span> <span>محفوظ في Cloudflare D1</span>';
    } else if (state === 'error') {
      statusEl.style.background = '#fef2f2';
      statusEl.style.color = '#b91c1c';
      statusEl.style.border = '1px solid #fecaca';
      statusEl.innerHTML = '<span>⚠️</span> <span>تعذر الحفظ في السحابة</span>';
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
