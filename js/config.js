// إعدادات Firebase — تنملأ مرة وحدة بعد إنشاء مشروع Firebase.
// إذا بقت فارغة، النظام يشتغل بـ"الوضع التجريبي" (البيانات محفوظة بالمتصفح فقط).
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// اسم المستخدم يتحول داخلياً لإيميل بهذا النطاق (Firebase يحتاج صيغة إيميل)
export const USER_DOMAIN = "arch-leave.app";

export const COLLEGE = {
  name: "كلية هندسة العمارة",
  university: "الجامعة التكنولوجية",
  system: "نظام الإجازات"
};
