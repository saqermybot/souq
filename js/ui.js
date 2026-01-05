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
    filtersOpen: true
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
      "detailsPage","btnBack","btnShare","dTitle","dMeta","dSeller","dPrice","dDesc","btnChat","btnWhatsapp","btnDeleteListing","gImg","gDots","gPrev","gNext",

      "inboxPage","btnInboxBack","btnInboxRefresh","inboxList","inboxEmpty",

      "addBox","btnAddBack","aTitle","aDesc","aPrice","aCurrency","aCity","aCat","aImages","imgPreview",
      "btnPublish","btnClear","uploadStatus",

      "chatBox","btnChatBack","chatTitle","chatMsgs","chatInput","btnSend",

      "authModal","btnCloseAuth","email","password","btnLogin","btnRegister","btnGoogle",

      // ✅ Deluxe filters
      "btnToggleFilters","filtersBody",
      "typeFilter","typeAll","typeSale","typeRent",
      "yearFrom","yearTo",

      // ✅ عقارات
      "estateFilters","estateKindFilter","roomsFilter"
    ];

    for (const id of ids) this.el[id] = document.getElementById(id);

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
    this.el.btnApply && (this.el.btnApply.onclick = () => {
      this.state.filtersActive = true;
      this.actions.loadListings?.(true);
    });

    this.el.btnReset && (this.el.btnReset.onclick = () => {
      this.resetFiltersUI();
      this.state.filtersActive = false;
      this.actions.loadListings?.(true);
    });

    this.el.btnMore && (this.el.btnMore.onclick = () => this.actions.loadListings?.(false));

    // ✅ keyword typing
    if (this.el.qSearch){
      this.el.qSearch.addEventListener("input", debounce(() => {
        this.actions.loadListings?.(true);
      }, 250));
    }

    // ✅ لو filtersActive شغال
    const maybeReload = () => {
      if (this.state.filtersActive) this.actions.loadListings?.(true);
    };

    this.el.cityFilter?.addEventListener("change", maybeReload);
    this.el.catFilter?.addEventListener("change", () => {
      this.syncEstateFiltersVisibility();
      maybeReload();
    });

    this.el.yearFrom?.addEventListener("input", maybeReload);
    this.el.yearTo?.addEventListener("input", maybeReload);

    this.el.estateKindFilter?.addEventListener("change", maybeReload);
    this.el.roomsFilter?.addEventListener("input", maybeReload);

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
  bindFiltersToggle(){
    if (!this.el.btnToggleFilters || !this.el.filtersBody) return;

    const applyUI = () => {
      this.el.filtersBody.classList.toggle("hidden", !this.state.filtersOpen);
      this.el.btnToggleFilters.textContent = this.state.filtersOpen ? "إخفاء" : "إظهار";
    };

    this.el.btnToggleFilters.onclick = () => {
      this.state.filtersOpen = !this.state.filtersOpen;
      applyUI();
    };

    applyUI();
  },

  /* =========================
     ✅ Deluxe: segmented type
  ========================= */
  bindDeluxeTypeControls(){
    if (!this.el.typeFilter) return;

    const setType = (val) => {
      this.el.typeFilter.value = val || "";
      this.syncTypeButtonsUI();
      if (this.state.filtersActive) this.actions.loadListings?.(true);
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
    if (!this.el.estateFilters) return;
    const cat = this.normalizeCat(this.el.catFilter?.value || "");
    this.el.estateFilters.classList.toggle("hidden", cat !== "realestate");
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

    this.syncTypeButtonsUI();
    this.syncEstateFiltersVisibility();
  },

  /* =========================
     ✅ Hash
  ========================= */
  handleHash(){
    const h = location.hash || "";
    if (!h.startsWith("#listing=")) return;
    const id = decodeURIComponent(h.replace("#listing=",""));
    if (typeof this.actions.openDetails === "function") {
      this.actions.openDetails(id, null, true);
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
  }
};