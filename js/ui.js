import { SY_CITIES } from "./config.js";
import { debounce } from "./utils.js";

export const UI = {
  el: {},
  state: {
    lastDoc: null,
    currentListing: null,
    gallery: { imgs: [], idx: 0 },
    chatUnsub: null
  },
  actions: {
    // تُربط لاحقاً من modules
    openAuth: () => {},
    closeAuth: () => {},
    openAdd: () => {},
    openDetails: () => {},
    closeDetails: () => {},
    openChat: () => {},
    closeChat: () => {},
    loadListings: async () => {},
    loadCategories: async () => {},
  },

  init(){
    // refs
    const ids = [
      "authBar","qSearch","cityFilter","catFilter","btnApply","btnReset","btnMore","listings","emptyState",
      "details","btnBack","dTitle","dMeta","dPrice","dDesc","btnChat","gImg","gDots","gPrev","gNext",
      "addBox","btnAddBack","aTitle","aDesc","aPrice","aCurrency","aCity","aCat","aImages","imgPreview",
      "btnPublish","btnClear","uploadStatus",
      "chatBox","btnChatBack","chatTitle","chatMsgs","chatInput","btnSend",
      "authModal","btnCloseAuth","email","password","btnLogin","btnRegister","btnGoogle"
    ];
    for (const id of ids) this.el[id] = document.getElementById(id);

    // init selects
    this.el.cityFilter.innerHTML = `<option value="">كل المدن</option>` + SY_CITIES.map(c=>`<option value="${c}">${c}</option>`).join("");
    this.el.aCity.innerHTML = `<option value="">اختر مدينة</option>` + SY_CITIES.map(c=>`<option value="${c}">${c}</option>`).join("");

    // base navigation
    this.el.btnBack.onclick = () => this.hide(this.el.details);
    this.el.btnAddBack.onclick = () => this.hide(this.el.addBox);
    this.el.btnChatBack.onclick = () => this.actions.closeChat();

    // search + filters hooks (actual loadListings is set later)
    this.el.btnApply.onclick = () => this.actions.loadListings(true);
    this.el.btnReset.onclick = () => {
      this.el.cityFilter.value="";
      this.el.catFilter.value="";
      this.el.qSearch.value="";
      this.actions.loadListings(true);
    };
    this.el.btnMore.onclick = () => this.actions.loadListings(false);

    // search typing
    this.el.qSearch.addEventListener("input", debounce(() => {
      this.actions.loadListings(true);
    }, 250));

    // gallery
    this.el.gPrev.onclick = () => this.setGalleryIdx(this.state.gallery.idx - 1);
    this.el.gNext.onclick = () => this.setGalleryIdx(this.state.gallery.idx + 1);

    // auth modal close
    this.el.btnCloseAuth.onclick = () => this.actions.closeAuth();
    this.el.authModal.addEventListener("click", (e)=>{
      if (e.target === this.el.authModal) this.actions.closeAuth();
    });
  },

  show(el){ el.classList.remove("hidden"); },
  hide(el){ el.classList.add("hidden"); },

  resetOverlays(){
    this.hide(this.el.details);
    this.hide(this.el.addBox);
    this.hide(this.el.chatBox);
  },

  renderAuthBar(html){
    this.el.authBar.innerHTML = html;
  },

  renderGallery(imgs=[]){
    this.state.gallery = { imgs, idx: 0 };
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
    if (!n) return;
    const idx = (i + n) % n;
    this.state.gallery.idx = idx;
    this.el.gImg.src = this.state.gallery.imgs[idx];
    [...this.el.gDots.children].forEach((d,k)=>d.classList.toggle("active", k===idx));
  },

  setEmptyState(isEmpty){
    this.el.emptyState.style.display = isEmpty ? "block" : "none";
  }
};