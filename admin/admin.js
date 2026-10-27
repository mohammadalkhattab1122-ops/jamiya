// جمعية · لوحة الإدارة — a separate page for the admin account only.
// Every action goes through the same database rules as the app (admin-only RPCs).
'use strict';
const SUPABASE_URL = 'https://ysjgwsunzccrqvtapjcy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_VltMFIaYFZX8RDvKXDqo7w_Jn7tal5t';
const APP_URL = '../app/';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });

const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const PLAN = { basic: 'منظّم', pro: 'منظّم برو' };
const $ = (s, el = document) => el.querySelector(s);
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(Math.round(Number(n || 0) * 100) / 100).toLocaleString('en-US');
const jd = (n) => `${fmt(n)} د.أ`;
const pad2 = (n) => String(n).padStart(2, '0');
const dt = (iso) => { if (!iso) return '—'; const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; };
const dtt = (iso) => { if (!iso) return '—'; const d = new Date(iso); return `${dt(iso)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const ago = (iso) => {
  if (!iso) return 'ما دخل';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return 'هلأ';
  const h = Math.floor(m / 60); if (h < 24) return `قبل ${h} س`;
  const d = Math.floor(h / 24); if (d < 31) return `قبل ${d} يوم`;
  return dt(iso);
};
const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const shortMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return `${m}/${String(y).slice(2)}`; };
const phoneTxt = (p) => (p ? (p.startsWith('962') ? '0' + p.slice(3) : '+' + p) : '—');
const normPhone = (raw) => {
  let d = String(raw || '').replace(/[^0-9+]/g, '');
  if (d.startsWith('+')) return d.slice(1);
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d.startsWith('962') ? d : '962' + d;
};

let S = { view: 'overview', me: null, data: null, q: '', filter: 'all', sort: { key: null, dir: 1 }, reqTab: 'pending' };

function toast(m) { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = 'none'), 2800); }
function errMsg(e) {
  const m = String(e?.message || e || '');
  if (/Invalid login/i.test(m)) return 'الرقم أو كلمة السر غلط';
  if (/JWT|session/i.test(m)) return 'انتهت الجلسة، سجّل دخول مرة ثانية';
  return m || 'صار خطأ';
}
async function rpc(fn, args = {}) { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; }
async function act(fn, ok) {
  try { const r = await fn(); if (ok) toast(ok); await load(); return r ?? true; }
  catch (e) { toast(errMsg(e)); return false; }
}
function confirmTwice(btn, label = 'متأكد؟ اكبس مرة ثانية') {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1'; const old = btn.textContent; btn.textContent = label;
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; }, 3500);
  return false;
}

/* ---------------- data ---------------- */
async function all(q) { const { data, error } = await q; if (error) throw error; return data || []; }
async function load() {
  const [ov, persons, meta, groups, slots, deliveries, acts, plans, invites, cfg, log, payments] = await Promise.all([
    rpc('admin_overview'),
    Promise.all([all(sb.from('persons').select('id,code,name,user_id,is_admin,suspended,credit,created_at,plan,plan_until,launch_used,deleted_at,created_by')), rpc('visible_phones').catch(() => [])])
      .then(([rows, ph]) => { const m = new Map((ph || []).map((x) => [x.id, x.phone])); return rows.map((p) => ({ ...p, phone: m.get(p.id) ?? null })); }),
    rpc('admin_users_meta').catch(() => []),
    all(sb.from('groups').select('*').order('created_at', { ascending: false })),
    all(sb.from('slots').select('group_id,idx,person_id,share')),
    all(sb.from('deliveries').select('group_id,round,delivered_on')),
    all(sb.from('activations').select('*').order('created_at', { ascending: false })),
    all(sb.from('plan_requests').select('*').order('created_at', { ascending: false })),
    all(sb.from('invites').select('group_id,person_id,status')),
    all(sb.from('app_config').select('*')),
    all(sb.from('group_log').select('group_id,text,by_name,at').order('at', { ascending: false }).limit(40)),
    all(sb.from('payments').select('group_id,round,person_id,amount,fine,paid_on')),
  ]);
  const P = {}; persons.forEach((p) => (P[p.id] = { ...p, credit: Number(p.credit || 0) }));
  const M = {}; (meta || []).forEach((m) => (M[m.person_id] = m));
  const byUid = {}; persons.forEach((p) => { if (p.user_id) byUid[p.user_id] = P[p.id]; });
  const G = groups.map((g) => {
    const sl = slots.filter((s) => s.group_id === g.id);
    const ids = [...new Set(sl.map((s) => s.person_id))];
    const N = new Set(sl.map((s) => s.idx)).size;
    const done = deliveries.filter((d) => d.group_id === g.id).length;
    const pend = ids.filter((pid) => (invites.find((i) => i.group_id === g.id && i.person_id === pid)?.status || 'accepted') !== 'accepted').length;
    const pays = payments.filter((p) => p.group_id === g.id);
    const status = !g.active ? 'waiting' : N && done >= N ? 'done' : 'active';
    return { ...g, amount: Number(g.amount), ids, N, done, pend, status, owner_p: byUid[g.owner], collected: pays.reduce((t, p) => t + Number(p.amount), 0), fines: pays.reduce((t, p) => t + Number(p.fine || 0), 0) };
  });
  const groupsOf = (pid) => G.filter((g) => g.ids.includes(pid));
  const owned = (p) => (p.user_id ? G.filter((g) => g.owner === p.user_id) : []);
  S.data = { ov, P, M, G, acts, plans, invites, cfg: cfg[0] || {}, log, groupsOf, owned, payments };
  render();
}

/* ---------------- shell ---------------- */
const VIEWS = [
  ['overview', '📊 نظرة عامة'],
  ['requests', '🧾 الطلبات'],
  ['users', '👤 المستخدمين'],
  ['groups', '👥 الجمعيات'],
  ['revenue', '💰 الإيرادات'],
  ['notify', '📢 الإشعارات والإعلان'],
  ['settings', '⚙️ الأسعار والدعم'],
];
function pendingCount() { const d = S.data; return d ? d.acts.filter((a) => a.status === 'pending').length + d.plans.filter((r) => r.status === 'pending').length : 0; }
function shell(inner) {
  const pc = pendingCount();
  const nav = VIEWS.map(([k, l]) => `<button data-view="${k}" class="${S.view === k ? 'on' : ''}"><span>${l}</span>${k === 'requests' && pc ? `<span class="badge">${pc}</span>` : ''}</button>`).join('');
  return `
  <div class="layout">
    <aside>
      <div class="brand"><div class="mark">ج</div><div><div class="display">جمعية</div><div class="tiny muted">لوحة الإدارة</div></div></div>
      <nav>${nav}</nav>
      <div class="foot">
        <div class="muted">${esc(S.me?.name || '')} · ${esc(S.me?.code || '')}</div>
        <a href="${APP_URL}">↩︎ رجوع للتطبيق</a>
        <button class="btn sm" id="refresh">↻ تحديث</button>
        <button class="btn sm danger" id="logout">تسجيل الخروج</button>
      </div>
    </aside>
    <div>
      <div class="mob-nav">${VIEWS.map(([k, l]) => `<button data-view="${k}" class="${S.view === k ? 'on' : ''}">${l}${k === 'requests' && pc ? ` (${pc})` : ''}</button>`).join('')}<button id="refresh2">↻</button></div>
      <main>${inner}</main>
    </div>
  </div>`;
}
function render() {
  const v = { overview: vOverview, requests: vRequests, users: vUsers, groups: vGroups, revenue: vRevenue, notify: vNotify, settings: vSettings }[S.view];
  $('#app').innerHTML = shell(v());
  document.title = `${pendingCount() ? `(${pendingCount()}) ` : ''}لوحة الإدارة · جمعية`;
  bindAfter();
}

/* ---------------- views ---------------- */
function kpi(l, v, s, color) { return `<div class="card kpi"><div class="l">${l}</div><div class="v num" ${color ? `style="color:${color}"` : ''}>${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`; }
function bars(months, parts, opts = {}) {
  const max = Math.max(1, ...months.map((m) => parts.reduce((t, p) => t + Number(m[p.key] || 0), 0)));
  return `<div class="bars">${months.map((m) => {
    const tot = parts.reduce((t, p) => t + Number(m[p.key] || 0), 0);
    return `<div class="bar" title="${monthLabel(m.m)}: ${opts.money ? jd(tot) : tot}">
      <div class="val num">${tot ? (opts.money ? fmt(tot) : tot) : ''}</div>
      <div class="stack" style="height:${Math.max(2, (tot / max) * 120)}px">${parts.map((p) => `<span style="height:${tot ? (Number(m[p.key] || 0) / tot) * 100 : 0}%;background:${p.color}"></span>`).join('')}</div>
      <div class="lbl">${shortMonth(m.m)}</div></div>`;
  }).join('')}</div>`;
}
function vOverview() {
  const { ov, acts, plans, G, P, log } = S.data;
  const months = ov.months || [];
  const thisM = months[months.length - 1] || {}, lastM = months[months.length - 2] || {};
  const revThis = Number(thisM.act || 0) + Number(thisM.plan || 0), revLast = Number(lastM.act || 0) + Number(lastM.plan || 0);
  const pend = acts.filter((a) => a.status === 'pending').length + plans.filter((r) => r.status === 'pending').length;
  const expiring = Object.values(P).filter((p) => p.plan_until && new Date(p.plan_until) > new Date() && new Date(p.plan_until) - Date.now() < 30 * 864e5);
  const stuck = G.filter((g) => g.status === 'waiting' && g.pend === 0 && Date.now() - new Date(g.created_at) > 3 * 864e5);
  const todo = [
    pend ? `<div class="row between"><span>🧾 ${pend} طلب بانتظار موافقتك</span><button class="btn sm primary" data-view="requests">افتح الطلبات</button></div>` : '',
    expiring.length ? `<div class="row between"><span>⭐ ${expiring.length} اشتراك بيخلص خلال 30 يوم</span><button class="btn sm" data-goto-users="expiring">شوفهم</button></div>` : '',
    stuck.length ? `<div class="row between"><span>⏳ ${stuck.length} جمعية الكل وافق عليها وما انفعّلت من 3 أيام</span><button class="btn sm" data-goto-groups="waiting">شوفها</button></div>` : '',
    !S.data.cfg.support_whatsapp && !S.data.cfg.support_email ? `<div class="row between"><span>🙋 لسا ما حطيت رقم واتساب أو إيميل للدعم</span><button class="btn sm" data-view="settings">أضفهم</button></div>` : '',
  ].filter(Boolean);
  return `
  <div class="top"><h1>نظرة عامة</h1><span class="muted small">آخر تحديث ${dtt(new Date().toISOString())}</span></div>
  ${todo.length ? `<div class="card" style="margin-bottom:14px;border-color:var(--gold)"><h2 style="margin-bottom:8px">بدها انتباهك</h2><div class="grid" style="gap:8px">${todo.join('')}</div></div>` : ''}
  <div class="grid kpis">
    ${kpi('الإيرادات هالشهر', jd(revThis), `الشهر الماضي ${jd(revLast)}`, 'var(--paid)')}
    ${kpi('مجموع الإيرادات', jd(ov.revenue_total))}
    ${kpi('مستخدمين مسجّلين', ov.registered, `${ov.people} شخص بالنظام · ${ov.deleted} محذوف`)}
    ${kpi('نشطين آخر 7 أيام', ov.active_7d, `آخر 30 يوم: ${ov.active_30d}`)}
    ${kpi('جمعيات شغّالة', ov.active, `${ov.done} مكتملة · ${ov.waiting} بانتظار التفعيل`)}
    ${kpi('أعضاء بجمعيات شغّالة', ov.members_in_active)}
    ${kpi('مبالغ انسجلت بالتطبيق', jd(ov.money_flow), 'كل الأقساط المدفوعة')}
    ${kpi('اشتراكات سارية', Number(ov.subs_basic) + Number(ov.subs_pro), `منظّم ${ov.subs_basic} · برو ${ov.subs_pro} · بتخلص قريباً ${ov.expiring}`)}
    ${kpi('أجهزة مفعّل عليها الإشعارات', ov.devices, `${ov.with_email} حافظين إيميل استرجاع`)}
    ${kpi('موقوفين', ov.suspended, '', ov.suspended ? 'var(--due)' : '')}
  </div>
  <div class="grid two" style="margin-top:14px">
    <div class="card">
      <div class="row between"><h2>الإيرادات آخر 12 شهر</h2><div class="legend"><span><i style="background:var(--accent)"></i>تفعيل جمعيات</span><span><i style="background:var(--gold)"></i>اشتراكات</span></div></div>
      ${bars(months, [{ key: 'act', color: 'var(--accent)' }, { key: 'plan', color: 'var(--gold)' }], { money: true })}
    </div>
    <div class="card">
      <div class="row between"><h2>النمو</h2><div class="legend"><span><i style="background:var(--accent)"></i>تسجيلات</span><span><i style="background:var(--gold)"></i>جمعيات جديدة</span></div></div>
      ${bars(months, [{ key: 'signups', color: 'var(--accent)' }, { key: 'groups', color: 'var(--gold)' }])}
    </div>
  </div>
  <div class="card" style="margin-top:14px">
    <h2 style="margin-bottom:6px">آخر النشاطات بالجمعيات</h2>
    <div class="feed">${log.length ? log.map((e) => `<div><span>${esc(e.text)}</span> <span class="muted tiny">· ${esc(S.data.G.find((g) => g.id === e.group_id)?.name || '')} · ${esc(e.by_name || '')} · ${ago(e.at)}</span></div>`).join('') : '<div class="muted">ما في نشاط لسا.</div>'}</div>
  </div>`;
}

function reqCard(kind, r) {
  const { P, G } = S.data;
  const g = kind === 'act' ? G.find((x) => x.id === r.group_id) : null;
  const who = P[r.person_id];
  const title = kind === 'act' ? `تفعيل «${esc(g?.name || 'جمعية')}»` : `اشتراك ${PLAN[r.plan]} (${r.kind === 'upgrade' ? 'ترقية' : r.kind === 'renew' ? 'تجديد' : 'جديد'})`;
  const id = kind === 'act' ? r.group_id : r.id;
  const refBy = g?.ref_by ? P[g.ref_by]?.name : null;
  return `<div class="req">
    ${r.image_path ? `<img class="thumb" data-img="${esc(r.image_path)}" alt="إيصال التحويل">` : `<div class="thumb">${r.fee > 0 ? 'بدون صورة' : '🎁 رصيد'}</div>`}
    <div style="display:flex;flex-direction:column;gap:6px">
      <div class="row between"><h3>${title}</h3>${r.status === 'pending' ? '<span class="pill gold">بانتظارك</span>' : r.status === 'approved' ? '<span class="pill paid">✓ مقبول</span>' : '<span class="pill due">مرفوض</span>'}</div>
      <div class="small">من <a href="#" data-user="${esc(r.person_id)}">${esc(who?.name || '—')}</a> · ${esc(phoneTxt(who?.phone))} · ${dtt(r.created_at)}</div>
      <div class="small">المبلغ <b class="num">${jd(r.fee)}</b>${Number(r.credit) ? ` <span class="muted">(بعد خصم رصيد ${jd(r.credit)} من ${jd(r.gross)})</span>` : ''}${kind === 'act' ? ` · ${r.members} عضو` : ''}${r.ref ? ` · مرجع <span class="ltr">${esc(r.ref)}</span>` : ''}${refBy ? ` · إحالة من ${esc(refBy)}` : ''}</div>
      ${r.note ? `<div class="small muted">ملاحظة: ${esc(r.note)}</div>` : ''}
      ${r.status === 'pending' ? `<div class="row">
        <button class="btn primary sm" data-approve="${kind}:${esc(id)}">✓ قبول وتفعيل</button>
        <input placeholder="سبب الرفض (بيوصله)" data-note="${kind}:${esc(id)}" style="flex:1;min-width:160px">
        <button class="btn danger sm" data-reject="${kind}:${esc(id)}">رفض</button>
        ${kind === 'act' ? `<button class="btn ghost sm" data-group="${esc(r.group_id)}">تفاصيل الجمعية</button>` : ''}
      </div>` : `<div class="tiny muted">انقرر ${dtt(r.decided_at)}</div>`}
    </div></div>`;
}
function vRequests() {
  const { acts, plans } = S.data;
  const pend = S.reqTab === 'pending';
  const A = acts.filter((a) => (pend ? a.status === 'pending' : a.status !== 'pending')).slice(0, pend ? 999 : 60);
  const R = plans.filter((r) => (pend ? r.status === 'pending' : r.status !== 'pending')).slice(0, pend ? 999 : 60);
  return `
  <div class="top"><h1>الطلبات</h1>
    <div class="row"><button class="btn sm ${pend ? 'primary' : ''}" data-reqtab="pending">بانتظار الموافقة (${pendingCount()})</button><button class="btn sm ${!pend ? 'primary' : ''}" data-reqtab="done">السجل</button></div></div>
  <div class="grid two">
    <div class="card"><h2>تفعيل الجمعيات (${A.length})</h2>${A.length ? A.map((a) => reqCard('act', a)).join('') : `<div class="empty">${pend ? 'ما في طلبات تفعيل جديدة ✓' : 'ما في سجل'}</div>`}</div>
    <div class="card"><h2>الاشتراكات السنوية (${R.length})</h2>${R.length ? R.map((r) => reqCard('plan', r)).join('') : `<div class="empty">${pend ? 'ما في طلبات اشتراك جديدة ✓' : 'ما في سجل'}</div>`}</div>
  </div>`;
}

function sortRows(rows, cols) {
  const k = S.sort.key; if (!k) return rows;
  const c = cols.find((x) => x.k === k); if (!c?.v) return rows;
  return [...rows].sort((a, b) => { const x = c.v(a), y = c.v(b); return (x > y ? 1 : x < y ? -1 : 0) * S.sort.dir; });
}
function table(cols, rows, attr) {
  return `<div class="tablewrap"><table><thead><tr>${cols.map((c) => `<th data-sort="${c.k}">${c.t}${S.sort.key === c.k ? (S.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
  <tbody>${rows.length ? sortRows(rows, cols).map((r) => `<tr class="click" ${attr(r)}>${cols.map((c) => `<td>${c.h(r)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="empty">ما في نتائج</td></tr>`}</tbody></table></div>`;
}
const planActive = (p) => p.plan && p.plan_until && new Date(p.plan_until) > new Date();
function userRows() {
  const { P, M, groupsOf, owned } = S.data;
  const q = S.q.trim().toLowerCase(), qd = q.replace(/[^0-9]/g, '');
  return Object.values(P).filter((p) => {
    if (S.filter === 'registered' && !p.user_id) return false;
    if (S.filter === 'unregistered' && (p.user_id || p.deleted_at)) return false;
    if (S.filter === 'organizers' && !owned(p).length) return false;
    if (S.filter === 'subs' && !planActive(p)) return false;
    if (S.filter === 'expiring' && !(planActive(p) && new Date(p.plan_until) - Date.now() < 30 * 864e5)) return false;
    if (S.filter === 'suspended' && !(p.suspended && !p.deleted_at)) return false;
    if (S.filter === 'deleted' && !p.deleted_at) return false;
    if (S.filter === 'all' && p.deleted_at) return false;
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q) || (qd.length >= 3 && (p.phone || '').includes(qd.replace(/^0/, '')));
  }).map((p) => ({ ...p, m: M[p.id], gs: groupsOf(p.id).length, os: owned(p).length }));
}
function vUsers() {
  const rows = userRows();
  const cols = [
    { k: 'name', t: 'الاسم', v: (r) => r.name, h: (r) => `<b>${esc(r.name)}</b>${r.is_admin ? ' <span class="pill accent">إدارة</span>' : ''}<div class="tiny muted">${esc(r.code)}</div>` },
    { k: 'phone', t: 'الرقم', v: (r) => r.phone || '', h: (r) => `<span class="ltr">${esc(phoneTxt(r.phone))}</span>` },
    { k: 'state', t: 'الحالة', v: (r) => (r.deleted_at ? 0 : r.suspended ? 1 : r.user_id ? 3 : 2), h: (r) => r.deleted_at ? '<span class="pill">محذوف</span>' : r.suspended ? '<span class="pill due">موقوف</span>' : r.user_id ? '<span class="pill paid">مسجّل</span>' : '<span class="pill">ما سجّل</span>' },
    { k: 'last', t: 'آخر دخول', v: (r) => r.m?.last_sign_in || '', h: (r) => `<span class="small">${r.user_id ? ago(r.m?.last_sign_in) : '—'}</span>` },
    { k: 'gs', t: 'جمعيات', v: (r) => r.gs, h: (r) => `<span class="num">${r.gs}</span>${r.os ? ` <span class="tiny muted">(منظّم ${r.os})</span>` : ''}` },
    { k: 'plan', t: 'الباقة', v: (r) => (planActive(r) ? r.plan_until : ''), h: (r) => planActive(r) ? `<span class="pill gold">${PLAN[r.plan]}</span><div class="tiny muted">لـ ${dt(r.plan_until)}</div>` : '<span class="muted small">—</span>' },
    { k: 'credit', t: 'الرصيد', v: (r) => r.credit, h: (r) => (r.credit ? `<span class="num">${jd(r.credit)}</span>` : '<span class="muted">—</span>') },
    { k: 'created', t: 'انضاف', v: (r) => r.created_at, h: (r) => `<span class="small">${dt(r.created_at)}</span>` },
  ];
  const F = [['all', 'الكل'], ['registered', 'مسجّلين'], ['unregistered', 'ما سجّلوا'], ['organizers', 'منظّمين'], ['subs', 'مشتركين'], ['expiring', 'اشتراك بيخلص'], ['suspended', 'موقوفين'], ['deleted', 'محذوفين']];
  return `
  <div class="top"><h1>المستخدمين <span class="muted small">(${rows.length})</span></h1>
    <div class="row"><input id="q" placeholder="ابحث بالاسم، الرقم، أو رقم العضوية" value="${esc(S.q)}" style="min-width:240px"><button class="btn sm" id="csvUsers">⬇ تصدير CSV</button></div></div>
  <div class="row" style="margin-bottom:12px">${F.map(([k, l]) => `<button class="btn sm ${S.filter === k ? 'primary' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
  ${table(cols, rows, (r) => `data-user="${esc(r.id)}"`)}`;
}
const STATUS = { waiting: ['بانتظار التفعيل', 'gold'], active: ['شغّالة', 'accent'], done: ['مكتملة', 'paid'] };
function groupRows() {
  const q = S.q.trim().toLowerCase();
  return S.data.G.filter((g) => (S.filter === 'all' || g.status === S.filter) && (!q || g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q) || (g.owner_p?.name || '').toLowerCase().includes(q)));
}
function vGroups() {
  const rows = groupRows();
  const cols = [
    { k: 'name', t: 'الجمعية', v: (r) => r.name, h: (r) => `<b>${esc(r.name)}</b><div class="tiny muted"><span class="ltr">${esc(r.code)}</span> · ${esc(r.type)}</div>` },
    { k: 'owner', t: 'المنظّم', v: (r) => r.owner_p?.name || '', h: (r) => esc(r.owner_p?.name || '—') },
    { k: 'status', t: 'الحالة', v: (r) => r.status, h: (r) => `<span class="pill ${STATUS[r.status][1]}">${STATUS[r.status][0]}</span>${r.pend ? `<div class="tiny muted">${r.pend} ما وافقوا</div>` : ''}` },
    { k: 'members', t: 'الأعضاء', v: (r) => r.ids.length, h: (r) => `<span class="num">${r.ids.length}</span>` },
    { k: 'amount', t: 'السهم', v: (r) => r.amount, h: (r) => `<span class="num">${jd(r.amount)}</span>` },
    { k: 'pot', t: 'مبلغ القبض', v: (r) => r.amount * r.N, h: (r) => `<span class="num">${jd(r.amount * r.N)}</span>` },
    { k: 'prog', t: 'التقدّم', v: (r) => (r.N ? r.done / r.N : 0), h: (r) => `<div class="progress"><span style="width:${r.N ? (r.done / r.N) * 100 : 0}%"></span></div><div class="tiny muted">${r.done} من ${r.N}</div>` },
    { k: 'via', t: 'التفعيل', v: (r) => r.act_via || '', h: (r) => `<span class="small">${{ fee: 'دفع', plan: 'باقة', launch: 'عرض الإطلاق', admin: 'إدارة', legacy: 'قديم' }[r.act_via] || '—'}</span>` },
    { k: 'created', t: 'انعملت', v: (r) => r.created_at, h: (r) => `<span class="small">${dt(r.created_at)}</span>` },
  ];
  const F = [['all', 'الكل'], ['waiting', 'بانتظار التفعيل'], ['active', 'شغّالة'], ['done', 'مكتملة']];
  return `
  <div class="top"><h1>الجمعيات <span class="muted small">(${rows.length})</span></h1>
    <div class="row"><input id="q" placeholder="ابحث بالاسم، الكود، أو المنظّم" value="${esc(S.q)}" style="min-width:240px"><button class="btn sm" id="csvGroups">⬇ تصدير CSV</button></div></div>
  <div class="row" style="margin-bottom:12px">${F.map(([k, l]) => `<button class="btn sm ${S.filter === k ? 'primary' : ''}" data-filter="${k}">${l} (${k === 'all' ? S.data.G.length : S.data.G.filter((g) => g.status === k).length})</button>`).join('')}</div>
  ${table(cols, rows, (r) => `data-group="${esc(r.id)}"`)}`;
}
function incomeRows() {
  const { acts, plans, P, G } = S.data;
  return [
    ...acts.filter((a) => a.status === 'approved' && Number(a.fee) > 0).map((a) => ({ at: a.decided_at || a.created_at, kind: 'تفعيل جمعية', what: G.find((g) => g.id === a.group_id)?.name || '—', who: P[a.person_id]?.name || '—', fee: Number(a.fee), credit: Number(a.credit), ref: a.ref })),
    ...plans.filter((r) => r.status === 'approved' && Number(r.fee) > 0).map((r) => ({ at: r.decided_at || r.created_at, kind: 'اشتراك', what: PLAN[r.plan] + (r.kind === 'renew' ? ' · تجديد' : r.kind === 'upgrade' ? ' · ترقية' : ''), who: P[r.person_id]?.name || '—', fee: Number(r.fee), credit: Number(r.credit), ref: r.ref })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}
function vRevenue() {
  const rows = incomeRows();
  const ym = (iso) => iso.slice(0, 7);
  const now = new Date(), cm = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const tot = rows.reduce((t, r) => t + r.fee, 0), thisM = rows.filter((r) => ym(r.at) === cm).reduce((t, r) => t + r.fee, 0);
  const credits = rows.reduce((t, r) => t + r.credit, 0);
  const { ov } = S.data;
  const cols = [
    { k: 'at', t: 'التاريخ', v: (r) => r.at, h: (r) => `<span class="small">${dt(r.at)}</span>` },
    { k: 'kind', t: 'النوع', v: (r) => r.kind, h: (r) => `<span class="pill ${r.kind === 'اشتراك' ? 'gold' : 'accent'}">${r.kind}</span>` },
    { k: 'what', t: 'التفاصيل', v: (r) => r.what, h: (r) => esc(r.what) },
    { k: 'who', t: 'من', v: (r) => r.who, h: (r) => esc(r.who) },
    { k: 'fee', t: 'المبلغ', v: (r) => r.fee, h: (r) => `<b class="num">${jd(r.fee)}</b>${r.credit ? `<div class="tiny muted">خصم ${jd(r.credit)}</div>` : ''}` },
    { k: 'ref', t: 'مرجع', v: (r) => r.ref || '', h: (r) => `<span class="ltr small">${esc(r.ref || '—')}</span>` },
  ];
  return `
  <div class="top"><h1>الإيرادات</h1><button class="btn sm" id="csvIncome">⬇ تصدير CSV</button></div>
  <div class="grid kpis" style="margin-bottom:14px">
    ${kpi('هالشهر', jd(thisM), '', 'var(--paid)')}
    ${kpi('المجموع', jd(tot), `${rows.length} عملية`)}
    ${kpi('خصومات الإحالة', jd(credits))}
    ${kpi('متوسط العملية', jd(rows.length ? tot / rows.length : 0))}
  </div>
  <div class="card" style="margin-bottom:14px"><div class="row between"><h2>آخر 12 شهر</h2><div class="legend"><span><i style="background:var(--accent)"></i>تفعيل جمعيات</span><span><i style="background:var(--gold)"></i>اشتراكات</span></div></div>
    ${bars(ov.months || [], [{ key: 'act', color: 'var(--accent)' }, { key: 'plan', color: 'var(--gold)' }], { money: true })}</div>
  ${table(cols, rows, () => '')}`;
}
function vNotify() {
  const c = S.data.cfg;
  return `
  <div class="top"><h1>الإشعارات والإعلان</h1></div>
  <div class="grid two">
    <div class="card" style="display:flex;flex-direction:column;gap:10px">
      <h2>🔔 إشعار على التلفونات</h2>
      <p class="small muted" style="margin:0">بيوصل فوراً لكل الأجهزة اللي مفعّلة الإشعارات (${S.data.ov.devices} جهاز). استعمله للأشياء المهمة بس عشان الناس ما تطفي الإشعارات.</p>
      <label class="f">العنوان<input id="pushTitle" maxlength="60" placeholder="📢 جمعية"></label>
      <label class="f">النص<textarea id="pushBody" rows="3" maxlength="180" placeholder="ميزة جديدة: صار فيك تسجّل دفعة على أكثر من مرة…"></textarea></label>
      <div class="row"><button class="btn primary" id="pushAll">إرسال للكل</button><span class="tiny muted">لإرسال لشخص واحد افتحه من «المستخدمين».</span></div>
    </div>
    <div class="card" style="display:flex;flex-direction:column;gap:10px">
      <h2>📢 إعلان داخل التطبيق</h2>
      <p class="small muted" style="margin:0">بيظهر بأعلى «تنبيهاتي» عند الكل لحد ما تحذفه.</p>
      ${c.announce_text ? `<div class="card" style="background:var(--gold-soft);border:none"><div>${esc(c.announce_text)}</div><div class="tiny muted">منشور ${dtt(c.announce_at)}</div><button class="btn sm danger" id="annDel" style="margin-top:8px">حذف الإعلان</button></div>` : '<div class="muted small">ما في إعلان منشور.</div>'}
      <label class="f">نص الإعلان<textarea id="annText" rows="3">${esc(c.announce_text || '')}</textarea></label>
      <div><button class="btn primary" id="annSave">نشر الإعلان</button></div>
    </div>
  </div>`;
}
function vSettings() {
  const c = S.data.cfg;
  const f = (id, label, val, attrs = '') => `<label class="f">${label}<input id="${id}" value="${esc(val ?? '')}" ${attrs}></label>`;
  return `
  <div class="top"><h1>الأسعار والدعم</h1></div>
  <div class="grid two">
    <div class="card" style="display:flex;flex-direction:column;gap:12px">
      <h2>💳 الأسعار</h2>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        ${f('per_member', 'رسوم العضو الواحد بالجمعية (د.أ)', c.per_member, 'inputmode="decimal" class="ltr"')}
        ${f('ref_credit', 'مكافأة الإحالة (د.أ)', c.ref_credit, 'inputmode="decimal" class="ltr"')}
      </div>
      <h3>باقة «منظّم» السنوية</h3>
      <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:10px">
        ${f('basic_price', 'السعر', c.basic_price, 'inputmode="decimal" class="ltr"')}${f('basic_groups', 'جمعيات بالسنة', c.basic_groups, 'inputmode="numeric" class="ltr"')}${f('basic_members', 'حد الأعضاء', c.basic_members, 'inputmode="numeric" class="ltr"')}
      </div>
      <h3>باقة «منظّم برو» السنوية</h3>
      <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:10px">
        ${f('pro_price', 'السعر', c.pro_price, 'inputmode="decimal" class="ltr"')}${f('pro_groups', 'جمعيات بالسنة', c.pro_groups, 'inputmode="numeric" class="ltr"')}${f('pro_members', 'حد الأعضاء', c.pro_members, 'inputmode="numeric" class="ltr"')}
      </div>
      <h3>عرض الإطلاق</h3>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <label class="f">الحالة<select id="launch_on"><option value="true" ${c.launch_on ? 'selected' : ''}>شغّال</option><option value="false" ${!c.launch_on ? 'selected' : ''}>موقوف</option></select></label>
        ${f('launch_max', 'أول جمعية مجاناً لحد كم عضو', c.launch_max, 'inputmode="numeric" class="ltr"')}
      </div>
      ${f('cliq', 'اسم أو رقم كليك لاستلام الرسوم', c.cliq, 'class="ltr"')}
      <div><button class="btn primary" id="savePricing">حفظ الأسعار</button></div>
    </div>
    <div class="card" style="display:flex;flex-direction:column;gap:12px;align-self:start">
      <h2>🙋 التواصل والدعم</h2>
      <p class="small muted" style="margin:0">بيظهروا للمستخدمين بـ «حسابي ← المساعدة والدعم»، وبشاشة «نسيت كلمة السر».</p>
      ${f('sup_wa', 'رقم واتساب الدعم', c.support_whatsapp ? phoneTxt(c.support_whatsapp) : '', 'inputmode="tel" class="ltr" placeholder="0791234567"')}
      ${f('sup_email', 'إيميل الدعم', c.support_email, 'type="email" class="ltr" placeholder="support@…"')}
      <div><button class="btn primary" id="saveSupport">حفظ</button></div>
    </div>
  </div>`;
}

/* ---------------- drawers ---------------- */
function openDrawer(html) { $('#drawer').innerHTML = html; $('#drawer').classList.add('open'); $('#drawerBg').classList.add('open'); bindDrawer(); }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawerBg').classList.remove('open'); }
function userDrawer(pid) {
  const { P, M, groupsOf, owned } = S.data;
  const p = P[pid]; if (!p) return;
  const m = M[pid] || {};
  const gs = groupsOf(pid), os = owned(p);
  const until = p.plan_until ? p.plan_until.slice(0, 10) : new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  openDrawer(`
    <div class="row between"><h2>${esc(p.name)}</h2><button class="btn sm" data-close>✕</button></div>
    <div class="row small" style="margin-top:6px">
      <span class="pill">${esc(p.code)}</span>
      ${p.deleted_at ? '<span class="pill">محذوف</span>' : p.suspended ? '<span class="pill due">موقوف</span>' : p.user_id ? '<span class="pill paid">مسجّل</span>' : '<span class="pill">ما سجّل لسا</span>'}
      ${p.is_admin ? '<span class="pill accent">إدارة</span>' : ''}
    </div>
    <div class="sec">
      <div class="small">📞 <span class="ltr">${esc(phoneTxt(p.phone))}</span> ${p.phone ? `· <a href="https://wa.me/${esc(p.phone)}" target="_blank" rel="noopener">واتساب ↗</a>` : ''}</div>
      <div class="small muted">انضاف ${dt(p.created_at)}${p.user_id ? ` · سجّل ${dt(m.signed_up)} · آخر دخول ${ago(m.last_sign_in)}` : ''}</div>
      ${p.user_id ? `<div class="small muted">${m.has_email ? '📧 حافظ إيميل استرجاع' : '⚠️ ما حفظ إيميل استرجاع'} · ${m.devices ? `🔔 ${m.devices} جهاز` : 'ما فعّل الإشعارات'}</div>` : ''}
    </div>
    <div class="sec"><h3>الجمعيات (${gs.length}${os.length ? ` · منظّم ${os.length}` : ''})</h3>
      ${[...new Map([...os, ...gs].map((g) => [g.id, g])).values()].map((g) => `<div class="row between small"><a href="#" data-group="${esc(g.id)}">${esc(g.name)}</a><span>${g.owner === p.user_id ? '<span class="pill accent">منظّم</span> ' : ''}<span class="pill ${STATUS[g.status][1]}">${STATUS[g.status][0]}</span></span></div>`).join('') || '<div class="muted small">ولا جمعية.</div>'}
    </div>
    ${!p.deleted_at ? `
    <div class="sec"><h3>⭐ الباقة</h3>
      <div class="small">${planActive(p) ? `${PLAN[p.plan]} لـ ${dt(p.plan_until)}` : 'بدون اشتراك'}</div>
      <div class="row"><select id="dPlan"><option value="">بدون</option><option value="basic" ${p.plan === 'basic' ? 'selected' : ''}>منظّم</option><option value="pro" ${p.plan === 'pro' ? 'selected' : ''}>منظّم برو</option></select>
      <input type="date" id="dUntil" value="${until}"><button class="btn sm primary" data-act="plan">حفظ</button></div>
    </div>
    <div class="sec"><h3>🎁 الرصيد</h3>
      <div class="row"><input id="dCredit" value="${p.credit}" inputmode="decimal" class="ltr" style="width:110px"><span class="small muted">د.أ</span><button class="btn sm primary" data-act="credit">حفظ</button></div>
    </div>
    ${p.user_id ? `
    <div class="sec"><h3>🔔 إشعار له</h3>
      <input id="dPushT" placeholder="العنوان (اختياري)"><textarea id="dPushB" rows="2" placeholder="النص"></textarea>
      <div><button class="btn sm primary" data-act="push">إرسال</button></div>
    </div>
    <div class="sec"><h3>🔑 كلمة سر مؤقتة</h3>
      <div class="small muted">لما ينسى كلمة السر وما عنده إيميل: اكتب كلمة سر مؤقتة وابعتهاله، وبعدين بيغيّرها من حسابه.</div>
      <div class="row"><input id="dPw" placeholder="6 أحرف أو أكثر" class="ltr" autocomplete="off"><button class="btn sm" data-act="pw">تعيين</button></div>
    </div>` : ''}
    <div class="sec"><h3>إجراءات</h3>
      <div class="row">
        ${!p.is_admin ? `<button class="btn sm ${p.suspended ? 'primary' : 'danger'}" data-act="suspend">${p.suspended ? 'إلغاء الإيقاف' : 'إيقاف الحساب'}</button>` : ''}
        ${!p.is_admin && !gs.length ? '<button class="btn sm danger" data-act="del">حذف الشخص</button>' : ''}
      </div>
      ${!p.is_admin && gs.length ? '<div class="tiny muted">ما بينحذف لأنه مشترك بجمعيات.</div>' : ''}
    </div>` : ''}
  `);
  $('#drawer').dataset.pid = pid;
}
function groupDrawer(gid) {
  const { G, P } = S.data;
  const g = G.find((x) => x.id === gid); if (!g) return;
  const regs = g.ids.filter((pid) => P[pid]?.user_id);
  const inv = (pid) => S.data.invites.find((i) => i.group_id === g.id && i.person_id === pid)?.status || 'accepted';
  openDrawer(`
    <div class="row between"><h2>${esc(g.name)}</h2><button class="btn sm" data-close>✕</button></div>
    <div class="row small" style="margin-top:6px"><span class="pill ${STATUS[g.status][1]}">${STATUS[g.status][0]}</span><span class="pill ltr">${esc(g.code)}</span><span class="pill">${esc(g.type)}</span></div>
    <div class="sec small">
      <div>المنظّم: <a href="#" data-user="${esc(g.owner_p?.id || '')}">${esc(g.owner_p?.name || '—')}</a></div>
      <div>السهم ${jd(g.amount)} · ${g.N} دور · مبلغ القبض ${jd(g.amount * g.N)} · الدفع يوم ${g.due_day}</div>
      <div>من ${monthLabel(g.start_month.slice(0, 7))} · انعملت ${dt(g.created_at)}${g.activated_at ? ` · انفعّلت ${dt(g.activated_at)}` : ''}</div>
      <div>استلم ${g.done} من ${g.N} · انجمع بالتطبيق ${jd(g.collected)}${g.fines ? ` · غرامات ${jd(g.fines)}` : ''}${Number(g.late_fee) ? ` · غرامة التأخير ${jd(g.late_fee)}` : ''}</div>
      ${g.cliq_alias || g.cliq_name ? `<div>كليك المنظّم: ${esc(g.cliq_name || '')} <span class="ltr">${esc(g.cliq_alias || '')}</span></div>` : ''}
    </div>
    <div class="sec"><h3>الأعضاء (${g.ids.length})</h3>
      ${g.ids.map((pid) => `<div class="row between small"><a href="#" data-user="${esc(pid)}">${esc(P[pid]?.name || 'عضو')}</a><span>${!P[pid]?.user_id ? '<span class="pill">ما سجّل</span> ' : ''}${inv(pid) === 'pending' ? '<span class="pill gold">ما وافق</span>' : inv(pid) === 'declined' ? '<span class="pill due">رفض</span>' : ''}</span></div>`).join('')}
    </div>
    <div class="sec"><h3>إجراءات</h3>
      <div class="row">
        <a class="btn sm" href="${APP_URL}?g=${esc(g.id)}" target="_blank" rel="noopener">افتح بالتطبيق ↗</a>
        ${!g.active ? '<button class="btn sm primary" data-gact="free">تفعيل مجاني</button>' : ''}
        <button class="btn sm danger" data-gact="del">حذف الجمعية</button>
      </div>
      ${regs.length ? `<div class="row"><select id="gOwner">${regs.map((pid) => `<option value="${esc(pid)}" ${P[pid]?.user_id === g.owner ? 'selected' : ''}>${esc(P[pid].name)}</option>`).join('')}</select><button class="btn sm" data-gact="owner">نقل التنظيم</button></div>` : ''}
    </div>
  `);
  $('#drawer').dataset.gid = gid;
}

/* ---------------- csv ---------------- */
function csv(name, head, rows) {
  const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const body = [head.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}

/* ---------------- events ---------------- */
async function showImage(path) {
  try {
    const { data, error } = await sb.storage.from('receipts').createSignedUrl(path, 3600);
    if (error) throw error;
    $('#lbImg').src = data.signedUrl; $('#lbOpen').href = data.signedUrl; $('#lightbox').classList.add('open');
  } catch { toast('ما قدرنا نفتح الصورة'); }
}
async function loadThumbs() {
  for (const img of document.querySelectorAll('img[data-img]')) {
    try { const { data } = await sb.storage.from('receipts').createSignedUrl(img.dataset.img, 3600); if (data) img.src = data.signedUrl; } catch {}
  }
}
function bindAfter() {
  document.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { S.view = b.dataset.view; S.q = ''; S.filter = 'all'; S.sort = { key: null, dir: 1 }; render(); window.scrollTo(0, 0); }));
  document.querySelectorAll('[data-goto-users]').forEach((b) => (b.onclick = () => { S.view = 'users'; S.filter = b.dataset.gotoUsers; S.q = ''; render(); }));
  document.querySelectorAll('[data-goto-groups]').forEach((b) => (b.onclick = () => { S.view = 'groups'; S.filter = b.dataset.gotoGroups; S.q = ''; render(); }));
  ['#refresh', '#refresh2'].forEach((id) => { const b = $(id); if (b) b.onclick = () => load().then(() => toast('تحدّثت البيانات')); });
  const lo = $('#logout'); if (lo) lo.onclick = async () => { await sb.auth.signOut(); location.reload(); };
  document.querySelectorAll('[data-filter]').forEach((b) => (b.onclick = () => { S.filter = b.dataset.filter; render(); }));
  document.querySelectorAll('[data-reqtab]').forEach((b) => (b.onclick = () => { S.reqTab = b.dataset.reqtab; render(); }));
  document.querySelectorAll('th[data-sort]').forEach((th) => (th.onclick = () => { const k = th.dataset.sort; S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : 1 }; render(); }));
  const q = $('#q');
  if (q) { q.oninput = () => { S.q = q.value; const pos = q.selectionStart; render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); }; }
  document.querySelectorAll('main [data-user]').forEach((el) => (el.onclick = (e) => { e.preventDefault(); userDrawer(el.dataset.user); }));
  document.querySelectorAll('main [data-group]').forEach((el) => (el.onclick = (e) => { e.preventDefault(); groupDrawer(el.dataset.group); }));
  document.querySelectorAll('img[data-img]').forEach((el) => (el.onclick = () => showImage(el.dataset.img)));
  loadThumbs();
  document.querySelectorAll('[data-approve]').forEach((b) => (b.onclick = () => {
    if (!confirmTwice(b, 'تأكيد القبول؟')) return;
    const [k, id] = b.dataset.approve.split(':');
    act(() => (k === 'act' ? rpc('review_activation', { gid: id, p_approve: true, p_note: null }) : rpc('review_plan', { rid: id, p_approve: true, p_note: null })), k === 'act' ? 'انفعّلت الجمعية ✓' : 'انفعّل الاشتراك ✓');
  }));
  document.querySelectorAll('[data-reject]').forEach((b) => (b.onclick = () => {
    const [k, id] = b.dataset.reject.split(':');
    const note = document.querySelector(`[data-note="${k}:${id}"]`)?.value.trim();
    if (!note) return toast('اكتب سبب الرفض عشان يعرف شو يصلّح');
    if (!confirmTwice(b, 'تأكيد الرفض؟')) return;
    act(() => (k === 'act' ? rpc('review_activation', { gid: id, p_approve: false, p_note: note }) : rpc('review_plan', { rid: id, p_approve: false, p_note: note })), 'انرفض الطلب ووصله السبب');
  }));
  const cu = $('#csvUsers'); if (cu) cu.onclick = () => csv('users', ['الاسم', 'رقم العضوية', 'الرقم', 'مسجّل', 'آخر دخول', 'جمعيات', 'منظّم', 'الباقة', 'لـ', 'الرصيد', 'موقوف', 'انضاف'],
    userRows().map((r) => [r.name, r.code, r.phone, r.user_id ? 'نعم' : 'لا', r.m?.last_sign_in || '', r.gs, r.os, planActive(r) ? PLAN[r.plan] : '', r.plan_until || '', r.credit, r.suspended ? 'نعم' : '', r.created_at]));
  const cg = $('#csvGroups'); if (cg) cg.onclick = () => csv('groups', ['الجمعية', 'الكود', 'النوع', 'المنظّم', 'الحالة', 'الأعضاء', 'السهم', 'الأدوار', 'استلموا', 'انجمع', 'التفعيل', 'انعملت'],
    groupRows().map((g) => [g.name, g.code, g.type, g.owner_p?.name || '', STATUS[g.status][0], g.ids.length, g.amount, g.N, g.done, g.collected, g.act_via || '', g.created_at]));
  const ci = $('#csvIncome'); if (ci) ci.onclick = () => csv('income', ['التاريخ', 'النوع', 'التفاصيل', 'من', 'المبلغ', 'خصم', 'مرجع'], incomeRows().map((r) => [r.at, r.kind, r.what, r.who, r.fee, r.credit, r.ref || '']));
  const pa = $('#pushAll'); if (pa) pa.onclick = () => {
    const body = $('#pushBody').value.trim(); if (!body) return toast('اكتب نص الإشعار');
    if (!confirmTwice(pa, `إرسال لـ ${S.data.ov.devices} جهاز؟`)) return;
    act(() => rpc('admin_push', { pid: null, p_title: $('#pushTitle').value.trim(), p_body: body })).then((n) => { if (n !== false) { toast(`انبعت الإشعار (${n} جهاز)`); } });
  };
  const as = $('#annSave'); if (as) as.onclick = () => { const t = $('#annText').value.trim(); if (!t) return toast('اكتب نص الإعلان'); act(() => rpc('admin_announce', { p_text: t }), 'انتشر الإعلان'); };
  const ad = $('#annDel'); if (ad) ad.onclick = () => { if (confirmTwice(ad)) act(() => rpc('admin_announce', { p_text: '' }), 'انحذف الإعلان'); };
  const sp = $('#savePricing'); if (sp) sp.onclick = () => {
    const keys = ['per_member', 'ref_credit', 'basic_price', 'basic_groups', 'basic_members', 'pro_price', 'pro_groups', 'pro_members', 'launch_max'];
    const p = {};
    for (const k of keys) { const v = $('#' + k).value.trim(); const n = Number(v); if (v === '' || !(n >= 0)) return toast('اكتب أرقام صحيحة'); p[k] = n; }
    p.launch_on = $('#launch_on').value === 'true'; p.cliq = $('#cliq').value.trim();
    act(() => rpc('admin_set_pricing', { p }), 'انحفظت الأسعار');
  };
  const ss = $('#saveSupport'); if (ss) ss.onclick = () => {
    const w = $('#sup_wa').value.trim();
    act(() => rpc('admin_set_support', { p_whatsapp: w ? normPhone(w) : '', p_email: $('#sup_email').value.trim() }), 'انحفظت معلومات الدعم');
  };
}
function bindDrawer() {
  const d = $('#drawer');
  d.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeDrawer));
  d.querySelectorAll('[data-user]').forEach((el) => (el.onclick = (e) => { e.preventDefault(); if (el.dataset.user) userDrawer(el.dataset.user); }));
  d.querySelectorAll('[data-group]').forEach((el) => (el.onclick = (e) => { e.preventDefault(); groupDrawer(el.dataset.group); }));
  const reopenU = async () => { if (d.dataset.pid) userDrawer(d.dataset.pid); };
  const reopenG = async () => { if (d.dataset.gid) groupDrawer(d.dataset.gid); };
  d.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
    const pid = d.dataset.pid, p = S.data.P[pid];
    const k = b.dataset.act;
    if (k === 'plan') { const pl = $('#dPlan').value || null; const u = $('#dUntil').value; if (pl && !u) return toast('اختار تاريخ الانتهاء'); if (await act(() => rpc('admin_set_plan', { pid, p_plan: pl, p_until: pl ? new Date(u + 'T23:59:00').toISOString() : null }), 'انحفظت الباقة')) reopenU(); }
    if (k === 'credit') { const n = Number($('#dCredit').value); if (!(n >= 0)) return toast('رقم مش صحيح'); if (await act(() => rpc('admin_set_credit', { pid, p_credit: n }), 'انحفظ الرصيد')) reopenU(); }
    if (k === 'push') { const body = $('#dPushB').value.trim(); if (!body) return toast('اكتب النص'); const n = await act(() => rpc('admin_push', { pid, p_title: $('#dPushT').value.trim(), p_body: body })); if (n !== false) toast(n ? 'انبعت الإشعار ✓' : 'ما عنده إشعارات مفعّلة'); }
    if (k === 'pw') { const pw = $('#dPw').value; if (pw.length < 6) return toast('6 أحرف أو أكثر'); if (!confirmTwice(b)) return; if (await act(() => rpc('admin_reset_password', { pid, p_new: pw }), 'تعيّنت كلمة السر المؤقتة')) $('#dPw').value = ''; }
    if (k === 'suspend') { if (!confirmTwice(b)) return; if (await act(() => rpc('admin_suspend', { pid, p_on: !p.suspended }), p.suspended ? 'انلغى الإيقاف' : 'انوقف الحساب')) reopenU(); }
    if (k === 'del') { if (!confirmTwice(b)) return; if (await act(() => rpc('admin_delete_person', { pid }), 'انحذف')) closeDrawer(); }
  }));
  d.querySelectorAll('[data-gact]').forEach((b) => (b.onclick = async () => {
    const gid = d.dataset.gid, k = b.dataset.gact;
    if (k === 'free') { if (!confirmTwice(b)) return; if (await act(() => rpc('admin_activate_free', { gid }), 'انفعّلت الجمعية')) reopenG(); }
    if (k === 'owner') { const pid = $('#gOwner').value; if (!confirmTwice(b)) return; if (await act(() => rpc('admin_set_owner', { gid, pid }), 'انتقل التنظيم')) reopenG(); }
    if (k === 'del') {
      if (!confirmTwice(b, 'متأكد؟ بتنحذف بكل دفعاتها')) return;
      if (await act(async () => { const { data, error } = await sb.from('groups').delete().eq('id', gid).select('id'); if (error) throw error; if (!data?.length) throw new Error('ما انحذفت'); }, 'انحذفت الجمعية')) closeDrawer();
    }
  }));
}
$('#drawerBg').onclick = closeDrawer;
$('#lbClose').onclick = () => $('#lightbox').classList.remove('open');
$('#lightbox').onclick = (e) => { if (e.target.id === 'lightbox') $('#lightbox').classList.remove('open'); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); $('#lightbox').classList.remove('open'); } });

/* ---------------- login ---------------- */
function loginView(msg) {
  $('#app').innerHTML = `
  <div class="login card">
    <div class="brand"><div class="mark">ج</div><div><div class="display">جمعية</div><div class="tiny muted">لوحة الإدارة</div></div></div>
    ${msg ? `<div class="pill due" style="white-space:normal">${esc(msg)}</div>` : ''}
    <label class="f">رقم التلفون<input id="lp" inputmode="tel" class="ltr" placeholder="0791234567" autocomplete="username"></label>
    <label class="f">كلمة السر<input id="lw" type="password" class="ltr" autocomplete="current-password"></label>
    <button class="btn primary" id="lgo">دخول</button>
    <a class="small" href="${APP_URL}">↩︎ رجوع للتطبيق</a>
  </div>`;
  const go = async () => {
    const phone = normPhone($('#lp').value), pw = $('#lw').value;
    if (phone.length < 9 || !pw) return toast('اكتب الرقم وكلمة السر');
    $('#lgo').disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: `${phone}@jamiya.app`, password: pw });
    $('#lgo').disabled = false;
    if (error) return toast(errMsg(error));
    start();
  };
  $('#lgo').onclick = go;
  $('#lw').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return loginView();
  const { data: me } = await sb.from('persons').select('id,name,code,is_admin').eq('user_id', session.user.id).maybeSingle();
  if (!me?.is_admin) { $('#app').innerHTML = `<div class="login card"><h2>هالصفحة لحساب الإدارة بس</h2><a class="btn primary" href="${APP_URL}">↩︎ رجوع للتطبيق</a></div>`; return; }
  S.me = me;
  try { await load(); }
  catch (e) { $('#app').innerHTML = `<div class="login card"><h2>ما قدرنا نحمّل البيانات</h2><div class="small muted">${esc(errMsg(e))}</div><button class="btn primary" onclick="location.reload()">جرّب مرة ثانية</button></div>`; }
  // live: refresh when requests or groups change
  let t; const soon = () => { clearTimeout(t); t = setTimeout(() => load().catch(() => {}), 800); };
  const ch = sb.channel('admin-live');
  ['activations', 'plan_requests', 'groups', 'persons', 'payments', 'deliveries', 'invites'].forEach((table) => ch.on('postgres_changes', { event: '*', schema: 'public', table }, soon));
  ch.subscribe();
  setInterval(() => { if (document.visibilityState === 'visible') load().catch(() => {}); }, 120000);
}
start();
