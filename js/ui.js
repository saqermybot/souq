import { SY_CITIES } from "./config.js";
import { debounce } from "./utils.js";

export const UI = {
  el: {},
  state: {
    lastDoc: null,
    currentListing: null,
    gallery: { imgs: [], idx: 0 },
    chatUnsub: null,
    filtersActive: false // ✅ للفلترة فقط عند ضغط "تطبيق"
  },
  actions: {
    openAuth: () => {},
    closeAuth: () => {},
    openAdd: () => {},
    openDetails: () => {},
    openChat: () => {},
    closeChat: () => {},
    loadListings: async () => {},
    loadCategories: async () => {},
  },

  init(){
    // ✅ نفس الـ IDs الموجودة ب index.html تبعك
    const ids = [
      "authBar","qSearch","cityFilter","catFilter","btnApply","btnReset","btnMore","listings","emptyState",
      "details","btnBack","dTitle","dMeta","dPrice","dDesc","btnChat","gImg","gDots","gPrev","gNext",
      "addBox","btnAddBack","aTitle","aDesc","aPrice","aCurrency","aCity","aCat","aImages","imgPreview",
      "btnPublish","btnClear","uploadStatus",
      "chatBox","btnChatBack","chatTitle","chatMsgs","chatInput","btnSend",
      "authModal","btnCloseAuth","email","password","btnLogin","btnRegister","btnGoogle"
    ];

    for (const id of ids) this.el[id] = document.getElementById(id);

    // selects
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

    // back buttons
    if (this.el.btnBack) this.el.btnBack.onclick = () => this.hide(this.el.details);
    if (this.el.btnAddBack) this.el.btnAddBack.onclick = () => this.hide(this.el.addBox);
    if (this.el.btnChatBack) this.el.btnChatBack.onclick = () => this.actions.closeChat();

    // ✅ زر تطبيق: يفعل الفلاتر فقط عند الضغط
    if (this.el.btnApply) this.el.btnApply.onclick = () => {
      this.state.filtersActive = true;
      this.actions.loadListings(true);
    };

    // ✅ زر مسح: يرجع يعرض الكل بدون فلاتر
    if (this.el.btnReset) this.el.btnReset.onclick = () => {
      if (this.el.cityFilter) this.el.cityFilter.value="";
      if (this.el.catFilter) this.el.catFilter.value="";
      if (this.el.qSearch) this.el.qSearch.value="";
      this.state.filtersActive = false;
      this.actions.loadListings(true);
    };

    if (this.el.btnMore) this.el.btnMore.onclick = () => this.actions.loadListings(false);

    // ✅ البحث بالكلمة يشتغل لحاله (بدون تفعيل فلاتر المدينة/الصنف)
    if (this.el.qSearch){
      this.el.qSearch.addEventListener("input", debounce(() => {
        this.actions.loadListings(true);
      }, 250));
    }

    // gallery
    if (this.el.gPrev) this.el.gPrev.onclick = () => this.setGalleryIdx(this.state.gallery.idx - 1);
    if (this.el.gNext) this.el.gNext.onclick = () => this.setGalleryIdx(this.state.gallery.idx + 1);

    // auth modal close
    if (this.el.btnCloseAuth) this.el.btnCloseAuth.onclick = () => this.actions.closeAuth();
    if (this.el.authModal){
      this.el.authModal.addEventListener("click", (e)=>{
        if (e.target === this.el.authModal) this.actions.closeAuth();
      });
    }
  },

  // ✅ أهم تعديل: تحمّل null (حتى ما يوقع الموقع)
  show(el){ if (!el) return; el.classList.remove("hidden"); },
  hide(el){ if (!el) return; el.classList.add("hidden"); },

  resetOverlays(){
    this.hide(this.el.details);
    this.hide(this.el.addBox);
    this.hide(this.el.chatBox);
  },

  renderAuthBar(html){
    if (!this.el.authBar) return;
    this.el.authBar.innerHTML = html;
  },

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

    const dots = [...this.el.gDots.children];
    dots.forEach((d,k)=>d.classList.toggle("active", k===idx));
  },

  setEmptyState(isEmpty){
    if (!this.el.emptyState) return;
    this.el.emptyState.style.display = isEmpty ? "block" : "none";
  }
};