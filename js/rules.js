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
    // م43: يوم عن كل 10 أيام خدمة = 3 أيام بالشهر، تتراكم لحد 180 يوم، ولا يمنح أكثر من 120 يوم براتب بالمرة الواحدة
    staff:    { accrual: "monthly", amount: 3, max: 180, maxPaidPerLeave: 120, maxPaidPerYear: 0, maxUnpaidPerLeave: 60 },
    // م10 خدمة جامعية: 15 يوم عن كل سنة دراسية تتراكم، ولا يمنح أكثر من 30 يوم خلال السنة الدراسية الواحدة
    teaching: { accrual: "academic", amount: 15, max: 0, maxPaidPerLeave: 0, maxPaidPerYear: 30, maxUnpaidPerLeave: 60 }
  },
  // deducts: balance (الرصيد الاعتيادي) | sick (الرصيد المرضي) | none
  // fixedPay لأنواع لا تخصم: paid | unpaid
  types: [
    { key: "ordinary",   name: "اعتيادية",            deducts: "balance", unit: "day",  for: ["staff", "teaching"] },
    { key: "hourly",     name: "زمنية (ساعية)",       deducts: "balance", unit: "hour", for: ["staff", "teaching"] },
    { key: "sick",       name: "مرضية",               deducts: "sick",    unit: "day",  for: ["staff", "teaching"] },
    { key: "unpaid",     name: "بدون راتب",           deducts: "none",    unit: "day",  for: ["staff", "teaching"], fixedPay: "unpaid" },
    { key: "maternity",  name: "أمومة / وضع",         deducts: "none",    unit: "day",  for: ["staff", "teaching"], fixedPay: "paid" },
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
  if (out.unpaid > 0 && c.maxUnpaidPerLeave > 0 && out.unpaid > c.maxUnpaidPerLeave) out.notes.push(`تنبيه: بدون راتب أكثر من ${c.maxUnpaidPerLeave} يوم (م43/4)`);
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
export function accrualFor(emp, rules, target = monthKey()) {
  const c = rules.categories[emp.category];
  const from = emp.accruedThrough;
  if (!c || !from || from >= target) return null;
  let [y, m] = from.split("-").map(Number);
  let bal = round2(emp.balance), sick = round2(emp.sick);
  const labels = [];
  let addB = 0, addS = 0;
  while (true) {
    m++; if (m > 12) { m = 1; y++; }
    const k = `${y}-${String(m).padStart(2, "0")}`;
    if (k > target) break;
    if (c.accrual === "monthly") addB += c.amount;
    if (c.accrual === "academic" && m === rules.academicYearStartMonth) { addB += c.amount; labels.push(`رصيد السنة الدراسية ${y}/${y + 1}`); }
    if (m === 1 && rules.sickAnnual) { addS += rules.sickAnnual; labels.push(`رصيد مرضي ${y}`); }
  }
  let newB = round2(bal + addB);
  if (c.max > 0) newB = Math.min(newB, Math.max(c.max, bal));
  const label = c.accrual === "monthly" ? `استحقاق لغاية ${target}` : (labels.join(" · ") || `تحديث ${target}`);
  return { target, balance: newB, dBalance: round2(newB - bal), sick: round2(sick + addS), dSick: addS, label };
}

// حاسبة الاستحقاق من تاريخ المباشرة
//  الموظف: يوم عن كل 10 أيام خدمة (م43)، والرصيد المتراكم لا يتجاوز الحد (180)
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
    ordinary, cap: c.max || 0,
    sick: effYears * (rules.sickAnnual || 30)
  };
}
