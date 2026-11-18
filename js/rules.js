// قوانين الإجازات — كلها قابلة للتعديل من صفحة الإعدادات.

export const CATEGORIES = {
  staff: "موظف",
  teaching: "تدريسي"
};

export const DEFAULT_RULES = {
  hoursPerDay: 7,                 // ساعات الدوام اليومي (لتحويل الإجازة الزمنية لأيام)
  weekendDays: [5, 6],            // الجمعة والسبت (0 = الأحد)
  excludeWeekends: true,          // عدم احتساب العطل الأسبوعية ضمن أيام الإجازة
  categories: {
    // الموظف: 3 أيام تنزل كل شهر وتتراكم إذا ما استخدمها
    staff:    { accrual: "monthly", amount: 3,  accumulate: true,  max: 0 },
    // التدريسي: 15 يوم بالسنة فقط (تتجدد ببداية كل سنة)
    teaching: { accrual: "yearly",  amount: 15, accumulate: false, max: 0 }
  },
  // deducts: balance = تُخصم من الرصيد (براتب) | none = لا تُخصم
  // unit: day | hour
  types: [
    { key: "ordinary",  name: "اعتيادية",           deducts: "balance", unit: "day",  for: ["staff", "teaching"] },
    { key: "hourly",    name: "زمنية (ساعية)",      deducts: "balance", unit: "hour", for: ["staff", "teaching"] },
    { key: "unpaid",    name: "بدون راتب",          deducts: "none",    unit: "day",  for: ["staff", "teaching"] },
    { key: "sick",      name: "مرضية",              deducts: "none",    unit: "day",  for: ["staff", "teaching"] },
    { key: "maternity", name: "أمومة",              deducts: "none",    unit: "day",  for: ["staff", "teaching"] },
    { key: "study",     name: "دراسية / تفرغ علمي", deducts: "none",    unit: "day",  for: ["teaching"] },
    { key: "other",     name: "أخرى",               deducts: "none",    unit: "day",  for: ["staff", "teaching"] }
  ]
};

export const STATUS = {
  pending: "بانتظار المعاون الإداري",
  approved: "موافق عليها",
  rejected: "مرفوضة",
  cancelled: "ملغاة"
};

export const PAY = { paid: "براتب", unpaid: "بدون راتب", partial: "جزء براتب وجزء بدون راتب" };

export const ROLES = { admin: "مسؤول النظام", assistant: "المعاون الإداري", backup: "حساب النسخ الاحتياطي" };

export const round2 = (x) => Math.round(x * 100) / 100;
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// عدد أيام الإجازة بين تاريخين (شامل)، مع استثناء العطل الأسبوعية إذا مفعّل
export function countDays(start, end, rules) {
  if (!start || !end) return 0;
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (e < s) return 0;
  let n = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    if (rules.excludeWeekends && rules.weekendDays.includes(d.getDay())) continue;
    n++;
  }
  return n;
}

// الطلب بالأيام (الزمنية تتحول لأيام)
export function requestDays(type, req, rules) {
  if (!type) return 0;
  if (type.unit === "hour") return round2((Number(req.hours) || 0) / rules.hoursPerDay);
  return Number(req.days) || 0;
}

// يحدد براتب / بدون راتب حسب الرصيد
// split = true: يحتسب المتوفر براتب والباقي بدون راتب
export function payPlan(type, total, balance, split) {
  if (!type || type.deducts === "none") return { pay: type && type.key === "unpaid" ? "unpaid" : "none", paid: 0, unpaid: type && type.key === "unpaid" ? total : 0 };
  if (total <= 0) return { pay: "paid", paid: 0, unpaid: 0 };
  if (balance >= total) return { pay: "paid", paid: total, unpaid: 0 };
  const avail = Math.max(0, round2(balance));
  if (split && avail > 0) return { pay: "partial", paid: avail, unpaid: round2(total - avail) };
  return { pay: "unpaid", paid: 0, unpaid: total };
}

// الاستحقاق المتراكم لموظف من آخر شهر محتسب لغاية الشهر الحالي
export function accrualFor(emp, rules, target = monthKey()) {
  const c = rules.categories[emp.category];
  const from = emp.accruedThrough;
  if (!c || !from || from >= target) return null;
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = target.split("-").map(Number);
  const cur = Number(emp.balance) || 0;
  let after = cur, label;
  if (c.accrual === "monthly") {
    const months = (ty - fy) * 12 + (tm - fm);
    after = cur + c.amount * months;
    label = months === 1 ? `استحقاق شهر ${target}` : `استحقاق ${months} أشهر لغاية ${target}`;
  } else {
    const years = ty - fy;
    if (years < 1) return { delta: 0, after: cur, label: "", target };
    after = c.accumulate ? cur + c.amount * years : c.amount;
    label = `رصيد سنة ${ty}` + (c.accumulate ? "" : " (تجديد)");
  }
  if (c.max > 0) after = Math.min(after, Math.max(c.max, cur));
  after = round2(after);
  return { delta: round2(after - cur), after, label, target };
}
