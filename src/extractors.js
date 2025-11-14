/**
 * Extractors for different data sources
 * Implements multi-source strategy for contact extraction
 *
 * IMPORTANT LEGAL NOTE:
 * - This code demonstrates technical implementation
 * - Scraping LinkedIn and Xing may violate their Terms of Service
 * - Use only with proper authorization and for legitimate business purposes
 * - Consider using official APIs where available
 * - Respect robots.txt and rate limits
 * - GDPR compliance is essential when processing personal data
 */

import { isValidEmail, matchJobTitlePriority } from './validators.js';
import {
    logger,
    guessDomainFromCompany,
    extractEmailsFromText,
    extractPhonesFromText,
    parseFullName,
    detectSalutation,
    safeTextContent,
    safeGetAttribute,
    createTimestamp,
    sleep
} from './utils.js';

/**
 * Extracts contacts from company website
 * Searches team pages, about us, contact pages
 * @param {Object} page - Playwright page object
 * @param {string} companyName - Company name
 * @param {Array<string>} targetRoles - Target job titles
 * @param {number} maxContacts - Maximum contacts to extract
 * @returns {Promise<Array<Object>>} - Array of contact objects
 */
export async function extractFromCompanyWebsite(page, companyName, targetRoles, maxContacts = 2) {
    logger.info(`Extracting from company website for: ${companyName}`);
    const contacts = [];

    try {
        const domain = guessDomainFromCompany(companyName);
        const baseUrl = `https://www.${domain}`;

        // Try different common page patterns
        const pagePatterns = [
            '/team',
            '/about',
            '/about-us',
            '/ueber-uns',
            '/unternehmen',
            '/management',
            '/kontakt',
            '/contact',
            '/impressum',
            '/leadership'
        ];

        for (const pattern of pagePatterns) {
            if (contacts.length >= maxContacts) break;

            try {
                const url = baseUrl + pattern;
                logger.debug(`Trying URL: ${url}`);

                const response = await page.goto(url, {
                    waitUntil: 'networkidle',
                    timeout: 15000
                });

                if (!response || response.status() >= 400) {
                    logger.debug(`Page not found: ${url}`);
                    continue;
                }

                await sleep(1000); // Be polite

                // Extract all text content
                const pageText = await page.textContent('body');

                // Look for contact sections
                const contactElements = await page.$$('section, article, div.team, div.contact, div.management, .person, .member');

                for (const element of contactElements) {
                    if (contacts.length >= maxContacts) break;

                    const elementText = await safeTextContent(element);

                    // Check if this section contains role keywords
                    const hasRelevantRole = targetRoles.some(role =>
                        elementText.toLowerCase().includes(role.toLowerCase())
                    );

                    if (hasRelevantRole) {
                        const contact = await extractContactFromElement(element, companyName);

                        if (contact && contact.email && isValidEmail(contact.email)) {
                            contact.source = 'company_website';
                            contact.sourceUrl = url;
                            contacts.push(contact);
                        }
                    }
                }

                // Also try to extract from structured data (JSON-LD, microdata)
                const structuredContacts = await extractFromStructuredData(page, companyName);
                for (const contact of structuredContacts) {
                    if (contacts.length >= maxContacts) break;
                    contact.source = 'company_website';
                    contact.sourceUrl = url;
                    contacts.push(contact);
                }

            } catch (error) {
                logger.debug(`Error accessing ${pattern}:`, { error: error.message });
                continue;
            }
        }

    } catch (error) {
        logger.warning(`Failed to extract from company website for ${companyName}`, {
            error: error.message
        });
    }

    logger.info(`Extracted ${contacts.length} contacts from company website`);
    return contacts;
}

/**
 * Extracts contact information from a DOM element
 * @param {Object} element - Playwright element handle
 * @param {string} companyName - Company name
 * @returns {Promise<Object|null>} - Contact object or null
 */
async function extractContactFromElement(element, companyName) {
    try {
        const text = await safeTextContent(element);

        // Extract email
        const emails = extractEmailsFromText(text);
        const validEmail = emails.find(email => isValidEmail(email));

        if (!validEmail) {
            return null;
        }

        // Extract phone
        const phones = extractPhonesFromText(text);
        const phone = phones[0] || '';

        // Try to find name in various ways
        let firstName = '';
        let lastName = '';
        let jobTitle = '';
        let salutation = '';

        // Look for name in headings
        const headings = await element.$$('h1, h2, h3, h4, h5, h6, .name, .title');
        if (headings.length > 0) {
            const nameText = await safeTextContent(headings[0]);
            const parsed = parseFullName(nameText);
            firstName = parsed.firstName;
            lastName = parsed.lastName;
            salutation = detectSalutation(nameText) || '';
        }

        // Look for job title
        const titleElements = await element.$$('.position, .role, .job-title, .title, span, p');
        for (const titleEl of titleElements) {
            const titleText = await safeTextContent(titleEl);
            if (titleText.length > 0 && titleText.length < 100) {
                // Check if it looks like a job title
                const commonTitles = ['cto', 'cio', 'director', 'manager', 'leiter', 'head', 'vp'];
                if (commonTitles.some(t => titleText.toLowerCase().includes(t))) {
                    jobTitle = titleText;
                    break;
                }
            }
        }

        // If we still don't have a name, try to parse from text
        if (!firstName && !lastName) {
            // Simple heuristic: look for capitalized words before email
            const words = text.split(/\s+/);
            const capitalizedWords = words.filter(w => /^[A-ZÄÖÜ][a-zäöüß]+$/.test(w));

            if (capitalizedWords.length >= 2) {
                firstName = capitalizedWords[0];
                lastName = capitalizedWords[1];
            }
        }

        if (!firstName || !lastName || !validEmail) {
            return null;
        }

        return {
            company: companyName,
            location: '',
            salutation: salutation || 'Herr', // Default fallback
            firstName,
            lastName,
            email: validEmail,
            phone,
            jobTitle: jobTitle || 'Management',
            linkedInUrl: '',
            scrapedAt: createTimestamp()
        };

    } catch (error) {
        logger.debug('Error extracting contact from element', { error: error.message });
        return null;
    }
}

/**
 * Extracts contacts from structured data (JSON-LD, Schema.org)
 * @param {Object} page - Playwright page object
 * @param {string} companyName - Company name
 * @returns {Promise<Array<Object>>} - Array of contacts
 */
async function extractFromStructuredData(page, companyName) {
    const contacts = [];

    try {
        // Look for JSON-LD structured data
        const jsonLdElements = await page.$$('script[type="application/ld+json"]');

        for (const element of jsonLdElements) {
            const content = await safeTextContent(element);

            try {
                const data = JSON.parse(content);

                // Check for Person or Organization schema
                if (data['@type'] === 'Person') {
                    const contact = extractContactFromSchemaOrg(data, companyName);
                    if (contact) {
                        contacts.push(contact);
                    }
                } else if (data['@type'] === 'Organization' && data.employee) {
                    const employees = Array.isArray(data.employee) ? data.employee : [data.employee];

                    for (const emp of employees) {
                        const contact = extractContactFromSchemaOrg(emp, companyName);
                        if (contact) {
                            contacts.push(contact);
                        }
                    }
                }
            } catch (e) {
                // Invalid JSON, skip
                continue;
            }
        }
    } catch (error) {
        logger.debug('Error extracting structured data', { error: error.message });
    }

    return contacts;
}

/**
 * Converts Schema.org Person data to contact object
 * @param {Object} personData - Schema.org Person object
 * @param {string} companyName - Company name
 * @returns {Object|null} - Contact object or null
 */
function extractContactFromSchemaOrg(personData, companyName) {
    if (!personData || !personData.email) {
        return null;
    }

    const parsed = parseFullName(personData.name || '');

    return {
        company: companyName,
        location: personData.address?.addressLocality || '',
        salutation: detectSalutation(personData.name) || 'Herr',
        firstName: parsed.firstName || personData.givenName || '',
        lastName: parsed.lastName || personData.familyName || '',
        email: personData.email,
        phone: personData.telephone || '',
        jobTitle: personData.jobTitle || '',
        linkedInUrl: personData.sameAs?.find(url => url.includes('linkedin.com')) || '',
        scrapedAt: createTimestamp()
    };
}

/**
 * Extracts contacts from LinkedIn
 *
 * WARNING: This violates LinkedIn Terms of Service
 * Use LinkedIn official API or partner solutions instead
 * This is for educational/demonstration purposes only
 *
 * @param {Object} page - Playwright page object
 * @param {string} companyName - Company name
 * @param {Array<string>} targetRoles - Target job titles
 * @param {number} maxContacts - Maximum contacts to extract
 * @returns {Promise<Array<Object>>} - Array of contact objects
 */
export async function extractFromLinkedIn(page, companyName, targetRoles, maxContacts = 2) {
    logger.warning('LinkedIn scraping may violate Terms of Service. Use official API instead.');
    logger.info(`Attempting LinkedIn extraction for: ${companyName}`);

    const contacts = [];

    try {
        // Search for company on LinkedIn
        const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(companyName)}`;

        await page.goto(searchUrl, {
            waitUntil: 'networkidle',
            timeout: 15000
        });

        await sleep(2000);

        // LinkedIn typically requires authentication
        // Check if we're on login page
        const isLoginPage = await page.$('input[name="session_key"]');

        if (isLoginPage) {
            logger.warning('LinkedIn requires authentication. Skipping LinkedIn extraction.');
            return contacts;
        }

        // Extract profile cards
        const profileCards = await page.$$('.entity-result, .search-result__info');

        for (const card of profileCards) {
            if (contacts.length >= maxContacts) break;

            try {
                const nameElement = await card.$('.entity-result__title-text, .name');
                const titleElement = await card.$('.entity-result__primary-subtitle, .subline-level-1');
                const linkElement = await card.$('a.app-aware-link');

                if (!nameElement || !titleElement) continue;

                const name = await safeTextContent(nameElement);
                const title = await safeTextContent(titleElement);
                const profileUrl = await safeGetAttribute(linkElement, 'href');

                // Check if title matches target roles
                const priority = matchJobTitlePriority(title, targetRoles);
                if (priority === 0) continue;

                const parsed = parseFullName(name);

                // Note: LinkedIn public profiles usually don't show email
                // This would require additional steps or API access
                contacts.push({
                    company: companyName,
                    location: '',
                    salutation: detectSalutation(name) || 'Herr',
                    firstName: parsed.firstName,
                    lastName: parsed.lastName,
                    email: '', // Not available from public LinkedIn scraping
                    phone: '',
                    jobTitle: title,
                    linkedInUrl: profileUrl,
                    source: 'linkedin',
                    scrapedAt: createTimestamp(),
                    note: 'Email not available from public profile'
                });

            } catch (error) {
                logger.debug('Error extracting LinkedIn profile', { error: error.message });
                continue;
            }
        }

    } catch (error) {
        logger.warning(`Failed to extract from LinkedIn for ${companyName}`, {
            error: error.message
        });
    }

    logger.info(`Extracted ${contacts.length} contacts from LinkedIn`);
    return contacts;
}

/**
 * Extracts contacts from Xing (DACH region professional network)
 *
 * WARNING: This may violate Xing Terms of Service
 * Use Xing official API or partner solutions instead
 * This is for educational/demonstration purposes only
 *
 * @param {Object} page - Playwright page object
 * @param {string} companyName - Company name
 * @param {Array<string>} targetRoles - Target job titles
 * @param {number} maxContacts - Maximum contacts to extract
 * @returns {Promise<Array<Object>>} - Array of contact objects
 */
export async function extractFromXing(page, companyName, targetRoles, maxContacts = 2) {
    logger.warning('Xing scraping may violate Terms of Service. Use official API instead.');
    logger.info(`Attempting Xing extraction for: ${companyName}`);

    const contacts = [];

    try {
        // Search for company on Xing
        const searchUrl = `https://www.xing.com/search/members?keywords=${encodeURIComponent(companyName)}`;

        await page.goto(searchUrl, {
            waitUntil: 'networkidle',
            timeout: 15000
        });

        await sleep(2000);

        // Xing also typically requires authentication for detailed profiles
        const isLoginPage = await page.$('input[name="username"]');

        if (isLoginPage) {
            logger.warning('Xing requires authentication. Skipping Xing extraction.');
            return contacts;
        }

        // Similar extraction logic to LinkedIn
        // Implementation would be similar but adapted to Xing's HTML structure

        logger.info('Xing extraction requires authentication and is limited.');

    } catch (error) {
        logger.warning(`Failed to extract from Xing for ${companyName}`, {
            error: error.message
        });
    }

    logger.info(`Extracted ${contacts.length} contacts from Xing`);
    return contacts;
}

/**
 * Fallback: Extracts contacts from business registries and public databases
 * @param {Object} page - Playwright page object
 * @param {string} companyName - Company name
 * @param {string} country - Country
 * @returns {Promise<Array<Object>>} - Array of contact objects
 */
export async function extractFromBusinessRegistry(page, companyName, country = 'Deutschland') {
    logger.info(`Extracting from business registry for: ${companyName}`);
    const contacts = [];

    try {
        // For Germany: Try Handelsregister or Impressum pages
        // This is a simplified implementation

        if (country.toLowerCase().includes('deutsch')) {
            // Try to find impressum (legally required in Germany)
            const domain = guessDomainFromCompany(companyName);
            const impressumUrl = `https://www.${domain}/impressum`;

            try {
                const response = await page.goto(impressumUrl, {
                    waitUntil: 'networkidle',
                    timeout: 10000
                });

                if (response && response.status() < 400) {
                    await sleep(1000);

                    const pageText = await page.textContent('body');

                    // Extract emails and phones from impressum
                    const emails = extractEmailsFromText(pageText);
                    const phones = extractPhonesFromText(pageText);

                    // Look for Geschäftsführer/Managing Director
                    const lines = pageText.split('\n');

                    for (const line of lines) {
                        if (line.includes('Geschäftsführer') || line.includes('Managing Director') ||
                            line.includes('Vorstand')) {
                            // Try to extract name from this line or next few lines
                            const parsed = parseFullName(line);

                            if (parsed.firstName && parsed.lastName && emails.length > 0) {
                                contacts.push({
                                    company: companyName,
                                    location: '',
                                    salutation: detectSalutation(line) || 'Herr',
                                    firstName: parsed.firstName,
                                    lastName: parsed.lastName,
                                    email: emails.find(e => isValidEmail(e)) || '',
                                    phone: phones[0] || '',
                                    jobTitle: 'Geschäftsführer',
                                    linkedInUrl: '',
                                    source: 'business_registry',
                                    sourceUrl: impressumUrl,
                                    scrapedAt: createTimestamp()
                                });
                                break;
                            }
                        }
                    }
                }
            } catch (error) {
                logger.debug('Error accessing impressum', { error: error.message });
            }
        }

    } catch (error) {
        logger.warning(`Failed to extract from business registry for ${companyName}`, {
            error: error.message
        });
    }

    logger.info(`Extracted ${contacts.length} contacts from business registry`);
    return contacts;
}

/**
 * Master extraction function that tries all sources with fallbacks
 * @param {Object} page - Playwright page object
 * @param {string} companyName - Company name
 * @param {Object} options - Extraction options
 * @returns {Promise<Array<Object>>} - Array of contact objects
 */
export async function extractContactsWithFallback(page, companyName, options = {}) {
    const {
        targetRoles = ['CTO', 'CIO', 'Head of IT'],
        maxContacts = 2,
        sources = ['company_website', 'linkedin', 'xing', 'business_registry'],
        country = 'Deutschland'
    } = options;

    logger.info(`Starting extraction for ${companyName} with sources: ${sources.join(', ')}`);

    let allContacts = [];

    // Try each source in order
    for (const source of sources) {
        if (allContacts.length >= maxContacts) break;

        try {
            let sourceContacts = [];

            switch (source) {
                case 'company_website':
                    sourceContacts = await extractFromCompanyWebsite(page, companyName, targetRoles, maxContacts);
                    break;

                case 'linkedin':
                    sourceContacts = await extractFromLinkedIn(page, companyName, targetRoles, maxContacts);
                    break;

                case 'xing':
                    sourceContacts = await extractFromXing(page, companyName, targetRoles, maxContacts);
                    break;

                case 'business_registry':
                    sourceContacts = await extractFromBusinessRegistry(page, companyName, country);
                    break;

                default:
                    logger.warning(`Unknown source: ${source}`);
            }

            allContacts = allContacts.concat(sourceContacts);

            logger.info(`Source ${source}: extracted ${sourceContacts.length} contacts`);

        } catch (error) {
            logger.error(`Error with source ${source}`, error);
            // Continue with next source
            continue;
        }
    }

    // Sort by job title priority
    allContacts.sort((a, b) => {
        const priorityA = matchJobTitlePriority(a.jobTitle, targetRoles);
        const priorityB = matchJobTitlePriority(b.jobTitle, targetRoles);
        return priorityB - priorityA;
    });

    // Limit to maxContacts
    const finalContacts = allContacts.slice(0, maxContacts);

    logger.info(`Total extraction complete: ${finalContacts.length} contacts for ${companyName}`);

    return finalContacts;
}
