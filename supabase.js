'use strict';

/* Browser client for Teak Room tables. Uses the anon key only.
   Login is required; RLS should allow only the authenticated role. */
window.TeakRoomDB = (function () {
  const PLACEHOLDER = 'PASTE_ANON_PUBLIC_KEY';
  let client = null;
  let session = null;
  const signedInListeners = [];

  function cfg() {
    return window.TEAKROOM_SUPABASE || {};
  }

  function isConfigured() {
    const key = String(cfg().anonKey || '').trim();
    const url = String(cfg().url || '').trim();
    return !!(url && key && key !== PLACEHOLDER);
  }

  function isSignedIn() {
    return !!(session && session.user);
  }

  function isReady() {
    return !!(client && isConfigured() && isSignedIn());
  }

  function getClient() {
    return client;
  }

  function currentUser() {
    return session && session.user ? session.user : null;
  }

  function onSignedIn(fn) {
    signedInListeners.push(fn);
    if (isSignedIn()) fn(session);
  }

  function setAuthError(msg) {
    const el = document.getElementById('authError');
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function renderAuth() {
    const configured = isConfigured();
    const signedIn = isSignedIn();
    const gate = document.getElementById('authGate');
    const chip = document.getElementById('userChip');
    const emailEl = document.getElementById('userEmail');
    if (gate) gate.hidden = !configured || signedIn;
    if (chip) chip.hidden = !(configured && signedIn);
    if (emailEl) emailEl.textContent = signedIn ? (session.user.email || '') : '';
    document.body.classList.toggle('auth-locked', configured && !signedIn);
  }

  function bindAuthUi() {
    const form = document.getElementById('authForm') || document.getElementById('loginForm');
    if (form && !form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = ((document.getElementById('authEmail') || document.getElementById('loginEmail') || {}).value || '').trim();
        const password = (document.getElementById('authPassword') || document.getElementById('loginPass') || {}).value || '';
        const btn = document.getElementById('authSubmit') || document.getElementById('loginBtn');
        setAuthError('');
        if (btn) { btn.disabled = true; }
        try {
          const { error } = await client.auth.signInWithPassword({ email, password });
          if (error) throw error;
        } catch (err) {
          setAuthError(err.message || 'Sign in failed');
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }

    const out = document.getElementById('signOutBtn') || document.getElementById('logoutBtn');
    if (out && !out.dataset.bound) {
      out.dataset.bound = '1';
      out.addEventListener('click', async () => {
        try { await client.auth.signOut(); } catch (e) { /* ignore */ }
        location.reload();
      });
    }
  }

  function logTest(label, payload) {
    console.log('[TeakRoom DB]', label, payload);
  }

  async function debug() {
    const config = cfg();
    const key = String(config.anonKey || '').trim();
    const report = {
      url: config.url || '(missing)',
      anonKeySet: isConfigured(),
      anonKeyLength: key && key !== PLACEHOLDER ? key.length : 0,
      libraryLoaded: !!(window.supabase && window.supabase.createClient),
      ready: isReady(),
      tables: {}
    };

    console.group('TeakRoom Supabase test');
    report.signedIn = isSignedIn();
    report.email = currentUser() && currentUser().email;
    logTest('config', {
      url: report.url,
      anonKeySet: report.anonKeySet,
      anonKeyLength: report.anonKeyLength,
      libraryLoaded: report.libraryLoaded,
      ready: report.ready,
      signedIn: report.signedIn,
      email: report.email || null
    });

    if (!isConfigured()) {
      console.warn('[TeakRoom DB] Paste the anon public key into supabase-config.js, then reload.');
      console.groupEnd();
      return report;
    }
    if (!client) {
      console.warn('[TeakRoom DB] Client not started yet. Reload the page first.');
      console.groupEnd();
      return report;
    }
    if (!isSignedIn()) {
      console.warn('[TeakRoom DB] Sign in first, then run TeakRoomDB.debug()');
      console.groupEnd();
      return report;
    }

    const names = ['brands', 'categories', 'meta', 'products', 'reusable_text'];
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      try {
        const rows = await fetchTable(name);
        const columns = rows[0] ? Object.keys(rows[0]) : [];
        report.tables[name] = { ok: true, count: rows.length, columns, rows };
        console.groupCollapsed(name + ' (' + rows.length + ' rows)');
        logTest('columns', columns.length ? columns : '(empty table)');
        logTest('rows', rows);
        console.groupEnd();
      } catch (err) {
        report.tables[name] = { ok: false, error: err.message || String(err), details: err };
        console.error('[TeakRoom DB]', name, 'FAILED', err.message || err, err);
      }
    }

    try {
      const catalog = await loadCatalog();
      report.catalog = catalog;
      logTest('mapped catalog', catalog);
    } catch (err) {
      report.catalogError = err.message || String(err);
      console.error('[TeakRoom DB] mapped catalog FAILED', err);
    }

    console.log('[TeakRoom DB] Re-run anytime: TeakRoomDB.debug()');
    console.groupEnd();
    return report;
  }

  async function start() {
    if (!isConfigured()) {
      logTest('mode', 'local — anon key not set in supabase-config.js');
      return { mode: 'local' };
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.warn('Supabase library failed to load');
      return { mode: 'local' };
    }

    client = window.supabase.createClient(cfg().url, cfg().anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    const gotSession = await Promise.race([
      client.auth.getSession().then(
        r => r.data.session || null,
        () => null
      ),
      new Promise(resolve => setTimeout(() => resolve(null), 4000))
    ]);
    session = gotSession;
    bindAuthUi();
    renderAuth();
    logTest('start', {
      url: cfg().url,
      signedIn: isSignedIn(),
      email: currentUser() && currentUser().email
    });

    client.auth.onAuthStateChange((event, next) => {
      const wasIn = isSignedIn();
      session = next;
      renderAuth();
      logTest('auth change', {
        event,
        signedIn: isSignedIn(),
        email: currentUser() && currentUser().email
      });
      if (!wasIn && isSignedIn()) {
        signedInListeners.forEach(fn => fn(session));
      }
    });

    return { mode: isSignedIn() ? 'cloud' : 'auth' };
  }

  let quotesMissing = false;

  function isMissingTable(err) {
    const code = err && err.code;
    const msg = String((err && err.message) || '');
    return code === 'PGRST205' || /Could not find the table/i.test(msg);
  }

  async function fetchTable(name, optional) {
    const { data, error } = await client.from(name).select('*');
    if (error) {
      if (optional && isMissingTable(error)) return [];
      throw error;
    }
    return data || [];
  }

  function pick(row, keys, fallback) {
    for (let i = 0; i < keys.length; i++) {
      const v = row[keys[i]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return fallback;
  }

  function mapMeta(rows) {
    const out = {};
    (rows || []).forEach(row => {
      const key = pick(row, ['key', 'name', 'field'], null);
      const val = pick(row, ['value', 'val', 'content'], null);
      if (key && val != null && row.currency == null && row.gst_default == null) {
        out[key] = val;
      }
    });
    const first = (rows || [])[0] || {};
    if (first.name) out.name = first.name;
    if (first.source_quote) out.source_quote = first.source_quote;
    if (first.currency) out.currency = first.currency;
    if (first.gst_default != null) out.gst_default = first.gst_default;
    return out;
  }

  function mapBrands(rows) {
    const out = { plywood: '', hardware: [] };
    (rows || []).forEach(row => {
      const kind = String(pick(row, ['category', 'kind', 'key', 'section', 'type', 'name'], '')).toLowerCase();
      const raw = row.value != null ? row.value : (row.items != null ? row.items : pick(row, ['label', 'description', 'text', 'plywood', 'hardware'], ''));
      if (kind.indexOf('ply') !== -1 || row.plywood) {
        const v = row.plywood || raw;
        out.plywood = Array.isArray(v) ? v.join(', ') : String(v || '');
        return;
      }
      if (kind.indexOf('hard') !== -1 || row.hardware) {
        const v = row.hardware || raw;
        out.hardware = Array.isArray(v) ? v : (v ? [v] : []);
        return;
      }
      if (Array.isArray(raw)) out.hardware = raw;
      else if (raw) out.hardware.push(raw);
    });
    return out;
  }

  function mapReusable(rows) {
    const out = {};
    (rows || []).forEach(row => {
      const section = pick(row, ['section', 'key', 'name'], null);
      if (!section) return;
      let items = row.items;
      if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch (e) { items = [items]; }
      }
      if (!Array.isArray(items)) items = items == null ? [] : [items];
      out[section] = items;
    });
    return out;
  }

  function mapProduct(row) {
    return {
      name: pick(row, ['name', 'title', 'product'], 'Item'),
      specification: pick(row, ['specification', 'spec', 'description', 'desc'], ''),
      unit_type: pick(row, ['unit_type', 'type', 'unit'], 'quantity'),
      default_rate: Number(pick(row, ['default_rate', 'rate', 'price'], 0)) || 0,
      gst: Number(pick(row, ['gst', 'gst_percent'], 0)) || 0,
      qty: Number(pick(row, ['qty', 'quantity'], 1)) || 1
    };
  }

  function mapCategories(categories, products) {
    const byCat = {};
    (products || []).forEach(p => {
      const key = String(
        pick(p, ['category_id', 'categoryId', 'room', 'category', 'category_name'], '')
      );
      if (!key) return;
      if (!byCat[key]) byCat[key] = [];
      byCat[key].push(mapProduct(p));
    });

    const cats = (categories || []).slice().sort((a, b) => {
      const sa = Number(pick(a, ['sort_order', 'sort', 'id'], 0));
      const sb = Number(pick(b, ['sort_order', 'sort', 'id'], 0));
      return sa - sb;
    });

    return cats.map(cat => {
      const room = pick(cat, ['room', 'name', 'title', 'category'], 'Room');
      let nested = cat.products;
      if (typeof nested === 'string') {
        try { nested = JSON.parse(nested); } catch (e) { nested = null; }
      }
      const fromNested = Array.isArray(nested) ? nested.map(mapProduct) : [];
      const fromJoin = byCat[String(cat.id)] || byCat[room] || byCat[String(cat.name)] || [];
      return {
        room,
        init_selection: !!(cat.init_selection || cat.initSelection),
        products: fromNested.length ? fromNested : fromJoin
      };
    });
  }

  /* ---------- Catalog cache ----------
     The catalog is fetched on most page loads. It changes only when records
     are edited in admin.html (or the DB is changed externally), so we cache
     the assembled catalog in localStorage and reuse it until it is
     invalidated or expires. */
  const CATALOG_CACHE_KEY = 'teakroom-catalog-cache.v1';
  const CATALOG_CACHE_TTL = 24 * 60 * 60 * 1000;

  function readCatalogCache() {
    try {
      const raw = localStorage.getItem(CATALOG_CACHE_KEY);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || !entry.data || !entry.savedAt) return null;
      return entry;
    } catch (e) {
      return null;
    }
  }

  function writeCatalogCache(data) {
    try {
      localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (e) { /* quota exceeded — skip caching */ }
  }

  function invalidateCatalogCache() {
    try { localStorage.removeItem(CATALOG_CACHE_KEY); } catch (e) { /* ignore */ }
  }

  async function loadCatalog(forceRefresh) {
    if (!isReady()) return null;
    const cached = readCatalogCache();
    if (cached && cached.data &&
        (forceRefresh === true || Date.now() - cached.savedAt < CATALOG_CACHE_TTL)) {
      return cached.data;
    }
    try {
      const [categories, products, brands, metaRows, reusable] = await Promise.all([
        fetchTable('categories'),
        fetchTable('products'),
        fetchTable('brands'),
        fetchTable('meta'),
        fetchTable('reusable_text')
      ]);
      const assembled = {
        meta: mapMeta(metaRows),
        categories: mapCategories(categories, products),
        brands: mapBrands(brands),
        reusable_text: mapReusable(reusable)
      };
      if (assembled.categories.length) {
        writeCatalogCache(assembled);
        return assembled;
      }
      /* Empty DB — don't cache an empty state; reuse the last good copy. */
      return cached && cached.data ? cached.data : { ...assembled, _emptyCatalog: true };
    } catch (err) {
      /* Network failed — reuse the last good copy rather than showing nothing. */
      if (cached && cached.data) return cached.data;
      throw err;
    }
  }

  function rowToQuote(row) {
    const meta = row.meta && typeof row.meta === 'object' ? row.meta : {
      qno: row.qno || '',
      client: row.client || '',
      place: row.place || '',
      validtill: row.validtill || ''
    };
    return {
      id: row.id,
      meta,
      data: Array.isArray(row.data) ? row.data : [],
      savedAt: row.saved_at || row.savedAt || row.created_at
    };
  }

  async function listQuotes() {
    if (!isReady() || quotesMissing) return [];
    const { data, error } = await client
      .from('quotes')
      .select('*')
      .order('saved_at', { ascending: false });
    if (error) {
      if (isMissingTable(error)) {
        quotesMissing = true;
        return [];
      }
      throw error;
    }
    return (data || []).map(rowToQuote);
  }

  async function saveQuote(entry) {
    if (!isReady() || quotesMissing) return;
    const meta = entry.meta || {};
    const { error } = await client.from('quotes').upsert({
      id: String(entry.id),
      qno: meta.qno || '',
      client: meta.client || '',
      place: meta.place || '',
      validtill: meta.validtill || null,
      meta,
      data: entry.data || [],
      saved_at: entry.savedAt || new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) {
      if (isMissingTable(error)) {
        quotesMissing = true;
        console.warn('[TeakRoom DB] quotes table missing — saved in this browser only.');
        return;
      }
      throw error;
    }
  }

  async function deleteQuote(id) {
    if (!isReady() || quotesMissing) return;
    const { error } = await client.from('quotes').delete().eq('id', String(id));
    if (error) {
      if (isMissingTable(error)) return;
      throw error;
    }
  }

  return {
    start,
    debug,
    isConfigured,
    isSignedIn,
    isReady,
    getClient,
    currentUser,
    onSignedIn,
    loadCatalog,
    invalidateCatalogCache,
    listQuotes,
    saveQuote,
    deleteQuote
  };
})();
