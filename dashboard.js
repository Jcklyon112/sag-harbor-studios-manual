// Dashboard: rent by unit, costs and net, by month or by year; lease timeline; what is coming up.
import { h, money, fmtDate, rowsSafe, sectionHead, button, table, parseDate, addDays } from './ui.js';
import { buildYear, yearSpan, MONTHS, MONTHS_LONG, timeLeft } from './finance.js';
import { ymd } from './sections.js';

const view = { mode: 'month', year: new Date().getFullYear() };

export const unitColor = (u) => u.color || (u.slot < 8 ? `var(--unit-${u.slot + 1})` : 'var(--unit-other)');
const goTenant = (u) => { location.hash = '#tenant/' + u.current.id; };

export async function dashboardView(rerender) {
  const [leases, expenses, utilities, bills] = await Promise.all(
    ['leases', 'expenses', 'utility_costs', 'bills'].map((t) => rowsSafe(t)));
  const data = { leases, expenses, utilities, bills };
  const now = new Date();

  if (!leases.length) {
    return [h('div', { class: 'callout' },
      h('p', {}, 'Add your leases and the dashboard fills in: rent by unit, costs, what you net each month and year, and when every lease ends.'),
      h('a', { class: 'btn primary', href: '#tenants' }, 'Go to Tenants & leases'))];
  }

  const yr = buildYear(data, view.year, now);
  const thisMonth = view.year === now.getFullYear() ? yr.months[now.getMonth()] : null;

  // ----- Controls -----
  const controls = h('div', { class: 'controls' },
    h('div', { class: 'seg', role: 'group', 'aria-label': 'View' },
      h('button', { type: 'button', 'aria-pressed': String(view.mode === 'month'), onclick: () => { view.mode = 'month'; rerender(); } }, 'By month'),
      h('button', { type: 'button', 'aria-pressed': String(view.mode === 'year'), onclick: () => { view.mode = 'year'; rerender(); } }, 'By year')),
    view.mode === 'month' ? h('div', { class: 'year-step' },
      button('◀', () => { view.year--; rerender(); }, 'icon'),
      h('strong', { class: 'year-label' }, String(view.year)),
      button('▶', () => { view.year++; rerender(); }, 'icon'),
      view.year !== now.getFullYear() ? button('This year', () => { view.year = now.getFullYear(); rerender(); }, 'small') : null) : null);

  // ----- Headline numbers -----
  const tile = (label, value, sub, cls = '') => h('div', { class: 'tile ' + cls }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), sub ? h('div', { class: 'tile-sub' }, sub) : null);
  const tiles = h('div', { class: 'tiles' },
    tile(`Rent ${view.year}`, money(yr.rent), 'from all leases'),
    tile(`Costs ${view.year}`, money(yr.costs), yr.months.some((m) => m.estimated) ? 'includes estimates for months ahead' : 'recorded costs'),
    tile(`Net ${view.year}`, money(yr.net), 'rent minus costs', yr.net < 0 ? 'neg' : 'pos'),
    thisMonth ? tile(`Net ${MONTHS_LONG[now.getMonth()]}`, money(thisMonth.net), `${money(thisMonth.rent)} rent − ${money(thisMonth.costs)} costs`, thisMonth.net < 0 ? 'neg' : 'pos') : null);

  const parts = [controls, tiles];

  if (view.mode === 'month') {
    parts.push(h('section', { class: 'card' }, sectionHead(`Rent and costs, month by month, ${view.year}`), chart(yr.months.map((m) => ({ label: m.label, rentByUnit: m.rentByUnit, rent: m.rent, costs: m.costs, net: m.net, estimated: m.estimated, future: m.future })), yr.units), legend(yr.units)));
    parts.push(h('section', { class: 'card' }, sectionHead('By unit, month by month'), monthTable(yr)));
  } else {
    const years = yearSpan(leases, now).map((y) => buildYear(data, y, now));
    const units = years[0].units;
    parts.push(h('section', { class: 'card' }, sectionHead('Rent and costs, year by year'),
      chart(years.map((y) => ({ label: String(y.year), rentByUnit: y.unitTotals, rent: y.rent, costs: y.costs, net: y.net, estimated: y.months.some((m) => m.estimated), future: y.year > now.getFullYear(), onclick: () => { view.mode = 'month'; view.year = y.year; rerender(); } })), units),
      legend(units)));
    parts.push(h('section', { class: 'card' }, sectionHead('By unit, year by year'), yearTable(years, units)));
  }

  parts.push(h('section', { class: 'card' }, sectionHead('When leases end'), timeline(yr.units, now)));
  parts.push(h('section', { class: 'card' }, sectionHead('Coming up in the next 6 months'), upcoming(leases, now)));
  return parts;
}

// ----- Bar chart: stacked rent by unit + a cost bar, net printed below -----
function chart(cols, units) {
  const max = Math.max(1, ...cols.map((c) => Math.max(c.rent, c.costs)));
  const tip = h('div', { class: 'tip', role: 'tooltip', hidden: true });
  const show = (e, lines) => {
    tip.replaceChildren(...lines.map((l, i) => h(i === 0 ? 'strong' : 'div', {}, l)));
    tip.hidden = false;
    const box = tip.parentElement.getBoundingClientRect();
    const x = (e.clientX ?? e.target.getBoundingClientRect().left) - box.left;
    const y = (e.clientY ?? e.target.getBoundingClientRect().top) - box.top;
    tip.style.left = Math.min(Math.max(x + 14, 0), box.width - 220) + 'px';
    tip.style.top = Math.max(y - 10, 0) + 'px';
  };
  const hide = () => { tip.hidden = true; };
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];

  const grid = h('div', { class: 'chart-grid', 'aria-hidden': 'true' },
    ticks.map((t) => h('div', { class: 'gridline', style: { bottom: (t / top) * 100 + '%' } }, h('span', {}, money(t)))));

  const columns = cols.map((c) => {
    const rentLines = [c.label, `Rent: ${money(c.rent)}`, ...units.filter((u) => c.rentByUnit[u.key]).map((u) => `  ${u.key}: ${money(c.rentByUnit[u.key])}`), `Costs: ${money(c.costs)}${c.estimated ? ' (estimate)' : ''}`, `Net: ${money(c.net)}`];
    const stack = h('div', { class: 'bar rent', style: { height: (c.rent / top) * 100 + '%' }, tabindex: '0', 'aria-label': rentLines.join(', '),
      onmousemove: (e) => show(e, rentLines), onmouseleave: hide, onfocus: (e) => show(e, rentLines), onblur: hide },
    units.filter((u) => c.rentByUnit[u.key]).map((u) => h('div', { class: 'seg-fill', style: { flexGrow: c.rentByUnit[u.key], background: unitColor(u) } })));
    const costLines = [c.label, `Costs: ${money(c.costs)}${c.estimated ? ' (estimate from recurring bills)' : ''}`];
    const cost = h('div', { class: 'bar cost' + (c.estimated ? ' est' : ''), style: { height: (c.costs / top) * 100 + '%' }, tabindex: '0', 'aria-label': costLines.join(', '),
      onmousemove: (e) => show(e, costLines), onmouseleave: hide, onfocus: (e) => show(e, costLines), onblur: hide });
    return h('div', { class: 'col' + (c.future ? ' future' : ''), onclick: c.onclick || null },
      h('div', { class: 'bars' }, stack, cost),
      h('div', { class: 'col-label' }, c.label),
      h('div', { class: 'col-net ' + (c.net < 0 ? 'neg' : '') }, money(c.net)));
  });

  return h('div', { class: 'chart' },
    h('div', { class: 'chart-key' },
      h('span', {}, h('i', { class: 'key-swatch stack' }), 'Rent (coloured by unit)'),
      h('span', {}, h('i', { class: 'key-swatch cost' }), 'Costs'),
      h('span', {}, h('i', { class: 'key-swatch cost est' }), 'Estimated costs'),
      h('span', {}, h('b', {}, '$'), ' Net under each bar')),
    h('div', { class: 'chart-scroll' }, h('div', { class: 'chart-body' }, grid, h('div', { class: 'cols', style: { gridTemplateColumns: `repeat(${cols.length}, 1fr)` } }, columns), tip)));
}

function niceTicks(max) {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

function legend(units) {
  return h('div', { class: 'legend' }, units.map((u) => h('button', { type: 'button', class: 'legend-item', onclick: () => goTenant(u) },
    h('i', { class: 'swatch', style: { background: unitColor(u) } }),
    h('span', {}, h('strong', {}, u.key), ' ', u.current.tenant))));
}

function unitCell(u) {
  return h('button', { type: 'button', class: 'unit-link', onclick: () => goTenant(u) },
    h('i', { class: 'swatch', style: { background: unitColor(u) } }), h('span', {}, h('strong', {}, u.key), h('small', {}, u.current.tenant)));
}

function monthTable(yr) {
  const head = h('tr', {}, h('th', {}, 'Unit'), MONTHS.map((m) => h('th', { class: 'num' }, m)), h('th', { class: 'num' }, 'Year'));
  const body = yr.units.map((u) => h('tr', {}, h('th', { scope: 'row' }, unitCell(u)),
    yr.months.map((m) => h('td', { class: 'num' }, m.rentByUnit[u.key] ? money(m.rentByUnit[u.key]) : '–')),
    h('td', { class: 'num strong' }, money(yr.unitTotals[u.key]))));
  const row = (label, f, total, cls = '') => h('tr', { class: cls }, h('th', { scope: 'row' }, label), yr.months.map((m) => h('td', { class: 'num' }, f(m))), h('td', { class: 'num strong' }, money(total)));
  return h('div', { class: 'table-wrap' }, h('table', { class: 'grid-table' },
    h('thead', {}, head), h('tbody', {}, body),
    h('tfoot', {},
      row('Total rent', (m) => money(m.rent), yr.rent, 'sum'),
      row('Costs', (m) => (m.costs ? money(m.costs) + (m.estimated ? '*' : '') : '–'), yr.costs),
      row('Net', (m) => money(m.net), yr.net, 'net'))),
  yr.months.some((m) => m.estimated) ? h('p', { class: 'help' }, '* Estimate from recurring bills. Replaced by real costs once you record them.') : null);
}

function yearTable(years, units) {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'grid-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Unit'), years.map((y) => h('th', { class: 'num' }, y.year)))),
    h('tbody', {}, units.map((u) => h('tr', {}, h('th', { scope: 'row' }, unitCell(u)), years.map((y) => h('td', { class: 'num' }, y.unitTotals[u.key] ? money(y.unitTotals[u.key]) : '–'))))),
    h('tfoot', {},
      h('tr', { class: 'sum' }, h('th', {}, 'Total rent'), years.map((y) => h('td', { class: 'num' }, money(y.rent)))),
      h('tr', {}, h('th', {}, 'Costs'), years.map((y) => h('td', { class: 'num' }, money(y.costs)))),
      h('tr', { class: 'net' }, h('th', {}, 'Net'), years.map((y) => h('td', { class: 'num' }, money(y.net)))))));
}

// ----- Lease timeline: 24 months from January of last year... centred on today -----
function timeline(units, now) {
  const start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 18, 1);
  const span = end - start;
  const pct = (d) => Math.min(100, Math.max(0, ((d - start) / span) * 100));
  const monthTicks = [];
  for (let d = new Date(start); d < end; d.setMonth(d.getMonth() + 1)) monthTicks.push(new Date(d));

  const axis = h('div', { class: 'tl-axis' }, monthTicks.map((d) => h('span', { class: d.getMonth() === 0 ? 'jan' : null, style: { left: pct(d) + '%' } },
    d.getMonth() === 0 ? String(d.getFullYear()) : MONTHS[d.getMonth()].slice(0, 1))));
  const todayAt = pct(now) + '%';
  const todayLabel = h('div', { class: 'tl-today-label', style: { left: todayAt } }, 'Today');
  const todayMark = () => h('div', { class: 'tl-today', style: { left: todayAt }, 'aria-hidden': 'true' });

  const rowsEls = units.map((u) => {
    const bars = u.leases.filter((l) => l.start_date || l.end_date).map((l) => {
      const s = l.start_date ? parseDate(l.start_date) : start;
      const e = l.end_date ? parseDate(l.end_date) : end;
      if (e < start || s > end) return null;
      const left = pct(s);
      const width = Math.max(pct(e) - left, 0.8);
      const tl = timeLeft(l.end_date, now);
      return h('button', { type: 'button', class: 'tl-bar' + (tl.days >= 0 && tl.days <= 90 ? ' soon' : ''), style: { left: left + '%', width: width + '%', background: unitColor(u) },
        title: `${l.tenant}: ${fmtDate(l.start_date)} to ${fmtDate(l.end_date)} (${money(l.monthly_rent)}/month)`,
        onclick: () => { location.hash = '#tenant/' + l.id; } });
    });
    const cur = u.current;
    const tl = timeLeft(cur.end_date, now);
    return h('div', { class: 'tl-row' },
      h('div', { class: 'tl-name' }, unitCell(u)),
      h('div', { class: 'tl-track' }, bars, todayMark()),
      h('div', { class: 'tl-end' + (tl.days >= 0 && tl.days <= 90 ? ' soon' : '') },
        h('strong', {}, cur.end_date ? fmtDate(cur.end_date) : 'No end date'), h('small', {}, `${tl.text} · ${money(cur.monthly_rent)}/mo`)));
  });

  return h('div', { class: 'timeline' },
    h('div', { class: 'tl-row tl-head' }, h('div', { class: 'tl-name' }), h('div', { class: 'tl-track' }, todayLabel, axis), h('div', { class: 'tl-end' }, h('small', {}, 'Ends'))),
    rowsEls,
    h('p', { class: 'help' }, 'Each bar is a lease. Click a bar or a unit to open the tenant. Leases ending within 90 days are marked.'));
}

function upcoming(leases, now) {
  const limit = addDays(now, 183);
  const items = [];
  for (const l of leases) {
    if (!['active', 'pending'].includes(l.status)) continue;
    const who = `${l.tenant}${l.unit ? ' (' + l.unit + ')' : ''}`;
    const add = (date, what) => { const d = parseDate(date); if (d >= addDays(now, -1) && d <= limit) items.push({ d, what, who, l }); };
    if (l.end_date) add(l.end_date, 'Lease ends');
    if (l.end_date && l.notice_days) add(ymd(addDays(parseDate(l.end_date), -l.notice_days)), 'Last day for renewal notice');
    if (l.start_date) add(l.start_date, 'Lease starts');
    if (l.escalation_date) add(l.escalation_date, 'Rent increase');
  }
  items.sort((a, b) => a.d - b.d);
  return table([
    { l: 'Date', v: (i) => h('strong', {}, fmtDate(ymd(i.d), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })) },
    { l: 'What', v: (i) => i.what },
    { l: 'Tenant', v: (i) => i.who },
    { l: 'In', v: (i) => timeLeft(ymd(i.d), now).text },
  ], items, { emptyText: 'No lease dates in the next 6 months.', rowClick: (i) => { location.hash = '#tenant/' + i.l.id; } });
}
