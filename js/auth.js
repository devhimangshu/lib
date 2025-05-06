/**
 * Library Management System - Authentication Module
 * Handles all user authentication and session management
 */

// Authentication State Listener
auth.onAuthStateChanged(user => {
    if (user) {
        // User is signed in
        checkAdminStatus(user.uid).then(isAdmin => {
            if (isAdmin) {
                // Redirect to admin dashboard if not already there
                if (!window.location.pathname.includes('pages/dashboard.html')) {
                    window.location.href = 'pages/dashboard.html';
                }
            } else {
                // Redirect to member dashboard if not already there
                if (!window.location.pathname.includes('pages/member-dashboard.html')) {
                    window.location.href = 'pages/member-dashboard.html';
                }
            }
        });
    } else {
        // User is signed out
        // Redirect to login page if not already there
        if (!window.location.pathname.includes('index.html') && 
            !window.location.pathname.endsWith('/')) {
            window.location.href = '../index.html';
        }
    }
});

/**
 * Login with email and password
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise} resolves with user object, rejects with error
 */
function login(email, password) {
    return auth.signInWithEmailAndPassword(email, password)
        .then(userCredential => {
            return userCredential.user;
        })
        .catch(error => {
            // Convert Firebase error codes to user-friendly messages
            let errorMessage;
            switch (error.code) {
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address';
                    break;
                case 'auth/user-disabled':
                    errorMessage = 'This account has been disabled';
                    break;
                case 'auth/user-not-found':
                    errorMessage = 'No account found with this email';
                    break;
                case 'auth/wrong-password':
                    errorMessage = 'Incorrect password';
                    break;
                default:
                    errorMessage = 'Login failed. Please try again.';
            }
            throw new Error(errorMessage);
        });
}

/**
 * Logout current user
 * @returns {Promise} resolves when logout is complete
 */
function logout() {
    return auth.signOut()
        .then(() => {
            // Redirect handled by auth state listener
        })
        .catch(error => {
            console.error('Logout error:', error);
            throw error;
        });
}

/**
 * Check if user is admin
 * @param {string} uid 
 * @returns {Promise<boolean>} true if user is admin
 */
function checkAdminStatus(uid) {
    return dbRef.admins.child(uid).once('value')
        .then(snapshot => {
            return snapshot.exists();
        });
}

/**
 * Get current user data
 * @returns {Promise<Object>} user data object
 */
function getCurrentUserData() {
    const user = auth.currentUser;
    if (!user) return Promise.reject(new Error('No user logged in'));

    return checkAdminStatus(user.uid)
        .then(isAdmin => {
            if (isAdmin) {
                return dbRef.admins.child(user.uid).once('value')
                    .then(snapshot => snapshot.val());
            } else {
                return dbRef.members.orderByChild('email').equalTo(user.email).once('value')
                    .then(snapshot => {
                        let memberData = null;
                        snapshot.forEach(child => {
                            memberData = child.val();
                            memberData.id = child.key;
                        });
                        return memberData;
                    });
            }
        });
}

/**
 * Password reset functionality
 * @param {string} email 
 * @returns {Promise} resolves when email is sent
 */
function sendPasswordResetEmail(email) {
    return auth.sendPasswordResetEmail(email)
        .then(() => {
            return true;
        })
        .catch(error => {
            let errorMessage;
            switch (error.code) {
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address';
                    break;
                case 'auth/user-not-found':
                    errorMessage = 'No account found with this email';
                    break;
                default:
                    errorMessage = 'Error sending reset email. Please try again.';
            }
            throw new Error(errorMessage);
        });
}

// Helper function to get auth token
function getAuthToken() {
    return auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null);
}

// Export functions if needed
export { 
    login, 
    logout, 
    checkAdminStatus, 
    getCurrentUserData, 
    sendPasswordResetEmail,
    getAuthToken
};
