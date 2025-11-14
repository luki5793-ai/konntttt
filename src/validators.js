/**
 * Validators for contact data extraction
 * Implements RFC 5322 email validation and international phone number validation
 */

/**
 * Validates email address according to RFC 5322
 * Rejects generic addresses like info@, contact@, support@
 * @param {string} email - Email address to validate
 * @returns {boolean} - True if valid
 */
export function isValidEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }

    // Reject generic email addresses
    const genericPrefixes = [
        'info@',
        'contact@',
        'support@',
        'sales@',
        'hello@',
        'office@',
        'admin@',
        'service@',
        'help@',
        'mail@',
        'noreply@',
        'no-reply@'
    ];

    const lowerEmail = email.toLowerCase();
    for (const prefix of genericPrefixes) {
        if (lowerEmail.startsWith(prefix)) {
            return false;
        }
    }

    // RFC 5322 compliant regex (simplified but effective)
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    return emailRegex.test(email);
}

/**
 * Validates and formats international phone number
 * Accepts various formats and normalizes to international format
 * @param {string} phone - Phone number to validate
 * @returns {string|null} - Formatted phone number or null if invalid
 */
export function validateAndFormatPhone(phone) {
    if (!phone || typeof phone !== 'string') {
        return null;
    }

    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Must have at least 7 digits (minimum valid phone number)
    const digitCount = cleaned.replace(/\+/g, '').length;
    if (digitCount < 7 || digitCount > 15) {
        return null;
    }

    // Ensure it starts with + if it doesn't already
    if (!cleaned.startsWith('+')) {
        // Add default country code if missing (Germany +49 as default)
        if (cleaned.startsWith('0')) {
            cleaned = '+49' + cleaned.substring(1);
        } else {
            cleaned = '+' + cleaned;
        }
    }

    // Format the number nicely (keep + and add spaces)
    const match = cleaned.match(/^\+(\d{1,3})(\d+)$/);
    if (!match) {
        return null;
    }

    const countryCode = match[1];
    const number = match[2];

    // Format: +XX XXXX XXXX or similar
    return `+${countryCode} ${number.replace(/(\d{3,4})/g, '$1 ').trim()}`;
}

/**
 * Validates contact object completeness and data quality
 * @param {Object} contact - Contact object to validate
 * @returns {Object} - Validation result with isValid flag and errors array
 */
export function validateContact(contact) {
    const errors = [];

    // Required fields
    const requiredFields = ['company', 'firstName', 'lastName', 'email', 'jobTitle'];
    for (const field of requiredFields) {
        if (!contact[field] || contact[field].trim() === '') {
            errors.push(`Missing required field: ${field}`);
        }
    }

    // Check for placeholder/dummy data
    const placeholderPatterns = [
        /test/i,
        /dummy/i,
        /example/i,
        /placeholder/i,
        /xxx/i,
        /n\/a/i,
        /tbd/i,
        /unknown/i
    ];

    for (const [key, value] of Object.entries(contact)) {
        if (typeof value === 'string') {
            for (const pattern of placeholderPatterns) {
                if (pattern.test(value)) {
                    errors.push(`Placeholder data detected in ${key}: ${value}`);
                    break;
                }
            }
        }
    }

    // Validate email
    if (contact.email && !isValidEmail(contact.email)) {
        errors.push(`Invalid email address: ${contact.email}`);
    }

    // Validate phone if present
    if (contact.phone) {
        const formattedPhone = validateAndFormatPhone(contact.phone);
        if (!formattedPhone) {
            errors.push(`Invalid phone number: ${contact.phone}`);
        } else {
            contact.phone = formattedPhone; // Update with formatted version
        }
    }

    // Validate salutation
    if (contact.salutation) {
        const validSalutations = ['Herr', 'Frau', 'Dr.', 'Prof.', 'Prof. Dr.'];
        if (!validSalutations.includes(contact.salutation)) {
            // Try to normalize
            const normalized = normalizeSalutation(contact.salutation);
            if (normalized) {
                contact.salutation = normalized;
            } else {
                errors.push(`Invalid salutation: ${contact.salutation}`);
            }
        }
    }

    // Validate LinkedIn URL if present
    if (contact.linkedInUrl && !isValidLinkedInUrl(contact.linkedInUrl)) {
        errors.push(`Invalid LinkedIn URL: ${contact.linkedInUrl}`);
    }

    return {
        isValid: errors.length === 0,
        errors,
        contact
    };
}

/**
 * Normalizes salutation to standard format
 * @param {string} salutation - Raw salutation
 * @returns {string|null} - Normalized salutation or null
 */
function normalizeSalutation(salutation) {
    if (!salutation) return null;

    const lower = salutation.toLowerCase().trim();

    if (lower.includes('herr') || lower === 'mr' || lower === 'mr.') {
        return 'Herr';
    }
    if (lower.includes('frau') || lower === 'mrs' || lower === 'mrs.' || lower === 'ms' || lower === 'ms.') {
        return 'Frau';
    }
    if (lower.includes('dr') && lower.includes('prof')) {
        return 'Prof. Dr.';
    }
    if (lower.includes('prof')) {
        return 'Prof.';
    }
    if (lower.includes('dr')) {
        return 'Dr.';
    }

    return null;
}

/**
 * Validates LinkedIn URL format
 * @param {string} url - LinkedIn URL to validate
 * @returns {boolean} - True if valid
 */
function isValidLinkedInUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }

    const linkedInPattern = /^https?:\/\/(www\.)?linkedin\.com\/(in|pub)\/[\w-]+\/?$/;
    return linkedInPattern.test(url);
}

/**
 * Checks if a job title matches target roles
 * @param {string} jobTitle - Job title to check
 * @param {Array<string>} targetRoles - Array of target role keywords
 * @returns {number} - Priority score (higher is better, 0 if no match)
 */
export function matchJobTitlePriority(jobTitle, targetRoles) {
    if (!jobTitle || !targetRoles) {
        return 0;
    }

    const lowerTitle = jobTitle.toLowerCase();

    // Find matching roles and their priorities
    for (let i = 0; i < targetRoles.length; i++) {
        const role = targetRoles[i].toLowerCase();
        if (lowerTitle.includes(role)) {
            // Higher priority for earlier roles in the list
            return targetRoles.length - i;
        }
    }

    // Additional checks for common variations
    const itKeywords = ['cto', 'cio', 'it-leiter', 'head of it', 'vp engineering', 'chief technology'];
    const hrKeywords = ['hr director', 'head of hr', 'recruiting', 'talent acquisition'];

    for (const keyword of itKeywords) {
        if (lowerTitle.includes(keyword)) {
            return 50; // High priority for IT roles
        }
    }

    for (const keyword of hrKeywords) {
        if (lowerTitle.includes(keyword)) {
            return 30; // Medium priority for HR roles
        }
    }

    return 0;
}

/**
 * Deduplicates contacts by email address
 * @param {Array<Object>} contacts - Array of contact objects
 * @returns {Array<Object>} - Deduplicated contacts
 */
export function deduplicateContacts(contacts) {
    const seen = new Map();
    const deduplicated = [];

    for (const contact of contacts) {
        if (!contact.email) continue;

        const emailKey = contact.email.toLowerCase();

        if (!seen.has(emailKey)) {
            seen.set(emailKey, true);
            deduplicated.push(contact);
        }
    }

    return deduplicated;
}

/**
 * Sanitizes and cleans text input
 * @param {string} text - Text to sanitize
 * @returns {string} - Cleaned text
 */
export function sanitizeText(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    return text
        .trim()
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/[^\w\s@.\-+äöüßÄÖÜ]/g, '') // Remove special chars but keep German umlauts
        .trim();
}
