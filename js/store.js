// طبقة البيانات: Firebase (Auth + Firestore) مع تزامن لحظي وتخزين محلي عند انقطاع النت.
import { firebaseConfig, USER_DOMAIN } from "./config.js?v=202611181337";
import { DEFAULT_RULES, round2, monthKey, accrualFor, payPlan, retroAccrualOverpaid } from "./rules.js?v=202611181337";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const APP_ROLES = ["superadmin", "admin", "assistant"];

const state = {
  ready: false, user: null,
  employees: [], requests: [], users: [],
  settings: { rules: DEFAULT_RULES, university: "", logo: "" },
  online: true, synced: false, loginError: ""
};
const listeners = new Set();
export const getState = () => state;
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn(state));

const now = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const year = () => new Date().getFullYear();
const toEmail = (u) => `${String(u).trim().toLowerCase()}@${USER_DOMAIN}`;

export const mergeSettings = (s = {}) => {
  const r = s.rules || {};
  const base = (r.version || 1) < DEFAULT_RULES.version ? {} : r; // إعدادات قديمة ← القوانين الجديدة
  return {
    university: s.university || "", logo: s.logo || "",
    rules: {
      ...DEFAULT_RULES, ...base,
      categories: {
        staff: { ...DEFAULT_RULES.categories.staff, ...((base.categories || {}).staff || {}), max: 0 },
        teaching: { ...DEFAULT_RULES.categories.teaching, ...((base.categories || {}).teaching || {}), max: 0 }
      },
      types: DEFAULT_RULES.types,
      version: DEFAULT_RULES.version
    }
  };
};

export const store = {};

export async function initStore() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  // وضع الاتصال: عادي (مع تخزين محلي) أو متوافق (long polling بدون تخزين) إذا الشبكة أو المتصفح يمنع الاتصال العادي
  const LP_KEY = "arch-leave-compat";
  let compat = false;
  try { compat = localStorage.getItem(LP_KEY) === "1"; } catch {}
  let db;
  try {
    db = compat
      ? F.initializeFirestore(app, { localCache: F.memoryLocalCache(), experimentalForceLongPolling: true })
      : F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }), experimentalAutoDetectLongPolling: true });
  } catch (e) {
    console.warn("firestore init fallback", e);
    db = F.initializeFirestore(app, { localCache: F.memoryLocalCache(), experimentalForceLongPolling: true });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function loadProfile(id) {
    let last;
    for (let i = 0; i < 4; i++) {
      try { const s = await F.getDocFromServer(F.doc(db, "users", id)); return s.data(); }
      catch (e) { last = e; if (e.code === "permission-denied") break; await sleep(1200 * (i + 1)); }
    }
    try { const s = await F.getDocFromCache(F.doc(db, "users", id)); if (s.exists()) return s.data(); } catch {}
    throw last;
  }
  const col = (n) => F.collection(db, n);
  const ref = (n, id) => F.doc(db, n, id);
  let unsubs = [], accrualDone = false;
  const me = () => ({ by: state.user.uid, byName: state.user.name });

  const listen = () => {
    const pending = {};
    const watch = (q, key) => F.onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      state[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => key !== "employees" || !x.deleted);
      pending[key] = snap.metadata.hasPendingWrites || snap.metadata.fromCache;
      state.synced = !Object.values(pending).some(Boolean);
      emit();
      if (key === "employees" && !accrualDone && !snap.metadata.fromCache) { accrualDone = true; autoAccrue().catch(console.error); }
    }, (err) => console.error(key, err));
    unsubs = [
      watch(col("employees"), "employees"),
      watch(F.query(col("requests"), F.orderBy("createdAt", "desc")), "requests"),
      F.onSnapshot(ref("settings", "main"), (d) => { state.settings = mergeSettings(d.data()); emit(); })
    ];
    if (state.user.role === "superadmin") unsubs.push(watch(col("users"), "users"));
  };

  // الاستحقاق التلقائي — معاملة مستقلة لكل منتسب حتى ما ينضاف مرتين
  async function autoAccrue() {
    const target = monthKey();
    for (const e of state.employees.filter((x) => x.active !== false && (x.accruedThrough || "") < target)) {
      await F.runTransaction(db, async (t) => {
        const s = await t.get(ref("employees", e.id));
        const pauseTypes = state.settings.rules.types.filter((x) => x.pausesAccrual).map((x) => x.key);
        const pauses = state.requests
          .filter((r) => r.employeeId === e.id && r.kind !== "withdrawal" && r.status === "approved" && !r.deleted && pauseTypes.includes(r.type))
          .map((r) => ({ from: r.startDate, to: r.endDate || r.startDate }));
        const a = accrualFor({ id: s.id, ...s.data() }, state.settings.rules, target, pauses);
        if (!a) return;
        t.update(ref("employees", e.id), { balance: a.balance, sick: a.sick, accruedThrough: target, updatedAt: now() });
        const sys = { at: now(), by: "system", byName: "النظام (تلقائي)", auto: true, employeeId: e.id };
        if (a.dBalance) t.set(ref("ledger", uid()), { ...sys, field: "balance", delta: a.dBalance, after: a.balance, reason: a.label });
        if (a.dSick) t.set(ref("ledger", uid()), { ...sys, field: "sick", delta: a.dSick, after: a.sick, reason: a.label });
      });
    }
  }

  window.addEventListener("online", () => { state.online = true; emit(); });
  window.addEventListener("offline", () => { state.online = false; emit(); });
  state.online = navigator.onLine;

  await new Promise((res) => {
    A.onAuthStateChanged(auth, async (u) => {
      unsubs.forEach((f) => f()); unsubs = []; accrualDone = false;
      if (!u) { state.user = null; state.ready = true; emit(); return res(); }
      try {
        const d = await loadProfile(u.uid);
        if (!d || !d.active || !APP_ROLES.includes(d.role)) throw new Error("inactive");
        state.user = { uid: u.uid, username: d.username, name: d.name, role: d.role };
        state.loginError = "";
        listen();
      } catch (err) {
        console.error("login profile", err);
        // أول فشل اتصال: نجرب الوضع المتوافق تلقائياً (الجلسة تبقى، فيدخل وحده بعد إعادة التحميل)
        if (err.message !== "inactive" && err.code !== "permission-denied" && !compat) {
          try { localStorage.setItem(LP_KEY, "1"); } catch {}
          location.reload();
          return;
        }
        state.user = null;
        state.loginError = err.message === "inactive" ? "هذا الحساب موقوف أو غير مخوّل"
          : `تعذر تحميل بيانات الحساب (${err.code || err.message}). تأكد من الإنترنت، وإذا عندك مانع إعلانات أوقفه لهذا الموقع، أو جرّب متصفح ثاني.`;
        try { localStorage.removeItem(LP_KEY); } catch {}
        await A.signOut(auth);
      }
      state.ready = true; emit(); res();
    });
  });

  Object.assign(store, {
    async login(username, password) { await A.signInWithEmailAndPassword(auth, toEmail(username), password); },
    async logout() { await A.signOut(auth); },

    // ---------- الحسابات (سوبر أدمن) ----------
    async createUser({ username, password, name, role }) {
      const sec = initializeApp(firebaseConfig, "sec-" + Date.now()); // حتى ما يطلع السوبر أدمن من حسابه
      const sa = A.getAuth(sec);
      const c = await A.createUserWithEmailAndPassword(sa, toEmail(username), password);
      await A.signOut(sa);
      await F.setDoc(ref("users", c.user.uid), { username, name, role, active: true, createdAt: now() });
    },
    async setUserActive(id, active) { await F.updateDoc(ref("users", id), { active }); },
    async changePassword(newPw) { await A.updatePassword(auth.currentUser, newPw); },

    // ---------- المنتسبون ----------
    async saveEmployee(e) {
      const info = { name: e.name.trim(), category: e.category, department: e.department || "", title: e.title || "", empNo: e.empNo || "", notes: e.notes || "", updatedAt: now() };
      if (e.id) return F.updateDoc(ref("employees", e.id), info);
      const id = uid(), balance = round2(e.balance), sick = round2(e.sick === "" || e.sick == null ? 30 : e.sick);
      const b = F.writeBatch(db);
      b.set(ref("employees", id), { ...info, active: true, balance, sick, accruedThrough: monthKey(), createdAt: now() });
      b.set(ref("ledger", uid()), { employeeId: id, field: "balance", delta: balance, after: balance, reason: "رصيد افتتاحي", at: now(), ...me() });
      b.set(ref("ledger", uid()), { employeeId: id, field: "sick", delta: sick, after: sick, reason: "رصيد مرضي افتتاحي", at: now(), ...me() });
      await b.commit();
    },
    async importEmployees(rows) {
      for (let i = 0; i < rows.length; i += 150) {
        const b = F.writeBatch(db);
        for (const r of rows.slice(i, i + 150)) {
          const id = uid(), balance = round2(r.balance), sick = round2(r.sick ?? 30);
          b.set(ref("employees", id), { name: r.name, category: r.category, department: r.department || "", title: r.title || "", empNo: r.empNo || "", notes: "", active: true, balance, sick, accruedThrough: monthKey(), createdAt: now(), updatedAt: now() });
          b.set(ref("ledger", uid()), { employeeId: id, field: "balance", delta: balance, after: balance, reason: "رصيد افتتاحي (استيراد)", at: now(), ...me() });
        }
        await b.commit();
      }
    },
    async archiveEmployee(id, active) { await F.updateDoc(ref("employees", id), { active, updatedAt: now() }); },
    // حذف المنتسب (سوبر أدمن): يختفي من النظام، ويبقى سجله بالنسخ الاحتياطية
    async deleteEmployee(id) {
      if (state.requests.some((r) => r.employeeId === id && r.status === "pending")) throw new Error("عنده طلب معلّق — احذف الطلب أو انتظر قرار المعاون أولاً");
      await F.updateDoc(ref("employees", id), { deleted: true, active: false, deletedAt: now(), deletedBy: state.user.uid, deletedByName: state.user.name, updatedAt: now() });
    },
    async adjustBalance(employeeId, field, delta, reason) {
      await F.runTransaction(db, async (t) => {
        const s = await t.get(ref("employees", employeeId));
        const after = round2((s.data()[field] || 0) + delta);
        t.update(ref("employees", employeeId), { [field]: after, updatedAt: now() });
        t.set(ref("ledger", uid()), { employeeId, field, delta, after, reason, at: now(), ...me() });
      });
    },

    // ---------- الطلبات ----------
    async createRequest(r) {
      await F.runTransaction(db, async (t) => {
        const cRef = ref("meta", "counter-" + year());
        const c = await t.get(cRef);
        const n = (c.exists() ? c.data().n : 0) + 1;
        t.set(cRef, { n });
        t.set(ref("requests", uid()), { kind: "leave", ...r, serial: `${year()}/${String(n).padStart(4, "0")}`, status: "pending",
          createdAt: now(), createdBy: state.user.uid, createdByName: state.user.name });
      });
    },
    // طلب سحب إجازة موافق عليها — يروح للمعاون الإداري
    async createWithdrawal(originalId, reason) {
      const o = state.requests.find((x) => x.id === originalId);
      if (!o || o.status !== "approved") throw new Error("يمكن سحب الإجازات الموافق عليها فقط");
      if (state.requests.some((x) => x.kind === "withdrawal" && x.originalId === originalId && x.status === "pending")) throw new Error("يوجد طلب سحب معلّق لهذه الإجازة");
      await store.createRequest({
        kind: "withdrawal", originalId, originalSerial: o.serial,
        employeeId: o.employeeId, employeeName: o.employeeName, category: o.category, department: o.department || "",
        type: o.type, typeName: o.typeName, unit: o.unit, deducts: o.deducts,
        startDate: o.startDate, endDate: o.endDate, days: o.days || 0, hours: o.hours || 0, total: o.total,
        paid: o.paid || 0, half: o.half || 0, unpaid: o.unpaid || 0, pay: o.pay || "", reason: reason || ""
      });
    },
    async decideRequest(id, approve, note) {
      await F.runTransaction(db, async (t) => {
        const rRef = ref("requests", id);
        const r = { id, ...(await t.get(rRef)).data() };
        if (r.status !== "pending") throw new Error("تم البت بهذا الطلب مسبقاً");
        const field = r.deducts === "sick" ? "sick" : "balance";
        const eRef = ref("employees", r.employeeId);
        const e = { id: r.employeeId, ...(await t.get(eRef)).data() };
        let oRef, o;
        if (r.kind === "withdrawal") { oRef = ref("requests", r.originalId); o = (await t.get(oRef)).data(); }
        const upd = { status: approve ? "approved" : "rejected", decisionNote: note || "", decidedAt: now(), decidedBy: state.user.uid, decidedByName: state.user.name };
        const ledger = (delta, after, reason) => t.set(ref("ledger", uid()), { employeeId: r.employeeId, field, delta, after, reason, requestId: id, at: now(), ...me() });

        if (approve && r.kind === "withdrawal") {
          if (o.status !== "approved") throw new Error("الإجازة الأصلية ليست موافقاً عليها");
          const refund = r.deducts === "none" ? 0 : round2(o.paid || 0);
          const before = round2(e[field] || 0), after = round2(before + refund);
          Object.assign(upd, { refund, balanceBefore: before, balanceAfter: after, balanceField: field });
          if (refund) { t.update(eRef, { [field]: after, updatedAt: now() }); ledger(refund, after, `سحب إجازة ${o.typeName} — طلب ${o.serial}`); }
          // إذا انسترجع استحقاق بسبب هالإجازة (أمومة/وضع/بدون راتب)، يرجع للرصيد عند سحبها
          if (o.accrualReversed > 0) {
            const base = refund ? after : round2(e.balance || 0);
            const nb = round2(base + o.accrualReversed);
            t.update(eRef, { balance: nb, updatedAt: now() });
            t.set(ref("ledger", uid()), { employeeId: r.employeeId, field: "balance", delta: o.accrualReversed, after: nb, reason: `إرجاع الاستحقاق بعد سحب ${o.typeName} — طلب ${o.serial}`, requestId: id, at: now(), ...me() });
            Object.assign(upd, { refund: round2(refund + o.accrualReversed), balanceAfter: nb, balanceField: "balance" });
          }
          t.update(oRef, { status: "withdrawn", withdrawnAt: now(), withdrawnBy: state.user.uid, withdrawnByName: state.user.name, withdrawalId: id });
        } else if (approve) {
          const type = state.settings.rules.types.find((x) => x.key === r.type) || { deducts: r.deducts, unit: r.unit, fixedPay: r.pay === "unpaid" ? "unpaid" : "paid" };
          const plan = payPlan({ type, total: r.total, employee: e, rules: state.settings.rules, requests: state.requests, startDate: r.startDate, excludeId: id, split: r.split !== false });
          const before = round2(e[field] || 0), after = plan.fromBalance ? round2(before - plan.paid) : before;
          Object.assign(upd, { pay: plan.pay, paid: plan.paid, half: plan.half, unpaid: plan.unpaid, balanceBefore: before, balanceAfter: after, balanceField: field });
          if (plan.fromBalance && plan.paid > 0) { t.update(eRef, { [field]: after, updatedAt: now() }); ledger(-plan.paid, after, `إجازة ${r.typeName} — طلب ${r.serial}`); }
          // أمومة / وضع / بدون راتب بأثر رجعي: نسترجع الاستحقاق اللي انضاف عن أشهرها
          if (type.pausesAccrual) {
            const over = retroAccrualOverpaid(e, state.settings.rules, r.startDate, r.endDate);
            if (over > 0) {
              const nb = round2((e.balance || 0) - over);
              t.update(eRef, { balance: nb, updatedAt: now() });
              t.set(ref("ledger", uid()), { employeeId: r.employeeId, field: "balance", delta: -over, after: nb, reason: `استرجاع استحقاق عن مدة ${r.typeName} (طلب ${r.serial}) — لا يُستحق رصيد عنها`, requestId: id, at: now(), ...me() });
              Object.assign(upd, { accrualReversed: over, balanceAfter: nb, balanceField: "balance" });
            }
          }
        }
        t.update(rRef, upd);
      });
    },
    async cancelRequest(id) {
      await F.runTransaction(db, async (t) => {
        const r = (await t.get(ref("requests", id))).data();
        if (r.status !== "pending") throw new Error("لا يمكن إلغاء طلب تم البت به");
        t.update(ref("requests", id), { status: "cancelled", decidedAt: now(), decidedBy: state.user.uid, decidedByName: state.user.name });
      });
    },
    // حذف ناعم: يختفي من القوائم ويبقى محفوظاً بالقاعدة للتدقيق
    async deleteRequest(id) {
      const r = state.requests.find((x) => x.id === id);
      if (r.status === "approved") throw new Error("الإجازة الموافق عليها تُسحب ولا تُحذف");
      const upd = { deleted: true, deletedAt: now(), deletedBy: state.user.uid, deletedByName: state.user.name };
      if (r.status === "pending") Object.assign(upd, { status: "cancelled", decidedAt: now(), decidedBy: state.user.uid, decidedByName: state.user.name });
      await F.updateDoc(ref("requests", id), upd);
    },

    async saveSettings(s) { await F.setDoc(ref("settings", "main"), s, { merge: true }); },
    async loadLedger(employeeId) {
      const q = employeeId ? F.query(col("ledger"), F.where("employeeId", "==", employeeId)) : col("ledger");
      const snap = await F.getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.at.localeCompare(a.at));
    }
  });
}
