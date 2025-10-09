// CYFARE-Reconner/content.js

/**
 * ContentScanner Class
 *
 * Encapsulates all the logic for scanning a web page. This includes
 * finding links, scripts, secrets, and monitoring for dynamic content changes.
 * It's designed to be controlled by messages from the extension's popup.
 */
class ContentScanner {
  constructor() {
    // --- State ---
    this.isScanning = false;
    this.scanStartTime = null;
    this.pageHostname = window.location.hostname;

    // --- Performance & Deduplication ---
    // Keep track of elements and URLs we've already processed to avoid redundant work.
    this.processedElements = new WeakSet(); // Use WeakSet for elements to allow garbage collection
    this.foundItems = new Set(); // For URLs, parameters, etc. to prevent duplicates

    // --- Observers ---
    this.observer = null; // Will be a MutationObserver to watch for DOM changes

    // --- Configuration ---
    this.scanDepth = 5; // How many levels deep to scroll
    this.scrollDelay = 1500; // ms to wait after a scroll
    this.regex = {
      // General purpose URL finder (less strict to catch more)
      url: /(https?:\/\/[^\s"'`<>]+)/g,
      // Secrets and keys
      apiKey:
        /([a|A][p|P][i|I][_]?[k|K][e|E][y|Y]\s*['|"]?\s*[:|=]\s*['|"]?)([a-zA-Z0-9-_{}]{32,})/g,
      authToken:
        /(bearer|token|auth-token)\s*['|"]?\s*[:|=]\s*['|"]?([a-zA-Z0-9-_.]{32,})/gi,
      awsSecretAccessKey:
        /(?:(?:aws_)?secret(?:_access)?_key)\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})/i,
      awsSessionToken:
        /(?:(?:aws_)?session_token)\s*[:=]\s*['"]?([A-Za-z0-9/+=]{16,})/i,
      githubFineGrained: /github_pat_[0-9A-Za-z_]{22,255}/g,
      gitlabAccessToken: /glpat-[A-Za-z0-9_-]{20,}/g,
      npmAccessToken: /npm_[A-Za-z0-9]{36}/g,
      pypiToken: /pypi-[A-Za-z0-9_-]{80,}/g,
      discordBotToken: /[\w-]{24}\.[\w-]{6}\.[\w-]{27}/g,
      discordWebhook:
        /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g,
      slackWebhook:
        /(xox(?:p|b|a|o|s|r)-\d{12}-\d{12}-\d{12}-[A-Za-z0-9]{32})/g,
      telegramBotToken: /\d{8,10}:[A-Za-z0-9_-]{35}/g,
      stripePublishableKey: /pk_(live|test)_[0-9A-Za-z]{24}/g,
      mailgunApiKey: /key-[0-9A-Za-z]{32}/g,
      sendinblueKey: /xkeysib-[A-Za-z0-9]{64}-[A-Za-z0-9]{16}/g,
      gcpServiceAccount:
        /"type"\s*:\s*"service_account"[\s\S]*?"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----[\s\S]+?END PRIVATE KEY-----"/g,
      googleOauthAccessToken: /ya29\.[0-9A-Za-z\-_]+/g,
      googleOauthRefreshToken: /1\/\/[0-9A-Za-z\-_]+/g,
      azureStorageConnString:
        /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[^;]+;EndpointSuffix=core\.windows\.net/gi,
      azureSasToken:
        /https?:\/\/[^\s?]+?\?sv=\d{4}-\d{2}-\d{2}[^ \n]*?&sig=[^&\s]+/gi,
      azureEventHubConnString:
        /Endpoint=sb:\/\/[^;]+;SharedAccessKeyName=[^;]+;SharedAccessKey=[^;]+;?/gi,
      azureClientSecret:
        /(?:azure|aad|msal)?[_-]*client[_-]*secret\s*[:=]\s*['"]?[A-Za-z0-9._~\-]{16,}['"]?/i,
      shopifyToken: /(shpat|shpca|shppa|shpss)_[0-9A-Fa-f]{32}/g,
      cloudflareToken:
        /(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN|CLOUDFLARE_API_KEY)\s*[:=]\s*['"]?[A-Za-z0-9-_]{40,}['"]?/i,
      facebookAppSecret:
        /(?:facebook|fb)[-_ ]?(?:app)?[_-]?secret\s*[:=]\s*['"]?[0-9a-f]{32}['"]?/i,
      postgresUrl: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@[^\/\s]+\/[^\s'"]+/gi,
      mysqlUrl: /mysql:\/\/[^:\s]+:[^@\s]+@[^\/\s]+\/[^\s'"]+/gi,
      mongoUrl: /mongodb(?:\+srv)?:\/\/[^:\s]+:[^@\s]+@[^\/\s]+\/?[^\s'"]*/gi,
      redisUrl: /redis:\/\/(?::[^@\s]+@)?[^\/\s]+\/?\S*/gi,
      amqpUrl: /amqps?:\/\/[^:\s]+:[^@\s]+@[^\/\s]+\/[^\s'"]+/gi,
      openSshPrivateKey:
        /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
      genericPassword:
        /(?:password|passwd|pwd|passphrase|secret)\s*[:=]\s*['"][^'"\r\n]{6,}['"]/gi,
      basicAuthUrl: /https?:\/\/[^\/\s:@]+:[^@\/\s]+@[^\/\s]+/gi,
    };
  }

  /**
   * Sends a message back to the popup/background script.
   * @param {string} action - The type of message (e.g., 'linkFound').
   * @param {*} [data] - The payload for the message.
   */
  sendMessage(action, data = {}) {
    try {
      browser.runtime.sendMessage({ action, data });
    } catch (e) {
      console.error("CYFARE Reconner: Failed to send message:", e);
    }
  }

  /**
   * Starts the entire scanning process.
   */
  async start() {
    if (this.isScanning) {
      console.log("CYFARE Reconner: Scan already in progress.");
      return;
    }

    console.log("CYFARE Reconner: Starting scan...");
    this.isScanning = true;
    this.scanStartTime = Date.now();
    this.foundItems.clear(); // Clear previous finds if any

    this.sendMessage("scanProgress", {
      progress: 5,
      message: "Starting static DOM scan...",
    });
    this.scanNode(document.body);

    this.sendMessage("scanProgress", {
      progress: 15,
      message: "Analyzing inline scripts...",
    });
    this.analyzeInlineScripts();

    this.sendMessage("scanProgress", {
      progress: 25,
      message: "Analyzing linked scripts...",
    });
    await this.analyzeJsFiles();

    this.sendMessage("scanProgress", {
      progress: 50,
      message: "Starting dynamic content monitoring...",
    });
    this.monitorDynamicContent();

    this.sendMessage("scanProgress", {
      progress: 60,
      message: "Initiating scroll and event simulation...",
    });
    await this.scrollAndSimulateEvents();

    this.sendMessage("scanProgress", {
      progress: 90,
      message: "Performing final sweep...",
    });
    // Final sweep after dynamic actions
    this.scanNode(document.body);

    this.stop(); // Stop after a full run
    this.sendMessage("scanComplete");
    console.log(
      `CYFARE Reconner: Scan finished in ${(Date.now() - this.scanStartTime) / 1000}s.`,
    );
  }

  /**
   * Stops the scan and disconnects any observers.
   */
  stop() {
    if (!this.isScanning) return;

    console.log("CYFARE Reconner: Stopping scan.");
    this.isScanning = false;
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /**
   * The core scanning function. Recursively scans a DOM node for interesting information.
   * @param {Node} node - The DOM node to start scanning from.
   */
  scanNode(node) {
    if (!node || this.processedElements.has(node) || !this.isScanning) {
      return;
    }
    this.processedElements.add(node);

    // 1. Scan attributes for URLs
    if (node.attributes) {
      for (const attr of node.attributes) {
        this.extractAndClassifyLink(attr.value);
      }
    }

    // 2. Scan for specific elements like <a>, <script>, <img>
    const elements = node.querySelectorAll(
      "a, link, script, img, form, iframe",
    );
    elements.forEach((el) => {
      if (this.processedElements.has(el)) return;
      this.processedElements.add(el);

      const href = el.href || el.src || el.action;
      if (href && typeof href === "string") {
        this.extractAndClassifyLink(href);
      }
    });

    // 3. Scan text content and comments for URLs and secrets
    const walker = document.createTreeWalker(
      node,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT,
      null,
      false,
    );
    let currentNode;
    while ((currentNode = walker.nextNode())) {
      const text = currentNode.nodeValue.trim();
      if (text) {
        this.findUrlsInText(text);
        this.findSecretsInText(text);
      }
    }
  }

  /**
   * Normalizes, classifies, and reports a found URL.
   * @param {string} urlString - The raw URL string to process.
   */
  extractAndClassifyLink(urlString) {
    if (!urlString || typeof urlString !== "string" || urlString.length < 5)
      return;

    let url;
    try {
      url = new URL(urlString, window.location.origin).href;
    } catch (e) {
      return; // Invalid URL
    }

    if (this.foundItems.has(url)) return;
    this.foundItems.add(url);

    // Extract parameters
    try {
      const urlObject = new URL(url);
      urlObject.searchParams.forEach((value, key) => {
        if (!this.foundItems.has(key)) {
          this.foundItems.add(key);
          this.sendMessage("paramFound", key);
        }
      });
    } catch (e) {}

    // Classify and send
    const type = this.classifyUrl(url);
    this.sendMessage("linkFound", { url, type, source: "dom" });

    // Special handling for JS files
    if (type === "js" && !this.foundItems.has(`js:${url}`)) {
      this.foundItems.add(`js:${url}`);
      this.sendMessage("jsFileFound", url);
    }
  }

  /**
   * Classifies a URL based on its properties.
   * @param {string} url - The URL to classify.
   * @returns {string} - The classification type (e.g., 'internal', 'external', 'js').
   */
  classifyUrl(url) {
    try {
      const urlHost = new URL(url).hostname;
      if (urlHost === this.pageHostname) {
        if (url.endsWith(".js")) return "js";
        if (url.match(/\/(api|v[1-9])\//)) return "api";
        return "internal";
      } else {
        if (
          ["linkedin.com", "twitter.com", "facebook.com", "github.com"].some(
            (domain) => urlHost.includes(domain),
          )
        )
          return "social";
        return "external";
      }
    } catch (e) {
      return "other";
    }
  }

  /**
   * Finds URLs within a block of text using regex.
   * @param {string} text - The text to search.
   */
  findUrlsInText(text) {
    const matches = text.match(this.regex.url);
    if (matches) {
      matches.forEach((url) => this.extractAndClassifyLink(url));
    }
  }

  /**
   * Finds potential secrets in a block of text using regex.
   * @param {string} text - The text to search.
   */
  findSecretsInText(text) {
    for (const type in this.regex) {
      if (type === "url") continue;
      const matches = text.match(this.regex[type]);
      if (matches) {
        matches.forEach((match) => {
          const secretKey = `${type}:${match}`;
          if (!this.foundItems.has(secretKey)) {
            this.foundItems.add(secretKey);
            this.sendMessage("secretFound", { type, value: match });
          }
        });
      }
    }
  }

  /**
   * Scans all inline <script> tags.
   */
  analyzeInlineScripts() {
    document.querySelectorAll("script:not([src])").forEach((script) => {
      this.findUrlsInText(script.innerHTML);
      this.findSecretsInText(script.innerHTML);
    });
  }

  /**
   * Fetches and analyzes externally linked JavaScript files.
   */
  async analyzeJsFiles() {
    const scripts = Array.from(document.querySelectorAll("script[src]")).map(
      (s) => s.src,
    );
    for (const scriptUrl of scripts) {
      if (!this.isScanning) break;
      try {
        const response = await fetch(scriptUrl);
        const code = await response.text();
        this.findUrlsInText(code);
        this.findSecretsInText(code);
      } catch (e) {
        console.warn(`CYFARE Reconner: Could not fetch script ${scriptUrl}`, e);
      }
    }
  }

  /**
   * Sets up a MutationObserver to scan content added dynamically to the DOM.
   */
  monitorDynamicContent() {
    if (this.observer) this.observer.disconnect();

    this.observer = new MutationObserver((mutations) => {
      if (!this.isScanning) return;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          this.scanNode(node);
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Simulates user interaction by scrolling and triggering events.
   */
  async scrollAndSimulateEvents() {
    for (let i = 0; i < this.scanDepth; i++) {
      if (!this.isScanning) break;

      // Scroll
      window.scrollTo(
        0,
        document.body.scrollHeight * ((i + 1) / this.scanDepth),
      );
      await new Promise((resolve) => setTimeout(resolve, this.scrollDelay));

      // Simulate mouse hover on elements that might reveal content
      document
        .querySelectorAll(":hover, [data-lazy], [onmouseover]")
        .forEach((el) => {
          el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        });
    }
    // Scroll back to top
    window.scrollTo(0, 0);
  }
}

// --- Global Scope ---

let scanner = null;

/**
 * Global message listener to control the scanner instance.
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "startScan":
      if (!scanner) {
        scanner = new ContentScanner();
      }
      scanner.start();
      break;
    case "stopScan":
      if (scanner) {
        scanner.stop();
      }
      break;
  }
});
