import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, BUILDING_NAME, BUILDING_ADDRESS } from './config.js';
import { NAV } from './sections.js';
import { h, state, isAdmin, empty } from './ui.js';
import { dashboardView } from './dashboard.js';
import {
  tenantsView, tenantView, costsView, calendarView, workView, contactsView, keysView, documentsView, buildingView, settingsView,
} from './views.js';

// Captured before the client consumes the URL hash, so invite/recovery links land on "set password".
const arrivedFromEmailLink = /type=(invite|recovery|signup)/.test(location.hash);
const app = document.getElementById('app');

const VIEWS = {
  dashboard: dashboardView, tenants: tenantsView, costs: costsView, calendar: calendarView, work: workView,
  contacts: contactsView, keys: keysView, documents: documentsView, building: buildingView, settings: settingsView,
};
const TITLES = {
  dashboard: 'Dashboard', tenants: 'Tenants & leases', costs: 'Costs', calendar: 'Calendar', work: 'Tasks & jobs',
  contacts: 'Contacts', keys: 'Keys & codes', documents: 'Documents', building: 'Building', settings: 'Settings',
};

// ---------- Boot ----------
async function boot() {
  state.sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  state.sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') showSetPassword();
    if (event === 'SIGNED_OUT') showLogin();
  });
  const { data: { session } } = await state.sb.auth.getSession();
  if (!session) return showLogin();
  state.user = session.user;
  if (arrivedFromEmailLink) return showSetPassword();
  await enter();
}

async function enter() {
  const { data: { user } } = await state.sb.auth.getUser();
  state.user = user;
  const { data: profile } = await state.sb.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  state.profile = profile;
  if (!profile) {
    app.replaceChildren(h('main', { class: 'auth-wrap' }, h('div', { class: 'auth' }, h('p', {}, 'This account has no access. Ask the building owner.'),
      h('button', { type: 'button', onclick: () => state.sb.auth.signOut() }, 'Sign out'))));
    return;
  }
  window.onhashchange = route;
  route();
}

// ---------- Auth screens ----------
function authShell(...kids) {
  return h('main', { class: 'auth-wrap' }, h('form', { class: 'auth' }, h('h1', {}, BUILDING_NAME), h('p', { class: 'sub' }, BUILDING_ADDRESS), ...kids));
}

function showLogin(msg) {
  const email = h('input', { type: 'email', id: 'l_email', required: true, autocomplete: 'username' });
  const pw = h('input', { type: 'password', id: 'l_pw', required: true, autocomplete: 'current-password' });
  const out = h('p', { class: 'msg', role: 'alert' }, msg || '');
  const shell = authShell(
    h('div', { class: 'field' }, h('label', { for: 'l_email' }, 'Email'), email),
    h('div', { class: 'field' }, h('label', { for: 'l_pw' }, 'Password'), pw),
    h('button', { type: 'submit', class: 'primary wide' }, 'Sign in'),
    h('button', { type: 'button', class: 'linklike', onclick: async () => {
      if (!email.value) { out.textContent = 'Type your email above first.'; return; }
      const { error } = await state.sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname });
      out.textContent = error ? error.message : 'We sent you an email with a link to set a new password.';
    } }, 'Forgot password?'),
    out);
  shell.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    out.textContent = 'Signing in…';
    const { error } = await state.sb.auth.signInWithPassword({ email: email.value.trim(), password: pw.value });
    if (error) { out.textContent = error.message === 'Invalid login credentials' ? 'That email and password do not match.' : error.message; return; }
    out.textContent = '';
    await enter();
  });
  app.replaceChildren(shell);
}

function showSetPassword() {
  const pw = h('input', { type: 'password', id: 'n_pw', required: true, minlength: 8, autocomplete: 'new-password' });
  const pw2 = h('input', { type: 'password', id: 'n_pw2', required: true, minlength: 8, autocomplete: 'new-password' });
  const out = h('p', { class: 'msg', role: 'alert' });
  const shell = authShell(h('p', {}, 'Choose your password.'),
    h('div', { class: 'field' }, h('label', { for: 'n_pw' }, 'New password (at least 8 characters)'), pw),
    h('div', { class: 'field' }, h('label', { for: 'n_pw2' }, 'Type it again'), pw2),
    h('button', { type: 'submit', class: 'primary wide' }, 'Save password'), out);
  shell.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pw.value !== pw2.value) { out.textContent = 'The two passwords are different.'; return; }
    const { error } = await state.sb.auth.updateUser({ password: pw.value });
    if (error) { out.textContent = error.message; return; }
    history.replaceState(null, '', location.pathname);
    await enter();
  });
  app.replaceChildren(shell);
}

// ---------- Shell ----------
function route() {
  const [id, arg] = location.hash.replace(/^#/, '').split('/');
  const nav = NAV.filter((s) => !s.adminOnly || isAdmin());
  let key = id === 'tenant' && isAdmin() ? 'tenant' : (nav.find((s) => s.id === id)?.id || nav[0].id);
  const navKey = key === 'tenant' ? 'tenants' : key;

  const main = h('main', { id: 'main', tabindex: '-1' });
  const menuBtn = h('button', { type: 'button', class: 'menu-btn', 'aria-expanded': 'false', 'aria-controls': 'nav',
    onclick: () => { const open = document.body.classList.toggle('nav-open'); menuBtn.setAttribute('aria-expanded', String(open)); } }, '☰ Menu');
  document.body.classList.remove('nav-open');

  app.replaceChildren(
    h('a', { class: 'skip', href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, 'Skip to content'),
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('strong', {}, BUILDING_NAME), h('span', {}, BUILDING_ADDRESS)),
      menuBtn,
      h('div', { class: 'who' }, h('span', {}, state.user.email), h('button', { type: 'button', class: 'small', onclick: () => state.sb.auth.signOut() }, 'Sign out'))),
    h('div', { class: 'layout' },
      h('nav', { id: 'nav', 'aria-label': 'Sections' }, h('ul', {}, nav.map((s) => h('li', {}, h('a', { href: '#' + s.id, 'aria-current': s.id === navKey ? 'page' : null }, s.label))))),
      main));
  render(key, arg, main);
}

async function render(key, arg, main) {
  const title = key === 'tenant' ? null : TITLES[key];
  main.replaceChildren(...[title ? h('h1', {}, title) : null, h('p', { class: 'loading' }, 'Loading…')].filter(Boolean));
  const rerender = () => render(key, arg, main);
  let body;
  try {
    body = key === 'tenant' ? await tenantView(rerender, arg) : await VIEWS[key](rerender);
  } catch (err) {
    body = [h('p', { class: 'msg' }, 'Something went wrong loading this page: ' + (err.message || err))];
  }
  const y = window.scrollY;
  const nodes = [title ? h('h1', {}, title) : null, ...[body].flat(Infinity)].filter((n) => n instanceof Node);
  main.replaceChildren(...(nodes.length > (title ? 1 : 0) ? nodes : [...nodes, empty('Nothing here yet.')]));
  window.scrollTo(0, y);
}

boot();
