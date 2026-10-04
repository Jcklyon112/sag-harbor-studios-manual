// Every section other than the dashboard.
import {
  h, state, isAdmin, money, fmtDate, parseDate, addDays, button, tel, mail, empty, sectionHead, rows, rowsSafe, getRow,
  canEdit, contactLabel, uploadFile, openFile, removeFile, editRecord, deleteButton, deleteRow, table,
} from './ui.js';
import { TABLES, CONTACT_CATEGORIES, today, ymd } from './sections.js';
import { MONTHS, MONTHS_LONG, timeLeft, unitsFrom, rentForMonth, buildYear, currentRent, finalLease, isRenewed } from './finance.js';
import { unitColor } from './dashboard.js';
import { BUILDING_NAME, BUILDING_ADDRESS } from './config.js';

const statusLabel = (table, v) => (TABLES[table].fields.find((f) => f.k === 'status')?.opts.find((o) => o[0] === v) || [v, v])[1];
const editBtn = (table, row, rerender, label = 'Edit') => (canEdit(table, row) ? button(label, async () => { if (await editRecord(table, row)) rerender(); }, 'small') : null);
const delBtn = (table, row, rerender, before) => (isAdmin() ? deleteButton(async () => { if (before) await before(row); await deleteRow(table, row); rerender(); }) : null);
const addBtn = (table, rerender, label, opts) => (canEdit(table, null) ? button(label, async () => { if (await editRecord(table, null, opts)) rerender(); }, 'primary') : null);

function monthsSummary(months) {
  const set = new Set(months || []);
  if (!set.size) return 'No months set';
  if (set.size === 12) return 'Every month';
  let start = 1;
  while (set.has(start)) start++; // first month not ticked, so runs like Nov–Mar stay whole
  const runs = [];
  let run = null;
  for (let k = 0; k < 12; k++) {
    const m = ((start - 1 + k) % 12) + 1;
    if (set.has(m)) { if (!run) run = [m, m]; else run[1] = m; } else if (run) { runs.push(run); run = null; }
  }
  if (run) runs.push(run);
  return runs.map(([a, b]) => (a === b ? MONTHS[a - 1] : `${MONTHS[a - 1]}–${MONTHS[b - 1]}`)).join(', ');
}

// ---------- Recurring tasks -> dated occurrences ----------
export function taskDates(t, from, to) {
  const months = t.months?.length ? t.months : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const days = String(t.due_days || '1').split(/[\s,]+/).map(Number).filter((n) => n >= 1 && n <= 31);
  const out = [];
  for (let cur = new Date(from.getFullYear(), from.getMonth(), 1); cur <= to; cur.setMonth(cur.getMonth() + 1)) {
    if (!months.includes(cur.getMonth() + 1)) continue;
    const dim = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    for (const d of days) {
      const date = new Date(cur.getFullYear(), cur.getMonth(), Math.min(d, dim));
      if (date >= from && date <= to) out.push(date);
    }
  }
  return out;
}

function contactInline(c) {
  if (!c) return '';
  return h('span', { class: 'contact-inline' }, h('span', {}, contactLabel(c)), c.phone ? [' ', tel(c.phone)] : null);
}

// =====================================================================
// Tenants & leases
// =====================================================================
export async function tenantsView(rerender) {
  const leases = await rows('leases');
  const units = unitsFrom(leases);
  const now = new Date();
  const current = units.map((u) => u.current);
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const others = leases.filter((l) => !current.includes(l));
  const upcomingL = others.filter((l) => l.start_date && parseDate(l.start_date) > t0).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = others.filter((l) => !upcomingL.includes(l));
  const leaseCols = [
    { l: 'Tenant', v: (l) => l.tenant }, { l: 'Unit', v: (l) => l.unit }, { l: 'From', v: (l) => fmtDate(l.start_date) || '—' },
    { l: 'To', v: (l) => fmtDate(l.end_date) }, { l: 'Rent', v: (l) => money(l.monthly_rent), cls: 'num' }, { l: 'Status', v: (l) => statusLabel('leases', l.status) },
  ];
  const open = (l) => { location.hash = '#tenant/' + l.id; };
  return [
    sectionHead('Current tenants', addBtn('leases', rerender, '+ Add lease')),
    current.length ? h('div', { class: 'cards' }, units.map((u) => {
      const l = u.current;
      const fin = finalLease(u.leases);
      const renewed = fin !== l && fin.end_date && (!l.end_date || fin.end_date > l.end_date);
      const tl = timeLeft(fin.end_date, now);
      return h('a', { class: 'card tenant-card', href: '#tenant/' + l.id },
        h('div', { class: 'tc-top' }, h('i', { class: 'swatch big', style: { background: unitColor(u) } }), h('div', {}, h('div', { class: 'tc-unit' }, u.key), h('div', { class: 'tc-name' }, l.tenant))),
        h('dl', { class: 'facts' },
          h('dt', {}, 'Rent now'), h('dd', {}, `${money(currentRent(l, now), { cents: currentRent(l, now) % 1 !== 0 })} / month`),
          renewed ? [h('dt', {}, 'Renewed'), h('dd', {}, `from ${fmtDate(fin.start_date)} at ${money(fin.monthly_rent)}`)] : null,
          h('dt', {}, renewed ? 'Committed to' : 'Lease ends'), h('dd', {}, fin.end_date ? fmtDate(fin.end_date) : '—'),
          h('dt', {}, 'Time left'), h('dd', { class: tl.days >= 0 && tl.days <= 90 ? 'warn' : null }, tl.text)),
        h('span', { class: 'more' }, 'Open tenant →'));
    })) : empty('No leases yet. Click “Add lease” to enter the first one.'),
    upcomingL.length ? [sectionHead('Signed, starting later'), table(leaseCols, upcomingL, { rowClick: open })] : null,
    past.length ? [sectionHead('Ended'), table(leaseCols, past, { rowClick: open })] : null,
  ];
}

export async function tenantView(rerender, id) {
  const lease = await getRow('leases', id);
  if (!lease) return [empty('That lease no longer exists.'), h('a', { href: '#tenants', class: 'btn' }, '← Back to tenants')];
  const [all, docs, expenses] = await Promise.all([
    rows('leases'),
    rows('documents', { filter: (q) => q.eq('lease_id', id) }),
    lease.unit ? rows('expenses', { filter: (q) => q.eq('unit', lease.unit) }) : [],
  ]);
  const units = unitsFrom(all);
  const unit = units.find((u) => u.leases.some((l) => l.id === id));
  const now = new Date();
  const tl = timeLeft(lease.end_date, now);
  const y = now.getFullYear();
  const yearRent = MONTHS.reduce((s, _, m) => s + rentForMonth(lease, y, m), 0);
  const notice = lease.end_date && lease.notice_days ? ymd(addDays(parseDate(lease.end_date), -lease.notice_days)) : null;

  const fact = (k, v) => (v || v === 0 ? [h('dt', {}, k), h('dd', {}, v)] : null);
  const uploadLeaseDoc = async () => {
    const file = h('input', { type: 'file', required: true, id: 'f_file' });
    const saved = await editRecord('documents', null, {
      title: 'Upload a lease document',
      defaults: { lease_id: id, category: 'Lease', title: `Lease – ${lease.tenant}`, restricted: true },
      extra: [h('div', { class: 'field' }, h('label', { for: 'f_file' }, 'File *'), file)],
      onSubmit: async (rec) => {
        const f = file.files[0];
        if (!f) throw new Error('Choose a file.');
        const up = await uploadFile(f);
        const { error } = await state.sb.from('documents').insert({ ...rec, file_path: up.path, file_name: up.name });
        if (error) { await removeFile(up.path); throw error; }
      },
    });
    if (saved) rerender();
  };

  return [
    h('a', { href: '#tenants', class: 'back' }, '← All tenants'),
    h('div', { class: 'tenant-head' },
      h('i', { class: 'swatch big', style: { background: unit ? unitColor(unit) : 'var(--unit-other)' } }),
      h('div', {}, h('h1', {}, lease.tenant), h('p', { class: 'sub' }, [lease.unit, statusLabel('leases', lease.status)].filter(Boolean).join(' · '))),
      h('div', { class: 'actions' }, editBtn('leases', lease, rerender, 'Edit lease'), button('Upload lease document', uploadLeaseDoc, 'primary'))),
    h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, 'Monthly rent now'), h('div', { class: 'tile-value' }, money(currentRent(lease, now), { cents: currentRent(lease, now) % 1 !== 0 })),
        Number(lease.monthly_rent) !== currentRent(lease, now) ? h('div', { class: 'tile-sub' }, `started at ${money(lease.monthly_rent)}`) : null),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, `Rent in ${y}`), h('div', { class: 'tile-value' }, money(yearRent))),
      h('div', { class: 'tile' + (tl.days >= 0 && tl.days <= 90 ? ' warn' : '') }, h('div', { class: 'tile-label' }, 'Lease ends'), h('div', { class: 'tile-value' }, lease.end_date ? fmtDate(lease.end_date) : '—'), h('div', { class: 'tile-sub' }, tl.text))),
    h('div', { class: 'two-col' },
      h('section', { class: 'card' }, h('h2', {}, 'Lease details'), h('dl', { class: 'facts' },
        fact('Starts', fmtDate(lease.start_date)), fact('Ends', fmtDate(lease.end_date)),
        fact('Renewal notice by', notice ? fmtDate(notice) : null),
        fact('Rent increase', lease.escalation_pct ? `${lease.escalation_pct}% from ${fmtDate(lease.escalation_date)}` : null),
        fact('Deposit held', money(lease.security_deposit)), fact('Use', lease.use), fact('Size', lease.sq_ft ? `${lease.sq_ft} sq ft` : null),
        fact('Renewal terms', lease.renewal_terms), fact('Notes', lease.notes))),
      h('section', { class: 'card' }, h('h2', {}, 'Contact'), h('dl', { class: 'facts' },
        fact('Person', lease.contact_name), fact('Phone', tel(lease.phone)), fact('Email', mail(lease.email))))),
    h('section', { class: 'card' }, sectionHead('Lease documents', button('Upload', uploadLeaseDoc, 'small')),
      docs.length ? h('ul', { class: 'doc-list' }, docs.map((d) => h('li', {},
        h('div', {}, h('strong', {}, d.title), h('small', {}, [d.category, fmtDate(d.doc_date), d.file_name].filter(Boolean).join(' · '))),
        h('div', { class: 'actions' }, button('Open', () => openFile(d.file_path), 'small'), button('Download', () => openFile(d.file_path, true), 'small primary'),
          delBtn('documents', d, rerender, (r) => removeFile(r.file_path))))))
        : empty('No documents yet. Upload the signed lease here.')),
    h('section', { class: 'card' }, sectionHead(`Rent by month, ${y}`), h('div', { class: 'table-wrap' }, h('table', { class: 'grid-table' },
      h('thead', {}, h('tr', {}, MONTHS.map((m) => h('th', { class: 'num' }, m)))),
      h('tbody', {}, h('tr', {}, MONTHS.map((_, m) => h('td', { class: 'num' }, money(rentForMonth(lease, y, m)) || '–'))))))),
    expenses.length ? h('section', { class: 'card' }, sectionHead(`Costs recorded for ${lease.unit}`), table([
      { l: 'Date', v: (e) => fmtDate(e.date) }, { l: 'What', v: (e) => e.description || e.category }, { l: 'Amount', v: (e) => money(e.amount, { cents: true }), cls: 'num' },
    ], expenses)) : null,
    unit && unit.leases.length > 1 ? h('section', { class: 'card' }, sectionHead(`All leases for ${unit.key}`), table([
      { l: 'Tenant', v: (l) => l.tenant }, { l: 'From', v: (l) => fmtDate(l.start_date) }, { l: 'To', v: (l) => fmtDate(l.end_date) },
      { l: 'Rent', v: (l) => money(l.monthly_rent), cls: 'num' }, { l: 'Status', v: (l) => statusLabel('leases', l.status) },
    ], unit.leases, { rowClick: (l) => { location.hash = '#tenant/' + l.id; } })) : null,
    isAdmin() ? h('div', { class: 'danger-zone' }, deleteButton(async () => { await deleteRow('leases', lease); location.hash = '#tenants'; }, 'Delete this lease')) : null,
  ];
}

// =====================================================================
// Costs
// =====================================================================
export async function costsView(rerender) {
  const [expenses, utilities, bills, contacts, jobs] = await Promise.all(['expenses', 'utility_costs', 'bills', 'contacts', 'jobs'].map((t) => rowsSafe(t)));
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const cById = byId(contacts); const jById = byId(jobs);
  const now = new Date();
  const y = now.getFullYear();
  const yr = buildYear({ leases: [], expenses, utilities, bills }, y, now);
  const thisMonth = yr.months[now.getMonth()];
  const inYear = expenses.filter((e) => e.date?.startsWith(String(y)));
  const byCat = {};
  for (const e of inYear) byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0);
  const utilYear = utilities.filter((u) => (u.period_end || u.paid_on || '').startsWith(String(y))).reduce((s, u) => s + Number(u.amount || 0), 0);
  if (utilYear) byCat['Utility bills'] = (byCat['Utility bills'] || 0) + utilYear;

  const addCost = async () => {
    const file = h('input', { type: 'file', id: 'f_file' });
    const saved = await editRecord('expenses', null, {
      extra: [h('div', { class: 'field' }, h('label', { for: 'f_file' }, 'Receipt or invoice (optional)'), file)],
      onSubmit: async (rec) => {
        let up = null;
        if (file.files[0]) up = await uploadFile(file.files[0], 'receipts/');
        const { error } = await state.sb.from('expenses').insert({ ...rec, file_path: up?.path ?? null, file_name: up?.name ?? null });
        if (error) { if (up) await removeFile(up.path); throw error; }
      },
    });
    if (saved) rerender();
  };

  return [
    h('p', { class: 'lead' }, 'Every cost you record here is taken off net income on the dashboard, in the month it happened.'),
    h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, `Costs ${MONTHS_LONG[now.getMonth()]}`), h('div', { class: 'tile-value' }, money(thisMonth.recorded))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, `Costs so far in ${y}`), h('div', { class: 'tile-value' }, money(yr.months.filter((m) => !m.future).reduce((s, m) => s + m.recorded, 0)))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, 'Recurring bills, per year'), h('div', { class: 'tile-value' }, money(bills.reduce((s, b) => s + Number(b.amount || 0) * ({ monthly: 12, quarterly: 4, semiannual: 2, annual: 1 }[b.frequency] || 12), 0))))),
    h('section', { class: 'card' }, sectionHead('Costs', button('+ Add a cost', addCost, 'primary')),
      table([
        { l: 'Date', v: (e) => fmtDate(e.date) },
        { l: 'Amount', v: (e) => h('strong', {}, money(e.amount, { cents: true })), cls: 'num' },
        { l: 'Type', v: (e) => e.category },
        { l: 'What for', v: (e) => [e.description, e.job_id && jById[e.job_id] ? h('small', { class: 'block' }, 'Job: ' + jById[e.job_id].title) : null] },
        { l: 'Unit', v: (e) => e.unit },
        { l: 'Paid to', v: (e) => contactLabel(cById[e.contact_id]) },
        { l: '', v: (e) => h('div', { class: 'actions' }, e.file_path ? button('Receipt', () => openFile(e.file_path), 'small') : null, editBtn('expenses', e, rerender), delBtn('expenses', e, rerender, (r) => removeFile(r.file_path))) },
      ], expenses, { emptyText: 'No costs recorded yet. Click “Add a cost”.' })),
    Object.keys(byCat).length ? h('section', { class: 'card' }, sectionHead(`Where the money went in ${y}`), table([
      { l: 'Type', v: ([k]) => k }, { l: 'Total', v: ([, v]) => money(v), cls: 'num' },
    ], Object.entries(byCat).sort((a, b) => b[1] - a[1]))) : null,
    h('section', { class: 'card' }, sectionHead('Utility bills', addBtn('utility_costs', rerender, '+ Add utility bill')),
      table([
        { l: 'Utility', v: (u) => u.utility }, { l: 'Period ends', v: (u) => fmtDate(u.period_end) }, { l: 'Amount', v: (u) => money(u.amount, { cents: true }), cls: 'num' },
        { l: 'Usage', v: (u) => (u.usage ? `${u.usage} ${u.usage_unit || ''}` : '') }, { l: 'Company', v: (u) => u.provider },
        { l: '', v: (u) => h('div', { class: 'actions' }, editBtn('utility_costs', u, rerender), delBtn('utility_costs', u, rerender)) },
      ], utilities)),
    h('section', { class: 'card' }, sectionHead('Recurring bills', addBtn('bills', rerender, '+ Add recurring bill')),
      h('p', { class: 'help' }, 'Bills that come round regularly. They estimate costs for months ahead and appear on the calendar on their due day.'),
      table([
        { l: 'Pay to', v: (b) => h('strong', {}, b.payee) }, { l: 'For', v: (b) => b.description }, { l: 'Amount', v: (b) => money(b.amount), cls: 'num' },
        { l: 'How often', v: (b) => statusLabelOpt('bills', 'frequency', b.frequency) }, { l: 'Due day', v: (b) => b.due_day },
        { l: 'Autopay', v: (b) => (b.autopay ? 'Yes' : 'No') }, { l: 'How to pay', v: (b) => b.pay_method },
        { l: '', v: (b) => h('div', { class: 'actions' }, editBtn('bills', b, rerender), delBtn('bills', b, rerender)) },
      ], bills)),
  ];
}
const statusLabelOpt = (table, k, v) => (TABLES[table].fields.find((f) => f.k === k)?.opts.find((o) => (Array.isArray(o) ? o[0] : o) === v) || [v, v])[1] ?? v;

// =====================================================================
// Calendar: seasonal year planner + the next 8 weeks
// =====================================================================
const SEASONS = [['Winter', [12, 1, 2]], ['Spring', [3, 4, 5]], ['Summer', [6, 7, 8]], ['Autumn', [9, 10, 11]]];

export async function calendarItems(from, to, { tasks, contacts, events, leases, bills }) {
  const cById = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const items = [];
  const inRange = (d) => d >= from && d <= to;
  for (const e of events) if (inRange(parseDate(e.date))) items.push({ date: parseDate(e.date), title: e.title, kind: e.category || 'Item', notes: e.notes, row: e, table: 'events' });
  for (const l of leases) {
    if (!['active', 'pending'].includes(l.status)) continue;
    const who = l.tenant + (l.unit ? ` (${l.unit})` : '');
    const add = (s, t) => { if (s && inRange(parseDate(s))) items.push({ date: parseDate(s), title: `${t}: ${who}`, kind: 'Lease', href: '#tenant/' + l.id }); };
    const renewed = isRenewed(l, leases);
    if (!renewed) add(l.end_date, 'Lease ends');
    add(l.start_date, leases.some((o) => o !== l && isRenewed(o, [l])) ? 'Renewal takes effect' : 'Lease starts');
    add(l.escalation_date, 'Rent increase');
    if (l.end_date && l.notice_days && !renewed) add(ymd(addDays(parseDate(l.end_date), -l.notice_days)), 'Renewal notice deadline');
  }
  for (const t of tasks) for (const d of taskDates(t, from, to)) {
    const c = cById[t.contact_id];
    items.push({ date: d, title: t.title, kind: t.kind === 'seasonal' ? 'Seasonal' : 'Task', notes: c ? `${contactLabel(c)}${c.phone ? ' · ' + c.phone : ''}` : t.assignee || '', href: '#work' });
  }
  for (const b of bills) {
    if (!b.due_day) continue;
    const step = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[b.frequency] || 1;
    const months = [];
    for (let m = 1; m <= 12; m++) if ((((m - (b.start_month || 1)) % step) + step) % step === 0) months.push(m);
    for (const d of taskDates({ months, due_days: String(b.due_day) }, from, to)) items.push({ date: d, title: `Bill due: ${b.payee}${b.amount ? ' ' + money(b.amount) : ''}${b.autopay ? ' (autopay)' : ''}`, kind: 'Bill', href: isAdmin() ? '#costs' : null });
  }
  items.sort((a, b) => a.date - b.date || a.title.localeCompare(b.title));
  return items;
}

export function agenda(items, rerender) {
  if (!items.length) return empty('Nothing scheduled.');
  const t0 = parseDate(today());
  const byDay = new Map();
  for (const it of items) {
    const k = ymd(it.date);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(it);
  }
  return h('ol', { class: 'agenda' }, [...byDay].map(([k, list]) => {
    const d = parseDate(k);
    return h('li', { class: d < t0 ? 'past' : (k === today() ? 'today' : null) },
      h('div', { class: 'ag-date' }, h('span', { class: 'ag-dow' }, d.toLocaleDateString('en-US', { weekday: 'short' })), h('span', { class: 'ag-day' }, d.getDate()), h('span', { class: 'ag-mon' }, MONTHS[d.getMonth()])),
      h('ul', { class: 'ag-items' }, list.map((it) => h('li', {},
        h('span', { class: 'tag tag-' + it.kind.toLowerCase().replace(/\W+/g, '') }, it.kind),
        it.href ? h('a', { href: it.href }, it.title) : h('span', {}, it.title),
        it.notes ? h('small', {}, it.notes) : null,
        it.table && rerender ? h('span', { class: 'actions' }, editBtn(it.table, it.row, rerender), delBtn(it.table, it.row, rerender)) : null))));
  }));
}

export async function calendarView(rerender) {
  const [tasks, contacts, events, leases, bills] = await Promise.all(['tasks', 'contacts', 'events', isAdmin() ? 'leases' : null, 'bills'].map((t) => (t ? rowsSafe(t) : [])));
  const data = { tasks, contacts, events, leases, bills };
  const cById = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const t0 = parseDate(today());
  const items = await calendarItems(addDays(t0, -3), addDays(t0, 56), data);
  const yearItems = await calendarItems(t0, addDays(t0, 365), data);
  const nowMonth = new Date().getMonth() + 1;

  const planned = tasks.filter((t) => t.kind === 'seasonal' || (t.months?.length && t.months.length < 12));
  const seasonal = h('div', { class: 'seasons' }, SEASONS.map(([name, ms]) => h('section', { class: 'season' },
    h('h3', {}, name),
    ms.map((m) => {
      const list = planned.filter((t) => t.months?.includes(m));
      return h('div', { class: 'month-box' + (m === nowMonth ? ' now' : '') },
        h('h4', {}, MONTHS_LONG[m - 1], m === nowMonth ? h('span', { class: 'pill' }, 'This month') : null),
        list.length ? h('ul', {}, list.map((t) => h('li', {},
          canEdit('tasks', t) ? h('button', { type: 'button', class: 'linklike', onclick: async () => { if (await editRecord('tasks', t)) rerender(); } }, t.title) : h('strong', {}, t.title),
          cById[t.contact_id] ? h('small', {}, contactInline(cById[t.contact_id])) : (t.assignee ? h('small', {}, t.assignee) : null))))
          : h('p', { class: 'empty small' }, 'Nothing planned'));
    }))));

  return [
    h('section', { class: 'card' }, sectionHead('Seasonal jobs through the year',
      addBtn('tasks', rerender, '+ Add seasonal job', { defaults: { kind: 'seasonal' } })),
    h('p', { class: 'help' }, 'Snow removal, irrigation blow-out, gutter cleaning and so on. Tick the months each one happens and link the contractor who does it.'),
    seasonal),
    h('section', { class: 'card' }, sectionHead('Next 8 weeks',
      button('Add to my calendar app (.ics)', () => icsDownload(yearItems), 'small'),
      addBtn('events', rerender, '+ Add a date')),
    agenda(items, rerender)),
  ];
}

function icsDownload(items) {
  const esc = (s) => String(s || '').replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sag Harbor Studios//Manual//EN', 'CALSCALE:GREGORIAN'];
  items.forEach((it, i) => {
    const d = ymd(it.date).replace(/-/g, '');
    const d2 = ymd(addDays(it.date, 1)).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${d}-${i}@sagharborstudios`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`,
      `SUMMARY:${esc(it.title)}`, ...(it.notes ? [`DESCRIPTION:${esc(it.notes)}`] : []), 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const a = h('a', { href: URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' })), download: 'sag-harbor-studios.ics' });
  document.body.append(a); a.click(); a.remove();
}

// =====================================================================
// Tasks & jobs
// =====================================================================
export async function workView(rerender) {
  const [tasks, log, jobs, contacts, expenses] = await Promise.all(['tasks', 'task_log', 'jobs', 'contacts', isAdmin() ? 'expenses' : null].map((t) => (t ? rowsSafe(t) : [])));
  const cById = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const last = {};
  for (const e of log) if (!last[e.task_id] || e.done_on > last[e.task_id]) last[e.task_id] = e.done_on;
  const t0 = parseDate(today());
  const next = (t) => taskDates(t, t0, addDays(t0, 400))[0];
  const spent = {};
  for (const e of expenses) if (e.job_id) spent[e.job_id] = (spent[e.job_id] || 0) + Number(e.amount || 0);

  const markDone = (t) => button('✓ Done today', async (e) => {
    e.target.disabled = true;
    const { error } = await state.sb.from('task_log').insert({ task_id: t.id, done_on: today(), done_by: state.user.email });
    if (error) { e.target.textContent = 'Error: ' + error.message; return; }
    rerender();
  }, 'small primary');

  const JOB_COLS = [['planned', 'Planned'], ['in_progress', 'In progress'], ['on_hold', 'On hold'], ['done', 'Done']];
  const jobCard = (j) => {
    const c = cById[j.contact_id];
    const overdue = j.due_date && j.status !== 'done' && parseDate(j.due_date) < t0;
    return h('div', { class: 'job' },
      h('div', { class: 'job-title' }, j.title),
      h('dl', { class: 'facts compact' },
        j.unit ? [h('dt', {}, 'Where'), h('dd', {}, j.unit)] : null,
        c ? [h('dt', {}, 'Contractor'), h('dd', {}, contactInline(c))] : null,
        j.quote ? [h('dt', {}, 'Quote'), h('dd', {}, money(j.quote))] : null,
        spent[j.id] ? [h('dt', {}, 'Spent'), h('dd', {}, money(spent[j.id]))] : null,
        j.due_date ? [h('dt', {}, 'Due'), h('dd', { class: overdue ? 'warn' : null }, fmtDate(j.due_date) + (overdue ? ' (overdue)' : ''))] : null,
        j.completed_on ? [h('dt', {}, 'Finished'), h('dd', {}, fmtDate(j.completed_on))] : null),
      j.notes ? h('p', { class: 'small' }, j.notes) : null,
      h('div', { class: 'actions' }, editBtn('jobs', j, rerender), delBtn('jobs', j, rerender)));
  };

  return [
    h('section', { class: 'card' }, sectionHead('Ongoing tasks', addBtn('tasks', rerender, '+ Add task')),
      table([
        { l: 'Task', v: (t) => [h('strong', {}, t.title), t.instructions ? h('small', { class: 'block' }, t.instructions) : null] },
        { l: 'When', v: (t) => [monthsSummary(t.months), t.due_days ? h('small', { class: 'block' }, `on day ${t.due_days}`) : null] },
        { l: 'Who', v: (t) => (cById[t.contact_id] ? contactInline(cById[t.contact_id]) : t.assignee) },
        { l: 'Last done', v: (t) => (last[t.id] ? fmtDate(last[t.id]) : 'Never') },
        { l: 'Next due', v: (t) => { const d = next(t); return d ? fmtDate(ymd(d)) : ''; } },
        { l: '', v: (t) => h('div', { class: 'actions' }, markDone(t), editBtn('tasks', t, rerender), delBtn('tasks', t, rerender)) },
      ], tasks)),
    h('section', { class: 'card' }, sectionHead('Larger jobs', addBtn('jobs', rerender, '+ Add job')),
      jobs.length ? h('div', { class: 'board' }, JOB_COLS.map(([k, label]) => {
        const list = jobs.filter((j) => j.status === k);
        return h('div', { class: 'board-col' }, h('h3', {}, label, h('span', { class: 'count' }, list.length)), list.length ? list.map(jobCard) : h('p', { class: 'empty small' }, 'None'));
      })) : empty('No jobs yet. Add roof repairs, repainting, renovations and so on.')),
    h('section', { class: 'card' }, sectionHead('Task log', addBtn('task_log', rerender, '+ Log a task')),
      table([
        { l: 'Date', v: (e) => fmtDate(e.done_on) },
        { l: 'Task', v: (e) => tasks.find((t) => t.id === e.task_id)?.title || '' },
        { l: 'By', v: (e) => e.done_by },
        { l: 'Notes', v: (e) => e.notes },
        { l: '', v: (e) => h('div', { class: 'actions' }, editBtn('task_log', e, rerender), delBtn('task_log', e, rerender)) },
      ], log.slice(0, 30))),
  ];
}

// =====================================================================
// Contacts
// =====================================================================
export async function contactsView(rerender) {
  const contacts = await rows('contacts');
  const search = h('input', { type: 'search', placeholder: 'Search by name, trade or phone', class: 'search', 'aria-label': 'Search contacts' });
  const list = h('div');
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = contacts.filter((c) => !q || Object.values(c).join(' ').toLowerCase().includes(q));
    const cats = [...CONTACT_CATEGORIES, ...new Set(shown.map((c) => c.category))].filter((v, i, a) => a.indexOf(v) === i)
      .filter((cat) => shown.some((c) => c.category === cat));
    list.replaceChildren(...(cats.length ? cats.map((cat) => h('section', { class: 'group' }, h('h2', {}, cat),
      h('div', { class: 'cards' }, shown.filter((c) => c.category === cat).map((c) => h('div', { class: 'card contact' },
        h('div', { class: 'c-name' }, c.company || c.name || '—'),
        c.company && c.name ? h('div', { class: 'c-person' }, c.name) : null,
        c.phone ? h('div', { class: 'c-phone' }, tel(c.phone)) : null,
        c.email ? h('div', {}, mail(c.email)) : null,
        c.after_hours ? h('div', { class: 'c-after' }, 'Emergency: ', tel(c.after_hours) || c.after_hours) : null,
        c.notes ? h('p', { class: 'small' }, c.notes) : null,
        h('div', { class: 'actions' }, editBtn('contacts', c, rerender), delBtn('contacts', c, rerender)))))))
      : [empty(contacts.length ? 'No contacts match.' : 'No contacts yet. Add cleaners, plumber, electrician, carpenter, landscaper, snow removal and so on.')]));
  };
  search.addEventListener('input', draw);
  draw();
  return [sectionHead('', search, addBtn('contacts', rerender, '+ Add contact')), list];
}

// =====================================================================
// Keys & codes
// =====================================================================
export async function keysView(rerender) {
  const items = await rows('secrets');
  const cats = [...new Set(items.map((s) => s.category || 'Other'))];
  return [
    sectionHead('', addBtn('secrets', rerender, '+ Add password or code')),
    items.length ? cats.map((cat) => h('section', { class: 'group' }, h('h2', {}, cat),
      h('div', { class: 'cards' }, items.filter((s) => (s.category || 'Other') === cat).map((s) => {
        const val = h('code', { class: 'secret' }, '••••••••');
        let shown = false;
        return h('div', { class: 'card key' },
          h('div', { class: 'c-name' }, s.label),
          s.location ? h('div', { class: 'small' }, s.location) : null,
          s.username ? h('div', {}, h('span', { class: 'k' }, cat === 'Wi-Fi' ? 'Network: ' : 'User: '), h('code', {}, s.username)) : null,
          s.value ? h('div', { class: 'secret-row' }, h('span', { class: 'k' }, cat === 'Wi-Fi' ? 'Password: ' : 'Code: '), val,
            button('Show', (e) => { shown = !shown; val.textContent = shown ? s.value : '••••••••'; e.target.textContent = shown ? 'Hide' : 'Show'; }, 'small'),
            button('Copy', async (e) => { try { await navigator.clipboard.writeText(s.value); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Copy failed'; } setTimeout(() => { e.target.textContent = 'Copy'; }, 1500); }, 'small')) : null,
          s.notes ? h('p', { class: 'small' }, s.notes) : null,
          s.restricted ? h('span', { class: 'pill' }, 'Owner only') : null,
          h('div', { class: 'actions' }, editBtn('secrets', s, rerender), delBtn('secrets', s, rerender)));
      })))) : empty('Nothing stored yet. Add Wi-Fi networks, door codes, alarm codes and lockboxes.'),
  ];
}

// =====================================================================
// Documents
// =====================================================================
export async function documentsView(rerender) {
  const [docs, leases] = await Promise.all([rows('documents'), isAdmin() ? rowsSafe('leases') : []]);
  const lById = Object.fromEntries(leases.map((l) => [l.id, l]));
  const upload = async () => {
    const file = h('input', { type: 'file', required: true, id: 'f_file' });
    const saved = await editRecord('documents', null, {
      title: 'Upload a document',
      extra: [h('div', { class: 'field' }, h('label', { for: 'f_file' }, 'File *'), file)],
      onSubmit: async (rec) => {
        const f = file.files[0];
        if (!f) throw new Error('Choose a file.');
        const up = await uploadFile(f);
        const { error } = await state.sb.from('documents').insert({ ...rec, file_path: up.path, file_name: up.name });
        if (error) { await removeFile(up.path); throw error; }
      },
    });
    if (saved) rerender();
  };
  return [
    sectionHead('', isAdmin() ? button('+ Upload document', upload, 'primary') : null),
    table([
      { l: 'Title', v: (d) => h('strong', {}, d.title) },
      { l: 'Type', v: (d) => d.category },
      { l: 'Lease', v: (d) => (lById[d.lease_id] ? h('a', { href: '#tenant/' + d.lease_id }, lById[d.lease_id].tenant) : '') },
      { l: 'Date', v: (d) => fmtDate(d.doc_date) },
      { l: '', v: (d) => h('div', { class: 'actions' }, button('Open', () => openFile(d.file_path), 'small'), button('Download', () => openFile(d.file_path, true), 'small'), editBtn('documents', d, rerender), delBtn('documents', d, rerender, (r) => removeFile(r.file_path))) },
    ], docs, { emptyText: 'No documents yet.' }),
  ];
}

// =====================================================================
// Building facts
// =====================================================================
export async function buildingView(rerender) {
  const facts = await rows('building_info');
  return [
    h('p', { class: 'lead' }, `${BUILDING_NAME}, ${BUILDING_ADDRESS}. Fixed facts about the property: shut-offs, meters, systems, insurance, tax, zoning.`),
    sectionHead('', addBtn('building_info', rerender, '+ Add fact')),
    facts.length ? h('dl', { class: 'facts big card' }, facts.map((f) => [
      h('dt', {}, f.key), h('dd', {}, h('span', { class: 'pre' }, f.value || ''), f.notes ? h('small', { class: 'block' }, f.notes) : null,
        h('span', { class: 'actions' }, editBtn('building_info', f, rerender), delBtn('building_info', f, rerender)))])) : empty('Nothing recorded yet. Start with the water shut-off, electrical panel and gas meter locations.'),
  ];
}

// =====================================================================
// Settings: users + print
// =====================================================================
export async function settingsView(rerender) {
  const parts = [];
  if (isAdmin()) {
    const { data, error } = await state.sb.from('profiles').select('*').order('created_at');
    if (error) throw error;
    parts.push(h('section', { class: 'card' }, h('h2', {}, 'People who can sign in'),
      h('p', { class: 'help' }, 'To add someone: in Supabase, open Authentication → Users → Send invitation. They get an email to set a password. New people start as Manager: they see the calendar, tasks, contacts, codes and building facts, but not leases, money or anything marked “Owner only”.'),
      table([
        { l: 'Email', v: (p) => p.email },
        { l: 'Access', v: (p) => {
          const sel = h('select', { disabled: p.user_id === state.user.id, 'aria-label': 'Access level',
            onchange: async () => { const r = await state.sb.from('profiles').update({ role: sel.value }).eq('user_id', p.user_id); if (!r.error) rerender(); } },
          h('option', { value: 'manager' }, 'Manager'), h('option', { value: 'admin' }, 'Owner (everything)'));
          sel.value = p.role;
          return sel;
        } },
        { l: 'Added', v: (p) => fmtDate(p.created_at) },
      ], data)));
  }
  parts.push(h('section', { class: 'card' }, h('h2', {}, 'Print or save as PDF'),
    h('p', {}, 'Builds one page with contacts, tasks, the seasonal plan, building facts and (if you tick the box) codes, to print or send.'),
    await printBuilder()));
  parts.push(h('section', { class: 'card' }, h('h2', {}, 'Your account'), h('p', {}, `Signed in as ${state.user.email}.`),
    button('Change my password', async (e) => {
      const { error } = await state.sb.auth.resetPasswordForEmail(state.user.email, { redirectTo: location.origin + location.pathname });
      e.target.textContent = error ? 'Error: ' + error.message : 'Check your email for the link';
    })));
  return parts;
}

async function printBuilder() {
  const withCodes = h('input', { type: 'checkbox', id: 'p_codes' });
  const out = h('div', { class: 'printout' });
  const build = async () => {
    out.replaceChildren(h('p', {}, 'Building…'));
    const [contacts, tasks, facts, secrets, events, bills] = await Promise.all(['contacts', 'tasks', 'building_info', 'secrets', 'events', 'bills'].map((t) => rowsSafe(t)));
    const cById = Object.fromEntries(contacts.map((c) => [c.id, c]));
    const t0 = parseDate(today());
    const items = await calendarItems(t0, addDays(t0, 365), { tasks: tasks.filter((t) => t.kind === 'seasonal'), contacts, events, leases: [], bills: [] });
    out.replaceChildren(
      h('h1', {}, `${BUILDING_NAME} – building manual`), h('p', {}, `${BUILDING_ADDRESS}. Printed ${fmtDate(today())}.`),
      h('h2', { class: 'pagebreak' }, 'Contacts'),
      table([{ l: 'Trade', v: (c) => c.category }, { l: 'Company / person', v: (c) => contactLabel(c) }, { l: 'Phone', v: (c) => c.phone }, { l: 'Emergency', v: (c) => c.after_hours }, { l: 'Email', v: (c) => c.email }], contacts),
      h('h2', {}, 'Building facts'),
      table([{ l: 'Item', v: (f) => f.key }, { l: 'Detail', v: (f) => f.value }, { l: 'Notes', v: (f) => f.notes }], facts),
      h('h2', { class: 'pagebreak' }, 'Tasks'),
      table([{ l: 'Task', v: (t) => t.title }, { l: 'When', v: (t) => monthsSummary(t.months) + (t.due_days ? `, day ${t.due_days}` : '') }, { l: 'Who', v: (t) => (cById[t.contact_id] ? `${contactLabel(cById[t.contact_id])} ${cById[t.contact_id].phone || ''}` : t.assignee) }, { l: 'Instructions', v: (t) => t.instructions }], tasks),
      h('h2', {}, 'Seasonal plan and dates, next 12 months'), agenda(items),
      isAdmin() || bills.length ? [h('h2', {}, 'Recurring bills'), table([{ l: 'Pay to', v: (b) => b.payee }, { l: 'For', v: (b) => b.description }, { l: 'Due day', v: (b) => b.due_day }, { l: 'How to pay', v: (b) => b.pay_method }], bills)] : null,
      h('h2', { class: 'pagebreak' }, 'Keys & codes'),
      table([{ l: 'Name', v: (s) => s.label }, { l: 'Type', v: (s) => s.category }, { l: 'Where', v: (s) => s.location }, { l: 'Network / user', v: (s) => s.username }, { l: 'Code', v: (s) => (withCodes.checked ? s.value : (s.value ? '(withheld)' : '')) }], secrets),
    );
  };
  return h('div', {},
    h('div', { class: 'noprint actions' }, h('label', { class: 'check', for: 'p_codes' }, withCodes, 'Include passwords and codes'), button('Build', build, 'primary'), button('Print / save as PDF', () => window.print())),
    out);
}
