/**
 * Firebase Configuration for Library Management System
 * Using your provided Firebase project details
 */

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBPQ67r9mMz-x8fOCXozbVGMW_de81b0_8",
  authDomain: "stakehub-fc6be.firebaseapp.com",
  databaseURL: "https://stakehub-fc6be-default-rtdb.firebaseio.com",
  projectId: "stakehub-fc6be",
  storageBucket: "stakehub-fc6be.appspot.com",
  messagingSenderId: "990758331124",
  appId: "1:990758331124:web:11851d9fb54fa6d8eef4a1"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
const auth = firebase.auth();

// Initialize Realtime Database and get a reference to the service
const database = firebase.database();

// Set database persistence (optional)
// firebase.database().setPersistenceEnabled(true);

// Create database references
const dbRef = {
  books: database.ref('library/books'),
  members: database.ref('library/members'),
  transactions: database.ref('library/transactions'),
  admins: database.ref('library/admins')
};

// Initialize default admin (run once)
function initializeDefaultAdmin() {
  const defaultAdmin = {
    email: "admin@library.com",
    password: "admin123",
    name: "System Administrator",
    role: "admin",
    createdAt: firebase.database.ServerValue.TIMESTAMP
  };

  // Check if admin exists
  dbRef.admins.orderByChild('email').equalTo(defaultAdmin.email).once('value')
    .then(snapshot => {
      if (!snapshot.exists()) {
        // Create admin auth account
        auth.createUserWithEmailAndPassword(defaultAdmin.email, defaultAdmin.password)
          .then(userCredential => {
            // Add admin to database
            const adminData = {
              email: defaultAdmin.email,
              name: defaultAdmin.name,
              role: defaultAdmin.role,
              createdAt: defaultAdmin.createdAt
            };
            dbRef.admins.child(userCredential.user.uid).set(adminData);
          })
          .catch(error => {
            console.error("Error creating default admin:", error);
          });
      }
    });
}

// Call this function once when setting up your system
// initializeDefaultAdmin();

// Export Firebase services if needed
export { app, auth, database, dbRef };
