// تصدير واستيراد Excel (SheetJS محمّل من index.html كـ window.XLSX)
import { CATEGORIES, STATUS, PAY, round2 } from "./rules.js";

const X = () => window.XLSX;
const d = (iso) => (iso ? new Date(iso.length <= 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-GB") : "");
const dt = (iso) => (iso ? new Date(iso).toLocaleString("en-GB") : "");
const stamp = () => new Date().toISOString().slice(0, 10);
const safeSheet = (name, used) => {
  let n = String(name).replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || "ورقة";
  let k = n, i = 2;
  while (used.has(k)) k = `${n.slice(0, 25)} ${i++}`;
  used.add(k); return k;
};

function sheet(rows, widths) {
  const ws = X().utils.json_to_sheet(rows);
  if (widths) ws["!cols"] = widths.map((w) => ({ wch: w }));
  return ws;
}
function book() {
  const wb = X().utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  return wb;
}

const reqRow = (r) => ({
  "رقم الطلب": r.serial, "الاسم": r.employeeName, "الصنف": CATEGORIES[r.category], "القسم": r.department || "",
  "نوع الإجازة": r.typeName, "من": d(r.startDate), "إلى": d(r.endDate),
  "الساعات": r.unit === "hour" ? r.hours : "", "المدة (يوم)": r.total,
  "الصرف": r.pay && r.pay !== "none" ? PAY[r.pay] : "", "براتب (يوم)": r.paid || 0, "بدون راتب (يوم)": r.unpaid || 0,
  "الحالة": STATUS[r.status], "الرصيد قبل": r.balanceBefore ?? "", "الرصيد بعد": r.balanceAfter ?? "",
  "السبب": r.reason || "", "ملاحظة القرار": r.decisionNote || "",
  "أدخله": r.createdByName || "", "تاريخ الإدخال": dt(r.createdAt), "قرار": r.decidedByName || "", "تاريخ القرار": dt(r.decidedAt)
});
const REQ_W = [11, 26, 8, 20, 14, 11, 11, 7, 9, 12, 9, 11, 16, 9, 9, 24, 20, 16, 18, 16, 18];

const ledRow = (l, emps) => ({
  "التاريخ": dt(l.at), ...(emps ? { "الاسم": (emps.find((e) => e.id === l.employeeId) || {}).name || "" } : {}),
  "البيان": l.reason, "التغيير": l.delta, "الرصيد بعد": l.after, "بواسطة": l.byName || ""
});

function summaryRows(st) {
  const y = String(new Date().getFullYear());
  return st.employees.filter((e) => e.active !== false).sort((a, b) => a.name.localeCompare(b.name, "ar")).map((e, i) => {
    const ap = st.requests.filter((r) => r.employeeId === e.id && r.status === "approved" && (r.startDate || "").startsWith(y));
    return {
      "ت": i + 1, "الاسم": e.name, "الصنف": CATEGORIES[e.category], "اللقب / العنوان": e.title || "", "القسم / الشعبة": e.department || "",
      "الرقم الوظيفي": e.empNo || "", "الرصيد الحالي (يوم)": round2(e.balance || 0),
      [`إجازات ${y} براتب`]: round2(ap.reduce((a, r) => a + (r.paid || 0), 0)),
      [`إجازات ${y} بدون راتب`]: round2(ap.reduce((a, r) => a + (r.unpaid || 0), 0)),
      "عدد الطلبات": st.requests.filter((r) => r.employeeId === e.id).length,
      "آخر استحقاق": e.accruedThrough || ""
    };
  });
}

export function exportAll(st) {
  const wb = book();
  X().utils.book_append_sheet(wb, sheet(summaryRows(st), [5, 28, 8, 16, 22, 12, 14, 14, 16, 10, 11]), "الأرصدة");
  X().utils.book_append_sheet(wb, sheet(st.requests.map(reqRow), REQ_W), "كل الإجازات");
  X().utils.book_append_sheet(wb, sheet(st.ledger.map((l) => ledRow(l, st.employees)), [18, 26, 32, 9, 10, 16]), "حركة الأرصدة");
  // ورقة لكل منتسب
  const used = new Set(["الأرصدة", "كل الإجازات", "حركة الأرصدة"]);
  for (const e of st.employees.filter((x) => x.active !== false).sort((a, b) => a.name.localeCompare(b.name, "ar"))) {
    X().utils.book_append_sheet(wb, employeeSheet(st, e), safeSheet(e.name, used));
  }
  X().writeFile(wb, `أرصدة-الإجازات-${stamp()}.xlsx`);
}

function employeeSheet(st, e) {
  const reqs = st.requests.filter((r) => r.employeeId === e.id);
  const led = st.ledger.filter((l) => l.employeeId === e.id);
  const aoa = [
    ["الاسم", e.name], ["الصنف", CATEGORIES[e.category]], ["القسم / الشعبة", e.department || ""], ["الرقم الوظيفي", e.empNo || ""],
    ["الرصيد الحالي (يوم)", round2(e.balance || 0)], [],
    ["الإجازات"], ["رقم الطلب", "النوع", "من", "إلى", "المدة (يوم)", "الصرف", "الحالة", "ملاحظة"],
    ...reqs.map((r) => [r.serial, r.typeName, d(r.startDate), d(r.endDate), r.total, r.pay && r.pay !== "none" ? PAY[r.pay] : "", STATUS[r.status], r.decisionNote || r.reason || ""]),
    [], ["حركة الرصيد"], ["التاريخ", "البيان", "التغيير", "الرصيد بعد", "بواسطة"],
    ...led.map((l) => [dt(l.at), l.reason, l.delta, l.after, l.byName || ""])
  ];
  const ws = X().utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 14 }, { wch: 16 }, { wch: 26 }];
  return ws;
}

export function exportEmployee(st, id) {
  const e = st.employees.find((x) => x.id === id);
  const wb = book();
  X().utils.book_append_sheet(wb, employeeSheet(st, e), "التفاصيل");
  X().writeFile(wb, `إجازات-${e.name}-${stamp()}.xlsx`);
}

export function exportRequests(list) {
  const wb = book();
  X().utils.book_append_sheet(wb, sheet(list.map(reqRow), REQ_W), "الإجازات");
  X().writeFile(wb, `سجل-الإجازات-${stamp()}.xlsx`);
}

export function importTemplate() {
  const wb = book();
  X().utils.book_append_sheet(wb, sheet([
    { "الاسم": "مثال: د. محمد علي حسن", "الصنف": "تدريسي", "اللقب": "مدرس", "القسم": "قسم التصميم المعماري", "الرقم الوظيفي": "", "الرصيد الحالي": 12 },
    { "الاسم": "مثال: سارة كاظم", "الصنف": "موظف", "اللقب": "ملاحظ", "القسم": "شعبة الحسابات", "الرقم الوظيفي": "", "الرصيد الحالي": 45 }
  ], [28, 10, 14, 24, 14, 14]), "المنتسبون");
  X().writeFile(wb, "قالب-استيراد-المنتسبين.xlsx");
}

export async function readImport(file) {
  const wb = X().read(await file.arrayBuffer());
  const rows = X().utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  let skipped = 0;
  const out = [];
  for (const r of rows) {
    const name = String(r["الاسم"] || "").trim();
    if (!name || name.startsWith("مثال:")) { skipped++; continue; }
    const c = String(r["الصنف"] || "").trim();
    out.push({
      name, category: /تدريس/.test(c) ? "teaching" : "staff",
      title: String(r["اللقب"] || ""), department: String(r["القسم"] || ""), empNo: String(r["الرقم الوظيفي"] || ""),
      balance: Number(r["الرصيد الحالي"]) || 0
    });
  }
  if (!out.length) throw new Error("ما لكينا أسماء بالملف — تأكد من عناوين الأعمدة حسب القالب");
  return { rows: out, skipped };
}
