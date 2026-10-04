import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, BUILDING_NAME, BUILDING_ADDRESS } from './config.js';
import { TABLES, SECTIONS, TABLE_TITLES, today, ymd } from './sections.js';

// Captured before the client consumes the URL hash, so invite/recovery links land on "set password".
const arrivedFromEmailLink = /type=(invite|recovery|signup)/.test(location.hash);

const app = document.getElementById('app');
const state = { user: null, profile: null, refs: {} };
let sb;

// ---------- DOM helper ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const isAdmin = () => state.profile?.role === 'admin';
const money = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
const fmtDate = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '');
const parseDate = (s) => new Date(s + 'T00:00:00');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// ---------- Boot ----------
async function boot() {
  if (SUPABASE_URL.startsWith('REPLACE')) {
    app.replaceChildren(h('p', {}, 'Not configured: set SUPABASE_URL and SUPABASE_KEY in config.js.'));
    return;
  }
  sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') showSetPassword();
    if (event === 'SIGNED_OUT') showLogin();
  });
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showLogin();
  state.user = session.user;
  if (arrivedFromEmailLink) return showSetPassword();
  await enter();
}

async function enter() {
  const { data: { user } } = await sb.auth.getUser();
  state.user = user;
  const { data: profile } = await sb.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  state.profile = profile;
  if (!profile) {
    app.replaceChildren(h('p', {}, 'This account has no access. Ask the building admin.'),
      h('button', { onclick: () => sb.auth.signOut() }, 'Sign out'));
    return;
  }
  window.onhashchange = route;
  route();
}

// ---------- Auth screens ----------
function showLogin(msg) {
  const email = h('input', { type: 'email', required: true, autocomplete: 'username' });
  const pw = h('input', { type: 'password', required: true, autocomplete: 'current-password' });
  const out = h('p', { class: 'msg' }, msg || '');
  const form = h('form', {
    class: 'auth',
    onsubmit: async (e) => {
      e.preventDefault();
      out.textContent = 'Signing in...';
      const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pw.value });
      if (error) { out.textContent = error.message; return; }
      out.textContent = '';
      await enter();
    },
  },
  h('h1', {}, BUILDING_NAME), h('p', {}, 'Building manual. Sign in to continue.'),
  h('label', {}, 'Email', email), h('label', {}, 'Password', pw),
  h('button', { type: 'submit' }, 'Sign in'),
  h('button', {
    type: 'button',
    onclick: async () => {
      if (!email.value) { out.textContent = 'Enter your email first.'; return; }
      const { error } = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname });
      out.textContent = error ? error.message : 'Reset link sent. Check your email.';
    },
  }, 'Forgot password'),
  out);
  app.replaceChildren(form);
}

function showSetPassword() {
  const pw = h('input', { type: 'password', required: true, minlength: 8, autocomplete: 'new-password' });
  const pw2 = h('input', { type: 'password', required: true, minlength: 8, autocomplete: 'new-password' });
  const out = h('p', { class: 'msg' });
  app.replaceChildren(h('form', {
    class: 'auth',
    onsubmit: async (e) => {
      e.preventDefault();
      if (pw.value !== pw2.value) { out.textContent = 'Passwords do not match.'; return; }
      const { error } = await sb.auth.updateUser({ password: pw.value });
      if (error) { out.textContent = error.message; return; }
      history.replaceState(null, '', location.pathname);
      await enter();
    },
  }, h('h1', {}, BUILDING_NAME), h('p', {}, 'Set your password.'),
  h('label', {}, 'New password (8+ characters)', pw), h('label', {}, 'Repeat', pw2),
  h('button', { type: 'submit' }, 'Save password'), out));
}

// ---------- Shell ----------
function visibleSections() {
  return SECTIONS.filter((s) => !s.adminOnly || isAdmin());
}

function route() {
  const id = location.hash.replace(/^#/, '');
  const sections = visibleSections();
  const section = sections.find((s) => s.id === id) || sections[0];
  const main = h('main');
  app.replaceChildren(
    h('header', {},
      h('strong', {}, BUILDING_NAME), ' ', h('span', {}, BUILDING_ADDRESS),
      h('span', { class: 'who' }, `${state.user.email} (${state.profile.role}) `,
        h('button', { onclick: () => sb.auth.signOut() }, 'Sign out'))),
    h('nav', {}, sections.map((s) => h('a', { href: '#' + s.id, class: s.id === section.id ? 'on' : null }, s.label))),
    main);
  renderSection(section, main);
}

async function renderSection(section, main) {
  main.replaceChildren(h('h1', {}, section.label), h('p', { class: 'blurb' }, section.blurb), h('p', {}, 'Loading...'));
  const rerender = () => renderSection(section, main);
  const body = [];
  try {
    if (section.view && VIEWS[section.view]) body.push(...(await VIEWS[section.view](rerender)));
    else for (const t of section.tables) body.push(await tableBlock(t, { rerender }));
  } catch (err) {
    body.push(h('p', { class: 'msg' }, 'Error: ' + (err.message || err)));
  }
  main.replaceChildren(h('h1', {}, section.label), h('p', { class: 'blurb' }, section.blurb), ...body);
}

// ---------- Data ----------
async function fetchRows(table) {
  const def = TABLES[table];
  let q = sb.from(table).select('*');
  for (const [col, asc] of def?.order || []) q = q.order(col, { ascending: asc, nullsFirst: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function refOptions(table, labelKey) {
  const rows = await fetchRows(table).catch(() => []);
  state.refs[table] = Object.fromEntries(rows.map((r) => [r.id, r[labelKey]]));
  return rows.map((r) => ({ v: r.id, l: r[labelKey] }));
}

function canEdit(table, row) {
  if (isAdmin()) return true;
  const def = TABLES[table];
  return def.write === 'member' && !(row && row.restricted);
}

function visibleFields(table, { listing = false } = {}) {
  return TABLES[table].fields.filter((f) =>
    (!f.adminOnly || isAdmin()) &&
    (f.k !== 'restricted' || isAdmin()) &&
    (!listing || f.list !== false));
}

function cell(f, v, opts = {}) {
  if (v == null || v === '') return '';
  switch (f.t) {
    case 'money': return money(v);
    case 'date': return fmtDate(v);
    case 'bool': return v ? 'Yes' : '';
    case 'ref': return state.refs[f.ref]?.[v] ?? '';
    case 'secret': {
      if (opts.secrets === 'show') return String(v);
      if (opts.secrets === 'hide') return '(withheld)';
      const span = h('span', {}, '••••••');
      const btn = h('button', { class: 'small', onclick: () => { span.textContent = v; btn.remove(); } }, 'Show');
      return h('span', {}, span, ' ', btn);
    }
    case 'select': return String(v).replace(/_/g, ' ');
    default: return String(v);
  }
}

// ---------- Generic table with add/edit/delete ----------
async function tableBlock(table, opts = {}) {
  const def = TABLES[table];
  const rows = opts.rows || (await fetchRows(table));
  for (const f of def.fields) if (f.t === 'ref' && (!f.adminOnly || isAdmin())) await refOptions(f.ref, f.refLabel);
  const fields = visibleFields(table, { listing: true });
  const extraCols = opts.extraCols || [];
  const readonly = !!opts.readonly;
  const formSlot = h('div');
  const rerender = opts.rerender || (() => {});

  const head = h('div', { class: 'blockhead' }, h('h2', {}, opts.title || TABLE_TITLES[table]),
    !readonly && canEdit(table, null) && !opts.noAdd
      ? h('button', { onclick: () => openForm(table, null, formSlot, rerender) }, 'Add') : null);

  const tbl = h('table', {},
    h('thead', {}, h('tr', {}, fields.map((f) => h('th', {}, f.l)), extraCols.map((c) => h('th', {}, c.l)), readonly ? null : h('th', {}, ''))),
    h('tbody', {}, rows.length === 0
      ? h('tr', {}, h('td', { colspan: fields.length + extraCols.length + 1, class: 'empty' }, 'Nothing recorded yet.'))
      : rows.map((r) => {
        const actions = [];
        if (!readonly) {
          for (const a of opts.rowActions?.(r) || []) actions.push(a);
          if (canEdit(table, r)) actions.push(h('button', { class: 'small', onclick: () => openForm(table, r, formSlot, rerender) }, 'Edit'));
          if (isAdmin()) actions.push(deleteButton(async () => {
            if (opts.onDelete) await opts.onDelete(r);
            const { error } = await sb.from(table).delete().eq('id', r.id);
            if (error) throw error;
            rerender();
          }));
        }
        return h('tr', {},
          fields.map((f) => h('td', { class: f.t === 'textarea' ? 'wrap' : null }, cell(f, r[f.k], opts))),
          extraCols.map((c) => h('td', {}, c.v(r) ?? '')),
          readonly ? null : h('td', { class: 'actions' }, actions));
      })));

  return h('section', { class: 'block' }, head, formSlot, h('div', { class: 'scroll' }, tbl));
}

function deleteButton(doDelete) {
  const btn = h('button', { class: 'small' }, 'Delete');
  let armed = false;
  btn.addEventListener('click', async () => {
    if (!armed) { armed = true; btn.textContent = 'Confirm delete'; setTimeout(() => { armed = false; btn.textContent = 'Delete'; }, 4000); return; }
    btn.disabled = true;
    try { await doDelete(); } catch (e) { btn.disabled = false; btn.textContent = 'Error: ' + e.message; }
  });
  return btn;
}

async function openForm(table, row, slot, rerender, { extraFields = [], onSubmit } = {}) {
  const fields = visibleFields(table);
  const inputs = {};
  const out = h('p', { class: 'msg' });
  const controls = [];
  for (const f of fields) {
    let v = row ? row[f.k] : (typeof f.def === 'function' ? f.def() : f.def);
    let input;
    if (f.t === 'textarea') input = h('textarea', { rows: 3 }, v ?? '');
    else if (f.t === 'bool') { input = h('input', { type: 'checkbox' }); input.checked = !!v; }
    else if (f.t === 'select' || f.t === 'ref') {
      const options = f.t === 'ref' ? await refOptions(f.ref, f.refLabel) : f.opts.map((o) => ({ v: o, l: o.replace(/_/g, ' ') }));
      input = h('select', {}, h('option', { value: '' }, ''), options.map((o) => h('option', { value: o.v }, o.l)));
      input.value = v ?? '';
    } else {
      const type = { date: 'date', number: 'number', money: 'number' }[f.t] || 'text';
      input = h('input', { type, step: f.t === 'money' || f.t === 'number' ? 'any' : null, placeholder: f.hint || null });
      input.value = v ?? '';
    }
    if (f.req) input.required = true;
    inputs[f.k] = input;
    controls.push(h('label', { class: f.t === 'bool' ? 'check' : null }, f.l + (f.req ? ' *' : ''), input));
  }
  for (const x of extraFields) controls.push(x.el);

  const form = h('form', {
    class: 'edit',
    onsubmit: async (e) => {
      e.preventDefault();
      const record = {};
      for (const f of fields) {
        const el = inputs[f.k];
        if (f.t === 'bool') record[f.k] = el.checked;
        else if (el.value === '') record[f.k] = null;
        else if (f.t === 'number' || f.t === 'money') record[f.k] = Number(el.value);
        else record[f.k] = el.value;
      }
      out.textContent = 'Saving...';
      try {
        if (onSubmit) await onSubmit(record);
        else {
          const { error } = row
            ? await sb.from(table).update(record).eq('id', row.id)
            : await sb.from(table).insert(record);
          if (error) throw error;
        }
        rerender();
      } catch (err) { out.textContent = 'Error: ' + err.message; }
    },
  }, h('h3', {}, (row ? 'Edit ' : 'Add to ') + TABLE_TITLES[table].toLowerCase()), ...controls,
  h('div', {}, h('button', { type: 'submit' }, 'Save'), ' ', h('button', { type: 'button', onclick: () => slot.replaceChildren() }, 'Cancel')), out);
  slot.replaceChildren(form);
  form.querySelector('input,select,textarea')?.focus();
}

// ---------- Recurrence ----------
const STEP = { twice_monthly: 1, monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

function occurrences(freq, days, startMonth, from, to) {
  const list = String(days || (freq === 'twice_monthly' ? '1,15' : '1')).split(/[\s,]+/).map(Number).filter((n) => n >= 1 && n <= 31);
  const step = STEP[freq] || 1;
  const sm = (startMonth || 1) - 1;
  const out = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur <= to) {
    const m = cur.getMonth();
    if ((((m - sm) % step) + step) % step === 0) {
      const dim = new Date(cur.getFullYear(), m + 1, 0).getDate();
      for (const d of list) {
        const date = new Date(cur.getFullYear(), m, Math.min(d, dim));
        if (date >= from && date <= to) out.push(date);
      }
    }
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

async function calendarItems(from, to, recurringTo) {
  const [events, leases, tasks, bills] = await Promise.all([
    fetchRows('events'), isAdmin() ? fetchRows('leases') : [], fetchRows('tasks'), fetchRows('bills')]);
  const items = [];
  const inRange = (d) => d >= from && d <= to;
  for (const e of events) if (inRange(parseDate(e.date))) items.push({ date: parseDate(e.date), title: e.title, kind: e.category || 'Item', notes: e.notes });
  for (const l of leases) {
    if (!['active', 'pending'].includes(l.status)) continue;
    const who = l.tenant + (l.unit ? ` (${l.unit})` : '');
    if (l.end_date) {
      const end = parseDate(l.end_date);
      if (inRange(end)) items.push({ date: end, title: `Lease ends: ${who}`, kind: 'Lease' });
      if (l.notice_days) {
        const n = addDays(end, -l.notice_days);
        if (inRange(n)) items.push({ date: n, title: `Renewal notice deadline: ${who}`, kind: 'Lease' });
      }
    }
    if (l.start_date && inRange(parseDate(l.start_date))) items.push({ date: parseDate(l.start_date), title: `Lease starts: ${who}`, kind: 'Lease' });
    if (l.escalation_date && inRange(parseDate(l.escalation_date))) items.push({ date: parseDate(l.escalation_date), title: `Rent escalation: ${who}`, kind: 'Lease' });
  }
  const rTo = recurringTo || to;
  for (const t of tasks) for (const d of occurrences(t.frequency, t.due_days, t.start_month, from, rTo)) items.push({ date: d, title: t.title, kind: 'Task', notes: t.assignee ? `Who: ${t.assignee}` : '' });
  for (const b of bills) {
    if (!b.due_day) continue;
    for (const d of occurrences(b.frequency, String(b.due_day), b.start_month, from, rTo)) {
      items.push({ date: d, title: `Bill due: ${b.payee}${b.amount ? ' ' + money(b.amount) : ''}${b.autopay ? ' (autopay)' : ''}`, kind: 'Bill' });
    }
  }
  items.sort((a, b) => a.date - b.date || a.title.localeCompare(b.title));
  return items;
}

function calendarList(items) {
  if (!items.length) return h('p', { class: 'empty' }, 'Nothing scheduled.');
  const groups = new Map();
  for (const it of items) {
    const key = it.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const t0 = parseDate(today());
  return h('div', {}, [...groups].map(([month, list]) => h('div', {},
    h('h3', {}, month),
    h('table', { class: 'cal' }, h('tbody', {}, list.map((it) => h('tr', { class: it.date < t0 ? 'past' : null },
      h('td', { class: 'nowrap' }, it.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })),
      h('td', {}, it.kind), h('td', {}, it.title), h('td', { class: 'wrap' }, it.notes || ''))))))));
}

function icsDownload(items) {
  const esc = (s) => String(s || '').replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sag Harbor Studios//Manual//EN', 'CALSCALE:GREGORIAN'];
  items.forEach((it, i) => {
    const d = ymd(it.date).replace(/-/g, '');
    const d2 = ymd(addDays(it.date, 1)).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${d}-${i}-${esc(it.title).length}@sagharborstudios`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`, `SUMMARY:${esc(it.title)}`, `CATEGORIES:${esc(it.kind)}`,
      ...(it.notes ? [`DESCRIPTION:${esc(it.notes)}`] : []), 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'sag-harbor-studios.ics' });
  document.body.append(a); a.click(); a.remove();
}

// ---------- Views ----------
const VIEWS = {
  async calendar(rerender) {
    const from = addDays(parseDate(today()), -14);
    const to = addDays(parseDate(today()), 365);
    const items = await calendarItems(from, to, addDays(parseDate(today()), 62));
    const yearItems = await calendarItems(parseDate(today()), to);
    return [
      h('p', {}, 'Recurring tasks and bills shown for the next two months. ',
        h('button', { onclick: () => icsDownload(yearItems) }, 'Download next 12 months (.ics)')),
      calendarList(items),
      await tableBlock('events', { rerender }),
    ];
  },

  async income() {
    const [leases, bills, utils] = await Promise.all([fetchRows('leases'), fetchRows('bills'), fetchRows('utility_costs')]);
    const live = leases.filter((l) => ['active', 'pending'].includes(l.status));
    const totalMonthly = live.filter((l) => l.status === 'active').reduce((s, l) => s + Number(l.monthly_rent || 0), 0);

    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const months = [];
    for (let i = 0; i < 12; i++) {
      const ms = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const me = new Date(start.getFullYear(), start.getMonth() + i + 1, 0);
      const rent = live.reduce((s, l) => {
        const okStart = !l.start_date || parseDate(l.start_date) <= me;
        const okEnd = !l.end_date || parseDate(l.end_date) >= ms;
        return s + (okStart && okEnd ? Number(l.monthly_rent || 0) : 0);
      }, 0);
      months.push({ label: ms.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), rent });
    }
    const projected = months.reduce((s, m) => s + m.rent, 0);
    const perYear = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 };
    const billsAnnual = bills.reduce((s, b) => s + Number(b.amount || 0) * (perYear[b.frequency] || 12), 0);
    const yearAgo = addDays(parseDate(today()), -365);
    const utilTrailing = utils.filter((u) => u.period_end && parseDate(u.period_end) >= yearAgo).reduce((s, u) => s + Number(u.amount || 0), 0);

    const row = (k, v) => h('tr', {}, h('th', {}, k), h('td', { class: 'num' }, v));
    return [
      h('section', { class: 'block' }, h('h2', {}, 'Summary'),
        h('table', { class: 'kv' }, h('tbody', {},
          row('Current monthly rent roll (active leases)', money(totalMonthly)),
          row('Annualised rent roll', money(totalMonthly * 12)),
          row('Projected rent, next 12 months (by lease dates)', money(projected)),
          row('Recurring bills, annualised', money(billsAnnual)),
          row('Utilities, trailing 12 months', money(utilTrailing)),
          row('Projected rent less bills and utilities', money(projected - billsAnnual - utilTrailing))))),
      h('section', { class: 'block' }, h('h2', {}, 'Rent roll'),
        h('div', { class: 'scroll' }, h('table', {},
          h('thead', {}, h('tr', {}, ['Tenant', 'Unit', 'Status', 'Monthly', 'Annual', 'Ends'].map((x) => h('th', {}, x)))),
          h('tbody', {}, live.length ? live.map((l) => h('tr', {}, h('td', {}, l.tenant), h('td', {}, l.unit || ''), h('td', {}, l.status),
            h('td', { class: 'num' }, money(l.monthly_rent)), h('td', { class: 'num' }, money(Number(l.monthly_rent || 0) * 12)), h('td', {}, fmtDate(l.end_date))))
            : h('tr', {}, h('td', { colspan: 6, class: 'empty' }, 'No active leases recorded.')))))),
      h('section', { class: 'block' }, h('h2', {}, 'Next 12 months'),
        h('div', { class: 'scroll' }, h('table', {},
          h('thead', {}, h('tr', {}, months.map((m) => h('th', {}, m.label)))),
          h('tbody', {}, h('tr', {}, months.map((m) => h('td', { class: 'num' }, money(m.rent)))))))),
    ];
  },

  async schedule(rerender) {
    const log = await fetchRows('task_log');
    const tasks = await fetchRows('tasks');
    const last = {};
    for (const e of log) if (!last[e.task_id] || e.done_on > last[e.task_id]) last[e.task_id] = e.done_on;
    const t0 = parseDate(today());
    const next = (t) => occurrences(t.frequency, t.due_days, t.start_month, t0, addDays(t0, 400))[0];
    return [
      await tableBlock('tasks', {
        rows: tasks, rerender,
        extraCols: [{ l: 'Last done', v: (t) => fmtDate(last[t.id]) }, { l: 'Next due', v: (t) => { const d = next(t); return d ? fmtDate(ymd(d)) : ''; } }],
        rowActions: (t) => [h('button', {
          class: 'small',
          onclick: async (e) => {
            e.target.disabled = true;
            const { error } = await sb.from('task_log').insert({ task_id: t.id, done_on: today(), done_by: state.user.email });
            if (error) { e.target.textContent = 'Error: ' + error.message; return; }
            rerender();
          },
        }, 'Mark done today')],
      }),
      await tableBlock('task_log', { rows: log, rerender }),
    ];
  },

  async utilities(rerender) {
    const rows = await fetchRows('utility_costs');
    const years = [...new Set(rows.map((r) => (r.period_end || r.period_start || r.paid_on || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    const kinds = [...new Set(rows.map((r) => r.utility))].sort();
    const sum = (y, k) => rows.filter((r) => (r.period_end || r.period_start || r.paid_on || '').startsWith(y) && (!k || r.utility === k)).reduce((s, r) => s + Number(r.amount || 0), 0);
    const summary = years.length
      ? h('div', { class: 'scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Year'), kinds.map((k) => h('th', {}, k)), h('th', {}, 'Total'))),
        h('tbody', {}, years.map((y) => h('tr', {}, h('td', {}, y), kinds.map((k) => h('td', { class: 'num' }, money(sum(y, k)))), h('td', { class: 'num' }, money(sum(y))))))))
      : h('p', { class: 'empty' }, 'No utility bills recorded yet.');
    return [h('section', { class: 'block' }, h('h2', {}, 'Totals by year'), summary), await tableBlock('utility_costs', { rows, rerender })];
  },

  async documents(rerender) {
    const rows = await fetchRows('documents');
    const formSlot = h('div');
    const upload = isAdmin() ? h('button', {
      onclick: () => {
        const file = h('input', { type: 'file', required: true });
        openForm('documents', null, formSlot, rerender, {
          extraFields: [{ el: h('label', {}, 'File *', file) }],
          onSubmit: async (record) => {
            const f = file.files[0];
            if (!f) throw new Error('Choose a file.');
            const path = `${crypto.randomUUID()}/${f.name.replace(/[^\w.\-]+/g, '_')}`;
            const up = await sb.storage.from('documents').upload(path, f, { contentType: f.type || undefined });
            if (up.error) throw up.error;
            const { error } = await sb.from('documents').insert({ ...record, file_path: path, file_name: f.name });
            if (error) { await sb.storage.from('documents').remove([path]); throw error; }
          },
        });
      },
    }, 'Upload document') : null;
    const block = await tableBlock('documents', {
      rows, rerender, noAdd: true,
      extraCols: [{ l: 'File', v: (d) => d.file_name }],
      rowActions: (d) => [h('button', {
        class: 'small',
        onclick: async (e) => {
          const { data, error } = await sb.storage.from('documents').createSignedUrl(d.file_path, 120);
          if (error) { e.target.textContent = 'Error: ' + error.message; return; }
          window.open(data.signedUrl, '_blank', 'noopener');
        },
      }, 'Open')],
      onDelete: async (d) => { await sb.storage.from('documents').remove([d.file_path]); },
    });
    return [h('p', {}, upload), formSlot, block];
  },

  async users(rerender) {
    const { data, error } = await sb.from('profiles').select('*').order('created_at');
    if (error) throw error;
    return [h('section', { class: 'block' },
      h('p', {}, 'To add someone: Supabase dashboard, Authentication, Users, Invite user. They get an email link to set a password. New users start as manager.'),
      h('table', {}, h('thead', {}, h('tr', {}, ['Email', 'Role', 'Added'].map((x) => h('th', {}, x)))),
        h('tbody', {}, data.map((p) => {
          const sel = h('select', {
            disabled: p.user_id === state.user.id,
            onchange: async () => {
              const r = await sb.from('profiles').update({ role: sel.value }).eq('user_id', p.user_id);
              if (r.error) alertRow.textContent = 'Error: ' + r.error.message; else rerender();
            },
          }, h('option', { value: 'manager' }, 'manager'), h('option', { value: 'admin' }, 'admin'));
          sel.value = p.role;
          const alertRow = h('span', { class: 'msg' });
          return h('tr', {}, h('td', {}, p.email), h('td', {}, sel, ' ', alertRow), h('td', {}, fmtDate(p.created_at?.slice(0, 10))));
        }))))];
  },

  async print() {
    const withCodes = h('input', { type: 'checkbox' });
    const out = h('div', { class: 'printout' });
    const build = async () => {
      out.replaceChildren(h('p', {}, 'Building...'));
      const parts = [h('h1', {}, `${BUILDING_NAME} building manual`), h('p', {}, `${BUILDING_ADDRESS}. Generated ${fmtDate(today())} by ${state.user.email}.`)];
      for (const s of visibleSections()) {
        if (['print', 'users'].includes(s.id)) continue;
        parts.push(h('h1', { class: 'pagebreak' }, s.label));
        if (s.id === 'calendar') {
          const t0 = parseDate(today());
          parts.push(calendarList(await calendarItems(t0, addDays(t0, 365), addDays(t0, 62))));
          parts.push(await tableBlock('events', { readonly: true }));
        } else if (s.id === 'income') {
          parts.push(...(await VIEWS.income()));
        } else if (s.id === 'access') {
          parts.push(await tableBlock('secrets', { readonly: true, secrets: withCodes.checked ? 'show' : 'hide' }));
        } else {
          for (const t of s.tables || []) parts.push(await tableBlock(t, { readonly: true }));
        }
      }
      out.replaceChildren(...parts);
    };
    return [h('p', { class: 'noprint' },
      h('label', { class: 'check' }, withCodes, 'Include passwords and codes'), ' ',
      h('button', { onclick: build }, 'Build'), ' ',
      h('button', { onclick: () => window.print() }, 'Print / save as PDF')), out];
  },
};

boot();
