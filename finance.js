// Pure money and date logic for the dashboard. No DOM, no network: unit-testable with node.
//
// Rules (kept deliberately simple, see BACKLOG.md for refinements):
// - A lease earns its full monthly rent in every calendar month its start..end range touches (no proration).
//   A lease ending on the 1st of a month (noon hand-over) does not earn that month.
// - Escalation: from the month of escalation_date onward, rent = monthly_rent * (1 + escalation_pct/100).
// - Past and current months use costs actually recorded (expenses + utility bills).
// - Future months have no recorded costs yet, so they use recurring bills as an estimate (flagged).

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const d = (s) => (s ? new Date(s + 'T00:00:00') : null);
const n = (v) => Number(v || 0);

export function unitKey(lease) {
  return (lease.unit || lease.tenant || 'Unassigned').trim();
}

export function rentForMonth(lease, year, month) {
  const ms = new Date(year, month, 1);
  const me = new Date(year, month + 1, 0);
  const start = d(lease.start_date);
  let end = d(lease.end_date);
  if (end && end.getDate() === 1) end = new Date(end.getFullYear(), end.getMonth(), 0);
  if (start && start > me) return 0;
  if (end && end < ms) return 0;
  let rent = n(lease.monthly_rent);
  const esc = d(lease.escalation_date);
  if (esc && lease.escalation_pct && ms >= new Date(esc.getFullYear(), esc.getMonth(), 1)) {
    rent = rent * (1 + n(lease.escalation_pct) / 100);
  }
  return Math.round(rent * 100) / 100;
}

const PER_STEP = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
export function billDueInMonth(bill, month) {
  const step = PER_STEP[bill.frequency] || 1;
  const sm = (bill.start_month || 1) - 1;
  return (((month - sm) % step) + step) % step === 0;
}

function monthOf(s) {
  const x = d(s);
  return x ? [x.getFullYear(), x.getMonth()] : null;
}

// Units in a stable order (alphabetical by name) so colours never jump when data changes.
// The lease in force today; else the next one to start; else the most recent.
export function currentLease(leases, now = new Date()) {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const live = leases.filter((l) => l.status !== 'terminated');
  const inForce = live.filter((l) => (!l.start_date || d(l.start_date) <= t) && (!l.end_date || d(l.end_date) >= t));
  if (inForce.length) return inForce.sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')))[0];
  const future = live.filter((l) => l.start_date && d(l.start_date) > t).sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (future.length) return future[0];
  return leases[0];
}

export function unitsFrom(leases, now = new Date()) {
  const map = new Map();
  for (const l of leases) {
    const k = unitKey(l);
    if (!map.has(k)) map.set(k, { key: k, leases: [] });
    map.get(k).leases.push(l);
  }
  const units = [...map.values()].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  units.forEach((u, i) => {
    u.leases.sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
    u.current = currentLease(u.leases, now);
    u.slot = i;
    u.color = u.leases.find((l) => l.color)?.color || null;
  });
  return units;
}

export function buildYear({ leases = [], expenses = [], utilities = [], bills = [] }, year, now = new Date()) {
  const units = unitsFrom(leases, now);
  const curY = now.getFullYear();
  const curM = now.getMonth();
  const months = MONTHS.map((label, m) => {
    const rentByUnit = {};
    let rent = 0;
    for (const u of units) {
      const r = u.leases.reduce((s, l) => s + rentForMonth(l, year, m), 0);
      rentByUnit[u.key] = r;
      rent += r;
    }
    const inMonth = (s) => { const x = monthOf(s); return x && x[0] === year && x[1] === m; };
    const recorded = expenses.filter((e) => inMonth(e.date)).reduce((s, e) => s + n(e.amount), 0)
      + utilities.filter((u) => inMonth(u.period_end || u.paid_on || u.period_start)).reduce((s, u) => s + n(u.amount), 0);
    const future = year > curY || (year === curY && m > curM);
    const estimate = future ? bills.filter((b) => billDueInMonth(b, m)).reduce((s, b) => s + n(b.amount), 0) : 0;
    const costs = future ? estimate : recorded;
    return { m, label, rentByUnit, rent, recorded, estimate, costs, estimated: future && estimate > 0, future, net: rent - costs };
  });
  const sum = (f) => months.reduce((s, x) => s + f(x), 0);
  const unitTotals = Object.fromEntries(units.map((u) => [u.key, sum((x) => x.rentByUnit[u.key])]));
  return { year, units, months, unitTotals, rent: sum((x) => x.rent), costs: sum((x) => x.costs), net: sum((x) => x.net) };
}

export function yearSpan(leases, now = new Date()) {
  const ys = [];
  for (const l of leases) {
    if (l.start_date) ys.push(d(l.start_date).getFullYear());
    if (l.end_date) ys.push(d(l.end_date).getFullYear());
  }
  const y = now.getFullYear();
  const lo = Math.max(Math.min(y - 1, ...ys), y - 4);
  const hi = Math.min(Math.max(y + 1, ...ys), y + 4);
  const out = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

export function monthsBetween(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function timeLeft(endDate, now = new Date()) {
  const end = d(endDate);
  if (!end) return { text: 'No end date', days: Infinity };
  const days = Math.round((end - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (days < 0) return { text: `Ended ${-days} days ago`, days };
  if (days <= 62) return { text: `${days} days left`, days };
  const months = monthsBetween(now, end);
  return { text: months >= 24 ? `${Math.floor(months / 12)} years left` : `${months} months left`, days };
}
