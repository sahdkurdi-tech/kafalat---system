/* js/firebase-config.js */
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCblBgirNBStpbb1TrVNzKJnJ4-FpuVvyE",
  authDomain: "monthly-aid-system-2ec16.firebaseapp.com",
  projectId: "monthly-aid-system-2ec16",
  storageBucket: "monthly-aid-system-2ec16.firebasestorage.app",
  messagingSenderId: "14226596485",
  appId: "1:14226596485:web:33d95fa09fc9b91c2d3fec"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);

// هەناردەکردنی (Export) ئەمانە بۆ ئەوەی لە فایلەکانی تر بەکاریان بهێنین
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;