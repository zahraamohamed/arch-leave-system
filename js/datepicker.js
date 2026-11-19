// تقويم أكبر وأسهل بدل تقويم المتصفح: أشهر عراقية، اختيار الشهر والسنة بسرعة، والكتابة باليد (سنة/شهر/يوم) أو اللصق بأي صيغة تشتغل.
// يحوّل كل input[type=date] تلقائياً (حتى اللي تنضاف بعدين).
const MONTHS = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];
const DAYS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const LOCALE = {
  weekdays: { shorthand: DAYS, longhand: DAYS },
  months: { shorthand: MONTHS, longhand: MONTHS },
  firstDayOfWeek: 0, rangeSeparator: " إلى ", time_24hr: true
};

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
function valid(y, m, d) { const x = new Date(y, m - 1, d); return y > 1900 && y < 2200 && x.getMonth() === m - 1 && x.getDate() === d; }

// يفهم أي صيغة ملصوقة أو مكتوبة: 2024/2/2، 2024-02-02، 2/2/2024، 2.2.2024، 20240202
export function parseLooseDate(text) {
  const t = String(text || "").trim().replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c));
  let m;
  if ((m = t.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/))) return valid(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : "";
  if ((m = t.match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{4})/))) return valid(+m[3], +m[2], +m[1]) ? iso(+m[3], +m[2], +m[1]) : "";
  if ((m = t.match(/^(\d{4})(\d{2})(\d{2})$/))) return valid(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : "";
  return "";
}

// الكتابة: سنة ← شهر ← يوم، والفواصل تنضاف وحدها (2024/03/15)
function mask(raw, deleting) {
  const parts = ["", "", ""]; let i = 0;
  for (const ch of raw.replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))) {
    if (/\d/.test(ch)) {
      if ((i === 0 && parts[0].length === 4) || (i === 1 && parts[1].length === 2)) i++;
      if (i > 2 || parts[i].length >= (i === 0 ? 4 : 2)) continue;
      parts[i] += ch;
      if (i === 1 && parts[1].length === 1 && +ch > 1) i++;          // شهر 2-9 = خانة وحدة
    } else if (parts[i] && i < 2) i++;
  }
  let out = parts[0];
  if (i >= 1 || parts[1]) out += "/" + parts[1];
  if (i >= 2 || parts[2]) out += "/" + parts[2];
  if (!deleting) { if (i === 0 && parts[0].length === 4) out += "/"; else if (i === 1 && parts[1].length === 2) out += "/"; }
  return { out, parts };
}

// التقويم فوق الخانة بمسافة واضحة (والخانة تبقى ظاهرة)، وإذا ماكو مكان فوق يطلع تحتها
function placeCal(inst) {
  if (window.matchMedia("(max-width: 600px)").matches) return;   // الموبايل: ورقة أسفل الشاشة
  requestAnimationFrame(() => {
    const cal = inst.calendarContainer, r = (inst.altInput || inst.input).getBoundingClientRect(), h = cal.offsetHeight, gap = 10;
    const top = r.top - h - gap >= 8 ? r.top - h - gap : r.bottom + gap;
    cal.style.top = `${top + window.scrollY}px`;
  });
}
function enhance(el) {
  if (!window.flatpickr || el._flatpickr || el.dataset.noPicker) return;
  window.flatpickr(el, {
    locale: LOCALE,
    dateFormat: "Y-m-d",          // القيمة المخزنة (ما تتغير)
    altInput: true,
    altFormat: "Y/m/d",           // المعروض: سنة/شهر/يوم — نفس ترتيب الكتابة
    allowInput: true,
    position: "above",            // التقويم فوق الخانة حتى تبقى الخانة ظاهرة للكتابة
    monthSelectorType: "dropdown",
    minDate: el.min || null,
    maxDate: el.max || null,
    disableMobile: true,
    parseDate: (s) => { const v = parseLooseDate(s); return v ? new Date(v + "T00:00:00") : undefined; },
    onDayCreate: (_, __, ___, day) => { const d = day.dateObj.getDay(); if (d === 5 || d === 6) day.classList.add("weekend"); },
    onChange: (_, __, inst) => inst.input.dispatchEvent(new Event("input", { bubbles: true })),
    onOpen: (_, __, inst) => placeCal(inst),
    onMonthChange: (_, __, inst) => placeCal(inst),
    onYearChange: (_, __, inst) => placeCal(inst),
    onReady: (_, __, inst) => {
      const alt = inst.altInput;
      if (alt) {
        alt.placeholder = "سنة/شهر/يوم"; alt.setAttribute("dir", "ltr"); alt.setAttribute("inputmode", "numeric"); alt.autocomplete = "off";
        alt.classList.add("date-alt"); if (el.required) alt.required = true; if (el.title) alt.title = el.title;
        const commit = (v) => { if (v && v !== inst.input.value) { inst.setDate(v, true); inst.jumpToDate(v); } };
        alt.addEventListener("input", (ev) => {
          const del = (ev.inputType || "").startsWith("delete");
          const { out, parts } = mask(alt.value, del);
          if (out !== alt.value) alt.value = out;
          if (!alt.value) { if (inst.input.value) inst.clear(); return; }
          const y = +parts[0], m = +parts[1], d = +parts[2];
          // اليوم يكتمل برقمين، أو برقم واحد أكبر من 3
          if (parts[0].length === 4 && parts[1] && parts[2] && (parts[2].length === 2 || d > 3) && valid(y, m, d)) commit(iso(y, m, d));
          else if (parts[0].length === 4 && parts[1]) inst.jumpToDate(new Date(y, Math.max(0, m - 1), 1));
        });
        alt.addEventListener("paste", (ev) => {
          const v = parseLooseDate(ev.clipboardData?.getData("text"));
          if (!v) return;
          ev.preventDefault(); commit(v); alt.value = v.replaceAll("-", "/");
        });
        alt.addEventListener("blur", () => {
          if (!alt.value.trim()) { if (inst.input.value) inst.clear(); return; }
          const v = parseLooseDate(alt.value);
          if (v) commit(v); else setTimeout(() => { alt.value = inst.input.value ? inst.input.value.replaceAll("-", "/") : ""; }, 0);
        });
      }
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
