// CYFARE-Reconner/scan-results.js

/**
 * A centralized class to manage and structure the results of a page scan.
 * This class handles the collection, deduplication, and organization of
 * all data discovered by the content script.
 */
class ScanResults {
    constructor(url) {
        this.reset(url);
    }

    /**
     * Resets the state to start a new scan.
     * @param {string} url - The URL of the page being scanned.
     */
    reset(url) {
        this.metadata = {
            url: url || "N/A",
            scanDate: new Date().toISOString(),
            version: "3.0", // Corresponds to the extension version
        };

        // Use Sets for automatic deduplication and performance
        this.links = new Set();
        this.jsFiles = new Set();
        this.endpoints = new Set();
        this.parameters = new Set();
        this.secrets = new Set();
        this.domains = new Set();

        // For more detailed objects where uniqueness is complex
        this.classifiedLinks = {
            internal: new Set(),
            external: new Set(),
            social: new Set(),
            api: new Set(),
            other: new Set(),
        };
    }

    /**
     * Adds a found link and classifies it.
     * @param {object} linkInfo - An object containing link details.
     *                              { url: string, type: string, source: string }
     */
    addLink(linkInfo) {
        if (!linkInfo || !linkInfo.url) return;

        // Add to main link set
        this.links.add(linkInfo.url);

        // Add to classified set
        const type = linkInfo.type || "other";
        if (this.classifiedLinks[type]) {
            this.classifiedLinks[type].add(linkInfo.url);
        }

        // Extract and add domain
        try {
            const domain = new URL(linkInfo.url).hostname;
            this.domains.add(domain);
        } catch (e) {
            // Ignore invalid URLs
        }
    }

    /**
     * Adds a JavaScript file URL.
     * @param {string} url - The URL of the JS file.
     */
    addJsFile(url) {
        if (url) this.jsFiles.add(url);
    }

    /**
     * Adds a potential API endpoint.
     * @param {string} endpoint - The endpoint URL or path.
     */
    addEndpoint(endpoint) {
        if (endpoint) this.endpoints.add(endpoint);
    }

    /**
     * Adds a discovered URL parameter.
     * @param {string} param - The parameter name.
     */
    addParameter(param) {
        if (param) this.parameters.add(param);
    }

    /**
     * Adds a potential secret or sensitive key.
     * @param {object} secretInfo - An object with secret details.
     *                                { value: string, type: string }
     */
    addSecret(secretInfo) {
        if (secretInfo && secretInfo.value) {
            // Store as a stringified object to maintain details while leveraging Set for uniqueness
            this.secrets.add(JSON.stringify(secretInfo));
        }
    }

    /**
     * Generates a summary of the scan statistics.
     * @returns {object} - An object containing key metrics.
     */
    getStats() {
        return {
            totalLinks: this.links.size,
            jsFiles: this.jsFiles.size,
            endpoints: this.endpoints.size,
            parameters: this.parameters.size,
            secrets: this.secrets.size,
            uniqueDomains: this.domains.size,
        };
    }

    /**
     * Prepares the complete scan results for download or storage.
     * @returns {object} - A structured object with all metadata, stats, and data.
     */
    generateReport() {
        // Convert sets to arrays for JSON serialization
        const data = {
            links: Array.from(this.links).sort(),
            javascriptFiles: Array.from(this.jsFiles).sort(),
            apiEndpoints: Array.from(this.endpoints).sort(),
            parameters: Array.from(this.parameters).sort(),
            potentialSecrets: Array.from(this.secrets)
                .map(s => JSON.parse(s)) // Parse back to objects
                .sort((a, b) => a.type.localeCompare(b.type)),
            domains: Array.from(this.domains).sort(),
            classifiedLinks: {
                internal: Array.from(this.classifiedLinks.internal).sort(),
                external: Array.from(this.classifiedLinks.external).sort(),
                social: Array.from(this.classifiedLinks.social).sort(),
                api: Array.from(this.classifiedLinks.api).sort(),
                other: Array.from(this.classifiedLinks.other).sort(),
            },
        };

        return {
            metadata: this.metadata,
            statistics: this.getStats(),
            data: data,
        };
    }
}
