import { SY_CITIES } from "./config.js";
import { debounce } from "./utils.js";

export const UI = {
  el: {},
  state: {
    lastDoc: null,
    currentListing: null,
    gallery: { imgs: [], idx: 0 },
    chatUnsub: null,
    filtersActive: false,

    // ✅ للـ toggle
    filtersOpen: false,

    // ✅ سياق الرجوع للدردشة (من وين انفتحت)
    chatReturnTo: null
  },
  actions: {
    openAuth: () => {},
    closeAuth: () => {},
    openAdd: () => {},
    openChat: () => {},
    closeChat: () => {},
    loadListings: async () => {},
    loadCategories: async () => {},
    openDetails: () => {},
    openInbox: () => {},
    closeInbox: () => {},
    loadInbox: async () => {}
  },

  init(){
    document.documentElement.setAttribute("data-theme", "dark");

    const ids = [
      "authBar","qSearch","cityFilter","catFilter","btnApply","btnReset","btnMore","listings","emptyState",

      // ✅ DETAILS (+ dSeller جديد)
      "detailsPage","btnBack","btnShare","dTitle","dMeta","dStats","dSeller","dPrice","dDesc","btnReadMore","dInfo",
      "btnFav","dFavCount","btnChat","btnWhatsapp","btnReportListing","btnReportWhatsapp","btnDeleteListing","gImg","gDots","gPrev","gNext",

      "inboxPage","btnInboxBack","btnInboxRefresh","inboxList","inboxEmpty",

      "addBox","btnAddBack","aTitle","aDesc","aPrice","aCurrency","aCity","aCat","aImages","imgPreview",
      "btnPublish","btnClear","uploadStatus",

      "chatBox","btnChatBack","chatTitle","chatMsgs","chatInput","btnSend",

      "authModal","btnCloseAuth","email","password","btnLogin",

      // ✅ toast
      "toast",

      // ✅ Floating inbox bubble (created dynamically if missing)
      "inboxFloat","inboxFloatBtn","inboxFloatCount",

      // ✅ Deluxe filters
      "btnToggleFilters","filtersBody",
      "typeFilter","typeAll","typeSale","typeRent",
      "yearFrom","yearTo","carFilters",

      // ✅ عقارات
      "estateFilters","estateKindFilter","roomsFilter",

      // ✅ إلكترونيات
      "electFilters","electKindFilter"
    ];

    for (const id of ids) this.el[id] = document.getElementById(id);

    // ✅ Ensure floating inbox bubble exists (Messenger-like)
    // يظهر فقط عند وجود رسائل غير مقروءة، ويقوم بفتح Inbox عند الضغط.
    if (!this.el.inboxFloat) {
      const wrap = document.createElement("div");
      wrap.id = "inboxFloat";
      wrap.className = "inboxFloat hidden";
      wrap.innerHTML = `
        <button id="inboxFloatBtn" class="inboxFloatBtn" type="button" aria-label="الرسائل">
          💬 <span id="inboxFloatCount" class="inboxFloatCount">0</span>
        </button>
      `;
      document.body.appendChild(wrap);
      this.el.inboxFloat = wrap;
      this.el.inboxFloatBtn = wrap.querySelector("#inboxFloatBtn");
      this.el.inboxFloatCount = wrap.querySelector("#inboxFloatCount");
    }

    // فتح الـ Inbox من الفقاعة
    if (this.el.inboxFloatBtn) {
      this.el.inboxFloatBtn.onclick = (e) => {
        e.preventDefault();
        try {
          if (typeof this.actions.openInbox === "function") this.actions.openInbox();
        } catch {}
      };
    }

    // ✅ تعبئة المدن (إذا العناصر موجودة)
    if (this.el.cityFilter){
      this.el.cityFilter.innerHTML =
        `<option value="">كل المدن</option>` +
        SY_CITIES.map(c=>`<option value="${c}">${c}</option>`).join("");
    }

    if (this.el.aCity){
      this.el.aCity.innerHTML =
        `<option value="">اختر مدينة</option>` +
        SY_CITIES.map(c=>`<option value="${c}">${c}</option>`).join("");
    }

    // ✅ Back buttons (بحماية null)
    this.el.btnBack && (this.el.btnBack.onclick = () => this.hideDetailsPage());
    this.el.btnAddBack && (this.el.btnAddBack.onclick = () => this.hide(this.el.addBox));
    this.el.btnChatBack && (this.el.btnChatBack.onclick = () => this.actions.closeChat?.());

    // ✅ inbox buttons
    this.el.btnInboxBack && (this.el.btnInboxBack.onclick = () => {
      if (typeof this.actions.closeInbox === "function") this.actions.closeInbox();
      else this.hideInboxPage();
    });
    this.el.btnInboxRefresh && (this.el.btnInboxRefresh.onclick = () => this.actions.loadInbox?.());

    // ✅ share
    this.el.btnShare && (this.el.btnShare.onclick = async () => {
      const l = this.state.currentListing;
      if (!l) return;
      const url = location.href.split("#")[0] + `#listing=${encodeURIComponent(l.id)}`;
      try{
        if (navigator.share){
          await navigator.share({ title: l.title || "إعلان", url });
        }else{
          await navigator.clipboard.writeText(url);
          alert("تم نسخ رابط الإعلان ✅");
        }
      }catch{}
    });

    // ✅ Toggle Filters
    this.bindFiltersToggle();

    // ✅ segmented type
    this.bindDeluxeTypeControls();

    // ✅ Apply / Reset
    const hasAnyFilter = () => {
      const q = (this.el.qSearch?.value || "").trim();
      const city = (this.el.cityFilter?.value || "").trim();
      const cat = (this.el.catFilter?.value || "").trim();
      const type = (this.el.typeFilter?.value || "").trim();
      const yf = (this.el.yearFrom?.value || "").toString().trim();
      const yt = (this.el.yearTo?.value || "").toString().trim();
      const ek = (this.el.estateKindFilter?.value || "").toString().trim();
      const rr = (this.el.roomsFilter?.value || "").toString().trim();
      return !!(q || city || cat || type || yf || yt || ek || rr);
    };

    const liveReload = () => {
      // ✅ الفلترة تعمل مباشرة: إذا المستخدم حط أي قيمة -> filtersActive
      this.state.filtersActive = hasAnyFilter();
      this.actions.loadListings?.(true);
    };

    // (زر تطبيق لم يعد مستخدم، نتركه إذا كان موجوداً للـ backward-compat)
    this.el.btnApply && (this.el.btnApply.onclick = () => liveReload());

    // ✅ Reset (جميل وخفيف بالأعلى)
    this.el.btnReset && (this.el.btnReset.onclick = () => {
      this.resetFiltersUI();
      this.state.filtersActive = false;
      this.actions.loadListings?.(true);
    });

    this.el.btnMore && (this.el.btnMore.onclick = () => this.actions.loadListings?.(false));

    // ✅ keyword typing (Live)
    if (this.el.qSearch){
      this.el.qSearch.addEventListener("input", debounce(() => {
        liveReload();
      }, 250));
    }

    // ✅ باقي الحقول (Live)
    this.el.cityFilter?.addEventListener("change", liveReload);
    this.el.catFilter?.addEventListener("change", () => {
      this.syncEstateFiltersVisibility();
      liveReload();
    });

    this.el.yearFrom?.addEventListener("input", debounce(liveReload, 200));
    this.el.yearTo?.addEventListener("input", debounce(liveReload, 200));

    // ✅ إلكترونيات
    this.el.electKindFilter?.addEventListener("change", liveReload);

    this.el.estateKindFilter?.addEventListener("change", liveReload);
    this.el.roomsFilter?.addEventListener("input", debounce(liveReload, 200));

    // ✅ gallery controls
    this.el.gPrev && (this.el.gPrev.onclick = () => this.setGalleryIdx(this.state.gallery.idx - 1));
    this.el.gNext && (this.el.gNext.onclick = () => this.setGalleryIdx(this.state.gallery.idx + 1));

    // ✅ auth modal
    this.el.btnCloseAuth && (this.el.btnCloseAuth.onclick = () => this.actions.closeAuth?.());
    if (this.el.authModal){
      this.el.authModal.addEventListener("click", (e)=>{
        if (e.target === this.el.authModal) this.actions.closeAuth?.();
      });
    }

    // ✅ hash open listing
    window.addEventListener("hashchange", () => this.handleHash());
    this.handleHash();

    // ✅ أول مرة: نخفي/نظهر فلاتر العقارات حسب القسم
    this.syncEstateFiltersVisibility();
  },

  /* =========================
     ✅ Deluxe: Toggle Filters
  ========================= */
  
  /* =========================
     ✅ Deluxe: filters collapse/expand (button + swipe)
  ========================= */
  
  /* =========================
     ✅ Deluxe: filters collapse/expand (button + swipe)
  ========================= */
  bindFiltersToggle(){
    if (!this.el.filtersBody) return;

    const section = this.el.filtersBody.closest(".deluxeFilters") || this.el.filtersBody.parentElement;

    const applyUI = () => {
      const open = !!this.state.filtersOpen;

      // body animation classes
      this.el.filtersBody.classList.toggle("is-open", open);
      this.el.filtersBody.classList.toggle("is-collapsed", !open);

      // section styling
      section && section.classList.toggle("filters-open", open);
      section && section.classList.toggle("filters-collapsed", !open);

      // button: icon only (no "إظهار/إخفاء")
      if (this.el.btnToggleFilters){
        this.el.btnToggleFilters.classList.toggle("is-open", open);
        this.el.btnToggleFilters.setAttribute("aria-expanded", open ? "true" : "false");
        this.el.btnToggleFilters.setAttribute("aria-label", open ? "إخفاء الفلترة" : "إظهار الفلترة");
        this.el.btnToggleFilters.textContent = "⌄";
      }
    };

    const toggle = (force) => {
      if (typeof force === "boolean") this.state.filtersOpen = force;
      else this.state.filtersOpen = !this.state.filtersOpen;
      applyUI();
    };

    // click toggle (kept, but minimal icon)
    if (this.el.btnToggleFilters){
      this.el.btnToggleFilters.onclick = () => toggle();
    }

    // click on header (like a handle) also toggles
    const head = section?.querySelector?.(".filterHead");
    if (head){
      head.addEventListener("click", (e) => {
        // ignore clicks on inputs/buttons inside header
        const tag = (e.target?.tagName || "").toLowerCase();
        if (tag === "button" || tag === "a") return;
        toggle();
      });
    }


    // init
    // default: collapsed so الزائر يشوف الإعلانات أولاً
    applyUI();

    // swipe gestures
    this.bindFiltersSwipe?.(toggle);
  },

  /* =========================
     ✅ Deluxe: segmented type
  ========================= */
  
  /* =========================
     ✅ Swipe to open/close filters (luxury feel)
     - Swipe down from top edge (or on filters header) => open
     - Swipe up on header/top => close
  ========================= */
  bindFiltersSwipe(toggleFn){
    if (!this.el.filtersBody) return;

    const header = this.el.filtersBody.closest(".deluxeFilters")?.querySelector(".filterHead") || null;

    const TOP_EDGE_PX = 90;     // start zone from top
    const THRESHOLD_PX = 55;    // swipe distance
    const MAX_X_DRIFT = 80;     // ignore diagonal drags

    let startY = null, startX = null, startT = 0;
    let startedFromTop = false;
    let startedFromHeader = false;

    const isFormControl = (el) => {
      const t = (el?.tagName || "").toLowerCase();
      return t === "input" || t === "select" || t === "textarea" || el?.isContentEditable;
    };

    const onStart = (e) => {
      const t = e.touches?.[0];
      if (!t) return;

      // don't hijack when user interacts with form controls
      if (isFormControl(e.target)) return;

      startY = t.clientY;
      startX = t.clientX;
      startT = Date.now();

      startedFromTop = startY <= TOP_EDGE_PX;

      // if header exists: allow swipe start from header area for better UX
      startedFromHeader = !!(header && (e.target === header || header.contains(e.target)));

      // When collapsed, we only allow swipes from top edge or header
      if (!this.state.filtersOpen && !(startedFromTop || startedFromHeader)){
        startY = startX = null;
        return;
      }
    };

    const onEnd = (e) => {
      if (startY == null || startX == null) return;

      const t = (e.changedTouches?.[0]) || (e.touches?.[0]);
      if (!t) { startY = startX = null; return; }

      const dy = t.clientY - startY;
      const dx = t.clientX - startX;
      const dt = Math.max(1, Date.now() - startT);

      // ignore horizontal-ish gestures
      if (Math.abs(dx) > Math.max(MAX_X_DRIFT, Math.abs(dy))) {
        startY = startX = null;
        return;
      }

      // a small velocity bias (optional)
      const vy = dy / dt; // px per ms

      // OPEN: swipe down
      if (!this.state.filtersOpen && dy > THRESHOLD_PX && (startedFromTop || startedFromHeader)) {
        toggleFn(true);
      }

      // CLOSE: swipe up
      if (this.state.filtersOpen && dy < -THRESHOLD_PX && (startedFromTop || startedFromHeader)) {
        toggleFn(false);
      }

      startY = startX = null;
    };

    // attach (passive true keeps scroll smooth)
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
  },


  /* =========================
     ✅ Swipe to open/close filters (luxury feel)
     - Swipe down from top edge (or on filters header) => open
     - Swipe up on header/top => close
  ========================= */
  bindFiltersSwipe(toggleFn){
    if (!this.el.filtersBody) return;

    const header = this.el.filtersBody.closest(".deluxeFilters")?.querySelector(".filterHead") || null;

    const TOP_EDGE_PX = 90;     // start zone from top
    const THRESHOLD_PX = 55;    // swipe distance
    const MAX_X_DRIFT = 80;     // ignore diagonal drags

    let startY = null, startX = null, startT = 0;
    let startedFromTop = false;
    let startedFromHeader = false;

    const isFormControl = (el) => {
      const t = (el?.tagName || "").toLowerCase();
      return t === "input" || t === "select" || t === "textarea" || el?.isContentEditable;
    };

    const onStart = (e) => {
      const t = e.touches?.[0];
      if (!t) return;

      if (isFormControl(e.target)) return;

      startY = t.clientY;
      startX = t.clientX;
      startT = Date.now();

      startedFromTop = startY <= TOP_EDGE_PX;
      startedFromHeader = !!(header && (e.target === header || header.contains(e.target)));

      if (!this.state.filtersOpen && !(startedFromTop || startedFromHeader)){
        startY = startX = null;
        return;
      }
    };

    const onEnd = (e) => {
      if (startY == null || startX == null) return;

      const t = (e.changedTouches?.[0]) || (e.touches?.[0]);
      if (!t) { startY = startX = null; return; }

      const dy = t.clientY - startY;
      const dx = t.clientX - startX;
      const dt = Math.max(1, Date.now() - startT);

      if (Math.abs(dx) > Math.max(MAX_X_DRIFT, Math.abs(dy))) {
        startY = startX = null;
        return;
      }

      // OPEN: swipe down
      if (!this.state.filtersOpen && dy > THRESHOLD_PX && (startedFromTop || startedFromHeader)) {
        toggleFn(true);
      }

      // CLOSE: swipe up
      if (this.state.filtersOpen && dy < -THRESHOLD_PX && (startedFromTop || startedFromHeader)) {
        toggleFn(false);
      }

      startY = startX = null;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
  },

bindDeluxeTypeControls(){
    if (!this.el.typeFilter) return;

    const setType = (val) => {
      this.el.typeFilter.value = val || "";
      this.syncTypeButtonsUI();
      // ✅ Live filtering: تغيير النوع يفلتر فوراً
      this.state.filtersActive = true;
      this.actions.loadListings?.(true);
    };

    this.el.typeAll && (this.el.typeAll.onclick = () => setType(""));
    this.el.typeSale && (this.el.typeSale.onclick = () => setType("sale"));
    this.el.typeRent && (this.el.typeRent.onclick = () => setType("rent"));

    this.syncTypeButtonsUI();
  },

  syncTypeButtonsUI(){
    if (!this.el.typeFilter) return;

    const v = (this.el.typeFilter.value || "").trim(); // "", sale, rent
    const on = (btn, active) => {
      if (!btn) return;
      btn.classList.toggle("active", !!active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    };

    on(this.el.typeAll,  v === "");
    on(this.el.typeSale, v === "sale");
    on(this.el.typeRent, v === "rent");
  },

  /* =========================
     ✅ Estate filters show/hide
  ========================= */
  normalizeCat(v){
    const s = (v || "").toString().trim().toLowerCase();
    if (s === "سيارات") return "cars";
    if (s === "عقارات") return "realestate";
    if (s === "إلكترونيات" || s === "الكترونيات") return "electronics";
    return s;
  },

  syncEstateFiltersVisibility(){
    const cat = this.normalizeCat(this.el.catFilter?.value || "");

    // ✅ عقارات: نوع العقار + غرف
    if (this.el.estateFilters){
      const isEstate = (cat === "realestate");
      this.el.estateFilters.classList.toggle("hidden", !isEstate);
      if (!isEstate){
        if (this.el.estateKindFilter) this.el.estateKindFilter.value = "";
        if (this.el.roomsFilter) this.el.roomsFilter.value = "";
      }
    }

    // ✅ إلكترونيات: نوع الإلكترونيات
    if (this.el.electFilters){
      const isElect = (cat === "electronics");
      this.el.electFilters.classList.toggle("hidden", !isElect);
      if (!isElect && this.el.electKindFilter) this.el.electKindFilter.value = "";
    }

    // ✅ سيارات: سنة
    if (this.el.carFilters){
      const isCars = (cat === "cars");
      this.el.carFilters.classList.toggle("hidden", !isCars);
      if (!isCars){
        if (this.el.yearFrom) this.el.yearFrom.value = "";
        if (this.el.yearTo) this.el.yearTo.value = "";
      }
    }
  },

  resetFiltersUI(){
    if (this.el.cityFilter) this.el.cityFilter.value = "";
    if (this.el.catFilter) this.el.catFilter.value = "";
    if (this.el.qSearch) this.el.qSearch.value = "";

    if (this.el.typeFilter) this.el.typeFilter.value = "";
    if (this.el.yearFrom) this.el.yearFrom.value = "";
    if (this.el.yearTo) this.el.yearTo.value = "";

    if (this.el.estateKindFilter) this.el.estateKindFilter.value = "";
    if (this.el.roomsFilter) this.el.roomsFilter.value = "";

    if (this.el.electKindFilter) this.el.electKindFilter.value = "";

    this.syncTypeButtonsUI();
    this.syncEstateFiltersVisibility();
  },

  /* =========================
     ✅ Hash
  ========================= */
  handleHash(){
    const h = location.hash || "";
    // ✅ فتح إعلان
    if (h.startsWith("#listing=")){
      const id = decodeURIComponent(h.replace("#listing=",""));
      if (typeof this.actions.openDetails === "function") {
        this.actions.openDetails(id, null, true);
      }
      return;
    }

    // ✅ رجوع للشات (من صفحة البائع مثلاً)
    if (h.startsWith("#chat=")){
      const qs = h.replace("#chat=", "");
      const p = new URLSearchParams(qs);
      const listingId = (p.get("listing") || "").trim();
      const title = (p.get("title") || "إعلان").trim() || "إعلان";
      const other = (p.get("other") || "").trim();

      if (!listingId) return;

      // خلي الإغلاق يرجع للإعلان
      this.state.chatReturnTo = { from: "details", listingId };

      // افتح الإعلان أولاً ثم الدردشة فوقه
      Promise.resolve()
        .then(() => this.actions.openDetails?.(listingId, null, true))
        .then(() => this.actions.openChat?.(listingId, title, other))
        .catch(()=>{});
      return;
    }
  },

  show(el){ el && el.classList.remove("hidden"); },
  hide(el){ el && el.classList.add("hidden"); },

  resetOverlays(){
    this.hide(this.el.detailsPage);
    this.hide(this.el.addBox);
    this.hide(this.el.chatBox);
    this.hide(this.el.inboxPage);
  },

  // ✅ DETAILS
  showDetailsPage(){
    this.resetOverlays();
    this.show(this.el.detailsPage);
    window.scrollTo(0, 0);
  },

  hideDetailsPage(){
    this.hide(this.el.detailsPage);
    if ((location.hash || "").startsWith("#listing=")) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  },

  // ✅ INBOX
  showInboxPage(){
    this.resetOverlays();
    this.show(this.el.inboxPage);
    window.scrollTo(0,0);
  },

  hideInboxPage(){
    this.hide(this.el.inboxPage);
  },

  renderAuthBar(html){
    if (this.el.authBar) this.el.authBar.innerHTML = html;
  },

  // ✅ Gallery
  renderGallery(imgs=[]){
    this.state.gallery = { imgs, idx: 0 };

    if (!this.el.gImg || !this.el.gDots) return;

    if (!imgs.length){
      this.el.gImg.src = "";
      this.el.gDots.innerHTML = "";
      return;
    }

    this.el.gImg.src = imgs[0];
    this.el.gDots.innerHTML = imgs.map((_,i)=>`<div class="dot ${i===0?"active":""}"></div>`).join("");
  },

  setGalleryIdx(i){
    const n = this.state.gallery.imgs.length;
    if (!n || !this.el.gImg || !this.el.gDots) return;

    const idx = (i + n) % n;
    this.state.gallery.idx = idx;
    this.el.gImg.src = this.state.gallery.imgs[idx];

    [...this.el.gDots.children].forEach((d,k)=>d.classList.toggle("active", k===idx));
  },

  setEmptyState(isEmpty){
    if (!this.el.emptyState) return;
    this.el.emptyState.style.display = isEmpty ? "block" : "none";
  },

  setInboxEmpty(isEmpty){
    if (!this.el.inboxEmpty) return;
    this.el.inboxEmpty.style.display = isEmpty ? "block" : "none";
  },

  // ✅ Toast صغير (بدون مكتبات)
  toast(msg = "", ms = 1800){
    const el = this.el.toast;
    if (!el) return;
    el.textContent = String(msg || "");
    el.classList.remove("hidden");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => {
      try{ el.classList.add("hidden"); }catch{}
    }, Math.max(800, Number(ms) || 1800));
  }
};