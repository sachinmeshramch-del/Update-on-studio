import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  projectId: "lithe-framing-tdtd0",
  appId: "1:753381758696:web:ca88c253ba2af6fa1cdb5d",
  apiKey: "AIzaSyAVTW55UFazxYwkRxpnvEAEY5jThxh-nGg",
  authDomain: "lithe-framing-tdtd0.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-newupdate-e592ea8b-365a-4957-b176-b1d6a1a78904",
  storageBucket: "lithe-framing-tdtd0.firebasestorage.app",
  messagingSenderId: "753381758696"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
