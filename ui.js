// Shared UI: DOM helper, data access, forms (in a modal window), tables, files.
import { TABLES, today } from './sections.js';
import { MONTHS } from './finance.js';

export const state = { sb: null, user: null, profile: null };
export const isAdmin = () => state.profile?.role === 'admin';

// ---------- DOM ----------
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const money = (v, { cents = false } = {}) => (v == null || v === '' ? '' :
  Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 }));
export const fmtDate = (s, opts = { year: 'numeric', month: 'short', day: 'numeric' }) => (s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', opts) : '');
export const parseDate = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00');
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function button(label, onclick, cls = '') {
  return h('button', { type: 'button', class: cls, onclick }, label);
}
export function tel(phone) {
  return phone ? h('a', { href: 'tel:' + phone.replace(/[^\d+]/g, ''), class: 'tel' }, phone) : '';
}
export function mail(email) {
  return email ? h('a', { href: 'mailto:' + email }, email) : '';
}
export function empty(text) {
  return h('p', { class: 'empty' }, text);
}
export function sectionHead(title, ...actions) {
  return h('div', { class: 'section-head' }, h('h2', {}, title), h('div', { class: 'actions' }, actions));
}

// ---------- Data ----------
export async function rows(table, { filter } = {}) {
  let q = state.sb.from(table).select('*');
  if (filter) q = filter(q);
  for (const [col, asc] of TABLES[table]?.order || []) q = q.order(col, { ascending: asc, nullsFirst: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
export async function rowsSafe(table, opts) {
  try { return await rows(table, opts); } catch { return []; }
}
export async function getRow(table, id) {
  const { data, error } = await state.sb.from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}
export function canEdit(table, row) {
  if (isAdmin()) return true;
  return TABLES[table].write === 'member' && !(row && row.restricted);
}

export function contactLabel(c) {
  if (!c) return '';
  return [c.company, c.name].filter(Boolean).join(' – ') || c.category;
}

// ---------- Files (private bucket, short-lived links) ----------
export async function uploadFile(file, prefix = '') {
  const path = `${prefix}${crypto.randomUUID()}/${file.name.replace(/[^\w.\-]+/g, '_')}`;
  const { error } = await state.sb.storage.from('documents').upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return { path, name: file.name };
}
export async function openFile(path, download = false) {
  const { data, error } = await state.sb.storage.from('documents').createSignedUrl(path, 120, download ? { download: true } : undefined);
  if (error) throw error;
  window.open(data.signedUrl, '_blank', 'noopener');
}
export async function removeFile(path) {
  if (path) await state.sb.storage.from('documents').remove([path]);
}

// ---------- Modal form ----------
// Opens a form for one record. Returns a promise that resolves true when saved.
export async function editRecord(table, row, { defaults = {}, extra = [], onSubmit, title } = {}) {
  const def = TABLES[table];
  const fields = def.fields.filter((f) => (!f.adminOnly || isAdmin()) && (f.k !== 'restricted' || isAdmin()));
  const inputs = {};
  const controls = [];
  const unitNames = fields.some((f) => f.t === 'unit') ? await knownUnits() : [];

  for (const f of fields) {
    let v = row ? row[f.k] : (f.k in defaults ? defaults[f.k] : (f.def === 'today' ? today() : f.def));
    const id = 'f_' + f.k;
    let input;
    if (f.t === 'textarea') input = h('textarea', { id, rows: 3 }, v ?? '');
    else if (f.t === 'bool') { input = h('input', { id, type: 'checkbox' }); input.checked = !!v; }
    else if (f.t === 'select' || f.t === 'ref') {
      let options;
      if (f.t === 'ref') options = (await rowsSafe(f.ref)).map((r) => [r.id, f.refLabel(r)]);
      else options = f.opts.map((o) => (Array.isArray(o) ? o : [o, o]));
      input = h('select', { id }, h('option', { value: '' }, f.t === 'ref' ? '— none —' : ''), options.map(([val, lab]) => h('option', { value: val }, lab)));
      input.value = v ?? '';
    } else if (f.t === 'months') {
      const set = new Set(v || []);
      input = h('div', { class: 'months-pick', id },
        MONTHS.map((m, i) => {
          const cb = h('input', { type: 'checkbox', value: i + 1 });
          cb.checked = set.has(i + 1);
          return h('label', { class: 'check' }, cb, m);
        }),
        h('div', { class: 'months-quick' },
          button('All year', () => input.querySelectorAll('input').forEach((c) => { c.checked = true; }), 'small'),
          button('Clear', () => input.querySelectorAll('input').forEach((c) => { c.checked = false; }), 'small')));
    } else if (f.t === 'color') {
      input = h('input', { id, type: 'color' });
      if (v) input.value = v; else input.dataset.unset = '1';
      input.addEventListener('input', () => delete input.dataset.unset);
    } else {
      const type = { date: 'date', number: 'number', money: 'number' }[f.t] || 'text';
      input = h('input', { id, type, step: f.t === 'money' || f.t === 'number' ? 'any' : null, placeholder: f.hint || null, list: f.t === 'unit' ? 'unit-names' : null, inputmode: f.t === 'money' ? 'decimal' : null });
      input.value = v ?? '';
    }
    if (f.req && f.t !== 'months') input.required = true;
    inputs[f.k] = input;
    controls.push(h('div', { class: 'field' + (f.t === 'bool' ? ' field-check' : '') },
      f.t === 'bool' ? h('label', { class: 'check', for: id }, input, f.l)
        : [h('label', { for: id }, f.l + (f.req ? ' *' : '')), input],
      f.help ? h('p', { class: 'help' }, f.help) : null));
  }
  for (const x of extra) controls.push(x);

  const msg = h('p', { class: 'msg', role: 'alert' });
  const dlg = h('dialog', { class: 'modal' });
  const form = h('form', { method: 'dialog' },
    h('h2', {}, title || (row ? `Edit ${def.title.toLowerCase()}` : `Add ${def.title.toLowerCase()}`)),
    h('datalist', { id: 'unit-names' }, unitNames.map((u) => h('option', { value: u }))),
    h('div', { class: 'fields' }, controls),
    msg,
    h('div', { class: 'modal-actions' },
      h('button', { type: 'submit', class: 'primary' }, 'Save'),
      button('Cancel', () => dlg.close())));
  dlg.append(form);
  document.body.append(dlg);

  return new Promise((resolve) => {
    let saved = false;
    dlg.addEventListener('close', () => { dlg.remove(); resolve(saved); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const record = {};
      for (const f of fields) {
        const el = inputs[f.k];
        if (f.t === 'bool') record[f.k] = el.checked;
        else if (f.t === 'months') record[f.k] = [...el.querySelectorAll('input:checked')].map((c) => Number(c.value));
        else if (f.t === 'color') record[f.k] = el.dataset.unset ? (row?.color ?? null) : el.value;
        else if (el.value === '') record[f.k] = null;
        else if (f.t === 'number' || f.t === 'money') record[f.k] = Number(el.value);
        else record[f.k] = el.value;
      }
      msg.textContent = 'Saving…';
      try {
        if (onSubmit) await onSubmit(record);
        else {
          const { error } = row
            ? await state.sb.from(table).update(record).eq('id', row.id)
            : await state.sb.from(table).insert(record);
          if (error) throw error;
        }
        saved = true;
        dlg.close();
      } catch (err) { msg.textContent = 'Could not save: ' + err.message; }
    });
    dlg.showModal();
  });
}

let unitCache = null;
export async function knownUnits() {
  if (unitCache) return unitCache;
  const sets = await Promise.all([
    isAdmin() ? rowsSafe('leases') : [],
    rowsSafe('jobs'),
  ]);
  unitCache = [...new Set(sets.flat().map((r) => r.unit).filter(Boolean))].sort();
  setTimeout(() => { unitCache = null; }, 30000);
  return unitCache;
}

// Two-step delete: first click arms, second click deletes. No browser pop-ups.
export function deleteButton(doDelete, label = 'Delete') {
  const btn = h('button', { type: 'button', class: 'small danger' }, label);
  let armed = false;
  btn.addEventListener('click', async () => {
    if (!armed) {
      armed = true; btn.textContent = 'Click again to delete';
      setTimeout(() => { armed = false; btn.textContent = label; }, 4000);
      return;
    }
    btn.disabled = true;
    try { await doDelete(); } catch (e) { btn.disabled = false; btn.textContent = 'Error: ' + e.message; }
  });
  return btn;
}

export async function deleteRow(table, row) {
  const { error } = await state.sb.from(table).delete().eq('id', row.id);
  if (error) throw error;
}

// ---------- Simple data table ----------
// cols: [{ l: 'Header', v: row => node|string, cls }]
export function table(cols, data, { emptyText = 'Nothing recorded yet.', rowClick, foot } = {}) {
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: c.cls || null }, c.l)))),
    h('tbody', {}, data.length === 0
      ? h('tr', {}, h('td', { colspan: cols.length, class: 'empty' }, emptyText))
      : data.map((r) => h('tr', { class: rowClick ? 'clickable' : null, onclick: rowClick ? (e) => { if (!e.target.closest('button,a')) rowClick(r); } : null },
        cols.map((c) => h('td', { class: c.cls || null }, c.v(r) ?? ''))))),
    foot ? h('tfoot', {}, foot) : null));
}
