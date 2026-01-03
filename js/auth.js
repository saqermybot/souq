import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { UI } from "./ui.js";

export function initAuth(){
  // modal open/close
  UI.actions.openAuth = () => UI.show(UI.el.authModal);
  UI.actions.closeAuth = () => UI.hide(UI.el.authModal);

  // buttons
  UI.el.btnLogin.onclick = async () => {
    try{
      await signInWithEmailAndPassword(auth, UI.el.email.value.trim(), UI.el.password.value);
      UI.actions.closeAuth();
    }catch(e){ alert(e?.message || "Login failed"); }
  };

  UI.el.btnRegister.onclick = async () => {
    try{
      await createUserWithEmailAndPassword(auth, UI.el.email.value.trim(), UI.el.password.value);
      UI.actions.closeAuth();
    }catch(e){ alert(e?.message || "Register failed"); }
  };

  UI.el.btnGoogle.onclick = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithRedirect(auth, provider);
  };

  getRedirectResult(auth).catch(()=>{});

  onAuthStateChanged(auth, (user)=>{
    renderTopbar(user);
  });
}

function renderTopbar(user){
  UI.renderAuthBar(`
    <button id="btnOpenAdd" class="secondary">+ إعلان جديد</button>
    ${user
      ? `<button id="btnLogout" class="ghost">خروج</button>`
      : `<button id="btnOpenAuth" class="ghost">دخول</button>`
    }
  `);

  document.getElementById("btnOpenAdd").onclick = () => {
    if (!auth.currentUser) return UI.actions.openAuth();
    UI.actions.openAdd();
  };

  if (!user){
    document.getElementById("btnOpenAuth").onclick = () => UI.actions.openAuth();
    return;
  }

  document.getElementById("btnLogout").onclick = () => signOut(auth);
}

export function requireAuth(){
  if (!auth.currentUser){
    UI.actions.openAuth();
    throw new Error("AUTH_REQUIRED");
  }
}