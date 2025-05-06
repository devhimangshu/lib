/**
 * Library Management System - Book Management Module
 * Handles all book-related operations
 */

// Book status constants
const BOOK_STATUS = {
    AVAILABLE: 'available',
    CHECKED_OUT: 'checked_out',
    LOST: 'lost',
    MAINTENANCE: 'maintenance'
};

/**
 * Add a new book to the library
 * @param {Object} bookData - Book information
 * @param {string} bookData.title - Book title
 * @param {string} bookData.author - Book author
 * @param {string} bookData.isbn - ISBN number
 * @param {string} bookData.publisher - Publisher name
 * @param {number} bookData.publicationYear - Year of publication
 * @param {string} bookData.genre - Book genre/category
 * @param {number} bookData.copies - Number of copies
 * @param {string} bookData.description - Book description
 * @param {string} bookData.coverUrl - URL to book cover image
 * @returns {Promise} Resolves with book ID, rejects with error
 */
function addBook(bookData) {
    // Validate required fields
    if (!bookData.title || !bookData.author || !bookData.isbn) {
        return Promise.reject(new Error('Title, author, and ISBN are required'));
    }

    // Set default values
    const newBook = {
        title: bookData.title.trim(),
        author: bookData.author.trim(),
        isbn: bookData.isbn.trim(),
        publisher: bookData.publisher?.trim() || '',
        publicationYear: bookData.publicationYear || new Date().getFullYear(),
        genre: bookData.genre?.trim() || 'General',
        copies: parseInt(bookData.copies) || 1,
        availableCopies: parseInt(bookData.copies) || 1,
        description: bookData.description?.trim() || '',
        coverUrl: bookData.coverUrl?.trim() || '',
        status: BOOK_STATUS.AVAILABLE,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    // Add to database
    return dbRef.books.push(newBook)
        .then(ref => {
            console.log(`Book added with ID: ${ref.key}`);
            return ref.key;
        })
        .catch(error => {
            console.error('Error adding book:', error);
            throw new Error('Failed to add book to database');
        });
}

/**
 * Update book information
 * @param {string} bookId - ID of the book to update
 * @param {Object} updates - Fields to update
 * @returns {Promise} Resolves when update is complete
 */
function updateBook(bookId, updates) {
    if (!bookId) {
        return Promise.reject(new Error('Book ID is required'));
    }

    // Clean and validate updates
    const validUpdates = {};
    if (updates.title) validUpdates.title = updates.title.trim();
    if (updates.author) validUpdates.author = updates.author.trim();
    if (updates.isbn) validUpdates.isbn = updates.isbn.trim();
    if (updates.publisher) validUpdates.publisher = updates.publisher.trim();
    if (updates.publicationYear) validUpdates.publicationYear = updates.publicationYear;
    if (updates.genre) validUpdates.genre = updates.genre.trim();
    if (updates.description) validUpdates.description = updates.description.trim();
    if (updates.coverUrl) validUpdates.coverUrl = updates.coverUrl.trim();
    if (updates.status && Object.values(BOOK_STATUS).includes(updates.status)) {
        validUpdates.status = updates.status;
    }

    // Handle copies update specially
    if (updates.copies !== undefined) {
        const newCopies = parseInt(updates.copies);
        if (!isNaN(newCopies) && newCopies >= 0) {
            // Get current book data first to calculate availableCopies
            return dbRef.books.child(bookId).once('value')
                .then(snapshot => {
                    const currentBook = snapshot.val();
                    if (!currentBook) throw new Error('Book not found');

                    const currentAvailable = currentBook.availableCopies || 0;
                    const currentCopies = currentBook.copies || 0;
                    const copiesDifference = newCopies - currentCopies;

                    validUpdates.copies = newCopies;
                    validUpdates.availableCopies = currentAvailable + copiesDifference;
                    validUpdates.updatedAt = firebase.database.ServerValue.TIMESTAMP;

                    return dbRef.books.child(bookId).update(validUpdates);
                });
        }
    }

    // Add updated timestamp
    validUpdates.updatedAt = firebase.database.ServerValue.TIMESTAMP;

    return dbRef.books.child(bookId).update(validUpdates)
        .catch(error => {
            console.error('Error updating book:', error);
            throw new Error('Failed to update book');
        });
}

/**
 * Delete a book from the system
 * @param {string} bookId - ID of the book to delete
 * @returns {Promise} Resolves when deletion is complete
 */
function deleteBook(bookId) {
    if (!bookId) {
        return Promise.reject(new Error('Book ID is required'));
    }

    // First check if the book has any active transactions
    return dbRef.transactions.orderByChild('bookId').equalTo(bookId).once('value')
        .then(snapshot => {
            if (snapshot.exists()) {
                throw new Error('Cannot delete book with active transactions');
            }
            return dbRef.books.child(bookId).remove();
        })
        .catch(error => {
            console.error('Error deleting book:', error);
            throw error;
        });
}

/**
 * Get all books in the library
 * @param {number} limit - Maximum number of books to return
 * @returns {Promise<Array>} Resolves with array of book objects
 */
function getAllBooks(limit = 100) {
    return dbRef.books.limitToLast(limit).once('value')
        .then(snapshot => {
            const books = [];
            snapshot.forEach(child => {
                books.push({
                    id: child.key,
                    ...child.val()
                });
            });
            return books.reverse(); // Newest first
        })
        .catch(error => {
            console.error('Error fetching books:', error);
            throw new Error('Failed to load books');
        });
}

/**
 * Get a specific book by ID
 * @param {string} bookId 
 * @returns {Promise<Object>} Resolves with book data
 */
function getBookById(bookId) {
    if (!bookId) {
        return Promise.reject(new Error('Book ID is required'));
    }

    return dbRef.books.child(bookId).once('value')
        .then(snapshot => {
            const book = snapshot.val();
            if (!book) throw new Error('Book not found');
            return {
                id: snapshot.key,
                ...book
            };
        })
        .catch(error => {
            console.error('Error fetching book:', error);
            throw error;
        });
}

/**
 * Search books by various criteria
 * @param {string} query - Search query
 * @param {string} field - Field to search in (title, author, isbn, genre)
 * @returns {Promise<Array>} Resolves with array of matching books
 */
function searchBooks(query, field = 'title') {
    if (!query) return Promise.resolve([]);

    const searchTerm = query.toLowerCase().trim();
    const validFields = ['title', 'author', 'isbn', 'genre'];
    
    if (!validFields.includes(field)) {
        field = 'title';
    }

    return dbRef.books.once('value')
        .then(snapshot => {
            const results = [];
            snapshot.forEach(child => {
                const book = child.val();
                const fieldValue = book[field]?.toString().toLowerCase() || '';
                
                if (fieldValue.includes(searchTerm)) {
                    results.push({
                        id: child.key,
                        ...book
                    });
                }
            });
            return results;
        })
        .catch(error => {
            console.error('Error searching books:', error);
            throw new Error('Search failed');
        });
}

/**
 * Update book status
 * @param {string} bookId 
 * @param {string} newStatus 
 * @returns {Promise} Resolves when update is complete
 */
function updateBookStatus(bookId, newStatus) {
    if (!Object.values(BOOK_STATUS).includes(newStatus)) {
        return Promise.reject(new Error('Invalid book status'));
    }

    return dbRef.books.child(bookId).update({
        status: newStatus,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
}

/**
 * Get books by status
 * @param {string} status 
 * @returns {Promise<Array>} Resolves with array of books
 */
function getBooksByStatus(status) {
    if (!Object.values(BOOK_STATUS).includes(status)) {
        return Promise.reject(new Error('Invalid book status'));
    }

    return dbRef.books.orderByChild('status').equalTo(status).once('value')
        .then(snapshot => {
            const books = [];
            snapshot.forEach(child => {
                books.push({
                    id: child.key,
                    ...child.val()
                });
            });
            return books;
        });
}

// Export functions
export {
    BOOK_STATUS,
    addBook,
    updateBook,
    deleteBook,
    getAllBooks,
    getBookById,
    searchBooks,
    updateBookStatus,
    getBooksByStatus
};
