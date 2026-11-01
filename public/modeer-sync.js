/**
 * Modeer Cloudflare Edge & D1 Sync Adapter
 * Replaces Electron preload.js with cloud synchronization to Cloudflare D1.
 * Supports D1 SQL database storage + Chunked Base64 Attachment Storage + Server-Side Auth.
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
      // Exclude acc_users so routine autosync never accidentally overwrites server credentials
      if (k && k !== 'acc_users' && (k.startsWith('acc_') || k.startsWith('disk_') || k.startsWith('co_'))) {
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
      discardEmpty: () => Promise.resolve({ ok: true }),
      renameSelf: () => {
        const n = prompt('اسم الشركة الجديد:');
        if (n && n.trim()) setActiveCompany(n.trim());
        return Promise.resolve({ ok: true });
      },
      deleteSelf: () => Promise.resolve({ ok: false, msg: 'الحذف متاح للمدير من إدارة البيانات' }),
    };

    window.desktopCo = {
      list: async () => {
        try {
          const res = await fetch('/api/companies');
          const data = await res.json();
          return {
            cur: company,
            list: (data.companies || []).map((c) => ({ name: c.id, label: c.name || c.id })),
          };
        } catch (e) {
          return { cur: company, list: [{ name: company, label: company }] };
        }
      },
      open: async (name) => {
        setActiveCompany(name);
        return { ok: true };
      },
    };
  }

  let statusEl = null;
  function updateStatus(state, msg) {
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'modeer-cloud-status';
      statusEl.style.cssText =
        'position:fixed;bottom:10px;left:12px;z-index:999999;font-family:system-ui,-apple-system,sans-serif;font-size:12px;padding:5px 12px;border-radius:20px;display:flex;align-items:center;gap:6px;box-shadow:0 2px 10px rgba(0,0,0,0.12);transition:all 0.3s ease;pointer-events:auto;cursor:pointer;';
      statusEl.title = 'حالة اتصال سحابة D1 — انقر لفتح دليل الأتمتة والروبوت';
      statusEl.onclick = () => window.open('/bot-guide.html', '_blank');
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

  function ensureNavStyles() {
    if (document.getElementById('modeer-nav-css')) return;
    const s = document.createElement('style');
    s.id = 'modeer-nav-css';
    s.textContent = `
      #modeer-company-nav {
        direction: rtl;
        font-family: system-ui, -apple-system, sans-serif;
        transition: all 0.2s ease;
      }
      #modeer-company-nav.modeer-nav-docked {
        position: static !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        background: rgba(255, 255, 255, 0.12) !important;
        border: 1px solid rgba(255, 255, 255, 0.22) !important;
        padding: 3px 8px !important;
        border-radius: 8px !important;
        color: #fff !important;
        font-size: 11.5px !important;
      }
      #modeer-company-nav.modeer-nav-docked select {
        background: transparent !important;
        color: #fff !important;
        font-weight: 700 !important;
        border: 0 !important;
        outline: 0 !important;
        cursor: pointer !important;
        font-size: 11.5px !important;
      }
      #modeer-company-nav.modeer-nav-docked select option {
        color: #0f172a !important;
        background: #fff !important;
      }
      #modeer-company-nav.modeer-nav-docked .nav-label {
        color: #bfdbfe !important;
        font-weight: 600 !important;
        font-size: 11px !important;
      }
      #modeer-company-nav.modeer-nav-docked .nav-sep {
        color: rgba(255,255,255,0.4) !important;
      }
      #modeer-company-nav.modeer-nav-docked #modeer-bot-guide-btn {
        background: rgba(255, 255, 255, 0.18) !important;
        color: #fff !important;
        border: 1px solid rgba(255, 255, 255, 0.25) !important;
        padding: 2px 8px !important;
        border-radius: 6px !important;
        font-size: 11.5px !important;
        text-decoration: none !important;
        font-weight: 600 !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 4px !important;
      }
      #modeer-company-nav.modeer-nav-docked #modeer-bot-guide-btn:hover {
        background: rgba(255, 255, 255, 0.28) !important;
      }

      #modeer-company-nav.modeer-nav-floating {
        position: fixed !important;
        top: 8px !important;
        left: 10px !important;
        z-index: 99999 !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 5px !important;
        background: rgba(255, 255, 255, 0.94) !important;
        backdrop-filter: blur(4px) !important;
        border: 1px solid #cbd5e1 !important;
        padding: 3px 8px !important;
        border-radius: 12px !important;
        color: #0f172a !important;
        font-size: 11px !important;
        box-shadow: 0 1px 4px rgba(0,0,0,0.08) !important;
      }
      #modeer-company-nav.modeer-nav-floating select {
        background: transparent !important;
        color: #0f172a !important;
        font-weight: 700 !important;
        border: 0 !important;
        outline: 0 !important;
        cursor: pointer !important;
        font-size: 11px !important;
      }
      #modeer-company-nav.modeer-nav-floating .nav-label {
        color: #64748b !important;
        font-weight: 600 !important;
      }
      #modeer-company-nav.modeer-nav-floating .nav-sep {
        color: #cbd5e1 !important;
      }
      #modeer-company-nav.modeer-nav-floating #modeer-bot-guide-btn {
        background: #2563eb !important;
        color: #fff !important;
        border: 0 !important;
        padding: 2px 7px !important;
        border-radius: 6px !important;
        font-size: 11px !important;
        text-decoration: none !important;
        font-weight: 700 !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 3px !important;
      }
    `;
    document.head.appendChild(s);
  }

  function injectCompanySwitcher(companies) {
    ensureNavStyles();

    let nav = document.getElementById('modeer-company-nav');
    if (!nav) {
      nav = document.createElement('div');
      nav.id = 'modeer-company-nav';
    } else {
      nav.innerHTML = '';
    }

    const active = getActiveCompany();
    const isEn = (localStorage.getItem('acc_lang') === 'en');

    // Label
    const label = document.createElement('span');
    label.className = 'nav-label';
    label.textContent = isEn ? 'Co:' : 'الشركة:';
    nav.appendChild(label);

    // Company dropdown
    const sel = document.createElement('select');
    sel.className = 'nav-select';
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
    addOpt.textContent = isEn ? '+ New company...' : '+ شركة جديدة...';
    sel.appendChild(addOpt);

    sel.onchange = (e) => {
      if (e.target.value === '__new__') {
        const name = prompt(isEn ? 'Enter new company name:' : 'اكتب اسم الشركة الجديدة:');
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

    // Separator
    const sep = document.createElement('span');
    sep.className = 'nav-sep';
    sep.textContent = '·';
    nav.appendChild(sep);

    // Compact Help Button (Renamed to "Help / مساعدة" as requested)
    const helpBtn = document.createElement('a');
    helpBtn.id = 'modeer-bot-guide-btn';
    helpBtn.href = '/bot-guide.html';
    helpBtn.target = '_blank';
    helpBtn.rel = 'noopener noreferrer';
    helpBtn.title = isEn ? 'Help & Documentation' : 'المساعدة ودليل التشغيل';
    helpBtn.innerHTML = `<span>❓</span> <span>${isEn ? 'Help' : 'مساعدة'}</span>`;
    nav.appendChild(helpBtn);

    // Docking logic: integrates seamlessly into header action div or falls back to slim corner
    function updateDock() {
      const headerActions = document.querySelector('.app header .no-print');
      if (headerActions) {
        if (nav.parentElement !== headerActions) {
          nav.className = 'modeer-nav-docked';
          headerActions.insertBefore(nav, headerActions.firstChild);
        }
      } else {
        if (nav.parentElement !== document.body) {
          nav.className = 'modeer-nav-floating';
          document.body.appendChild(nav);
        }
      }
    }

    updateDock();
    // Observe DOM changes so when header appears, nav docks automatically into it
    if (!window.__modeerDockObs) {
      window.__modeerDockObs = new MutationObserver(() => updateDock());
      window.__modeerDockObs.observe(document.body, { childList: true, subtree: true });
    }
  }

  let lastSaved = '';
  let isSaving = false;
  let autosyncTimer = null;

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
      } else if (res.status === 401) {
        updateStatus('error', 'انتهت الجلسة — يرجى تسجيل الدخول');
        if (autosyncTimer) {
          clearInterval(autosyncTimer);
          autosyncTimer = null;
        }
      } else {
        updateStatus('error');
      }
    } catch (e) {
      updateStatus('error', 'انقطع الاتصال بالسحابة');
    } finally {
      isSaving = false;
    }
  }

  // -------------------------------------------------------------
  // ModeerFS: Base64 Chunked Attachment Storage Adapter
  // -------------------------------------------------------------
  const ModeerFS = (() => {
    const DB_NAME = 'FS';
    const DB_VER = 1;
    const STORE_NAME = 'f';

    function openLocalDB() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const st = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            st.createIndex('owner', 'owner', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    async function localPut(file) {
      try {
        const db = await openLocalDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(file);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        });
      } catch (e) {
        return false;
      }
    }

    async function localGet(id) {
      try {
        const db = await openLocalDB();
        return new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });
      } catch (e) {
        return null;
      }
    }

    async function localDel(id) {
      try {
        const db = await openLocalDB();
        return new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).delete(id);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        });
      } catch (e) {
        return false;
      }
    }

    return {
      async counts() {
        const co = getActiveCompany();
        try {
          const res = await fetch(`/api/files/counts?company=${encodeURIComponent(co)}`);
          if (res.ok) {
            const data = await res.json();
            return data.counts || {};
          }
        } catch (e) {}
        return {};
      },

      async all() {
        const co = getActiveCompany();
        try {
          const res = await fetch(`/api/files/all?company=${encodeURIComponent(co)}`);
          if (res.ok) {
            const data = await res.json();
            return data.files || [];
          }
        } catch (e) {}
        return [];
      },

      async get(id) {
        const cached = await localGet(id);
        if (cached && cached.data) return cached;

        try {
          const res = await fetch(`/api/files/${encodeURIComponent(id)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.file) {
              await localPut(data.file);
              return data.file;
            }
          }
        } catch (e) {}
        return cached;
      },

      async list(owner) {
        const co = getActiveCompany();
        try {
          const res = await fetch(
            `/api/files?company=${encodeURIComponent(co)}&owner=${encodeURIComponent(owner)}`
          );
          if (res.ok) {
            const data = await res.json();
            const files = data.files || [];
            for (const f of files) {
              if (f.data) await localPut(f);
            }
            return files;
          }
        } catch (e) {}
        return [];
      },

      async save(file) {
        const co = getActiveCompany();
        await localPut(file);

        try {
          const res = await fetch(`/api/files?company=${encodeURIComponent(co)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(file),
          });
          return res.ok;
        } catch (e) {
          return true;
        }
      },

      async delete(id) {
        await localDel(id);
        try {
          const res = await fetch(`/api/files/${encodeURIComponent(id)}`, {
            method: 'DELETE',
          });
          return res.ok;
        } catch (e) {
          return true;
        }
      },

      async clear() {
        const co = getActiveCompany();
        try {
          await fetch(`/api/files/clear?company=${encodeURIComponent(co)}`, { method: 'POST' });
        } catch (e) {}
      },

      async syncLocalToCloud() {
        try {
          const db = await openLocalDB();
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).getAll();
          req.onsuccess = async () => {
            const localFiles = req.result || [];
            if (!localFiles.length) return;
            const cloudFiles = await ModeerFS.all();
            const cloudIds = new Set(cloudFiles.map((f) => f.id));

            for (const f of localFiles) {
              if (!cloudIds.has(f.id) && f.data) {
                await ModeerFS.save(f);
              }
            }
          };
        } catch (e) {}
      },
    };
  })();

  window.ModeerFS = ModeerFS;

  // -------------------------------------------------------------
  // ModeerAuth & ModeerSync
  // -------------------------------------------------------------
  window.ModeerAuth = {
    async checkSession() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          return data.authenticated ? data : null;
        }
      } catch (e) {}
      return null;
    },

    async login(username, password) {
      const co = getActiveCompany();
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, company: co }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          // Load company data now that session is established
          await window.ModeerSync.loadCompanyData(co);
          setupDesktopPolyfill(co, localStorage.getItem('acc_base') || 'USD');
          try {
            sessionStorage.setItem('sess_uid', String(data.user.id));
          } catch (e) {}

          updateStatus('connected');
          if (!autosyncTimer) {
            autosyncTimer = setInterval(tick, 2000);
          }

          window.dispatchEvent(
            new CustomEvent('modeer:auth', {
              detail: { user: data.user, company: co },
            })
          );

          return { ok: true, user: data.user, users: [data.user] };
        }
        return { ok: false, msg: data.error || 'اسم المستخدم أو كلمة السر غير صحيحة' };
      } catch (e) {
        return { ok: false, msg: 'تعذر الاتصال بالخادم. يرجى المحاولة مرة أخرى.' };
      }
    },

    async saveUsers(users) {
      const co = getActiveCompany();
      try {
        await fetch(`/api/data?company=${encodeURIComponent(co)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { acc_users: typeof users === 'string' ? users : JSON.stringify(users) } }),
        });
        return true;
      } catch (e) {
        return false;
      }
    },

    async logout() {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (e) {}

      // Clear local storage sensitive data
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('acc_') || k.startsWith('disk_'))) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
      try {
        sessionStorage.removeItem('sess_uid');
      } catch (e) {}
      window.location.reload();
    },
  };

  window.ModeerSync = {
    async loadCompanyData(co) {
      try {
        const dataRes = await fetch(`/api/data?company=${encodeURIComponent(co)}`);
        if (dataRes.ok) {
          const res = await dataRes.json();
          const serverData = res.data || {};

          // Populate with loaded data from D1
          Object.keys(serverData).forEach((k) => {
            if (k.startsWith('acc_') || k.startsWith('disk_') || k.startsWith('co_')) {
              localStorage.setItem(k, serverData[k]);
            }
          });

          lastSaved = JSON.stringify(snapshot());
          return true;
        }
      } catch (e) {}
      return false;
    },

    async init() {
      const co = getActiveCompany();

      // Check server authentication status
      const session = await window.ModeerAuth.checkSession();

      let companies = [];
      try {
        const compRes = await fetch('/api/companies').catch(() => null);
        if (compRes && compRes.ok) {
          const compData = await compRes.json().catch(() => ({}));
          companies = compData.companies || [];
        }
      } catch (e) {}

      if (session && session.user) {
        // Authenticated: Load company data and start background sync
        await window.ModeerSync.loadCompanyData(co);
        setupDesktopPolyfill(co, localStorage.getItem('acc_base') || 'USD');
        try {
          sessionStorage.setItem('sess_uid', String(session.user.id));
        } catch (e) {}

        updateStatus('connected');
        if (!autosyncTimer) {
          autosyncTimer = setInterval(tick, 2000);
        }

        window.dispatchEvent(
          new CustomEvent('modeer:auth', {
            detail: { user: session.user, company: co },
          })
        );

        // Run background sync for local legacy attachments
        setTimeout(() => {
          if (window.ModeerFS && window.ModeerFS.syncLocalToCloud) {
            window.ModeerFS.syncLocalToCloud();
          }
        }, 1200);
      } else {
        // Unauthenticated: Purge any sensitive data from localStorage
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('acc_') || k.startsWith('disk_'))) {
            toRemove.push(k);
          }
        }
        toRemove.forEach((k) => localStorage.removeItem(k));
        try {
          sessionStorage.removeItem('sess_uid');
        } catch (e) {}
        setupDesktopPolyfill(co, 'USD');
      }

      // Inject integrated navbar
      injectCompanySwitcher(companies);

      window.addEventListener('beforeunload', () => {
        const cur = snapshot();
        if (JSON.stringify(cur) !== lastSaved) {
          navigator.sendBeacon(
            `/api/data?company=${encodeURIComponent(co)}`,
            JSON.stringify({ data: cur })
          );
        }
      });
    },
  };

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.ModeerSync.init());
  } else {
    window.ModeerSync.init();
  }
})();
