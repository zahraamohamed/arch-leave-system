// قوانين الإجازات — مبنية على:
//  • قانون الخدمة المدنية رقم 24 لسنة 1960 المعدل (الموظفون) — المواد 43 و 46
//  • قانون الخدمة الجامعية رقم 23 لسنة 2008 المعدل (التدريسيون) — المادة 10، وما لم يرد به نص يرجع لقانون الخدمة المدنية (المادة 18)
// كل الأرقام قابلة للتعديل من صفحة الإعدادات (سوبر أدمن فقط).

export const CATEGORIES = { staff: "موظف", teaching: "تدريسي" };

export const DEFAULT_RULES = {
  version: 2,
  hoursPerDay: 7,               // لتحويل الإجازة الزمنية لأيام (عرف إداري — لا يوجد نص صريح بالقانون)
  weekendDays: [5, 6],          // الجمعة والسبت
  excludeWeekends: true,
  academicYearStartMonth: 9,    // بداية السنة الدراسية (أيلول)
  sickAnnual: 30,               // مرضية براتب تام عن كل سنة خدمة — م46 خدمة مدنية
  categories: {
    // م43: يوم عن كل 10 أيام خدمة = 3 أيام بالشهر، تتراكم بدون حد للإجازة
    // (حد الـ180 يوم بالقانون يخص احتساب الرصيد عند التقاعد فقط، فما ينطبق هنا)
    // ولا يمنح أكثر من 120 يوم براتب بالمرة الواحدة
    staff:    { accrual: "monthly", amount: 3, maxPaidPerLeave: 120, maxPaidPerYear: 0, maxUnpaidPerLeave: 730 },
    // م10 خدمة جامعية: 15 يوم عن كل سنة دراسية تتراكم، ولا يمنح أكثر من 30 يوم خلال السنة الدراسية الواحدة
    teaching: { accrual: "academic", amount: 15, maxPaidPerLeave: 0, maxPaidPerYear: 30, maxUnpaidPerLeave: 730 }
  },
  // deducts: balance (الرصيد الاعتيادي) | sick (الرصيد المرضي) | none
  // fixedPay لأنواع لا تخصم: paid | unpaid
  types: [
    { key: "ordinary",   name: "اعتيادية",            deducts: "balance", unit: "day",  for: ["staff", "teaching"] },
    { key: "hourly",     name: "زمنية (ساعية)",       deducts: "balance", unit: "hour", for: ["staff", "teaching"] },
    { key: "sick",       name: "مرضية",               deducts: "sick",    unit: "day",  for: ["staff", "teaching"] },
    // pausesAccrual: مدة الإجازة ما ينحسبلها استحقاق (لا تُمنح إجازة اعتيادية عن إجازة أخرى، والبدون راتب لا تُعد خدمة)
    { key: "unpaid",     name: "بدون راتب",           deducts: "none",    unit: "day",  for: ["staff", "teaching"], fixedPay: "unpaid", pausesAccrual: true },
    { key: "prenatal",   name: "قبل الوضع", deducts: "none", unit: "day", for: ["staff", "teaching"], fixedPay: "paid", pausesAccrual: true },
    { key: "postnatal",  name: "بعد الوضع", deducts: "none", unit: "day", for: ["staff", "teaching"], fixedPay: "paid", pausesAccrual: true },
    { key: "maternity",  name: "أمومة (رعاية طفل)",   deducts: "none",    unit: "day",  for: ["staff", "teaching"], fixedPay: "paid", pausesAccrual: true },
    { key: "summer",     name: "العطلة الصيفية",      deducts: "none",    unit: "day",  for: ["teaching"],          fixedPay: "paid" },
    { key: "sabbatical", name: "تفرغ علمي",           deducts: "none",    unit: "day",  for: ["teaching"],          fixedPay: "paid" },
    { key: "study",      name: "دراسية",              deducts: "none",    unit: "day",  for: ["staff", "teaching"], fixedPay: "paid" },
    { key: "other",      name: "أخرى",                deducts: "none",    unit: "day",  for: ["staff", "teaching"], fixedPay: "paid" }
  ]
};

export const STATUS = {
  pending: "بانتظار المعاون الإداري",
  approved: "موافق عليها",
  rejected: "مرفوضة",
  cancelled: "ملغاة",
  withdrawn: "مسحوبة"
};

export const ROLES = {
  superadmin: "سوبر أدمن",
  admin: "مسؤول الإجازات",
  assistant: "المعاون الإداري",
  backup: "حساب النسخ الاحتياطي"
};

export const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// السنة الدراسية لتاريخ معيّن، مثل "2026/2027"
export function academicYear(dateStr, startMonth = 9) {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  const y = d.getMonth() + 1 >= startMonth ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${y + 1}`;
}

// تاريخ نهاية تقديري: من تاريخ البداية + عدد الأيام (calendar=true يحسب كل الأيام، وإلا يتجاوز العطل حسب الإعدادات)
export function endDateFor(start, days, rules, calendar = false) {
  const n = Math.ceil(Number(days) || 0);
  if (!start || n < 1) return "";
  const d = new Date(start + "T00:00:00");
  const skip = (x) => !calendar && rules.excludeWeekends && rules.weekendDays.includes(x.getDay());
  while (skip(d)) d.setDate(d.getDate() + 1);
  let left = n - 1;
  while (left > 0) { d.setDate(d.getDate() + 1); if (!skip(d)) left--; }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function countDays(start, end, rules) {
  if (!start || !end) return 0;
  const s = new Date(start + "T00:00:00"), e = new Date(end + "T00:00:00");
  if (e < s) return 0;
  let n = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    if (rules.excludeWeekends && rules.weekendDays.includes(d.getDay())) continue;
    n++;
  }
  return n;
}

export function requestDays(type, req, rules) {
  if (!type) return 0;
  if (type.unit === "hour") return round2((Number(req.hours) || 0) / rules.hoursPerDay);
  return Number(req.days) || 0;
}

// الأيام المأخوذة براتب من الرصيد الاعتيادي خلال السنة الدراسية (للتدريسي: الحد 30 يوم)
export function paidInAcademicYear(requests, employeeId, year, startMonth, excludeId) {
  return round2(requests
    .filter((r) => r.employeeId === employeeId && r.kind !== "withdrawal" && r.status === "approved" && r.deducts === "balance" && r.id !== excludeId && !r.deleted)
    .filter((r) => academicYear(r.startDate, startMonth) === year)
    .reduce((a, r) => a + (r.paid || 0), 0));
}

// خطة الصرف: كم براتب، كم نصف راتب، كم بدون راتب، مع السبب
export function payPlan({ type, total, employee, rules, requests, startDate, excludeId, split = true }) {
  const out = { paid: 0, half: 0, unpaid: 0, notes: [] };
  if (!type || !(total > 0)) return { ...out, pay: "none" };
  if (type.deducts === "none") {
    if (type.fixedPay === "unpaid") out.unpaid = total; else out.paid = total;
    return { ...out, pay: type.fixedPay === "unpaid" ? "unpaid" : "paid", fromBalance: false };
  }
  if (type.deducts === "sick") {
    const sick = Math.max(0, round2(employee.sick || 0));
    out.paid = Math.min(total, sick);
    out.half = round2(total - out.paid);
    if (out.half > 0) out.notes.push(`الرصيد المرضي ${sick} يوم — الباقي بنصف راتب (م46)`);
    return { ...out, pay: out.half ? (out.paid ? "mixed" : "half") : "paid", fromBalance: true };
  }
  // الرصيد الاعتيادي
  const c = rules.categories[employee.category] || {};
  let avail = Math.max(0, round2(employee.balance || 0));
  if (c.maxPaidPerLeave > 0 && avail > c.maxPaidPerLeave) { avail = c.maxPaidPerLeave; out.notes.push(`الحد الأعلى براتب بالمرة الواحدة ${c.maxPaidPerLeave} يوم (م43)`); }
  if (c.maxPaidPerYear > 0) {
    const yr = academicYear(startDate, rules.academicYearStartMonth);
    const used = paidInAcademicYear(requests || [], employee.id, yr, rules.academicYearStartMonth, excludeId);
    const left = Math.max(0, round2(c.maxPaidPerYear - used));
    if (left < avail) { avail = left; out.notes.push(`المتبقي براتب للسنة الدراسية ${yr}: ${left} من ${c.maxPaidPerYear} يوم (م10 خدمة جامعية)`); }
  }
  if (avail >= total) out.paid = total;
  else if (split && avail > 0) { out.paid = avail; out.unpaid = round2(total - avail); }
  else out.unpaid = total;
  if (out.unpaid > 0 && c.maxUnpaidPerLeave > 0 && out.unpaid > c.maxUnpaidPerLeave) out.notes.push(`تنبيه: بدون راتب أكثر من ${c.maxUnpaidPerLeave} يوم (قرار 418 لسنة 1987: لحد سنتين)`);
  const pay = out.unpaid ? (out.paid ? "partial" : "unpaid") : "paid";
  return { ...out, pay, fromBalance: true };
}

export const PAY = { paid: "براتب", unpaid: "بدون راتب", partial: "جزء براتب وجزء بدون راتب", half: "نصف راتب", mixed: "جزء براتب وجزء نصف راتب", none: "—" };
export function payText(r) {
  const parts = [];
  if (r.paid) parts.push(`${r.paid} براتب`);
  if (r.half) parts.push(`${r.half} نصف راتب`);
  if (r.unpaid) parts.push(`${r.unpaid} بدون راتب`);
  return parts.join(" + ");
}

// الاستحقاق التلقائي من آخر شهر محتسب لغاية الشهر الحالي
// pauses: فترات الإجازات اللي توقف الاستحقاق (أمومة، حمل ووضع، بدون راتب) [{from, to}]
//  • الموظف: لكل شهر مكتمل ينضاف 3 أيام × (أيام الشهر بدون الفترات الموقوفة ÷ أيام الشهر)
//  • التدريسي: ببداية السنة الدراسية 15 يوم × (1 − الأيام الموقوفة بالسنة الدراسية الماضية ÷ 365)
//  • المرضي: بكانون الثاني 30 يوم × (1 − الأيام الموقوفة بالسنة الماضية ÷ 365)
const dayMs = 86400000;
function overlapDays(pauses, fromStr, toStr) {
  const lo = new Date(fromStr + "T00:00:00").getTime(), hi = new Date(toStr + "T00:00:00").getTime();
  const iv = (pauses || []).filter((p) => p.from && p.to)
    .map((p) => [Math.max(lo, new Date(p.from + "T00:00:00").getTime()), Math.min(hi, new Date(p.to + "T00:00:00").getTime())])
    .filter(([x, y]) => y >= x).sort((p, q) => p[0] - q[0]);
  let total = 0, cur = null;
  for (const [x, y] of iv) { if (!cur || x > cur[1] + dayMs) { if (cur) total += (cur[1] - cur[0]) / dayMs + 1; cur = [x, y]; } else cur[1] = Math.max(cur[1], y); }
  if (cur) total += (cur[1] - cur[0]) / dayMs + 1;
  return Math.round(total);
}
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y, m) => new Date(y, m, 0).getDate();

export function accrualFor(emp, rules, target = monthKey(), pauses = []) {
  const c = rules.categories[emp.category];
  const from = emp.accruedThrough;
  if (!c || !from || from >= target) return null;
  let [y, m] = from.split("-").map(Number);
  const bal = round2(emp.balance), sick = round2(emp.sick);
  const labels = [];
  let addB = 0, addS = 0, pausedTotal = 0;
  while (true) {
    // الشهر المكتمل (y, m) — نوصل للشهر اللي بعده
    const py = y, pm = m;
    m++; if (m > 12) { m = 1; y++; }
    const k = `${y}-${String(m).padStart(2, "0")}`;
    if (k > target) break;
    if (c.accrual === "monthly") {
      const dim = lastDay(py, pm);
      const paused = overlapDays(pauses, ymd(py, pm, 1), ymd(py, pm, dim));
      pausedTotal += paused;
      addB += c.amount * (dim - paused) / dim;
    }
    if (c.accrual === "academic" && m === rules.academicYearStartMonth) {
      const paused = overlapDays(pauses, ymd(y - 1, m, 1), ymd(y, m, 1));
      pausedTotal += paused;
      addB += c.amount * Math.max(0, 1 - paused / 365);
      labels.push(`رصيد السنة الدراسية ${y}/${y + 1}${paused ? ` (موقوف ${paused} يوم)` : ""}`);
    }
    if (m === 1 && rules.sickAnnual) {
      const paused = overlapDays(pauses, ymd(y - 1, 1, 1), ymd(y - 1, 12, 31));
      addS += rules.sickAnnual * Math.max(0, 1 - paused / 365);
      labels.push(`رصيد مرضي ${y}`);
    }
  }
  const newB = round2(bal + addB), newS = round2(sick + addS);
  const label = c.accrual === "monthly"
    ? `استحقاق لغاية ${target}${pausedTotal ? ` (موقوف ${pausedTotal} يوم: أمومة/وضع/بدون راتب)` : ""}`
    : (labels.join(" · ") || `تحديث ${target}`);
  return { target, balance: newB, dBalance: round2(newB - bal), sick: newS, dSick: round2(newS - sick), label };
}

// إجازة توقف الاستحقاق انسجلت بأثر رجعي: كم انضاف عن أشهرها اللي سبق احتسابها (حتى يُسترجع)
export function retroAccrualOverpaid(emp, rules, from, to) {
  const c = rules.categories[emp.category];
  if (!c || c.accrual !== "monthly" || !emp.accruedThrough || !from) return 0;
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  let total = 0;
  while (`${y}-${String(m).padStart(2, "0")}` < emp.accruedThrough) {   // الأشهر المحتسبة سابقاً
    const dim = lastDay(y, m);
    total += c.amount * overlapDays([{ from, to: to || from }], ymd(y, m, 1), ymd(y, m, dim)) / dim;
    m++; if (m > 12) { m = 1; y++; }
    if (`${y}-${String(m).padStart(2, "0")}` > (to || from).slice(0, 7)) break;
  }
  return round2(total);
}

// حاسبة الاستحقاق من تاريخ المباشرة
//  الموظف: يوم عن كل 10 أيام خدمة (م43)، بدون حد للتراكم
//  التدريسي: 15 يوم عن كل سنة دراسية (م10) — تُحسب نسبياً حسب أشهر الخدمة
//  المرضية: 30 يوم عن كل سنة خدمة كاملة (م46)
//  الفترات الموقوفة (أمومة، بدون راتب، إجازة طويلة) لا يُستحق عنها رصيد
const DAY = 86400000;
const toD = (x) => new Date(x + "T00:00:00");

// مجموع أيام الفترات الموقوفة داخل مدة الخدمة، بعد دمج المتداخل منها حتى ما ينحسب يوم مرتين
export function pausedDays(periods, start, asOf) {
  if (!start || !asOf) return 0;
  const lo = toD(start).getTime(), hi = toD(asOf).getTime();
  const iv = periods
    .filter((p) => p.from && p.to && p.to >= p.from)
    .map((p) => [Math.max(lo, toD(p.from).getTime()), Math.min(hi, toD(p.to).getTime())])
    .filter(([a, b]) => b >= a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0, cur = null;
  for (const [a, b] of iv) {
    if (!cur || a > cur[1] + DAY) { if (cur) total += (cur[1] - cur[0]) / DAY + 1; cur = [a, b]; }
    else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += (cur[1] - cur[0]) / DAY + 1;
  return Math.round(total);
}

export const periodDays = (from, to) => (from && to && to >= from ? Math.round((toD(to) - toD(from)) / DAY) + 1 : 0);

export function serviceEntitlement({ start, asOf, category, rules, paused = 0 }) {
  if (!start || !asOf) return null;
  const s = toD(start), e = toD(asOf);
  if (e < s) return null;
  const days = Math.round((e - s) / DAY) + 1;
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() < s.getDate()) months--;
  months = Math.max(0, months);
  const effDays = Math.max(0, days - paused);
  const effMonths = Math.max(0, months - paused / 30.4375);
  const c = rules.categories[category] || {};
  const ordinary = category === "staff" ? round2(effDays / 10) : round2((c.amount || 15) * effMonths / 12);
  const effYears = Math.floor(effMonths / 12 + 1e-9);
  return {
    days, months, years: Math.floor(months / 12), remMonths: months % 12,
    paused, effDays, effMonths: round2(effMonths),
    ordinary, cap: 0,
    sick: effYears * (rules.sickAnnual || 30)
  };
}
