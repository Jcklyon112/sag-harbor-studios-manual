// Section and field definitions. Adding a field here plus a column in Supabase is all a new field needs.
// write: 'admin' = only admins edit; 'member' = managers may add/edit non-restricted rows.
// t (field type): text (default) | textarea | date | number | money | bool | select | secret | ref

const CONTACT_CATEGORIES = ['Cleaning', 'Plumbing', 'Electrical', 'HVAC', 'Landscaping', 'Snow removal', 'Locksmith',
  'Fire / alarm', 'Pest control', 'Roofing', 'General contractor', 'Insurance', 'Utility', 'Municipal', 'Emergency', 'Owner', 'Other'];
const UTILITIES = ['Electric', 'Gas', 'Water', 'Sewer', 'Oil / propane', 'Internet', 'Trash', 'Other'];

export const TABLES = {
  building_info: {
    write: 'admin', order: [['sort', true], ['key', true]],
    fields: [
      { k: 'key', l: 'Item', req: true },
      { k: 'value', l: 'Detail', t: 'textarea' },
      { k: 'notes', l: 'Notes', t: 'textarea' },
      { k: 'sort', l: 'Order', t: 'number', list: false },
      { k: 'restricted', l: 'Internal only', t: 'bool' },
    ],
  },
  leases: {
    write: 'admin', adminOnly: true, order: [['unit', true]],
    fields: [
      { k: 'tenant', l: 'Tenant', req: true },
      { k: 'unit', l: 'Unit / space' },
      { k: 'use', l: 'Use', list: false },
      { k: 'sq_ft', l: 'Sq ft', t: 'number', list: false },
      { k: 'status', l: 'Status', t: 'select', opts: ['active', 'pending', 'expired', 'terminated'], def: 'active' },
      { k: 'start_date', l: 'Start', t: 'date' },
      { k: 'end_date', l: 'End', t: 'date' },
      { k: 'monthly_rent', l: 'Monthly rent', t: 'money' },
      { k: 'escalation_pct', l: 'Escalation %', t: 'number', list: false },
      { k: 'escalation_date', l: 'Escalation date', t: 'date', list: false },
      { k: 'security_deposit', l: 'Deposit', t: 'money', list: false },
      { k: 'notice_days', l: 'Renewal notice (days before end)', t: 'number', list: false },
      { k: 'renewal_terms', l: 'Renewal terms', t: 'textarea', list: false },
      { k: 'contact_name', l: 'Contact' },
      { k: 'phone', l: 'Phone' },
      { k: 'email', l: 'Email' },
      { k: 'notes', l: 'Notes', t: 'textarea', list: false },
    ],
  },
  events: {
    write: 'member', order: [['date', true]],
    fields: [
      { k: 'date', l: 'Date', t: 'date', req: true },
      { k: 'title', l: 'Item', req: true },
      { k: 'category', l: 'Type', t: 'select', opts: ['Lease', 'Inspection', 'Insurance', 'Tax', 'Permit', 'Maintenance', 'Meeting', 'Other'] },
      { k: 'notes', l: 'Notes', t: 'textarea' },
      { k: 'restricted', l: 'Internal only', t: 'bool' },
    ],
  },
  tasks: {
    write: 'admin', order: [['title', true]],
    fields: [
      { k: 'title', l: 'Task', req: true },
      { k: 'frequency', l: 'Frequency', t: 'select', opts: ['twice_monthly', 'monthly', 'quarterly', 'semiannual', 'annual'], def: 'monthly' },
      { k: 'due_days', l: 'Day(s) of month', hint: 'e.g. 1 or 1,15' },
      { k: 'start_month', l: 'First month (1-12, for quarterly/annual)', t: 'number', list: false },
      { k: 'assignee', l: 'Who' },
      { k: 'instructions', l: 'Instructions', t: 'textarea' },
    ],
  },
  task_log: {
    write: 'member', order: [['done_on', false]],
    fields: [
      { k: 'task_id', l: 'Task', t: 'ref', ref: 'tasks', refLabel: 'title', req: true },
      { k: 'done_on', l: 'Done on', t: 'date', req: true, def: () => today() },
      { k: 'done_by', l: 'By' },
      { k: 'notes', l: 'Notes / issues found', t: 'textarea' },
    ],
  },
  bills: {
    write: 'admin', order: [['due_day', true]],
    fields: [
      { k: 'payee', l: 'Payee', req: true },
      { k: 'description', l: 'For' },
      { k: 'amount', l: 'Amount (typical)', t: 'money' },
      { k: 'frequency', l: 'Frequency', t: 'select', opts: ['monthly', 'quarterly', 'semiannual', 'annual'], def: 'monthly' },
      { k: 'due_day', l: 'Due day', t: 'number' },
      { k: 'start_month', l: 'First month (1-12)', t: 'number', list: false },
      { k: 'autopay', l: 'Autopay', t: 'bool' },
      { k: 'pay_method', l: 'How to pay' },
      { k: 'account_ref', l: 'Account ref', list: false },
      { k: 'notes', l: 'Notes', t: 'textarea', list: false },
      { k: 'restricted', l: 'Internal only', t: 'bool' },
    ],
  },
  utility_costs: {
    write: 'member', order: [['period_end', false]],
    fields: [
      { k: 'utility', l: 'Utility', t: 'select', opts: UTILITIES, req: true },
      { k: 'provider', l: 'Provider' },
      { k: 'period_start', l: 'Period start', t: 'date' },
      { k: 'period_end', l: 'Period end', t: 'date' },
      { k: 'amount', l: 'Amount', t: 'money' },
      { k: 'usage', l: 'Usage', t: 'number' },
      { k: 'usage_unit', l: 'Unit', hint: 'kWh, therms, gal' },
      { k: 'paid_on', l: 'Paid on', t: 'date' },
      { k: 'notes', l: 'Notes', t: 'textarea', list: false },
    ],
  },
  contacts: {
    write: 'member', order: [['category', true], ['company', true]],
    fields: [
      { k: 'category', l: 'Category', t: 'select', opts: CONTACT_CATEGORIES, req: true },
      { k: 'company', l: 'Company' },
      { k: 'name', l: 'Name' },
      { k: 'phone', l: 'Phone' },
      { k: 'email', l: 'Email' },
      { k: 'after_hours', l: 'After hours / emergency' },
      { k: 'notes', l: 'Notes', t: 'textarea' },
      { k: 'restricted', l: 'Internal only', t: 'bool' },
    ],
  },
  secrets: {
    write: 'admin', order: [['category', true], ['label', true]],
    fields: [
      { k: 'label', l: 'Label', req: true },
      { k: 'category', l: 'Type', t: 'select', opts: ['Wi-Fi', 'Door code', 'Alarm', 'Lockbox', 'Key', 'Account login', 'Other'] },
      { k: 'location', l: 'Where' },
      { k: 'username', l: 'Network / username' },
      { k: 'value', l: 'Password / code', t: 'secret' },
      { k: 'notes', l: 'Notes', t: 'textarea' },
      { k: 'restricted', l: 'Internal only', t: 'bool' },
    ],
  },
  documents: {
    write: 'admin', order: [['category', true], ['doc_date', false]],
    fields: [
      { k: 'title', l: 'Title', req: true },
      { k: 'category', l: 'Type', t: 'select', opts: ['Lease', 'Lease amendment', 'Insurance', 'Tax', 'Permit / CO', 'Survey / drawings', 'Contract', 'Warranty / manual', 'Invoice', 'Other'] },
      { k: 'lease_id', l: 'Lease', t: 'ref', ref: 'leases', refLabel: 'tenant', adminOnly: true },
      { k: 'doc_date', l: 'Date', t: 'date' },
      { k: 'notes', l: 'Notes', t: 'textarea', list: false },
      { k: 'restricted', l: 'Internal only', t: 'bool', def: true },
    ],
  },
};

export const SECTIONS = [
  { id: 'building', label: 'Building', blurb: 'Fixed facts about the property: lot, zoning, systems, shut-offs, insurance, tax.', tables: ['building_info'] },
  { id: 'calendar', label: 'Calendar', blurb: 'Everything dated: one-off items below, plus lease dates, bills and recurring tasks generated automatically.', view: 'calendar', tables: ['events'] },
  { id: 'leases', label: 'Tenants & leases', adminOnly: true, blurb: 'Who rents what, on what terms, until when.', tables: ['leases'] },
  { id: 'income', label: 'Income', adminOnly: true, blurb: 'Rent roll and annual figures, calculated from active leases, bills and utility costs.', view: 'income' },
  { id: 'schedule', label: 'Schedule', blurb: 'Recurring procedures and the log of when they were done.', view: 'schedule', tables: ['tasks', 'task_log'] },
  { id: 'bills', label: 'Bills', blurb: 'Recurring payables. Paid on the monthly bill run.', tables: ['bills'] },
  { id: 'utilities', label: 'Utilities', blurb: 'Record every utility bill. Totals by year below.', view: 'utilities', tables: ['utility_costs'] },
  { id: 'contacts', label: 'Contacts', blurb: 'Who to call when something goes wrong.', tables: ['contacts'] },
  { id: 'access', label: 'Access & codes', blurb: 'Wi-Fi, door codes, alarms, lockboxes, keys.', tables: ['secrets'] },
  { id: 'documents', label: 'Documents', blurb: 'Leases, insurance, permits and other paperwork. Stored privately.', view: 'documents', tables: ['documents'] },
  { id: 'users', label: 'Users', adminOnly: true, blurb: 'Who can sign in. Invite new people from the Supabase dashboard, then set their role here.', view: 'users' },
  { id: 'print', label: 'Print / PDF', blurb: 'The whole manual on one page, for printing or saving as PDF.', view: 'print' },
];

export const TABLE_TITLES = {
  building_info: 'Building information', leases: 'Leases', events: 'Dated items', tasks: 'Recurring tasks',
  task_log: 'Task log', bills: 'Bills', utility_costs: 'Utility bills', contacts: 'Contacts',
  secrets: 'Access & codes', documents: 'Documents',
};

export function today() {
  const d = new Date();
  return ymd(d);
}
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
