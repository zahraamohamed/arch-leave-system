import { initStore, store, getState, subscribe, isLive } from "./store.js";
import { COLLEGE } from "./config.js";
import { CATEGORIES, STATUS, PAY, ROLES, countDays, requestDays, payPlan, round2 } from "./rules.js";
import { exportAll, exportEmployee, exportRequests, importTemplate, readImport } from "./excel.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $("#app");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => { const x = round2(Number(n) || 0); return Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0$/, ""); };
const days = (n) => `${num(n)} يوم`;
const fmtDate = (iso) => iso ? new Date(iso.length <= 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-GB") : "—";
const fmtDT = (iso) => iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—";
const today = () => new Date().toISOString().slice(0, 10);
const S = () => getState();
const isAdmin = () => S().user?.role === "admin";
const typeOf = (key) => S().settings.rules.types.find((t) => t.key === key);
const empById = (id) => S().employees.find((e) => e.id === id);
const ruleText = (cat) => {
  const c = S().settings.rules.categories[cat];
  if (!c) return "";
  return c.accrual === "monthly"
    ? `${num(c.amount)} أيام تنزل كل شهر${c.accumulate ? " وتتراكم" : ""}`
    : `${num(c.amount)} يوم بالسنة${c.accumulate ? " وتتراكم" : " فقط"}`;
};

let lastPendingIds = null;
const ui = { empFilter: "all", empSearch: "", reqFilter: { status: "all", cat: "all", q: "" }, newReq: {} };

/* -------------------------------- shell -------------------------------- */
function logoHTML(size = 44) {
  const src = S().settings.logo || "assets/logo.png";
  return `<span class="logo" style="--s:${size}px"><img src="${esc(src)}" alt="شعار الكلية" onerror="this.remove()"><span class="logo-fallback">ك.ع</span></span>`;
}

function shell(content, active) {
  const pending = S().requests.filter((r) => r.status === "pending").length;
  const nav = [
    ["dashboard", "الرئيسية", "layout-dashboard"],
    ["inbox", isAdmin() ? "الطلبات المعلقة" : "الطلبات الواردة", "inbox", pending],
    isAdmin() && ["new", "طلب إجازة جديد", "file-plus-2"],
    ["employees", "المنتسبون", "users"],
    ["requests", "سجل الإجازات", "history"],
    isAdmin() && ["settings", "الإعدادات", "settings"]
  ].filter(Boolean);
  const u = S().user;
  const sync = !S().online ? ["offline", "غير متصل — التعديلات محفوظة وتُرفع تلقائياً"] : S().synced ? ["ok", "متزامن"] : ["busy", "جارٍ المزامنة…"];
  return `
  ${isLive ? "" : `<div class="demo-bar">وضع تجريبي — البيانات محفوظة بهذا المتصفح فقط لحين ربط قاعدة البيانات</div>`}
  <header class="top">
    <div class="brand">${logoHTML(42)}<div><div class="brand-t">${esc(COLLEGE.name)}</div><div class="brand-s">${esc(S().settings.university || COLLEGE.system)}</div></div></div>
    <div class="top-end">
      <span class="sync ${sync[0]}" title="${sync[1]}"><i></i>${sync[1]}</span>
      <div class="me"><div class="me-n">${esc(u.name)}</div><div class="me-r">${ROLES[u.role]}</div></div>
      <button class="btn ghost sm" data-act="logout"><i data-lucide="log-out"></i>خروج</button>
    </div>
  </header>
  <div class="layout">
    <nav class="side">
      ${nav.map(([k, t, ic, b]) => `<a href="#/${k}" class="${active === k ? "on" : ""}"><i data-lucide="${ic}"></i><span>${t}</span>${b ? `<b class="badge">${b}</b>` : ""}</a>`).join("")}
    </nav>
    <main class="main">${content}</main>
  </div>`;
}

/* ------------------------------ login ------------------------------ */
function loginView(bootstrap) {
  app.innerHTML = `
  <div class="login">
    <form class="login-card" id="loginForm" autocomplete="on">
      <div class="login-head">${logoHTML(76)}<h1>${esc(COLLEGE.name)}</h1><p>${COLLEGE.system}${S().settings.university ? " — " + esc(S().settings.university) : ""}</p></div>
      ${bootstrap ? `<div class="note">أول تشغيل: أنشئ حساب مسؤول النظام.</div>
        <label>الاسم الكامل<input name="name" required></label>` : ""}
      <label>اسم المستخدم<input name="username" required autocomplete="username" dir="ltr"></label>
      <label>كلمة المرور<input name="password" type="password" required minlength="6" autocomplete="${bootstrap ? "new-password" : "current-password"}" dir="ltr"></label>
      <div class="err" id="loginErr"></div>
      <button class="btn primary block" type="submit">${bootstrap ? "إنشاء الحساب والدخول" : "تسجيل الدخول"}</button>
      ${isLive ? "" : `<div class="hint">تجربة: <b dir="ltr">admin / admin123</b> لمسؤول النظام — <b dir="ltr">assistant / assist123</b> للمعاون الإداري</div>`}
    </form>
  </div>`;
  $("#loginForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target));
    const btn = ev.target.querySelector("button"); btn.disabled = true;
    try {
      if (bootstrap) await store.bootstrap(f); else await store.login(f.username, f.password);
      location.hash = S().user?.role === "assistant" ? "#/inbox" : "#/dashboard";
    } catch (e) {
      $("#loginErr").textContent = /invalid|wrong|user-not-found|credential/.test(e.code || "") ? "اسم المستخدم أو كلمة المرور غير صحيحة" : (e.message || "تعذر الدخول");
      btn.disabled = false;
    }
  };
}

/* ---------------------------- dashboard ---------------------------- */
function dashboard() {
  const st = S();
  const emps = st.employees.filter((e) => e.active !== false);
  const teach = emps.filter((e) => e.category === "teaching"), staff = emps.filter((e) => e.category === "staff");
  const pending = st.requests.filter((r) => r.status === "pending");
  const ym = today().slice(0, 7);
  const approved = st.requests.filter((r) => r.status === "approved");
  const monthDays = approved.filter((r) => (r.startDate || "").slice(0, 7) === ym).reduce((a, r) => a + (r.total || 0), 0);
  const t = today();
  const onLeave = approved.filter((r) => r.startDate <= t && (r.endDate || r.startDate) >= t);
  const low = emps.filter((e) => (e.balance || 0) < 3).sort((a, b) => a.balance - b.balance);
  const avg = (l) => l.length ? l.reduce((a, e) => a + (e.balance || 0), 0) / l.length : 0;

  return shell(`
    <div class="page-head"><div><h2>لوحة الأرصدة</h2><p>صورة لحظية لأرصدة الإجازات لكل التدريسيين والموظفين.</p></div>
      <div class="actions">
        ${isAdmin() ? `<a class="btn primary" href="#/new"><i data-lucide="file-plus-2"></i>طلب إجازة</a>` : ""}
        <button class="btn" data-act="export-all"><i data-lucide="file-spreadsheet"></i>تنزيل Excel</button>
      </div></div>

    <section class="kpis">
      <div class="kpi"><span>المنتسبون</span><strong>${emps.length}</strong><em>${teach.length} تدريسي · ${staff.length} موظف</em></div>
      <a class="kpi ${pending.length ? "warn" : ""}" href="#/inbox"><span>بانتظار المعاون الإداري</span><strong>${pending.length}</strong><em>طلب</em></a>
      <div class="kpi"><span>إجازات هذا الشهر</span><strong>${num(monthDays)}</strong><em>يوم موافق عليه</em></div>
      <div class="kpi"><span>في إجازة اليوم</span><strong>${onLeave.length}</strong><em>${fmtDate(t)}</em></div>
    </section>

    <section class="grid-2">
      <div class="card">
        <div class="card-h"><h3>أرصدة المنتسبين</h3>
          <div class="seg" data-seg="empFilter">${[["all", "الكل"], ["teaching", "التدريسيون"], ["staff", "الموظفون"]].map(([k, l]) => `<button class="${ui.empFilter === k ? "on" : ""}" data-v="${k}">${l}</button>`).join("")}</div>
        </div>
        <div class="search"><i data-lucide="search"></i><input id="empSearch" placeholder="ابحث بالاسم أو القسم أو الرقم الوظيفي" value="${esc(ui.empSearch)}"></div>
        <div id="empTable">${employeeTable()}</div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-h"><h3>متوسط الرصيد</h3></div>
          <div class="avg"><div><span>التدريسي</span><strong>${days(avg(teach))}</strong><em>${ruleText("teaching")}</em></div>
          <div><span>الموظف</span><strong>${days(avg(staff))}</strong><em>${ruleText("staff")}</em></div></div>
        </div>
        <div class="card">
          <div class="card-h"><h3>في إجازة اليوم</h3></div>
          ${onLeave.length ? `<ul class="list">${onLeave.map((r) => `<li><a href="#/employee/${r.employeeId}">${esc(r.employeeName)}</a><span>${esc(r.typeName)} · لغاية ${fmtDate(r.endDate || r.startDate)}</span></li>`).join("")}</ul>` : `<p class="empty">لا يوجد أحد في إجازة اليوم.</p>`}
        </div>
        <div class="card">
          <div class="card-h"><h3>رصيد منخفض</h3><span class="muted">أقل من 3 أيام</span></div>
          ${low.length ? `<ul class="list">${low.slice(0, 8).map((e) => `<li><a href="#/employee/${e.id}">${esc(e.name)}</a><span class="${e.balance <= 0 ? "neg" : ""}">${days(e.balance)}</span></li>`).join("")}</ul>` : `<p class="empty">كل الأرصدة جيدة.</p>`}
        </div>
      </div>
    </section>`, "dashboard");
}

function filteredEmployees() {
  const q = ui.empSearch.trim();
  return S().employees
    .filter((e) => e.active !== false)
    .filter((e) => ui.empFilter === "all" || e.category === ui.empFilter)
    .filter((e) => !q || [e.name, e.department, e.empNo, e.title].some((v) => (v || "").includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

function employeeTable() {
  const list = filteredEmployees();
  if (!list.length) return `<p class="empty">${S().employees.length ? "لا توجد نتائج مطابقة." : "لم تتم إضافة منتسبين بعد."}</p>`;
  const lastLeave = (id) => S().requests.find((r) => r.employeeId === id && r.status === "approved");
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>الاسم</th><th>الصنف</th><th class="hide-m">القسم / الشعبة</th><th class="n">الرصيد</th><th class="hide-m">آخر إجازة</th></tr></thead>
    <tbody>${list.map((e) => { const l = lastLeave(e.id); return `
      <tr data-go="#/employee/${e.id}">
        <td><b>${esc(e.name)}</b>${e.title ? `<div class="sub">${esc(e.title)}</div>` : ""}</td>
        <td><span class="tag ${e.category}">${CATEGORIES[e.category]}</span></td>
        <td class="hide-m">${esc(e.department) || "—"}</td>
        <td class="n"><span class="bal ${e.balance <= 0 ? "neg" : e.balance < 3 ? "low" : ""}">${num(e.balance)}</span> <small>يوم</small></td>
        <td class="hide-m">${l ? `${esc(l.typeName)} · ${fmtDate(l.startDate)}` : "—"}</td>
      </tr>`; }).join("")}</tbody></table></div>`;
}

/* ---------------------------- employees ---------------------------- */
function employeesView() {
  return shell(`
    <div class="page-head"><div><h2>المنتسبون</h2><p>${S().employees.filter((e) => e.active !== false).length} منتسب مسجل.</p></div>
      <div class="actions">
        ${isAdmin() ? `<button class="btn primary" data-act="add-emp"><i data-lucide="user-plus"></i>إضافة منتسب</button>
        <button class="btn" data-act="import"><i data-lucide="upload"></i>استيراد من Excel</button>` : ""}
        <button class="btn" data-act="export-all"><i data-lucide="file-spreadsheet"></i>تنزيل Excel</button>
      </div></div>
    <div class="card">
      <div class="card-h"><div class="seg" data-seg="empFilter">${[["all", "الكل"], ["teaching", "التدريسيون"], ["staff", "الموظفون"]].map(([k, l]) => `<button class="${ui.empFilter === k ? "on" : ""}" data-v="${k}">${l}</button>`).join("")}</div></div>
      <div class="search"><i data-lucide="search"></i><input id="empSearch" placeholder="ابحث بالاسم أو القسم أو الرقم الوظيفي" value="${esc(ui.empSearch)}"></div>
      <div id="empTable">${employeeTable()}</div>
    </div>`, "employees");
}

function employeeView(id) {
  const e = empById(id);
  if (!e) return shell(`<p class="empty">المنتسب غير موجود.</p>`, "employees");
  const reqs = S().requests.filter((r) => r.employeeId === id);
  const y = String(new Date().getFullYear());
  const yr = reqs.filter((r) => r.status === "approved" && (r.startDate || "").startsWith(y));
  const paidY = yr.reduce((a, r) => a + (r.paid || 0), 0), unpaidY = yr.reduce((a, r) => a + (r.unpaid || 0), 0);
  return shell(`
    <div class="page-head"><div><a class="back" href="#/employees">← المنتسبون</a><h2>${esc(e.name)}</h2>
      <p><span class="tag ${e.category}">${CATEGORIES[e.category]}</span> ${esc([e.title, e.department, e.empNo && "رقم " + e.empNo].filter(Boolean).join(" · "))}${e.active === false ? ` <span class="tag off">مؤرشف</span>` : ""}</p></div>
      <div class="actions">
        ${isAdmin() ? `<a class="btn primary" href="#/new?emp=${e.id}"><i data-lucide="file-plus-2"></i>طلب إجازة</a>
        <button class="btn" data-act="adjust" data-id="${e.id}"><i data-lucide="plus-minus"></i>تعديل الرصيد</button>
        <button class="btn" data-act="edit-emp" data-id="${e.id}"><i data-lucide="pencil"></i>تعديل</button>` : ""}
        <button class="btn" data-act="export-emp" data-id="${e.id}"><i data-lucide="file-spreadsheet"></i>Excel</button>
      </div></div>
    <section class="kpis">
      <div class="kpi big"><span>الرصيد الحالي</span><strong class="${e.balance <= 0 ? "neg" : ""}">${num(e.balance)}</strong><em>يوم — ${ruleText(e.category)}</em></div>
      <div class="kpi"><span>براتب هذه السنة</span><strong>${num(paidY)}</strong><em>يوم</em></div>
      <div class="kpi"><span>بدون راتب هذه السنة</span><strong>${num(unpaidY)}</strong><em>يوم</em></div>
      <div class="kpi"><span>آخر استحقاق</span><strong class="sm">${esc(e.accruedThrough || "—")}</strong><em>شهر</em></div>
    </section>
    <section class="grid-2 even">
      <div class="card"><div class="card-h"><h3>الإجازات</h3></div>${requestsTable(reqs, true)}</div>
      <div class="card"><div class="card-h"><h3>حركة الرصيد</h3></div><div id="ledgerBox"><p class="empty">جارٍ التحميل…</p></div>
      </div>
    </section>
    ${isAdmin() ? `<div class="danger-zone"><button class="btn ghost sm" data-act="archive" data-id="${e.id}" data-v="${e.active === false ? 1 : 0}">${e.active === false ? "إعادة تفعيل المنتسب" : "أرشفة المنتسب (نقل / تقاعد)"}</button></div>` : ""}`, "employees");
}

async function fillLedger(id) {
  const box = $("#ledgerBox"); if (!box) return;
  const led = await store.loadLedger(id);
  if (!$("#ledgerBox")) return;
  $("#ledgerBox").innerHTML = led.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>البيان</th><th class="n">التغيير</th><th class="n">الرصيد</th></tr></thead><tbody>
    ${led.map((l) => `<tr><td>${fmtDT(l.at)}</td><td>${esc(l.reason)}<div class="sub">${esc(l.byName || "")}</div></td><td class="n ${l.delta < 0 ? "neg" : "pos"}">${l.delta > 0 ? "+" : ""}${num(l.delta)}</td><td class="n">${num(l.after)}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="empty">لا توجد حركات.</p>`;
}

/* ---------------------------- new request ---------------------------- */
function newRequestView(params) {
  const nr = ui.newReq;
  if (params.get("emp") && nr.employeeId !== params.get("emp")) Object.assign(ui.newReq = {}, { employeeId: params.get("emp") });
  return shell(`
    <div class="page-head"><div><h2>طلب إجازة جديد</h2><p>يُرسل الطلب مباشرة إلى المعاون الإداري للموافقة أو الرفض.</p></div></div>
    <div class="grid-2 req-grid">
      <form class="card form" id="reqForm">
        <label>المنتسب
          <div class="combo"><input id="empPick" placeholder="اكتب اسم التدريسي أو الموظف…" autocomplete="off" value="${esc(empById(nr.employeeId)?.name || "")}"><div class="combo-list" id="empList"></div></div>
        </label>
        <div id="reqBody">${reqBody()}</div>
      </form>
      <aside class="card summary" id="reqSummary">${reqSummary()}</aside>
    </div>`, "new");
}

function reqBody() {
  const nr = ui.newReq, e = empById(nr.employeeId);
  if (!e) return `<p class="empty">اختر المنتسب أولاً لعرض رصيده.</p>`;
  const types = S().settings.rules.types.filter((t) => t.for.includes(e.category));
  if (!types.find((t) => t.key === nr.type)) nr.type = types[0]?.key;
  const t = typeOf(nr.type);
  return `
    <label>نوع الإجازة<select name="type">${types.map((x) => `<option value="${x.key}" ${x.key === nr.type ? "selected" : ""}>${x.name}</option>`).join("")}</select></label>
    ${t.unit === "hour" ? `
      <div class="row"><label>التاريخ<input type="date" name="startDate" value="${nr.startDate || today()}" required></label>
      <label>عدد الساعات<input type="number" name="hours" min="0.5" step="0.5" value="${nr.hours || ""}" required></label></div>` : `
      <div class="row"><label>من تاريخ<input type="date" name="startDate" value="${nr.startDate || ""}" required></label>
      <label>إلى تاريخ<input type="date" name="endDate" value="${nr.endDate || ""}" min="${nr.startDate || ""}" required></label>
      <label>عدد الأيام<input type="number" name="days" min="0.5" step="0.5" value="${nr.days ?? ""}" required><small>يُحسب تلقائياً${S().settings.rules.excludeWeekends ? " بدون الجمعة والسبت" : ""} ويمكن تعديله</small></label></div>`}
    <label>السبب / ملاحظات<textarea name="reason" rows="3" placeholder="اختياري">${esc(nr.reason || "")}</textarea></label>
    <div class="err" id="reqErr"></div>
    <button class="btn primary block" type="submit"><i data-lucide="send"></i>إرسال إلى المعاون الإداري</button>`;
}

function currentPlan() {
  const nr = ui.newReq, e = empById(nr.employeeId), t = typeOf(nr.type);
  if (!e || !t) return null;
  const total = requestDays(t, nr, S().settings.rules);
  return { e, t, total, ...payPlan(t, total, e.balance || 0, !!nr.split) };
}

function reqSummary() {
  const p = currentPlan();
  if (!p) return `<div class="sum-empty"><i data-lucide="user-search"></i><p>بعد اختيار المنتسب يظهر رصيده هنا، وهل الإجازة براتب أو بدون راتب.</p></div>`;
  const { e, t, total } = p;
  const short = t.deducts === "balance" && total > (e.balance || 0);
  const after = t.deducts === "balance" ? round2((e.balance || 0) - p.paid) : e.balance;
  const payLabel = p.pay === "none" ? "لا تُخصم من الرصيد" : PAY[p.pay];
  return `
    <div class="sum-who"><b>${esc(e.name)}</b><span>${CATEGORIES[e.category]}${e.department ? " · " + esc(e.department) : ""}</span></div>
    <div class="sum-bal"><span>الرصيد المتوفر</span><strong class="${e.balance <= 0 ? "neg" : ""}">${num(e.balance)}</strong><em>يوم · ${ruleText(e.category)}</em></div>
    <dl class="sum-dl">
      <div><dt>نوع الإجازة</dt><dd>${esc(t.name)}</dd></div>
      <div><dt>المدة المطلوبة</dt><dd>${t.unit === "hour" ? `${num(ui.newReq.hours || 0)} ساعة = ` : ""}${days(total)}</dd></div>
      ${t.deducts === "balance" ? `<div><dt>الرصيد بعد الموافقة</dt><dd>${days(after)}</dd></div>` : ""}
    </dl>
    ${total > 0 ? `<div class="pay pay-${p.pay}"><span>${payLabel}</span>${p.pay === "partial" ? `<em>${days(p.paid)} براتب + ${days(p.unpaid)} بدون راتب</em>` : ""}</div>` : ""}
    ${short ? `<div class="note warn">الرصيد غير كافٍ لهذه المدة، لذلك تُسجَّل الإجازة <b>بدون راتب</b>.</div>
      ${(e.balance || 0) > 0 ? `<label class="check"><input type="checkbox" id="splitChk" ${ui.newReq.split ? "checked" : ""}> احتساب الرصيد المتوفر (${days(e.balance)}) براتب والباقي بدون راتب</label>` : ""}` : ""}
    <p class="muted small">يُعاد فحص الرصيد لحظة موافقة المعاون الإداري.</p>`;
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
    const n = ev.target.name; if (!n) { if (ev.target.id === "splitChk") return; return; }
    ui.newReq[n] = ev.target.value;
    if (n === "type") return refreshReq(true);
    if (n === "startDate" || n === "endDate") {
      if (ui.newReq.startDate && (!ui.newReq.endDate || ui.newReq.endDate < ui.newReq.startDate) && n === "startDate" && form.endDate) { ui.newReq.endDate = ui.newReq.startDate; form.endDate.value = ui.newReq.startDate; }
      if (form.endDate) form.endDate.min = ui.newReq.startDate || "";
      if (form.days) { ui.newReq.days = countDays(ui.newReq.startDate, ui.newReq.endDate, S().settings.rules) || ""; form.days.value = ui.newReq.days; }
    }
    refreshSummary();
  };
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const p = currentPlan(); const nr = ui.newReq;
    if (!p) return;
    if (!(p.total > 0)) return ($("#reqErr").textContent = "حدد مدة الإجازة");
    const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
    try {
      await store.createRequest({
        employeeId: p.e.id, employeeName: p.e.name, category: p.e.category, department: p.e.department || "",
        type: p.t.key, typeName: p.t.name, unit: p.t.unit, deducts: p.t.deducts,
        startDate: nr.startDate, endDate: p.t.unit === "hour" ? nr.startDate : nr.endDate,
        days: p.t.unit === "hour" ? 0 : Number(nr.days), hours: p.t.unit === "hour" ? Number(nr.hours) : 0,
        total: p.total, pay: p.pay, paid: p.paid, unpaid: p.unpaid, split: !!nr.split,
        balanceAtRequest: p.e.balance || 0, reason: nr.reason || ""
      });
      ui.newReq = {};
      toast("أُرسل الطلب إلى المعاون الإداري");
      location.hash = "#/inbox";
    } catch (e) { $("#reqErr").textContent = e.message; btn.disabled = false; }
  };
  $("#reqSummary").onchange = (ev) => { if (ev.target.id === "splitChk") { ui.newReq.split = ev.target.checked; refreshSummary(); } };
}
function refreshReq(body) { if (body) { $("#reqBody").innerHTML = reqBody(); } refreshSummary(); icons(); }
function refreshSummary() { $("#reqSummary").innerHTML = reqSummary(); icons(); }

/* ------------------------------ inbox ------------------------------ */
function inboxView() {
  const pend = S().requests.filter((r) => r.status === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const recent = S().requests.filter((r) => r.status !== "pending").slice(0, 6);
  return shell(`
    <div class="page-head"><div><h2>${isAdmin() ? "الطلبات المعلقة" : "الطلبات الواردة"}</h2>
      <p>${isAdmin() ? "طلبات أُرسلت للمعاون الإداري ولم يُبت بها بعد." : "كل طلب يدخله مسؤول النظام يظهر هنا فوراً. الموافقة تخصم من رصيد المنتسب تلقائياً."}</p></div></div>
    ${pend.length ? `<div class="inbox">${pend.map(inboxCard).join("")}</div>` : `<div class="card empty-big"><i data-lucide="check-check"></i><p>لا توجد طلبات بانتظار القرار.</p></div>`}
    ${recent.length ? `<div class="card"><div class="card-h"><h3>آخر القرارات</h3><a href="#/requests" class="muted">السجل الكامل</a></div>${requestsTable(recent)}</div>` : ""}
  `, "inbox");
}

function inboxCard(r) {
  const e = empById(r.employeeId) || { balance: 0 };
  const t = typeOf(r.type) || { deducts: r.deducts };
  const p = r.deducts === "balance" ? payPlan({ deducts: "balance" }, r.total, e.balance || 0, r.split) : { pay: r.pay, paid: 0, unpaid: r.unpaid };
  const payLabel = p.pay === "none" ? "لا تُخصم من الرصيد" : PAY[p.pay];
  return `
  <article class="req-card" id="rq-${r.id}">
    <header><span class="serial">طلب ${esc(r.serial)}</span><span class="muted">${fmtDT(r.createdAt)} · أدخله ${esc(r.createdByName)}</span></header>
    <div class="req-main">
      <div><h4><a href="#/employee/${r.employeeId}">${esc(r.employeeName)}</a></h4><span class="tag ${r.category}">${CATEGORIES[r.category]}</span> <span class="muted">${esc(r.department)}</span></div>
      <dl class="req-dl">
        <div><dt>النوع</dt><dd>${esc(r.typeName)}</dd></div>
        <div><dt>المدة</dt><dd>${r.unit === "hour" ? `${num(r.hours)} ساعة · ${fmtDate(r.startDate)}` : `${days(r.total)} · ${fmtDate(r.startDate)} ← ${fmtDate(r.endDate)}`}</dd></div>
        <div><dt>الرصيد الحالي</dt><dd class="${e.balance < r.total && r.deducts === "balance" ? "neg" : ""}">${days(e.balance)}</dd></div>
        <div><dt>الصرف</dt><dd><span class="pay-chip pay-${p.pay}">${payLabel}</span>${p.pay === "partial" ? ` <small>${num(p.paid)} براتب + ${num(p.unpaid)} بدون</small>` : ""}</dd></div>
      </dl>
      ${r.reason ? `<p class="reason">“${esc(r.reason)}”</p>` : ""}
    </div>
    <footer>
      ${isAdmin()
        ? `<span class="muted">بانتظار قرار المعاون الإداري</span><button class="btn ghost sm" data-act="cancel-req" data-id="${r.id}">إلغاء الطلب</button>`
        : `<button class="btn approve" data-act="approve" data-id="${r.id}"><i data-lucide="check"></i>موافقة</button>
           <button class="btn reject" data-act="reject" data-id="${r.id}"><i data-lucide="x"></i>رفض</button>`}
    </footer>
  </article>`;
}

/* ----------------------------- requests ----------------------------- */
function requestsTable(list, compact) {
  if (!list.length) return `<p class="empty">لا توجد إجازات.</p>`;
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>الرقم</th>${compact ? "" : "<th>المنتسب</th>"}<th>النوع</th><th>الفترة</th><th class="n">المدة</th><th>الصرف</th><th>الحالة</th><th></th></tr></thead>
    <tbody>${list.map((r) => `<tr>
      <td class="mono">${esc(r.serial)}</td>
      ${compact ? "" : `<td><a href="#/employee/${r.employeeId}">${esc(r.employeeName)}</a><div class="sub">${CATEGORIES[r.category]}</div></td>`}
      <td>${esc(r.typeName)}</td>
      <td>${fmtDate(r.startDate)}${r.endDate && r.endDate !== r.startDate ? " ← " + fmtDate(r.endDate) : ""}</td>
      <td class="n">${r.unit === "hour" ? num(r.hours) + " س" : num(r.total)}</td>
      <td>${r.pay && r.pay !== "none" ? `<span class="pay-chip pay-${r.pay}">${PAY[r.pay]}</span>` : "—"}</td>
      <td><span class="st st-${r.status}">${STATUS[r.status]}</span>${r.decisionNote ? `<div class="sub">${esc(r.decisionNote)}</div>` : ""}</td>
      <td class="act">${r.status === "approved" ? `<button class="icon-btn" title="طباعة" data-act="print" data-id="${r.id}"><i data-lucide="printer"></i></button>` : ""}
        ${r.status === "pending" && isAdmin() ? `<button class="icon-btn" title="إلغاء" data-act="cancel-req" data-id="${r.id}"><i data-lucide="x"></i></button>` : ""}</td>
    </tr>`).join("")}</tbody></table></div>`;
}

function filteredRequests() {
  const f = ui.reqFilter;
  return S().requests.filter((r) => (f.status === "all" || r.status === f.status) && (f.cat === "all" || r.category === f.cat) && (!f.q || r.employeeName.includes(f.q) || (r.serial || "").includes(f.q)));
}

function requestsView() {
  const f = ui.reqFilter;
  return shell(`
    <div class="page-head"><div><h2>سجل الإجازات</h2><p>كل الطلبات وقراراتها.</p></div>
      <div class="actions"><button class="btn" data-act="export-reqs"><i data-lucide="file-spreadsheet"></i>تنزيل المعروض Excel</button></div></div>
    <div class="card">
      <div class="filters">
        <div class="search"><i data-lucide="search"></i><input id="reqSearch" placeholder="اسم المنتسب أو رقم الطلب" value="${esc(f.q)}"></div>
        <select id="reqStatus"><option value="all">كل الحالات</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${f.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        <select id="reqCat"><option value="all">الكل</option>${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${f.cat === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      </div>
      <div id="reqTable">${requestsTable(filteredRequests())}</div>
    </div>`, "requests");
}

/* ----------------------------- settings ----------------------------- */
function settingsView() {
  const s = S().settings, r = s.rules, c = r.categories;
  const catBlock = (k, label) => `
    <fieldset><legend>${label}</legend>
      <div class="row">
        <label>طريقة الاستحقاق<select name="${k}.accrual"><option value="monthly" ${c[k].accrual === "monthly" ? "selected" : ""}>شهري</option><option value="yearly" ${c[k].accrual === "yearly" ? "selected" : ""}>سنوي (بداية كل سنة)</option></select></label>
        <label>عدد الأيام<input type="number" step="0.5" min="0" name="${k}.amount" value="${c[k].amount}"></label>
        <label>الحد الأعلى للرصيد<input type="number" min="0" name="${k}.max" value="${c[k].max}"><small>0 = بلا حد</small></label>
      </div>
      <label class="check"><input type="checkbox" name="${k}.accumulate" ${c[k].accumulate ? "checked" : ""}> يتراكم الرصيد غير المستخدم</label>
    </fieldset>`;
  return shell(`
    <div class="page-head"><div><h2>الإعدادات</h2><p>قوانين الإجازات والحسابات والنسخ الاحتياطي.</p></div></div>
    <div class="grid-2 even">
      <form class="card form" id="rulesForm">
        <div class="card-h"><h3>قوانين الإجازات</h3></div>
        ${catBlock("staff", "الموظفون")}
        ${catBlock("teaching", "التدريسيون")}
        <div class="row">
          <label>ساعات الدوام اليومي<input type="number" min="1" max="12" name="hoursPerDay" value="${r.hoursPerDay}"><small>لتحويل الإجازة الزمنية لأيام</small></label>
        </div>
        <label class="check"><input type="checkbox" name="excludeWeekends" ${r.excludeWeekends ? "checked" : ""}> عدم احتساب الجمعة والسبت ضمن أيام الإجازة</label>
        <p class="muted small">الاستحقاق يُضاف تلقائياً لكل منتسب ببداية كل شهر (أو سنة) ويظهر في حركة رصيده.</p>
        <button class="btn primary">حفظ القوانين</button>
      </form>
      <div class="stack">
        <form class="card form" id="collegeForm">
          <div class="card-h"><h3>هوية الكلية</h3></div>
          <div class="logo-edit">${logoHTML(64)}<label class="btn sm">رفع الشعار<input type="file" accept="image/*" id="logoFile" hidden></label>${s.logo ? `<button type="button" class="btn ghost sm" data-act="logo-clear">إزالة</button>` : ""}</div>
          <label>اسم الجامعة<input name="university" value="${esc(s.university)}" placeholder="مثال: جامعة …"></label>
          <button class="btn primary">حفظ</button>
        </form>
        <div class="card">
          <div class="card-h"><h3>الحسابات</h3><button class="btn sm" data-act="add-user"><i data-lucide="user-plus"></i>حساب جديد</button></div>
          <ul class="list">${S().users.map((u) => `<li><span><b>${esc(u.name)}</b> <span class="muted" dir="ltr">${esc(u.username)}</span></span>
            <span>${ROLES[u.role]} ${u.id !== S().user.uid ? `<button class="btn ghost sm" data-act="user-active" data-id="${u.id}" data-v="${u.active ? 0 : 1}">${u.active ? "إيقاف" : "تفعيل"}</button>` : `<button class="btn ghost sm" data-act="change-pw">تغيير كلمة المرور</button>`}</span></li>`).join("")}</ul>
        </div>
        <div class="card">
          <div class="card-h"><h3>النسخ الاحتياطي</h3></div>
          <p class="muted small">${isLive ? "البيانات محفوظة في Firebase، وتُؤخذ نسخة يومية تلقائية إلى مستودع GitHub الخاص." : "في الوضع التجريبي البيانات محفوظة بهذا المتصفح فقط."}</p>
          <div class="actions">
            <button class="btn" data-act="backup"><i data-lucide="download"></i>تنزيل نسخة كاملة (JSON)</button>
            <button class="btn" data-act="export-all"><i data-lucide="file-spreadsheet"></i>Excel كامل</button>
            ${isLive ? "" : `<label class="btn">استعادة نسخة<input type="file" accept=".json" id="restoreFile" hidden></label><button class="btn ghost" data-act="reset-demo">إعادة البيانات التجريبية</button>`}
          </div>
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
    <div class="modal-f"><button type="button" class="btn ghost" data-close>إلغاء</button><button class="btn primary" type="submit">${submitLabel}</button></div></form>`;
  document.body.appendChild(m); icons();
  const close = () => m.remove();
  m.addEventListener("click", (e) => { if (e.target === m || e.target.closest("[data-close]")) close(); });
  const f = m.querySelector("form");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector("[type=submit]"); btn.disabled = true;
    try { await onSubmit(Object.fromEntries(new FormData(f)), f); close(); }
    catch (err) { f.querySelector(".err").textContent = err.message || "حدث خطأ"; btn.disabled = false; }
  };
  setTimeout(() => f.querySelector("input,textarea,select")?.focus(), 30);
  return f;
}

function employeeModal(e = {}) {
  modal(e.id ? "تعديل بيانات المنتسب" : "إضافة منتسب", `
    <label>الاسم الكامل<input name="name" required value="${esc(e.name || "")}"></label>
    <div class="row"><label>الصنف<select name="category">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${e.category === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <label>اللقب / العنوان الوظيفي<input name="title" value="${esc(e.title || "")}"></label></div>
    <div class="row"><label>القسم / الشعبة<input name="department" value="${esc(e.department || "")}"></label>
    <label>الرقم الوظيفي<input name="empNo" value="${esc(e.empNo || "")}"></label></div>
    ${e.id ? "" : `<label>الرصيد الحالي (يوم)<input type="number" step="0.5" name="balance" required value="0"><small>الرصيد المتراكم لغاية اليوم. الاستحقاق الشهري/السنوي يُضاف تلقائياً بعدين.</small></label>`}
    <label>ملاحظات<textarea name="notes" rows="2">${esc(e.notes || "")}</textarea></label>`,
    async (d) => { await store.saveEmployee({ ...d, id: e.id }); toast(e.id ? "تم الحفظ" : "تمت إضافة المنتسب"); });
}

function adjustModal(id) {
  const e = empById(id);
  modal("تعديل الرصيد", `
    <p>الرصيد الحالي لـ <b>${esc(e.name)}</b>: <b>${days(e.balance)}</b></p>
    <div class="row"><label>العملية<select name="op"><option value="add">إضافة</option><option value="sub">خصم</option><option value="set">تحديد الرصيد إلى</option></select></label>
    <label>عدد الأيام<input type="number" step="0.25" min="0" name="v" required></label></div>
    <label>السبب (يظهر في حركة الرصيد)<input name="reason" required placeholder="مثال: تصحيح رصيد حسب كتاب الموارد البشرية"></label>`,
    async (d) => {
      const v = Number(d.v);
      const delta = d.op === "add" ? v : d.op === "sub" ? -v : round2(v - (e.balance || 0));
      if (!delta) throw new Error("لا يوجد تغيير");
      await store.adjustBalance(id, delta, d.reason); toast("تم تعديل الرصيد");
    });
}

function decideModal(id, approve) {
  const r = S().requests.find((x) => x.id === id), e = empById(r.employeeId) || { balance: 0 };
  const p = r.deducts === "balance" ? payPlan({ deducts: "balance" }, r.total, e.balance || 0, r.split) : { pay: r.pay, paid: 0 };
  modal(approve ? "تأكيد الموافقة" : "رفض الطلب", approve ? `
    <p>الموافقة على إجازة <b>${esc(r.typeName)}</b> لـ <b>${esc(r.employeeName)}</b> لمدة <b>${days(r.total)}</b>.</p>
    <div class="confirm-grid"><div><span>الرصيد الآن</span><b>${days(e.balance)}</b></div><div><span>يُخصم</span><b>${days(p.paid)}</b></div><div><span>الرصيد بعد</span><b>${days(round2((e.balance || 0) - p.paid))}</b></div></div>
    ${p.pay !== "none" ? `<div class="pay pay-${p.pay}"><span>${PAY[p.pay]}</span></div>` : ""}
    <label>ملاحظة (اختياري)<input name="note"></label>` : `
    <p>رفض طلب <b>${esc(r.employeeName)}</b> (${esc(r.typeName)} · ${days(r.total)}). لا يتغير الرصيد.</p>
    <label>سبب الرفض<textarea name="note" rows="3" required></textarea></label>`,
    async (d) => { await store.decideRequest(id, approve, d.note); toast(approve ? "تمت الموافقة وخُصم الرصيد" : "تم رفض الطلب"); },
    approve ? "موافقة" : "رفض", approve ? "" : "danger");
}

function userModal() {
  modal("حساب جديد", `
    <label>الاسم<input name="name" required></label>
    <div class="row"><label>اسم المستخدم<input name="username" required dir="ltr" pattern="[a-zA-Z0-9._-]+" title="حروف إنكليزية وأرقام فقط"></label>
    <label>كلمة المرور<input name="password" type="password" required minlength="6" dir="ltr"></label></div>
    <label>الصلاحية<select name="role"><option value="assistant">المعاون الإداري</option><option value="admin">مسؤول النظام</option><option value="backup">حساب النسخ الاحتياطي (قراءة فقط)</option></select></label>`,
    async (d) => { await store.createUser({ ...d, username: d.username.toLowerCase() }); toast("تم إنشاء الحساب"); }, "إنشاء");
}

function importModal() {
  modal("استيراد المنتسبين من Excel", `
    <ol class="steps"><li>نزّل القالب واملأ الأسماء والصنف (تدريسي / موظف) والرصيد الحالي.</li><li>ارفع الملف هنا، وراجع العدد قبل التأكيد.</li></ol>
    <button type="button" class="btn sm" id="tplBtn"><i data-lucide="download"></i>تنزيل القالب</button>
    <label>الملف<input type="file" id="impFile" accept=".xlsx,.xls,.csv" required></label>
    <div id="impPreview" class="muted"></div>`,
    async (_, f) => {
      const rows = f._rows;
      if (!rows?.length) throw new Error("اختر ملفاً صالحاً");
      await store.importEmployees(rows); toast(`تم استيراد ${rows.length} منتسب`);
    }, "استيراد");
  $("#tplBtn").onclick = importTemplate;
  $("#impFile").onchange = async (ev) => {
    const f = ev.target.closest("form");
    try {
      const { rows, skipped } = await readImport(ev.target.files[0]);
      f._rows = rows;
      $("#impPreview").innerHTML = `سيتم استيراد <b>${rows.length}</b> منتسب (${rows.filter((r) => r.category === "teaching").length} تدريسي، ${rows.filter((r) => r.category === "staff").length} موظف)${skipped ? ` — تم تجاهل ${skipped} صف بدون اسم` : ""}.`;
    } catch (e) { $("#impPreview").textContent = e.message; }
  };
}

/* ------------------------------ print ------------------------------ */
function printRequest(id) {
  const r = S().requests.find((x) => x.id === id);
  const s = S().settings;
  const box = $("#print");
  box.innerHTML = `
  <div class="pr">
    <header>${logoHTML(80)}<div><div>${esc(s.university || "")}</div><div class="pr-c">${esc(COLLEGE.name)}</div><div>${COLLEGE.system}</div></div>
      <div class="pr-meta"><div>العدد: ${esc(r.serial)}</div><div>التاريخ: ${fmtDate(r.decidedAt)}</div></div></header>
    <h1>إشعار منح إجازة ${esc(r.typeName)}</h1>
    <table>
      <tr><th>الاسم</th><td>${esc(r.employeeName)}</td><th>الصنف</th><td>${CATEGORIES[r.category]}</td></tr>
      <tr><th>القسم / الشعبة</th><td colspan="3">${esc(r.department) || "—"}</td></tr>
      <tr><th>نوع الإجازة</th><td>${esc(r.typeName)}</td><th>الصرف</th><td>${r.pay && r.pay !== "none" ? PAY[r.pay] : "—"}</td></tr>
      <tr><th>من</th><td>${fmtDate(r.startDate)}</td><th>إلى</th><td>${fmtDate(r.endDate)}</td></tr>
      <tr><th>المدة</th><td>${r.unit === "hour" ? num(r.hours) + " ساعة" : days(r.total)}</td><th>الرصيد المتبقي</th><td>${r.balanceAfter != null ? days(r.balanceAfter) : "—"}</td></tr>
      ${r.reason ? `<tr><th>ملاحظات</th><td colspan="3">${esc(r.reason)}</td></tr>` : ""}
    </table>
    <div class="pr-sign"><div><span>منظم الطلب</span><b>${esc(r.createdByName)}</b></div><div><span>المعاون الإداري</span><b>${esc(r.decidedByName)}</b><em>تمت الموافقة إلكترونياً ${fmtDT(r.decidedAt)}</em></div></div>
  </div>`;
  window.print();
}

/* ------------------------------ helpers ------------------------------ */
function toast(msg, kind = "ok") {
  const t = document.createElement("div");
  t.className = `toast ${kind}`; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("out"), 2600);
  setTimeout(() => t.remove(), 3000);
}
function icons() { window.lucide && window.lucide.createIcons({ attrs: { "stroke-width": 1.75 } }); }

async function fileToLogo(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const max = 320, k = Math.min(1, max / Math.max(img.width, img.height));
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
      case "add-emp": employeeModal(); break;
      case "edit-emp": employeeModal(empById(id)); break;
      case "adjust": adjustModal(id); break;
      case "archive": if (confirm(v === "1" ? "إعادة تفعيل المنتسب؟" : "أرشفة المنتسب؟ يبقى سجله محفوظاً ولا يظهر بالقوائم.")) await store.archiveEmployee(id, v === "1"); break;
      case "import": importModal(); break;
      case "approve": decideModal(id, true); break;
      case "reject": decideModal(id, false); break;
      case "cancel-req": if (confirm("إلغاء هذا الطلب؟")) { await store.cancelRequest(id); toast("تم إلغاء الطلب"); } break;
      case "print": printRequest(id); break;
      case "export-all": toast("جارٍ تجهيز ملف Excel…"); exportAll({ ...S(), ledger: await store.loadLedger() }); break;
      case "export-emp": exportEmployee({ ...S(), ledger: await store.loadLedger(id) }, id); break;
      case "export-reqs": exportRequests(filteredRequests()); break;
      case "add-user": userModal(); break;
      case "user-active": await store.setUserActive(id, v === "1"); break;
      case "change-pw": modal("تغيير كلمة المرور", `<label>كلمة المرور الجديدة<input name="pw" type="password" minlength="6" required dir="ltr"></label>`, async (d) => { await store.changePassword(d.pw); toast("تم تغيير كلمة المرور"); }); break;
      case "logo-clear": await store.saveSettings({ logo: "" }); break;
      case "backup": {
        const st = S();
        const data = { exportedAt: new Date().toISOString(), employees: st.employees, requests: st.requests, ledger: await store.loadLedger(), settings: st.settings };
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        a.download = `leave-backup-${today()}.json`; a.click(); break;
      }
      case "reset-demo": if (confirm("مسح كل البيانات التجريبية وإرجاع الأمثلة؟")) await store.resetDemo(); break;
    }
  } catch (e) { toast(e.message || "حدث خطأ", "bad"); }
});

document.addEventListener("input", (ev) => {
  if (ev.target.id === "empSearch") { ui.empSearch = ev.target.value; $("#empTable").innerHTML = employeeTable(); }
  if (ev.target.id === "reqSearch") { ui.reqFilter.q = ev.target.value.trim(); $("#reqTable").innerHTML = requestsTable(filteredRequests()); icons(); }
});
document.addEventListener("change", async (ev) => {
  const t = ev.target;
  if (t.id === "reqStatus" || t.id === "reqCat") { ui.reqFilter[t.id === "reqStatus" ? "status" : "cat"] = t.value; $("#reqTable").innerHTML = requestsTable(filteredRequests()); icons(); }
  if (t.id === "logoFile" && t.files[0]) { await store.saveSettings({ logo: await fileToLogo(t.files[0]) }); toast("تم حفظ الشعار"); }
  if (t.id === "restoreFile" && t.files[0]) { if (confirm("استبدال البيانات الحالية بالنسخة؟")) { await store.restore(JSON.parse(await t.files[0].text())); toast("تمت الاستعادة"); } }
});
document.addEventListener("submit", async (ev) => {
  if (ev.target.id === "rulesForm") {
    ev.preventDefault();
    const f = ev.target, g = (n) => f.elements[n];
    const cat = (k) => ({ accrual: g(`${k}.accrual`).value, amount: Number(g(`${k}.amount`).value) || 0, max: Number(g(`${k}.max`).value) || 0, accumulate: g(`${k}.accumulate`).checked });
    const rules = { ...S().settings.rules, hoursPerDay: Number(g("hoursPerDay").value) || 7, excludeWeekends: g("excludeWeekends").checked, categories: { staff: cat("staff"), teaching: cat("teaching") } };
    await store.saveSettings({ rules }); toast("تم حفظ القوانين");
  }
  if (ev.target.id === "collegeForm") {
    ev.preventDefault();
    await store.saveSettings({ university: ev.target.university.value.trim() }); toast("تم الحفظ");
  }
});

/* ------------------------------ router ------------------------------ */
let bootstrapMode = false;
function render() {
  const st = S();
  if (!st.ready) return;
  if (!st.user) return loginView(bootstrapMode);
  const [path, qs] = (location.hash.slice(2) || (isAdmin() ? "dashboard" : "inbox")).split("?");
  const [page, arg] = path.split("/");
  const params = new URLSearchParams(qs || "");
  // لا نعيد الرسم أثناء الكتابة في نموذج أو نافذة مفتوحة
  const views = {
    dashboard, employees: employeesView, employee: () => employeeView(arg), inbox: inboxView, requests: requestsView,
    new: () => (isAdmin() ? newRequestView(params) : inboxView()), settings: () => (isAdmin() ? settingsView() : dashboard())
  };
  const scroll = window.scrollY;
  app.innerHTML = (views[page] || dashboard)();
  window.scrollTo(0, scroll);
  if (page === "new") wireNewRequest();
  if (page === "employee") fillLedger(arg);
  icons();
  const pend = st.requests.filter((r) => r.status === "pending").length;
  document.title = `${pend ? `(${pend}) ` : ""}${COLLEGE.system} — ${COLLEGE.name}`;
}

// تنبيه المعاون الإداري لحظة وصول طلب جديد
function notifyNew() {
  const st = S();
  if (!st.user) return;
  const ids = st.requests.filter((r) => r.status === "pending").map((r) => r.id);
  if (lastPendingIds && st.user.role === "assistant") {
    const fresh = ids.filter((i) => !lastPendingIds.includes(i));
    if (fresh.length) {
      const r = st.requests.find((x) => x.id === fresh[0]);
      toast(`طلب جديد: ${r.employeeName} — ${r.typeName}`);
      if ("Notification" in window && Notification.permission === "granted") new Notification("طلب إجازة جديد", { body: `${r.employeeName} — ${r.typeName} (${num(r.total)} يوم)` });
    }
  }
  lastPendingIds = ids;
}

let raf;
subscribe(() => {
  notifyNew();
  // أثناء تعبئة طلب جديد أو وجود نافذة مفتوحة: نحدّث الملخص فقط حتى ما تنمسح الكتابة
  if (document.querySelector(".modal-bg")) return;
  if (location.hash.startsWith("#/new") && $("#reqForm")) { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { refreshSummary(); }); return; }
  if (document.activeElement && ["empSearch", "reqSearch"].includes(document.activeElement.id)) {
    $("#empTable") && ($("#empTable").innerHTML = employeeTable());
    return;
  }
  cancelAnimationFrame(raf); raf = requestAnimationFrame(render);
});
window.addEventListener("hashchange", render);

(async () => {
  try {
    await initStore();
    if (isLive && !getState().user) bootstrapMode = await store.needsBootstrap();
    if (getState().user?.role === "assistant" && "Notification" in window && Notification.permission === "default") Notification.requestPermission();
  } catch (e) {
    app.innerHTML = `<div class="login"><div class="login-card"><h1>تعذر تحميل النظام</h1><p>${esc(e.message)}</p></div></div>`;
    return;
  }
  render();
})();
