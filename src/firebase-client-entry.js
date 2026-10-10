import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocFromServer
} from 'firebase/firestore';

const config = {
  projectId: "hazel-logic-jv4kj",
  appId: "1:396272193878:web:c9b8b5fb73f92ae48386f7",
  apiKey: "AIzaSyAKjUqtTeF7_KagJ3DxJUaz6SjhS2llVOA",
  authDomain: "hazel-logic-jv4kj.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-platformv1-35be5c80-6a5b-430d-acb2-1dbe5ef34c30",
  storageBucket: "hazel-logic-jv4kj.firebasestorage.app",
  messagingSenderId: "396272193878"
};

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

window.__FIREBASE_CLIENT__ = {
  db,
  app,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocFromServer
};
