// إعدادات Firebase — تنملأ مرة وحدة بعد إنشاء مشروع Firebase.
// إذا بقت فارغة، النظام يشتغل بـ"الوضع التجريبي" (البيانات محفوظة بالمتصفح فقط).
export const firebaseConfig = {
  apiKey: "AIzaSyCPDEu_BMAVcENQHNiu8-052760-H74NPs",
  authDomain: "arch-leave-uot.firebaseapp.com",
  projectId: "arch-leave-uot",
  storageBucket: "arch-leave-uot.firebasestorage.app",
  messagingSenderId: "745385719739",
  appId: "1:745385719739:web:f650cf9ffaa1525d1ff69e"
};

// اسم المستخدم يتحول داخلياً لإيميل بهذا النطاق (Firebase يحتاج صيغة إيميل)
export const USER_DOMAIN = "arch-leave.app";

export const COLLEGE = {
  name: "كلية هندسة العمارة",
  university: "الجامعة التكنولوجية",
  system: "نظام الإجازات"
};
