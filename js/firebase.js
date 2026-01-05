import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  initializeFirestore
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAdZJuYm9tZ9H8Bw60zlzGy-Igt-qub0D8",
  authDomain: "souq-a0e16.firebaseapp.com",
  projectId: "souq-a0e16",
  storageBucket: "souq-a0e16.firebasestorage.app",
  messagingSenderId: "380896713624",
  appId: "1:380896713624:web:22b11fc1a19c93af85e9ed",
  measurementId: "G-WZC4VY0HK8"
};

export const app = initializeApp(firebaseConfig);

// ✅ Detect iOS Safari / iOS WebView (سبب مشاكل WebChannel)
function isLikelyIOS() {
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const webkit = /WebKit/.test(ua);
  const isCriOS = /CriOS/.test(ua);     // Chrome iOS
  const isFxiOS = /FxiOS/.test(ua);     // Firefox iOS
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);

  // كل متصفحات iOS تستخدم WebKit فعلياً، فاعتبر iOS كله حساس
  return iOS && webkit && (isSafari || isCriOS || isFxiOS);
}

// ✅ Firestore instance
export const db = isLikelyIOS()
  ? initializeFirestore(app, {
      experimentalForceLongPolling: true,
      experimentalAutoDetectLongPolling: true,
      useFetchStreams: false
    })
  : getFirestore(app);

export const auth = getAuth(app);

// ✅ ثبات تسجيل الدخول (حل نسيان iOS/Chrome)
setPersistence(auth, browserLocalPersistence).catch(async () => {
  await setPersistence(auth, browserSessionPersistence);
});