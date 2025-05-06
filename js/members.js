/**
 * Library Management System - Member Management Module
 * Handles all member-related operations
 */

// Member status constants
const MEMBER_STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    SUSPENDED: 'suspended',
    GRADUATED: 'graduated'
};

// Member type constants
const MEMBER_TYPE = {
    STUDENT: 'student',
    FACULTY: 'faculty',
    STAFF: 'staff',
    GUEST: 'guest'
};

/**
 * Register a new library member
 * @param {Object} memberData - Member information
 * @param {string} memberData.name - Full name
 * @param {string} memberData.email - Email address
 * @param {string} memberData.phone - Phone number
 * @param {string} memberData.address - Physical address
 * @param {string} memberData.memberType - Member type (student/faculty/staff/guest)
 * @param {string} memberData.idNumber - Institutional ID number
 * @param {string} memberData.department - Department/Program
 * @returns {Promise<string>} Resolves with new member ID
 */
function registerMember(memberData) {
    // Validate required fields
    if (!memberData.name || !memberData.email || !memberData.memberType) {
        return Promise.reject(new Error('Name, email, and member type are required'));
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(memberData.email)) {
        return Promise.reject(new Error('Please enter a valid email address'));
    }

    // Set default values
    const newMember = {
        name: memberData.name.trim(),
        email: memberData.email.trim().toLowerCase(),
        phone: memberData.phone?.trim() || '',
        address: memberData.address?.trim() || '',
        memberType: memberData.memberType,
        idNumber: memberData.idNumber?.trim() || '',
        department: memberData.department?.trim() || '',
        status: MEMBER_STATUS.ACTIVE,
        joinDate: firebase.database.ServerValue.TIMESTAMP,
        lastRenewed: firebase.database.ServerValue.TIMESTAMP,
        expiryDate: calculateExpiryDate(memberData.memberType),
        totalBooksCheckedOut: 0,
        totalFines: 0,
        currentFines: 0
    };

    // Check if member already exists with this email
    return dbRef.members.orderByChild('email').equalTo(newMember.email).once('value')
        .then(snapshot => {
            if (snapshot.exists()) {
                throw new Error('A member with this email already exists');
            }
            return dbRef.members.push(newMember);
        })
        .then(ref => {
            console.log(`New member registered with ID: ${ref.key}`);
            return ref.key;
        })
        .catch(error => {
            console.error('Error registering member:', error);
            throw error;
        });
}

// Helper function to calculate membership expiry date
function calculateExpiryDate(memberType) {
    const now = new Date();
    let expiryDate = new Date();

    switch (memberType) {
        case MEMBER_TYPE.STUDENT:
            expiryDate.setFullYear(now.getFullYear() + 2); // 2 years for students
            break;
        case MEMBER_TYPE.FACULTY:
            expiryDate.setFullYear(now.getFullYear() + 5); // 5 years for faculty
            break;
        case MEMBER_TYPE.STAFF:
            expiryDate.setFullYear(now.getFullYear() + 3); // 3 years for staff
            break;
        case MEMBER_TYPE.GUEST:
            expiryDate.setMonth(now.getMonth() + 6); // 6 months for guests
            break;
        default:
            expiryDate.setFullYear(now.getFullYear() + 1); // Default 1 year
    }

    return expiryDate.getTime();
}

/**
 * Update member information
 * @param {string} memberId - Member ID to update
 * @param {Object} updates - Fields to update
 * @returns {Promise} Resolves when update is complete
 */
function updateMember(memberId, updates) {
    if (!memberId) {
        return Promise.reject(new Error('Member ID is required'));
    }

    // Validate and clean updates
    const validUpdates = {};
    if (updates.name) validUpdates.name = updates.name.trim();
    if (updates.phone) validUpdates.phone = updates.phone.trim();
    if (updates.address) validUpdates.address = updates.address.trim();
    if (updates.department) validUpdates.department = updates.department.trim();
    if (updates.idNumber) validUpdates.idNumber = updates.idNumber.trim();
    
    // Validate status updates
    if (updates.status && Object.values(MEMBER_STATUS).includes(updates.status)) {
        validUpdates.status = updates.status;
    }

    // Validate member type updates
    if (updates.memberType && Object.values(MEMBER_TYPE).includes(updates.memberType)) {
        validUpdates.memberType = updates.memberType;
        // Update expiry date when member type changes
        validUpdates.expiryDate = calculateExpiryDate(updates.memberType);
    }

    // Add update timestamp
    validUpdates.updatedAt = firebase.database.ServerValue.TIMESTAMP;

    return dbRef.members.child(memberId).update(validUpdates)
        .catch(error => {
            console.error('Error updating member:', error);
            throw new Error('Failed to update member');
        });
}

/**
 * Delete a member record
 * @param {string} memberId - Member ID to delete
 * @returns {Promise} Resolves when deletion is complete
 */
function deleteMember(memberId) {
    if (!memberId) {
        return Promise.reject(new Error('Member ID is required'));
    }

    // First check if member has any active transactions
    return dbRef.transactions.orderByChild('memberId').equalTo(memberId).once('value')
        .then(snapshot => {
            if (snapshot.exists()) {
                throw new Error('Cannot delete member with active transactions');
            }
            return dbRef.members.child(memberId).remove();
        })
        .catch(error => {
            console.error('Error deleting member:', error);
            throw error;
        });
}

/**
 * Get all members
 * @param {number} limit - Maximum number of members to return
 * @returns {Promise<Array>} Resolves with array of member objects
 */
function getAllMembers(limit = 100) {
    return dbRef.members.limitToLast(limit).once('value')
        .then(snapshot => {
            const members = [];
            snapshot.forEach(child => {
                members.push({
                    id: child.key,
                    ...child.val()
                });
            });
            return members.reverse(); // Newest first
        })
        .catch(error => {
            console.error('Error fetching members:', error);
            throw new Error('Failed to load members');
        });
}

/**
 * Get member by ID
 * @param {string} memberId 
 * @returns {Promise<Object>} Resolves with member data
 */
function getMemberById(memberId) {
    if (!memberId) {
        return Promise.reject(new Error('Member ID is required'));
    }

    return dbRef.members.child(memberId).once('value')
        .then(snapshot => {
            const member = snapshot.val();
            if (!member) throw new Error('Member not found');
            return {
                id: snapshot.key,
                ...member
            };
        })
        .catch(error => {
            console.error('Error fetching member:', error);
            throw error;
        });
}

/**
 * Search members by various criteria
 * @param {string} query - Search term
 * @param {string} field - Field to search (name, email, idNumber, department)
 * @returns {Promise<Array>} Resolves with array of matching members
 */
function searchMembers(query, field = 'name') {
    if (!query) return Promise.resolve([]);

    const searchTerm = query.toLowerCase().trim();
    const validFields = ['name', 'email', 'idNumber', 'department'];
    
    if (!validFields.includes(field)) {
        field = 'name';
    }

    return dbRef.members.once('value')
        .then(snapshot => {
            const results = [];
            snapshot.forEach(child => {
                const member = child.val();
                const fieldValue = member[field]?.toString().toLowerCase() || '';
                
                if (fieldValue.includes(searchTerm)) {
                    results.push({
                        id: child.key,
                        ...member
                    });
                }
            });
            return results;
        })
        .catch(error => {
            console.error('Error searching members:', error);
            throw new Error('Search failed');
        });
}

/**
 * Renew member membership
 * @param {string} memberId 
 * @returns {Promise} Resolves with new expiry date
 */
function renewMembership(memberId) {
    return getMemberById(memberId)
        .then(member => {
            const newExpiryDate = calculateExpiryDate(member.memberType);
            return dbRef.members.child(memberId).update({
                expiryDate: newExpiryDate,
                lastRenewed: firebase.database.ServerValue.TIMESTAMP,
                status: MEMBER_STATUS.ACTIVE,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            }).then(() => newExpiryDate);
        });
}

/**
 * Update member status
 * @param {string} memberId 
 * @param {string} newStatus 
 * @returns {Promise} Resolves when update is complete
 */
function updateMemberStatus(memberId, newStatus) {
    if (!Object.values(MEMBER_STATUS).includes(newStatus)) {
        return Promise.reject(new Error('Invalid member status'));
    }

    return dbRef.members.child(memberId).update({
        status: newStatus,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
}

/**
 * Get members by status
 * @param {string} status 
 * @returns {Promise<Array>} Resolves with array of members
 */
function getMembersByStatus(status) {
    if (!Object.values(MEMBER_STATUS).includes(status)) {
        return Promise.reject(new Error('Invalid member status'));
    }

    return dbRef.members.orderByChild('status').equalTo(status).once('value')
        .then(snapshot => {
            const members = [];
            snapshot.forEach(child => {
                members.push({
                    id: child.key,
                    ...child.val()
                });
            });
            return members;
        });
}

// Export functions
export {
    MEMBER_STATUS,
    MEMBER_TYPE,
    registerMember,
    updateMember,
    deleteMember,
    getAllMembers,
    getMemberById,
    searchMembers,
    renewMembership,
    updateMemberStatus,
    getMembersByStatus
};
