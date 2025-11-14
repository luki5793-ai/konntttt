/**
 * Utility functions for the IT Contact Extractor
 * Includes logging, rate limiting, retry logic, and helper functions
 */

import { log as apifyLog } from 'crawlee';

/**
 * Custom logger with log levels
 */
export const logger = {
    info: (message, data = {}) => {
        apifyLog.info(message, data);
    },
    warning: (message, data = {}) => {
        apifyLog.warning(message, data);
    },
    error: (message, error = null) => {
        if (error) {
            apifyLog.error(message, { error: error.message, stack: error.stack });
        } else {
            apifyLog.error(message);
        }
    },
    debug: (message, data = {}) => {
        apifyLog.debug(message, data);
    }
};

/**
 * Sleep utility for rate limiting
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Rate limiter to prevent overwhelming servers
 * @param {number} requestsPerSecond - Maximum requests per second
 */
export class RateLimiter {
    constructor(requestsPerSecond = 1) {
        this.requestsPerSecond = requestsPerSecond;
        this.interval = 1000 / requestsPerSecond;
        this.lastRequestTime = 0;
    }

    async wait() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const timeToWait = this.interval - timeSinceLastRequest;

        if (timeToWait > 0) {
            await sleep(timeToWait);
        }

        this.lastRequestTime = Date.now();
    }
}

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {string} operationName - Name of operation for logging
 * @returns {Promise<any>} - Result of the function
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000, operationName = 'operation') {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt);
                logger.warning(`${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`, {
                    error: error.message
                });
                await sleep(delay);
            }
        }
    }

    logger.error(`${operationName} failed after ${maxRetries + 1} attempts`, lastError);
    throw lastError;
}

/**
 * Extracts domain from company name for web searches
 * @param {string} companyName - Company name
 * @returns {string} - Likely domain name
 */
export function guessDomainFromCompany(companyName) {
    if (!companyName) return '';

    // Remove common suffixes
    let domain = companyName
        .toLowerCase()
        .replace(/\s+(gmbh|ag|se|kg|ohg|gbr|ug|inc|ltd|llc|corp|plc)/gi, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();

    // Handle special cases for well-known companies
    const knownDomains = {
        'sap': 'sap.com',
        'siemens': 'siemens.com',
        'bosch': 'bosch.com',
        'bmw': 'bmw.com',
        'mercedes': 'mercedes-benz.com',
        'volkswagen': 'volkswagen.com',
        'telekom': 'telekom.com',
        'deutsche telekom': 'telekom.com',
        'allianz': 'allianz.com',
        'bayer': 'bayer.com',
        'basf': 'basf.com',
        'adidas': 'adidas.com',
        'puma': 'puma.com',
        'lufthansa': 'lufthansa.com',
        'deutsche bank': 'db.com',
        'commerzbank': 'commerzbank.com'
    };

    const normalized = companyName.toLowerCase().trim();
    if (knownDomains[normalized]) {
        return knownDomains[normalized];
    }

    return `${domain}.com`;
}

/**
 * Generates search queries for finding contacts
 * @param {string} companyName - Company name
 * @param {Array<string>} targetRoles - Target job titles
 * @param {string} country - Country/region
 * @returns {Array<string>} - Array of search queries
 */
export function generateSearchQueries(companyName, targetRoles, country = 'Deutschland') {
    const queries = [];

    // Company website queries
    queries.push(`${companyName} team`);
    queries.push(`${companyName} über uns`);
    queries.push(`${companyName} management`);
    queries.push(`${companyName} kontakt`);
    queries.push(`${companyName} impressum`);

    // Role-specific queries
    const topRoles = targetRoles.slice(0, 3); // Use top 3 roles
    for (const role of topRoles) {
        queries.push(`${companyName} ${role}`);
        queries.push(`${companyName} ${role} ${country}`);
    }

    // LinkedIn specific
    queries.push(`site:linkedin.com ${companyName} CTO`);
    queries.push(`site:linkedin.com ${companyName} CIO`);
    queries.push(`site:linkedin.com ${companyName} "Head of IT"`);

    // Xing specific (DACH region)
    queries.push(`site:xing.com ${companyName}`);

    return queries;
}

/**
 * Extracts name components from full name
 * @param {string} fullName - Full name
 * @returns {Object} - Object with firstName and lastName
 */
export function parseFullName(fullName) {
    if (!fullName || typeof fullName !== 'string') {
        return { firstName: '', lastName: '' };
    }

    const parts = fullName.trim().split(/\s+/);

    if (parts.length === 0) {
        return { firstName: '', lastName: '' };
    }

    if (parts.length === 1) {
        return { firstName: parts[0], lastName: '' };
    }

    // Handle titles
    const titles = ['Dr.', 'Prof.', 'Dr', 'Prof'];
    let filteredParts = parts.filter(part => !titles.includes(part));

    if (filteredParts.length === 0) {
        filteredParts = parts;
    }

    const firstName = filteredParts[0];
    const lastName = filteredParts.slice(1).join(' ');

    return { firstName, lastName };
}

/**
 * Detects salutation from name or title
 * @param {string} name - Full name or title
 * @returns {string|null} - Detected salutation or null
 */
export function detectSalutation(name) {
    if (!name) return null;

    const lower = name.toLowerCase();

    if (lower.includes('herr') || lower.includes('mr.') || lower.includes('mr ')) {
        return 'Herr';
    }

    if (lower.includes('frau') || lower.includes('mrs.') || lower.includes('mrs ') ||
        lower.includes('ms.') || lower.includes('ms ')) {
        return 'Frau';
    }

    return null;
}

/**
 * Normalizes company name
 * @param {string} companyName - Raw company name
 * @returns {string} - Normalized company name
 */
export function normalizeCompanyName(companyName) {
    if (!companyName) return '';

    return companyName
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\b(gmbh|ag|se|kg)\b/gi, match => match.toUpperCase());
}

/**
 * Checks if a URL is accessible
 * @param {string} url - URL to check
 * @param {Object} page - Playwright page object
 * @returns {Promise<boolean>} - True if accessible
 */
export async function isUrlAccessible(url, page) {
    try {
        const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 10000
        });

        return response && response.status() < 400;
    } catch (error) {
        logger.debug(`URL not accessible: ${url}`, { error: error.message });
        return false;
    }
}

/**
 * Extracts emails from text using regex
 * @param {string} text - Text to search
 * @returns {Array<string>} - Array of email addresses
 */
export function extractEmailsFromText(text) {
    if (!text || typeof text !== 'string') {
        return [];
    }

    const emailRegex = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*/g;
    const matches = text.match(emailRegex) || [];

    return [...new Set(matches)]; // Remove duplicates
}

/**
 * Extracts phone numbers from text
 * @param {string} text - Text to search
 * @returns {Array<string>} - Array of phone numbers
 */
export function extractPhonesFromText(text) {
    if (!text || typeof text !== 'string') {
        return [];
    }

    // Pattern for international phone numbers (including German format)
    const phonePatterns = [
        /\+\d{1,3}\s?\d{1,4}\s?\d{1,4}\s?\d{1,9}/g,  // International format
        /\(\d{3,5}\)\s?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{1,4}/g,  // (0123) 456-789
        /\d{3,5}[-\s]?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{1,4}/g  // 0123-456-789
    ];

    const phones = [];

    for (const pattern of phonePatterns) {
        const matches = text.match(pattern) || [];
        phones.push(...matches);
    }

    return [...new Set(phones)]; // Remove duplicates
}

/**
 * Creates a timestamp for data tracking
 * @returns {string} - ISO 8601 timestamp
 */
export function createTimestamp() {
    return new Date().toISOString();
}

/**
 * Safely extracts text content from element
 * @param {Object} element - Playwright element handle
 * @returns {Promise<string>} - Text content
 */
export async function safeTextContent(element) {
    try {
        if (!element) return '';
        const text = await element.textContent();
        return text ? text.trim() : '';
    } catch (error) {
        return '';
    }
}

/**
 * Safely extracts attribute from element
 * @param {Object} element - Playwright element handle
 * @param {string} attribute - Attribute name
 * @returns {Promise<string>} - Attribute value
 */
export async function safeGetAttribute(element, attribute) {
    try {
        if (!element) return '';
        const value = await element.getAttribute(attribute);
        return value ? value.trim() : '';
    } catch (error) {
        return '';
    }
}
