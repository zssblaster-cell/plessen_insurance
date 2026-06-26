import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCoX2ca-53xASbmr5ivoFUaEj8kLI_ExJ8",
  authDomain: "plessen-insurance.firebaseapp.com",
  projectId: "plessen-insurance",
  storageBucket: "plessen-insurance.firebasestorage.app",
  messagingSenderId: "486817066290",
  appId: "1:486817066290:web:c0f6ae4556d04d5ce9fb2b"
};

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
