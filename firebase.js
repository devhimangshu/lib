// firebase.js

// Firebase configuration from your project details
const firebaseConfig = {
  apiKey: "AIzaSyBPQ67r9mMz-x8fOCXozbVGMW_de81b0_8",
  authDomain: "stakehub-fc6be.firebaseapp.com",
  databaseURL: "https://stakehub-fc6be-default-rtdb.firebaseio.com",
  projectId: "stakehub-fc6be",
  storageBucket: "stakehub-fc6be.appspot.com",
  messagingSenderId: "990758331124",
  appId: "1:990758331124:android:11851d9fb54fa6d8eef4a1",
  measurementId: "G-XXXXXX"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const database = firebase.database(app);
const auth = firebase.auth();
