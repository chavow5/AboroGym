import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration for AboroGym Web (aborogym-5d109)
// Retrieved via firebase_get_sdk_config for appId 1:1098540689102:web:108d6b847ed37db0ed529f
const firebaseConfig = {
  projectId: 'aborogym-5d109',
  appId: '1:1098540689102:web:108d6b847ed37db0ed529f',
  storageBucket: 'aborogym-5d109.firebasestorage.app',
  apiKey: 'AIzaSyAnZUwv0HpqoIFbpRfbk4FbT6_WlDXEucE',
  authDomain: 'aborogym-5d109.firebaseapp.com',
  messagingSenderId: '1098540689102',
  measurementId: 'G-D2CKXJSKVV'
};

// Evita errores de inicialización duplicada durante recargas de Vite (HMR)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const db = getFirestore(app);

export { app, auth, googleProvider, db, firebaseConfig };
