// ===== FIREBASE CONFIGURATION =====
const firebaseConfig = {
  apiKey: "AIzaSyCJ6uIQAnhekmu_-8Zfuzjuj2_jbwax2qQ",
  authDomain: "harelbar-ca7dd.firebaseapp.com",
  databaseURL: "https://harelbar-ca7dd-default-rtdb.firebaseio.com",
  projectId: "harelbar-ca7dd",
  storageBucket: "harelbar-ca7dd.firebasestorage.app",
  messagingSenderId: "231258208699",
  appId: "1:231258208699:web:218431cffe13570c366c9e"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
