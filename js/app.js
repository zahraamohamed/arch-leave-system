import { initStore, store, getState, subscribe } from "./store.js?v=202611191135";
import { COLLEGE } from "./config.js?v=202611191135";
import { CATEGORIES, STATUS, PAY, ROLES, countDays, requestDays, payPlan, payText, round2, academicYear, paidInAcademicYear, serviceEntitlement, pausedDays, periodDays } from "./rules.js?v=202611191135";
import { exportAll, exportEmployee, exportRequests, importTemplate, readImport } from "./excel.js?v=202611191135";
import { initDatePickers, setDateMin, setDateValue } from "./datepicker.js?v=202611191135";
import { initNotifications, enableNotifications, notify, permission } from "./notify.js?v=202611191135";

const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => String(round2(n));
const days = (n) => `${num(n)} يوم`;
const fmtDate = (iso) => iso ? new Date(iso.length <= 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-GB") : "—";
const fmtDT = (iso) => iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—";
const today = () => new Date().toISOString().slice(0, 10);
const S = () => getState();
const R = () => S().settings.rules;
const uni = () => S().settings.university || COLLEGE.university;
const role = () => S().user?.role;
const isSuper = () => role() === "superadmin";
const isAdmin = () => role() === "admin" || role() === "superadmin";   // يقدم ويحذف ويسحب
const isAssistant = () => role() === "assistant";
const typeOf = (key) => R().types.find((t) => t.key === key);
const empById = (id) => S().employees.find((e) => e.id === id);
const visibleRequests = () => S().requests.filter((r) => !r.deleted);
const leaves = () => visibleRequests().filter((r) => r.kind !== "withdrawal");
const pendingWithdrawal = (id) => S().requests.find((x) => x.kind === "withdrawal" && x.originalId === id && x.status === "pending");
const ruleText = (cat) => {
  const c = R().categories[cat]; if (!c) return "";
  return cat === "staff"
    ? `${num(c.amount)} أيام شهرياً، وتتراكم بدون حد`
    : `${num(c.amount)} يوم لكل سنة دراسية، وبحد أقصى ${c.maxPaidPerYear} يوم براتب بالسنة`;
};
const yearPaid = (e) => paidInAcademicYear(S().requests, e.id, academicYear(today(), R().academicYearStartMonth), R().academicYearStartMonth);

const newCalcRow = (type = "ordinary") => ({ type, from: "", to: "", days: "", hours: "", note: "", mode: "pause" });
const PAUSE_HINT = "ما تنخصم من الرصيد، بس أيامها ما ينضاف عنها استحقاق. إذا قطعها، اكتب تاريخ رجوعه كتاريخ نهاية.";
const CALC_TYPES = {
  ordinary:  { name: "اعتيادية",                 input: "days",   effect: "deduct",  hint: "تنخصم من الرصيد الاعتيادي." },
  hourly:    { name: "زمنية (ساعات)",            input: "hours",  effect: "deduct",  hint: "تنخصم من الرصيد الاعتيادي — كل 7 ساعات = يوم." },
  sick:      { name: "مرضية",                    input: "days",   effect: "sick",    hint: "تنخصم من الرصيد المرضي." },
  delivery:  { name: "حمل ووضع",                 input: "period", effect: "pause",   hint: PAUSE_HINT },
  maternity: { name: "أمومة (رعاية طفل)",        input: "period", effect: "pause",   hint: PAUSE_HINT },
  unpaid:    { name: "بدون راتب",                input: "period", effect: "pause",   hint: PAUSE_HINT },
  long:      { name: "إجازة طويلة (دراسية / أخرى)", input: "period", effect: "pause", hint: PAUSE_HINT },
  absence:   { name: "غياب",                     input: "absence", effect: "absence", hint: "اختر شلون ينحسب: يوقف الاستحقاق، أو ينخصم من الرصيد الاعتيادي." }
};
const ui = { calc: { empId: "", category: "staff", start: "", asOf: "", name: "", title: "", department: "", empNo: "", saved: [], rows: [newCalcRow()] }, empFilter: "all", empSearch: "", reqFilter: { status: "all", cat: "all", kind: "all", q: "" }, newReq: {}, formsQ: "" };

/* ------------------------------ shell ------------------------------ */
function logoHTML(size = 44, full = false) {
  const src = S().settings.logo || (full ? "assets/logo-full.png" : "assets/logo.png");
  return `<span class="logo" style="--s:${size}px"><img src="${esc(src)}" alt="شعار الكلية" onerror="this.remove()"><span class="logo-fallback">ك.ع</span></span>`;
}

function shell(content, active) {
  const pend = visibleRequests().filter((r) => r.status === "pending").length;
  const nav = [
    ["dashboard", "الرئيسية", "layout-dashboard"],
    ["inbox", isAssistant() ? "الطلبات الواردة" : "قيد الانتظار", "inbox", pend],
    isAdmin() && ["new", "طلب إجازة", "file-plus-2"],
    ["employees", "المنتسبون", "users"],
    ["forms", "الاستمارات", "file-badge"],
    ["requests", "سجل الطلبات", "history"],
    isSuper() && ["calc", "حاسبة الرصيد", "calculator"],
    isSuper() && ["settings", "الإعدادات", "settings"]
  ].filter(Boolean);
  const u = S().user;
  const sync = !S().online ? ["offline", "غير متصل — يُحفظ ويُرفع تلقائياً"] : S().synced ? ["ok", "متزامن"] : ["busy", "مزامنة…"];
  const p = permission();
  return `
  <header class="top">
    <div class="brand">${logoHTML(42)}<div><div class="brand-t">${esc(COLLEGE.name)}</div><div class="brand-s">${esc(uni())} · ${COLLEGE.system}</div></div></div>
    <div class="top-end">
      ${p === "default" || p === "denied" ? `<button class="btn sm bell ${p}" data-act="enable-notify"><i data-lucide="bell-ring"></i><span>${p === "denied" ? "الإشعارات محظورة" : "فعّل الإشعارات"}</span></button>` : ""}
      <span class="sync ${sync[0]}" title="${sync[1]}"><i></i><span>${sync[1]}</span></span>
      <button class="me" data-act="account" title="حسابي"><span class="me-n">${esc(u.name)}</span><span class="me-r">${ROLES[u.role]}</span></button>
      <button class="icon-btn" data-act="logout" title="خروج"><i data-lucide="log-out"></i></button>
    </div>
  </header>
  <div class="layout">
    <nav class="side">${nav.map(([k, t, ic, b]) => `<a href="#/${k}" class="${active === k ? "on" : ""}"><i data-lucide="${ic}"></i><span>${t}</span>${b ? `<b class="badge">${b}</b>` : ""}</a>`).join("")}</nav>
    <main class="main">${content}</main>
  </div>`;
}

const pageHead = (title, sub, actions = "") => `<div class="page-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>${actions ? `<div class="actions">${actions}</div>` : ""}</div>`;
const tag = (cat) => `<span class="tag ${cat}">${CATEGORIES[cat]}</span>`;
const st = (r) => `<span class="st st-${r.status}">${r.kind === "withdrawal" && r.status === "pending" ? "طلب سحب — بانتظار المعاون" : STATUS[r.status]}</span>`;
const payChip = (r) => r.pay && r.pay !== "none" ? `<span class="pay-chip pay-${r.pay}">${PAY[r.pay]}</span>` : "—";

/* ------------------------------ login ------------------------------ */
function loginView() {
  app.innerHTML = `
  <div class="login">
    <form class="login-card" id="loginForm" autocomplete="on">
      <div class="login-head">${logoHTML(150, true)}<h1>${COLLEGE.system}</h1><p>${esc(uni())}</p></div>
      <label>اسم المستخدم<input name="username" required autocomplete="username" dir="ltr" autocapitalize="none"></label>
      <label>كلمة المرور<input name="password" type="password" required autocomplete="current-password" dir="ltr"></label>
      <div class="err" id="loginErr">${esc(S().loginError || "")}</div>
      <button class="btn primary block" type="submit">تسجيل الدخول</button>
    </form>
  </div>`;
  $("#loginForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target));
    const btn = ev.target.querySelector("button"); btn.disabled = true; btn.textContent = "جارٍ الدخول…";
    try { await store.login(f.username, f.password); location.hash = "#/"; }
    catch (e) {
      $("#loginErr").textContent = /invalid|wrong|user-not-found|credential/.test(e.code || "") ? "اسم المستخدم أو كلمة المرور غير صحيحة" : (e.message || "تعذر الدخول");
      btn.disabled = false; btn.textContent = "تسجيل الدخول";
    }
  };
}

/* ---------------------------- dashboard ---------------------------- */
function dashboard() {
  const emps = S().employees.filter((e) => e.active !== false);
  const teach = emps.filter((e) => e.category === "teaching"), staff = emps.filter((e) => e.category === "staff");
  const pending = visibleRequests().filter((r) => r.status === "pending");
  const approved = leaves().filter((r) => r.status === "approved");
  const ym = today().slice(0, 7), t = today();
  const monthDays = approved.filter((r) => (r.startDate || "").slice(0, 7) === ym).reduce((a, r) => a + (r.total || 0), 0);
  const onLeave = approved.filter((r) => r.startDate <= t && (r.endDate || r.startDate) >= t);
  const low = emps.filter((e) => (e.balance || 0) < 3).sort((a, b) => a.balance - b.balance);
  const recent = visibleRequests().filter((r) => r.status !== "pending" && r.decidedAt).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)).slice(0, 5);

  return shell(`
    ${pageHead("الرئيسية", `${uni()} — ${COLLEGE.name}`,
      `${isAdmin() ? `<a class="btn primary" href="#/new"><i data-lucide="file-plus-2"></i>طلب إجازة</a>` : ""}<button class="btn" data-act="export-all"><i data-lucide="file-spreadsheet"></i>Excel</button>`)}
    <section class="kpis">
      <div class="kpi"><span>المنتسبون</span><strong>${emps.length}</strong><em>${teach.length} تدريسي · ${staff.length} موظف</em></div>
      <a class="kpi ${pending.length ? "warn" : ""}" href="#/inbox"><span>بانتظار المعاون الإداري</span><strong>${pending.length}</strong><em>طلب</em></a>
      <div class="kpi"><span>إجازات هذا الشهر</span><strong>${num(monthDays)}</strong><em>يوم موافق عليه</em></div>
      <div class="kpi"><span>في إجازة اليوم</span><strong>${onLeave.length}</strong><em>${fmtDate(t)}</em></div>
    </section>
    <section class="grid-2">
      <div class="card">
        <div class="card-h"><h3>أرصدة المنتسبين</h3>${segFilter()}</div>
        <div class="search"><i data-lucide="search"></i><input id="empSearch" placeholder="ابحث بالاسم أو القسم أو الرقم الوظيفي" value="${esc(ui.empSearch)}"></div>
        <div id="empTable">${employeeTable()}</div>
      </div>
      <div class="stack">
        <div class="card"><div class="card-h"><h3>في إجازة اليوم</h3></div>
          ${onLeave.length ? `<ul class="list">${onLeave.map((r) => `<li><a href="#/employee/${r.employeeId}">${esc(r.employeeName)}</a><span>${esc(r.typeName)} · لغاية ${fmtDate(r.endDate)}</span></li>`).join("")}</ul>` : `<p class="empty">لا يوجد أحد في إجازة اليوم.</p>`}</div>
        <div class="card"><div class="card-h"><h3>آخر القرارات</h3><a class="muted small" href="#/requests">الكل</a></div>
          ${recent.length ? `<ul class="list">${recent.map((r) => `<li><a href="#/form/${r.id}">${esc(r.employeeName)}</a><span>${r.kind === "withdrawal" ? "سحب · " : ""}${st(r)}</span></li>`).join("")}</ul>` : `<p class="empty">لا توجد قرارات بعد.</p>`}</div>
        <div class="card"><div class="card-h"><h3>رصيد منخفض</h3><span class="muted small">أقل من 3 أيام</span></div>
          ${low.length ? `<ul class="list">${low.slice(0, 8).map((e) => `<li><a href="#/employee/${e.id}">${esc(e.name)}</a><span class="${e.balance <= 0 ? "neg" : ""}">${days(e.balance)}</span></li>`).join("")}</ul>` : `<p class="empty">كل الأرصدة جيدة.</p>`}</div>
      </div>
    </section>`, "dashboard");
}

const segFilter = () => `<div class="seg" data-seg="empFilter">${[["all", "الكل"], ["teaching", "التدريسيون"], ["staff", "الموظفون"]].map(([k, l]) => `<button class="${ui.empFilter === k ? "on" : ""}" data-v="${k}">${l}</button>`).join("")}</div>`;

function empLeavesCell(e) {
  const sum = leaveSummary(e);
  if (!sum.length) return `<span class="muted">—</span>`;
  const total = sum.reduce((a, g) => a + g.count, 0);
  return `<span class="leaves-cell" title="${esc(sum.map((g) => `${g.name}: ${summaryText(g)}`).join("\n"))}"><b>${total}</b> إجازة<span class="sub">${esc(sum.slice(0, 3).map((g) => `${g.name} ${g.count}`).join(" · "))}${sum.length > 3 ? " …" : ""}</span></span>`;
}

function filteredEmployees() {
  const q = ui.empSearch.trim();
  return S().employees.filter((e) => e.active !== false)
    .filter((e) => ui.empFilter === "all" || e.category === ui.empFilter)
    .filter((e) => !q || [e.name, e.department, e.empNo, e.title].some((v) => (v || "").includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

function employeeTable() {
  const list = filteredEmployees();
  if (!list.length) return `<p class="empty">${S().employees.length ? "لا توجد نتائج مطابقة." : "لم تتم إضافة منتسبين بعد."}</p>`;
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>الاسم</th><th>الصنف</th><th class="hide-m">القسم / الشعبة</th><th class="n">الاعتيادي</th><th class="n hide-m">المرضي</th><th class="hide-m">الإجازات</th>${isAdmin() ? "<th></th>" : ""}</tr></thead>
    <tbody>${list.map((e) => `
      <tr data-go="#/employee/${e.id}">
        <td><b>${esc(e.name)}</b>${e.title ? `<div class="sub">${esc(e.title)}</div>` : ""}</td>
        <td>${tag(e.category)}</td>
        <td class="hide-m">${esc(e.department) || "—"}</td>
        <td class="n"><span class="bal ${e.balance <= 0 ? "neg" : e.balance < 3 ? "low" : ""}">${num(e.balance)}</span> <small>يوم</small>${e.category === "teaching" ? `<div class="sub">براتب هالسنة ${num(yearPaid(e))}/${R().categories.teaching.maxPaidPerYear}</div>` : ""}</td>
        <td class="n hide-m">${num(e.sick || 0)}</td>
        <td class="hide-m">${empLeavesCell(e)}</td>
        ${isAdmin() ? `<td class="act"><a class="btn sm" href="#/new?emp=${e.id}">طلب</a></td>` : ""}
      </tr>`).join("")}</tbody></table></div>`;
}

/* ---------------------------- employees ---------------------------- */
function employeesView() {
  const archived = S().employees.filter((e) => e.active === false);
  return shell(`
    ${pageHead("المنتسبون", `${S().employees.filter((e) => e.active !== false).length} منتسب`,
      `${isSuper() ? `<button class="btn primary" data-act="add-emp"><i data-lucide="user-plus"></i>إضافة منتسب</button><button class="btn" data-act="import"><i data-lucide="upload"></i>استيراد Excel</button>` : ""}<button class="btn" data-act="export-all"><i data-lucide="file-spreadsheet"></i>Excel</button>`)}
    <div class="card">
      <div class="card-h">${segFilter()}</div>
      <div class="search"><i data-lucide="search"></i><input id="empSearch" placeholder="ابحث بالاسم أو القسم أو الرقم الوظيفي" value="${esc(ui.empSearch)}"></div>
      <div id="empTable">${employeeTable()}</div>
    </div>
    ${archived.length ? `<div class="card archived"><div class="card-h"><h3>المؤرشفون</h3><span class="muted small">${archived.length} — لا يظهرون بالقوائم ولا ينضافلهم استحقاق</span></div>
      <ul class="list">${archived.map((e) => `<li><a href="#/employee/${e.id}">${esc(e.name)}</a><span>${CATEGORIES[e.category]}${isSuper() ? ` <button class="btn sm" data-act="archive" data-id="${e.id}" data-v="1">إعادة تفعيل</button>` : ""}</span></li>`).join("")}</ul></div>` : ""}`, "employees");
}

function employeeView(id) {
  const e = empById(id);
  if (!e) return shell(`<p class="empty">المنتسب غير موجود.</p>`, "employees");
  const reqs = visibleRequests().filter((r) => r.employeeId === id);
  const isT = e.category === "teaching";
  const yp = yearPaid(e), cap = R().categories.teaching.maxPaidPerYear;
  return shell(`
    <div class="page-head"><div><a class="back" href="#/employees">→ المنتسبون</a><h2>${esc(e.name)}</h2>
      <p>${tag(e.category)} ${esc([e.title, e.department, e.empNo && "رقم " + e.empNo, startDateOf(e) && "مباشرة " + fmtDate(startDateOf(e))].filter(Boolean).join(" · "))}${e.active === false ? ` <span class="tag off">مؤرشف</span>` : ""}</p></div>
      <div class="actions">
        ${isAdmin() ? `<a class="btn primary" href="#/new?emp=${e.id}"><i data-lucide="file-plus-2"></i>طلب إجازة</a>
        ${isSuper() ? `<a class="btn" href="#/calc?emp=${e.id}"><i data-lucide="calculator"></i>تعديل الرصيد بالحاسبة</a>` : ""}
        <button class="btn ${isSuper() ? "ghost" : ""}" data-act="adjust" data-id="${e.id}"><i data-lucide="plus-minus"></i>${isSuper() ? "تعديل يدوي" : "تعديل الرصيد"}</button>
        <button class="btn" data-act="edit-emp" data-id="${e.id}"><i data-lucide="pencil"></i>تعديل بيانات المنتسب</button>` : ""}
        <a class="btn" href="#/statement/${e.id}"><i data-lucide="printer"></i>طباعة كشف الإجازات</a>
        <button class="btn" data-act="export-emp" data-id="${e.id}"><i data-lucide="file-spreadsheet"></i>Excel</button>
      </div></div>
    <section class="kpis">
      <div class="kpi big"><span>الرصيد الاعتيادي</span><strong class="${e.balance <= 0 ? "neg" : ""}">${num(e.balance)}</strong><em>يوم — ${ruleText(e.category)}</em></div>
      <div class="kpi"><span>الرصيد المرضي</span><strong>${num(e.sick || 0)}</strong><em>يوم براتب تام</em></div>
      ${isT ? `<div class="kpi ${yp >= cap ? "warn" : ""}"><span>براتب في السنة الدراسية ${academicYear(today(), R().academicYearStartMonth)}</span><strong>${num(yp)}<small> / ${cap}</small></strong><em>المتبقي ${num(Math.max(0, cap - yp))} يوم</em></div>`
            : `<div class="kpi"><span>آخر استحقاق</span><strong class="sm">${esc(e.accruedThrough || "—")}</strong><em>شهر</em></div>`}
      <div class="kpi"><span>عدد الطلبات</span><strong>${reqs.filter((r) => r.kind !== "withdrawal").length}</strong><em>طلب</em></div>
    </section>
    ${summaryCard(e)}
    ${calcDetailsCard(e)}
    <section class="grid-2 even">
      <div class="card"><div class="card-h"><h3>الإجازات</h3></div>${requestsTable(reqs, true)}</div>
      <div class="card"><div class="card-h"><h3>حركة الرصيد</h3></div><div id="ledgerBox"><p class="empty">جارٍ التحميل…</p></div></div>
    </section>
    ${isSuper() ? `<div class="danger-zone"><button class="btn ghost sm" data-act="archive" data-id="${e.id}" data-v="${e.active === false ? 1 : 0}"><i data-lucide="archive"></i>${e.active === false ? "إعادة تفعيل المنتسب" : "أرشفة المنتسب (نقل / تقاعد)"}</button><button class="btn ghost sm danger-txt" data-act="delete-emp" data-id="${e.id}"><i data-lucide="user-x"></i>حذف المنتسب</button></div>` : ""}`, "employees");
}

// تفاصيل الإجازات المدخلة بحاسبة الرصيد
function calcDetailsCard(e) {
  const cd = e.calc;
  if (!cd || !(cd.rows || []).length) {
    return isSuper() ? `<div class="card calc-details empty-cd"><div class="card-h"><h3>تفاصيل الإجازات السابقة</h3><a class="btn sm" href="#/calc?emp=${e.id}"><i data-lucide="calculator"></i>احسب رصيده بالحاسبة</a></div><p class="muted small">ما انحفظت تفاصيل إجازات سابقة لهذا المنتسب بعد${startDateOf(e) ? ` (تاريخ مباشرته ${fmtDate(startDateOf(e))} جاهز بالحاسبة)` : ""}. افتح الحاسبة، اكتب إجازاته، واضغط "اعتماد" أو "حفظ الإجازات فقط".</p></div>` : "";
  }
  const hpd = R().hoursPerDay;
  const eff = (r) => {
    const t = CALC_TYPES[r.type] || CALC_TYPES.ordinary;
    if (t.input === "period") return `${periodDays(r.from, r.to)} يوم — توقف الاستحقاق`;
    if (t.input === "hours") return `${num(r.hours)} ساعة = ${num(round2((Number(r.hours) || 0) / hpd))} يوم — من الاعتيادي`;
    if (t.input === "absence") return `${num(r.days)} يوم — ${r.mode === "deduct" ? "مخصوم من الرصيد" : "توقف الاستحقاق"}`;
    return `${num(r.days)} يوم — ${t.effect === "sick" ? "من المرضي" : "من الاعتيادي"}`;
  };
  const res = cd.result || {};
  return `<div class="card calc-details">
    <div class="card-h"><h3>تفاصيل الإجازات السابقة</h3>
      <span class="actions"><span class="muted small">مباشرة ${fmtDate(cd.start)} · محسوبة لغاية ${fmtDate(cd.asOf)} · ${esc(cd.savedByName || "")}</span>${isSuper() ? `<a class="btn sm" href="#/calc?emp=${e.id}"><i data-lucide="pencil"></i>تعديل / إضافة إجازة</a>` : ""}</span></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>النوع</th><th>التاريخ</th><th>المدة والأثر</th><th>ملاحظة</th></tr></thead>
      <tbody>${cd.rows.map((r) => `<tr class="cd-${(CALC_TYPES[r.type] || {}).effect}">
        <td><b>${esc((CALC_TYPES[r.type] || {}).name || r.type)}</b></td>
        <td>${r.from ? fmtDate(r.from) : "—"}${r.to ? " ← " + fmtDate(r.to) : ""}</td>
        <td>${eff(r)}</td>
        <td class="sub">${esc(r.note) || "—"}</td></tr>`).join("")}</tbody>
    </table></div>
    <div class="cd-sum"><span>المستحق <b>${days(res.ordinary || 0)}</b></span><span>المأخوذ <b>${days(res.taken || 0)}</b></span>${res.paused ? `<span>أيام موقوفة <b>${res.paused}</b></span>` : ""}<span>الرصيد عند الاعتماد <b>${days(res.balance || 0)}</b></span><span>المرضي <b>${days(res.sickLeft || 0)}</b></span></div>
  </div>`;
}

async function fillLedger(id) {
  if (!$("#ledgerBox")) return;
  const led = await store.loadLedger(id);
  const box = $("#ledgerBox"); if (!box) return;
  box.innerHTML = led.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>البيان</th><th class="n">التغيير</th><th class="n">بعدها</th></tr></thead><tbody>
    ${led.map((l) => `<tr><td>${fmtDT(l.at)}</td><td>${esc(l.reason)} <span class="tag xs ${l.field === "sick" ? "off" : "staff"}">${l.field === "sick" ? "مرضي" : "اعتيادي"}</span><div class="sub">${esc(l.byName || "")}</div></td><td class="n ${l.delta < 0 ? "neg" : "pos"}">${l.delta > 0 ? "+" : ""}${num(l.delta)}</td><td class="n">${num(l.after)}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="empty">لا توجد حركات.</p>`;
}

/* ---------------------------- new request ---------------------------- */
function newRequestView(params) {
  if (params.get("emp") && ui.newReq.employeeId !== params.get("emp")) ui.newReq = { employeeId: params.get("emp") };
  return shell(`
    ${pageHead("طلب إجازة جديد", "يُرسل الطلب مباشرة إلى المعاون الإداري، ويوصله إشعار.")}
    <div class="grid-2 req-grid">
      <form class="card form" id="reqForm">
        <div class="step"><span>1</span>المنتسب</div>
        <div class="combo"><input id="empPick" placeholder="اكتب اسم التدريسي أو الموظف…" autocomplete="off" value="${esc(empById(ui.newReq.employeeId)?.name || "")}"><div class="combo-list" id="empList"></div></div>
        <div id="reqBody">${reqBody()}</div>
      </form>
      <aside class="card summary" id="reqSummary">${reqSummary()}</aside>
    </div>`, "new");
}

function reqBody() {
  const nr = ui.newReq, e = empById(nr.employeeId);
  if (!e) return `<p class="empty">اختر المنتسب حتى يظهر رصيده.</p>`;
  const types = R().types.filter((t) => t.for.includes(e.category));
  if (!types.find((t) => t.key === nr.type)) nr.type = types[0]?.key;
  const t = typeOf(nr.type);
  return `
    <div class="step"><span>2</span>نوع الإجازة</div>
    <div class="types">${types.map((x) => `<label class="type ${x.key === nr.type ? "on" : ""}"><input type="radio" name="type" value="${x.key}" ${x.key === nr.type ? "checked" : ""}>${x.name}</label>`).join("")}</div>
    <div class="step"><span>3</span>المدة</div>
    ${t.unit === "hour" ? `
      <div class="row"><label>التاريخ<input type="date" name="startDate" value="${nr.startDate || today()}" required></label>
      <label>عدد الساعات<input type="number" name="hours" min="0.5" step="0.5" value="${nr.hours || ""}" required></label></div>` : `
      <div class="row"><label>من<input type="date" name="startDate" value="${nr.startDate || ""}" required></label>
      <label>إلى<input type="date" name="endDate" value="${nr.endDate || ""}" min="${nr.startDate || ""}" required></label>
      <label>عدد الأيام<input type="number" name="days" min="0.5" step="0.5" value="${nr.days ?? ""}" required></label></div>
      <p class="muted small">الأيام تنحسب وحدها${R().excludeWeekends ? " بدون الجمعة والسبت" : ""}، وتكدر تعدلها.</p>`}
    <label>السبب / ملاحظات<textarea name="reason" rows="2" placeholder="اختياري">${esc(nr.reason || "")}</textarea></label>
    <div class="err" id="reqErr"></div>
    <button class="btn primary block lg" type="submit"><i data-lucide="send"></i>إرسال إلى المعاون الإداري</button>`;
}

function currentPlan() {
  const nr = ui.newReq, e = empById(nr.employeeId), t = typeOf(nr.type);
  if (!e || !t) return null;
  const total = t.unit === "hour" ? requestDays(t, nr, R()) : Number(nr.days) || 0;
  return { e, t, total, ...payPlan({ type: t, total, employee: e, rules: R(), requests: S().requests, startDate: nr.startDate || today(), split: nr.split !== false }) };
}

function reqSummary() {
  const p = currentPlan();
  if (!p) return `<div class="sum-empty"><i data-lucide="user-search"></i><p>بعد اختيار المنتسب يظهر رصيده هنا، ويطلع إذا الإجازة براتب أو بدون راتب.</p></div>`;
  const { e, t, total } = p;
  const field = t.deducts === "sick" ? "sick" : "balance";
  const bal = e[field] || 0;
  const after = p.fromBalance ? round2(bal - p.paid) : bal;
  const isT = e.category === "teaching";
  return `
    <div class="sum-who"><b>${esc(e.name)}</b><span>${CATEGORIES[e.category]}${e.department ? " · " + esc(e.department) : ""}</span></div>
    <div class="sum-bals">
      <div class="${field === "balance" && t.deducts !== "none" ? "on" : ""}"><span>الاعتيادي</span><strong class="${e.balance <= 0 ? "neg" : ""}">${num(e.balance)}</strong></div>
      <div class="${field === "sick" ? "on" : ""}"><span>المرضي</span><strong>${num(e.sick || 0)}</strong></div>
      ${isT ? `<div><span>براتب هالسنة</span><strong>${num(yearPaid(e))}<small>/${R().categories.teaching.maxPaidPerYear}</small></strong></div>` : ""}
    </div>
    <p class="muted small">${ruleText(e.category)}</p>
    <dl class="sum-dl">
      <div><dt>النوع</dt><dd>${esc(t.name)}</dd></div>
      <div><dt>المدة</dt><dd>${t.unit === "hour" ? `${num(ui.newReq.hours || 0)} ساعة = ` : ""}${days(total)}</dd></div>
      ${p.fromBalance ? `<div><dt>الرصيد بعد الموافقة</dt><dd>${days(after)}</dd></div>` : `<div><dt>الرصيد</dt><dd>لا يُخصم</dd></div>`}
    </dl>
    ${total > 0 ? `<div class="pay pay-${p.pay}"><span>${PAY[p.pay]}</span>${["partial", "mixed"].includes(p.pay) ? `<em>${payText(p)}</em>` : ""}</div>` : ""}
    ${p.notes.map((n) => `<div class="note warn">${esc(n)}</div>`).join("")}
    ${t.deducts === "balance" && total > 0 && (p.unpaid > 0 || ui.newReq.split === false) ? `<label class="check"><input type="checkbox" id="splitChk" ${ui.newReq.split !== false ? "checked" : ""}> احتساب المتوفر براتب والباقي بدون راتب</label>` : ""}
    <p class="muted small">يُعاد الفحص لحظة موافقة المعاون الإداري.</p>`;
}

function wireNewRequest() {
  const pick = $("#empPick"), list = $("#empList");
  if (!pick) return;
  const show = () => {
    const q = pick.value.trim();
    const res = S().employees.filter((e) => e.active !== false && (!q || e.name.includes(q) || (e.department || "").includes(q))).slice(0, 8);
    list.innerHTML = res.map((e) => `<button type="button" data-id="${e.id}"><b>${esc(e.name)}</b><span>${CATEGORIES[e.category]} · رصيد ${num(e.balance)}</span></button>`).join("") || `<div class="empty">لا نتائج</div>`;
    list.classList.add("open");
  };
  pick.oninput = show; pick.onfocus = show;
  pick.onblur = () => setTimeout(() => list.classList.remove("open"), 150);
  list.onmousedown = (ev) => {
    const b = ev.target.closest("button[data-id]"); if (!b) return;
    ui.newReq = { employeeId: b.dataset.id };
    pick.value = empById(b.dataset.id).name; list.classList.remove("open");
    refreshReq(true);
  };
  const form = $("#reqForm");
  form.oninput = form.onchange = (ev) => {
    const n = ev.target.name; if (!n) return;
    ui.newReq[n] = ev.target.value;
    if (n === "type") return refreshReq(true);
    if (n === "startDate" || n === "endDate") {
      if (n === "startDate" && form.endDate && (!ui.newReq.endDate || ui.newReq.endDate < ui.newReq.startDate)) { ui.newReq.endDate = ui.newReq.startDate; setDateValue(form.endDate, ui.newReq.startDate); }
      if (form.endDate) setDateMin(form.endDate, ui.newReq.startDate);
      if (form.days) { ui.newReq.days = countDays(ui.newReq.startDate, ui.newReq.endDate, R()) || ""; form.days.value = ui.newReq.days; }
    }
    refreshSummary();
  };
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const p = currentPlan(), nr = ui.newReq;
    if (!p) return;
    if (!(p.total > 0)) return ($("#reqErr").textContent = "حدد مدة الإجازة");
    const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
    try {
      await store.createRequest({
        employeeId: p.e.id, employeeName: p.e.name, category: p.e.category, department: p.e.department || "",
        type: p.t.key, typeName: p.t.name, unit: p.t.unit, deducts: p.t.deducts,
        startDate: nr.startDate || today(), endDate: p.t.unit === "hour" ? (nr.startDate || today()) : nr.endDate,
        days: p.t.unit === "hour" ? 0 : Number(nr.days), hours: p.t.unit === "hour" ? Number(nr.hours) : 0,
        total: p.total, pay: p.pay, paid: p.paid, half: p.half, unpaid: p.unpaid, split: nr.split !== false,
        balanceAtRequest: p.e.balance || 0, sickAtRequest: p.e.sick || 0, reason: nr.reason || ""
      });
      ui.newReq = {};
      toast("أُرسل الطلب إلى المعاون الإداري");
      location.hash = "#/inbox";
    } catch (e) { $("#reqErr").textContent = e.message; btn.disabled = false; }
  };
  $("#reqSummary").onchange = (ev) => { if (ev.target.id === "splitChk") { ui.newReq.split = ev.target.checked; refreshSummary(); } };
}
function refreshReq(body) { if (body) $("#reqBody").innerHTML = reqBody(); refreshSummary(); icons(); }
function refreshSummary() { const s = $("#reqSummary"); if (s) { s.innerHTML = reqSummary(); icons(); } }

/* ------------------------------ inbox ------------------------------ */
function inboxView() {
  const pend = visibleRequests().filter((r) => r.status === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return shell(`
    ${pageHead(isAssistant() ? "الطلبات الواردة" : "قيد الانتظار",
      isAssistant() ? "كل طلب يدخله مسؤول الإجازات يظهر هنا فوراً. الموافقة تخصم الرصيد وتطلع الاستمارة للطباعة." : "طلبات أُرسلت للمعاون الإداري ولم يُبت بها بعد.")}
    ${pend.length ? `<div class="inbox">${pend.map(inboxCard).join("")}</div>` : `<div class="card empty-big"><i data-lucide="check-check"></i><p>لا توجد طلبات بانتظار القرار.</p></div>`}`, "inbox");
}

function inboxCard(r) {
  const e = empById(r.employeeId) || { balance: 0, sick: 0, category: r.category };
  const w = r.kind === "withdrawal";
  const t = typeOf(r.type) || { deducts: r.deducts, fixedPay: "paid", unit: r.unit };
  const p = w ? null : payPlan({ type: t, total: r.total, employee: e, rules: R(), requests: S().requests, startDate: r.startDate, excludeId: r.id, split: r.split !== false });
  const field = r.deducts === "sick" ? "sick" : "balance";
  return `
  <article class="req-card ${w ? "withdraw" : ""}">
    <header><span class="serial">${w ? `طلب سحب ${esc(r.serial)} ← للإجازة ${esc(r.originalSerial)}` : `طلب ${esc(r.serial)}`}</span><span class="muted">${fmtDT(r.createdAt)} · ${esc(r.createdByName)}</span></header>
    <div class="req-main">
      <div><h4><a href="#/employee/${r.employeeId}">${esc(r.employeeName)}</a></h4>${tag(r.category)} <span class="muted">${esc(r.department)}</span></div>
      <dl class="req-dl">
        <div><dt>النوع</dt><dd>${w ? "سحب إجازة " : ""}${esc(r.typeName)}</dd></div>
        <div><dt>المدة</dt><dd>${r.unit === "hour" ? `${num(r.hours)} ساعة · ${fmtDate(r.startDate)}` : `${days(r.total)} · ${fmtDate(r.startDate)} ← ${fmtDate(r.endDate)}`}</dd></div>
        <div><dt>${field === "sick" ? "الرصيد المرضي" : "الرصيد"} الحالي</dt><dd>${days(e[field] || 0)}</dd></div>
        <div><dt>${w ? "يرجع للرصيد" : "الصرف"}</dt><dd>${w ? days(r.deducts === "none" ? 0 : r.paid || 0) : `<span class="pay-chip pay-${p.pay}">${PAY[p.pay]}</span>${["partial", "mixed"].includes(p.pay) ? `<div class="sub">${payText(p)}</div>` : ""}`}</dd></div>
      </dl>
      ${!w && p.notes.length ? `<div class="notes">${p.notes.map((n) => `<span>${esc(n)}</span>`).join("")}</div>` : ""}
      ${r.reason ? `<p class="reason">${w ? "سبب السحب: " : ""}“${esc(r.reason)}”</p>` : ""}
    </div>
    <footer>
      ${isAssistant()
        ? `<button class="btn approve" data-act="approve" data-id="${r.id}"><i data-lucide="check"></i>موافقة</button><button class="btn reject" data-act="reject" data-id="${r.id}"><i data-lucide="x"></i>رفض</button>`
        : `<span class="muted">بانتظار قرار المعاون الإداري</span>${isAdmin() ? `<button class="btn ghost sm" data-act="delete-req" data-id="${r.id}"><i data-lucide="trash-2"></i>حذف الطلب</button>` : ""}`}
    </footer>
  </article>`;
}

/* ----------------------------- requests ----------------------------- */
function rowActions(r) {
  const a = [];
  if (r.status === "approved" || r.status === "withdrawn") a.push(`<a class="icon-btn" title="الاستمارة" href="#/form/${r.id}"><i data-lucide="file-text"></i></a>`);
  if (isAdmin() && r.kind !== "withdrawal" && r.status === "approved" && !pendingWithdrawal(r.id)) a.push(`<button class="icon-btn" title="سحب الإجازة" data-act="withdraw" data-id="${r.id}"><i data-lucide="undo-2"></i></button>`);
  if (isAdmin() && r.status !== "approved" && r.status !== "withdrawn") a.push(`<button class="icon-btn" title="حذف" data-act="delete-req" data-id="${r.id}"><i data-lucide="trash-2"></i></button>`);
  return a.join("");
}

function requestsTable(list, compact) {
  if (!list.length) return `<p class="empty">لا توجد طلبات.</p>`;
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>الرقم</th>${compact ? "" : "<th>المنتسب</th>"}<th>النوع</th><th class="hide-m">الفترة</th><th class="n">المدة</th><th>الصرف</th><th>الحالة</th><th></th></tr></thead>
    <tbody>${list.map((r) => `<tr class="${r.kind === "withdrawal" ? "wrow" : ""}">
      <td class="mono">${esc(r.serial)}</td>
      ${compact ? "" : `<td><a href="#/employee/${r.employeeId}">${esc(r.employeeName)}</a><div class="sub">${CATEGORIES[r.category]}</div></td>`}
      <td>${r.kind === "withdrawal" ? `<b>سحب</b> ${esc(r.typeName)}<div class="sub">للطلب ${esc(r.originalSerial)}</div>` : esc(r.typeName)}</td>
      <td class="hide-m">${fmtDate(r.startDate)}${r.endDate && r.endDate !== r.startDate ? " ← " + fmtDate(r.endDate) : ""}</td>
      <td class="n">${r.unit === "hour" ? num(r.hours) + " س" : num(r.total)}</td>
      <td>${r.kind === "withdrawal" ? (r.refund ? `+${num(r.refund)} للرصيد` : "—") : payChip(r)}</td>
      <td>${st(r)}${r.decisionNote ? `<div class="sub">${esc(r.decisionNote)}</div>` : ""}</td>
      <td class="act">${rowActions(r)}</td>
    </tr>`).join("")}</tbody></table></div>`;
}

function filteredRequests() {
  const f = ui.reqFilter;
  return visibleRequests().filter((r) => (f.status === "all" || r.status === f.status) && (f.cat === "all" || r.category === f.cat)
    && (f.kind === "all" || (f.kind === "withdrawal" ? r.kind === "withdrawal" : r.kind !== "withdrawal"))
    && (!f.q || r.employeeName.includes(f.q) || (r.serial || "").includes(f.q)));
}

function requestsView() {
  const f = ui.reqFilter;
  const opt = (v, l, cur) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`;
  return shell(`
    ${pageHead("سجل الطلبات", "كل الطلبات وقراراتها. الإجازة الموافق عليها تُسحب ولا تُحذف.", `<button class="btn" data-act="export-reqs"><i data-lucide="file-spreadsheet"></i>Excel للمعروض</button>`)}
    <div class="card">
      <div class="filters">
        <div class="search"><i data-lucide="search"></i><input id="reqSearch" placeholder="اسم المنتسب أو رقم الطلب" value="${esc(f.q)}"></div>
        <select data-f="status">${opt("all", "كل الحالات", f.status)}${Object.entries(STATUS).map(([k, v]) => opt(k, v, f.status)).join("")}</select>
        <select data-f="cat">${opt("all", "الكل", f.cat)}${Object.entries(CATEGORIES).map(([k, v]) => opt(k, v, f.cat)).join("")}</select>
        <select data-f="kind">${opt("all", "إجازات وسحب", f.kind)}${opt("leave", "إجازات فقط", f.kind)}${opt("withdrawal", "طلبات السحب", f.kind)}</select>
      </div>
      <div id="reqTable">${requestsTable(filteredRequests())}</div>
    </div>`, "requests");
}

/* ------------------------------ forms ------------------------------ */
function formsList() {
  const q = ui.formsQ.trim();
  const list = visibleRequests().filter((r) => r.status === "approved" || r.status === "withdrawn")
    .filter((r) => !q || r.employeeName.includes(q) || (r.serial || "").includes(q))
    .sort((a, b) => (b.decidedAt || "").localeCompare(a.decidedAt || ""));
  return list.length ? `<div class="forms-grid">${list.map((r) => `
    <a class="form-card ${r.kind === "withdrawal" ? "withdraw" : ""} ${r.status === "withdrawn" ? "voided" : ""}" href="#/form/${r.id}">
      <span class="fc-top"><span class="mono">${esc(r.serial)}</span>${r.status === "withdrawn" ? `<span class="st st-withdrawn">مسحوبة</span>` : r.kind === "withdrawal" ? `<span class="st st-withdrawn">إشعار سحب</span>` : `<span class="st st-approved">موافق عليها</span>`}</span>
      <b>${esc(r.employeeName)}</b>
      <span class="muted small">${esc(r.typeName)} · ${days(r.total)} · ${fmtDate(r.startDate)}</span>
      <span class="muted small">وافق: ${esc(r.decidedByName || "")} · ${fmtDate(r.decidedAt)}</span>
    </a>`).join("")}</div>` : `<p class="empty">لا توجد استمارات بعد.</p>`;
}
function formsView() {
  return shell(`
    ${pageHead("الاستمارات", "كل إجازة يوافق عليها المعاون الإداري تنحفظ هنا كاستمارة رسمية جاهزة للطباعة.")}
    <div class="card">
      <div class="search"><i data-lucide="search"></i><input id="formsSearch" placeholder="ابحث بالاسم أو رقم الطلب" value="${esc(ui.formsQ)}"></div>
      <div id="formsList">${formsList()}</div>
    </div>`, "forms");
}

function formView(id) {
  const r = S().requests.find((x) => x.id === id);
  if (!r) return shell(`<p class="empty">الاستمارة غير موجودة.</p>`, "forms");
  const w = r.kind === "withdrawal";
  const ok = r.status === "approved" || r.status === "withdrawn";
  const fieldName = r.balanceField === "sick" || r.deducts === "sick" ? "الرصيد المرضي" : "الرصيد الاعتيادي";
  const ay = r.category === "teaching" ? academicYear(r.startDate, R().academicYearStartMonth) : "";
  return shell(`
    <div class="page-head noprint"><div><a class="back" href="#/forms">→ الاستمارات</a><h2>${w ? "إشعار سحب إجازة" : "استمارة إجازة"} ${esc(r.serial)}</h2></div>
      <div class="actions">${ok ? `<button class="btn primary" data-act="print"><i data-lucide="printer"></i>طباعة</button>` : ""}
      ${isAdmin() && !w && r.status === "approved" && !pendingWithdrawal(r.id) ? `<button class="btn" data-act="withdraw" data-id="${r.id}"><i data-lucide="undo-2"></i>سحب الإجازة</button>` : ""}</div></div>
    ${!ok ? `<div class="note warn noprint">هذا الطلب: ${STATUS[r.status]}. الاستمارة تصدر بعد موافقة المعاون الإداري.</div>` : ""}
    <article class="sheet ${r.status === "withdrawn" ? "voided" : ""}">
      <header class="sh-head">
        ${logoHTML(86, true)}
        <div class="sh-title"><div>${esc(uni())}</div><div class="sh-c">${esc(COLLEGE.name)}</div><div>${COLLEGE.system}</div></div>
        <div class="sh-meta"><div>العدد: <b class="mono">${esc(r.serial)}</b></div><div>التاريخ: <b>${fmtDate(r.decidedAt || r.createdAt)}</b></div></div>
      </header>
      <h1>${w ? `إشعار سحب إجازة ${esc(r.typeName)}` : `إشعار منح إجازة ${esc(r.typeName)}`}</h1>
      ${r.status === "withdrawn" ? `<div class="stamp void">مسحوبة بتاريخ ${fmtDate(r.withdrawnAt)}</div>` : ""}
      <table>
        <tr><th>الاسم</th><td>${esc(r.employeeName)}</td><th>الصنف</th><td>${CATEGORIES[r.category]}</td></tr>
        <tr><th>القسم / الشعبة</th><td>${esc(r.department) || "—"}</td><th>${ay ? "السنة الدراسية" : "نوع الإجازة"}</th><td>${ay || esc(r.typeName)}</td></tr>
        ${ay ? `<tr><th>نوع الإجازة</th><td colspan="3">${esc(r.typeName)}</td></tr>` : ""}
        <tr><th>من</th><td>${fmtDate(r.startDate)}</td><th>إلى</th><td>${fmtDate(r.endDate)}</td></tr>
        <tr><th>المدة</th><td>${r.unit === "hour" ? num(r.hours) + " ساعة (" + days(r.total) + ")" : days(r.total)}</td><th>الصرف</th><td>${w ? "—" : `${PAY[r.pay] || "—"}${r.pay !== "paid" && payText(r) ? `<div class="sub">${payText(r)}</div>` : ""}`}</td></tr>
        ${r.accrualReversed ? `<tr><th>استرجاع استحقاق</th><td colspan="3">${days(r.accrualReversed)} — عن أشهر الإجازة اللي سبق احتسابها (لا يُستحق رصيد عن مدة ${esc(r.typeName)})</td></tr>` : ""}
        ${w ? `<tr><th>الإجازة المسحوبة</th><td>طلب ${esc(r.originalSerial)}</td><th>أُعيد للرصيد</th><td>${days(r.refund || 0)}</td></tr>` : ""}
        <tr><th>${fieldName} قبل</th><td>${r.balanceBefore != null ? days(r.balanceBefore) : "—"}</td><th>${fieldName} بعد</th><td><b>${r.balanceAfter != null ? days(r.balanceAfter) : "—"}</b></td></tr>
        ${r.reason ? `<tr><th>${w ? "سبب السحب" : "ملاحظات"}</th><td colspan="3">${esc(r.reason)}</td></tr>` : ""}
        ${r.decisionNote ? `<tr><th>ملاحظة المعاون</th><td colspan="3">${esc(r.decisionNote)}</td></tr>` : ""}
      </table>
      <div class="sh-sign">
        <div><span>منظم الطلب</span><b>${esc(r.createdByName)}</b><em>${fmtDT(r.createdAt)}</em></div>
        <div><span>المعاون الإداري</span><b>${esc(r.decidedByName || "—")}</b>${ok ? `<em class="okstamp">✓ تمت الموافقة إلكترونياً ${fmtDT(r.decidedAt)}</em>` : ""}</div>
      </div>
      <footer class="sh-foot">صدرت من ${COLLEGE.system} — ${esc(COLLEGE.name)} · ${esc(uni())}</footer>
    </article>`, "forms");
}


/* ----------------------------- calculator ----------------------------- */
// للمنتسبين القدامى: تاريخ المباشرة كان ينكتب بالملاحظات فقط ("مباشرة 2/2/2024")
function startDateOf(e) {
  if (e.startDate) return e.startDate;
  if (e.calc?.start) return e.calc.start;
  const m = (e.notes || "").match(/مباشرة\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}
function loadCalcFor(e) {
  const saved = e.calc || {};
  ui.calc = {
    empId: e.id, category: e.category, start: startDateOf(e), asOf: today(),
    name: "", title: "", department: "", empNo: "",
    saved: (saved.rows || []).map((r) => ({ ...newCalcRow(r.type), ...r })), dirty: false, editIdx: null,
    rows: [newCalcRow()]
  };
}
function calcView(params) {
  const pe = params?.get("emp");
  if (pe && ui.calc.empId !== pe && empById(pe)) loadCalcFor(empById(pe));
  const c = ui.calc;
  if (!c.asOf) c.asOf = today();
  const emps = S().employees.filter((e) => e.active !== false).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  return shell(`
    ${pageHead("حاسبة الرصيد", "اختر المنتسب وتاريخ مباشرته، أضف إجازاته السابقة، والرصيد يتحسب وحده على اليسار.", `<button class="btn" data-act="print"><i data-lucide="printer"></i>طباعة</button>`)}
    <div class="grid-2 req-grid">
      <form class="card form" id="calcForm" onsubmit="return false">
        <div class="step"><span>1</span>المنتسب</div>
        <label>اختر المنتسب<select name="empId"><option value="">+ منتسب جديد (غير مسجل)</option>${emps.map((e) => `<option value="${e.id}" ${c.empId === e.id ? "selected" : ""}>${esc(e.name)} · ${CATEGORIES[e.category]}</option>`).join("")}</select></label>
        ${c.empId ? "" : `<div class="row">
          <label>الاسم الكامل<input name="name" value="${esc(c.name)}" placeholder="اسم المنتسب الجديد"></label>
          <label>اللقب / العنوان<input name="title" value="${esc(c.title)}"></label></div>
        <div class="row">
          <label>القسم / الشعبة<input name="department" value="${esc(c.department)}"></label>
          <label>الرقم الوظيفي<input name="empNo" value="${esc(c.empNo)}"></label></div>`}
        <div class="row">
          <label>الصنف<select name="category">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${c.category === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label>تاريخ المباشرة<input type="date" name="start" value="${esc(c.start)}" required></label>
          <label>احسب لغاية<input type="date" name="asOf" value="${esc(c.asOf)}" required></label>
        </div>
        <div class="step"><span>2</span>أضف إجازة سابقة</div>
        ${c.empId && systemLeavesFor(c.empId, c.start, c.asOf).count ? `<div class="note">إجازاته اللي انوافق عليها بالنظام (${systemLeavesFor(c.empId, c.start, c.asOf).count}) تنحسب وحدها، فأضف هنا بس الإجازات اللي قبل النظام.</div>` : ""}
        ${calcMissingNote()}
        <div id="calcRows">${calcRows()}</div>
        <div id="calcSaved">${calcSavedTable()}</div>
        <div id="calcSys">${calcSystemTable()}</div>
      </form>
      <aside class="card summary calc-sheet" id="calcResult">${calcResult()}</aside>
    </div>`, "calc");
}

function calcRows() {
  const c = ui.calc, r = c.rows[0] || (c.rows[0] = newCalcRow());
  const t = CALC_TYPES[r.type] || CALC_TYPES.ordinary;
  const editing = c.editIdx != null;
  const pd = periodDays(r.from, r.to);
  const dateF = `<label>التاريخ <small class="muted">(اختياري)</small><input type="date" data-k="from" value="${esc(r.from)}"></label>`;
  const fields = t.input === "period"
    ? `<label>من تاريخ<input type="date" data-k="from" value="${esc(r.from)}"></label>
       <label>إلى تاريخ <small class="muted">(أو تاريخ رجوعه)</small><input type="date" data-k="to" value="${esc(r.to)}" min="${esc(r.from)}"></label>
       <div class="calc-out"><span>المدة</span><b class="calc-days">${pd ? `${pd} يوم` : "—"}</b></div>`
    : t.input === "hours"
      ? `${dateF}<label>عدد الساعات<input type="number" data-k="hours" min="0" step="0.5" inputmode="decimal" value="${esc(r.hours)}"></label>
         <div class="calc-out"><span>تساوي</span><b class="calc-days">${r.hours ? `${num(round2((Number(r.hours) || 0) / R().hoursPerDay))} يوم` : "—"}</b></div>`
      : t.input === "absence"
        ? `${dateF}<label>أيام الغياب<input type="number" data-k="days" min="0" step="0.5" inputmode="decimal" value="${esc(r.days)}"></label>
           <label>شلون ينحسب<select data-k="mode"><option value="pause" ${r.mode !== "deduct" ? "selected" : ""}>يوقف الاستحقاق</option><option value="deduct" ${r.mode === "deduct" ? "selected" : ""}>ينخصم من الرصيد</option></select></label>`
        : `${dateF}<label>عدد الأيام<input type="number" data-k="days" min="0" step="0.5" inputmode="decimal" value="${esc(r.days)}"></label><div></div>`;
  return `<div class="calc-draft eff-${t.effect}${editing ? " editing" : ""}" data-i="0">
    ${editing ? `<div class="calc-editing"><i data-lucide="pencil"></i>تعدّل الإجازة رقم ${c.editIdx + 1}</div>` : ""}
    <div class="lbl">نوع الإجازة</div>
    <div class="type-chips" role="radiogroup">${Object.entries(CALC_TYPES).map(([k, x]) => `<button type="button" role="radio" aria-checked="${k === r.type}" class="chip${k === r.type ? " on" : ""}" data-act="calc-type" data-v="${k}">${x.name}</button>`).join("")}</div>
    <p class="calc-hint"><i data-lucide="info"></i>${t.hint}</p>
    <div class="calc-fields">${fields}</div>
    <label>ملاحظة <small class="muted">(اختياري)</small><input type="text" data-k="note" value="${esc(r.note)}" placeholder="مثلاً: رقم الأمر الإداري"></label>
    <div class="actions">
      <button type="button" class="btn primary" data-act="calc-commit"><i data-lucide="${editing ? "check" : "plus"}"></i>${editing ? "حفظ التعديل" : "إضافة إلى القائمة"}</button>
      ${editing ? `<button type="button" class="btn" data-act="calc-cancel-edit">إلغاء</button>` : ""}
    </div>
  </div>`;
}

const filledRow = (r) => !!(r.days || r.hours || (r.from && r.to) || (r.type === "absence" && r.days));
// أثناء التعديل: السطر الأصلي يبقى بالقائمة، والحساب يستخدم النسخة المعدّلة إذا مكتملة
const allCalcRows = () => {
  const c = ui.calc, d = c.rows[0], ok = d && filledRow(d) && !draftProblem(d);
  const list = (c.saved || []).slice();
  if (c.editIdx != null) { if (ok) list[c.editIdx] = d; return list; }
  return ok ? list.concat([d]) : list;
};
// نقل الأسطر المعبّأة من خانات الإدخال إلى جدول الإجازات
function draftProblem(r) {
  const t = CALC_TYPES[r.type];
  if (t.input === "period") { if (!r.from || !r.to) return "اكتب تاريخ البداية والنهاية"; if (r.to < r.from) return "تاريخ النهاية قبل البداية"; return ""; }
  if (t.input === "hours") return Number(r.hours) > 0 ? "" : "اكتب عدد الساعات";
  return Number(r.days) > 0 ? "" : "اكتب عدد الأيام";
}
function commitDrafts() {
  const c = ui.calc, r = c.rows[0];
  if (!r || !filledRow(r) || draftProblem(r)) {
    if (c.editIdx != null) { c.editIdx = null; c.rows = [newCalcRow()]; }
    return 0;
  }
  const row = { ...r };
  if (c.editIdx != null) c.saved[c.editIdx] = row; else c.saved = (c.saved || []).concat([row]);
  c.editIdx = null; c.rows = [newCalcRow(r.type)]; c.dirty = true;
  return 1;
}
function calcRowText(r) {
  const t = CALC_TYPES[r.type] || CALC_TYPES.ordinary;
  const when = t.input === "period" ? `${fmtDate(r.from)} ← ${fmtDate(r.to)}` : (r.from ? fmtDate(r.from) : "—");
  const amount = t.input === "period" ? `${periodDays(r.from, r.to)} يوم`
    : t.input === "hours" ? `${num(r.hours)} ساعة (${num(round2((Number(r.hours) || 0) / R().hoursPerDay))} يوم)` : `${num(r.days)} يوم`;
  const effect = r.type === "sick" ? "تنخصم من المرضي" : (r.type === "ordinary" || r.type === "hourly") ? "تنخصم من الاعتيادي"
    : r.type === "absence" && r.mode === "deduct" ? "ينخصم من الاعتيادي" : "بدون استحقاق";
  return { when, amount, effect };
}
// جدول إجازات المنتسب المحفوظة بالحاسبة (تعديل = ترجع لخانات الإدخال، حذف = تنشال)
function calcSavedTable() {
  const list = ui.calc.saved || [];
  const head = `<div class="step"><span>3</span>الإجازات المضافة${list.length ? ` <small class="muted">(${list.length})</small>` : ""}${ui.calc.dirty ? `<small class="pill warn">غير محفوظة بعد</small>` : ""}</div>`;
  if (!list.length) return `<div class="calc-sys">${head}<div class="calc-empty">ما مضاف إجازات بعد. أضفها من فوق وراح تطلع هنا.</div></div>`;
  const hpd = R().hoursPerDay;
  const ord = round2(list.filter((r) => r.type === "ordinary" || (r.type === "absence" && r.mode === "deduct")).reduce((a, r) => a + (Number(r.days) || 0), 0) + list.filter((r) => r.type === "hourly").reduce((a, r) => a + (Number(r.hours) || 0), 0) / hpd);
  const sick = round2(list.filter((r) => r.type === "sick").reduce((a, r) => a + (Number(r.days) || 0), 0));
  const pause = list.filter((r) => CALC_TYPES[r.type]?.effect === "pause").reduce((a, r) => a + periodDays(r.from, r.to), 0) + list.filter((r) => r.type === "absence" && r.mode !== "deduct").reduce((a, r) => a + (Number(r.days) || 0), 0);
  return `<div class="calc-sys">${head}
    <div class="table-wrap"><table class="table calc-list"><thead><tr><th>#</th><th>النوع</th><th>التاريخ</th><th class="n">المدة</th><th>تأثيرها</th><th>ملاحظة</th><th></th></tr></thead>
    <tbody>${list.map((r, i) => { const x = calcRowText(r); return `<tr class="${ui.calc.editIdx === i ? "is-editing" : ""}"><td class="mono">${i + 1}</td><td><b>${esc(typeName(r.type))}</b></td><td>${x.when}</td><td class="n">${x.amount}</td><td><span class="eff eff-${CALC_TYPES[r.type]?.effect}">${x.effect}</span></td><td class="muted">${esc(r.note || "")}</td>
      <td class="act"><button type="button" class="icon-btn" data-act="calc-edit-saved" data-id="${i}" title="تعديل" aria-label="تعديل"><i data-lucide="pencil"></i></button><button type="button" class="icon-btn del" data-act="calc-del-saved" data-id="${i}" title="حذف" aria-label="حذف"><i data-lucide="trash-2"></i></button></td></tr>`; }).join("")}</tbody>
    <tfoot><tr><td colspan="7">المجموع: ${ord ? `اعتيادي <b>${num(ord)}</b> يوم` : ""}${sick ? ` · مرضي <b>${num(sick)}</b> يوم` : ""}${pause ? ` · بدون استحقاق <b>${num(pause)}</b> يوم` : ""}</td></tr></tfoot></table></div></div>`;
}
function redrawCalcLists() { $("#calcRows").innerHTML = calcRows(); const sv = $("#calcSaved"); if (sv) sv.innerHTML = calcSavedTable(); icons(); refreshCalc(); }

// جدول إجازات المنتسب المسجلة بالنظام (للاطلاع — تنحسب وحدها)
function calcSystemTable() {
  const c = ui.calc;
  if (!c.empId) return "";
  const list = systemLeavesFor(c.empId, c.start, c.asOf).list;
  if (!list.length) return "";
  return `<div class="calc-sys"><div class="step"><span>4</span>إجازاته الموافق عليها بالنظام <small class="muted">(للاطلاع — تنحسب وحدها)</small></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>الرقم</th><th>النوع</th><th>الفترة</th><th class="n">المدة</th><th>الأثر</th><th></th></tr></thead>
    <tbody>${list.map((r) => `<tr><td class="mono">${esc(r.serial)}</td><td>${esc(r.typeName)}</td><td>${fmtDate(r.startDate)}${r.endDate && r.endDate !== r.startDate ? " ← " + fmtDate(r.endDate) : ""}</td>
      <td class="n">${r.unit === "hour" ? num(r.hours) + " س" : num(r.total)}</td>
      <td>${r.deducts === "balance" ? (payText(r) || "من الاعتيادي") : r.deducts === "sick" ? "من المرضي" : typeOf(r.type)?.pausesAccrual ? "توقف الاستحقاق" : "—"}</td>
      <td class="act"><a class="icon-btn" href="#/form/${r.id}" title="الاستمارة"><i data-lucide="file-text"></i></a></td></tr>`).join("")}</tbody></table></div></div>`;
}

// إجازات المنتسب الموافق عليها بالنظام (تنحسب وحدها بالحاسبة حتى ما يضيع شي عند إعادة الاعتماد)
function systemLeavesFor(empId, start, asOf) {
  if (!empId) return { paid: 0, sick: 0, periods: [], count: 0, list: [] };
  const pauseKeys = R().types.filter((t) => t.pausesAccrual).map((t) => t.key);
  const list = S().requests.filter((r) => r.employeeId === empId && r.kind !== "withdrawal" && r.status === "approved" && !r.deleted
    && (!start || (r.endDate || r.startDate) >= start) && (!asOf || r.startDate <= asOf));
  const periods = list.filter((r) => pauseKeys.includes(r.type)).map((r) => ({ from: r.startDate, to: r.endDate || r.startDate }));
  return {
    paid: round2(list.filter((r) => r.deducts === "balance").reduce((a, r) => a + (r.paid || 0), 0)),
    sick: round2(list.filter((r) => r.deducts === "sick").reduce((a, r) => a + (r.paid || 0), 0)),
    periods, count: list.length, list
  };
}

// منتسب أُضيف قبل ميزة حفظ الإجازات: ما عنده أسطر محفوظة، فنوضح الفرق ونعرض تعبئته بسطر واحد
function calcGap() {
  const e = empById(ui.calc.empId); if (!e || e.calc?.rows?.length || (ui.calc.saved || []).length) return null;
  const blank = ui.calc.rows.every((r) => !r.days && !r.hours && !r.from);
  if (!blank) return null;
  const d = calcData(); if (!d) return null;
  return { e, ord: round2(d.final - (e.balance || 0)), sick: round2(d.sickLeft - (e.sick || 0)) };
}
function calcMissingNote() {
  const g = calcGap(); if (!g) return "";
  const parts = [g.ord > 0 ? `اعتيادي ${num(g.ord)} يوم` : "", g.sick > 0 ? `مرضي ${num(g.sick)} يوم` : ""].filter(Boolean).join(" و ");
  return `<div class="note warn">ما محفوظ لـ${esc(g.e.name)} تفاصيل إجازات بالحاسبة، لأن انضاف قبل ميزة الحفظ، فالجدول فاضي.
    ${parts ? `<br>الفرق بين المستحق ورصيده الحالي: <b>${parts}</b> (إجازات مأخوذة سابقاً بدون تفاصيل).
    <br>اكتب إجازاته بالتفصيل وأضفها للقائمة، أو
    <button type="button" class="btn sm" data-act="calc-fill-gap"><i data-lucide="list-plus"></i>أضف الفرق كإجازة واحدة</button>` : "<br>اكتب إجازاته وأضفها للقائمة، وبعدين اضغط \"حفظ الإجازات فقط\"."}</div>`;
}
function calcData() {
  const c = ui.calc, rows = allCalcRows();
  const sys = systemLeavesFor(c.empId, c.start, c.asOf);
  const periods = rows.filter((r) => CALC_TYPES[r.type]?.effect === "pause").map((r) => ({ from: r.from, to: r.to })).concat(sys.periods);
  const absRows = rows.filter((r) => r.type === "absence");
  const absPause = round2(absRows.filter((r) => r.mode !== "deduct").reduce((a, r) => a + (Number(r.days) || 0), 0));
  const absDeduct = round2(absRows.filter((r) => r.mode === "deduct").reduce((a, r) => a + (Number(r.days) || 0), 0));
  const paused = pausedDays(periods, c.start, c.asOf) + absPause;
  const ent = serviceEntitlement({ start: c.start, asOf: c.asOf, category: c.category, rules: R(), paused });
  if (!ent) return null;
  const hpd = R().hoursPerDay;
  const takenDays = round2(rows.filter((r) => r.type === "ordinary").reduce((a, r) => a + (Number(r.days) || 0), 0));
  const takenHours = round2(rows.filter((r) => r.type === "hourly").reduce((a, r) => a + (Number(r.hours) || 0), 0));
  const taken = round2(takenDays + takenHours / hpd + absDeduct + sys.paid);
  const sickTaken = round2(rows.filter((r) => r.type === "sick").reduce((a, r) => a + (Number(r.days) || 0), 0) + sys.sick);
  const byType = {};
  rows.filter((r) => CALC_TYPES[r.type]?.effect === "pause").forEach((r) => { byType[r.type] = (byType[r.type] || 0) + periodDays(r.from, r.to); });
  if (absPause) byType.absence = absPause;
  const raw = round2(ent.ordinary - taken);
  const final = ent.cap > 0 && raw > ent.cap ? ent.cap : raw;
  return { ...ent, sys, takenDays, takenHours, absDeduct, taken, raw, final, sickTaken, sickLeft: round2(ent.sick - sickTaken), byType };
}

function calcResult() {
  const c = ui.calc, d = calcData(), e = empById(c.empId);
  if (!d) return `<div class="sum-empty"><i data-lucide="calendar-range"></i><p>اختر تاريخ المباشرة حتى تطلع النتيجة.</p></div>`;
  const rule = c.category === "staff" ? "يوم عن كل 10 أيام خدمة محتسبة (الخدمة المدنية م43)" : `${num(R().categories.teaching.amount)} يوم لكل سنة، نسبياً حسب الأشهر المحتسبة (الخدمة الجامعية م10)`;
  const notToday = c.asOf !== today();
  return `
    <div class="sum-who"><b>${e ? esc(e.name) : esc(c.name) || "حساب حر"}</b><span>${CATEGORIES[c.category]} · مباشرة ${fmtDate(c.start)} ← ${fmtDate(c.asOf)}</span></div>
    <dl class="sum-dl">
      <div><dt>مدة الخدمة</dt><dd>${d.years} سنة و ${d.remMonths} شهر <small class="muted">(${d.days} يوم)</small></dd></div>
      ${d.paused ? `<div><dt>أيام بدون استحقاق</dt><dd class="neg">− ${d.paused} يوم</dd></div>
        ${Object.entries(d.byType).map(([k, v]) => `<div class="sub-row"><dt>${CALC_TYPES[k].name}</dt><dd>${v} يوم</dd></div>`).join("")}
        <div><dt>الخدمة المحتسبة</dt><dd>${d.effDays} يوم</dd></div>` : ""}
      <div><dt>المستحق عن خدمته</dt><dd>${days(d.ordinary)}</dd></div>
      ${d.takenDays ? `<div><dt>اعتيادية مأخوذة</dt><dd class="neg">− ${days(d.takenDays)}</dd></div>` : ""}
      ${d.sys.count ? `<div><dt>إجازات النظام (${d.sys.count})</dt><dd class="neg">− ${days(d.sys.paid)}${d.sys.sick ? ` · مرضي − ${num(d.sys.sick)}` : ""}${d.sys.periods.length ? ` · ${d.sys.periods.length} فترة موقوفة` : ""}</dd></div>` : ""}
      ${d.absDeduct ? `<div><dt>غياب مخصوم</dt><dd class="neg">− ${days(d.absDeduct)}</dd></div>` : ""}
      ${d.takenHours ? `<div><dt>زمنية مأخوذة</dt><dd class="neg">− ${num(d.takenHours)} ساعة = ${days(round2(d.takenHours / R().hoursPerDay))}</dd></div>` : ""}
    </dl>
    <div class="sum-bal"><span>رصيده الاعتيادي</span><strong class="${d.final < 0 ? "neg" : ""}">${num(d.final)}</strong><em>يوم</em></div>
    ${d.final < 0 ? `<div class="note warn">المأخوذ أكثر من المستحق بـ ${days(-d.final)} — تُعامل بدون راتب.</div>` : ""}
    <dl class="sum-dl">
      <div><dt>المستحق المرضي</dt><dd>${days(d.sick)}</dd></div>
      ${d.sickTaken ? `<div><dt>مرضية مأخوذة</dt><dd class="neg">− ${days(d.sickTaken)}</dd></div>` : ""}
      <div><dt>رصيده المرضي</dt><dd><b>${days(Math.max(0, d.sickLeft))}</b></dd></div>
    </dl>
    <p class="muted small">الاحتساب: ${rule}. المرضية 30 يوم عن كل سنة خدمة محتسبة كاملة (م46).</p>
    <div class="calc-apply noprint">
      ${e ? `<div class="calc-compare"><div><span>رصيده بالنظام الآن</span><b>${num(e.balance)}</b><small>مرضي ${num(e.sick || 0)}</small></div><i data-lucide="arrow-left"></i><div><span>بعد الحفظ</span><b>${num(Math.max(0, d.final))}</b><small>مرضي ${num(Math.max(0, d.sickLeft))}</small></div></div>
        <button type="button" class="btn primary block" data-act="calc-apply"><i data-lucide="check"></i>حفظ وتحديث رصيده</button>
        <button type="button" class="btn block" data-act="calc-save" style="margin-top:8px"><i data-lucide="save"></i>حفظ الإجازات بدون تغيير رصيده</button>`
      : `<button type="button" class="btn primary block" data-act="calc-add-emp"><i data-lucide="user-plus"></i>إضافة كمنتسب جديد بهذا الرصيد</button>
        <p class="muted small">ينضاف برصيد اعتيادي ${days(Math.max(0, d.final))} ومرضي ${days(Math.max(0, d.sickLeft))}، والاستحقاق الشهري يكمل وحده من الشهر الجاي.</p>`}
      ${notToday ? `<div class="note warn">"احسب لغاية" مو تاريخ اليوم — الرصيد المعتمد يكون لغاية ${fmtDate(c.asOf)}، والاستحقاق التلقائي يبدأ من الشهر الحالي.</div>` : ""}
    </div>`;
}
// ما ينحفظ على سجل المنتسب: تاريخ المباشرة، الإجازات المدخلة، وملخص النتيجة
function calcSnapshot(d) {
  const c = ui.calc;
  const rows = allCalcRows()
    .map((r) => ({ type: r.type, from: r.from || "", to: r.to || "", days: r.days || "", hours: r.hours || "", note: r.note || "", mode: r.mode || "pause" }));
  return { start: c.start, asOf: c.asOf, category: c.category, rows,
    result: { ordinary: d.ordinary, taken: d.taken, paused: d.paused, balance: Math.max(0, d.final), sick: d.sick, sickTaken: d.sickTaken, sickLeft: Math.max(0, d.sickLeft) } };
}
function refreshCalc() { const r = $("#calcResult"); if (r) { r.innerHTML = calcResult(); } const sy = $("#calcSys"); if (sy) sy.innerHTML = calcSystemTable(); icons(); }


/* ------------------------- leave summary & statement ------------------------- */
const typeName = (key) => (CALC_TYPES[key] || {}).name || (R().types.find((t) => t.key === key) || {}).name || key;
// كل إجازات المنتسب: السابقة (من الحاسبة) + الموافق عليها بالنظام
function allLeaves(e) {
  const hpd = R().hoursPerDay;
  const prev = ((e.calc || {}).rows || []).map((r) => {
    const t = CALC_TYPES[r.type] || CALC_TYPES.ordinary;
    const d = t.input === "period" ? periodDays(r.from, r.to) : t.input === "hours" ? round2((Number(r.hours) || 0) / hpd) : Number(r.days) || 0;
    return { src: "سابقة", type: r.type, name: typeName(r.type), from: r.from, to: r.to, days: d, hours: t.input === "hours" ? Number(r.hours) || 0 : 0,
      effect: t.input === "absence" ? (r.mode === "deduct" ? "مخصوم من الرصيد" : "توقف الاستحقاق") : t.effect === "pause" ? "توقف الاستحقاق" : t.effect === "sick" ? "من المرضي" : "من الاعتيادي", note: r.note || "" };
  });
  const sys = visibleRequests().filter((r) => r.employeeId === e.id && r.kind !== "withdrawal" && r.status === "approved")
    .map((r) => ({ src: "النظام", type: r.type, name: r.typeName, from: r.startDate, to: r.endDate, days: r.total || 0, hours: r.unit === "hour" ? r.hours || 0 : 0,
      effect: r.deducts === "balance" ? (payText(r) || "من الاعتيادي") : r.deducts === "sick" ? "من المرضي" : (typeOf(r.type)?.pausesAccrual ? "توقف الاستحقاق" : PAY[r.pay] || "—"), note: r.serial }));
  return [...prev, ...sys].sort((a, b) => (a.from || "").localeCompare(b.from || ""));
}
function leaveSummary(e) {
  const map = new Map();
  for (const l of allLeaves(e)) {
    const k = l.type;
    const g = map.get(k) || { key: k, name: typeName(k), count: 0, days: 0, hours: 0 };
    g.count++; g.days = round2(g.days + (l.days || 0)); g.hours = round2(g.hours + (l.hours || 0));
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
const summaryText = (g) => `${g.count} ${g.count === 1 ? "مرة" : "مرات"} · ${g.hours ? `${num(g.hours)} ساعة (${num(g.days)} يوم)` : `${num(g.days)} يوم`}`;

function summaryCard(e) {
  const sum = leaveSummary(e);
  if (!sum.length) return "";
  const total = sum.reduce((a, g) => a + g.count, 0);
  return `<div class="card leave-sum"><div class="card-h"><h3>ملخص الإجازات حسب النوع</h3><span class="muted small">${total} إجازة — السابقة والمسجلة بالنظام</span></div>
    <div class="sum-chips">${sum.map((g) => `<div class="sum-chip t-${g.key}"><b>${esc(g.name)}</b><span>${summaryText(g)}</span></div>`).join("")}</div></div>`;
}

function statementView(id) {
  const e = empById(id) || S().employees.find((x) => x.id === id);
  if (!e) return shell(`<p class="empty">المنتسب غير موجود.</p>`, "employees");
  const list = allLeaves(e), sum = leaveSummary(e), cd = e.calc || {};
  const isT = e.category === "teaching";
  return shell(`
    <div class="page-head noprint"><div><a class="back" href="#/employee/${e.id}">→ ${esc(e.name)}</a><h2>كشف الإجازات</h2></div>
      <div class="actions"><button class="btn primary" data-act="print"><i data-lucide="printer"></i>طباعة</button></div></div>
    <article class="sheet statement">
      <header class="sh-head">
        ${logoHTML(86, true)}
        <div class="sh-title"><div>${esc(uni())}</div><div class="sh-c">${esc(COLLEGE.name)}</div><div>${COLLEGE.system}</div></div>
        <div class="sh-meta"><div>التاريخ: <b>${fmtDate(today())}</b></div></div>
      </header>
      <h1>كشف إجازات منتسب</h1>
      <table>
        <tr><th>الاسم</th><td>${esc(e.name)}</td><th>الصنف</th><td>${CATEGORIES[e.category]}</td></tr>
        <tr><th>العنوان الوظيفي</th><td>${esc(e.title) || "—"}</td><th>القسم / الشعبة</th><td>${esc(e.department) || "—"}</td></tr>
        <tr><th>الرقم الوظيفي</th><td>${esc(e.empNo) || "—"}</td><th>تاريخ المباشرة</th><td>${startDateOf(e) ? fmtDate(startDateOf(e)) : "—"}</td></tr>
        <tr><th>الرصيد الاعتيادي</th><td><b>${days(e.balance)}</b></td><th>الرصيد المرضي</th><td><b>${days(e.sick || 0)}</b></td></tr>
        ${isT ? `<tr><th>براتب بالسنة الدراسية</th><td colspan="3">${num(yearPaid(e))} من ${R().categories.teaching.maxPaidPerYear} يوم (${academicYear(today(), R().academicYearStartMonth)})</td></tr>` : ""}
      </table>
      ${sum.length ? `<h2 class="sh-sub">ملخص حسب النوع</h2>
      <table class="compact"><thead><tr><th>النوع</th><th>عدد المرات</th><th>المدة</th></tr></thead>
        <tbody>${sum.map((g) => `<tr><td>${esc(g.name)}</td><td>${g.count}</td><td>${g.hours ? `${num(g.hours)} ساعة (${num(g.days)} يوم)` : `${num(g.days)} يوم`}</td></tr>`).join("")}</tbody></table>` : ""}
      <h2 class="sh-sub">تفاصيل الإجازات</h2>
      ${list.length ? `<table class="compact"><thead><tr><th>ت</th><th>النوع</th><th>من</th><th>إلى</th><th>المدة</th><th>الأثر</th><th>المصدر</th></tr></thead>
        <tbody>${list.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td>${l.from ? fmtDate(l.from) : "—"}</td><td>${l.to && l.to !== l.from ? fmtDate(l.to) : "—"}</td>
          <td>${l.hours ? `${num(l.hours)} س` : `${num(l.days)} يوم`}</td><td>${esc(l.effect)}</td><td>${l.src}${l.note ? ` · ${esc(l.note)}` : ""}</td></tr>`).join("")}</tbody></table>`
        : `<p class="muted">لا توجد إجازات مسجلة.</p>`}
      ${cd.result ? `<p class="small sh-note">آخر احتساب بالحاسبة لغاية ${fmtDate(cd.asOf)}: المستحق ${days(cd.result.ordinary)} − المأخوذ ${days(cd.result.taken)}${cd.result.paused ? ` (أيام موقوفة ${cd.result.paused})` : ""}.</p>` : ""}
      <div class="sh-sign">
        <div><span>شعبة الموارد البشرية</span><b>&nbsp;</b><em>التوقيع</em></div>
        <div><span>المعاون الإداري</span><b>&nbsp;</b><em>التوقيع</em></div>
      </div>
      <footer class="sh-foot">صدر من ${COLLEGE.system} — ${esc(COLLEGE.name)} · ${esc(uni())} · ${fmtDT(new Date().toISOString())}</footer>
    </article>`, "employees");
}

/* ----------------------------- settings ----------------------------- */
function settingsView() {
  const s = S().settings, r = s.rules, c = r.categories;
  const n = (name, v, label, help = "") => `<label>${label}<input type="number" min="0" step="0.5" name="${name}" value="${v}">${help ? `<small>${help}</small>` : ""}</label>`;
  return shell(`
    ${pageHead("الإعدادات", "هذه الصفحة للسوبر أدمن فقط.")}
    <div class="grid-2 even">
      <form class="card form" id="rulesForm">
        <div class="card-h"><h3>قوانين احتساب الإجازات</h3></div>
        <fieldset><legend>الموظفون — قانون الخدمة المدنية 24/1960</legend>
          <div class="row">${n("staff.amount", c.staff.amount, "أيام شهرياً", "م43: يوم عن كل 10 أيام")}<label>التراكم<input value="بدون حد" disabled><small>حد الـ180 يوم للتقاعد فقط</small></label></div>
          <div class="row">${n("staff.maxPaidPerLeave", c.staff.maxPaidPerLeave, "أقصى براتب بالمرة", "م43/3: 120 يوم")}${n("staff.maxUnpaidPerLeave", c.staff.maxUnpaidPerLeave, "أقصى بدون راتب", "م43/4: 60 يوم")}</div>
        </fieldset>
        <fieldset><legend>التدريسيون — قانون الخدمة الجامعية 23/2008</legend>
          <div class="row">${n("teaching.amount", c.teaching.amount, "أيام كل سنة دراسية", "م10/1: 15 يوم وتتراكم")}${n("teaching.maxPaidPerYear", c.teaching.maxPaidPerYear, "أقصى براتب بالسنة الدراسية", "م10/1: 30 يوم")}</div>
          <div class="row"><label>بداية السنة الدراسية<select name="academicYearStartMonth">${[9, 10, 1].map((m) => `<option value="${m}" ${r.academicYearStartMonth === m ? "selected" : ""}>${{ 9: "أيلول", 10: "تشرين الأول", 1: "كانون الثاني" }[m]}</option>`).join("")}</select></label>${n("teaching.maxUnpaidPerLeave", c.teaching.maxUnpaidPerLeave, "أقصى بدون راتب")}</div>
        </fieldset>
        <fieldset><legend>عام</legend>
          <div class="row">${n("sickAnnual", r.sickAnnual, "مرضية سنوياً براتب", "م46: 30 يوم")}${n("hoursPerDay", r.hoursPerDay, "ساعات الدوام اليومي", "لتحويل الزمنية")}</div>
          <label class="check"><input type="checkbox" name="excludeWeekends" ${r.excludeWeekends ? "checked" : ""}> عدم احتساب الجمعة والسبت</label>
        </fieldset>
        <button class="btn primary">حفظ القوانين</button>
      </form>
      <div class="stack">
        <div class="card">
          <div class="card-h"><h3>الحسابات</h3><button class="btn sm" data-act="add-user"><i data-lucide="user-plus"></i>حساب جديد</button></div>
          <ul class="list">${S().users.filter((u) => u.role !== "backup").map((u) => `<li><span><b>${esc(u.name)}</b> <span class="muted" dir="ltr">${esc(u.username)}</span><div class="sub">${ROLES[u.role] || u.role}${u.active ? "" : " · موقوف"}</div></span>
            <span>${u.id !== S().user.uid ? `<button class="btn sm ${u.active ? "ghost" : ""}" data-act="user-active" data-id="${u.id}" data-v="${u.active ? 0 : 1}">${u.active ? "إيقاف" : "تفعيل"}</button>` : `<span class="muted small">حسابك</span>`}</span></li>`).join("")}</ul>
        </div>
        <form class="card form" id="collegeForm">
          <div class="card-h"><h3>هوية الكلية</h3></div>
          <div class="logo-edit">${logoHTML(56)}<label class="btn sm">تغيير الشعار<input type="file" accept="image/*" id="logoFile" hidden></label>${s.logo ? `<button type="button" class="btn ghost sm" data-act="logo-clear">الشعار الأصلي</button>` : ""}</div>
          <label>اسم الجامعة<input name="university" value="${esc(uni())}"></label>
          <button class="btn primary">حفظ</button>
        </form>
        <div class="card">
          <div class="card-h"><h3>النسخ الاحتياطي</h3></div>
          <p class="muted small">نسخة تلقائية كل ليلة إلى مستودع GitHub خاص. وتكدر تنزل نسخة يدوية بأي وقت:</p>
          <div class="actions"><button class="btn" data-act="backup"><i data-lucide="download"></i>نسخة كاملة (JSON)</button><button class="btn" data-act="export-all"><i data-lucide="file-spreadsheet"></i>Excel كامل</button></div>
        </div>
      </div>
    </div>`, "settings");
}

/* ------------------------------ modals ------------------------------ */
function modal(title, body, onSubmit, submitLabel = "حفظ", cls = "") {
  const m = document.createElement("div");
  m.className = "modal-bg";
  m.innerHTML = `<form class="modal ${cls}"><div class="modal-h"><h3>${title}</h3><button type="button" class="icon-btn" data-close><i data-lucide="x"></i></button></div>
    <div class="modal-b">${body}</div><div class="err"></div>
    <div class="modal-f">${onSubmit ? `<button type="button" class="btn ghost" data-close>إلغاء</button><button class="btn primary" type="submit">${submitLabel}</button>` : `<button type="button" class="btn ghost" data-close>إغلاق</button>`}</div></form>`;
  document.body.appendChild(m); icons();
  const close = () => { m.remove(); render(); };
  m.addEventListener("click", (e) => { if (e.target === m || e.target.closest("[data-close]")) close(); });
  const f = m.querySelector("form");
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!onSubmit) return close();
    const btn = f.querySelector("[type=submit]"); btn.disabled = true;
    try { const next = await onSubmit(Object.fromEntries(new FormData(f)), f); m.remove(); render(); if (typeof next === "function") next(); }
    catch (err) { f.querySelector(".err").textContent = err.message || "حدث خطأ"; btn.disabled = false; }
  };
  setTimeout(() => f.querySelector("input:not([type=hidden]):not([type=file]),textarea,select")?.focus(), 30);
  return f;
}

function employeeModal(e = {}) {
  modal(e.id ? "تعديل بيانات المنتسب" : "إضافة منتسب", `
    <label>الاسم الكامل<input name="name" required value="${esc(e.name || "")}"></label>
    <div class="row"><label>الصنف<select name="category">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${e.category === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <label>اللقب / العنوان الوظيفي<input name="title" value="${esc(e.title || "")}"></label></div>
    <div class="row"><label>القسم / الشعبة<input name="department" value="${esc(e.department || "")}"></label>
    <label>الرقم الوظيفي<input name="empNo" value="${esc(e.empNo || "")}"></label></div>
    <label>تاريخ المباشرة<input type="date" name="startDate" value="${esc(e.startDate || "")}"></label>
    ${e.id ? "" : `<div class="row"><label>الرصيد الاعتيادي الحالي<input type="number" step="0.5" name="balance" required value="0"></label>
    <label>الرصيد المرضي الحالي<input type="number" step="0.5" name="sick" value="30"></label></div>
    <p class="muted small">الأرصدة لغاية اليوم. الاستحقاق الجاي ينضاف تلقائياً.</p>`}
    <label>ملاحظات<textarea name="notes" rows="2">${esc(e.notes || "")}</textarea></label>`,
    async (d) => { await store.saveEmployee({ ...d, id: e.id }); toast(e.id ? "تم الحفظ" : "تمت إضافة المنتسب"); });
}

function adjustModal(id) {
  const e = empById(id);
  modal("تعديل الرصيد", `
    <p><b>${esc(e.name)}</b> — الاعتيادي ${days(e.balance)} · المرضي ${days(e.sick || 0)}</p>
    <div class="row"><label>الرصيد<select name="field"><option value="balance">الاعتيادي</option><option value="sick">المرضي</option></select></label>
    <label>العملية<select name="op"><option value="add">إضافة</option><option value="sub">خصم</option><option value="set">تحديد إلى</option></select></label>
    <label>الأيام<input type="number" step="0.25" min="0" name="v" required></label></div>
    <label>السبب (يظهر بحركة الرصيد)<input name="reason" required placeholder="مثال: تصحيح حسب كتاب الموارد البشرية"></label>`,
    async (d) => {
      const v = Number(d.v), cur = e[d.field] || 0;
      const delta = d.op === "add" ? v : d.op === "sub" ? -v : round2(v - cur);
      if (!delta) throw new Error("لا يوجد تغيير");
      await store.adjustBalance(id, d.field, delta, d.reason); toast("تم تعديل الرصيد");
    });
}

function decideModal(id, approve) {
  const r = S().requests.find((x) => x.id === id), e = empById(r.employeeId) || { balance: 0, sick: 0 };
  const w = r.kind === "withdrawal";
  const field = r.deducts === "sick" ? "sick" : "balance";
  const t = typeOf(r.type) || { deducts: r.deducts, fixedPay: "paid", unit: r.unit };
  const p = w ? { paid: r.deducts === "none" ? 0 : r.paid || 0, fromBalance: r.deducts !== "none" } : payPlan({ type: t, total: r.total, employee: e, rules: R(), requests: S().requests, startDate: r.startDate, excludeId: id, split: r.split !== false });
  const bal = e[field] || 0;
  const after = w ? round2(bal + p.paid) : p.fromBalance ? round2(bal - p.paid) : bal;
  modal(approve ? (w ? "الموافقة على سحب الإجازة" : "تأكيد الموافقة") : "رفض الطلب", approve ? `
    <p>${w ? `سحب إجازة <b>${esc(r.typeName)}</b> (طلب ${esc(r.originalSerial)})` : `إجازة <b>${esc(r.typeName)}</b>`} لـ <b>${esc(r.employeeName)}</b> — ${days(r.total)}.</p>
    <div class="confirm-grid"><div><span>الرصيد الآن</span><b>${days(bal)}</b></div><div><span>${w ? "يرجع" : "يُخصم"}</span><b>${days(p.paid)}</b></div><div><span>الرصيد بعد</span><b>${days(after)}</b></div></div>
    ${!w ? `<div class="pay pay-${p.pay}"><span>${PAY[p.pay]}</span>${["partial", "mixed"].includes(p.pay) ? `<em>${payText(p)}</em>` : ""}</div>` : ""}
    <label>ملاحظة (اختياري)<input name="note"></label>` : `
    <p>رفض ${w ? "طلب سحب" : "طلب"} <b>${esc(r.employeeName)}</b> (${esc(r.typeName)} · ${days(r.total)}). لا يتغير الرصيد.</p>
    <label>سبب الرفض<textarea name="note" rows="3" required></textarea></label>`,
    async (d) => {
      await store.decideRequest(id, approve, d.note);
      if (!approve) { toast("تم رفض الطلب"); return; }
      return () => modal(w ? "تمت الموافقة على السحب" : "تمت الموافقة", `
        <div class="done"><i data-lucide="badge-check"></i><p>${w ? `أُرجع ${days(p.paid)} لرصيد ${esc(r.employeeName)}.` : `انخصم ${days(p.paid)} من رصيد ${esc(r.employeeName)}.`}<br>الاستمارة محفوظة بصفحة الاستمارات.</p>
        <a class="btn primary block" href="#/form/${id}" data-close><i data-lucide="printer"></i>فتح الاستمارة وطباعتها</a></div>`, null);
    },
    approve ? "موافقة" : "رفض", approve ? "" : "danger");
}

function withdrawModal(id) {
  const r = S().requests.find((x) => x.id === id);
  modal("طلب سحب إجازة", `
    <p>سحب إجازة <b>${esc(r.typeName)}</b> لـ <b>${esc(r.employeeName)}</b> (طلب ${esc(r.serial)} · ${days(r.total)} · ${fmtDate(r.startDate)}).</p>
    <div class="note">يروح الطلب للمعاون الإداري. إذا وافق، ترجع ${days(r.deducts === "none" ? 0 : r.paid || 0)} للرصيد وتصير الإجازة "مسحوبة".</div>
    <label>سبب السحب<textarea name="reason" rows="2" required placeholder="مثال: طلب الموظف إلغاء الإجازة"></textarea></label>`,
    async (d) => { await store.createWithdrawal(id, d.reason); toast("أُرسل طلب السحب إلى المعاون الإداري"); }, "إرسال طلب السحب");
}

function userModal() {
  modal("حساب جديد", `
    <label>الاسم<input name="name" required></label>
    <div class="row"><label>اسم المستخدم<input name="username" required dir="ltr" pattern="[a-zA-Z0-9._-]+" title="حروف إنكليزية وأرقام فقط" autocapitalize="none"></label>
    <label>كلمة المرور<input name="password" type="password" required minlength="8" dir="ltr" autocomplete="new-password"></label></div>
    <label>الصلاحية<select name="role"><option value="admin">مسؤول الإجازات (يقدم ويحذف ويسحب)</option><option value="assistant">المعاون الإداري (يوافق ويرفض)</option></select></label>`,
    async (d) => { await store.createUser({ ...d, username: d.username.toLowerCase() }); toast("تم إنشاء الحساب"); }, "إنشاء");
}

function accountModal() {
  const u = S().user;
  modal("حسابي", `<p><b>${esc(u.name)}</b> · ${ROLES[u.role]} · <span dir="ltr">${esc(u.username)}</span></p>
    <label>كلمة مرور جديدة<input name="pw" type="password" minlength="8" required dir="ltr" autocomplete="new-password"></label>
    <label>تأكيدها<input name="pw2" type="password" minlength="8" required dir="ltr" autocomplete="new-password"></label>`,
    async (d) => {
      if (d.pw !== d.pw2) throw new Error("كلمتا المرور غير متطابقتين");
      try { await store.changePassword(d.pw); } catch (e) { throw new Error(e.code === "auth/requires-recent-login" ? "لأمان الحساب: اطلع وادخل من جديد ثم غيّر كلمة المرور" : e.message); }
      toast("تم تغيير كلمة المرور");
    }, "تغيير كلمة المرور");
}

function importModal() {
  modal("استيراد المنتسبين من Excel", `
    <ol class="steps"><li>نزّل القالب واملأ الاسم والصنف (تدريسي / موظف) والرصيدين.</li><li>ارفع الملف وراجع العدد قبل التأكيد.</li></ol>
    <button type="button" class="btn sm" id="tplBtn"><i data-lucide="download"></i>تنزيل القالب</button>
    <label>الملف<input type="file" id="impFile" accept=".xlsx,.xls,.csv" required></label>
    <div id="impPreview" class="muted"></div>`,
    async (_, f) => {
      if (!f._rows?.length) throw new Error("اختر ملفاً صالحاً");
      await store.importEmployees(f._rows); toast(`تم استيراد ${f._rows.length} منتسب`);
    }, "استيراد");
  $("#tplBtn").onclick = importTemplate;
  $("#impFile").onchange = async (ev) => {
    const f = ev.target.closest("form");
    try {
      const { rows, skipped } = await readImport(ev.target.files[0]);
      f._rows = rows;
      $("#impPreview").innerHTML = `سيتم استيراد <b>${rows.length}</b> منتسب (${rows.filter((r) => r.category === "teaching").length} تدريسي، ${rows.filter((r) => r.category === "staff").length} موظف)${skipped ? ` — تجاهل ${skipped} صف` : ""}.`;
    } catch (e) { $("#impPreview").textContent = e.message; }
  };
}

/* ------------------------------ helpers ------------------------------ */
function toast(msg, kind = "ok", href) {
  const t = document.createElement(href ? "a" : "div");
  t.className = `toast ${kind}`; t.textContent = msg; if (href) t.href = href;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("out"), href ? 6000 : 2600);
  setTimeout(() => t.remove(), href ? 6400 : 3000);
}
function icons() { window.lucide && window.lucide.createIcons({ attrs: { "stroke-width": 1.75 } }); }
async function fileToLogo(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const k = Math.min(1, 320 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

/* ------------------------------ actions ------------------------------ */
document.addEventListener("click", async (ev) => {
  const go = ev.target.closest("[data-go]");
  if (go && !ev.target.closest("a,button")) { location.hash = go.dataset.go; return; }
  const seg = ev.target.closest("[data-seg] button");
  if (seg) { ui[seg.parentElement.dataset.seg] = seg.dataset.v; render(); return; }
  const b = ev.target.closest("[data-act]");
  if (!b) return;
  const { act, id, v } = b.dataset;
  try {
    switch (act) {
      case "logout": await store.logout(); location.hash = ""; break;
      case "account": accountModal(); break;
      case "enable-notify": {
        const p = await enableNotifications();
        if (p === "denied") toast("الإشعارات محظورة — فعّلها من إعدادات المتصفح لهذا الموقع", "bad");
        else if (p === "unsupported") toast("هذا المتصفح لا يدعم الإشعارات — على الآيفون أضف الموقع للشاشة الرئيسية أولاً", "bad");
        render(); break;
      }
      case "calc-fill-gap": {
        const g = calcGap(); if (!g) break;
        const rows = [];
        if (g.ord > 0) rows.push({ ...newCalcRow("ordinary"), days: String(g.ord), note: "إجازات سابقة غير مفصلة" });
        if (g.sick > 0) rows.push({ ...newCalcRow("sick"), days: String(g.sick), note: "إجازات مرضية سابقة غير مفصلة" });
        ui.calc.saved = rows; ui.calc.dirty = true; render(); toast("انضاف الفرق للقائمة — اضغط \"حفظ الإجازات فقط\" حتى ينحفظ"); break;
      }
      case "calc-type": { const r = ui.calc.rows[0]; r.type = v; if (CALC_TYPES[v].input !== "period") r.to = ""; redrawCalcLists(); $("#calcRows input[data-k=from]")?.focus(); break; }
      case "calc-commit": {
        const r = ui.calc.rows[0], was = ui.calc.editIdx != null;
        const prob = draftProblem(r); if (prob) { toast(prob, "bad"); $("#calcRows input:not([value]):not([data-k=note]), #calcRows input[value='']:not([data-k=note])")?.focus(); break; }
        commitDrafts(); redrawCalcLists(); toast(was ? "انحفظ التعديل بالقائمة" : "انضافت الإجازة للقائمة"); break;
      }
      case "calc-cancel-edit": {
        const c = ui.calc; if (c.editIdx == null) break;
        c.editIdx = null; c.rows = [newCalcRow(c.rows[0].type)]; redrawCalcLists(); break;
      }
      case "calc-edit-saved": {
        const c = ui.calc;
        const i = Number(id);
        c.editIdx = i; c.rows = [{ ...c.saved[i] }];
        redrawCalcLists(); $("#calcRows")?.scrollIntoView({ behavior: "smooth", block: "center" }); break;
      }
      case "calc-del-saved": {
        const c = ui.calc, i = Number(id), r = c.saved[i];
        if (!confirm(`حذف الإجازة رقم ${i + 1} (${typeName(r.type)})؟\nتنحذف نهائياً بعد ما تضغط حفظ.`)) break;
        c.saved.splice(i, 1); c.dirty = true;
        if (c.editIdx === i) { c.editIdx = null; c.rows = [newCalcRow(r.type)]; } else if (c.editIdx > i) c.editIdx--;
        redrawCalcLists(); break;
      }
      case "calc-add-row": ui.calc.rows.push(newCalcRow(v || "ordinary")); $("#calcRows").innerHTML = calcRows(); icons(); refreshCalc(); break;
      case "calc-del-row": { const rr = ui.calc.rows[Number(id)]; if ((rr.days || rr.hours || rr.from || rr.note) && !confirm(`مسح هذا السطر (${typeName(rr.type)})؟`)) break; }
        ui.calc.rows.splice(Number(id), 1); if (!ui.calc.rows.length) ui.calc.rows.push(newCalcRow()); $("#calcRows").innerHTML = calcRows(); icons(); refreshCalc(); break;
      case "calc-apply": {
        commitDrafts();
        const d = calcData(), e = empById(ui.calc.empId);
        const nb = Math.max(0, d.final), ns = Math.max(0, d.sickLeft);
        const dB = round2(nb - (e.balance || 0)), dS = round2(ns - (e.sick || 0));
        if (!dB && !dS) { await store.saveCalc(e.id, calcSnapshot(d)); ui.calc.dirty = false; redrawCalcLists(); toast("الرصيد مطابق — انحفظت تفاصيل الإجازات"); break; }
        if (!confirm(`تحديد رصيد ${e.name}:\nالاعتيادي ${nb} يوم (بدل ${num(e.balance)})\nالمرضي ${ns} يوم (بدل ${num(e.sick || 0)})\nينسجل بحركة الرصيد.`)) break;
        const why = `احتساب من تاريخ المباشرة ${fmtDate(ui.calc.start)}${d.paused ? ` (موقوف ${d.paused} يوم)` : ""}`;
        if (dB) await store.adjustBalance(e.id, "balance", dB, `${why}: مستحق ${d.ordinary} − مأخوذ ${d.taken}`);
        if (dS) await store.adjustBalance(e.id, "sick", dS, `${why}: مرضي مستحق ${d.sick} − مأخوذ ${d.sickTaken}`);
        await store.saveCalc(e.id, calcSnapshot(d)); ui.calc.dirty = false;
        toast("تم اعتماد الرصيد وحفظ تفاصيل الإجازات"); redrawCalcLists(); break;
      }
      case "calc-save": {
        commitDrafts();
        const e = empById(ui.calc.empId), d = calcData();
        await store.saveCalc(e.id, calcSnapshot(d)); ui.calc.dirty = false; redrawCalcLists();
        toast(`انحفظت تفاصيل إجازات ${e.name}`); break;
      }
      case "calc-add-emp": {
        commitDrafts();
        const c = ui.calc, d = calcData();
        if (!c.name.trim()) { toast("اكتب اسم المنتسب أولاً", "bad"); $("#calcForm [name=name]")?.focus(); break; }
        if (S().employees.some((x) => x.name.trim() === c.name.trim())) { if (!confirm("يوجد منتسب بنفس الاسم. تضيفه رغم ذلك؟")) break; }
        if (!confirm(`إضافة ${c.name} (${CATEGORIES[c.category]}) برصيد اعتيادي ${Math.max(0, d.final)} ومرضي ${Math.max(0, d.sickLeft)} يوم؟`)) break;
        await store.saveEmployee({ name: c.name, category: c.category, title: c.title, department: c.department, empNo: c.empNo, startDate: c.start, calc: calcSnapshot(d),
          notes: `مباشرة ${fmtDate(c.start)} — الرصيد محسوب بالحاسبة${d.paused ? `، موقوف ${d.paused} يوم` : ""}`,
          balance: Math.max(0, d.final), sick: Math.max(0, d.sickLeft) });
        toast(`تمت إضافة ${c.name}`);
        ui.calc = { empId: "", category: c.category, start: "", asOf: today(), name: "", title: "", department: "", empNo: "", saved: [], rows: [newCalcRow()] };
        render(); break;
      }
      case "add-emp": employeeModal(); break;
      case "edit-emp": employeeModal(empById(id)); break;
      case "adjust": adjustModal(id); break;
      case "archive": if (confirm(v === "1" ? "إعادة تفعيل المنتسب؟" : "أرشفة المنتسب؟ يبقى سجله محفوظاً، ويختفي من القوائم، وما ينضافله استحقاق.")) { await store.archiveEmployee(id, v === "1"); toast(v === "1" ? "تمت إعادة التفعيل" : "تمت الأرشفة"); } break;
      case "import": importModal(); break;
      case "delete-emp": {
        const e = empById(id);
        if (!confirm(`حذف ${e.name} نهائياً من النظام؟\nإذا انتقل أو تقاعد استخدم "أرشفة" بدلاً من الحذف حتى يبقى سجله ظاهراً.`)) break;
        await store.deleteEmployee(id); toast("تم حذف المنتسب"); location.hash = "#/employees"; break;
      }
      case "approve": decideModal(id, true); break;
      case "reject": decideModal(id, false); break;
      case "withdraw": withdrawModal(id); break;
      case "delete-req": if (confirm("حذف هذا الطلب؟ يختفي من القوائم ويبقى محفوظاً بسجل التدقيق.")) { await store.deleteRequest(id); toast("تم حذف الطلب"); } break;
      case "print": window.print(); break;
      case "export-all": toast("جارٍ تجهيز ملف Excel…"); exportAll({ ...S(), requests: visibleRequests(), ledger: await store.loadLedger() }); break;
      case "export-emp": exportEmployee({ ...S(), requests: visibleRequests(), ledger: await store.loadLedger(id) }, id); break;
      case "export-reqs": exportRequests(filteredRequests()); break;
      case "add-user": userModal(); break;
      case "user-active": await store.setUserActive(id, v === "1"); toast(v === "1" ? "تم تفعيل الحساب" : "تم إيقاف الحساب"); break;
      case "logo-clear": await store.saveSettings({ logo: "" }); break;
      case "backup": {
        const s = S();
        const data = { exportedAt: new Date().toISOString(), employees: s.employees, requests: s.requests, ledger: await store.loadLedger(), users: s.users, settings: s.settings };
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        a.download = `leave-backup-${today()}.json`; a.click(); break;
      }
    }
  } catch (e) { toast(e.message || "حدث خطأ", "bad"); }
});

document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.id === "empSearch") { ui.empSearch = t.value; $("#empTable").innerHTML = employeeTable(); }
  if (t.id === "reqSearch") { ui.reqFilter.q = t.value.trim(); $("#reqTable").innerHTML = requestsTable(filteredRequests()); icons(); }
  if (t.closest && t.closest("#calcForm")) {
    const row = t.closest(".calc-draft");
    if (row) {
      const r = ui.calc.rows[Number(row.dataset.i)];
      r[t.dataset.k] = t.value;
      if (t.dataset.k === "type" || t.dataset.k === "from" || t.dataset.k === "to" || t.dataset.k === "hours") {
        if (t.dataset.k === "type") { $("#calcRows").innerHTML = calcRows(); icons(); }
        else { const span = row.querySelector(".calc-days"); const tp = CALC_TYPES[r.type];
          if (span && tp.input === "period") span.textContent = periodDays(r.from, r.to) ? `${periodDays(r.from, r.to)} يوم` : "—";
          if (span && tp.input === "hours") span.textContent = r.hours ? `${num(round2((Number(r.hours) || 0) / R().hoursPerDay))} يوم` : "—";
          if (t.dataset.k === "from") setDateMin(row.querySelector("[data-k=to]"), r.from); }
      }
    } else if (t.name && t.name !== "empId") ui.calc[t.name] = t.value;
    refreshCalc();
  }
  if (t.id === "formsSearch") { ui.formsQ = t.value; $("#formsList").innerHTML = formsList(); }
});
document.addEventListener("change", async (ev) => {
  const t = ev.target;
  if (t.name === "empId" && t.closest("#calcForm")) {
    const e = empById(t.value);
    if (e) loadCalcFor(e); else { ui.calc.empId = ""; ui.calc.saved = []; ui.calc.dirty = false; ui.calc.editIdx = null; }
    render();
  }
  if (t.dataset.f) { ui.reqFilter[t.dataset.f] = t.value; $("#reqTable").innerHTML = requestsTable(filteredRequests()); icons(); }
  if (t.id === "logoFile" && t.files[0]) { try { await store.saveSettings({ logo: await fileToLogo(t.files[0]) }); toast("تم حفظ الشعار"); } catch (e) { toast(e.message, "bad"); } }
});
document.addEventListener("submit", async (ev) => {
  if (ev.target.id === "rulesForm") {
    ev.preventDefault();
    const f = ev.target, g = (n) => Number(f.elements[n].value) || 0;
    const cur = R();
    const rules = {
      version: cur.version, hoursPerDay: g("hoursPerDay") || 7, sickAnnual: g("sickAnnual"), excludeWeekends: f.elements.excludeWeekends.checked,
      weekendDays: cur.weekendDays, academicYearStartMonth: g("academicYearStartMonth") || 9,
      categories: {
        staff: { ...cur.categories.staff, amount: g("staff.amount"), maxPaidPerLeave: g("staff.maxPaidPerLeave"), maxUnpaidPerLeave: g("staff.maxUnpaidPerLeave") },
        teaching: { ...cur.categories.teaching, amount: g("teaching.amount"), maxPaidPerYear: g("teaching.maxPaidPerYear"), maxUnpaidPerLeave: g("teaching.maxUnpaidPerLeave") }
      }
    };
    try { await store.saveSettings({ rules }); toast("تم حفظ القوانين"); } catch (e) { toast(e.message, "bad"); }
  }
  if (ev.target.id === "collegeForm") {
    ev.preventDefault();
    try { await store.saveSettings({ university: ev.target.university.value.trim() }); toast("تم الحفظ"); } catch (e) { toast(e.message, "bad"); }
  }
});

/* ------------------------------ router ------------------------------ */
function render() {
  const s = S();
  if (!s.ready) return;
  if (!s.user) { document.body.classList.remove("form-page"); return loginView(); }
  const [path, qs] = (location.hash.slice(2) || (isAssistant() ? "inbox" : "dashboard")).split("?");
  const [page, arg] = path.split("/");
  const params = new URLSearchParams(qs || "");
  const views = {
    dashboard, employees: employeesView, employee: () => employeeView(arg), inbox: inboxView, requests: requestsView,
    forms: formsView, form: () => formView(arg), statement: () => statementView(arg),
    new: () => (isAdmin() ? newRequestView(params) : inboxView()), settings: () => (isSuper() ? settingsView() : dashboard()),
    calc: () => (isSuper() ? calcView(params) : dashboard())
  };
  const y = window.scrollY;
  app.innerHTML = (views[page] || dashboard)();
  document.body.classList.toggle("form-page", page === "form" || page === "statement");
  document.body.classList.toggle("calc-page", page === "calc");
  window.scrollTo(0, y);
  if (page === "new") wireNewRequest();
  if (page === "employee") fillLedger(arg);
  icons();
  const pend = visibleRequests().filter((r) => r.status === "pending").length;
  document.title = `${pend ? `(${pend}) ` : ""}${COLLEGE.system} — ${COLLEGE.name}`;
}

/* ------------------------- notifications ------------------------- */
let prev = null, prevUser = null;
function notifyChanges() {
  const s = S();
  if (!s.user) { prev = null; return; }
  if (prevUser !== s.user.uid) { prev = null; prevUser = s.user.uid; }
  if (!s.synced) return;
  const cur = new Map(s.requests.map((r) => [r.id, r.status]));
  if (prev) {
    for (const r of s.requests) {
      const was = prev.get(r.id);
      // المعاون الإداري: وصل طلب جديد
      if (isAssistant() && !was && r.status === "pending" && !r.deleted) {
        const w = r.kind === "withdrawal";
        notify(w ? "طلب سحب إجازة" : "طلب إجازة جديد", `${r.employeeName} — ${r.typeName} (${num(r.total)} يوم)`, "#/inbox", r.id);
        toast(`${w ? "طلب سحب" : "طلب جديد"}: ${r.employeeName}`, "ok", "#/inbox");
      }
      // مسؤول الإجازات / السوبر أدمن: المعاون قرر
      if (isAdmin() && was === "pending" && (r.status === "approved" || r.status === "rejected")) {
        const ok = r.status === "approved", w = r.kind === "withdrawal";
        const title = `${ok ? "وافق" : "رفض"} المعاون الإداري ${w ? "على سحب إجازة" : "على إجازة"}`;
        const url = ok ? `#/form/${r.id}` : "#/requests";
        notify(title, `${r.employeeName} — ${r.typeName} (${num(r.total)} يوم)${r.decisionNote ? " · " + r.decisionNote : ""}`, url, r.id + r.status);
        toast(`${title}: ${r.employeeName}`, ok ? "ok" : "bad", url);
      }
    }
  }
  prev = cur;
}

let timer;
subscribe(() => {
  notifyChanges();
  if (document.querySelector(".modal-bg")) return;
  if (location.hash.startsWith("#/new") && $("#reqForm")) { clearTimeout(timer); timer = setTimeout(refreshSummary, 30); return; }
  const a = document.activeElement;
  if (location.hash.startsWith("#/calc") && $("#calcForm")) { clearTimeout(timer); timer = setTimeout(refreshCalc, 30); return; }
  if (a && ["empSearch", "reqSearch", "formsSearch"].includes(a.id)) { if ($("#empTable")) $("#empTable").innerHTML = employeeTable(); return; }
  clearTimeout(timer); timer = setTimeout(render, 30);
});
window.addEventListener("hashchange", render);

(async () => {
  initNotifications();
  initDatePickers();
  try { await initStore(); }
  catch (e) { app.innerHTML = `<div class="login"><div class="login-card"><h1>تعذر تحميل النظام</h1><p>${esc(e.message)}</p><p class="muted small">تأكد من الاتصال بالإنترنت وأعد تحميل الصفحة.</p></div></div>`; return; }
  render();
})();
