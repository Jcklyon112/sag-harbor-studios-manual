// Field definitions for every record type. Adding a field = a column in Supabase + one line here.
// write: 'admin' = only admins edit; 'member' = managers may add/edit non-restricted rows.
// t (field type): text (default) | textarea | date | number | money | bool | select | secret | ref | months | color | unit
// help: one plain sentence shown under the field in forms.

export const CONTACT_CATEGORIES = ['Cleaning', 'Plumbing', 'Electrical', 'Heating / AC', 'Carpentry', 'Handyman', 'Painting',
  'Roofing / gutters', 'Landscaping', 'Irrigation', 'Snow removal', 'Tree service', 'Locksmith', 'Fire / alarm', 'Pest control',
  'Septic', 'Masonry', 'General contractor', 'Insurance', 'Utility company', 'Village / town', 'Emergency', 'Owner', 'Other'];
export const COST_CATEGORIES = ['Repairs', 'Maintenance', 'Cleaning', 'Landscaping', 'Snow removal', 'Utilities', 'Insurance',
  'Property tax', 'Mortgage / loan', 'Legal / professional', 'Supplies', 'Capital improvement', 'Other'];
export const UTILITIES = ['Electric', 'Gas', 'Water', 'Sewer', 'Oil / propane', 'Internet', 'Trash', 'Other'];

const contactRef = { t: 'ref', ref: 'contacts', refLabel: (c) => [c.company, c.name].filter(Boolean).join(' – ') + (c.category ? ` (${c.category})` : '') };

export const TABLES = {
  leases: {
    title: 'Lease', write: 'admin', order: [['unit', true], ['start_date', false]],
    fields: [
      { k: 'tenant', l: 'Tenant name', req: true },
      { k: 'unit', l: 'Unit / space', t: 'unit', help: 'Use the same unit name every time so its history stays together.' },
      { k: 'status', l: 'Status', t: 'select', opts: [['active', 'Active'], ['pending', 'Signed, not started'], ['expired', 'Ended'], ['terminated', 'Terminated early']], def: 'active' },
      { k: 'monthly_rent', l: 'Monthly rent', t: 'money' },
      { k: 'first_month_rent', l: 'First month rent (if prorated)', t: 'money', help: 'Only if the first month was a part-month at a different amount.' },
      { k: 'start_date', l: 'Lease starts', t: 'date' },
      { k: 'end_date', l: 'Lease ends', t: 'date' },
      { k: 'contact_name', l: 'Contact person' },
      { k: 'phone', l: 'Phone' },
      { k: 'email', l: 'Email' },
      { k: 'use', l: 'What they use it for' },
      { k: 'sq_ft', l: 'Square feet', t: 'number' },
      { k: 'security_deposit', l: 'Security deposit held', t: 'money' },
      { k: 'escalation_pct', l: 'Rent increase %', t: 'number', help: 'Leave blank if the rent does not change during the lease.' },
      { k: 'escalation_date', l: 'Increase takes effect', t: 'date' },
      { k: 'notice_days', l: 'Renewal notice (days before end)', t: 'number', help: 'How many days before the end either side must give notice.' },
      { k: 'renewal_terms', l: 'Renewal terms', t: 'textarea' },
      { k: 'color', l: 'Colour on dashboard', t: 'color', help: 'Optional. Leave unset to use the standard colour for this unit.' },
      { k: 'notes', l: 'Notes', t: 'textarea' },
    ],
  },
  expenses: {
    title: 'Cost', write: 'admin', order: [['date', false]],
    fields: [
      { k: 'date', l: 'Date', t: 'date', req: true, def: 'today' },
      { k: 'amount', l: 'Amount', t: 'money', req: true },
      { k: 'category', l: 'Type of cost', t: 'select', opts: COST_CATEGORIES, req: true },
      { k: 'description', l: 'What it was for' },
      { k: 'unit', l: 'Unit (if it was for one unit)', t: 'unit' },
      { k: 'contact_id', l: 'Paid to', ...contactRef },
      { k: 'job_id', l: 'Part of job', t: 'ref', ref: 'jobs', refLabel: (j) => j.title },
      { k: 'notes', l: 'Notes', t: 'textarea' },
    ],
  },
  utility_costs: {
    title: 'Utility bill', write: 'member', order: [['period_end', false]],
    fields: [
      { k: 'utility', l: 'Utility', t: 'select', opts: UTILITIES, req: true },
      { k: 'amount', l: 'Amount', t: 'money' },
      { k: 'period_end', l: 'Bill period ends', t: 'date', help: 'The cost counts in this month on the dashboard.' },
      { k: 'period_start', l: 'Bill period starts', t: 'date' },
      { k: 'provider', l: 'Company' },
      { k: 'usage', l: 'Usage', t: 'number' },
      { k: 'usage_unit', l: 'Usage unit', hint: 'kWh, therms, gallons' },
      { k: 'paid_on', l: 'Paid on', t: 'date' },
      { k: 'notes', l: 'Notes', t: 'textarea' },
    ],
  },
  bills: {
    title: 'Recurring bill', write: 'admin', order: [['due_day', true]],
    fields: [
      { k: 'payee', l: 'Pay to', req: true },
      { k: 'description', l: 'What for' },
      { k: 'amount', l: 'Usual amount', t: 'money', help: 'Used to estimate costs for months that have not happened yet.' },
      { k: 'frequency', l: 'How often', t: 'select', opts: [['monthly', 'Every month'], ['quarterly', 'Every 3 months'], ['semiannual', 'Every 6 months'], ['annual', 'Once a year']], def: 'monthly' },
      { k: 'due_day', l: 'Due on day of month', t: 'number' },
      { k: 'start_month', l: 'First month due (1–12)', t: 'number', help: 'Only needed for bills that are not monthly.' },
      { k: 'autopay', l: 'Paid automatically', t: 'bool' },
      { k: 'pay_method', l: 'How to pay' },
      { k: 'account_ref', l: 'Account number / reference' },
      { k: 'notes', l: 'Notes', t: 'textarea' },
      { k: 'restricted', l: 'Owner only', t: 'bool' },
    ],
  },
  tasks: {
    title: 'Task', write: 'admin', order: [['title', true]],
    fields: [
      { k: 'title', l: 'Task', req: true },
      { k: 'kind', l: 'Type', t: 'select', opts: [['routine', 'Routine (all year)'], ['seasonal', 'Seasonal']], def: 'routine' },
      { k: 'months', l: 'Which months', t: 'months', help: 'Tick every month this needs doing.' },
      { k: 'due_days', l: 'Day(s) of the month', hint: 'e.g. 1 or 1,15' },
      { k: 'contact_id', l: 'Who does it', ...contactRef },
      { k: 'assignee', l: 'Or: person in charge' },
      { k: 'instructions', l: 'Instructions', t: 'textarea' },
    ],
  },
  task_log: {
    title: 'Task done', write: 'member', order: [['done_on', false]],
    fields: [
      { k: 'task_id', l: 'Task', t: 'ref', ref: 'tasks', refLabel: (t) => t.title, req: true },
      { k: 'done_on', l: 'Done on', t: 'date', req: true, def: 'today' },
      { k: 'done_by', l: 'By' },
      { k: 'notes', l: 'Notes / issues found', t: 'textarea' },
    ],
  },
  jobs: {
    title: 'Job', write: 'member', order: [['due_date', true]],
    fields: [
      { k: 'title', l: 'Job', req: true },
      { k: 'status', l: 'Status', t: 'select', opts: [['planned', 'Planned'], ['in_progress', 'In progress'], ['on_hold', 'On hold'], ['done', 'Done']], def: 'planned' },
      { k: 'unit', l: 'Unit / area', t: 'unit' },
      { k: 'contact_id', l: 'Contractor', ...contactRef },
      { k: 'quote', l: 'Quoted price', t: 'money' },
      { k: 'start_date', l: 'Start', t: 'date' },
      { k: 'due_date', l: 'Due', t: 'date' },
      { k: 'completed_on', l: 'Finished on', t: 'date' },
      { k: 'notes', l: 'Notes', t: 'textarea' },
    ],
  },
  events: {
    title: 'Calendar item', write: 'member', order: [['date', true]],
    fields: [
      { k: 'date', l: 'Date', t: 'date', req: true },
      { k: 'title', l: 'What', req: true },
      { k: 'category', l: 'Type', t: 'select', opts: ['Lease', 'Inspection', 'Insurance', 'Tax', 'Permit', 'Maintenance', 'Meeting', 'Other'] },
      { k: 'notes', l: 'Notes', t: 'textarea' },
      { k: 'restricted', l: 'Owner only', t: 'bool' },
    ],
  },
  contacts: {
    title: 'Contact', write: 'member', order: [['category', true], ['company', true]],
    fields: [
      { k: 'category', l: 'Trade', t: 'select', opts: CONTACT_CATEGORIES, req: true },
      { k: 'company', l: 'Company' },
      { k: 'name', l: 'Person' },
      { k: 'phone', l: 'Phone' },
      { k: 'email', l: 'Email' },
      { k: 'after_hours', l: 'Emergency / after hours' },
      { k: 'notes', l: 'Notes', t: 'textarea' },
      { k: 'restricted', l: 'Owner only', t: 'bool' },
    ],
  },
  secrets: {
    title: 'Password or code', write: 'admin', order: [['category', true], ['label', true]],
    fields: [
      { k: 'label', l: 'Name', req: true, hint: 'e.g. Front door, Office Wi-Fi' },
      { k: 'category', l: 'Type', t: 'select', opts: ['Wi-Fi', 'Door code', 'Alarm', 'Lockbox', 'Key', 'Account login', 'Other'] },
      { k: 'location', l: 'Where' },
      { k: 'username', l: 'Network name / username' },
      { k: 'value', l: 'Password / code', t: 'secret' },
      { k: 'notes', l: 'Notes', t: 'textarea' },
      { k: 'restricted', l: 'Owner only', t: 'bool' },
    ],
  },
  documents: {
    title: 'Document', write: 'admin', order: [['category', true], ['doc_date', false]],
    fields: [
      { k: 'title', l: 'Title', req: true },
      { k: 'category', l: 'Type', t: 'select', opts: ['Lease', 'Lease amendment', 'Insurance', 'Tax', 'Permit / CO', 'Survey / drawings', 'Contract', 'Warranty / manual', 'Invoice / receipt', 'Other'] },
      { k: 'lease_id', l: 'Belongs to lease', t: 'ref', ref: 'leases', refLabel: (l) => `${l.tenant}${l.unit ? ' – ' + l.unit : ''}`, adminOnly: true },
      { k: 'doc_date', l: 'Date', t: 'date' },
      { k: 'notes', l: 'Notes', t: 'textarea' },
      { k: 'restricted', l: 'Owner only', t: 'bool', def: true },
    ],
  },
  building_info: {
    title: 'Building fact', write: 'admin', order: [['sort', true], ['key', true]],
    fields: [
      { k: 'key', l: 'Item', req: true, hint: 'e.g. Water shut-off' },
      { k: 'value', l: 'Detail', t: 'textarea' },
      { k: 'notes', l: 'Notes', t: 'textarea' },
      { k: 'sort', l: 'Order on page', t: 'number' },
      { k: 'restricted', l: 'Owner only', t: 'bool' },
    ],
  },
};

// Navigation, in reading order. adminOnly sections are hidden from managers.
export const NAV = [
  { id: 'dashboard', label: 'Dashboard', adminOnly: true },
  { id: 'tenants', label: 'Tenants & leases', adminOnly: true },
  { id: 'costs', label: 'Costs', adminOnly: true },
  { id: 'calendar', label: 'Calendar' },
  { id: 'work', label: 'Tasks & jobs' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'keys', label: 'Keys & codes' },
  { id: 'documents', label: 'Documents' },
  { id: 'building', label: 'Building' },
  { id: 'settings', label: 'Settings' },
];

export function today() { return ymd(new Date()); }
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
