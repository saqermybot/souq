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
    openAuth: () => {},
    closeAuth: () => {},
    openAdd: () => {},
    openChat: () => {},
    closeChat: () => {},
    loadListings: async () => {},
    loadCategories: async () => {},
    openListingPage: async () => {}
  },

  init(){
    const ids = [
      "authBar","qSearch","cityFilter","catFilter","btnApply","btnReset","btnMore","listings","emptyState",
      "detailsPage","btnBack","btnShare","dTitle","dMeta","dPrice","dDesc","btnChat","gImg","gDots","gPrev","gNext",
      "addBox","btnAddBack","aTitle","aDesc","aPrice","aCurrency","aCity","aCat","aImages","imgPreview",
      "btnPublish","btnClear","uploadStatus",
      "chatBox","btnChatBack","chatTitle","chatMsgs","chatInput","btnSend",
      "authModal","btnCloseAuth","email","password","btnLogin","btnRegister","btnGoogle",
      "imgModal","imgClose","imgPrev","imgNext","imgFull","imgCounter"
    ];
    for (const id of ids) this.el[id] = document.getElementById(id);

    // selects
    this.el.cityFilter.innerHTML =
      `<option value="">كل المدن</option>` +
      SY_CITIES.map(c=>`<option value="${c}">${c}</option>`).join("");

    this.el.aCity.innerHTML =
      `<option value="">اختر مدينة</option>` +
      SY_CITIES.map(c=>`<option value="${c}">${c}</option>`).join("");

    // back buttons
    this.el.btnBack.onclick = () => history.back();
    this.el.btnAddBack.onclick = () => this.hide(this.el.addBox);
    this.el.btnChatBack.onclick = () => this.actions.closeChat();

    // filters
    this.el.btnApply.onclick = () => this.actions.loadListings(true);
    this.el.btnReset.onclick = () => {
      this.el.cityFilter.value="";
      this.el.catFilter.value="";
      this.el.qSearch.value="";
      this.actions.loadListings(true);
    };
    this.el.btnMore.onclick = () => this.actions.loadListings(false);

    this.el.qSearch.addEventListener("input", debounce(() => {
      this.actions.loadListings(true);
    }, 250));

    // gallery controls
    this.el.gPrev.onclick = () => this.setGalleryIdx(this.state.gallery.idx - 1);
    this.el.gNext.onclick = () => this.setGalleryIdx(this.state.gallery.idx + 1);

    // auth modal
    this.el.btnCloseAuth.onclick = () => this.actions.closeAuth();
    this.el.authModal.addEventListener("click", (e)=>{
      if (e.target === this.el.authModal) this.actions.closeAuth();
    });
  },

  show(el){ el.classList.remove("hidden"); },
  hide(el){ el.classList.add("hidden"); },

  resetOverlays(){
    this.hide(this.el.detailsPage);
    this.hide(this.el.addBox);
    this.hide(this.el.chatBox);
    this.hide(this.el.imgModal);
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