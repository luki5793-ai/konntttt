/**
 * IT Contact Extractor - Main Actor Logic
 *
 * Extracts contact information for IT leaders and hiring managers
 * from multiple sources using Crawlee and Playwright
 */

import { Actor } from 'apify';
import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';
import { validateContact, deduplicateContacts } from './validators.js';
import { extractContactsWithFallback } from './extractors.js';
import { logger, retryWithBackoff, normalizeCompanyName, RateLimiter } from './utils.js';

/**
 * Main Actor entry point
 */
await Actor.main(async () => {
    logger.info('IT Contact Extractor started');

    // Get input
    const input = await Actor.getInput();

    if (!input) {
        throw new Error('No input provided');
    }

    // Validate input
    const {
        companies = [],
        country = 'Deutschland',
        maxContactsPerCompany = 2,
        targetRoles = [
            'CTO',
            'CIO',
            'Head of IT',
            'IT-Leiter',
            'VP Engineering',
            'Engineering Manager',
            'HR Director',
            'Recruiting Manager',
            'Head of Talent Acquisition'
        ],
        sources = ['company_website', 'linkedin', 'xing', 'business_registry'],
        maxRequestRetries = 3,
        proxyConfiguration = { useApifyProxy: true }
    } = input;

    if (!companies || companies.length === 0) {
        throw new Error('No companies provided in input');
    }

    logger.info(`Processing ${companies.length} companies`, {
        country,
        maxContactsPerCompany,
        sources
    });

    // Setup proxy configuration
    const proxyConfig = await Actor.createProxyConfiguration(proxyConfiguration);

    // Initialize rate limiter (1 request per 2 seconds to be polite)
    const rateLimiter = new RateLimiter(0.5);

    // Statistics
    const stats = {
        companiesProcessed: 0,
        contactsExtracted: 0,
        contactsValidated: 0,
        contactsSaved: 0,
        errors: 0
    };

    // Prepare request queue with company URLs
    const requestQueue = await Actor.openRequestQueue();

    // Add companies to request queue
    for (const company of companies) {
        await requestQueue.addRequest({
            url: 'about:blank', // We'll use the page object directly
            uniqueKey: `company-${company}`,
            userData: {
                companyName: normalizeCompanyName(company),
                country,
                targetRoles,
                maxContacts: maxContactsPerCompany,
                sources
            }
        });
    }

    // Initialize Playwright crawler
    const crawler = new PlaywrightCrawler({
        requestQueue,
        proxyConfiguration: proxyConfig,
        maxRequestRetries,
        maxConcurrency: 1, // Process one company at a time to be polite
        navigationTimeoutSecs: 30,
        requestHandlerTimeoutSecs: 180, // 3 minutes per company

        // Browser launch options
        launchContext: {
            launchOptions: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            }
        },

        // Request handler
        async requestHandler({ page, request }) {
            const { companyName, country, targetRoles, maxContacts, sources } = request.userData;

            logger.info(`Processing company: ${companyName}`);

            try {
                // Rate limiting
                await rateLimiter.wait();

                // Extract contacts with retry logic
                const contacts = await retryWithBackoff(
                    async () => {
                        return await extractContactsWithFallback(page, companyName, {
                            targetRoles,
                            maxContacts,
                            sources,
                            country
                        });
                    },
                    maxRequestRetries,
                    2000,
                    `Extraction for ${companyName}`
                );

                logger.info(`Extracted ${contacts.length} raw contacts for ${companyName}`);
                stats.contactsExtracted += contacts.length;

                // Validate and filter contacts
                const validatedContacts = [];

                for (const contact of contacts) {
                    const validation = validateContact(contact);

                    if (validation.isValid) {
                        validatedContacts.push(validation.contact);
                        stats.contactsValidated++;
                    } else {
                        logger.warning(`Invalid contact data for ${companyName}`, {
                            errors: validation.errors,
                            contact: {
                                name: `${contact.firstName} ${contact.lastName}`,
                                email: contact.email
                            }
                        });
                    }
                }

                logger.info(`Validated ${validatedContacts.length} contacts for ${companyName}`);

                // Deduplicate
                const deduplicatedContacts = deduplicateContacts(validatedContacts);

                // Limit to maxContacts
                const finalContacts = deduplicatedContacts.slice(0, maxContacts);

                // Save to dataset
                if (finalContacts.length > 0) {
                    await Actor.pushData(finalContacts);
                    stats.contactsSaved += finalContacts.length;

                    logger.info(`Saved ${finalContacts.length} contacts for ${companyName}`, {
                        contacts: finalContacts.map(c => ({
                            name: `${c.firstName} ${c.lastName}`,
                            email: c.email,
                            jobTitle: c.jobTitle,
                            source: c.source
                        }))
                    });
                } else {
                    logger.warning(`No valid contacts found for ${companyName}`);
                }

                stats.companiesProcessed++;

            } catch (error) {
                logger.error(`Failed to process company: ${companyName}`, error);
                stats.errors++;

                // Save error information
                await Actor.pushData({
                    company: companyName,
                    error: error.message,
                    status: 'failed',
                    timestamp: new Date().toISOString()
                });
            }
        },

        // Error handler
        failedRequestHandler({ request, error }) {
            const { companyName } = request.userData;
            logger.error(`Request failed after retries for ${companyName}`, error);
            stats.errors++;
        }
    });

    // Run the crawler
    logger.info('Starting crawler...');
    await crawler.run();

    // Log final statistics
    logger.info('Extraction completed', {
        stats: {
            companiesProcessed: stats.companiesProcessed,
            totalCompanies: companies.length,
            contactsExtracted: stats.contactsExtracted,
            contactsValidated: stats.contactsValidated,
            contactsSaved: stats.contactsSaved,
            errors: stats.errors,
            successRate: `${((stats.companiesProcessed / companies.length) * 100).toFixed(2)}%`
        }
    });

    // Store statistics
    await Actor.setValue('STATS', stats);

    // Output summary
    const summary = {
        summary: {
            companiesProcessed: stats.companiesProcessed,
            totalCompanies: companies.length,
            contactsSaved: stats.contactsSaved,
            averageContactsPerCompany: (stats.contactsSaved / stats.companiesProcessed).toFixed(2),
            errors: stats.errors
        },
        timestamp: new Date().toISOString()
    };

    await Actor.pushData(summary);

    logger.info('IT Contact Extractor finished successfully');
});
