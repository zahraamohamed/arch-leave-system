// طبقة البيانات: Firebase (مباشر + تزامن لحظي) أو وضع تجريبي محلي بنفس الواجهة.
import { firebaseConfig, USER_DOMAIN } from "./config.js";
import { DEFAULT_RULES, round2, monthKey, accrualFor, payPlan } from "./rules.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
export const isLive = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

const state = {
  ready: false,
  user: null,            // { uid, username, name, role }
  employees: [],
  requests: [],
  ledger: [],
  users: [],
  settings: { rules: DEFAULT_RULES, university: "", logo: "" },
  online: true,
  synced: false
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
  return {
    university: s.university || "",
    logo: s.logo || "",
    rules: {
      ...DEFAULT_RULES, ...r,
      categories: {
        staff: { ...DEFAULT_RULES.categories.staff, ...((r.categories || {}).staff || {}) },
        teaching: { ...DEFAULT_RULES.categories.teaching, ...((r.categories || {}).teaching || {}) }
      },
      types: r.types && r.types.length ? r.types : DEFAULT_RULES.types
    }
  };
};

const newEmployee = (e, by) => ({
  name: String(e.name).trim(), category: e.category, department: e.department || "", title: e.title || "",
  empNo: e.empNo || "", notes: e.notes || "", active: true,
  balance: round2(Number(e.balance) || 0), accruedThrough: monthKey(),
  createdAt: now(), updatedAt: now()
});

let api;
export const store = new Proxy({}, { get: (_, k) => (...a) => api[k](...a) });

export async function initStore() {
  api = isLive ? await firebaseBackend() : demoBackend();
  await api.init();
}

/* ------------------------------------------------------------------ */
/*  Firebase                                                           */
/* ------------------------------------------------------------------ */
async function firebaseBackend() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(FB + "firebase-app.js"),
    import(FB + "firebase-auth.js"),
    import(FB + "firebase-firestore.js")
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.initializeFirestore(app, {
    localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() })
  });
  const col = (n) => F.collection(db, n);
  const ref = (n, id) => F.doc(db, n, id);
  let unsubs = [];
  let accrualDone = false;

  const listen = () => {
    const pending = {};
    const watch = (q, key) =>
      F.onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
        state[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        pending[key] = snap.metadata.hasPendingWrites || snap.metadata.fromCache;
        state.synced = !Object.values(pending).some(Boolean);
        emit();
        if (key === "employees" && !accrualDone && !snap.metadata.fromCache) { accrualDone = true; autoAccrue().catch(console.error); }
      }, (err) => console.error(key, err));
    unsubs = [
      watch(col("employees"), "employees"),
      watch(F.query(col("requests"), F.orderBy("createdAt", "desc")), "requests"),
      watch(col("users"), "users"),
      F.onSnapshot(ref("settings", "main"), (d) => { state.settings = mergeSettings(d.data()); emit(); })
    ];
  };

  const me = () => ({ by: state.user.uid, byName: state.user.name });

  // الاستحقاق التلقائي: كل موظف بمعاملة مستقلة، فما ينضاف الرصيد مرتين حتى لو فتح أكثر من شخص بنفس الوقت
  async function autoAccrue() {
    const target = monthKey();
    for (const e of state.employees.filter((x) => x.active !== false && x.accruedThrough < target)) {
      await F.runTransaction(db, async (t) => {
        const s = await t.get(ref("employees", e.id));
        const cur = { id: s.id, ...s.data() };
        const a = accrualFor(cur, state.settings.rules, target);
        if (!a) return;
        t.update(ref("employees", e.id), { balance: a.after, accruedThrough: target, updatedAt: now() });
        if (a.delta) t.set(ref("ledger", uid()), { employeeId: e.id, delta: a.delta, after: a.after, reason: a.label, auto: true, at: now(), by: "system", byName: "النظام (تلقائي)" });
      });
    }
  }

  return {
    async init() {
      window.addEventListener("online", () => { state.online = true; emit(); });
      window.addEventListener("offline", () => { state.online = false; emit(); });
      state.online = navigator.onLine;
      await new Promise((res) => {
        A.onAuthStateChanged(auth, async (u) => {
          unsubs.forEach((f) => f()); unsubs = []; accrualDone = false;
          if (!u) { state.user = null; state.ready = true; emit(); return res(); }
          try {
            const d = (await F.getDoc(ref("users", u.uid))).data();
            if (!d || !d.active || !["admin", "assistant"].includes(d.role)) throw new Error("inactive");
            state.user = { uid: u.uid, username: d.username, name: d.name, role: d.role };
            listen();
          } catch (err) { console.error("login profile", err); state.user = null; state.loginError = err.message === "inactive" ? "الحساب غير مفعّل" : "تعذر تحميل بيانات الحساب"; await A.signOut(auth); }
          state.ready = true; emit(); res();
        });
      });
    },
    async needsBootstrap() {
      try { return !(await F.getDoc(ref("meta", "bootstrap"))).exists(); } catch { return false; }
    },
    async bootstrap({ username, password, name }) {
      const c = await A.createUserWithEmailAndPassword(auth, toEmail(username), password);
      const b = F.writeBatch(db);
      b.set(ref("users", c.user.uid), { username, name, role: "admin", active: true, createdAt: now() });
      b.set(ref("meta", "bootstrap"), { done: true, at: now() });
      b.set(ref("settings", "main"), { rules: DEFAULT_RULES, university: "", logo: "" });
      await b.commit();
      location.reload();
    },
    async login(username, password) { await A.signInWithEmailAndPassword(auth, toEmail(username), password); },
    async logout() { await A.signOut(auth); },
    async createUser({ username, password, name, role }) {
      const sec = initializeApp(firebaseConfig, "sec-" + Date.now()); // حتى ما يطلع المسؤول من حسابه
      const sa = A.getAuth(sec);
      const c = await A.createUserWithEmailAndPassword(sa, toEmail(username), password);
      await A.signOut(sa);
      await F.setDoc(ref("users", c.user.uid), { username, name, role, active: true, createdAt: now() });
    },
    async setUserActive(id, active) { await F.updateDoc(ref("users", id), { active }); },
    async changePassword(newPw) { await A.updatePassword(auth.currentUser, newPw); },

    async saveEmployee(e) {
      if (e.id) {
        return F.updateDoc(ref("employees", e.id), { name: e.name.trim(), category: e.category, department: e.department || "",
          title: e.title || "", empNo: e.empNo || "", notes: e.notes || "", updatedAt: now() });
      }
      const id = uid(), d = newEmployee(e);
      const b = F.writeBatch(db);
      b.set(ref("employees", id), d);
      b.set(ref("ledger", uid()), { employeeId: id, delta: d.balance, after: d.balance, reason: "رصيد افتتاحي", at: now(), ...me() });
      await b.commit();
    },
    async importEmployees(rows) {
      for (let i = 0; i < rows.length; i += 200) {
        const b = F.writeBatch(db);
        for (const r of rows.slice(i, i + 200)) {
          const id = uid(), d = newEmployee(r);
          b.set(ref("employees", id), d);
          b.set(ref("ledger", uid()), { employeeId: id, delta: d.balance, after: d.balance, reason: "رصيد افتتاحي (استيراد)", at: now(), ...me() });
        }
        await b.commit();
      }
    },
    async archiveEmployee(id, active) { await F.updateDoc(ref("employees", id), { active, updatedAt: now() }); },
    async adjustBalance(employeeId, delta, reason) {
      await F.runTransaction(db, async (t) => {
        const s = await t.get(ref("employees", employeeId));
        const after = round2((s.data().balance || 0) + delta);
        t.update(ref("employees", employeeId), { balance: after, updatedAt: now() });
        t.set(ref("ledger", uid()), { employeeId, delta, after, reason, at: now(), ...me() });
      });
    },
    async createRequest(r) {
      await F.runTransaction(db, async (t) => {
        const cRef = ref("meta", "counter-" + year());
        const c = await t.get(cRef);
        const n = (c.exists() ? c.data().n : 0) + 1;
        t.set(cRef, { n });
        t.set(ref("requests", uid()), { ...r, serial: `${year()}/${String(n).padStart(4, "0")}`, status: "pending",
          createdAt: now(), createdBy: state.user.uid, createdByName: state.user.name });
      });
    },
    async decideRequest(id, approve, note) {
      await F.runTransaction(db, async (t) => {
        const rRef = ref("requests", id);
        const r = (await t.get(rRef)).data();
        if (r.status !== "pending") throw new Error("تم البت بهذا الطلب مسبقاً");
        const eRef = ref("employees", r.employeeId);
        const e = (await t.get(eRef)).data();
        const upd = { status: approve ? "approved" : "rejected", decisionNote: note || "", decidedAt: now(),
          decidedBy: state.user.uid, decidedByName: state.user.name };
        if (approve) Object.assign(upd, applyApproval(r, e, (after, delta) => {
          t.update(eRef, { balance: after, updatedAt: now() });
          t.set(ref("ledger", uid()), { employeeId: r.employeeId, delta, after, reason: `إجازة ${r.typeName} — طلب ${r.serial}`, requestId: id, at: now(), ...me() });
        }));
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
    async saveSettings(s) { await F.setDoc(ref("settings", "main"), s, { merge: true }); },
    async loadLedger(employeeId) {
      const q = employeeId ? F.query(col("ledger"), F.where("employeeId", "==", employeeId)) : col("ledger");
      const snap = await F.getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.at.localeCompare(a.at));
    },
    async restore() { throw new Error("الاستعادة الكاملة تتم من نسخ GitHub الاحتياطية (راجع README)"); }
  };
}

// عند الموافقة: يعاد فحص الرصيد لحظة القرار (ممكن تغيّر بعد تقديم الطلب)
function applyApproval(r, e, write) {
  const before = round2(e.balance || 0);
  const plan = r.deducts === "balance" ? payPlan({ deducts: "balance" }, r.total, before, r.split) : { pay: r.pay, paid: 0, unpaid: r.unpaid || 0 };
  const out = { balanceBefore: before, balanceAfter: before, pay: plan.pay, paid: plan.paid, unpaid: plan.unpaid };
  if (plan.paid > 0) {
    out.balanceAfter = round2(before - plan.paid);
    write(out.balanceAfter, -plan.paid);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  الوضع التجريبي (localStorage + تزامن بين التبويبات)                 */
/* ------------------------------------------------------------------ */
function demoBackend() {
  const KEY = "arch-leave-demo-v2";
  const SKEY = "arch-leave-demo-session";
  const ch = "BroadcastChannel" in window ? new BroadcastChannel(KEY) : null;
  let db;

  const seed = () => {
    const t = now();
    const prev = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return monthKey(d); })();
    const emp = (name, category, department, title, balance) =>
      ({ id: uid(), ...newEmployee({ name, category, department, title, balance }), accruedThrough: prev });
    const employees = [
      emp("د. أحمد كاظم الجبوري", "teaching", "قسم التصميم المعماري", "أستاذ مساعد", 15),
      emp("د. سارة عبد الرحمن", "teaching", "قسم التخطيط الحضري", "مدرس", 9),
      emp("م. علي حسين الموسوي", "teaching", "قسم التصميم المعماري", "مدرس مساعد", 2),
      emp("زينب محمد جاسم", "staff", "شعبة الموارد البشرية", "ملاحظ", 93),
      emp("حيدر عباس كريم", "staff", "شعبة الحسابات", "محاسب", 58.5),
      emp("نور الهدى سلمان", "staff", "شعبة التسجيل", "مبرمج", 1)
    ];
    return {
      users: [
        { id: "u-admin", username: "admin", password: "admin123", name: "مسؤول النظام", role: "admin", active: true },
        { id: "u-asst", username: "assistant", password: "assist123", name: "المعاون الإداري", role: "assistant", active: true }
      ],
      employees,
      requests: [],
      ledger: employees.map((e) => ({ id: uid(), employeeId: e.id, delta: e.balance, after: e.balance, reason: "رصيد افتتاحي", at: t, by: "u-admin", byName: "مسؤول النظام" })),
      settings: { rules: DEFAULT_RULES },
      counter: 0
    };
  };
  const load = () => { try { db = JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { db = seed(); } };
  const project = () => {
    const u = db.users.find((x) => x.id === localStorage.getItem(SKEY) && x.active);
    state.user = u ? { uid: u.id, username: u.username, name: u.name, role: u.role } : null;
    state.employees = db.employees;
    state.requests = [...db.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    state.ledger = [...db.ledger].sort((a, b) => b.at.localeCompare(a.at));
    state.users = db.users.map(({ password, ...x }) => x);
    state.settings = mergeSettings(db.settings);
    state.synced = true; state.online = true;
    emit();
  };
  const save = () => { localStorage.setItem(KEY, JSON.stringify(db)); ch && ch.postMessage("sync"); project(); };
  const me = () => ({ by: state.user.uid, byName: state.user.name });
  const emp = (id) => db.employees.find((e) => e.id === id);
  const wait = () => new Promise((r) => setTimeout(r, 120));
  const autoAccrue = () => {
    const rules = mergeSettings(db.settings).rules;
    let changed = false;
    for (const e of db.employees.filter((x) => x.active !== false)) {
      const a = accrualFor(e, rules);
      if (!a) continue;
      e.balance = a.after; e.accruedThrough = a.target; changed = true;
      if (a.delta) db.ledger.push({ id: uid(), employeeId: e.id, delta: a.delta, after: a.after, reason: a.label, auto: true, at: now(), by: "system", byName: "النظام (تلقائي)" });
    }
    if (changed) save();
  };

  return {
    async init() {
      load(); localStorage.setItem(KEY, JSON.stringify(db));
      ch && (ch.onmessage = () => { load(); project(); });
      window.addEventListener("storage", (e) => { if (e.key === KEY || e.key === SKEY) { load(); project(); } });
      state.ready = true; project();
      if (state.user) autoAccrue();
    },
    async needsBootstrap() { return false; },
    async login(username, password) {
      await wait();
      const u = db.users.find((x) => x.username === username.trim().toLowerCase() && x.password === password && x.active);
      if (!u) throw Object.assign(new Error("bad"), { code: "auth/invalid-credential" });
      localStorage.setItem(SKEY, u.id); project(); autoAccrue();
    },
    async logout() { localStorage.removeItem(SKEY); project(); },
    async createUser({ username, password, name, role }) {
      if (db.users.some((u) => u.username === username)) throw new Error("اسم المستخدم مستخدم مسبقاً");
      db.users.push({ id: uid(), username, password, name, role, active: true }); save();
    },
    async setUserActive(id, active) { db.users.find((u) => u.id === id).active = active; save(); },
    async changePassword(pw) { db.users.find((u) => u.id === state.user.uid).password = pw; save(); },
    async saveEmployee(e) {
      await wait();
      if (e.id) Object.assign(emp(e.id), { name: e.name.trim(), category: e.category, department: e.department || "", title: e.title || "", empNo: e.empNo || "", notes: e.notes || "", updatedAt: now() });
      else {
        const id = uid(), d = newEmployee(e);
        db.employees.push({ id, ...d });
        db.ledger.push({ id: uid(), employeeId: id, delta: d.balance, after: d.balance, reason: "رصيد افتتاحي", at: now(), ...me() });
      }
      save();
    },
    async importEmployees(rows) {
      for (const r of rows) {
        const id = uid(), d = newEmployee(r);
        db.employees.push({ id, ...d });
        db.ledger.push({ id: uid(), employeeId: id, delta: d.balance, after: d.balance, reason: "رصيد افتتاحي (استيراد)", at: now(), ...me() });
      }
      save();
    },
    async archiveEmployee(id, active) { emp(id).active = active; save(); },
    async adjustBalance(employeeId, delta, reason) {
      const e = emp(employeeId); e.balance = round2((e.balance || 0) + delta);
      db.ledger.push({ id: uid(), employeeId, delta, after: e.balance, reason, at: now(), ...me() }); save();
    },
    async createRequest(r) {
      await wait();
      db.counter = (db.counter || 0) + 1;
      db.requests.push({ id: uid(), ...r, serial: `${year()}/${String(db.counter).padStart(4, "0")}`, status: "pending", createdAt: now(), createdBy: state.user.uid, createdByName: state.user.name });
      save();
    },
    async decideRequest(id, approve, note) {
      await wait(); load();
      const r = db.requests.find((x) => x.id === id);
      if (r.status !== "pending") throw new Error("تم البت بهذا الطلب مسبقاً");
      const e = emp(r.employeeId);
      Object.assign(r, { status: approve ? "approved" : "rejected", decisionNote: note || "", decidedAt: now(), decidedBy: state.user.uid, decidedByName: state.user.name });
      if (approve) Object.assign(r, applyApproval(r, e, (after, delta) => {
        e.balance = after;
        db.ledger.push({ id: uid(), employeeId: e.id, delta, after, reason: `إجازة ${r.typeName} — طلب ${r.serial}`, requestId: id, at: now(), ...me() });
      }));
      save();
    },
    async cancelRequest(id) {
      const r = db.requests.find((x) => x.id === id);
      if (r.status !== "pending") throw new Error("لا يمكن إلغاء طلب تم البت به");
      Object.assign(r, { status: "cancelled", decidedAt: now(), decidedBy: state.user.uid, decidedByName: state.user.name }); save();
    },
    async saveSettings(s) { db.settings = { ...db.settings, ...s }; save(); },
    async loadLedger(employeeId) { return state.ledger.filter((l) => !employeeId || l.employeeId === employeeId); },
    async restore(data) { const keep = db.users; db = { ...data, users: keep }; save(); },
    async resetDemo() { db = seed(); save(); }
  };
}
