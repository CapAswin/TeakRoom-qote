'use strict';

/* ===========================================
   TeakRoom Quotation Editor — App Logic
   =========================================== */

/* ---------- Helpers ---------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const el = (tag, cls) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  return node;
};

const num = v => {
  const n = parseFloat(String(v == null ? '' : v).replace(/[₹,\s]/g, ''));
  return isNaN(n) ? 0 : n;
};

const fmt = n => '₹' + Math.round(n).toLocaleString('en-IN');

const fmtNum = v => {
  const n = num(v);
  return n % 1 === 0
    ? n.toLocaleString('en-IN')
    : n.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
};

const isOverride = it => it.override !== undefined && it.override !== null && it.override !== '';

const SAVE_KEY = 'teakroom-quote.v1';

/* ---------- Toast ---------- */
function showToast(msg, duration = 2500) {
  let toast = $('.toast');
  if (!toast) {
    toast = el('div', 'toast');
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

/* ---------- Model ---------- */
const emptyData = () => [{ name: 'ROOM 1', items: [] }];

const todayISO = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};

let data = emptyData();
let step = 0;
let pendingFocus = null;

const meta = { qno: '', client: '', place: '', validtill: todayISO() };
let metaImported = { qno: false, client: false, place: false, validtill: false };

/* Migration: converts a stored item into the current model.
   Old formats: { type:'area_rate', area, rate } and { type:'lumpsum', amount }. */
function normalizeItem(it) {
  const base = {
    name: it.name || '',
    desc: it.desc || '',
    dim: it.dim || '',
    override: it.override == null ? null : it.override,
    importedFields: {}
  };
  switch (it.type) {
    case 'area_rate':
      return { ...base, type: 'area', length: it.area || 0, height: it.height || 1, rate: it.rate || 0 };
    case 'lumpsum':
      return { ...base, type: 'fixed', amount: it.amount || 0 };
    case 'area':
      return { ...base, type: 'area', length: it.length || 0, height: it.height || 0, rate: it.rate || 0 };
    case 'running':
      return { ...base, type: 'running', length: it.length || 0, rate: it.rate || 0 };
    case 'quantity':
      return { ...base, type: 'quantity', qty: it.qty || 0, rate: it.rate || 0 };
    case 'fixed':
      return { ...base, type: 'fixed', amount: it.amount || 0 };
    default:
      return { ...base, type: 'area', length: 0, height: 0, rate: 0 };
  }
}

/* ---------- Persistence ---------- */
function setSaveStatus(state) {
  const dot = $('#saveDot');
  const text = $('#saveText');
  dot.classList.remove('saved', 'error');
  if (state === 'saving') {
    text.textContent = 'Saving…';
  } else if (state === 'saved') {
    text.textContent = 'Saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    dot.classList.add('saved');
  } else {
    text.textContent = 'Autosave unavailable';
    dot.classList.add('error');
  }
}

let saveTimer = null;
function persist(immediate) {
  clearTimeout(saveTimer);
  const write = () => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ meta, data, step, metaImported }));
      setSaveStatus('saved');
    } catch (e) {
      setSaveStatus('error');
    }
  };
  if (immediate) { write(); return; }
  setSaveStatus('saving');
  saveTimer = setTimeout(write, 400);
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.data)) return;
    data = s.data.map(sec => ({
      name: sec.name || '',
      items: (sec.items || []).map(normalizeItem)
    }));
    Object.assign(meta, s.meta || {});
    Object.assign(metaImported, s.metaImported || {});
    step = Math.max(0, Math.min(s.step || 0, data.length - 1));
    setSaveStatus('saved');
  } catch (e) {
    /* corrupt saved state — start empty */
  }
}

/* ---------- History ---------- */
const HISTORY_KEY = 'teakroom-history.v1';
const MAX_HISTORY = 50;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function writeHistory(arr) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr)); }
  catch { /* quota exceeded — silently drop */ }
}

function saveToHistory() {
  const hasItems = data.some(s => s.items.length > 0);
  const hasMeta = meta.qno || meta.client || meta.place;
  if (!hasItems && !hasMeta) return;
  const history = loadHistory();
  history.unshift({
    id: Date.now(),
    meta: { ...meta },
    data: JSON.parse(JSON.stringify(data)),
    savedAt: new Date().toISOString()
  });
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  writeHistory(history);
}

/* ---------- Theme ---------- */
const THEME_KEY = 'teakroom-theme.v1';

function applyTheme(dark) {
  document.body.classList.toggle('dark', dark);
}

function toggleTheme() {
  const isDark = document.body.classList.contains('dark');
  applyTheme(!isDark);
  try { localStorage.setItem(THEME_KEY, isDark ? 'light' : 'dark'); }
  catch { /* ignore */ }
}

function loadTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    applyTheme(saved === 'dark');
  } catch {
    applyTheme(false);
  }
}

/* ---------- Pricing engine ----------
   Every line item fits one of four formulas:

     Area     amount = length × height × rate
     Running  amount = length × rate            (running feet)
     Quantity amount = qty × rate               (unit price)
     Fixed    amount = amount                   (lump sum)

   Rates are plain editable inputs — users set them per item.
----------------------------------------------------------------- */
const areaOf = item =>
  item.type === 'area' ? num(item.length) * num(item.height) : 0;

const computeAmount = item => {
  if (isOverride(item)) return num(item.override);
  switch (item.type) {
    case 'area':     return areaOf(item) * num(item.rate);
    case 'running':  return num(item.length) * num(item.rate);
    case 'quantity': return num(item.qty) * num(item.rate);
    case 'fixed':    return num(item.amount);
    default:         return 0;
  }
};

const noteText = (item, amt) => {
  if (isOverride(item)) return 'Manually overridden — click "Reset to formula" to recalculate.';
  switch (item.type) {
    case 'area': {
      const a = areaOf(item);
      return fmtNum(item.length) + ' × ' + fmtNum(item.height) + ' = ' + fmtNum(a) +
        ' sqft · ' + fmtNum(a) + ' sqft × ₹' + fmtNum(item.rate) + ' = ' + fmt(amt);
    }
    case 'running':  return fmtNum(item.length) + ' Rft × ₹' + fmtNum(item.rate) + ' = ' + fmt(amt);
    case 'quantity': return fmtNum(item.qty) + ' × ₹' + fmtNum(item.rate) + ' = ' + fmt(amt);
    case 'fixed':    return 'Fixed price — enter the amount directly.';
    default:         return '';
  }
};

/* ---------- Amount cell + override ---------- */
const itemRowSel = (s, i) => `[data-sec="${s}"][data-item="${i}"]`;

function refreshAmountCell(sIdx, iIdx) {
  const wrap = $(itemRowSel(sIdx, iIdx) + ' .calc-amount-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const item = data[sIdx].items[iIdx];
  const display = el('div', 'calc-amount');
  display.textContent = fmt(computeAmount(item));
  if (isOverride(item)) display.classList.add('overridden');
  wrap.appendChild(display);
}

function openOverride(sIdx, iIdx) {
  const item = data[sIdx].items[iIdx];
  const wrap = $(itemRowSel(sIdx, iIdx) + ' .calc-amount-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const input = el('input', 'override-input');
  input.type = 'number';
  input.step = 'any';
  input.inputmode = 'decimal';
  input.placeholder = '0';
  input.setAttribute('aria-label', 'Manual amount for ' + item.name);
  input.value = isOverride(item) ? item.override : Math.round(computeAmount(item));
  let cancelled = false;
  const commit = () => {
    if (cancelled) return;
    if (input.value !== '') item.override = num(input.value);
    refreshAmountCell(sIdx, iIdx);
    updateTotals();
    persist();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') { cancelled = true; refreshAmountCell(sIdx, iIdx); }
  });
  input.addEventListener('blur', commit);
  wrap.appendChild(input);
  input.focus();
  input.select();
}

/* ---------- Item field helpers ---------- */
const PRICING_TYPES = [
  ['area', 'Area · Length × Height'],
  ['running', 'Running feet'],
  ['quantity', 'Quantity'],
  ['fixed', 'Fixed price']
];

/* A labelled number input bound to an item key (e.g. 'length'). */
function makeField(item, label, key, impKey, onCommit) {
  const imp = item.importedFields || {};
  const f = el('div', 'field');
  const l = el('label');
  l.textContent = label;
  const input = el('input', imp[impKey] ? ' imported' : '');
  input.type = 'number';
  input.step = 'any';
  input.inputmode = 'decimal';
  input.value = item[key] ?? 0;
  input.addEventListener('input', () => {
    item[key] = num(input.value);
    if (imp[impKey]) { imp[impKey] = false; input.classList.remove('imported'); }
    updateTotals();
    persist();
    if (onCommit) onCommit();
  });
  f.append(l, input);
  return f;
}

/* The read-only "Amount" cell shown for formula-based items. */
function makeAmountCell(item) {
  const imp = item.importedFields || {};
  const f = el('div', 'field amount-cell');
  const l = el('label');
  l.textContent = 'Amount';
  const wrap = el('div', 'calc-amount-wrap');
  const display = el('div', 'calc-amount');
  display.textContent = fmt(computeAmount(item));
  if (isOverride(item)) display.classList.add('overridden');
  if (!isOverride(item) && imp.rate) display.classList.add('imported');
  wrap.appendChild(display);
  f.append(l, wrap);
  return f;
}

/* The editable "Amount" cell used by Fixed-price items. */
function makeFixedAmountCell(item) {
  const imp = item.importedFields || {};
  const f = el('div', 'field amount-cell');
  const l = el('label');
  l.textContent = 'Amount (₹)';
  const input = el('input', imp.amount ? ' imported' : '');
  input.type = 'number';
  input.step = 'any';
  input.inputmode = 'decimal';
  input.value = item.amount ?? 0;
  input.setAttribute('aria-label', 'Fixed amount');
  input.addEventListener('input', () => {
    item.amount = num(input.value);
    if (imp.amount) { imp.amount = false; input.classList.remove('imported'); }
    updateTotals();
    persist();
  });
  f.append(l, input);
  return f;
}

/* Rebuild the input fields inside an item based on its pricing type. */
function renderItemFields(item, fieldRow, buildNote) {
  fieldRow.innerHTML = '';
  if (item.type === 'area') {
    fieldRow.append(
      makeField(item, 'Length (ft)', 'length', 'length'),
      makeField(item, 'Height (ft)', 'height', 'height'),
      makeField(item, 'Rate (₹ / sqft)', 'rate', 'rate'),
      makeAmountCell(item)
    );
  } else if (item.type === 'running') {
    fieldRow.append(
      makeField(item, 'Length (Rft)', 'length', 'length'),
      makeField(item, 'Rate (₹ / Rft)', 'rate', 'rate'),
      makeAmountCell(item)
    );
  } else if (item.type === 'quantity') {
    fieldRow.append(
      makeField(item, 'Quantity', 'qty', 'qty'),
      makeField(item, 'Rate (₹ / each)', 'rate', 'rate'),
      makeAmountCell(item)
    );
  } else {
    fieldRow.append(makeFixedAmountCell(item));
  }
  if (buildNote) buildNote();
}

/* ---------- Item builder ---------- */
function buildItem(sec, item, sIdx, iIdx) {
  const row = el('div', 'item');
  row.dataset.sec = sIdx;
  row.dataset.item = iIdx;
  const imp = (item.importedFields = item.importedFields || {});

  /* Note — lives above the actions for area/running/quantity items. */
  const note = el('div', 'calc-note');

  const updateNote = () => {
    const amt = computeAmount(item);
    note.textContent = noteText(item, amt);
  };

  /* name row + pricing type select */
  const nameRow = el('div', 'item-name-row');
  const nameInput = el('input', 'item-name' + (imp.name ? ' imported' : ''));
  nameInput.value = item.name;
  nameInput.placeholder = 'Item name';
  nameInput.setAttribute('aria-label', 'Item name');
  nameInput.addEventListener('input', () => {
    item.name = nameInput.value;
    if (imp.name) { imp.name = false; nameInput.classList.remove('imported'); }
    persist();
  });

  const typeSelect = el('select', 'type-select no-print');
  typeSelect.setAttribute('aria-label', 'Pricing type');
  typeSelect.title = 'How this item is priced';
  PRICING_TYPES.forEach(([v, label]) => {
    const opt = el('option');
    opt.value = v;
    opt.textContent = label;
    typeSelect.appendChild(opt);
  });
  typeSelect.value = item.type || 'area';
  typeSelect.addEventListener('change', () => {
    item.type = typeSelect.value;
    item.override = null; /* changing the formula clears a manual override */
    if (imp.type) { imp.type = false; typeSelect.classList.remove('imported'); }
    renderItemFields(item, fieldRow, updateNote);
    refreshAmountCellIfNeeded(row);
    updateTotals();
    persist();
    showToast('Pricing: ' + PRICING_TYPES.find(p => p[0] === item.type)[1]);
  });

  nameRow.append(nameInput, typeSelect);
  row.appendChild(nameRow);

  /* dynamic input fields */
  const fieldRow = el('div', 'field-row');
  row.appendChild(fieldRow);
  renderItemFields(item, fieldRow, updateNote);

  /* For fixed items the amount is typed directly, so no formula note. */
  if (item.type !== 'fixed') row.appendChild(note);

  /* actions */
  const removeBtn = el('button', 'remove-btn');
  removeBtn.type = 'button';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => {
    sec.items.splice(iIdx, 1);
    render();
    persist();
    showToast('Item removed');
  });

  const actions = el('div', 'item-actions no-print');
  if (item.type !== 'fixed') {
    const toggle = el('button', 'override-toggle');
    toggle.type = 'button';
    const syncToggle = () => { toggle.textContent = isOverride(item) ? 'Reset to formula' : 'Override amount'; };
    syncToggle();
    toggle.addEventListener('click', () => {
      if (isOverride(item)) {
        item.override = null;
        refreshAmountCell(sIdx, iIdx);
        syncToggle();
        updateTotals();
        persist();
        showToast('Reset to formula');
      } else {
        openOverride(sIdx, iIdx);
      }
    });
    actions.append(toggle, removeBtn);
  } else {
    actions.append(el('span'), removeBtn);
  }
  row.appendChild(actions);

  return row;
}

/* If the amount cell still holds a stale override input, rebuild it. */
function refreshAmountCellIfNeeded(row) {
  const wrap = row.querySelector('.calc-amount-wrap');
  if (!wrap) return;
  if (!row.querySelector('.calc-amount')) {
    const display = el('div', 'calc-amount');
    display.textContent = fmt(computeAmountFromRow(row));
    wrap.innerHTML = '';
    wrap.appendChild(display);
  }
}

function computeAmountFromRow(row) {
  const sIdx = row.dataset.sec;
  const iIdx = row.dataset.item;
  if (sIdx == null || iIdx == null || !data[sIdx]) return 0;
  return computeAmount(data[sIdx].items[iIdx]);
}

/* ---------- Section builder ---------- */
function buildSection(sec, sIdx) {
  const secEl = el('section', 'section');
  secEl.dataset.sec = sIdx;

  const head = el('div', 'section-head');
  const nameInput = el('input', 'sec-name');
  nameInput.value = sec.name;
  nameInput.setAttribute('aria-label', 'Section name');
  nameInput.addEventListener('input', () => { sec.name = nameInput.value; updateChrome(); persist(); });

  const total = el('span', 'stotal');
  total.setAttribute('aria-label', 'Section total');

  /* Duplicate section — insert an identical copy (deep-cloned items) right after. */
  const cp = el('button', 'sec-dupe no-print');
  cp.type = 'button';
  cp.title = 'Duplicate section';
  cp.setAttribute('aria-label', 'Duplicate section');
  cp.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<rect x="6" y="6" width="8" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M10 2H3a1 1 0 0 0-1 1v8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  cp.addEventListener('click', () => {
    const idx = sIdx + 1;
    data.splice(idx, 0, {
      name: sec.name + ' (Copy)',
      items: JSON.parse(JSON.stringify(sec.items))
    });
    step = idx;
    render();
    persist();
    showToast('Section duplicated');
  });

  const rm = el('button', 'sec-remove no-print');
  rm.type = 'button';
  rm.textContent = '\u2715';
  rm.title = 'Remove section';
  rm.setAttribute('aria-label', 'Remove section');
  rm.disabled = data.length < 2;
  rm.addEventListener('click', () => {
    if (!confirm('Remove the "' + sec.name + '" section and all of its items?')) return;
    data.splice(sIdx, 1);
    step = Math.max(0, Math.min(step, data.length - 1));
    render();
    persist();
    showToast('Section removed');
  });

  head.append(nameInput, total, cp, rm);
  secEl.appendChild(head);

  /* Wrap items in a container for grid/cards views */
  const itemsContainer = el('div', 'items-container');
  sec.items.forEach((item, iIdx) => itemsContainer.appendChild(buildItem(sec, item, sIdx, iIdx)));
  secEl.appendChild(itemsContainer);

  const add = el('button', 'add-item-btn no-print');
  add.type = 'button';
  add.textContent = '+ Add item to ' + sec.name;
  add.addEventListener('click', () => {
    sec.items.push({ name: 'NEW ITEM', type: 'area', length: 0, height: 0, rate: 0 });
    pendingFocus = { sel: itemRowSel(sIdx, sec.items.length - 1) + ' .item-name', select: true };
    render();
    persist();
    showToast('Item added');
  });
  secEl.appendChild(add);
  return secEl;
}

/* ---------- Totals & Chrome ---------- */
function updateTotals() {
  let grand = 0;
  data.forEach((sec, sIdx) => {
    let sectionTotal = 0;
    sec.items.forEach((item, iIdx) => {
      const amt = computeAmount(item);
      sectionTotal += amt;
      const row = $(itemRowSel(sIdx, iIdx));
      if (!row) return;
      const display = row.querySelector('.calc-amount');
      if (display) {
        display.textContent = fmt(amt);
        display.classList.toggle('overridden', isOverride(item));
        const imp = item.importedFields || {};
        display.classList.toggle('imported', !isOverride(item) && (imp.rate || imp.length || imp.height || imp.qty));
      }
      const note = row.querySelector('.calc-note');
      if (note) note.textContent = noteText(item, amt);
    });
    const stEl = $(`[data-sec="${sIdx}"] .stotal`);
    if (stEl) stEl.textContent = fmt(sectionTotal);
    grand += sectionTotal;
  });
  $('#grandTotal').textContent = fmt(grand);
}

function updateChrome() {
  const n = data.length;
  step = Math.max(0, Math.min(step, n ? n - 1 : 0));
  $('#stepLabel').textContent = n === 0 ? 'No sections yet' : 'Section ' + (step + 1) + ' of ' + n + ' \u2014 ' + data[step].name;
  $('#prevBtn').disabled = (n === 0 || step === 0);
  $('#nextBtn').disabled = (n === 0 || step >= n - 1);

  const dots = $('#dots');
  dots.innerHTML = '';
  data.forEach((sec, i) => {
    const d = el('button', 'dot');
    d.type = 'button';
    d.title = 'Go to ' + sec.name;
    d.setAttribute('aria-label', 'Go to section ' + (i + 1) + ': ' + sec.name);
    if (i === step) { d.classList.add('active'); d.setAttribute('aria-current', 'true'); }
    d.addEventListener('click', () => { if (i !== step) { step = i; render(); } });
    dots.appendChild(d);
  });
}

/* ---------- Render ---------- */
function render() {
  const sectionsEl = $('#sections');
  const viewMode = viewSettings.viewMode;

  if (data.length === 0) {
    const empty = el('div', 'empty-state');
    const h3 = el('h3');
    h3.textContent = 'No sections yet';
    const hint = el('div', 'empty-hint');
    hint.textContent = 'Start a new quote — add a section below, or import a previous Excel file.';
    empty.append(h3, hint);
    sectionsEl.innerHTML = '';
    sectionsEl.appendChild(empty);
    $('#grandTotal').textContent = fmt(0);
    updateChrome();
    return;
  }

  const content = document.createDocumentFragment();
  data.forEach((sec, sIdx) => {
    const secEl = buildSection(sec, sIdx);
    /* In list view, hide non-active sections; in other views, show all */
    if (viewMode === 'list') {
      secEl.dataset.hidden = (sIdx === step) ? 'false' : 'true';
    } else {
      secEl.dataset.hidden = 'false';
    }
    content.appendChild(secEl);
  });
  sectionsEl.innerHTML = '';
  sectionsEl.appendChild(content);

  updateTotals();
  updateChrome();

  if (pendingFocus) {
    const target = $(pendingFocus.sel);
    if (target) { target.focus(); if (pendingFocus.select) target.select(); }
    pendingFocus = null;
  }
}

/* ---------- Meta wiring ---------- */
['qno', 'client', 'place', 'validtill'].forEach(id => {
  const input = $('#' + id);
  const onChange = () => {
    meta[id] = input.value;
    if (metaImported[id]) { metaImported[id] = false; input.classList.remove('imported'); }
    persist();
  };
  input.addEventListener('input', onChange);
  input.addEventListener('change', onChange);
});

function applyMetaImportedClasses() {
  Object.keys(metaImported).forEach(id => {
    $('#' + id).classList.toggle('imported', !!metaImported[id]);
  });
}

function syncMetaInputs() {
  ['qno', 'client', 'place', 'validtill'].forEach(id => { $('#' + id).value = meta[id]; });
  applyMetaImportedClasses();
}

/* ---------- Navigation ---------- */
const gotoStep = i => { step = Math.max(0, Math.min(i, data.length - 1)); render(); };
$('#prevBtn').addEventListener('click', () => gotoStep(step - 1));
$('#nextBtn').addEventListener('click', () => gotoStep(step + 1));

$('#addSectionBtn').addEventListener('click', () => {
  if (!catalogState.data) {
    /* catalog unavailable — fall back to a blank section */
    const idx = data.push({ name: 'NEW AREA', items: [] }) - 1;
    step = idx;
    pendingFocus = { sel: `[data-sec="${idx}"] .sec-name`, select: true };
    render();
    persist();
    return;
  }
  openRoomModal('add');
});

/* ---------- Excel import ---------- */
const EXPORT_HEADER = ['Description', 'Pricing', 'Length', 'Height', 'Qty', 'Rate', 'Amount'];

function parseWorkbookIntoData(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const out = [];
  let cur = null;
  /* 'new' = 7-column format (this app's exports); 'old' = legacy 4-column */
  let format = 'old';

  rows.forEach(row => {
    const c0 = String(row[0] == null ? '' : row[0]).trim();
    const c1 = String(row[1] == null ? '' : row[1]).trim();
    const c2 = String(row[2] == null ? '' : row[2]).trim();
    const c3 = String(row[3] == null ? '' : row[3]).trim();
    const c4 = String(row[4] == null ? '' : row[4]).trim();
    const c5 = String(row[5] == null ? '' : row[5]).trim();
    const c6 = String(row[6] == null ? '' : row[6]).trim();
    if (!c0) {
      if (String(c1).toLowerCase() === 'description' && /length/i.test(String(c3) + String(c2))) format = 'official';
      return;
    }

    const lc = c0.toLowerCase();
    if (lc.startsWith('quotation no')) {
      meta.qno = (c0.split(':').slice(1).join(':').trim() || c1);
      metaImported.qno = true;
      return;
    }
    if (lc.startsWith('client name') || lc === 'client') {
      meta.client = (c0.includes(':') ? c0.split(':').slice(1).join(':').trim() : c1);
      metaImported.client = true;
      return;
    }
    if (lc.startsWith('place')) {
      meta.place = (c0.includes(':') ? c0.split(':').slice(1).join(':').trim() : c1);
      metaImported.place = true;
      return;
    }
    if (lc.startsWith('quote valid')) { meta.validtill = c1; metaImported.validtill = true; return; }
    if (c0 === EXPORT_HEADER[0] && c1 === EXPORT_HEADER[1]) { format = 'new'; return; }
    if (String(c1).toLowerCase() === 'description' && /length/i.test(c3 + c2 + c1)) { format = 'official'; return; }
    if (lc === 'total' || lc === 'grand total') return;
    if (/^(core meterial|hardware meterial|note|bank details|date of quote)/i.test(lc)) return;

    /* A row with only column A filled is a section header */
    if (!c1 && !c2 && !c4 && !c5 && !c6) {
      cur = { name: c0.toUpperCase(), items: [] };
      out.push(cur);
      return;
    }
    if (!cur) { cur = { name: 'IMPORTED ITEMS', items: [] }; out.push(cur); }

    const addItem = item => {
      item.importedFields = { name: true };
      Object.keys(item).forEach(k => {
        if (k !== 'name' && k !== 'type' && k !== 'desc' && k !== 'dim') item.importedFields[k] = true;
      });
      cur.items.push(item);
    };

    if (/^[A-F]$/.test(c0) && /carcass|shutter|hinge|drawer|handle|boxing/i.test(c1)) return;

    if (format === 'official') {
      const areaRaw = c4;
      const rateRaw = c5;
      const amtRaw = c6;
      const dim = c3;
      const desc = c1 && c1 !== c0 ? c1 : '';
      if (/lumpsum/i.test(areaRaw) || (!areaRaw && !rateRaw && amtRaw)) {
        addItem({ name: c0, type: 'fixed', amount: num(amtRaw), desc, dim });
      } else if (/rft/i.test(dim)) {
        addItem({ name: c0, type: 'running', length: num(areaRaw), rate: num(rateRaw), desc, dim });
      } else if (/nos/i.test(areaRaw)) {
        addItem({ name: c0, type: 'quantity', qty: num(areaRaw), rate: num(rateRaw), desc, dim });
      } else {
        addItem({ name: c0, type: 'area', length: num(areaRaw), height: 1, rate: num(rateRaw), desc, dim });
      }
      return;
    }

    if (format === 'new') {
      const type = c1.toLowerCase();
      if (type.includes('area')) {
        addItem({ name: c0, type: 'area', length: num(c2), height: num(c3), rate: num(c5) });
      } else if (type.includes('run')) {
        addItem({ name: c0, type: 'running', length: num(c2), rate: num(c5) });
      } else if (type.includes('quant') || type.includes('qty')) {
        addItem({ name: c0, type: 'quantity', qty: num(c4), rate: num(c5) });
      } else {
        addItem({ name: c0, type: 'fixed', amount: num(c6) });
      }
      return;
    }

    /* Legacy format: {'lumpsum' marker} or {area, rate} */
    if (c1.toLowerCase() === 'lumpsum') {
      addItem({ name: c0, type: 'fixed', amount: num(c3) });
    } else {
      addItem({ name: c0, type: 'area', length: num(c1), height: 1, rate: num(c2) });
    }
  });

  return out;
}

$('#importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
      const parsed = parseWorkbookIntoData(wb);
      if (parsed.length === 0) { showToast('No recognizable quotation rows found'); return; }
      data = parsed;
      step = 0;
      syncMetaInputs();
      render();
      persist(true);
      showToast('Imported ' + file.name);
    } catch (err) {
      showToast('Import failed: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
});

/* ---------- Excel / PDF export ---------- */
function exportExcel() {
  exportOfficialExcel()
    .then(() => showToast('Excel exported — Teak Room format'))
    .catch(err => showToast('Excel export failed: ' + err.message));
}

function exportPdf() {
  exportOfficialPdf()
    .then(() => showToast('PDF print dialog opened'))
    .catch(err => showToast('PDF export failed: ' + err.message));
}

$('#exportExcelBtn').addEventListener('click', exportExcel);
$('#exportPdfBtn').addEventListener('click', exportPdf);

/* ---------- Reset ---------- */
$('#resetBtn').addEventListener('click', () => {
  if (!confirm('Save current quote to history and start fresh?')) return;
  saveToHistory();
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  meta.qno = ''; meta.client = ''; meta.place = ''; meta.validtill = todayISO();
  Object.keys(metaImported).forEach(k => metaImported[k] = false);
  data = emptyData();
  step = 0;
  syncMetaInputs();
  render();
  persist(true);
  showToast('Saved to history — starting fresh');
  openRoomModal('init');
});

$('#saveQuoteBtn').addEventListener('click', () => {
  saveToHistory();
  showToast('Quote saved to history');
});

$('#historyBtn').addEventListener('click', () => {
  window.open('history.html', '_blank');
});

$('#themeToggle').addEventListener('click', toggleTheme);

/* ---------- View Settings ---------- */
const VIEW_KEY = 'teakroom-view.v1';

const viewSettings = {
  viewMode: 'list',
  fontSize: 'default',
  compact: false
};

function loadViewSettings() {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (raw) Object.assign(viewSettings, JSON.parse(raw));
  } catch (e) { /* ignore */ }
}

function saveViewSettings() {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(viewSettings));
  } catch (e) { /* ignore */ }
}

function applyViewSettings() {
  const { viewMode, fontSize, compact } = viewSettings;

  /* font size */
  document.body.dataset.font = fontSize;
  $$('.size-btn').forEach(btn => {
    const active = btn.dataset.size === fontSize;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active);
  });

  /* compact */
  document.body.classList.toggle('compact', compact);
  const compactToggle = $('#compactToggle');
  if (compactToggle) compactToggle.checked = compact;

  /* view mode */
  document.body.classList.remove('view-list', 'view-grid', 'view-table', 'view-cards');
  document.body.classList.add('view-' + viewMode);
  $$('.view-btn').forEach(btn => {
    const active = btn.dataset.view === viewMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active);
  });
}

/* View mode buttons */
$$('#viewModeGroup .view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    viewSettings.viewMode = btn.dataset.view;
    saveViewSettings();
    applyViewSettings();
    render();
    showToast('View: ' + btn.dataset.view.charAt(0).toUpperCase() + btn.dataset.view.slice(1));
  });
});

/* Font size buttons */
$$('#fontSizeGroup .size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    viewSettings.fontSize = btn.dataset.size;
    saveViewSettings();
    applyViewSettings();
  });
});

/* Compact toggle */
const compactToggleEl = $('#compactToggle');
if (compactToggleEl) {
  compactToggleEl.addEventListener('change', () => {
    viewSettings.compact = compactToggleEl.checked;
    saveViewSettings();
    applyViewSettings();
    showToast(compactToggleEl.checked ? 'Compact mode on' : 'Compact mode off');
  });
}

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    persist(true);
    showToast('Saved');
  }
});

/* ---------- Product catalog & room selection modal ---------- */
const catalogState = { data: null };
let modalInsertAt = null;
let modalMode = null; // 'init' (first-run/new quote) or 'add' (add to existing quote)

async function loadCatalog() {
  try {
    const res = await fetch('catalog.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    catalogState.data = await res.json();
    buildRoomList();
    return true;
  } catch (e) {
    console.warn('catalog.json unavailable:', e.message);
    return false;
  }
}

function buildRoomList() {
  const list = $('#modalRoomList');
  list.innerHTML = '';
  (catalogState.data.categories || []).forEach(cat => {
    const label = el('label', 'modal-room');
    label.dataset.room = cat.room;
    const box = el('input');
    box.type = 'checkbox';
    box.checked = false;
    box.setAttribute('aria-label', 'Include ' + cat.room);
    box.addEventListener('change', syncModalConfirm);
    const name = el('span', 'modal-room-name');
    name.textContent = cat.room;
    const count = el('span', 'modal-room-count');
    const n = (cat.products || []).length;
    count.textContent = n + ' item' + (n === 1 ? '' : 's');
    const tag = el('span', 'modal-room-tag');
    label.append(box, name, count, tag);
    list.appendChild(label);
  });
}

/* preselect = true honours init_selection; false leaves everything unchecked. */
function resetRoomChecks(preselect) {
  const cats = catalogState.data.categories || [];
  $$('#modalRoomList .modal-room').forEach((row, i) => {
    const cat = cats[i];
    row.querySelector('input').checked = !!(preselect && cat && cat.init_selection);
  });
  syncModalConfirm();
}

function syncModalConfirm() {
  const boxes = $$('#modalRoomList input[type="checkbox"]');
  const count = boxes.filter(cb => cb.checked && !cb.disabled).length;
  const hasSelection = count > 0;
  $('#modalConfirm').disabled = !hasSelection;
  $('#modalConfirm').title = hasSelection ? '' : 'Select at least one room';
  const cnt = $('#modalCount');
  if (cnt) cnt.textContent = count + ' of ' + boxes.length + ' selected';
}

/* Pick a unique default name for a blank section, e.g. "NEW AREA", "NEW AREA 2", ... */
function nextSectionName() {
  const used = new Set(data.map(s => s.name));
  if (!used.has('NEW AREA')) return 'NEW AREA';
  for (let n = 2; ; n++) {
    const cand = 'NEW AREA ' + n;
    if (!used.has(cand)) return cand;
  }
}

/* mode 'init' -> new quote, preselect rooms marked init_selection, insert at end.
   mode 'add'  -> add rooms to an existing quote, nothing preselected, insert after the active section. */
function openRoomModal(mode) {
  if (!catalogState.data) {
    loadCatalog().then(ok => {
      if (ok) openRoomModal(mode);
      else showToast('Catalog not available');
    });
    return;
  }
  const adding = mode === 'add';
  modalMode = mode;

  /* Clear per-row state carried over from a previous open. */
  $$('#modalRoomList .modal-room').forEach(row => {
    row.querySelector('input').disabled = false;
    row.classList.remove('already-added');
    const tag = row.querySelector('.modal-room-tag');
    if (tag) tag.textContent = '';
  });
  resetRoomChecks(!adding);
  modalInsertAt = adding && data.length ? step : null;

  /* Mode-aware header + footer copy */
  const overlay = $('#roomModal');
  overlay.setAttribute('aria-label', adding ? 'Add rooms to your quotation' : 'Choose rooms for your quotation');
  $('#modalTitle').textContent = adding ? 'Add rooms' : 'Choose rooms';
  $('#modalSub').textContent = adding
    ? 'Pick from the catalog, or add a new empty section. Selected rooms are inserted after the current section.'
    : 'Select which areas to include, or start fresh with a brand-new empty section.';

  const freshBtn = $('#modalStartFresh');
  freshBtn.textContent = adding ? 'Add empty section' : 'Start fresh';
  freshBtn.title = adding
    ? 'Insert a blank section into this quote'
    : 'Clear the current quote and start a brand-new empty one';

  $('#modalConfirm').textContent = adding ? 'Add selected' : 'Start with selected';

  /* Only "add" mode can be dismissed; the initial picker must be resolved via a button. */
  $('#modalClose').hidden = !adding;
  const note = $('#modalNote');
  note.hidden = adding;
  note.textContent = adding
    ? 'Rooms you already added are greyed out below.'
    : 'This step cannot be skipped — pick at least one room, or press “Start fresh” to begin with an empty section.';
  overlay.classList.toggle('modal-locked', !adding);

  /* In add mode, rooms already in the quote are disabled and tagged. */
  if (adding && data.length) {
    const existing = new Set(data.map(sec => sec.name));
    $$('#modalRoomList .modal-room').forEach(row => {
      const taken = existing.has(row.dataset.room);
      row.querySelector('input').disabled = taken;
      row.classList.toggle('already-added', taken);
      const tag = row.querySelector('.modal-room-tag');
      if (tag) tag.textContent = taken ? 'Added' : '';
    });
  }

  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  syncModalConfirm();
}

function hideRoomModal() {
  $('#roomModal').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  modalMode = null;
}

function selectedRoomNames() {
  return $$('#modalRoomList .modal-room')
    .filter(row => row.querySelector('input').checked && !row.querySelector('input').disabled)
    .map(row => row.dataset.room);
}

function catalogSections(rooms) {
  const selected = new Set(rooms);
  return (catalogState.data.categories || [])
    .filter(cat => selected.has(cat.room))
    .map(cat => ({
      name: cat.room,
      items: (cat.products || []).map(p => ({
        name: p.name,
        type: 'quantity',
        qty: p.qty || 1,
        rate: p.default_rate || 0,
        desc: p.specification || '',
        override: null
      }))
    }));
}

$('#modalSelectAll').addEventListener('click', () => {
  $$('#modalRoomList input[type="checkbox"]').forEach(cb => { if (!cb.disabled) cb.checked = true; });
  syncModalConfirm();
});

$('#modalDeselectAll').addEventListener('click', () => {
  $$('#modalRoomList input[type="checkbox"]').forEach(cb => cb.checked = false);
  syncModalConfirm();
});

$('#modalConfirm').addEventListener('click', () => {
  const rooms = selectedRoomNames();
  if (rooms.length === 0) { showToast('No rooms selected'); return; }
  const existing = new Set(data.map(sec => sec.name));
  const incoming = catalogSections(rooms).filter(sec => !existing.has(sec.name));
  if (incoming.length === 0) {
    hideRoomModal();
    showToast('Those rooms are already in this quote');
    return;
  }
  const blankStarter = data.length === 1 && data[0].items.length === 0;
  if (blankStarter) {
    data = incoming;
  } else if (modalInsertAt == null) {
    data = data.concat(incoming);
  } else {
    data.splice(modalInsertAt + 1, 0, ...incoming);
  }
  step = data.indexOf(incoming[incoming.length - 1]);
  hideRoomModal();
  render();
  persist(true);
  showToast(incoming.length + ' room' + (incoming.length === 1 ? '' : 's') + ' added');
});

$('#modalStartFresh').addEventListener('click', () => {
  const isAdd = modalMode === 'add';

  if (isAdd) {
    /* In add mode, "start fresh" means inserting a new blank section (never wiping the quote). */
    const sec = { name: nextSectionName(), items: [] };
    const idx = (modalInsertAt == null) ? data.length : modalInsertAt + 1;
    data.splice(idx, 0, sec);
    step = idx;
    pendingFocus = { sel: '[data-sec="' + idx + '"] .sec-name', select: true };
    hideRoomModal();
    render();
    persist();
    showToast('Empty section added');
    return;
  }

  /* Init mode — skip the catalog and begin a brand-new empty quote. */
  data = emptyData();
  meta.qno = ''; meta.client = ''; meta.place = ''; meta.validtill = todayISO();
  Object.keys(metaImported).forEach(k => metaImported[k] = false);
  step = 0;
  syncMetaInputs();
  hideRoomModal();
  render();
  persist(true);
  showToast('Started a fresh quote');
});

/* Close icon — only reachable in add mode (hidden in the initial picker). */
$('#modalClose').addEventListener('click', () => {
  if (modalMode === 'init') return; // safety: the initial picker cannot be dismissed
  hideRoomModal();
});

/* Close modal on backdrop click — allowed only in add mode. */
$('#roomModal').addEventListener('click', e => {
  if (e.target !== e.currentTarget) return;
  if (modalMode !== 'init') hideRoomModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#roomModal').getAttribute('aria-hidden') === 'false' && modalMode !== 'init') {
    hideRoomModal();
  }
});

/* Reopen the room picker from the toolbar to add catalog rooms */
$('#roomModalBtn').addEventListener('click', () => {
  openRoomModal('add');
});

/* ---------- Init ---------- */
loadTheme();
loadViewSettings();
applyViewSettings();
loadState();
syncMetaInputs();
render();

/* First-run: if the quote has no items yet, offer rooms from the catalog. */
loadCatalog().then(ok => {
  if (!ok) return;
  const noItems = !data.some(sec => sec.items.length > 0);
  const noMeta = !(meta.qno || meta.client || meta.place);
  if (noItems && noMeta) openRoomModal('init');
});
