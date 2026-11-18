// إشعارات النظام: تظهر على الموبايل واللابتوب ما دام الموقع مفتوح (حتى لو بتبويب بالخلفية)،
// وعلى الموبايل تشتغل أفضل إذا انضاف الموقع للشاشة الرئيسية.
let reg = null;
export const supported = () => "Notification" in window;
export const permission = () => (supported() ? Notification.permission : "unsupported");

export async function initNotifications() {
  if ("serviceWorker" in navigator) {
    try { reg = await navigator.serviceWorker.register("sw.js"); } catch (e) { console.warn("sw", e); }
  }
}
export async function enableNotifications() {
  if (!supported()) return "unsupported";
  const p = await Notification.requestPermission();
  if (p === "granted") await notify("تم تفعيل الإشعارات", "راح توصلك تنبيهات الطلبات على هذا الجهاز", "#/");
  return p;
}
let ctx;
function beep() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.0001;
    o.connect(g); g.connect(ctx.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.stop(ctx.currentTime + 0.55);
  } catch {}
}
export async function notify(title, body, url = "#/", tag) {
  beep();
  if (permission() !== "granted") return;
  const opts = { body, icon: "assets/icon-192.png", badge: "assets/icon-192.png", dir: "rtl", lang: "ar", tag: tag || url, renotify: true, data: { url }, vibrate: [120, 60, 120] };
  try {
    const r = reg || (await navigator.serviceWorker?.getRegistration());
    if (r) return r.showNotification(title, opts);
  } catch {}
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); location.hash = url; n.close(); }; } catch {}
}
