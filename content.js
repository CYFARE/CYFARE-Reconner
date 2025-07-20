// Content Script - Runs on web pages
let scanData = {
  links: new Set(),
  jsFiles: new Set(),
  endpoints: new Set(),
  parameters: new Set(),
  secrets: [],
  processedElements: new WeakSet(),
};

// Listen for scan commands
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startScan") {
    startComprehensiveScan(message.url);
  }
});

// Start Comprehensive Scan
async function startComprehensiveScan(currentUrl) {
  const baseUrl = new URL(currentUrl).origin;

  sendProgress(10, "Starting comprehensive scan...");

  // Phase 1: Initial DOM scan
  sendProgress(20, "Scanning static DOM elements...");
  scanStaticDOM(baseUrl);

  // Phase 2: Scroll and dynamic content
  sendProgress(30, "Triggering dynamic content...");
  await scrollAndScan(baseUrl);

  // Phase 3: Event simulation
  sendProgress(50, "Simulating user interactions...");
  await simulateEvents(baseUrl);

  // Phase 4: Monitor mutations
  sendProgress(60, "Monitoring DOM mutations...");
  monitorDynamicContent(baseUrl);

  // Phase 5: Analyze JavaScript files
  sendProgress(70, "Analyzing JavaScript files...");
  await analyzeJavaScriptFiles();

  // Phase 6: Deep parameter analysis
  sendProgress(85, "Performing deep parameter analysis...");
  analyzeParameters();

  // Phase 7: Final sweep
  sendProgress(95, "Final sweep...");
  await finalSweep(baseUrl);

  sendProgress(100, "Scan complete!");
  browser.runtime.sendMessage({ action: "scanComplete" });
}

// Scan Static DOM
function scanStaticDOM(baseUrl) {
  // Find all links
  const links = document.querySelectorAll("a[href], area[href]");
  links.forEach((link) => {
    const url = normalizeUrl(link.href, baseUrl);
    if (url && !scanData.links.has(url)) {
      scanData.links.add(url);
      classifyAndSendLink(url);
    }
  });

  // Find forms
  const forms = document.querySelectorAll("form[action]");
  forms.forEach((form) => {
    const url = normalizeUrl(form.action, baseUrl);
    if (url && !scanData.links.has(url)) {
      scanData.links.add(url);
      classifyAndSendLink(url);
    }
  });

  // Find scripts
  const scripts = document.querySelectorAll("script[src]");
  scripts.forEach((script) => {
    const url = normalizeUrl(script.src, baseUrl);
    if (url && !scanData.jsFiles.has(url)) {
      scanData.jsFiles.add(url);
      browser.runtime.sendMessage({
        action: "jsFileFound",
        file: { url, type: "external" },
      });
    }
  });

  // Find data attributes
  const dataElements = document.querySelectorAll(
    "[data-href], [data-url], [data-link]",
  );
  dataElements.forEach((elem) => {
    ["data-href", "data-url", "data-link"].forEach((attr) => {
      const url = elem.getAttribute(attr);
      if (url) {
        const normalized = normalizeUrl(url, baseUrl);
        if (normalized && !scanData.links.has(normalized)) {
          scanData.links.add(normalized);
          classifyAndSendLink(normalized);
        }
      }
    });
  });
}

// Scroll and Scan
async function scrollAndScan(baseUrl) {
  const totalHeight = document.documentElement.scrollHeight;
  const viewportHeight = window.innerHeight;
  let currentPosition = 0;

  while (currentPosition < totalHeight) {
    window.scrollTo(0, currentPosition);
    await wait(200); // Wait for lazy-loaded content

    // Scan newly visible elements
    scanNewElements(baseUrl);

    currentPosition += viewportHeight / 2;
  }

  window.scrollTo(0, 0); // Reset scroll
}

// Simulate Events
async function simulateEvents(baseUrl) {
  // Click on expandable elements
  const clickables = document.querySelectorAll(
    'button:not([type="submit"]), ' +
      "[onclick], [data-toggle], [data-target], " +
      ".dropdown-toggle, .accordion-header, " +
      '[role="button"], [tabindex="0"]',
  );

  for (const elem of clickables) {
    if (!scanData.processedElements.has(elem)) {
      scanData.processedElements.add(elem);

      try {
        // Simulate hover
        elem.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        await wait(100);

        // Simulate click
        elem.click();
        await wait(200);

        // Scan for new content
        scanNewElements(baseUrl);
      } catch (e) {
        // Ignore errors from clicking
      }
    }
  }
}

// Monitor Dynamic Content
function monitorDynamicContent(baseUrl) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          // Element node
          scanElement(node, baseUrl);
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "src", "action"],
  });

  // Stop observing after 5 seconds
  setTimeout(() => observer.disconnect(), 5000);
}

// Scan New Elements
function scanNewElements(baseUrl) {
  const allElements = document.querySelectorAll("*");

  allElements.forEach((elem) => {
    if (!scanData.processedElements.has(elem)) {
      scanData.processedElements.add(elem);
      scanElement(elem, baseUrl);
    }
  });
}

// Scan Individual Element
function scanElement(elem, baseUrl) {
  // Check for links in various attributes
  const linkAttrs = [
    "href",
    "src",
    "action",
    "data-href",
    "data-url",
    "data-src",
  ];

  linkAttrs.forEach((attr) => {
    const value = elem.getAttribute(attr);
    if (value) {
      const url = normalizeUrl(value, baseUrl);
      if (url && !scanData.links.has(url)) {
        scanData.links.add(url);
        classifyAndSendLink(url);
      }
    }
  });

  // Check for URLs in text content
  const text = elem.textContent || "";
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;
  const matches = text.match(urlRegex);

  if (matches) {
    matches.forEach((url) => {
      if (!scanData.links.has(url)) {
        scanData.links.add(url);
        classifyAndSendLink(url);
      }
    });
  }

  // Check inline scripts
  if (elem.tagName === "SCRIPT" && !elem.src) {
    analyzeInlineScript(elem.textContent);
  }
}

// Analyze JavaScript Files
async function analyzeJavaScriptFiles() {
  for (const jsUrl of scanData.jsFiles) {
    try {
      const response = await fetch(jsUrl);
      const code = await response.text();
      analyzeJavaScriptCode(code, jsUrl);
    } catch (e) {
      browser.runtime.sendMessage({
        action: "error",
        message: `Failed to fetch JS file: ${jsUrl}`,
      });
    }
  }
}

// Analyze JavaScript Code
function analyzeJavaScriptCode(code, sourceUrl) {
  // Find API endpoints
  const endpointRegex =
    /['"`](\/api\/[^'"`\s]+|https?:\/\/[^'"`\s]+\/api\/[^'"`\s]+)['"`]/gi;
  const endpoints = code.match(endpointRegex) || [];

  endpoints.forEach((endpoint) => {
    const clean = endpoint.slice(1, -1); // Remove quotes
    if (!scanData.endpoints.has(clean)) {
      scanData.endpoints.add(clean);
      browser.runtime.sendMessage({
        action: "endpointFound",
        endpoint: { url: clean, source: sourceUrl },
      });
    }
  });

  // Find potential secrets
  const secretPatterns = [
    { regex: /['"`]([A-Za-z0-9]{32,})['"`]/g, type: "API Key" },
    { regex: /['"`](AIza[0-9A-Za-z\-_]{35})['"`]/g, type: "Google API Key" },
    { regex: /['"`](sk_[a-zA-Z0-9]{32,})['"`]/g, type: "Stripe Key" },
    { regex: /['"`](pk_[a-zA-Z0-9]{32,})['"`]/g, type: "Public Key" },
    { regex: /['"`]([a-f0-9]{40})['"`]/g, type: "SHA1 Hash" },
    {
      regex: /['"`](ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*)['"`]/g,
      type: "JWT Token",
    },
  ];

  secretPatterns.forEach((pattern) => {
    const matches = code.match(pattern.regex) || [];
    matches.forEach((match) => {
      const secret = match.slice(1, -1);
      scanData.secrets.push({
        type: pattern.type,
        value: secret,
        source: sourceUrl,
      });
      browser.runtime.sendMessage({
        action: "secretFound",
        secret: { type: pattern.type, source: sourceUrl },
      });
    });
  });

  // Find more URLs
  const urlRegex = /['"`](https?:\/\/[^'"`\s]+)['"`]/gi;
  const urls = code.match(urlRegex) || [];

  urls.forEach((url) => {
    const clean = url.slice(1, -1);
    if (!scanData.links.has(clean)) {
      scanData.links.add(clean);
      classifyAndSendLink(clean);
    }
  });
}

// Analyze Inline Script
function analyzeInlineScript(code) {
  analyzeJavaScriptCode(code, "inline-script");
}

// Analyze Parameters
function analyzeParameters() {
  scanData.links.forEach((url) => {
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);

      for (const [key, value] of params) {
        const paramData = {
          url: url,
          param: key,
          value: value,
          type: classifyParameter(key, value),
        };

        if (!scanData.parameters.has(key)) {
          scanData.parameters.add(key);
          browser.runtime.sendMessage({
            action: "parameterFound",
            parameter: paramData,
          });
        }
      }
    } catch (e) {
      // Invalid URL
    }
  });
}

// Classify Parameter
function classifyParameter(key, value) {
  const lowerKey = key.toLowerCase();

  if (lowerKey.includes("id") || lowerKey.includes("uid")) return "identifier";
  if (lowerKey.includes("token") || lowerKey.includes("auth"))
    return "authentication";
  if (lowerKey.includes("page") || lowerKey.includes("offset"))
    return "pagination";
  if (lowerKey.includes("search") || lowerKey.includes("query"))
    return "search";
  if (lowerKey.includes("sort") || lowerKey.includes("order")) return "sorting";
  if (lowerKey.includes("filter")) return "filter";

  return "general";
}

// Final Sweep
async function finalSweep(baseUrl) {
  // Check for hidden elements
  const hiddenElements = document.querySelectorAll(
    '[style*="display:none"], [style*="visibility:hidden"], .hidden, .d-none',
  );

  hiddenElements.forEach((elem) => {
    // Make temporarily visible
    const originalDisplay = elem.style.display;
    const originalVisibility = elem.style.visibility;

    elem.style.display = "block";
    elem.style.visibility = "visible";

    scanElement(elem, baseUrl);

    // Restore original state
    elem.style.display = originalDisplay;
    elem.style.visibility = originalVisibility;
  });

  // Check comments for URLs
  scanComments(document.body);
}

// Scan Comments
function scanComments(node) {
  if (node.nodeType === 8) {
    // Comment node
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = node.textContent.match(urlRegex) || [];

    matches.forEach((url) => {
      if (!scanData.links.has(url)) {
        scanData.links.add(url);
        classifyAndSendLink(url);
      }
    });
  }

  node.childNodes.forEach((child) => scanComments(child));
}

// Normalize URL
function normalizeUrl(url, baseUrl) {
  if (
    !url ||
    url.startsWith("#") ||
    url.startsWith("javascript:") ||
    url.startsWith("mailto:")
  ) {
    return null;
  }

  try {
    if (url.startsWith("//")) {
      return new URL(window.location.protocol + url).href;
    }
    if (url.startsWith("/")) {
      return new URL(url, baseUrl).href;
    }
    if (!url.startsWith("http")) {
      return new URL(url, window.location.href).href;
    }
    return new URL(url).href;
  } catch (e) {
    return null;
  }
}

// Classify and Send Link
function classifyAndSendLink(url) {
  const linkData = {
    url: url,
    type: classifyLink(url),
    domain: new URL(url).hostname,
  };

  browser.runtime.sendMessage({
    action: "linkFound",
    link: linkData,
  });
}

// Classify Link Type
function classifyLink(url) {
  const lower = url.toLowerCase();

  if (lower.endsWith(".js")) return "javascript";
  if (lower.endsWith(".css")) return "stylesheet";
  if (lower.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)$/)) return "image";
  if (lower.match(/\.(woff|woff2|ttf|otf|eot)$/)) return "font";
  if (lower.match(/\.(pdf|doc|docx|xls|xlsx|zip|rar)$/)) return "document";
  if (lower.includes("/api/")) return "api";
  if (lower.includes("?") || lower.includes("&")) return "parametrized";

  return "general";
}

// Send Progress Update
function sendProgress(percent, message) {
  browser.runtime.sendMessage({
    action: "scanProgress",
    progress: percent,
    message: message,
  });
}

// Utility wait function
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
