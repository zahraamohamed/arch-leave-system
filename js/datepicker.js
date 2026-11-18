// تقويم أكبر وأسهل بدل تقويم المتصفح: أشهر عراقية، اختيار الشهر والسنة بسرعة، والكتابة باليد (2/2/2024) تشتغل.
// يحوّل كل input[type=date] تلقائياً (حتى اللي تنضاف بعدين).
const MONTHS = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];
const DAYS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const LOCALE = {
  weekdays: { shorthand: DAYS, longhand: DAYS },
  months: { shorthand: MONTHS, longhand: MONTHS },
  firstDayOfWeek: 0, rangeSeparator: " إلى ", time_24hr: true
};

function enhance(el) {
  if (!window.flatpickr || el._flatpickr || el.dataset.noPicker) return;
  window.flatpickr(el, {
    locale: LOCALE,
    dateFormat: "Y-m-d",          // القيمة المخزنة (ما تتغير)
    altInput: true,
    altFormat: "d/m/Y",           // المعروض للمستخدم
    allowInput: true,
    monthSelectorType: "dropdown",
    minDate: el.min || null,
    maxDate: el.max || null,
    disableMobile: true,
    onDayCreate: (_, __, ___, day) => { const d = day.dateObj.getDay(); if (d === 5 || d === 6) day.classList.add("weekend"); },
    onChange: (_, __, inst) => inst.input.dispatchEvent(new Event("input", { bubbles: true })),
    onReady: (_, __, inst) => {
      const alt = inst.altInput;
      if (alt) { alt.placeholder = "يوم/شهر/سنة"; alt.setAttribute("dir", "ltr"); alt.classList.add("date-alt"); if (el.required) alt.required = true; if (el.title) alt.title = el.title; }
      const today = document.createElement("button");
      today.type = "button"; today.className = "fp-today"; today.textContent = "اليوم";
      today.onclick = () => { inst.setDate(new Date(), true); inst.close(); };
      inst.calendarContainer.appendChild(today);
    }
  });
}

// تحديث الحد الأدنى أو القيمة من الكود
export function setDateMin(el, v) { if (!el) return; el.min = v || ""; if (el._flatpickr) el._flatpickr.set("minDate", v || null); }
export function setDateValue(el, v) { if (!el) return; if (el._flatpickr) el._flatpickr.setDate(v || null, false); else el.value = v || ""; }

export function initDatePickers() {
  const scan = (root) => root.querySelectorAll && root.querySelectorAll('input[type="date"]').forEach(enhance);
  scan(document);
  const drop = (n) => { if (n.nodeType !== 1) return; const list = n._flatpickr ? [n] : [...(n.querySelectorAll?.(".flatpickr-input") || [])]; list.forEach((i) => i._flatpickr && !i.isConnected && i._flatpickr.destroy()); };
  new MutationObserver((muts) => {
    for (const m of muts) {
      m.removedNodes.forEach(drop);   // الحقول المحذوفة: نشيل تقويمها حتى ما تتراكم
      m.addedNodes.forEach((n) => n.nodeType === 1 && (n.matches?.('input[type="date"]') ? enhance(n) : scan(n)));
    }
  }).observe(document.body, { childList: true, subtree: true });
}
