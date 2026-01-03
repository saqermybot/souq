import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
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
export const db = getFirestore(app);
export const auth = getAuth(app);

// ثبات تسجيل الدخول (حل نسيان iOS/Chrome)
setPersistence(auth, browserLocalPersistence).catch(async () => {
  await setPersistence(auth, browserSessionPersistence);
});