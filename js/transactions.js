/**
 * Library Management System - Transaction Management Module
 * Handles all book checkout, return, and fine calculations
 */

// Transaction status constants
const TRANSACTION_STATUS = {
    ACTIVE: 'active',
    RETURNED: 'returned',
    OVERDUE: 'overdue',
    LOST: 'lost'
};

// Fine calculation constants
const FINE_RATE = 5; // ₹5 per day
const MAX_FINE = 500; // Maximum fine ₹500
const CHECKOUT_PERIOD = 14; // 14 days checkout period

/**
 * Check out a book to a member
 * @param {string} bookId - ID of the book to check out
 * @param {string} memberId - ID of the member borrowing the book
 * @returns {Promise<string>} Resolves with new transaction ID
 */
function checkoutBook(bookId, memberId) {
    if (!bookId || !memberId) {
        return Promise.reject(new Error('Book ID and Member ID are required'));
    }

    let bookData, memberData;
    const currentDate = new Date();
    const dueDate = new Date();
    dueDate.setDate(currentDate.getDate() + CHECKOUT_PERIOD);

    // Get book and member data in parallel
    return Promise.all([
        dbRef.books.child(bookId).once('value'),
        dbRef.members.child(memberId).once('value')
    ])
    .then(([bookSnapshot, memberSnapshot]) => {
        bookData = bookSnapshot.val();
        memberData = memberSnapshot.val();

        // Validate data
        if (!bookData) throw new Error('Book not found');
        if (!memberData) throw new Error('Member not found');
        if (bookData.availableCopies <= 0) throw new Error('No available copies of this book');
        if (memberData.status !== MEMBER_STATUS.ACTIVE) throw new Error('Member account is not active');
        if (memberData.currentFines > 0) throw new Error('Member has outstanding fines');
        if (new Date(memberData.expiryDate) < currentDate) throw new Error('Member account has expired');

        // Create transaction record
        const newTransaction = {
            bookId,
            memberId,
            checkoutDate: currentDate.getTime(),
            dueDate: dueDate.getTime(),
            returnDate: null,
            status: TRANSACTION_STATUS.ACTIVE,
            fineAmount: 0,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        return dbRef.transactions.push(newTransaction);
    })
    .then(transactionRef => {
        const updates = {};

        // Update book available copies
        updates[`library/books/${bookId}/availableCopies`] = bookData.availableCopies - 1;

        // Update member's checked out count
        updates[`library/members/${memberId}/totalBooksCheckedOut`] = 
            (memberData.totalBooksCheckedOut || 0) + 1;

        return dbRef.database.ref().update(updates)
            .then(() => transactionRef.key);
    })
    .catch(error => {
        console.error('Error checking out book:', error);
        throw error;
    });
}

/**
 * Return a checked out book
 * @param {string} transactionId - ID of the transaction to complete
 * @returns {Promise<number>} Resolves with fine amount (0 if no fine)
 */
function returnBook(transactionId) {
    if (!transactionId) {
        return Promise.reject(new Error('Transaction ID is required'));
    }

    let transactionData, fineAmount = 0;
    const returnDate = new Date();

    return dbRef.transactions.child(transactionId).once('value')
        .then(snapshot => {
            transactionData = snapshot.val();
            if (!transactionData) throw new Error('Transaction not found');
            if (transactionData.status !== TRANSACTION_STATUS.ACTIVE) {
                throw new Error('Book already returned or transaction closed');
            }

            // Calculate fine if overdue
            if (returnDate > new Date(transactionData.dueDate)) {
                const daysOverdue = Math.ceil(
                    (returnDate - new Date(transactionData.dueDate)) / (1000 * 60 * 60 * 24)
                );
                fineAmount = Math.min(daysOverdue * FINE_RATE, MAX_FINE);
            }

            // Update transaction
            return dbRef.transactions.child(transactionId).update({
                returnDate: returnDate.getTime(),
                status: TRANSACTION_STATUS.RETURNED,
                fineAmount,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });
        })
        .then(() => {
            const updates = {};

            // Update book available copies
            updates[`library/books/${transactionData.bookId}/availableCopies`] = 
                firebase.database.ServerValue.increment(1);

            // Update member fines if applicable
            if (fineAmount > 0) {
                updates[`library/members/${transactionData.memberId}/currentFines`] = 
                    firebase.database.ServerValue.increment(fineAmount);
                updates[`library/members/${transactionData.memberId}/totalFines`] = 
                    firebase.database.ServerValue.increment(fineAmount);
            }

            return dbRef.database.ref().update(updates);
        })
        .then(() => fineAmount)
        .catch(error => {
            console.error('Error returning book:', error);
            throw error;
        });
}

/**
 * Report a book as lost
 * @param {string} transactionId - ID of the transaction
 * @returns {Promise<number>} Resolves with lost book fine amount
 */
function reportBookLost(transactionId) {
    if (!transactionId) {
        return Promise.reject(new Error('Transaction ID is required'));
    }

    const LOST_BOOK_FINE = 1000; // ₹1000 for lost book
    let transactionData;

    return dbRef.transactions.child(transactionId).once('value')
        .then(snapshot => {
            transactionData = snapshot.val();
            if (!transactionData) throw new Error('Transaction not found');
            if (transactionData.status !== TRANSACTION_STATUS.ACTIVE) {
                throw new Error('Transaction already closed');
            }

            // Update transaction
            return dbRef.transactions.child(transactionId).update({
                status: TRANSACTION_STATUS.LOST,
                fineAmount: LOST_BOOK_FINE,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });
        })
        .then(() => {
            const updates = {};

            // Update member fines
            updates[`library/members/${transactionData.memberId}/currentFines`] = 
                firebase.database.ServerValue.increment(LOST_BOOK_FINE);
            updates[`library/members/${transactionData.memberId}/totalFines`] = 
                firebase.database.ServerValue.increment(LOST_BOOK_FINE);

            // Decrement book copies (since it's lost)
            updates[`library/books/${transactionData.bookId}/copies`] = 
                firebase.database.ServerValue.increment(-1);
            updates[`library/books/${transactionData.bookId}/availableCopies`] = 
                firebase.database.ServerValue.increment(-1);

            return dbRef.database.ref().update(updates);
        })
        .then(() => LOST_BOOK_FINE)
        .catch(error => {
            console.error('Error reporting book as lost:', error);
            throw error;
        });
}

/**
 * Pay outstanding fines for a member
 * @param {string} memberId - ID of the member
 * @param {number} amount - Amount being paid
 * @returns {Promise<number>} Resolves with remaining balance
 */
function payFines(memberId, amount) {
    if (!memberId || !amount || amount <= 0) {
        return Promise.reject(new Error('Valid member ID and payment amount are required'));
    }

    return dbRef.members.child(memberId).once('value')
        .then(snapshot => {
            const memberData = snapshot.val();
            if (!memberData) throw new Error('Member not found');

            const newBalance = Math.max(0, (memberData.currentFines || 0) - amount);
            
            return dbRef.members.child(memberId).update({
                currentFines: newBalance,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            }).then(() => newBalance);
        })
        .catch(error => {
            console.error('Error processing fine payment:', error);
            throw error;
        });
}

/**
 * Get all transactions for a member
 * @param {string} memberId 
 * @returns {Promise<Array>} Resolves with array of transactions
 */
function getMemberTransactions(memberId) {
    if (!memberId) {
        return Promise.reject(new Error('Member ID is required'));
    }

    return dbRef.transactions.orderByChild('memberId').equalTo(memberId).once('value')
        .then(snapshot => {
            const transactions = [];
            snapshot.forEach(child => {
                transactions.push({
                    id: child.key,
                    ...child.val()
                });
            });
            return transactions;
        })
        .catch(error => {
            console.error('Error fetching member transactions:', error);
            throw new Error('Failed to load transactions');
        });
}

/**
 * Get all transactions for a book
 * @param {string} bookId 
 * @returns {Promise<Array>} Resolves with array of transactions
 */
function getBookTransactions(bookId) {
    if (!bookId) {
        return Promise.reject(new Error('Book ID is required'));
    }

    return dbRef.transactions.orderByChild('bookId').equalTo(bookId).once('value')
        .then(snapshot => {
            const transactions = [];
            snapshot.forEach(child => {
                transactions.push({
                    id: child.key,
                    ...child.val()
                });
            });
            return transactions;
        })
        .catch(error => {
            console.error('Error fetching book transactions:', error);
            throw new Error('Failed to load transactions');
        });
}

/**
 * Get all active transactions (checked out books)
 * @returns {Promise<Array>} Resolves with array of active transactions
 */
function getActiveTransactions() {
    return dbRef.transactions.orderByChild('status').equalTo(TRANSACTION_STATUS.ACTIVE).once('value')
        .then(snapshot => {
            const transactions = [];
            snapshot.forEach(child => {
                transactions.push({
                    id: child.key,
                    ...child.val()
                });
            });
            return transactions;
        })
        .catch(error => {
            console.error('Error fetching active transactions:', error);
            throw new Error('Failed to load transactions');
        });
}

/**
 * Get overdue transactions
 * @returns {Promise<Array>} Resolves with array of overdue transactions
 */
function getOverdueTransactions() {
    const currentTime = new Date().getTime();

    return dbRef.transactions.orderByChild('status').equalTo(TRANSACTION_STATUS.ACTIVE).once('value')
        .then(snapshot => {
            const overdueTransactions = [];
            snapshot.forEach(child => {
                const transaction = child.val();
                if (transaction.dueDate < currentTime) {
                    overdueTransactions.push({
                        id: child.key,
                        ...transaction
                    });
                }
            });
            return overdueTransactions;
        })
        .catch(error => {
            console.error('Error fetching overdue transactions:', error);
            throw new Error('Failed to load transactions');
        });
}

/**
 * Calculate fine for a transaction
 * @param {string} transactionId 
 * @returns {Promise<number>} Resolves with fine amount
 */
function calculateFine(transactionId) {
    if (!transactionId) {
        return Promise.reject(new Error('Transaction ID is required'));
    }

    return dbRef.transactions.child(transactionId).once('value')
        .then(snapshot => {
            const transaction = snapshot.val();
            if (!transaction) throw new Error('Transaction not found');

            if (transaction.status === TRANSACTION_STATUS.RETURNED) {
                return transaction.fineAmount || 0;
            }

            const now = new Date();
            const dueDate = new Date(transaction.dueDate);

            if (now <= dueDate) {
                return 0;
            }

            const daysOverdue = Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24));
            return Math.min(daysOverdue * FINE_RATE, MAX_FINE);
        })
        .catch(error => {
            console.error('Error calculating fine:', error);
            throw error;
        });
}

// Export functions
export {
    TRANSACTION_STATUS,
    CHECKOUT_PERIOD,
    FINE_RATE,
    MAX_FINE,
    checkoutBook,
    returnBook,
    reportBookLost,
    payFines,
    getMemberTransactions,
    getBookTransactions,
    getActiveTransactions,
    getOverdueTransactions,
    calculateFine
};
